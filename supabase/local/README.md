# Local Supabase stand-in (Docker)

Runs the same REST API the backend uses against Supabase Cloud (`/rest/v1`), with **pgvector**, on your own machine. No Supabase account or project needed. It is used for the knowledge base (RAG) and the optional health copy. Chat memory does not need it: that lives in SQLite.

| Container | What it is | Where |
|---|---|---|
| `db` | PostgreSQL 16 with pgvector; applies `../migrations/*.sql` the first time | `127.0.0.1:54322` |
| `rest` | PostgREST (the API Supabase uses) | internal |
| `gateway` | nginx that maps `/rest/v1/` like the Supabase gateway | `127.0.0.1:54321` |

Everything listens on `127.0.0.1` only. Data lives in the Docker volume `kerni_pgdata`.

## First time

```bash
node supabase/local/preparar.mjs                                  # local keys + SUPABASE_URL / SUPABASE_SECRET_KEY in src/backend/.env
docker compose -f supabase/local/docker-compose.yml up -d
cd src/backend
npm run indexar                                                   # embeds and stores conocimiento/ (needs a Gemini or OpenRouter key)
npm run indexar -- --buscar "cuánta memoria RAM necesito"         # checks the search
```

`preparar.mjs` never overwrites values already in `src/backend/.env`, and reuses the keys in `supabase/local/.env` so they stay in sync with the database volume.

## Day to day

- Stop: `docker compose -f supabase/local/docker-compose.yml stop`. Start again: `up -d`.
- New migration in `supabase/migrations/`: add it to the `db` volumes in `docker-compose.yml` (a test checks that every migration is mounted). Migrations only run when the volume is created, so apply a new one to an existing database with `docker compose -f supabase/local/docker-compose.yml exec -T db psql -U postgres -d postgres < supabase/migrations/<file>.sql`.
- Start over (deletes the local data): `docker compose -f supabase/local/docker-compose.yml down -v`, then `up -d` and `npm run indexar`.

## Using Supabase Cloud instead

Follow `docs/supabase-cloud-setup.md`: create the project, run the three files in `supabase/migrations/` in the SQL editor in order, put its URL and secret key in `src/backend/.env` and check it with `npm run probar-supabase`. Nothing else changes.

## Safety

- The keys are generated locally, kept in git-ignored files (`supabase/local/.env`, `supabase/local/generado/`, `src/backend/.env`) and only the backend uses them.
- Tables have row level security with no policies and no grants for `anon` or `authenticated`; only the backend's `service_role` key can read or write.
- This is a development convenience for one machine, not a production database: no backups, no TLS.
