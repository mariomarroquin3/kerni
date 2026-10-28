# No diminutives, and hints about which old files can go

## Request
Kerni used too many diminutives, and it no longer said which old folders or files could be deleted.

## Decisions
- **Voice.** The persona now has an explicit rule: no words ending in -ito/-ita ("ratito", "cositas", "lugarcito", "poquito"); the tenderness comes from tone. The examples were rewritten without diminutives. The fixed texts of the app were fixed too ("Anotado", "ordenada", "queda lugar", "Hola" instead of "Holi"). A test fails if a diminutive comes back in the persona (outside the rule that forbids them).
- **Why it stopped saying what to delete.** Two causes. (1) The persona forbade saying that something "can be deleted", and the model never sees file names (by design), so it could only give vague advice. (2) Only short messages ("archivos pesados") opened the scan locally; "qué carpetas o archivos viejos puedo borrar" went to the model, which often answered "use the tool" without proposing it.
- **Hints in the list** (`web/archivos.js`, pure and tested). Each item gets a label from its type only (extension, file or folder), never its content: *Suele sobrar* (installers `.exe/.msi/.iso`, archives `.zip/.rar/.7z`), *Respaldá antes* (photos, videos, music, documents) and *Revisá antes* (folders and unknown types; a folder is never marked as "suele sobrar", whatever its name). After the scan the bubble summarizes counts and sizes without naming files (names come from disk, so they stay untrusted) and always says to review each one before deleting. The app still does not delete or move anything: rule 5 would require a new action with its own card.
- **Intent.** "archivos viejos/antiguos", "qué puedo borrar/eliminar" now open the scan locally; this phrase is accepted up to 20 words, but anything asking "por qué/cómo/explicame" still goes to the model.
- **Persona on the scan.** When asked what old files can be deleted, call `proponer_accion` with `ver_archivos_pesados` (do not say "use a tool"), and give general guidance (installers and downloaded zips usually go if the program is installed; back up photos, videos and documents) always followed by "review each one first".
- **Leak filter.** In a real run the model pasted the whole `<sistema>` block into its answer. `quitarBloquesInternos` now strips `<sistema>`, `<memoria>`, `<conocimiento>` and `<reflexiones>` from the final text.

## Verification
- Front 65 tests (11 new in `test/archivos.test.js`: hints, folders never "suele sobrar", a file name with instructions does not change the hint, summary without names, longer intent, explanations still go to the model). Backend 226 tests (persona rule, internal block filter).
- Real model (Gemini flash-lite): no diminutives in two answers. It still sometimes answers "te propongo…" without calling `proponer_accion`; that is why the local intent covers the longer phrase. The `<sistema>` leak appeared once and is now filtered.
- Not tried by hand in the compiled Tauri window: the colored hint labels and the bubble need `Kerni.bat` to rebuild the app.
