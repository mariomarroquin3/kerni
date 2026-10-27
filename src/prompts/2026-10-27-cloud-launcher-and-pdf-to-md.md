# Cloud launcher and a PDF to Markdown converter

## Request
After the shared Supabase Cloud project was created and indexed: a `.bat` that runs Kerni with the knowledge base from Supabase, and a module that converts PDFs to `.md`.

## Decisions
- **Indexing on the real project.** The teammate's project was configured in the git-ignored `src/backend/.env`; `probar-supabase` passed (hybrid search is still optional and pending) and `indexar` stored 254 passages. The key was pasted in the chat, so the advice is to rotate it after testing.
- **`Kerni-nube.bat`**: checks that `SUPABASE_URL` points to `*.supabase.co` and the secret key is set, runs `probar-supabase`, and only then calls `Kerni.bat`. It never starts Docker. `check` only verifies.
- **`Kerni.bat` detects the cloud by itself**: if `.env` has a Supabase Cloud URL it skips Docker (it was starting a local stack the backend no longer used).
- **`npm run pdf-a-md`** (`rag/convertir.js`): reuses `textoDePdf`, so the output has the same `## Página N` headings the indexer already produced, plus a title and a source line. Accepts a file or a folder, `--salida` for another folder, `--sobrescribir` to redo. It never overwrites a `.md` that may have been edited by hand, writes through a `.parcial` file, does no OCR (scanned PDFs are reported) and one failing file does not stop the rest.
- **`indexar` uses the `.md` and skips the `.pdf` next to it**, so a converted manual is not indexed twice. Converting the two Dell manuals already indexed would change their source name and re-embed them, so they were converted only into a temporary folder to check the output.

## Verification
- Backend 224 tests (6 new in `test/convertir.test.js`: title, output paths, page headings that fragment correctly, no overwrite, scanned and broken PDFs, listing).
- Real run: both Dell manuals converted (92 and 26 pages) to a temporary folder, output read by hand and deleted. `Kerni-nube.bat check` exits 0 against the real project and prints the hybrid-search warning; `Kerni.bat check` reports the cloud and no Docker. Both files are ASCII with CRLF.
- Not tested: opening the full app through `Kerni-nube.bat` (only `check`).
