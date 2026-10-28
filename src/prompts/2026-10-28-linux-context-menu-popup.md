# Fix Linux contextual menu popup warnings

## Request
Resolve the GTK/GDK warnings printed when launching the desktop app on Linux.

## Decisions
- Anchor the native context menu at the browser event's logical coordinates so GTK parents the popup to Kerni's window instead of the root window.
- Keep the existing AppHandle-based lookup of the Kerni window.
- Treat the AppIndicator deprecation and scale-factor critical as Linux tray-backend diagnostics from Tauri's dependency, separate from the context-menu popup path.

## Verification
- `npm --prefix src/desktop test`: 65 passed.
- `cargo test --manifest-path src/desktop/src-tauri/Cargo.toml`: 18 passed, 1 ignored.
- `git diff --check`: passed.
- `cargo fmt --manifest-path src/desktop/src-tauri/Cargo.toml -- --check`: reports existing formatting differences across Rust files; no repository-wide reformat was applied.
