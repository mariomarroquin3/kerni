# MCP client and read-only Microsoft Learn search (opt-in)

## Request

Add a minimal MCP client to the Kerni backend and expose one read-only tool, `buscar_docs_microsoft`, that searches Microsoft's official documentation through the public Microsoft Learn MCP server. It is off by default (`MICROSOFT_LEARN_MCP=1` turns it on). Only the question text may leave the PC. Local commits only, no push. The protocol facts had to be verified against the official sources before writing code, and written into the code comments with their URLs.

## Decisions

- Verified protocol (2026-11-01): endpoint `https://learn.microsoft.com/api/mcp`, Streamable HTTP, JSON-RPC 2.0. The client sends `Accept: application/json, text/event-stream` and `MCP-Protocol-Version: 2025-06-18`, and keeps the `Mcp-Session-Id` the server returns on initialize. Sources: the Learn MCP overview and developer reference (learn.microsoft.com/en-us/training/support/mcp and mcp-developer-reference) and the MCP spec transports and lifecycle pages (modelcontextprotocol.io/specification/2025-06-18/basic/).
- The server's tool list is `microsoft_docs_search` (argument `query`), `microsoft_docs_fetch` (`url`) and `microsoft_code_sample_search` (`query`, optional `language`). Kerni only calls `microsoft_docs_search`. The developer reference says the tools and formats may change, so the client calls `tools/list` once per session before any call. The Learn docs do not document the result schema; the live probe showed `{"results":[{"title","content",...}]}` inside a text content item. Whether a URL field is always present was not verified (the code reads `contentUrl` or `url` when present).
- Host allowlist: the client fixes one endpoint and refuses any other URL before sending anything (scheme, host and path must match exactly). Redirects are not followed (`redirect: 'error'`).
- Privacy: the request body for the search is exactly `{ jsonrpc, id, method: "tools/call", params: { name, arguments: { query } } }`. No snapshot, device_id, equipment, memory or file names are attached; a test checks it.
- Results are data, not instructions. Each field goes through the shared sanitizer (`seguridad/texto.js`); links are kept only when they are `https` to learn.microsoft.com or docs.microsoft.com (new helper `quitarUrlsSalvo` in that same file); the block `<documentacion>` is capped at 6000 characters, and results that do not fit are dropped whole.
- Limits: 2 searches per turn (same pattern as the knowledge base), 10 s timeout, 200 KB response cap (checked by content-length and while reading), cache of the last 20 queries for 10 minutes. Errors go back to the model as Spanish messages without the server body or headers.
- Terms of use: the Learn terms describe personal and non-commercial use unless stated otherwise; the MCP overview says the server is public and free. Recorded as an open point for the owner, not resolved here.
- Commits follow the plan: client, search wrapper behind the flag, agent integration, docs, and this log. Each one passes `npm test` alone.

## Verification

- Live probe (once, from a script in %TEMP% that was deleted afterwards, not committed): initialize returned protocol `2025-06-18` and server name "Microsoft Learn MCP Server"; `notifications/initialized` returned 202; `tools/list` returned `microsoft_docs_search`, `microsoft_code_sample_search` and `microsoft_docs_fetch`; `tools/call` for "Windows Update pause updates" returned 200 with one text item of about 46 KB whose JSON has a `results` array (first item: title "Configure Windows Update client policies").
- Tests (no real network): `test/mcp-cliente.test.js` (14: allowlist refusals, full flow with session header, SSE and JSON responses, session recovery, timeout, size cap, no leaks of body or headers, network errors), `test/microsoft-learn.test.js` (14: validation, query-only body, cache size and expiry, errors not cached, result reading, flag parsing), `test/microsoft-learn-agente.test.js` (12: tool absent when off and present when on, malicious text sanitized with foreign links removed, size cap, 2 per turn, failures do not break the turn, persona line).
- `npm test` in `src/backend`: 458 passing before, 498 after (40 new).
- Not verified: whether the server changes its tool names or result shape over time; a real end-to-end chat with the model calling the tool; the terms-of-use question above.
