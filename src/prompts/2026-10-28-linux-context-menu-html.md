# Replace the GTK contextual popup with an in-window menu

## Request
Right-click still produced `gtk_widget_get_scale_factor` and repeated GDK popup-parent warnings after switching the native popup API.

## Decisions
- Remove the native GTK popup from the mascot's right-click path and show an accessible HTML menu inside the existing Tauri window.
- Keep the native system-tray menu and its actions unchanged.
- Keep the GTK/AppIndicator startup warnings distinct from the contextual-menu fix; they may still originate in Tauri's Linux tray backend.

## Verification
- `npm --prefix src/desktop test`: 65 passed.
- `cargo test --manifest-path src/desktop/src-tauri/Cargo.toml`: 18 passed, 1 ignored.
- `git diff --check`: passed.
- Manual Linux verification is still required to confirm the contextual menu remains visible and the popup-parent warnings stop.
