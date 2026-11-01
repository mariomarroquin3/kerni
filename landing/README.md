# Kerni landing page

Static download page for Kerni (Spanish, for El Salvador). Plain HTML and CSS: no build step, no framework, no external fonts, no trackers, no cookies, no JavaScript.

| File | What it is |
|---|---|
| `index.html` | The page: hero with the download button, features, safety, install steps, Anthropic key, FAQ |
| `styles.css` | Colors as CSS custom properties on `:root`, with a dark-mode override (`prefers-color-scheme: dark`) |
| `assets/kerni.png` | Kerni in idle mode, 480 x 480 (resized from `src/desktop/personaje/kerni-rive/fuente/build/modo_idle.png`) |

The download button points to `https://github.com/mariomarroquin3/kerni/releases/latest`, so it keeps working whatever the installer file is called. Releases are created by `.github/workflows/release.yml` when a `v*.*.*` tag is pushed.

## Preview locally

Open `landing/index.html` directly in a browser (it works from `file://`), or serve the folder:

```bash
cd landing
python -m http.server 8000      # or: npx serve .
# open http://localhost:8000
```

Check it at 360-390 px wide (browser dev tools, device mode) and in both light and dark mode.

## Publish with GitHub Pages

The repository owner has to enable Pages once; nothing in this folder does it automatically.

1. On GitHub: **Settings > Pages**.
2. Under **Build and deployment > Source**, pick one:
   - **GitHub Actions**, with a Pages workflow that uploads the `landing/` folder (not included in this repo yet; add it deliberately, pinning action versions), or
   - **Deploy from a branch**. Branch deploys only serve `/` or `/docs`, so push the contents of `landing/` to a dedicated branch (for example `gh-pages`, with `index.html` at its root) and select that branch with folder `/`.
3. Save. The page will be at `https://mariomarroquin3.github.io/kerni/`.

All paths in the page are relative, so it works from a project subpath.

## Keeping it honest

The page only describes features that exist in the app. Two things are marked **Próximamente** because they are not built yet: the "Configurar llave" screen in Kerni and storing the key in the Windows Credential Manager. The page also says that the downloadable installer does not include the backend yet, so chat does not work from a downloaded install. Update those notes when that changes. The page must never ask for the API key or show a form for it.
