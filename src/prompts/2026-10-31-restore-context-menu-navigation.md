# Restore contextual menu navigation

## Request

Restore the contextual-menu reorganization after it was accidentally overwritten, so all “Más herramientas” options can be reached.

## Decisions

- Restore separate main-menu and tools-menu views, with a persistent “Volver al menú” option and bounded scroll.
- Keep menu positioning responsive so both views stay within the fixed window.
- Restore the memory panel and chat status elements that the current JavaScript already expects, preventing missing-element errors.
- Preserve the existing appearance and the option handlers.

## Verification

- Desktop: `npm test` — 105 passed.
- Desktop: `npm run web:build` — passed; Vite reports the existing large-chunk advisory.
- `git diff --check` — passed.
- The submenu was previously verified at 320×620 in all four corners; rerun the manual Windows WebView2 check in `docs/windows-ui-smoke-test.md`.
