# Fix Fastify handling of SSE replies

## Request

Diagnose the Fastify `FST_ERR_REP_ALREADY_SENT` warning reported during Gemini chat requests.
After the backend stopped logging that warning and returned HTTP 200, the desktop app still showed its generic "backend unavailable" message.

## Decisions

- The provider was responding successfully; the warning came from streaming raw SSE responses without telling Fastify that the reply had been taken over.
- Call `reply.hijack()` before writing raw SSE headers, using one shared helper for normal, fallback, and guide responses.
- Add an HTTP-level regression test that captures Fastify warnings and asserts SSE replies are not sent twice.
- Trace the frontend stream reader: it silently discarded malformed SSE JSON, assumed a `done` event existed, and mapped any `TypeError` (including response-processing bugs) to a backend connection failure.
- Extract SSE parsing into a testable helper, support CRLF framing and split chunks, surface missing final events, validate successful chat response shape, and reserve the connection message for failures before an HTTP response arrives.
- Check CORS headers against all Tauri origins and distinguish the current frontend's connection message, so a stale desktop build is apparent when the backend logs HTTP 200.
- The reported "No pude recibir..." message narrowed the cause: `reply.raw.writeHead()` replaced Fastify's prepared CORS headers on SSE responses. Preserve `reply.getHeaders()` when writing raw SSE headers and assert the Tauri `Access-Control-Allow-Origin` header in the route test.

## Verification

- `npm --prefix src/backend test -- test/chat.test.js` — 20 tests passed, including the SSE warning regression test.
- `npm --prefix src/desktop test` — 227 tests passed, including SSE framing, split-chunk, missing-final-event, and malformed-JSON cases.
- `npm --prefix src/desktop run web:build` — passed; Vite reports the existing large-chunk advisory.
- CORS `/health` and `/chat` preflight checks — allowed origins return `Access-Control-Allow-Origin` and HTTP 204 for preflight.
- `npm --prefix src/desktop test` after the diagnostic — 227 tests passed.
- `npm --prefix src/desktop run web:build` after the diagnostic — passed; Vite reports the existing large-chunk advisory.
- The SSE CORS regression test failed before the route fix (missing `Access-Control-Allow-Origin`) and passed after preserving Fastify headers.
- `npm --prefix src/backend test` — 557 tests passed.
