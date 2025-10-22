# Throw Shoes at Boss — Frontend Scaffold

This repository now contains a Vite + React + TypeScript + Tailwind CSS setup inside `throw-shoes/`, aligned with the PRD requirements for the **Throw Shoes at Boss** event experience.

## Local development

```bash
# Add the bundled Node.js binary to your PATH for this shell session
export PATH="$(pwd)/node-v22.12.0-linux-x64/bin:$PATH"

cd throw-shoes
npm install        # already run, but safe to repeat
npm run dev        # launches Vite on http://localhost:5173
```

To produce a production build, run `npm run build` (already verified).

Tailwind CSS is configured and ready to support the responsive, canvas-driven UI described in the PRD. The current React app renders a neutral placeholder screen so you can start wiring up the boss selection flow immediately.
