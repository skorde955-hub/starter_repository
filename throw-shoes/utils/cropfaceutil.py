import argparse
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image
from typing import List, Tuple

try:
  import mediapipe as mp  # type: ignore
except ImportError:  # pragma: no cover - fallback when mediapipe unavailable
  mp = None

mp_face_mesh = mp.solutions.face_mesh if mp is not None else None

# ========= STANDARDIZED ASPECT RATIO (edit these if you want a different ratio) =========
# Target aspect ratio w:h (kept as constants so function signatures don't change)
TARGET_ASPECT_W = 1
TARGET_ASPECT_H = 1
# ========================================================================================

FACE_OVAL = [
    10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,
    378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,
    162,21,54,103,67,109,10
]

def polygon_from_landmarks(landmarks: List[Tuple[float,float]], img_w: int, img_h: int) -> np.ndarray:
    return np.array([(int(x*img_w), int(y*img_h)) for (x,y) in landmarks], dtype=np.int32)

# ---------- SMART EXPANSION (asymmetric) ----------
def expand_mask_smart(mask: np.ndarray, chin_y: int, factor_side: float = 1.16,
                      factor_top: float = 1.22, factor_bottom: float = 1.02,
                      extra_dilate: int = 2) -> np.ndarray:
    """
    Expands the mask more toward the top/sides (hair) but barely downward (to avoid neck).
    factor_top/side/bottom are multiplicative scales applied by quadrant.
    """
    h, w = mask.shape[:2]
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return mask

    # centroid of existing oval
    cx, cy = np.mean(xs), np.mean(ys)

    # vectorize coordinates
    coords = np.column_stack((xs, ys)).astype(np.float32)

    # Decide per-point scale: above/below chin and left/right of center
    scale = np.full(len(coords), factor_side, dtype=np.float32)
    scale[coords[:,1] < cy] = factor_top                   # upper half: allow more growth (hair)
    scale[coords[:,1] > chin_y] = factor_bottom            # below chin: almost no growth

    # anisotropic scaling
    sx = scale
    sy = np.where(coords[:,1] < cy, scale * 1.05,
                  np.minimum(scale, factor_bottom))

    # transform around centroid
    x_new = (coords[:,0] - cx) * sx + cx
    y_new = (coords[:,1] - cy) * sy + cy

    # clip
    x_new = np.clip(x_new, 0, w-1).astype(int)
    y_new = np.clip(y_new, 0, h-1).astype(int)

    out = np.zeros_like(mask, dtype=np.uint8)
    out[y_new, x_new] = 255

    if extra_dilate > 0:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3,3))
        out = cv2.dilate(out, k, iterations=extra_dilate)
    return out

# ---------- GRABCUT WITH CHIN “BG BARRIER” ----------
def grabcut_refine_with_chin(img_bgr: np.ndarray, init_mask: np.ndarray, chin_y: int) -> np.ndarray:
    """
    Refine with GrabCut, but force everything clearly below the chin line to background.
    This keeps neck/shirt from being pulled into the mask.
    """
    h, w = init_mask.shape[:2]
    gc_mask = np.where(init_mask > 0, cv2.GC_PR_FGD, cv2.GC_BGD).astype('uint8')

    # Background strip below chin
    tol = int(0.015 * h)  # ~1.5% image height
    below = np.zeros_like(gc_mask, dtype=np.uint8)
    y_cut = min(chin_y + tol, h-1)
    below[y_cut:h, :] = 1
    gc_mask[below == 1] = cv2.GC_BGD

    bgdModel = np.zeros((1, 65), np.float64)
    fgdModel = np.zeros((1, 65), np.float64)
    rect = (1, 1, w-2, h-2)
    cv2.grabCut(img_bgr, gc_mask, rect, bgdModel, fgdModel, 3, cv2.GC_INIT_WITH_MASK)

    result = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0).astype('uint8')
    result[y_cut:h, :] = 0
    return result

def feather_alpha(alpha: np.ndarray, radius: int) -> np.ndarray:
    return alpha if radius <= 0 else cv2.GaussianBlur(alpha, (0,0), radius)

def crop_to_content(img_rgba: np.ndarray, margin: int = 16) -> np.ndarray:
    alpha = img_rgba[:, :, 3]
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        return img_rgba
    x0, x1 = max(xs.min()-margin, 0), min(xs.max()+margin, img_rgba.shape[1]-1)
    y0, y1 = max(ys.min()-margin, 0), min(ys.max()+margin, img_rgba.shape[0]-1)
    return img_rgba[y0:y1+1, x0:x1+1]

# ---------- PAD TO TARGET ASPECT (no parameter changes) ----------
def pad_to_aspect(img_rgba: np.ndarray, target_w: int, target_h: int, anchor: str = "center") -> np.ndarray:
    """
    Pads the RGBA image with transparency to reach the target aspect ratio (w:h).
    No resizing is performed.
    """
    h, w = img_rgba.shape[:2]
    r_target = target_w / float(target_h)
    r_curr = w / float(h)

    if abs(r_curr - r_target) < 1e-6:
        return img_rgba  # already at ratio

    if r_curr > r_target:
        # too wide -> add vertical padding
        new_h = int(np.ceil(w / r_target))
        new_w = w
    else:
        # too tall -> add horizontal padding
        new_w = int(np.ceil(h * r_target))
        new_h = h

    canvas = np.zeros((new_h, new_w, 4), dtype=np.uint8)  # transparent

    # placement (center by default)
    if anchor == "center":
        y0 = (new_h - h) // 2
        x0 = (new_w - w) // 2
    elif anchor == "top":
        y0, x0 = 0, (new_w - w) // 2
    elif anchor == "bottom":
        y0, x0 = new_h - h, (new_w - w) // 2
    else:
        y0 = (new_h - h) // 2
        x0 = (new_w - w) // 2

    canvas[y0:y0+h, x0:x0+w] = img_rgba
    return canvas


def cutout_with_haar(bgr: np.ndarray, rgb: np.ndarray, feather_radius: int, margin: int):
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))

    h, w = gray.shape[:2]

    if len(faces) == 0:
        # fallback to center region
        face_w = int(w * 0.36)
        face_h = int(h * 0.36)
        x = (w - face_w) // 2
        y = (h - face_h) // 2
        faces = [(x, y, face_w, face_h)]

    outputs = []
    for (x, y, fw, fh) in faces:
        mask = np.zeros((h, w), dtype=np.uint8)
        center = (int(x + fw / 2), int(y + fh * 0.55))
        axes = (int(fw * 0.6), int(fh * 0.85))
        cv2.ellipse(mask, center, axes, 0, 0, 360, 255, -1)

        refined = grabcut_refine_with_chin(bgr, mask, chin_y=int(y + fh * 0.9))
        alpha = feather_alpha(refined, radius=feather_radius or 2)
        rgba = np.dstack([rgb, alpha])
        cropped = crop_to_content(rgba, margin=margin or 12)
        standardized = pad_to_aspect(cropped, TARGET_ASPECT_W, TARGET_ASPECT_H, anchor="center")
        outputs.append(standardized)

    return outputs

def cutout(image_path: str, out_path: str, tightness_side: float, tightness_top: float,
           tightness_bottom: float, feather_radius: int, margin: int):
    bgr = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if bgr is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")
    h, w = bgr.shape[:2]
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    outputs = []

    if mp_face_mesh is not None:
        with mp_face_mesh.FaceMesh(static_image_mode=True, max_num_faces=10,
                                   refine_landmarks=True, min_detection_confidence=0.5) as fm:
            res = fm.process(rgb)

        if res.multi_face_landmarks:
            for fl in res.multi_face_landmarks:
                lm = fl.landmark
                oval_norm = [(lm[i].x, lm[i].y) for i in FACE_OVAL]
                poly = polygon_from_landmarks(oval_norm, w, h)

                chin_y = int(lm[152].y * h)

                base = np.zeros((h, w), dtype=np.uint8)
                cv2.fillPoly(base, [poly], 255)

                init = expand_mask_smart(base,
                                         chin_y=chin_y,
                                         factor_side=tightness_side,
                                         factor_top=tightness_top,
                                         factor_bottom=tightness_bottom,
                                         extra_dilate=2)

                refined = grabcut_refine_with_chin(bgr, init, chin_y=chin_y)
                alpha = feather_alpha(refined, radius=feather_radius)

                rgba = np.dstack([rgb, alpha])
                cropped = crop_to_content(rgba, margin=margin)
                standardized = pad_to_aspect(cropped, TARGET_ASPECT_W, TARGET_ASPECT_H, anchor="center")
                outputs.append(standardized)

    if not outputs:
        outputs = cutout_with_haar(
            bgr,
            rgb,
            feather_radius=feather_radius,
            margin=margin,
        )

    root, ext = os.path.splitext(out_path)
    if len(outputs) == 1:
        Image.fromarray(outputs[0]).save(out_path)
        print(f"Saved: {out_path}")
    else:
        for i, arr in enumerate(outputs):
            p = f"{root}_{i}{ext or '.png'}"
            Image.fromarray(arr).save(p)
            print(f"Saved: {p}")

# ---------- Example notebook-friendly main ----------
def main():
    input_image_paths = ["Varun.jpeg", "Rahul_Sanghvi.jpeg", "Pallavi_Malani.jpeg","SaurabhVerma.jpeg"]

    for input_image_path in input_image_paths:
        if not os.path.exists(input_image_path):
            print(f"Error: Input image not found at {input_image_path}")
            continue

        output_image_path = f"cutout_{os.path.splitext(input_image_path)[0]}.png"

        try:
            cutout(
                input_image_path, output_image_path,
                tightness_side=1.5, tightness_top=1.9, tightness_bottom=1.5,
                feather_radius=0, margin=0
            )
        except RuntimeError as e:
            print(f"Error processing {input_image_path}: {e}")

def analyse_body_image(body_path: str):
    img = Image.open(body_path).convert("RGBA")
    alpha = np.array(img.split()[-1])
    h, w = alpha.shape

    threshold = max(1, int(w * 0.08))
    neck_row = None
    neck_left = None
    neck_right = None

    for y in range(h):
        xs = np.where(alpha[y] > 0)[0]
        if xs.size > threshold:
            neck_row = int(y)
            neck_left = int(xs[0])
            neck_right = int(xs[-1])
            break

    if neck_row is None:
        neck_row = int(h * 0.2)
        neck_left = int(w * 0.35)
        neck_right = int(w * 0.65)

    neck_center = (neck_left + neck_right) / 2.0

    return {
        "neck_row": neck_row,
        "neck_row_ratio": neck_row / float(h),
        "neck_left_ratio": neck_left / float(w),
        "neck_right_ratio": neck_right / float(w),
        "neck_center_ratio": neck_center / float(w),
        "neck_width_ratio": (neck_right - neck_left + 1) / float(w),
        "body_width": w,
        "body_height": h,
    }


def main_cli():
    parser = argparse.ArgumentParser(description="Crop boss face and analyse caricature body.")
    parser.add_argument("--mugshot", required=True, help="Path to mugshot image.")
    parser.add_argument("--output-face", required=True, help="Where the cropped face should be saved.")
    parser.add_argument("--body", required=True, help="Path to the processed body PNG (head removed).")
    parser.add_argument("--metadata-out", required=True, help="Where to store JSON metadata for placement.")
    parser.add_argument("--tightness-side", type=float, default=1.5)
    parser.add_argument("--tightness-top", type=float, default=1.9)
    parser.add_argument("--tightness-bottom", type=float, default=1.5)
    parser.add_argument("--feather-radius", type=int, default=0)
    parser.add_argument("--margin", type=int, default=0)

    args = parser.parse_args()

    try:
        cutout(
            args.mugshot,
            args.output_face,
            tightness_side=args.tightness_side,
            tightness_top=args.tightness_top,
            tightness_bottom=args.tightness_bottom,
            feather_radius=args.feather_radius,
            margin=args.margin,
        )
    except RuntimeError as exc:
        print(json.dumps({"status": "error", "message": str(exc)}))
        sys.exit(1)

    # Ensure output face exists; if multiple were written with suffix, pick first.
    face_path = args.output_face
    if not os.path.exists(face_path):
        root, ext = os.path.splitext(args.output_face)
        candidate = f"{root}_0{ext or '.png'}"
        if os.path.exists(candidate):
            face_path = candidate
        else:
            print(json.dumps({"status": "error", "message": "Unable to locate cropped face output."}))
            sys.exit(1)

    metadata = analyse_body_image(args.body)
    with open(args.metadata_out, "w", encoding="utf-8") as fh:
        json.dump(metadata, fh)

    print(json.dumps({"status": "ok", "face": face_path, "metadata": metadata}))


if __name__ == "__main__":
    if len(sys.argv) > 1:
        main_cli()
    else:
        main()
