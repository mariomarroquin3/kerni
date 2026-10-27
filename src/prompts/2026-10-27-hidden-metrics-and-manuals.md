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

