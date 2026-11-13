# Questions guide update

## Request
Update `docs/preguntas_para_kerni.pdf` with the questions a person can ask Kerni, the expected answers and the tests that cover them. Keep it straightforward.

## Decisions
- Same file, rebuilt from scratch: 33 numbered questions in six sections (measured data, tools with a card, opening Windows settings and tools, step-by-step guides, questions that use the model, what must be refused), each with the expected answer and the test files that cover it.
- Which phrases need no model was checked against the real routing code (`accionLocalNueva` and `responderLocal`), not assumed. Guide phrases skip the local rules on purpose (`pideGuia` in `main.js`).
- Rows say plainly when something was not tried live: the Microsoft Learn question, the "open privacy settings" refusal, and the 16 new settings pages opened by hand.
- Test totals in the document: backend 602, front 255, Rust 103.
- The generator script is not in the repo; the PDF is the source of truth for now.

## Verification
- Read the rendered PDF (3 pages): tables fit, no cut text.
- Every test file named in the document exists in `src/backend/test` or `src/desktop/test`.
