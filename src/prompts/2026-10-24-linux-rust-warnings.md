# Linux Rust warning cleanup

## Request
Remove Linux Rust dead-code warnings for Windows temporary-file cleanup and battery helpers without changing Windows behavior.

## Decisions
- Compile the Windows temporary-cleanup constant and helper only outside Linux; retain the helper in tests so existing cleanup tests continue to run.
- Compile the Windows battery-status interpreter on Windows and in tests, while excluding it from the Linux application binary.
- Leave the AppIndicator deprecation and GTK runtime diagnostic unchanged because they are separate from Rust dead-code warnings and need runtime-specific diagnosis.

## Verification
- `cargo check --manifest-path src/desktop/src-tauri/Cargo.toml`: passed on Linux with no warnings.
- `cargo test --manifest-path src/desktop/src-tauri/Cargo.toml`: 6 passed.
