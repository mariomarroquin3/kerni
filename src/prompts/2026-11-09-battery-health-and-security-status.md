# Two read-only tools: battery health and security status

## Request
Continue with the improvements proposed after the repo review: battery health and security status (the print queue reset stays for later because it changes something).

## Decisions
- **Same checklist as every action** (schema, validation, Rust revalidation, card, local intent, tests in each layer). Both are read-only and carry no data from the model. They live in `diagnostico.rs` next to the disk health check, and follow its shape: a fixed PowerShell script, a pure parser, a note, and "no data" is said, never invented.
- **`ver_salud_bateria`.** `powercfg /batteryreport /xml` works without administrator and gives the design capacity, the full-charge capacity and the cycle count (the WMI battery classes do not give the design capacity on this PC). The script writes the report to a unique temp file and always deletes it. Health = current / original, capped at 100: 80 or more is "buena", 60 to 79 "desgaste", below that "muy gastada", and no percentage at all when Windows does not give both numbers. A desktop says it has no battery. On this PC: 54.0 Wh design, 36.4 Wh now, 456 cycles, 67 %.
- **`ver_estado_seguridad`.** Defender (real-time protection, signature age, tamper protection), the other antivirus products registered in the Security Center, the firewall per profile and UAC. It never says "protected": the best result is "no alerts in what I can look at, not a guarantee". Another antivirus is named but not judged (its state cannot be read from here). Names coming from the system are cleaned and painted with `textContent`.
- **Overlap with an existing local answer.** "¿Cómo está la batería?" is the charge level and the interface answers it with the measured value, so it is not a health request; "la batería me dura poco" stays with the consumption tool. Both rules have an exception for "why / explain / what is" questions, and the security one also for "best / recommend / how do I activate / free", so a question about choosing an antivirus does not open a card.
- Not added: a menu entry (like the other diagnostic tools they are asked in the chat) and the print queue reset, which needs its own card and Rust validation.

## Verification
- Backend 571 tests (7 new), front 238 (7 new), Rust 97 (10 new parser and guard tests) plus an ignored real-system test: on this PC it read the battery (67 %, 456 cycles) and five security checks, all without alerts.
- Browser demo: both cards and panels, including the alert row.
- Not tried in the compiled Tauri window.
