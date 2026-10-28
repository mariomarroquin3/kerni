# Fix: "Cerrar Kerni" did nothing, and the new tools were missing from the right-click menu

## Request
The person could not close Kerni: closing the terminals did not close it and "Cerrar" did nothing.

## Decisions
- **What was running:** `kerni.exe` was alive and idle (it did not spin and answered `CloseMainWindow` by closing in under 6 s), so it was not frozen. The way to close it from the window was broken.
- **Root cause.** A teammate replaced the native right-click popup with an in-window HTML menu (commit `30c0d49`, for Linux). Its "Cerrar Kerni" and "Ocultar a Kerni" called `getCurrentWindow().close()` and `.hide()` from JavaScript, but the window capability only grants `core:default` and `allow-start-dragging`, so both calls are denied and the error was swallowed (a bubble saying "No pude completar esa opción"). The window has no title bar and no taskbar button, so there was no other way to close it except the tray icon.
- **Fix.** Closing and hiding are now Rust commands (`salir_de_kerni`, `ocultar_kerni`); the interface keeps no window permissions, and a test checks that. `salir` also forces the exit after 3 seconds if the normal one hangs, for the tray and the menu, so "Cerrar Kerni" always closes.
- **Second finding in the same change.** The in-window menu only had the five old options: the "Más herramientas" submenu I added lived in the native menu, which is no longer what the two-finger click opens on Windows. The in-window menu now has an expandable "Más herramientas" with the seven tools and the support summary; the recycle bin from there only opens the confirmation card.

## Verification
- Front 97 tests (4 new in `test/cerrar.test.js`: no window calls from JS, commands registered in both lists, forced exit, every menu option has its `case`). Rust 32.
- Real app: built the release exe, launched it, opened the menu as the two-finger click does, expanded "Más herramientas", opened "Información del equipo" (it read this PC) and pressed "Cerrar Kerni": the process ended immediately with exit code 0.
- Not reproduced live: the original failure with the old build (found by reading the capability and the handler, and consistent with the symptom).
