# Liquid Glass style for Kerni

## Request

Restyle the Kerni desktop frontend in stages, waiting for approval between stages. Keep the product target on Windows/WebView2 while developing on Linux. For Stage 1, create a CSS-only simulated glass treatment for the greeting bubble, chat, HUD, and contextual menu, with an adjustable tint, a static reflection, a lightweight mode, and reduced-motion support. Measure idle CPU before and after; do not change frontend logic or the Rive rig.

## Decisions

- Added the `glass` class only to the four requested surfaces; kept the solid turquoise Send button.
- Added `--glass-alpha`, a tinted layered background, edge treatment, deep shadow, and static reflection.
- Added `html.modo-ligero` styles for a solid translucent fill without the reflection or backdrop filter.
- Removed CSS `backdrop-filter` after a 30-second comparison showed higher CPU in the filtered state, while GNOME/Wayland could not blur the desktop. Native Windows window effects remain a separate, unapproved Stage 2.
- Preserved the existing reduced-motion mascot rules and disabled control transitions under `prefers-reduced-motion`.
- Did not edit JavaScript or Rive assets; did not stage or commit changes.

## Verification

- Confirmed `~/web-respaldo` exists and matched `src/desktop/web/` before edits.
- Environment: GNOME on Wayland. The Tauri window ran locally with Vite; visual behavior on Windows remains for the user to verify.
- Before-edit `ps` snapshots for the Tauri parent were 9.4% then 9.2% CPU and about 169 MB RSS. `ps %cpu` is a lifetime average and that reading did not include WebKit's child process.
- 30-second CPU samples (Kerni process plus WebKitWebProcess): 102.3% with CSS backdrop filtering, 77.5% in lightweight mode, and 82.3% after removing the filter. Measurements include the existing animated character.
- `npm run web:build` and `npm test` passed from `src/desktop`.
