#!/usr/bin/env python3
"""Lightweight face cropper tailored for static boss portraits."""

from __future__ import annotations

import argparse
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Tuple

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from PIL import Image


@dataclass
class CropBox:
    top: int
    bottom: int
    left: int
    right: int

    @property
    def height(self) -> int:
        return self.bottom - self.top

    @property
    def width(self) -> int:
        return self.right - self.left

    def clamp(self, h: int, w: int) -> "CropBox":
        return CropBox(
            top=max(self.top, 0),
            bottom=min(self.bottom, h),
            left=max(self.left, 0),
            right=min(self.right, w),
        )


SKIN_CB_RANGE = (77, 127)
SKIN_CR_RANGE = (133, 173)


def main() -> None:
    args = parse_args()
    inputs = collect_inputs(args.input_path)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    for idx, src in enumerate(inputs, start=1):
        stem = src.stem
        out_path = args.output_dir / f"{stem}.png"
        if out_path.exists() and not args.overwrite:
            if args.verbose:
                print(f"[skip] {src.name} → already exists")
            continue

        if args.verbose:
            print(f"[{idx}/{len(inputs)}] Cropping {src.name} …")

        image = Image.open(src).convert("RGB")
        rgba = crop_to_face(image, args.feather_ratio, args.debug_masks)
        rgba.save(out_path)

        if args.verbose:
            print(f"    saved {out_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Crop portrait photos down to face-only, transparent PNGs."
    )
    parser.add_argument(
        "input_path",
        type=Path,
        help="Path to a portrait image or a folder of images.",
    )
    parser.add_argument(
        "output_dir",
        type=Path,
        help="Destination folder for cropped PNGs.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Recreate PNGs even when they already exist.",
    )
    parser.add_argument(
        "--feather-ratio",
        type=float,
        default=0.92,
        help="Inner radius (0-1) for full opacity before feathering to transparent.",
    )
    parser.add_argument(
        "--debug-masks",
        action="store_true",
        help="Emit intermediate mask previews beside the final crop.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Log progress as files are processed.",
    )
    return parser.parse_args()


def collect_inputs(path: Path) -> Iterable[Path]:
    if path.is_file():
        return [path]
    image_exts = {".jpg", ".jpeg", ".png", ".webp"}
    return sorted(
        p for p in path.iterdir() if p.suffix.lower() in image_exts and p.is_file()
    )


def crop_to_face(image: Image.Image, feather_ratio: float, debug_masks: bool) -> Image.Image:
    rgb = np.array(image)
    mask = skin_mask(rgb)
    mask = refine_mask(mask)
    component_mask = largest_component_mask(mask)

    if component_mask is None:
        return fallback_crop(image, feather_ratio)

    bounds = compute_crop_box(component_mask, image.size)
    crop = rgb[bounds.top : bounds.bottom, bounds.left : bounds.right]
    alpha = feathered_alpha(crop.shape[:2], feather_ratio)

    rgba = np.dstack([crop, alpha])
    result = Image.fromarray(rgba, mode="RGBA")

    if debug_masks:
        export_debug_layers(component_mask, bounds, image, result)

    return result


def skin_mask(rgb: np.ndarray) -> np.ndarray:
    """Approximate skin-tone mask using YCbCr color space thresholds."""
    ycbcr = Image.fromarray(rgb, mode="RGB").convert("YCbCr")
    arr = np.array(ycbcr)
    y, cb, cr = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    cb_min, cb_max = SKIN_CB_RANGE
    cr_min, cr_max = SKIN_CR_RANGE

    mask = (
        (cb >= cb_min)
        & (cb <= cb_max)
        & (cr >= cr_min)
        & (cr <= cr_max)
        & (y > 60)
    )

    # Guard against overly saturated or desaturated regions.
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    rg_diff = np.abs(r - g)
    mask &= (r > 70) & (g > 40) & (b > 20) & (rg_diff > 5)

    return mask


def refine_mask(mask: np.ndarray) -> np.ndarray:
    """Clean up noise through a sequence of morphology passes."""
    clean = binary_open(mask, kernel=5)
    clean = binary_close(clean, kernel=9)
    clean = binary_dilate(clean, kernel=7, iterations=2)
    return clean


def binary_open(mask: np.ndarray, kernel: int) -> np.ndarray:
    return binary_dilate(binary_erode(mask, kernel), kernel)


def binary_close(mask: np.ndarray, kernel: int) -> np.ndarray:
    return binary_erode(binary_dilate(mask, kernel), kernel)


def binary_dilate(mask: np.ndarray, kernel: int, iterations: int = 1) -> np.ndarray:
    return _binary_morph(mask, kernel, iterations, mode="dilate")


def binary_erode(mask: np.ndarray, kernel: int, iterations: int = 1) -> np.ndarray:
    return _binary_morph(mask, kernel, iterations, mode="erode")


def _binary_morph(
    mask: np.ndarray, kernel: int, iterations: int, mode: str
) -> np.ndarray:
    if kernel % 2 == 0:
        raise ValueError("Kernel size must be odd.")

    working = mask.astype(np.uint8)
    pad = kernel // 2
    for _ in range(iterations):
        padded = np.pad(working, pad_width=pad, mode="constant", constant_values=0)
        windows = sliding_window_view(padded, (kernel, kernel))
        if mode == "dilate":
            working = (windows.max(axis=(-2, -1)) > 0).astype(np.uint8)
        elif mode == "erode":
            working = (windows.min(axis=(-2, -1)) > 0).astype(np.uint8)
        else:
            raise ValueError(f"Unsupported morph mode {mode}")
    return working.astype(bool)


def largest_component_mask(mask: np.ndarray) -> np.ndarray | None:
    h, w = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    best_coords: list[Tuple[int, int]] = []
    mask = mask.astype(bool)

    for y in range(h):
        row = mask[y]
        candidates = np.where(row & ~visited[y])[0]
        for x in candidates:
            coords = flood_fill(mask, visited, y, x)
            if len(coords) > len(best_coords):
                best_coords = coords

    if not best_coords:
        return None

    component = np.zeros_like(mask, dtype=bool)
    ys, xs = zip(*best_coords)
    component[ys, xs] = True
    return component


def flood_fill(
    mask: np.ndarray, visited: np.ndarray, start_y: int, start_x: int
) -> list[Tuple[int, int]]:
    h, w = mask.shape
    queue: deque[Tuple[int, int]] = deque([(start_y, start_x)])
    visited[start_y, start_x] = True
    coords: list[Tuple[int, int]] = []

    while queue:
        y, x = queue.popleft()
        coords.append((y, x))
        for ny in range(y - 1, y + 2):
            if ny < 0 or ny >= h:
                continue
            for nx in range(x - 1, x + 2):
                if nx < 0 or nx >= w:
                    continue
                if visited[ny, nx] or not mask[ny, nx]:
                    continue
                visited[ny, nx] = True
                queue.append((ny, nx))
    return coords


def compute_crop_box(component_mask: np.ndarray, size: Tuple[int, int]) -> CropBox:
    h_total, w_total = size[1], size[0]
    ys, xs = np.where(component_mask)
    top, bottom = ys.min(), ys.max()
    left, right = xs.min(), xs.max()

    face_h = bottom - top + 1
    face_w = right - left + 1

    expand_y_top = int(face_h * 0.55)
    expand_y_bottom = int(face_h * 0.25)
    expand_x = int(face_w * 0.45)

    top = max(top - expand_y_top, 0)
    bottom = min(bottom + expand_y_bottom, h_total - 1)
    left = max(left - expand_x, 0)
    right = min(right + expand_x, w_total - 1)

    crop = CropBox(top=top, bottom=bottom + 1, left=left, right=right + 1)

    crop = make_square(crop, h_total, w_total)
    return crop.clamp(h_total, w_total)


def make_square(box: CropBox, total_h: int, total_w: int) -> CropBox:
    height = box.height
    width = box.width
    side = max(height, width)

    center_y = box.top + height // 2
    center_x = box.left + width // 2

    half = side // 2
    top = center_y - half
    bottom = top + side
    left = center_x - half
    right = left + side

    # Adjust if we fell outside the frame.
    if top < 0:
        bottom -= top
        top = 0
    if left < 0:
        right -= left
        left = 0
    if bottom > total_h:
        top -= bottom - total_h
        bottom = total_h
    if right > total_w:
        left -= right - total_w
        right = total_w

    # Ensure we still clamp correctly.
    top = max(top, 0)
    left = max(left, 0)
    bottom = min(bottom, total_h)
    right = min(right, total_w)

    return CropBox(top=top, bottom=bottom, left=left, right=right)


def feathered_alpha(shape: Tuple[int, int], inner_ratio: float) -> np.ndarray:
    h, w = shape
    cy = (h - 1) / 2.0
    cx = (w - 1) / 2.0
    y = (np.arange(h) - cy) / (h / 2.0)
    x = (np.arange(w) - cx) / (w / 2.0)
    yy, xx = np.meshgrid(y, x, indexing="ij")
    r = np.sqrt(xx**2 + yy**2)

    outer = 1.0
    inner = np.clip(inner_ratio, 0.0, 0.98)
    alpha = np.zeros_like(r, dtype=float)
    alpha[r <= inner] = 1.0
    transition = (r > inner) & (r < outer)
    alpha[transition] = (outer - r[transition]) / (outer - inner)
    alpha = np.clip(alpha, 0.0, 1.0)
    return (alpha * 255).astype(np.uint8)


def fallback_crop(image: Image.Image, feather_ratio: float) -> Image.Image:
    w, h = image.size
    side = min(w, h)
    left = (w - side) // 2
    top = max((h - side) // 2 - side // 6, 0)
    crop = image.crop((left, top, left + side, top + side))
    alpha = feathered_alpha(crop.size[::-1], feather_ratio)
    rgba = np.dstack([np.array(crop), alpha])
    return Image.fromarray(rgba, mode="RGBA")


def export_debug_layers(
    mask: np.ndarray, bounds: CropBox, original: Image.Image, cropped: Image.Image
) -> None:
    debug_dir = Path("face_cropper_debug")
    debug_dir.mkdir(exist_ok=True)

    mask_img = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    mask_img.save(debug_dir / "mask.png")

    overlay = original.copy()
    overlay.putalpha(120)
    for x in range(bounds.left, bounds.right):
        overlay.putpixel((x, bounds.top), (255, 0, 0, 255))
        overlay.putpixel((x, bounds.bottom - 1), (255, 0, 0, 255))
    for y in range(bounds.top, bounds.bottom):
        overlay.putpixel((bounds.left, y), (255, 0, 0, 255))
        overlay.putpixel((bounds.right - 1, y), (255, 0, 0, 255))
    overlay.save(debug_dir / "bounds.png")
    cropped.save(debug_dir / "cropped.png")


if __name__ == "__main__":
    main()
