# Seven more tools: equipment info, startup, space, network, updates, recycle bin, settings

## Request
Add the seven tools that were suggested after "heavy files from the conversation": information of the equipment, startup programs, space by folder, open a Windows setting, empty the recycle bin, network status and pending Windows updates.

## Decisions
- **Same pattern as `ver_archivos_pesados`** (AGENTS.md rule 5): every action has its schema and validation in the backend (`acciones.js`), its command and revalidation in Rust, a confirmation card and a test per layer. Six are read-only; `vaciar_papelera` deletes for good, so its card shows how many items and MB it holds and says it cannot be undone.
- **Rust in a new file** (`herramientas.rs`) so `sistema.rs` does not keep growing; `espacio_por_carpeta` stays in `sistema.rs` because it reuses the heavy files scan with zero days. Everything that talks to Windows has a time limit, no console window and pure parsers with unit tests. PowerShell only receives fixed scripts (encoded, never built from text of the person or the model); `reg.exe` and `explorer` receive the name as an argument, without a shell.
- **Startup programs**: the list is read from the `Run` keys and `StartupApproved` with `reg query`. Changing one (`cambiar_inicio`) is **not** something the model can propose: the interface asks for it from its own list, with a card, Rust checks the name against the live list and only touches the user's entries (system ones need administrator and the UI says so). It writes the same switch the Task Manager uses, so it is reversible.
- **Settings**: `abrir_ajuste` takes a name from a closed list shared by backend, Rust and front (a test keeps the three in sync). The model can never send an address or a program name.
- **Equipment in the chat**: the front reads the model of the PC once and sends it as `equipo`; the harness cleans it (`limpiarNombre`) and puts it in the turn as measured data, not instruction. With the real model, "how much RAM can I add?" now answers from the Latitude 3120 guide.
- **Recognition without trusting the model**: `src/backend/src/intenciones.js` (conversation, up to 30 words) generalizes the heavy files fallback to the new tools, and the front recognizes short phrases without backend or key. Both normalize accents (JavaScript `\w` does not match "á", which broke "vaciá" in the first version) and propose nothing when unsure. Nothing runs by itself: the card always appears first.
- **Menu**: a "Más herramientas" submenu in the two-finger menu; the recycle bin from there only opens the card.
- **Voice**: the persona names the new actions, tells Kerni to propose them instead of guessing, and to warn that emptying the bin cannot be undone; all new texts have no diminutives or emojis (a test checks them).

## Verification
- Rust 31 tests (12 new parsers and guards: reg output with names with spaces, StartupApproved bytes, adapters, updates JSON, recycle bin, closed settings list, hung command is cancelled, unreachable address fails fast, space by folder counts today's files) plus an ignored real-system test: on this PC it read the model, 9 startup entries, the Wi-Fi adapter with 66 ms and the recycle bin.
- Backend 252 tests (19 new: validation, closed destinations, intent recognition and non-recognition, no duplicate card, equipment line cleaned). Front 83 tests (18 new, including wiring between HTML, JS, Rust, menu and backend).
- Browser demo: the cards, panels, the Disable button with its card and the recycle bin card with its size work. Real model (Gemini flash-lite): updates and settings requests return the right card; the RAM question uses the equipment model.
- Not tried by hand in the compiled Tauri window (needs `Kerni.bat` to rebuild). Windows Update search and emptying the recycle bin were not run for real (the first can take minutes; the second is irreversible).
