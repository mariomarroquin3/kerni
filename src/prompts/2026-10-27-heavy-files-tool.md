# Heavy files that are no longer used

## Request
A tool to see heavy files or folders that have not been used for a while.

## Decisions
- **A third action, `ver_archivos_pesados`, read-only.** It follows the existing pattern (rule 5): schema and validation in the backend (it carries no data: no path, pid or name, so the app decides what to look at), a confirmation card in the front, and Rust does the work. The backend must not scan the disk because it may live in the cloud later; the model never sees file names.
- Scan in `sistema.rs`, std only, so it works on Windows and Linux: metadata only, never contents; only the personal folders (Downloads, Desktop, Documents, Videos, Pictures, Music, plus the OneDrive ones); symlinks are not followed; dependency and build folders (`node_modules`, `.git`, `.venv`, Rust `target`...) are not walked but their date counts; a wholly unused folder is reported as one entry; "unused" means neither modified nor accessed recently; at most 25 results sorted by size; paths shown with `~`.
- Hard limits and honesty: 20 s and an entry cap per root; if they run out the result says `completa: false` and the UI warns the list may be short; a folder that was not fully read is never reported as unused.
- `mostrar_en_carpeta` opens the file manager with the item selected, only for paths inside those folders after resolving `..` and links. There is deliberately no command to delete or move anything: the person decides.
- Three ways to reach it: the model proposes it (card), the native two-finger menu (direct, the person chose it), or a short local phrase like "archivos pesados" (no model, then the card).

## Findings while testing on the real machine
- The first version hit the 20 s cap with one result: Downloads holds a repository with `node_modules` and build output, hundreds of thousands of files. Skipping those folders and scanning the six roots in parallel helped, but the big win was using `DirEntry::metadata` (data Windows already returns when reading a folder) instead of `symlink_metadata(path)`: **20 s to 3.1 s**, complete, 11 results (installed games, a virtual machine, ISOs, datasets).

## Verification
- Rust: 18 tests (9 new: old vs recent vs small files, folder summarised alone, mixed folder, sorting and cap, `~` in paths, exhausted budget, symlinks on Unix, dependency folders and their dates, several roots, path validation with `..`, nested roots, Windows `\\?\` prefix) plus an `--ignored` test that scans the real folders.
- Backend: 160 tests (2 new). Front: 48 tests (new wiring test and two intent tests).
- Checked in the browser demo: the phrase, the card and the panel render and the rows are plain text.
- **Not tried by hand in the Tauri window**: the running Kerni is the old build. Close it and run `Kerni.bat`; it rebuilds by itself because the code changed.
