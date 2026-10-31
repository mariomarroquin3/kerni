# Memory controls, Windows UI checks, and chat status

## Request

Implement the three agreed project improvements: let the person inspect and control local memory, add reproducible visual checks for the fixed Windows window, and make chat waiting/result/error states clearer and accessible.

## Decisions

- Add a memory panel to the integrated context menu. It lists approved facts and learned reflections, supports individual deletion, and controls automatic reflection learning.
- Keep "delete everything" explicit: the confirmation names facts, reflections, conversation history, and health history.
- Reuse the existing local memory API and add `PUT` to the backend CORS allow-list so the learning setting can be saved from Tauri.
- Extend the real-window CDP smoke test for the 320×620 layout and context-menu bounds; document how to run it on Windows.
- Add polite live announcements for the bubble/chat status without changing chat behavior or the glass appearance.

## Verification

- Desktop: `npm test` — 105 passed.
- Desktop: `npm run web:build` — passed; Vite reports the existing large-chunk advisory.
- Backend: `npm test` — 280 passed; the focused CORS test also passed (6 tests).
- `node --check scripts/probar-tauri.mjs` and `git diff --check` — passed.
- Previewed the memory panel with sample rows in a 320×620 browser viewport. The real Tauri/WebView2 smoke test still needs to be run on Windows.