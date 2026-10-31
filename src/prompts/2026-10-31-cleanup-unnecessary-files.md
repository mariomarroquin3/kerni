# Cleanup unnecessary files

## Request

Delete unnecessary and obsolete files within the project.

## Decisions

- **Removed `Convertir a Markdown/` (`libros_a_md.py` & `readme.md`)**: this was an ad-hoc Python script committed earlier for book/document conversion. Kerni has its official native Node.js PDF-to-Markdown converter (`src/backend/src/rag/convertir.js` and `npm run pdf-a-md`), which formats headings specifically for RAG (`## Página N`). The Python script was completely unreferenced and duplicated functionality with an untracked Python dependency stack.
- **Removed `src/desktop/src-tauri/tauri.glass.conf.json`**: unused orphan test configuration file from earlier Acrylic window experiments; Tauri runtime only reads `tauri.conf.json`.
- **Removed empty debris folders**: deleted untracked empty `.claude/` and `src/backend/evals/` directories.
- **Removed `.env.respaldo`**: deleted obsolete local backup copy in `src/backend/`.
- **Updated `.gitignore`**: added `.claude/` to avoid tracking agent workspace cache folders.

## Verification

- Backend tests: `npm test` in `src/backend` — 280 passed.
- Desktop tests: `npm test` in `src/desktop` — 105 passed.
- Rust tests: `cargo test` in `src/desktop/src-tauri` — 34 passed (1 ignored).
- Verified no broken references across the repository with `git grep`.

