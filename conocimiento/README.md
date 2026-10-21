# Knowledge base

Documents Kerni searches by meaning (RAG, Supabase + pgvector). Index them with `npm run indexar` in `src/backend`.

- Plain `.md` / `.txt`. Headings (`#`, `##`) become the title of each passage, so use them.
- The folders here are written for Kerni and can be committed.
- Put your own manuals (Office guides, vendor PDFs converted to text, etc.) in `privado/`: it is git-ignored because they may be copyrighted.
- Re-running the indexer only embeds passages that changed and removes the ones you deleted.
