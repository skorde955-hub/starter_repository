# Product Requirements Document (PRD) — Throw Shoes at Boss

## 1. Overview

**Throw Shoes at Boss** is a one-time, humorous, interactive web page/game built for a single-event or short-run social activity where players open a page and immediately start throwing items (shoes, bottles, laptops, stones) at animated boss avatars. No accounts, no scoring system, no persistence — just instant fun. The app must be lightweight, mobile-friendly, and deployable on free hosting (GitHub Pages / Vercel / Cloudflare Pages).

---

## 2. Objectives

* Enable immediate, low-friction play: open page → pick a boss → start throwing.
* Keep everything client-side; no logins, no leaderboards, no data storage.
* Make it visually appealing, responsive, and fast-loading for casual sharing during a company event.
* Ensure a playful, parody tone and include easy ways to stop or hide any avatar.

---

## 3. Core Features (Updated: No scoring, no login)

### 3.1 Entrance / Boss Selection

* **Launch flow**: Landing page shows a grid of boss avatars (circular thumbnails). Tapping an avatar loads the stage immediately.
* **Data ingestion**: Accept a pre-supplied JSON/CSV with `{name, role, imageURL}`. All ingest happens before deployment — no dynamic scraping or runtime fetching from third-party sites.
* **Parody option**: Toggle to replace real photos with cartoonized placeholders.
* **Quick play CTA**: Prominent "Smash Now" button on selection that immediately starts the game without any sign-up.

### 3.2 Armory (Throwables)

* Throwables include shoes, bottles, stones, ThinkPad laptop, rubber chicken, paper planes, etc.
* Each item has friendly, purely cosmetic differences (trajectory/arc/visual weight). No balancing or scoring required.
* Armory UI: A simple bottom bar/radial picker to change items between throws.

### 3.3 Aiming & Throwing

* **Controls**:

  * *Mobile*: Drag-and-release (slingshot) or tap-and-drag to aim; release to throw.
  * *Desktop*: Click-hold-drag to aim and release to throw; optional keyboard shortcuts to swap items.
* **Trajectory preview**: Optional dotted arc for better aim.
* **Assist**: Mild aim assist option for casual users (on/off toggle).

### 3.4 Boss Behavior & Reactions

* **Movement**: Boss avatars have simple motion patterns (idle, slow bob, horizontal patrol).
* **Hit reactions**: On hit, bosses show exaggerated cartoon reactions: "Ouch!", cry droplets, band-aids, temporary stun animation, comedic speech bubble.
* **Safe mode**: A switch to reduce violent or suggestive reactions — turns animation into funny sneeze or surprised face.
* **Hide/Skip**: Ability to hide or skip any avatar immediately with a single tap.

### 3.5 Session & End-of-Play

* **Session nature**: Single-session, immediate play—no timers, no scoring. Players can throw indefinitely until they close the page.
* **Capture moment**: Optional feature to capture a short GIF or snapshot of the funniest reaction (client-side Canvas/WebM rendering). This is local-only and offered as a download; no upload to servers unless explicitly enabled by the organizer.
* **Share**: Provide a preformatted text snippet and image that users can copy to Slack/WhatsApp. No tracking.

---

## 4. Audio & Visual Design

* **Graphics**: SVG and Canvas-based visuals with lightweight sprite assets. Cartoonish, non-realistic style encouraged.
* **Audio**: Use WebAudio API (oscillators + envelopes) for short "ouch", "thud", "whoosh" sounds; small toggle to mute.
* **Accessibility**: Reduced motion toggle, captions for sound effects, color-safe palettes.

---

## 5. Technical Requirements (No backend)

### 5.1 Frontend Stack

* **Framework**: React (recommended) or Vanilla TypeScript.
* **Rendering**: HTML5 Canvas for the stage; SVG for UI and icons.
* **Animation**: `requestAnimationFrame` loop; lightweight particle pool for tears/impact.
* **Styling**: TailwindCSS or minimal CSS utility classes.
* **Build Tool**: Vite for fast builds and small bundles.

### 5.2 Hosting & Assets

* **Hosting**: GitHub Pages, Cloudflare Pages, or Vercel (static site). All content is static — no server required.
* **Assets**: Pre-upload boss images and projectile SVGs to the repository or a public CDN. Use WebP/AVIF for photos, and inline SVGs for projectiles.
* **Optional**: If you want to enable downloadable GIFs or temporary sharing, use a tiny serverless function (e.g., Vercel serverless or Cloudflare Worker) — but by default keep everything client-only.

### 5.3 Privacy & Data

* No authentication, no user accounts.
* No analytics by default. If included, use an opt-in tiny analytics script or none at all.
* Any capture/download features happen client-side; do not upload images or media unless the organizer explicitly enables a server endpoint and obtains consent from participants.

---

## 6. Performance & Size Targets

* **Bundle size**: Aim for <200 KB gzipped.
* **Time-to-Interactive**: <2s on mid-range 4G mobile.
* **Frame rate**: 60fps target during normal play, degrade gracefully on low-end devices (particle caps, simplified animations).

---

## 7. Safety & Ethics (Updated)

* **Parody-focused**: Default to caricature avatars or require organizer consent for real photos.
* **Opt-out controls**: Any participant can hide their own avatar; include an explicit "Report" or "Hide" button for organizers.
* **Tone**: Include a clear landing page disclaimer: "For entertainment purposes only — be kind." Provide a quick toggle to switch to "Wholesome mode" where reactions are playful (confetti) instead of pained.

---

## 8. Implementation Roadmap (One-time event focus)

| Phase   | Timeline | Deliverables                                                                          |
| ------- | -------- | ------------------------------------------------------------------------------------- |
| Phase 1 | Day 1    | Minimal playable stage: pick boss → aim → throw → basic hit reaction                  |
| Phase 2 | Day 2    | Armory UI, multiple projectiles, movement patterns, mute toggle                       |
| Phase 3 | Day 3    | Polishing: animations, reduced-motion accessibility, parody filter                    |
| Phase 4 | Day 4    | GIF/snapshot capture (client-side), share card, final testing & deploy to static host |

*Total target: 3–4 days for a polished one-off experience.*

---

## 9. Deliverables

* Single static site repository with build script.
* `bosses.json` sample file with images bundled.
* Deployable to GitHub Pages / Vercel with a one-click deploy.
* Optional instructions for organizer to replace boss images and toggle parody mode.

---

## 10. Appendix: Minimal `bosses.json` Schema

```json
[
  { "id": "priya", "name": "Priya S.", "role": "MDP, Strategy", "image": "/img/priya.webp" },
  { "id": "arjun", "name": "Arjun M.", "role": "Partner", "image": "/img/arjun.webp" }
]
```

---

**End of Updated PRD — One-time Event Mode**
