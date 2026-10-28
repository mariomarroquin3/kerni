# Heavy files from the conversation, not only the menu

## Request
The heavy files action worked from the two-finger menu; it should also be triggered from text and conversation. And which other tools could be added.

## Decisions
- **Why it failed.** Short phrases already opened the scan in the front, but longer ones went to the model, and the small Gemini model often answered "I propose reviewing the heavy files" without calling `proponer_accion` (trace: one model step, no tool call).
- **Harness fallback** (`src/backend/src/intenciones.js`, used by `agent.js`): if the turn ends with no `proponer_accion` and the message asks for heavy, old or unused files, or which ones can be deleted, the harness adds the same read-only proposal the model would have made, and records a `regla` step in the trace. The person still approves on screen (rule 1); nothing runs by itself. It does not add anything when the model already proposed something (the same action or another one, like closing a process), when the message is an explanation request ("por qué", "cómo") unless it also asks what can be deleted, or when it is longer than 30 words.
- The front keeps its own fast path (no model, no backend) for short phrases.

## Verification
- Backend 233 tests (7 new in `test/archivos-chat.test.js`: recognized and ignored phrases, fallback adds the card, no duplicate, no card over another proposal, none in normal chat).
- Real model: "buscame los archivos viejos que ya no uso y que pueda borrar" now returns the `ver_archivos_pesados` proposal (before: empty); a greeting returns none.
