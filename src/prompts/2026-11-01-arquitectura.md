# Architecture guide (Markdown and PDF)

## Request

Write a concise technical guide of how the architecture works, then turn it into a PDF. Later, the diagram rendered badly as plain text in the PDF, so it was redone as an SVG.

## Decisions

- Written in English, as AGENTS.md rule 10 asks for new documentation.
- The diagram is a standalone SVG (`docs/architecture.svg`) embedded in the PDF. The Markdown keeps only a reference, so it reads well on GitHub and in the PDF.
- The PDF is generated with a small local converter and headless Edge, from outside the repo. No new dependency was added.
- The guide describes the code as it stands; it does not list pending work except in "Known limits".

## Verification

- Routes and ports were checked with grep in `src/backend/src` (`app.get` / `app.post` and the `127.0.0.1:8788` binding).
- The PDF was rendered and read back page by page to check layout and the diagram.
