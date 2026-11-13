# Business idea and features PDF

## Request
A PDF that condenses Kerni's business idea and its features.

## Decisions
- New file `docs/kerni_idea_de_negocio_y_funcionalidades.pdf` (3 pages, Spanish like the other PDFs in `docs/`), same visual style as the questions guide.
- Sources: the original proposal PDF (CyberPet AI), the presentation guide, `AGENTS.md` and a check of the code. Every feature and number was taken from the repository: 23 actions (16 read-only, 2 that open a Windows window, 5 that change something), 23 settings pages, 27 documents and 452 fragments, 967 automated tests (609 + 255 + 103).
- The original proposal promised more than exists, so section 6 is a table "Hecho / Parcial / Pendiente". Not built: Office secretary, winget installer, Google Calendar, local search, translator, power-plan changes and file-hash scanning. The XP system exists but only rewards learning, and there are no visual evolution branches.
- The repository has no business model, prices or market data. Section 4 separates what is true today (free app, each person's own AI key, no server of its own) from hypotheses clearly labelled as undecided (institutional deployments, manual packs per laptop model, the support report as an entry to a service). No figures were invented.
- Risks listed on purpose: Gemini's free daily quota, the unsigned installer, the Microsoft Learn terms (personal, non-commercial use) and the single laptop model with manuals.
- The generator script is not in the repo; the PDF is the source.

## Verification
- Read the rendered PDF: three pages, tables fit, no cut text. A table whose first column came out bold was fixed.
- Not checked by a person: the hypotheses in section 4 are mine and need the team's agreement before the PDF is shared.
