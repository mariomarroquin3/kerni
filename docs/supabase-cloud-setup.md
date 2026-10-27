# Setting up the Kerni RAG on Supabase Cloud

For whoever creates the shared Supabase project. About 20 minutes, no card needed (free plan). At the end Kerni answers questions from the Dell Latitude 3120 manuals and the team guides, stored in a pgvector database that everyone on the team can use.

> Kerni already works without any of this: memory lives in SQLite on each PC. Supabase only holds the **knowledge base (RAG)** and a copy of the health readings. If you only need it on your own machine, `supabase/local/README.md` runs the same thing in Docker with no account.

## What you need

- Node 22 and the repo cloned (`git pull`), then `cd src/backend && npm ci`.
- A free Supabase account.
- A free Gemini API key (or OpenRouter) for the embeddings: <https://aistudio.google.com/apikey>.
- About 5 minutes of waiting for the indexing (the free embeddings tier allows 100 requests per minute; the script waits by itself).

## 1. Create the project

1. In the Supabase dashboard choose **New project**.
2. Name: `kerni`. Plan: **Free**. Pick the region closest to the team.
3. Set a database password and **save it in your password manager** (Kerni does not use it, but you cannot read it again later).
4. Wait until the project says it is ready (about two minutes).

## 2. Create the tables and the search functions

Open **SQL Editor > New query**, paste the whole content of each file below and press **Run**. **Order matters.** Each one should answer *Success. No rows returned.*

| # | File | What it creates |
|---|---|---|
| 1 | `supabase/migrations/20261021000000_memory.sql` | `kerni_salud` (health copy). It also creates `kerni_hechos` and `kerni_mensajes`, which Kerni no longer uses (memory moved to SQLite); they are harmless and you can drop them later. |
| 2 | `supabase/migrations/20261021000100_rag.sql` | The `vector` extension, the `kerni_conocimiento` table (768 dimensions, HNSW index) and the `kerni_buscar_conocimiento` search function. |
| 3 | `supabase/migrations/20261021000200_rag_hibrido.sql` | Hybrid search (vector + Spanish text). Optional but recommended. |

All tables have Row Level Security **on, with no policies**, and the public roles get no permissions: the public (anon/publishable) key can read nothing. Only the backend, with the secret key, can.

*Alternative with the CLI:* `supabase link --project-ref <ref>` and `supabase db push` from the repo root applies the same three files.

## 3. Copy the URL and the secret key

In **Project Settings > API**:

- **Project URL**: `https://<ref>.supabase.co` (without `/rest/v1` at the end).
- **API Keys**: the **secret** key (`sb_secret_...`). If the dashboard still shows the legacy tabs, use `service_role`.

**Never use the publishable / anon key**: it cannot read the tables, on purpose.

The secret key can read and write everything in the project. Do not commit it, do not paste it in chats or screenshots, and share it with the team through the password manager. If it leaks, rotate it in the same page.

## 4. Configure the backend

Each person who will run Kerni against this project edits their own, git-ignored, `src/backend/.env`:

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
GEMINI_API_KEY=...          # only needed by whoever indexes, and for chatting with Gemini
```

## 5. Check that the project is ready

```bash
cd src/backend
npm run probar-supabase
```

Every line should say `OK`. If not, it tells you what to do:

| Message | Meaning and fix |
|---|---|
| `Llave ... la llave PÚBLICA` | You pasted the publishable/anon key. Use the secret one (step 3). |
| `No llegué al proyecto` | Wrong `SUPABASE_URL`, no internet, or the project is paused (free projects pause after a period of inactivity; press **Restore** in the dashboard). |
| `La llave fue rechazada` | The key is incomplete or from another project. |
| `La tabla ... no existe todavía` / `La función ... no existe todavía` | A migration from step 2 was skipped. The message names the file. |
| `La dimensión de los vectores no coincide` | The table is not `vector(768)`; use the migration from this repo. |
| `AVISO ... búsqueda híbrida` | Optional. Without migration 3 Kerni uses the vector search only. |

## 6. Get the manuals and index everything

The official manuals are copyrighted, so they are **not in the repository**. This downloads them from Dell's own site into `conocimiento/privado/` (ignored by git):

```bash
npm run manuales                 # Dell Latitude 3120: setup and specifications + service manual (about 29 MB)
npm run indexar -- --simular     # counts passages, spends nothing
npm run indexar                  # indexes everything; safe to stop and run again, it continues where it stopped
```

With the current content you should get **254 passages**: 41 from the team guides in `conocimiento/` and 213 from the two manuals. Indexing is idempotent (each passage has a fingerprint), so running it twice costs nothing, and a manual that changes only re-embeds what changed.

To add your own documents: put `.md`, `.txt` or text `.pdf` files in `conocimiento/` (or in `conocimiento/privado/` if they are copyrighted) and run `npm run indexar` again. A scanned PDF (only images) is skipped with a warning because there is no OCR. To add another downloadable manual, add an entry to `conocimiento/manuales.json` (https only, from `dl.dell.com`, destination inside `privado/`).

Try the search without any model:

```bash
npm run indexar -- --buscar "How much RAM does the Latitude 3120 have and can I upgrade it?"
```

You should see passages from the setup guide with similarity around 0.7 to 0.8. Questions in Spanish work against the English manuals too.

## 7. Run Kerni against the cloud project

```bash
Kerni.bat
```

The console prints `Conocimiento (RAG): activo` and `http://127.0.0.1:8788/health` answers `"conocimiento": true`. Ask Kerni, for example, *¿Le puedo agregar más memoria RAM a una Dell Latitude 3120?* (it should answer that the memory is soldered).

If you also set up the local Docker stack once (`supabase/local/.env` exists), the launcher starts Docker too; the backend uses whatever `SUPABASE_URL` says. Delete `supabase/local/.env` if you want the launcher to skip Docker.

## Working as a team

- **One project, many people.** Everyone puts the same URL and key in their own `.env`. The knowledge base is indexed once; the others do not need to index or even download the manuals.
- Anyone with the secret key has full access to the project, so share it privately and rotate it if someone leaves.
- Changing the embedding model means re-indexing everything (vectors from different models are not comparable), and a different dimension also needs a new migration.

## Good to know

- **Free projects get paused** after a period of inactivity (currently about a week). Press **Restore** in the dashboard; no data is lost. Open the project before a demonstration.
- The free database has 500 MB; this knowledge base uses a few. There are no automatic backups on the free plan; the documents are in the repo and the manuals come from `npm run manuales`, so everything can be rebuilt with `npm run indexar`.
- Only the address of a link is sent to Google if you also set `SAFE_BROWSING_API_KEY`; that is unrelated to Supabase.
- Nothing in this setup sends your files, chats or memories to Supabase. It receives the health readings (CPU, RAM and disk percentages and the heaviest process name) and the public knowledge texts.
