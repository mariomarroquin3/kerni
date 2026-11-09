# Audit of model calls and freellm launcher

## Request

Review the repo for bugs, check whether the model is called on every interaction, and adapt the launcher script to use the freellm gateway.

## Decisions

- Chat already routes short deterministic requests locally (front `responderLocal`) and guide commands in the backend, so those do not call the model.
- Found a hidden extra model call: after every chat message the reflection engine makes a second `provider.step`. Added `KERNI_REFLEXION=0` (read by `chatRoutes`, injectable as `reflexion`) to turn it off; default stays on. The launcher sets it to 0 unless overridden.
- With no provider the local fallback used the `sin_cupo` text; added a `sin_llave` reason so it no longer claims the quota ran out.
- `npm run dev` crashed on Node 22 when `.env` did not exist (`--watch` on a missing file); `predev` now creates an empty, git-ignored `.env`.
- Removed a duplicated `ver_programas_sin_uso` key in the front exceptions and a stray JSDoc block in `routes/chat.js`.
- `Kerni-freellm.sh`: paths relative to the repo, variable checks, `npm start`, wait for `/health` and verify the provider, clear other API keys, kill the backend process group on exit.

## Verification

- `npm --prefix src/backend test` — 560 tests passed (3 new: reflection on/off, `sin_llave` fallback text).
- `npm --prefix src/desktop test` — 227 passed.
- Launcher run against a fake local gateway: gateway detected, backend `/health` reported `proveedor: openrouter`.
- Not tested: a real freellm key, the Tauri app on Windows.
