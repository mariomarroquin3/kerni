# Pending items and low-cost improvements: freeze, browser cache, slow-PC diagnosis, AI chip, recovery, own icon

## Request

Implement the pending items and low-cost improvements from the previous report, as small local commits (no push), with tests in every layer:

1. Freeze processes (`congelar_proceso`, with `reanudar_proceso` from the interface only).
2. Clean the Chrome and Edge cache (`limpiar_cache_navegador`).
3. Guided diagnosis for "mi compu va lenta".
4. A "Con IA / Sin IA" status next to the chat.
5. Recovery settings destination and a hint on the restore-points card.
6. Kerni's own icon, only if there is a usable source image.

Skipped on purpose: the manual drag test (needs the owner), Prefetch cleanup (needs administrator), and anything waiting on a decision (reflection approval, download hashes, cloud backend).

## Decisions

- **Freeze uses no new dependency.** `sysinfo` 0.37.2 has no suspend API, so `congelar.rs` declares `OpenProcess`, `CloseHandle`, `LoadLibraryW` and `GetProcAddress` directly and resolves `NtSuspendProcess` / `NtResumeProcess` from ntdll at run time. Access is `PROCESS_SUSPEND_RESUME` only.
- **The freeze checks are pure functions** (`revisar_objetivo`, `anotar`, `quitar`, `podar`) so the rules are tested without Windows: protected names, own pid, name mismatch, reused pid, process already gone.
- **Kerni keeps the list of frozen processes in memory** (pid, name, start time). `reanudar_todos` runs on exit, so nothing stays suspended without the app. The list is pruned on every metrics read (`Metricas.congelados`). If Kerni crashes while something is frozen, it stays frozen until resumed by hand: this is a known risk.
- **The model may propose `congelar_proceso`** (same schema and checks as `terminar_proceso`). `reanudar_proceso` is not in `ACCIONES`: the panic list asks for it from its own list, always with a card, like `cambiar_inicio`.
- **Card text** for the freeze says it pauses and does not close, and that an open window can stop responding (exact Spanish wording from the request).
- **Browser cache** is limited to the `Cache` and `Code Cache` folders of each profile under `%LOCALAPPDATA%` (Chrome and Edge). Nothing else under User Data is read. The same no-symlink rule, the same entry cap (`MAX_ENTRADAS`), time limit and depth limit as temp cleanup. Files in use are skipped and counted. The front measures first (`medir_cache_navegador`), so the card shows MB; if there is nothing to clean it says so and does not ask.
- **Slow-PC diagnosis is a local rule in the desktop** (`web/intenciones.js`), not in the backend. It compares CPU, memory and disk with thresholds and names the bottleneck with the largest ratio to its threshold. It proposes at most one existing action: `ver_programas_inicio` for memory, `limpiar_temporales` for a nearly full disk, nothing for CPU (it points to Task Manager). "Tarda en prender" is excluded and goes to `ver_arranque`. Startup entries are not in the snapshot, so the rule does not count them.
- **AI status** uses `/health` (provider and model) and the `traza` of the last `/chat` response (`respaldo` with `sin_cupo`), or the 503 with `fallbackLocal`. No backend route or field was added.
- **Recovery destination** `recuperacion` is in the closed lists of the backend (`DESTINOS_AJUSTE`), the Rust allow-list (`ms-settings:recovery`), and the front name map, with a test that they match. The restore-points panel offers an "Abrir Recuperación" button when the list is empty, which is also the case when restore is off (Rust reports that as an empty list).
- **Icon:** there was a usable source, the 1024 px render of the character (`personaje/kerni-rive/fuente/build/modo_idle.png`). The icon set (32, 128, 256 and 512 px PNG, and an ICO with 16 to 256 px) was generated from it with Pillow and replaces the old icon in `src-tauri/icons` only. No new character was designed.
- **Line endings:** the working copy uses CRLF for most files; git normalizes it, so the committed content is the same.

## Verification

Commits in order (one topic each):

- `feat: add congelar_proceso, pause a process instead of closing it`
- `feat: add limpiar_cache_navegador, clears only Chrome and Edge cache folders`
- `feat: add a local diagnosis for "my computer is slow" that names the bottleneck`
- `feat: show a Con IA / Sin IA status next to the chat`
- `feat: add the Windows recovery settings destination and a restore-point hint`
- `feat: replace the Bitoo icon with Kerni's character render (icon set generated from modo_idle.png)`
- `feat: log the session that added pending items and low-cost improvements`

Before each commit: `npm test` in `src/backend` and `src/desktop`, and `cargo test` in `src/desktop/src-tauri`, all passing. Final counts: backend 347, desktop 154, cargo 81 (the cargo count includes the new `congelar` and `navegadores` unit tests).

Not verified on the real Windows window (only unit tests and the browser demo):

- The live freeze of a real process (the NtSuspendProcess path). The checks are tested; the call itself is not.
- The cache card and the actual deletion with Chrome or Edge open or closed.
- The chip in the Tauri window (only the state logic and the markup check).
- The recovery button opening Settings from the panel.
- The new icon in the taskbar and the title bar.
