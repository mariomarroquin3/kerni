# Liquid Glass styling and UI micro-interactions (Phase 2)

## Request

Improve the user interface experience and aesthetics of Kerni focusing on Liquid Glass surfaces, subtle animations, and visual health indicators.

## Decisions

- **Visual Health Indicator in the HUD**: Added a header with an status badge (`#salud-badge` and `#salud-texto`) to the HUD. It displays a real-time glowing pulse dot with 3 levels according to system workload:
  - Óptimo (teal glow): Normal operation.
  - Atención (amber glow): Moderate to high workload (CPU ≥ 70%, RAM ≥ 75%, or Disk ≥ 85%).
  - Exigido (crimson pulsing glow): Critical stress (CPU ≥ 90% or RAM ≥ 90%).
- **Fluid text typing (Typewriter Effect)**: Added a smooth letter-by-letter reveal animation in `decir()` so Kerni writes naturally. If `prefers-reduced-motion` is active or the text is short (≤ 15 characters), it renders instantly. Strictly uses `textContent` (no `innerHTML`), and properly cancels upon mouse clicks, hiding the balloon, or new incoming messages.
- **Liquid Glass entrance animations**: Added `aparecerSuave` animation (scale + subtle translate + opacity) for the message balloon (`#globo`), cards (`.tarjeta`), and context menu (`#menu-contextual`).
- **Context menu item hover highlight**: Added an accent indicator line (`box-shadow: inset 2px 0 0 var(--acento);`) with subtle padding shift on button hover.
- **Liquid Glass custom scrollbars**: Added slim, semi-transparent rounded scrollbars for inner lists and submenus matching the dark glass theme.
- **Accessibility**: All animations honor `@media (prefers-reduced-motion: reduce)`.

## Verification

- Desktop unit & integration tests: `npm test` in `src/desktop` — 106 passed (1 new integration test for HUD health badge).
- Desktop build: `npm run web:build` in `src/desktop` — succeeded.
- Backend tests: `npm test` in `src/backend` — 280 passed.
- Rust tests: `cargo test` in `src/desktop/src-tauri` — 34 passed (1 ignored).
- Verified strict adherence to Rule 4 (all dynamic text populated with `textContent`, zero `innerHTML`).

