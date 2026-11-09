# Installer release: bundle the backend, fix the notes and the landing

## Request
After PR #21 (welcome screen and installer with the backend) was merged: what is missing, is it the installer? Fix it and test a local installer with the backend inside; do not publish a release.

## Findings
- **`release.yml` did not run `npm run backend:preparar`** (only `build-windows.yml` did), so the installer GitHub would publish had no Node and no backend, and its release notes still said "the chat does not work". The landing said the same, and described the key screen as "Próximamente" and the chat as Anthropic-only.
- No release or tag exists yet (version 0.1.0).

## Decisions
- `release.yml`: new step `npm run backend:preparar` before `tauri build`; comment and release notes rewritten (backend and Node included, first run asks for the AI service and the person's own key, or "seguir sin IA", the key stays on the PC).
- Landing: the key section now lists Gemini, OpenRouter and Anthropic with where to get each key and what it costs, explains the welcome screen and the tray menu entry "Cambiar IA o llave…", says where the key is stored, and keeps one honest "Próximamente": storing it in the Windows Credential Manager. Hero note, intro, memory paragraph and two FAQ answers no longer say Anthropic only. `landing/README.md` updated.
- No tag and no release were created: publishing stays in the person's hands.

## Verification (local, real)
- `backend:preparar` downloaded Node 22.23.4 and checked its SHA-256 (83 MB); `tauri build` produced `Kerni_0.1.0_x64-setup.exe` (28 MB) and `Kerni_0.1.0_x64_en-US.msi` (46 MB).
- The MSI file table has `kerni.exe`, `node.exe` (83 MB), `server.js` and 7427 files. The NSIS installer was run silently into a test folder: 129 MB installed with the app, Node, the backend and its production dependencies.
- The installed app, with an empty data folder and no keys in the environment, started its own backend (`/health` answered), showed the welcome screen with the three services and a password field, "Seguir sin IA" was saved to `ajustes.json` and kept, and `salir_de_kerni` closed the app and the bundled Node (port 8788 free, no process left). Then it was uninstalled (no entry left in Installed apps) and the folders were deleted.
- Not verified: pasting a real key in the welcome screen of the installed app, SmartScreen behavior (the installer is not signed), and running the workflow on GitHub.

## Notes
- `unpdf` 2.x declares `engines.node >= 24`, while the bundled Node is 22. It only warns, and the running backend never loads it (only `indexar` and `pdf-a-md` do), so nothing breaks; moving it to `devDependencies` would also shrink the installer.
- In the screenshot the status chip said "Sin conexión con Kerni" because the window asked `/health` before the bundled backend was up; worth checking that it retries.
