# PR #21: bring main into the welcome screen and installer branch

## Request
After the Dependabot PRs were merged, make PR #21 mergeable again (GitHub said `dirty`).

## Decisions
- **Four conflicts, one real.** `README.md` (prompt index): all four rows kept. `.env.example`: kept the branch's explanation of who decides (the `.env` or the app settings) with main's new fallback text, and dropped the old sentence saying the chat would not start. `desktop/web/intenciones.js`: main's two new exception rules stay, and the repeated `ver_programas_sin_uso` line that the branch had removed does not come back. `app.js`: `/health` keeps the branch's dynamic-provider check (`provider.activo !== false`) and main's `aviso`.
- **The semantic conflict git did not report.** The branch wraps the real provider in a dynamic one that can be changed live from the welcome screen. The notice "LLM_PROVIDER has no key, using another" is set on the real provider, so the wrapper hid it and `/health` would have lost the `aviso`. `crearProveedorDinamico` now exposes `aviso` of the provider that is active and drops it when the provider changes or the person goes without AI.
- No push to main and no merge of the PR: that stays in the person's hands.

## Verification
- On the merged branch: backend 593 tests (3 new in `ia-aviso-dinamico.test.js`), front 246, Rust 102. Real run of the branch's backend with `LLM_PROVIDER=anthropic` and an empty key: console warning, and `/health` with the `aviso` through the dynamic provider.
- Not tried in the compiled window (welcome screen, installer bundling).
