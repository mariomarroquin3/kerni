# Hidden metrics and the first official manuals

## Request
1. Hide the CPU/RAM/disk bar 100%, and show it from a two-finger click on the touchpad.
2. Download manuals (Dell Latitude 3120, Windows, Word, PowerPoint) and index them.
3. Can Kerni use tools to change the system?

## Decisions
- The whole HUD section (bars and buttons) is `hidden` by default and is not remembered between sessions. A two-finger tap is a right click, which already opened the native menu, so the menu gained *Ver/Ocultar métricas* and *Limpiar temporales…*. Rust only emits events (`alternar-metricas`, `pedir-limpiar`) and the interface reacts. Cleaning from the menu still goes through the confirmation card (rule 1). The tray icon menu has the same entries. In the browser demo a right click toggles the bar and `?metricas` shows it.
- Manuals: Dell only publishes the Latitude 3120 setup and specifications guide (2.4 MB, 26 pages) and the service manual (26.4 MB, 92 pages), both in English, as PDFs behind `dl.dell.com/content/manual...` links found on the support pages. They were downloaded into a new git-ignored folder (`conocimiento/privado/dell-latitude-3120/`) and are only parsed as text. Guessed `topicspdf` URLs returned 404; the real links came from the manual pages.
- Microsoft does not publish Windows 11 or current Office manuals as PDFs; they are web articles. Ingesting them needs HTML support and a curated list of articles, left as the next step.
- Docker Desktop hung during indexing (processes alive, daemon silent) and was restarted with `docker desktop restart`. The data volume was not touched.

## Verification
- Front tests 45/45. The old hide-button test was replaced by one that checks the hidden section, the menu items, the events and that nothing is persisted. `probar-tauri.mjs` was updated to check the new behavior against the real window; it was not run because the user's own Kerni window is open.
- `cargo check` passes. The two-finger menu itself was not exercised by hand.

## Follow-up: indexing the Latitude 3120 manuals
- After a reboot Docker Desktop did not start on its own; it was opened and the three containers came back by themselves with the volume intact (41 passages still there).
- The first indexing run stopped with a 429: the Gemini free tier allows **100 embedding requests per minute** and every passage in a batch counts as one, so a 175-passage manual exceeds it. The embeddings client now accepts `esperarCupo`: on a 429 it waits what the server asks (`Retry-After` or "retry in Ns", capped at 90 s) and continues, and the indexer prints each wait. The chat path is unchanged (one attempt, no waiting). Two new tests cover it.
- Result: 254 passages (41 base + 175 service manual + 38 setup and specifications), all from the real PDFs.
- Search check with Spanish questions against the English manuals: RAM question 0.795 (setup guide, page 16), battery 0.762, ports 0.790, "blinking light" lands on the diagnostic-lights pages of the service manual (0.733).
- End to end with the real model: asked whether RAM can be added to a Latitude 3120, it called `buscar_conocimiento` and answered correctly that the memory is soldered, in 2.2 s. A test backend on port 8799 was used and stopped.


## Follow-up: one-click launcher and compiled build
Request: be able to try it now, with a single click, and compile once so it does not rebuild every time.
- The release app was built once with `tauri build --no-bundle` (no installer, so no WiX or NSIS download): 6 min 45 s, a 10 MB `kerni.exe` in `%LOCALAPPDATA%\kerni\target\release`, the same target folder the dev mode already used (outside OneDrive).
- `Kerni.bat` now runs the compiled app by default. It rebuilds only when the app code is newer than the exe (PowerShell compares timestamps), e.g. after a `git pull`. Modes: `dev` (tauri dev), `build` (force a rebuild), `check` (no side effects).
- It also brings up the knowledge base: if `supabase\local\.env` exists it starts Docker Desktop when needed, waits for the daemon with a 15 s guard per probe (Docker hung earlier, so a plain `docker info` could block the launcher forever), runs `docker compose up -d`, and if anything fails it continues without the manuals. Then the backend (only if a model key exists), then the app; on exit it stops the backend it started.
- The file is ASCII with CRLF line endings, as cmd needs for labels and goto.
- Note: the release app runs from another origin than `tauri dev`, so its `localStorage` (and therefore its `device_id`) is different: memories saved from the dev build do not show up in the release build.

Verification: `Kerni.bat check` reports the compiled app; a real run started Docker's stack, the backend (`memoria: true`, `conocimiento: true`) and `kerni.exe`. The two-finger menu still has to be tried by hand.

## Follow-up: speech bubble duration
Request: Kerni's answers should stay on screen a few seconds longer; they were hard to read.
- The bubble closed after a fixed time (20 s for chat answers), so a long answer could vanish before it was read. `decir(texto, ms)` now treats `ms` as a minimum and keeps the bubble as long as it takes to read: 6 s plus 100 ms per character (about 10 characters per second), capped at 90 s (`duracionGlobo` in `estado.js`, pure and tested). Defaults were raised too: 15 s in general, 25 s for model answers and 20 s for local ones.
- While the pointer is over the bubble it does not close, and after leaving it stays 6 more seconds; a click closes it right away.
- Tests: front 50 (one new unit test for the duration and one wiring test). Needs a rebuild of the app (`Kerni.bat` does it by itself).
