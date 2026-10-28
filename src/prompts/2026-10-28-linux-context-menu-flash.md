# Keep the Linux contextual menu open on right-click

## Request
The native menu appeared only briefly when right-clicking Kerni on Linux. Startup logs included an AppIndicator deprecation warning and a GTK scale-factor critical.

## Decisions
- Use Tauri's native `popup_menu` so GTK places the context menu at the pointer without passing WebView-relative coordinates through the GTK scale-factor path.
- Keep the menu native and preserve the existing actions and visibility label.
- Treat the AppIndicator deprecation warning as a separate dependency diagnostic; the GTK runtime behavior still needs confirmation in the user's Linux session.

## Verification
- `npm --prefix src/desktop test`: passed.
- `cargo test --manifest-path src/desktop/src-tauri/Cargo.toml`: passed (18 passed, 1 ignored).
- `git diff --check`: passed.
- Manual Linux GUI verification is still needed to confirm the menu remains open and whether the GTK critical is gone.
