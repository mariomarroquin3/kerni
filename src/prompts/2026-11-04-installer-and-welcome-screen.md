# First installer with the backend bundled, and a welcome screen to choose the AI

## Request

Create a first version of the .exe and add a welcome screen where the person chooses whether to enter API keys and which AI to use. Decisions given by the user: bundle the backend as Node + code (more robust, not a single executable), keep the key in the app data folder (APPDATA) rather than the Windows credential store so it works on every system, and leave Supabase out of this version.

## Decisions

- Backend v2 = `node.exe` + backend code with production dependencies, prepared by `src/desktop/scripts/preparar-backend.mjs` (node.exe downloaded from nodejs.org and checked against the published SHA-256) and shipped as Tauri resources. `src-tauri/src/backend.rs` starts it hidden, logs to `backend.log`, restarts it up to 5 times and stops it on exit; it does nothing in development or when port 8788 already answers.
- Keys live in `ajustes.json` in the data folder (user-only permissions, not encrypted — documented honestly). They are never returned by the API, logged, or kept in the browser.
- The AI can be swapped at runtime (`llm/dinamico.js` + `routes/ajustes.js`): `POST /ajustes/probar` makes a real one-token call before anything is saved; `PUT /ajustes` saves and switches immediately; sessions from the previous provider are not reused because the history format differs.
- `.env` wins when it sets `LLM_PROVIDER`, so developer flows and `Kerni-freellm.sh` are unchanged.
- Welcome screen (`web/bienvenida.js` pure logic, `bienvenida-ui.js` DOM), reachable later from the context menu and the tray ("Cambiar IA o llave…").
- Bugs found on the way and fixed: the empty-settings object was shared between reads (keys leaked across calls); Gemini answers 400, not 401, for an unknown key, so it is now treated as an invalid key; error messages no longer point only at `.env`.
- The CI workflow runs the new prepare step before `tauri build`.

## Verification

- `npm --prefix src/backend test` — 576 passed (15 new in `test/ajustes.test.js`, 1 in `chatCompletions.test.js`).
- `npm --prefix src/desktop test` — 235 passed (welcome logic, wiring, installer resources, SHA-256 line parser).
- Browser run (Playwright + Vite + the real backend): the screen opens by itself on first launch, rejects a short key locally, shows Google's real "invalid key" answer for a fake key, and "Seguir sin IA" persists in `ajustes.json` (mode 600).
- The bundled backend (`--node-local`) starts from `resources/` in a clean folder and answers `/health`; the Rust `backend.rs` unit tests and a real spawn test passed in an isolated crate with a `tauri` stub.
- Not verified: `cargo test` of the full Tauri crate and the installer itself (this environment is Linux without the GTK libraries, and the .exe must be built on Windows). To do by hand: run the `build-windows` workflow, install on a PC without Node, check the welcome screen, a real key, and that closing Kerni also stops `node.exe`.
