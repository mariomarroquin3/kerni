# Supabase memory and context handling

## Request
Review how context is handled and connect Supabase so Kerni remembers details about the person and their PC ("que quede todo listo").

## Findings (before)
- Chat history was an in-process `Map` in the backend: lost on every restart; the app also forgot its `session_id` on close.
- History was kept in the active provider's format (Anthropic and OpenAI differ), so it could not be reused across providers.
- Nothing about the person or the PC survived between sessions. SQLite was only a TODO.

## Decisions
- **Supabase through the backend only**, with the secret/service key in `.env` (never in the app). Tables have RLS enabled with no policies and grants revoked from `anon`/`authenticated`, so the public keys read and write nothing. Rows are scoped by `device_id`, a random UUID the app creates.
- **Plain REST client with `fetch`** (`memoria/supabase.js`), no SDK: easy to fake in tests, same style as the LLM clients. New `sb_secret_` keys go only in `apikey`; legacy JWT keys also in `Authorization`.
- **Three tables** (`supabase/migrations/20261021000000_memory.sql`): `kerni_hechos` (facts), `kerni_mensajes` (chat turns as plain text, so any provider can resume them), `kerni_salud` (light health history, pruned after 30 days).
- **Kerni proposes, the person decides** (rule 1) also applies to memory: the model calls `proponer_recuerdo`, the backend validates it, the app shows the confirm card, and the fact is saved only after *Aprobar*. Secrets, long opaque strings and paths with the user name are rejected. Max 50 facts.
- **Memory is data, not instructions**: it enters the prompt inside `<memoria>`, cleaned like process names, and the persona says so.
- **Supabase failures never break the chat**: reads return empty, writes are logged. Without `SUPABASE_URL`/`SUPABASE_SECRET_KEY` the memory is a no-op object and the model does not even see the tool.
- A new session resumes the last 6 messages (3 exchanges) from Supabase; health samples are sent every 10 min from the real app only (never demo data) and the backend ignores samples closer than 5 min.

## Verification
- Backend: 96 tests (30 new, in `test/memoria.test.js`: REST requests, key never leaked, secret rejection, prompt-injection via a fact, device isolation, fact limit, resume order, health summary, routes).
- Front: 45 tests (new wiring test: `device_id` sent, fact saved only inside `ejecutar`, health only from Tauri).
- **Not verified against a real Supabase project** (no URL/key was available). Run the migration, fill `.env`, then `npm run probar-memoria` in `src/backend`.
- Not done: a UI panel to list/delete facts (the routes `GET/DELETE /memoria` exist).
