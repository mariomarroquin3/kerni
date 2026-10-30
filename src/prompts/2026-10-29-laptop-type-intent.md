# Recognize laptop type questions locally

## Request
When asked what type of laptop the person has, Kerni returned unrelated snippets from the Latitude 3120 manuals after the model quota was exhausted.

## Decisions
- Recognize "qué tipo de laptop tengo" as a direct equipment-information request in both desktop and backend intent detection.
- Route the short desktop request to the existing local equipment view, which reads the actual device model instead of relying on general RAG snippets.
- Keep both intent rules synchronized and add regression coverage for the reported wording.

## Verification
- `cd src/desktop && node --test test/herramientas.test.js`: 16 passed.
- `cd src/backend && npm test -- --run test/herramientas.test.js`: 21 passed.
- `cd src/desktop && node --test test/herramientas.test.js test/integracion.test.js`: 38 passed.
- `git diff --check`: passed.
