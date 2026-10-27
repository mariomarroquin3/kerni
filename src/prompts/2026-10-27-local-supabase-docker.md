# Local Supabase with Docker and the first real indexing

## Request
Set everything up for the knowledge base without a Supabase project: use Docker for the ingestion and do the whole setup.

## Decisions
- `supabase/local/`: PostgreSQL 16 with pgvector, PostgREST and an nginx that exposes `/rest/v1` on `127.0.0.1:54321`. The backend client is unchanged; only `SUPABASE_URL` and `SUPABASE_SECRET_KEY` differ from the cloud. Migrations are mounted into `docker-entrypoint-initdb.d`; `00-roles.sql` creates the roles and schemas Supabase Cloud provides (`anon`, `authenticated`, `service_role`, `authenticator`, `extensions`).
- `preparar.mjs` generates the database password, a JWT secret and a long-lived `service_role` JWT, writes them to git-ignored files and fills `src/backend/.env` without overwriting values that already exist. Nothing sensitive is committed or printed.
- Everything binds to `127.0.0.1`; tables keep RLS without policies and no grants for the public roles.
- **Real bug found while indexing:** the default Gemini embedding model had been changed to `text-embedding-004`, which no longer exists on the account (404). Listing the models showed `gemini-embedding-001` and `gemini-embedding-2`; `gemini-embedding-001` with `dimensions: 768` works through the OpenAI-compatible endpoint, so the default went back to it.

## Verification
- Real run on the user's machine: containers healthy, both search functions answer through the REST gateway, 41 passages indexed with real Gemini embeddings.
- Search quality measured with six real questions: relevant ones score 0.74 to 0.81 on the best passage, an off-topic one scores 0.47, so the 0.55 threshold stays.
- End to end with the real model: it called `buscar_conocimiento`, got the passages and answered citing the memory guide in 3.3 s. A test backend on port 8799 was used and stopped; the user's own instance was not touched.
- A new backend test checks that every migration is mounted in the compose file, in order, and that the compose file carries no secrets.

## Follow-up: PDF manuals
Request: load manuals (Dell Latitude 3120 and the other government-issued PCs, Word, PowerPoint, Windows).
- The indexer now reads PDFs (`unpdf`, no native code): one "Página N" heading per page so answers can cite pages, line breaks re-joined and hyphenated words repaired. Scanned PDFs are skipped with a warning (no OCR). `--simular` counts fragments without keys or quota.
- Manuals go in `conocimiento/privado/` (git-ignored, possibly copyrighted). Nothing was downloaded or added: no manuals were uploaded by the assistant; the only indexed content is the 6 short documents written for the repo.
- Verified for real: a sample PDF was indexed in the local database, found with similarity 0.825 citing its page, a scanned sample was skipped, and the sample rows were removed. Backend: 156 tests (4 new with small PDF fixtures).
