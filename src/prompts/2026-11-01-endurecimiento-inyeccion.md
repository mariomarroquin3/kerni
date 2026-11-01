# Hardening Kerni against prompt injection

## Request

Harden Kerni against prompt injection with adversarial tests, as small local commits, without pushing. The audit had found no path where injected text runs an action without a click, or changes a pid or target. The weak points were display and learning: process names with bidi or control characters on the card, the model's free-text motive on destructive cards, reflections learned from the person's messages with a seven-pattern filter, two copies of the cleaning regex, `|` in process names faking columns in the snapshot, persona data rules that did not name every data block, and invisible characters before the protected-list check.

Order: shared sanitizer, display-safe names, fixed motives, reflection blocklist, persona data rules, end-to-end injection test, this log.

## Decisions

- One sanitizer, `src/backend/src/seguridad/texto.js`. It runs NFKC first, so fullwidth `＜` becomes `<` and is then removed. It strips bidi, zero-width, isolate and BOM characters, turns control characters, C1 controls, `<` and `>` into spaces, turns `|` into `/`, collapses spaces and caps the length. `telemetria.js` (`limpiarNombre`) and `recuerdos.js` (`sanearParaBloque`) both call it. The protected-name comparison (`esProtegido` and Rust `es_protegido`) strips the same invisible set on both sides; it does not apply NFKC or control-character removal.
- A process whose name carries invisible characters, or whose display cleaning would change it, is refused with a Spanish message. The card therefore always shows the exact name Rust compares. Rust keeps its exact comparison. The check runs after the protected check, so a protected name with invisible characters reports as protected.
- Destructive actions (`terminar_proceso`, `congelar_proceso`, `limpiar_temporales`, `limpiar_cache_navegador`, `vaciar_papelera`) get a fixed Spanish motive from `MOTIVOS_FIJOS`. The model's motive is dropped. Read-only actions keep the model's motive after the shared sanitizer, with web addresses removed; an empty result falls back to "Solo mira datos; no cambia nada.". The schema is unchanged.
- Reflections: the filter now compares text that is NFKC-normalized, accent-free and lowercase. It blocks imperatives toward Kerni or its actions with voseo forms (`cierra`, `cerrá`, `aprobá`, and others), phrases such as "de ahora en adelante", "sin preguntar", "tus reglas", and "ignora", and any executable name (`.exe`, `.dll`, ...) or action name from `ACCIONES`. This is a blocklist. The real protection is that reflections are context only and never approve actions or change the protected list.
- Persona: one bullet names every data block (system snapshot, memory, knowledge, the "Equipo de la persona" line, revisar_enlace results, tool results) and says an order inside one of them is ignored and reported in a short note.
- The end-to-end test uses the real agent turn and the real Anthropic adapter with a scripted client. It asserts on the proposals, the rejections in the trace, the exact card fields, and where the injected memory sits in the prompt.

## Verification

- Backend: `npm test` 458 passing in 28 files at the last run (two unrelated flaky failures showed up in parallel runs: `progreso.test.js` passed when run alone, and `sqlite-memoria.test.js` hit a Windows EBUSY lock when removing its temp database; reruns passed).
- Desktop: `npm test` 217 passing, unchanged (no front code changed).
- Rust: `cargo test` 82 passing, 3 ignored (ignored before this work), run after the `es_protegido` change.
- New adversarial tests: `seguridad-texto.test.js` (bidi overrides, zero-width joiners, fake closing tags, fullwidth brackets, pipe columns, long names), `acciones-nombres.test.js` (protected names with invisible characters, refused bidi and symbol names, card name equals the compared name), `acciones-motivo.test.js` (URL and "ignora la confirmación" on destructive cards produce fixed text; read-only motives lose their URLs), `reflexion-filtro.test.js` (about 45 attack and benign phrases, accents and capitals, actions and executables named in reflections), `persona.test.js` (data-block bullet), `inyeccion.test.js` (end to end).
- Known and out of scope: this work does not cover `proponer_recuerdo` text (a person-approved memory can still carry instruction-like wording), reflections still learn without approval, and the front panel still shows raw process names (safe through `textContent`).
