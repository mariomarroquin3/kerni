# Reorganize the contextual menu

## Request

Fix the right-click menu so the person can reach and scroll through all options under "Más herramientas".

## Decisions

- Replace the inline expanded list with a separate submenu view and a persistent "Volver al menú" action.
- Give the submenu its own bounded vertical scroll area so the main menu stays short.
- Reposition the menu after changing views so it remains inside the fixed window.
- Keep each existing menu action and its routing unchanged.

## Verification

- Desktop: `npm test` — 105 passed.
- Desktop: `npm run web:build` — passed; Vite reports the existing large-chunk advisory.
- `git diff --check` — passed.
- Checked the submenu in a 320×620 browser viewport at all four corners; it stayed in bounds, scrolled to the final option, and returned to the main menu.
- Native Windows WebView2 verification remains a manual step using `docs/windows-ui-smoke-test.md`.