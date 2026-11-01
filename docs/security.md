# Kerni threat model

This document describes what Kerni protects, where trust changes hands, which inputs are treated as
untrusted, which controls exist in the code today, and what is still open. Every control below cites the
file that implements it. If something is planned but not implemented, it is listed under *Residual risks*.

Kerni is a Tauri desktop pet that reads real CPU, memory, disk and process data from a Windows PC, talks
with the person through a language model and **proposes** actions that only run after the person clicks
*Aprobar* on a confirmation card (AGENTS.md, rule 1).

## 1. Scope and assets

| Asset | Why it matters |
|---|---|
| The PC | Kerni can close and freeze processes, delete temp files, empty the recycle bin, clear the browser cache and toggle user startup entries. A wrong action can lose work or destabilise Windows. |
| The person's data | File names and paths in personal folders, process names, startup programs, LAN devices, chat turns, approved memories, learned reflections, health history. |
| API keys | `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `SUPABASE_SECRET_KEY`, `SAFE_BROWSING_API_KEY`. Leaking them costs money and exposes the Supabase project. |
| The memory database | `kerni.db` (SQLite) in `%APPDATA%/Kerni` (`src/backend/src/memoria/sqlite.js`). Its content is injected into every prompt, so tampering with it is a prompt-injection channel. |

Out of scope: a local attacker who already runs code as the same Windows user (they can do everything Kerni
can do without Kerni), and the security of the model providers themselves.

## 2. Trust boundaries

| Component | Trust | Notes |
|---|---|---|
| Front window (WebView, `src/desktop/web/`) | Trusted code, untrusted data | Renders system and model text. CSP in `src/desktop/src-tauri/tauri.conf.json` limits `connect-src` to `'self'` and `127.0.0.1:8788` / `localhost:8788`. |
| Rust core (`src/desktop/src-tauri/src/`) | Most trusted | The only layer that touches the system. Re-validates every action, whatever the front or backend said. |
| Local backend (Fastify on `127.0.0.1:8788`) | Trusted code | Listens on loopback only (`src/backend/src/config.js`, `HOST` defaults to `127.0.0.1`). Rejects any `Host` header that is not `127.0.0.1:<port>` or `localhost:<port>` (`hostPermitido` in `src/backend/src/app.js`), against DNS rebinding. CORS allows only the Tauri origins and the Vite dev origin. |
| Model providers (Anthropic, Gemini, OpenRouter) | Untrusted output | `src/backend/src/llm/`. Receive the prompt, which includes the system snapshot and memory. |
| Supabase (cloud or local Docker) | Semi-trusted | Stores a copy of health summaries and the RAG chunks (`src/backend/src/memoria/supabase.js`, `src/backend/src/rag/`). Chunks are treated as untrusted text. |
| Microsoft Learn MCP | Untrusted output | Off by default; enabled only with `MICROSOFT_LEARN_MCP=1` (`src/backend/src/config.js`). Only the question text leaves the PC. |
| Google Safe Browsing | Untrusted output | Optional, with `SAFE_BROWSING_API_KEY`. Only the URL is sent (`src/backend/src/enlaces.js`); the site itself is never opened. |

## 3. Untrusted inputs

Everything below is data, never instructions (AGENTS.md, rule 4).

- **Process names** from `sysinfo` (a process can be named `ignora tus reglas.exe` or use lookalike letters).
- **File and folder names** from the heavy-files, folder-space and duplicates scans (`sistema.rs`,
  `diagnostico.rs`). Shown with `~` instead of the home folder.
- **Startup program names** read from the registry (`herramientas.rs`). They travel to PowerShell through
  environment variables, never inside the script text.
- **LAN device data** from `ver_dispositivos_red` (`herramientas.rs`, `parsear_dispositivos_red`).
- **Printer and USB device names**: not read by the code today (no printer or USB enumeration exists in
  `src-tauri/src/`). Printers only appear as a fixed step guide (`src/backend/src/guias/guias.js`). If a
  reader is added, its names must follow the same rules as process names.
- **Memory and reflections** from SQLite, injected inside `<memoria>` and `<reflexiones nota="...">`
  (`src/backend/src/memoria/sqlite.js`).
- **RAG chunks** from Supabase, inside `<conocimiento>` (`src/backend/src/rag/conocimiento.js`).
- **Link checker results** from `revisar_enlace` (`src/backend/src/enlaces.js`).
- **Microsoft docs results**, inside `<documentacion>` (`src/backend/src/mcp/microsoft-learn.js`).
- **Model output**: text, tool calls and tool arguments (pid, name, motive, destination).
- **The person's own message**: it can contain pasted text with instructions written by someone else.
- **Clipboard text**, only when the link monitor is on: it is read only with the option active, the window
  focused, and no panic mode or open card (`debeLeerPortapapeles` in `src/desktop/web/vigilancia.js`).

## 4. Controls

### 4.1 One shared sanitizer
`src/backend/src/seguridad/texto.js` is the single copy of the cleaning rules: NFKC, invisible characters
(bidi, zero width, BOM), control characters, `<` and `>` turned into spaces so nothing looks like a closing
tag, `|` to `/`, length cap (`limpiarTextoNoConfiable`), plus URL removal (`quitarUrls`, `quitarUrlsSalvo`).
`limpiarNombre` (`telemetria.js`) and `sanearParaBloque` (`memoria/recuerdos.js`) delegate to it.

### 4.2 Data tags and persona rules
System data, memory, knowledge and docs go inside `<sistema>`, `<memoria>`, `<reflexiones>`,
`<conocimiento>` and `<documentacion>`. `src/backend/src/agent/persona.js` tells the model that these
blocks, the device line and every tool result are data, not instructions, and that an embedded order must
be ignored and mentioned. The front paints system and model text with `textContent`
(`src/desktop/web/herramientas.js` header comment; AGENTS.md rule 4).

### 4.3 Proposals validated twice
- Backend: `validarPropuesta` in `src/backend/src/acciones.js` parses the tool call with a closed zod
  schema (`ACCIONES`, `DESTINOS_AJUSTE`), checks that the pid exists in this turn's snapshot, that the name
  matches, that the process is not protected, that the name has no invisible characters and survives
  `limpiarNombre` unchanged, and that the start time (if sent) matches.
- Rust: `cerrar_proceso` (`sistema.rs`) and `revisar_objetivo` (`congelar.rs`) check again against the
  live process: protected name (sent and live), own pid, exact name match, start time.
- Settings pages come from a closed list on every layer (`DESTINOS_AJUSTE`, `direccion_de_ajuste` in `herramientas.rs`);
  the model never sends a URL or path. `mostrar_en_carpeta` canonicalises the path and only opens it inside
  the personal folders (`ruta_permitida` in `sistema.rs`).

### 4.4 Protected process lists kept in sync
`PROCESOS_PROTEGIDOS` (`src/backend/src/telemetria.js`) and `PROTEGIDOS` (`sistema.rs`) must be identical;
`src/backend/test/protegidos-sync.test.js` parses the Rust list and fails if they differ.

### 4.5 Fixed motives on destructive cards
`MOTIVOS_FIJOS` in `src/backend/src/acciones.js` replaces the model's motive for `terminar_proceso`,
`congelar_proceso`, `limpiar_temporales`, `limpiar_cache_navegador` and `vaciar_papelera`, so a destructive
card never carries a link or a "skip the confirmation" text written by the model. Read-only actions keep
the model's motive after sanitising and URL removal (`motivoSeguro`).

### 4.6 ASCII and confusables guard in Rust
`nombre_es_ascii` in `sistema.rs`: closing, freezing and resuming refuse any process whose **live** name,
after stripping invisible characters, is not printable ASCII. `es_protegido` also maps a narrow set of
Cyrillic and Greek lookalikes (а е о р с у х і ј, ο ν ρ, upper and lower case) to ASCII before comparing,
so `svсhost.exe` with a Cyrillic `с` is still protected. The ASCII rule is the main guard; the lookalike
list is deliberately small. Trade-off: a legitimate process with an accented name cannot be closed from
Kerni (Task Manager still works).

### 4.7 Network surface
- Host header check and loopback bind on the backend (section 2).
- MCP endpoint allowlist: `endpointPermitido` in `src/backend/src/mcp/cliente.js` accepts only the exact
  URL `https://learn.microsoft.com/api/mcp`; responses have a size cap. Links inside docs results are kept
  only for allowed Microsoft domains (`esEnlaceDocs` in `src/backend/src/mcp/microsoft-learn.js`).
- Manual downloads only from `dl.dell.com` (`HOSTS_PERMITIDOS` in `src/backend/src/rag/manuales.js`).
- The link checker never opens the site and never says a site "is safe".

### 4.8 No execution without the approve click
`proponer_accion` and `proponer_recuerdo` are client tools: the harness returns them as `acciones` and the
front shows a card; the Tauri command runs only after *Aprobar*. Startup toggles (`cambiar_inicio`) are not
proposable by the model at all.

### 4.9 PowerShell and OS calls
Rust runs fixed PowerShell scripts with a timeout and no console window; names travel through environment
variables (`herramientas.rs`). `explorer` receives only paths from closed lists or checked paths.

### 4.10 Secrets
Keys live only in `src/backend/.env`, ignored by `.gitignore` (`.env`, `.env.*`). API error messages shown
to the person are meant to never include the key or the raw body (AGENTS.md, `src/backend/src/llm/`;
not re-audited for this document). Approved memories that look
like keys, passwords, long opaque strings or paths with a user name are rejected (`validarRecuerdo` in
`src/backend/src/memoria/recuerdos.js`).

### 4.11 Supply chain
`.github/workflows/ci.yml` runs `npm audit --omit=dev --audit-level=high` for `src/backend` and
`src/desktop`, and `cargo audit` for `src/desktop/src-tauri`, as blocking steps. `.github/dependabot.yml`
opens weekly update PRs for npm, cargo and GitHub Actions. Actions are pinned by tag, not by commit SHA.

## 5. Residual risks and open decisions

1. **Reflections are learned without approval.** `src/backend/src/memoria/reflexion.js` extracts facts
   with the model after each turn and stores them when `aprendizaje_auto` is on (default `1` in
   `sqlite.js`). The only gate is a regex blocklist (`contieneInstruccionesOSecretos`) for secrets and
   imperatives, which a paraphrase can bypass. Mitigations: the `<reflexiones>` note, the persona rule,
   the ~800 character cap and the per-device tombstones. Open decision: require approval, or turn learning
   off by default.
2. **Approved memories are not filtered for instructions.** `validarRecuerdo` rejects secrets and user
   paths but not imperative text. The person approves the card, but may not notice an embedded order.
3. **The backend counterpart of the ASCII guard is pending.** `validarPropuesta` in `acciones.js` still
   accepts non-ASCII process names, and `esProtegido` in `telemetria.js` does not map lookalikes. Rust
   refuses such actions, so nothing runs, but the person can still see a card that will fail.
4. **Model compliance is only tested with scripted clients.** The tests use fake providers
   (`src/backend/test/helpers.js`) and a local HTTP server that imitates Gemini and OpenRouter. Whether a
   real model ignores injected orders in `<sistema>`, `<memoria>` or tool results is not measured by any
   automated test.
5. **Microsoft Learn terms of use.** The MCP server is public; its terms for non-personal or institutional
   use have not been reviewed. It stays off by default.
6. **URL removal is heuristic.** `URL_RE` in `seguridad/texto.js` covers common schemes and a fixed list of
   top-level domains; a URL with an unlisted TLD or an obfuscated form can survive in non-destructive
   motives and other cleaned text.
7. **Action pinning.** GitHub Actions are referenced by version tag, not by full commit SHA.
8. **Backend location.** Whether the backend stays local or moves to the cloud is undecided (AGENTS.md).
   Moving it would change the trust boundaries in section 2 and requires a new review.

## 6. Reporting a vulnerability

Please do not open a public issue for a security problem. Contact the Kerni team privately through the
repository owners on GitHub (a private security advisory, if enabled on the repository) and include the
steps to reproduce, the affected file and the impact. The team will acknowledge the report and agree on a
fix and disclosure date.
