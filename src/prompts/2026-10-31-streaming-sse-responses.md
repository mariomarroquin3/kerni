# Response streaming via Server-Sent Events (SSE) (Phase 3)

## Request

Implement real-time response streaming from the Fastify backend to the Tauri desktop app, so Kerni's speech bubble populates dynamically as the model generates tokens.

## Decisions

- **Fastify SSE endpoint on `POST /chat`**: When the client requests `Accept: text/event-stream` or `?stream=true`, Fastify writes SSE event blocks with `Content-Type: text/event-stream`:
  - `event: status`: Tool invocation and knowledge lookup progress updates (e.g. `buscar_conocimiento`).
  - `event: delta`: Live text tokens/chunks sent as they are produced.
  - `event: done`: Final payload containing `{ session_id, respuesta, acciones, traza }`.
  - `event: error`: Friendly error payloads, retaining `fallbackLocal` flags on quota exhaustion.
- **Harness integration in `agent.js`**: `runTurn()` now accepts `onDelta` and `onStatus` callbacks. Delimited system blocks (`<sistema>`, `<memoria>`) and emojis are stripped before streaming to the client.
- **Backwards compatibility**: When `Accept: text/event-stream` is omitted, `POST /chat` returns the standard JSON response format, guaranteeing 100% compatibility with non-streaming callers and all existing tests.
- **Desktop client in `main.js`**: Reads the `ReadableStream` from `res.body`, incrementally populating `globo.textContent` (Rule 4: no `innerHTML`). Once `event: done` is received, actions are queued for user approval as usual.
- **Fallback resilience**: In case of quota errors or missing model keys, SSE streams fall back to local responses or knowledge excerpts and terminate gracefully without breaking client state.

## Verification

- Backend unit & SSE tests: `npm test` in `src/backend` — 282 passed (2 new tests covering SSE streaming and quota fallback).
- Desktop tests: `npm test` in `src/desktop` — 106 passed.
- Desktop build: `npm run web:build` in `src/desktop` — succeeded.
- Rust tests: `cargo test` in `src/desktop/src-tauri` — 34 passed (1 ignored).
