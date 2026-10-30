# Glass context-menu regression fix

## Request

Compare the original and Stage 1 frontend snapshots after a Windows report that the context menu rearranged Kerni's UI and the approval card lacked the glass style. Fix the regression without changing frontend logic or the Rive rig, keep every surface filter-free, and verify the desktop build and tests.

## Decisions

- The Stage 1 `.glass` selector assigned `position: relative` to `#menu-contextual.glass`, overriding the more general `#menu-contextual { position: fixed }` because the former has greater specificity. This changed the menu from viewport positioning to relative positioning in document flow.
- Replaced the glass reflection pseudo-element with static layered `background-image` gradients so it cannot participate in positioning or overlay menu content.
- Applied the existing `glass` class to every `.tarjeta`, including `#confirmar`, and included `.tarjeta.glass` in the shared surface styling.
- Left `main.js`, other JavaScript, and Rive assets unchanged. The existing context-menu handler clamps its fixed menu coordinates to the viewport.
- No `backdrop-filter` or other filters were added.

## Verification

- Compared `~/web-respaldo` and `~/web-etapa1` with `src/desktop/web/`; the latter matched the pre-fix current frontend.
- Verified the root cause in CSS and the unchanged context-menu handler in `main.js`.
- `npm run web:build`: passed.
- `npm test`: 103 passed, 0 failed.
- `git diff --check`: passed.
- Windows visual testing remains with the user.
