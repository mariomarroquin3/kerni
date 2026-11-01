# Expand RAG knowledge base for Windows troubleshooting and security (Phase 1)

## Request

Add practical guides to Kerni's knowledge base (`conocimiento/windows/`) to cover frequent Windows operational issues, network/Wi-Fi troubleshooting, and cybersecurity guidance.

## Decisions

- **Added `conocimiento/windows/solucionar-problemas.md`**: Structured in 6 Markdown sections (`##`) covering:
  - 100% disk usage in idle (SysMain, Windows Search, HDD wear vs. SSD recommendation).
  - Internet / Wi-Fi drops (router resets, `ipconfig /flushdns`, `ipconfig /renew`, `netsh winsock reset`).
  - Stuck Windows Update (`wuauserv` service management, download cache cleanup).
  - Blue Screen of Death (BSOD) and unexpected restarts (driver conflicts, overheating, `mdsched.exe`, `sfc /scannow`).
  - Frozen applications (disk wait, Alt + F4, task manager).
  - Sound and microphone troubleshooting (audio output devices, privacy permissions).
- **Added `conocimiento/windows/seguridad-y-privacidad.md`**: Structured in 5 Markdown sections (`##`) covering:
  - Recognizing phishing attempts and deceptive URLs (fake domains, urgency tactics, `@` redirects).
  - Windows Defender (`MsMpEng.exe`) real-time protection and why third-party antivirus overlap slows down PCs.
  - Password management and two-factor authentication (2FA).
  - App privacy permissions (camera, microphone, background app toggle).
  - Safe downloads avoiding bundleware and deceptive optimizers.
- **Tone and Style**: Clear, non-technical, friendly Salvadoran voseo, strictly zero emojis as required by Kerni guidelines.
- **RAG Chunking**: Each section breaks into clean ~60-900 character chunks, adding 11 new granular passages across the 2 new documents.

## Verification

- Indexer simulation: `npm run indexar -- --simular` in `src/backend` — 12 documents, 293 passages successfully recognized.
- Backend tests: `npm test` in `src/backend` — 282 passed.
- Desktop tests: `npm test` in `src/desktop` — 106 passed.
- Desktop build: `npm run web:build` in `src/desktop` — succeeded.
- Rust tests: `cargo test` in `src/desktop/src-tauri` — 34 passed (1 ignored).
