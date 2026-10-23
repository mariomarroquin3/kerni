# DPI-agnostic interactive zones and mouse dragging

## Request
Fix window dragging on non-touch screens (mouse drag was not working) and resolve click/drag dead zones occurring on computers with different DPI scaling (input fields not receiving focus or dragging triggered outside the expected area).

## Findings
- **Mouse drag:** The Rive canvas captures pointer events over `#mascota`, preventing native `data-tauri-drag-region="deep"` from receiving mouse drag events.
- **DPI mismatch:** Rust's `sobre_zona` previously compared physical pixel cursor positions with bounding client rects. Scaling rects by `devicePixelRatio` or dividing by `scale_factor` produced discrepancies on high-DPI displays or multi-monitor configurations, misaligning clickable regions (.zona) and causing transparent regions to intercept clicks or blocking input focus in the chat input.

## Decisions
- **Explicit window dragging on pointerdown:** Call `getCurrentWebviewWindow().startDragging()` inside `pointerdown` on `#mascota` if `e.button === 0`.
- **DPI-agnostic hit testing in JS:** Move hit testing to the web view using `document.elementFromPoint()`. Rust samples the physical cursor position (`cursor_position` − `inner_position`) and emits `cursor-movio` to JS. JS divides by `window.devicePixelRatio` and checks `el?.closest('.zona') !== null`, updating Rust via `set_interactivo`. Rust applies `set_ignore_cursor_events(!interactivo)`.
- Eliminates manual coordinate math in Rust and guarantees precise pixel-perfect hit testing regardless of screen DPI.

## Verification
- Desktop tests: 45 passed (`npm test` in `src/desktop`).
- Native tests: 6 passed (`cargo test` in `src/desktop/src-tauri`).
- Backend tests: 150 passed (`npm test` in `src/backend`).
