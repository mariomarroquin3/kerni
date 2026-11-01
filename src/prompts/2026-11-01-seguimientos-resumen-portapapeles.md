# Follow-ups: chat error code, startup count, clipboard link monitor, daily summary

## Request

Four small items in the Kerni repo, each as its own local commit with tests in every layer touched, without pushing:

1. A stable `codigo` in the `/chat` error bodies so the AI chip can show "llave no válida".
2. An optional `inicioActivos` count in the snapshot, used by the slow-PC diagnosis to suggest `ver_programas_inicio` when there are many startup entries.
3. An opt-in clipboard link monitor, off by default, that asks ("Copiaste un enlace. ¿Lo reviso?") and checks the link only after a click.
4. A once-a-day summary bubble (disk, memory, battery if any, days since reboot), on by default, with an off option in the right-click menu.

## Decisions

- Item 1: the 503/502 bodies gain `codigo` (`sin_llave`, `llave_invalida`, `sin_cupo`, `sin_red`, `fallo`). `error` and `fallbackLocal` are unchanged. A 402 without a code is reported as `sin_cupo`. The front maps `llave_invalida` to "Llave no válida" and ignores `sin_llave` (the chip already comes from `/health`).
- Item 2: the front counts the enabled startup entries (both scopes) only from a list read in the last 30 minutes, and sends nothing otherwise. The diagnosis proposes `ver_programas_inicio` only when no resource is at its limit and there are at least 15 enabled entries. With the CPU at its limit it never proposes an action, with or without the count; memory keeps its existing proposal.
- Item 3: the clipboard is read with `navigator.clipboard.readText()`, the browser API the app already uses for writing. No plugin or new dependency was needed (the Cargo.toml has none). The check runs every 4 seconds, only when the window has focus, the option is on, and there is no panic and no open card. Turning it on takes the current clipboard as already seen, so an old link does not pop up. The link heuristic is the existing `ALGO_COMO_ENLACE`, anchored to the whole text (one token, at most 300 characters). File names such as `factura.pdf` are excluded unless they start with `www.` or a scheme. Only the last text and the last offered link are kept in memory. The request to `/enlaces/revisar` is made only from the bubble's button.
- Item 4: the day and the 9:00 hour are computed in `America/El_Salvador`, not in the PC's zone. The summary waits while another bubble is visible, a card is open, panic is on, or the option is off. It is a message only: no card, no request, no model. The last shown day is stored in localStorage.
- Line endings: some edits were written from Python on Windows and produced CRLF files, which broke a test that matches `'\n});\n'`. Those files were normalized back to LF before committing.

## Verification

- Backend `npm test`: 374 tests pass (new: each `codigo` value, old fields still present, `inicioActivos` accepted, absent, or rejected when invalid).
- Desktop `npm test`: 217 tests pass (new: `estado-ia` for llave inválida and sin_llave, startup count helpers and the diagnosis threshold at 14 and 15, CPU never proposes, clipboard link detection and new-vs-seen, debounce guard with the monitor off, daily-summary day boundary, once per day, off, panic, card and bubble suppression, text content).
- Cargo: not run, because no Rust file changed in this session.
- Not verified in the real Tauri window: the clipboard read permission under WebView2, the button's layout inside the bubble, the timing of the daily summary, and the real startup count on this PC.
