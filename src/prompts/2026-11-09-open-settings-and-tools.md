# More screens and tools Kerni can open

## Request
Kerni often said "te ayudo a abrir tal herramienta" and then had no way to do it. Give it more ways to open Windows settings and tools, based on what Microsoft Learn documents.

## Decisions
- The `abrir_ajuste` closed list grew from 7 to 23 screens. The `ms-settings:` addresses were copied from the Learn page "Launch Windows Settings" (ms-settings: URI scheme reference), not from memory. Added: pantalla, sonido, notificaciones, bateria, acerca, wifi, bluetooth, impresoras, apps_predeterminadas, fecha_hora, seguridad_windows, solucionador, barra_tareas, discos, historial_actualizaciones, mouse.
- Accounts and privacy were left out on purpose, even though Learn lists them.
- New action `abrir_herramienta` (the five places of the add-action checklist): backend schema and validation, Rust command with its own closed list, confirmation card, front wiring and tests. It opens Administrador de tareas, Administrador de dispositivos and Liberador de espacio. Rust only launches fixed programs from `System32` (`taskmgr.exe`, `mmc.exe devmgmt.msc`, `cleanmgr.exe`): no path or argument comes from the model or the interface.
- The persona and the tool description now say Kerni must only offer to open what is in those lists. If the person asks for something else (accounts, privacy, the registry, any program), it explains the path by hand and says it cannot open it. A test checks that the persona names every destination, so the list and the prompt cannot drift apart.
- Short local requests ("abre bluetooth", "abre el administrador de tareas") get the card without calling the model, but only when the message ends there: "abre la pantalla completa de este juego" goes to the model.
- Not done: a local rule in the backend intent detector. The model chooses the tool from the persona text.

## Verification
- Backend 602 tests (9 new), front 255 (6 new), Rust 103 (1 new) all pass.
- New tests compare the closed lists across backend, Rust and front, reject cuentas, privacidad, paths and programs, and check the ambiguous and negated phrases open nothing.
- `taskmgr.exe`, `mmc.exe`, `cleanmgr.exe` and `devmgmt.msc` exist in `System32` on this PC. The windows themselves were not opened from a test (it would pop up on screen), and the 16 new `ms-settings:` screens were not each opened by hand.
