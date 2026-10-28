# Bug review of the new tools, and proposals that fit the project context

## Request
Review for bugs and propose implementations that align with the context of the project.

## Decisions (bugs found and fixed)
- **Startup programs with accents or enye** (real bug). Names were read with `reg query`, whose output uses the console code page, so "Programa ñandú" came back garbled and the disable switch would have been written for a program that does not exist. Reading and writing now go through PowerShell in UTF-8, and the name travels in an environment variable, never inside the script. A name the cleaning would change (very long or with control characters) is shown but cannot be changed. Proven against the real registry with a temporary entry with accents (created, disabled, enabled, deleted).
- **Windows Update search takes minutes** (87 s measured here): the limit went from 2 to 5 minutes and the interface says "unos minutos". The size reported is the maximum download, so it is shown as "hasta X". The antivirus definition updates install by themselves several times a day, so they are listed but no longer counted as pending.
- **False positives in the intent rules** ("abrí el programa de inicio de sesión" proposed the startup list; "hay actualizaciones de Office" proposed Windows Update; "información del equipo de ventas"; "la red social está lenta"). Each rule can now have an exception, in the backend and in the front, with regression tests.
- **Network check could wait many seconds without internet** (name resolution has no timeout of its own): it now gets 4 seconds.
- **Front**: an unknown action was shown as "¿Borrar los archivos temporales?" (the old default); it now says what the backend sent. The recycle bin card could overwrite a newer card while its size was being measured, and two panel reads in a row could show the older result last; both now ignore stale answers. Lookups in plain objects use `Object.hasOwn`.
- PowerShell sometimes prefixes the output with a BOM; it is stripped before parsing.
- Checked and clean: no `innerHTML`, no `eval`, no `unwrap` outside tests in the new Rust, strict CSP, CORS limited to the app origins.

## Verification
- Rust 32 tests plus 3 ignored real-system tests (all pass, including the registry one with accents). Backend 253, front 85.
- Not verified: Linux build of `herramientas.rs` (no Linux toolchain here; the non-Windows branches are stubs), emptying the recycle bin for real (irreversible), and the compiled Tauri window.
