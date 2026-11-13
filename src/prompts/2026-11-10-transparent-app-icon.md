# Transparent app icon

## Request
Make Kerni's icon a PNG without a background, so only the character shows.

## Decisions
- The old icons were the character render on a solid dark gray square (29, 29, 29), so there was nothing to cut out cleanly. The Rive CLI that renders the scene cannot be used here: the installed one is 1.6.0 and the project needs 1.9.2, and updating it means installing software, which was not asked for.
- Instead the character is drawn the way the app draws it: the web runtime (`@rive-app/canvas-single`) plays `web/assets/kerni.riv` on a canvas with no fill, in idle mode, and the canvas is read back as a PNG with real alpha. A throwaway local server on port 8801 served the runtime and received the image; it was stopped afterwards and nothing from it is in the repo.
- Cropped to the character, centered with a 6 % margin and scaled with premultiplied alpha, so the edges have no dark or light halo. Written over the same files `tauri.conf.json` already lists: `icon.png` (512), `128x128@2x.png` (256), `128x128.png`, `32x32.png` and `icon.ico` (16, 24, 32, 48, 64, 128 and 256).
- The landing page keeps its own `assets/kerni.png` (its dark rounded frame comes from the CSS). It was not touched.

## Verification
- Checked on a light and a dark background: clean edges, no gray remains. Small sizes (32 and 48 px) read well; 16 px is blurry only because of its size.
- The corner pixel of every file has alpha 0. Front tests still pass (255).
- Not checked: how it looks in the real taskbar and in the installer. `Kerni.bat` does not watch the icons folder when deciding to recompile, so the app needs `Kerni.bat build` to pick them up, and Windows can keep showing the old icon from its cache for a while.
