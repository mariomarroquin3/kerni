# Unified memory and the buscar_conocimiento tool

## Request
Review how memory, context and tools are handled and start with the two highest-value changes: (1) unify the memory on one source of truth, and (2) make the RAG a read-only tool instead of a search on every message.

## Findings
- Two implementations of the same memory coexisted: `memoria.js` (facts and chat turns in Supabase) and `sqlite.js` (local, with reflections). Only SQLite was wired in `server.js`.
- Moving from Supabase to SQLite removed a guarantee: the old store swallowed its own errors, but the SQLite one can throw, and `chat.js` would answer 502 if reading the context failed.
- Every chat message paid an embedding for the RAG, even greetings or questions about the live system state.

## Decisions
- **SQLite is the only memory.** `createMemoria` (Supabase) and its tests were removed; `memoria.js` keeps `esUuid` and the null memory. Supabase stays for the health copy and the RAG table. The unused tables `kerni_hechos` and `kerni_mensajes` are documented as droppable, not dropped (destructive and possibly applied by someone).
- **Memory never breaks the chat**: `chat.js` wraps reading the context, resuming the conversation, saving the turn and queueing the reflection, and logs failures. Regression test included.
- **`buscar_conocimiento` is a read-only tool.** It needs no approval (it changes nothing, so rule 1 holds), is only offered when the RAG is enabled, validates its arguments with zod, is capped at 2 searches per turn and returns the passages sanitized, inside `<conocimiento>`, marked as reference text. The automatic per-message retrieval was removed; the persona explains when to use the tool.
- Trade-off accepted: a RAG question now costs one extra model step (the one that reads the result) but no embedding is spent on messages that do not need it.
- `probar-memoria` now checks SQLite locally (always) and the Supabase health and knowledge tables (only with keys).

## Verification
- Backend: 150 tests (memory tests now run on a real SQLite file in the OS temp folder; 9 new tests for the tool: arguments, cap, no embeddings on greetings, no-result message, injection through a passage, tool hidden without RAG).
- `probar-memoria` ran for real on SQLite; the Supabase part was skipped (no keys). **Nothing was run against real Supabase or a real embeddings API.**
- Not done yet: the model's habit of calling the tool depends on the model; check it with real conversations (`npm run probar-llm`).
