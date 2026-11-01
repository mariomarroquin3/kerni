# Claude Code project skills for the development workflow

## Request

Analyze how Kerni is developed and turn the key processes into Claude Code project skills under `.claude/skills/`, with explicit connections between them, following AGENTS.md as the source of truth.

## Decisions

- Seven skills, each a single `SKILL.md` (no scripts or extra references needed):
  - `kerni-add-action`: rule 5 end to end (`acciones.js`, `persona.js`, `intenciones.js`, Rust in `sistema.rs` / `herramientas.rs` + both `generate_handler!` lists in `lib.rs`, card in `herramientas.js` / `main.js`, tests in each layer). Uses `ver_dispositivos_red` as the read-only precedent and `vaciar_papelera` for irreversible actions.
  - `kerni-protected-processes`: rule 3, the two lists (`PROCESOS_PROTEGIDOS`, `PROTEGIDOS`) and their tests. Notes that no test compares the two lists today.
  - `kerni-untrusted-data`: rule 4 (`limpiarNombre`, `sanearParaBloque`, `<sistema>` / `<memoria>` / `<reflexiones>` / `<conocimiento>`, `textContent`).
  - `kerni-commit-workflow`: three test suites, this prompt log format, rules 6, 8, 9 and 10. It is the hand-off target of every other skill.
  - `kerni-llm-provider`: provider choice, `npm run probar-llm`, quota pitfalls, provider tests. Notes that `.env.example` ships with `LLM_PROVIDER=gemini`.
  - `kerni-rag-knowledge`: local Docker or Supabase Cloud, `manuales`, `pdf-a-md`, `indexar` (`--simular`, `--buscar`), `probar-supabase`, per-model manual folders.
  - `kerni-test-real-app`: browser demo query parameters, `Kerni.bat` modes, `Kerni-nube.bat`, `probar-tauri.mjs` over CDP and `docs/windows-ui-smoke-test.md`.
- Each skill ends with a "Related skills" section that says when to hand off; every code-changing skill points to `kerni-commit-workflow` last.
- Skill text is in English (rule 10); Spanish identifiers, file names and user-facing strings are kept as in the code. Only commands that exist in AGENTS.md or the `package.json` files are used.
- Rive rig regeneration was left as a pointer to `src/desktop/personaje/kerni-rive/README.md` instead of a separate skill, because it is rare and already documented step by step.

## Verification

- Every file path and symbol cited in the skills was checked against the repo (Glob/Grep), including `describirNueva`, `direccion_de_ajuste`, `cerrar_proceso`, `quitarBloquesInternos`, `SIMILITUD_MINIMA` and the demo query parameters in `web/main.js`.
- No source code was changed, so the test suites were not run. Nothing was committed.
