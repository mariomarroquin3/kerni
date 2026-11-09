# Repo review, remote branch rename and the AI provider fallback

## Request
Review the repo for bugs and improvements and check the Gemini key; then review the remote branch created by an AI session, rename it if possible, and implement the improvements proposed.

## Findings
- **Gemini key.** `GEMINI_API_KEY` in the local `.env` is valid (Google answered 200 for the model list and for `gemini-3.5-flash-lite`, without spending generation quota). Kerni was not using it: `LLM_PROVIDER=anthropic` with an empty `ANTHROPIC_API_KEY` made the backend start with no model (local rules only). Set to `gemini` and verified with a real request.
- **main** passes backend 557, front 227 and Rust 87 after the Dependabot merges. `unpdf` 2.x extracts the same text as 1.x from both Dell manuals. Anthropic SDK 1.3 sends `Authorization` instead of `x-api-key` and a newer `anthropic-version`; not verified against the real API (no Anthropic key).
- **Remote branch `claude/audit-model-calls-g4vq53`** (welcome screen to choose the AI service and paste a key, bundled Node + backend in the installer, `Cambiar IA…` menu). Reviewed: it is up to date with main and passes backend 576, front 235 and Rust 92; no open PR. The key is stored as plain JSON in the Kerni data folder (mode 0600 is ignored on Windows, so it relies on the user's AppData permissions), `GET /ajustes` never returns it, errors redact it, the test endpoint only talks to the three fixed providers, Host and CORS filters apply, and the downloaded `node.exe` is checked against the SHA-256 published by nodejs.org. Its exit change keeps the forced exit thread armed first. Nothing blocking; storing the key with Windows DPAPI would be a good hardening step. It is not merged. **Renamed** to `feat/welcome-screen-and-installer` (same commit `c922ec6`; the old name was deleted).
- Known and accepted: a `Co-authored-by: Copilot` trailer in `d0b7a62` (John) and several author names for the same email.

## Decision
- **Provider fallback.** If `LLM_PROVIDER` asks for a provider without a key and another one has it, the backend uses that one and says so: a console `AVISO`, a new `aviso` field in `/health`, and the detail of the "Con IA" chip. With no key at all, or an unknown name, it still fails with the clear message. `elegirProveedor` is unchanged. `.env.example` explains it.

## Verification
- Backend 564 tests (7 new), front 231 (4 new). Real run of the original misconfiguration: console warning, `/health` with `aviso` and the chip detail. Not run in the compiled window.
