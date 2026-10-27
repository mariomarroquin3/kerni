# Guide and tooling to put the RAG on a shared Supabase Cloud project

## Request
Create the ingestion script and a guide so the teammate can create the Supabase project and have the RAG there.

## Decisions
- The ingestion script already existed (`npm run indexar`: idempotent, PDF-aware, waits out the free embeddings rate limit). What was missing for a cloud project was everything around it, so three pieces were added:
  1. **`npm run probar-supabase`** (`rag/verificar.js`): read-only checklist for any project, cloud or local. It checks the URL shape, rejects a publishable/anon key before calling anything, then the connection, `kerni_salud`, `kerni_conocimiento` (with the count of passages and documents), the vector search with a zero vector of 768 dimensions and the hybrid search (optional). Every failure maps to what to do: wrong key, project paused, which migration file is missing, dimension mismatch.
  2. **`npm run manuales`** (`rag/manuales.js` and `conocimiento/manuales.json`): downloads the official Dell Latitude 3120 manuals into the git-ignored `conocimiento/privado/`, because they are copyrighted and must not be committed. Only https from an allow-listed host, only into `privado/`, only `.pdf`, checks the `%PDF-` signature and a minimum size, writes to a `.parcial` file and renames, and skips what is already there.
  3. **`docs/supabase-cloud-setup.md`**, in English as the project requires for new documentation: create the project, run the three SQL files in order, copy the URL and the secret key (never the publishable one), configure `.env`, verify, download the manuals, index (254 passages expected), try the search, run Kerni, plus team notes (one shared project, the secret key gives full access, rotate it if it leaks), free-tier pauses and a troubleshooting table.
- The Supabase client now tolerates a URL pasted with `/rest/v1` or spaces, a common mistake when copying it from the dashboard.
- A test keeps the guide honest: it must name every migration in the repo in order and only mention npm commands that exist.

## Verification
- Backend 218 tests (20 new: key types, URL normalization, every verification step with a fake database including the failures, the real manifest, rejected downloads and the guide checks).
- Real runs: `probar-supabase` against the local project says everything is `OK` with 254 passages in 8 documents; with a publishable key, a bad cloud URL and a `/rest/v1` suffix it gives the right advice. `manuales` downloaded the two real PDFs with Node in 12.6 s to a temporary folder (28 MB, exact byte sizes of the files already indexed) and did not download again on the second run.
- **Not run against a real Supabase Cloud project**: none exists yet. The SQL is the same as the local stack uses, but cloud-specific behaviour (the dashboard labels, the key formats, pausing) is described from documentation and must be confirmed by the teammate when creating the project.
