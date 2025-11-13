# Throw Shoes at Boss – Asset Workflow

## Boss API & Live Editing

The boss roster now lives behind a lightweight HTTP API so new caricatures can be added without touching the bundle. To run the API locally:

```bash
npm run dev:server
```

This spins up `server/index.js` on <http://localhost:4000>. Vite (via `npm run dev`) proxies all `/api/*` calls to that port, so keep the API running alongside the React dev server.

When you add a boss from the UI:

1. Upload a mugshot and a headless caricature body (PNG with transparency).
2. The backend stores the originals under `public/uploads/<bossId>/`, invokes `utils/cropfaceutil.py` to crop the face and detect the neck anchor, and computes stage placement metadata.
3. The newly minted boss is appended to `server/data/bosses.json`, which becomes the authoritative source for future sessions.

To seed the roster from scratch, the API copies `server/data/seed-bosses.json` into `server/data/bosses.json` on boot. Metrics such as `metrics.totalHits` are persisted for future leaderboard work.

## Python environment

Image tooling in `scripts/` and `utils/` depends on NumPy, Pillow, OpenCV, and MediaPipe. Keep those third‑party libraries out of git by installing them into a local virtual environment inside `throw-shoes/.venv/` (now ignored):

```bash
cd throw-shoes
python3 -m venv .venv          # create once
source .venv/bin/activate      # macOS/Linux; use .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

Each new shell session requires reactivating the environment before running `python scripts/face_cropper.py` or `python utils/cropfaceutil.py`. Upgrade dependencies with `pip install -r requirements.txt --upgrade` when needed, and run `deactivate` to exit the virtual environment.

## Face Cropping Tool

All playable boss portraits live under `src/assets`. To convert raw photos into the circular, transparent PNGs used by the game, run the helper script:

```bash
python3 scripts/face_cropper.py src/assets/Original src/assets/Cropped
```

The script searches the input folder for JPEG/PNG/WEBP files, detects the facial region, and exports square PNGs with a feathered alpha channel—matching the examples already in `src/assets/Cropped`. Use `--overwrite` when you want to regenerate existing crops and `--verbose` for progress logs. The output never mutates the source files; it only writes new PNGs (e.g. `SaurabhVerma.png`) to the destination directory.

To process individual files, point the first argument directly at the image:

```bash
python3 scripts/face_cropper.py src/assets/Test/SaurabhVerma.jpeg src/assets/Cropped
```

Optional flags:

- `--feather-ratio <0‑1>` tunes how much of the face remains fully opaque before the edge fade.
- `--debug-masks` drops intermediate masks in `face_cropper_debug/` for tuning thresholds.

## React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

### Production builds & Cloud Run

- `VITE_API_BASE_URL` controls where the SPA sends API calls. The dev server proxies `/api` to `localhost:4000`, but production builds should set `VITE_API_BASE_URL` to your deployed API URL (for example `VITE_API_BASE_URL=https://throw-shoes-api-xxxx.a.run.app/api npm run build`).
- `Dockerfile.backend`, `Dockerfile.frontend`, `.dockerignore`, and `DEPLOYMENT.md` describe the exact Cloud Run workflow for running the Node API + Python tooling alongside the static frontend.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
