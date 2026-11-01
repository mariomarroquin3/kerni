# Bug fixes, safe improvements and six read-only tools

## Request

Work through a checked list in the Kerni repo, one small local commit per item, without pushing:

- **Part A (bugs):** Settings shortcuts ("abre el almacenamiento"), device questions ("¿hay alguien conectado a mi red?"), trash verbs ("vacié el reciclaje"), "por qué" questions about heavy files, support-report explanations, the English timeout text, the pid-reuse gap in `terminar_proceso`, and subnet broadcast entries in the device list.
- **Part B (improvements):** AGENTS.md table row for `ver_dispositivos_red`, `.env.example` variables, a check of the Anthropic timeouts, the `engines` field, and a fast CI workflow.
- **Part C (new read-only tools):** `ver_arranque`, `ver_salud_disco`, `ver_puntos_restauracion`, `ver_duplicados_posibles`, `ver_programas_sin_uso` and `ver_consumo_bateria`. Each one goes through the proposal path, is validated in the backend and in Rust, and has a card and tests in every layer.
- Part D: a short list of suggestions that were not implemented.

## Decisions

- **One topic per commit.** A1 and A2 were first edited together; they were split by reverting and reapplying the edits so each commit holds one fix. The split was done by hand, so the history is clean but the working tree was briefly restored from git.
- **A1:** a short form (`abre|abrime|llevame` + `almacenamiento|actualizaciones|windows update|aplicaciones instaladas|energia|bateria`) opens the card. "red" and "wifi" are left out on purpose, because "red social" is not a Settings request. Same rule in backend and front.
- **A4 root cause:** the front tested `PIDE_EXPLICAR` on the raw text. In JavaScript `\b` does not treat "é" as a word character, so "por qué" never matched. The rule now runs on the normalized text, as the backend already did.
- **A7:** the model cannot send a start time (the tool schema does not include it). The backend copies the snapshot's start time into the proposal so Rust can compare it at click time. A start time that does not match the snapshot is refused. Snapshots without a start time (old clients) keep the old pid-and-name check. Rust already sent `inicio`; no Rust change was needed.
- **A8:** the broadcast filter drops entries whose MAC is `ff-ff-ff-ff-ff-ff`, whatever the IP. A real device with an address ending in .255 (a /16 network) is kept.
- **B3 skipped:** the Anthropic client already has `timeout: 40_000` and `maxRetries: 1`, and errors are mapped to codes.
- **B4 skipped:** `engines` already exists (`"node": ">=22"`) and the brief says to add it only when absent. `node:sqlite` needs 22.13 or newer, so the range is looser than it should be; that is left to the owner.
- **B5:** `.github/workflows/ci.yml` runs backend, desktop and cargo tests on `windows-latest`. Cargo needs `web:build` first because Tauri reads `dist/` at compile time, the same step `build-windows.yml` uses. Not run here (see Verification).
- **C1:** the boot-time evento 100 may need administrator rights. "Por qué tarda en prender" is handled before "compu tarda en prender" only where the subject is not "compu/pc", so the existing test for "la compu tarda en prender" (startup list) still holds.
- **C2:** the wording never says "sano". Without reliability counters the row says so, and the note explains that administrator rights are usually needed. Alerts: advertencia or unhealthy status, a non-OK state, wear of 90 % or more, temperature of 70 °C or more, or read errors.
- **C3:** read only. The restore-point query needs administrator rights on this PC (`Access denied`), and the card says so instead of guessing.
- **C4:** the walker is reused from `sistema.rs` (same skip rules and caps). Only metadata is read. Grouping is by name (case-insensitive) and exact size, with a 1 MB minimum that is a decision of this change, not part of the brief. Labels say "posibles duplicados, revisá antes de borrar". Four `sistema.rs` items became `pub(crate)` for this reuse; no logic changed.
- **C5:** only the install date is listed. The last-use signal (Prefetch, UserAssist) is not reliable without administrator rights, and matching UserAssist paths to program names would be guessing. The card and the panel say so.
- **C6:** three samples one second apart, per-process CPU averaged by program name and divided by the core count (as in the metrics). The label "aproximado, según la CPU de cada programa" is on the card, the panel and the note. Desktops get "Esta PC no tiene batería."
- **Guard for "programas sin usar":** the archivos-pesados rules (`sin usar`, "qué puedo borrar") now stay quiet when the phrase talks only about programs, in both layers. Otherwise "programas sin usar" would show the heavy-files card.
- **Explanation exceptions:** every new tool has the same explanation exception as the earlier ones ("cómo", "por qué", "explicá", "qué es").
- **Commits and attribution:** every commit is by the configured author, in English, with no co-author line and no generated-by text. Nothing was pushed.

## Verification

Test suites run before every code commit. Two docs-only commits (the AGENTS.md row for `ver_dispositivos_red`, and the `ver_arranque` row) were checked right after they were made. Counts at the end of the session:

- Backend `npm test`: 337 passing (321 at the start).
- Desktop `npm test`: 134 passing (108 at the start).
- Rust `cargo test`: 71 passing, 3 ignored (42 at the start). The 3 ignored were ignored before this session.
- `integracion.test.js` and `herramientas-cableado.test.js` check that each new command is registered twice in `lib.rs`, called from `main.js`, present in the backend list and in `ACCIONES_PANEL`.

Read-only checks on this PC (Windows 11, non-administrator), running each new PowerShell script by itself:

- `ver_salud_disco`: returns the NVMe SSD with status Healthy and state OK, and no reliability counters (null), so the row is marked as partial.
- `ver_puntos_restauracion`: `Access denied`; the code returns the "no pude leer" note.
- `ver_arranque`: no event 100 in the log (`No events were found`); the code says the boot time is missing.
- `ver_programas_sin_uso`: returns the installed programs with install dates where Windows has them.

Not verified here: the GitHub Actions workflow `ci.yml` (it was validated by reading only; no YAML parser is available in the repo), `ver_duplicados_posibles` and `ver_consumo_bateria` running inside the Tauri window, and the new cards in the real window (`kerni-test-real-app`).
