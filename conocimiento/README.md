# Knowledge base

Documents Kerni searches by meaning (RAG, Supabase + pgvector). Index them with `npm run indexar` in `src/backend`.

- `.md`, `.txt` and text `.pdf` (each PDF page becomes a "Página N" heading, so answers can cite the page; scanned PDFs need OCR first). Headings (`#`, `##`) become the title of each passage, so use them.
- The folders here are written for Kerni and can be committed.
- The official Dell Latitude 3120 manuals are listed in `manuales.json` and downloaded with `npm run manuales` (in `src/backend`) into `privado/`; to add another downloadable manual, add an entry there (https only, from `dl.dell.com`).
- Put your own manuals (Office guides, vendor PDFs converted to text, etc.) in `privado/`: it is git-ignored because they may be copyrighted.
- Re-running the indexer only embeds passages that changed and removes the ones you deleted.
- Suggested layout for your own manuals: `privado/dell-latitude-3120/`, `privado/office/`, `privado/windows/`. Run `npm run indexar -- --simular` first to see how many passages (and embedding calls) they will take.
