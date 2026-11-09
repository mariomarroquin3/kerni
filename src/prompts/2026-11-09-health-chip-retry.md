# Fix: the AI status chip said "Sin conexión con Kerni" for up to a minute after opening the installed app

## Request
"No bugs for now?" A check of the current main.

## Findings
- main is green: backend 593, front 246 and Rust 102 tests, the web front builds, and the GitHub CI of the last merges passes. The only open PR is #16 (`sysinfo` 0.40), whose Rust CI fails, left open on purpose.
- **One real bug**, found while testing the installed app: the chip asked `/health` once at start and then every 60 seconds. With the installer the bundled backend starts a few seconds after the window, so the first answer failed and the chip stayed on "Sin conexión con Kerni" for up to a minute. (The welcome screen already retried every 1.5 s, and the progress panel retried every minute.)

## Decision
- `proximoRefresco(health, intentosFallidos)` in `estado-ia.js`: with no answer it asks again every 3 seconds for about a minute (20 attempts), then goes back to once a minute; with an answer, once a minute as before. `main.js` replaces `setInterval` with a timer scheduled after each answer, counts the failures, and cancels the pending timer when the welcome screen calls the refresh after changing the AI, so there are never two clocks.

## Verification
- Front 249 tests (3 new: both branches of the timing, the limit, and the wiring in `main.js`). In the browser demo (no backend) `/health` was asked at 0.9, 5.9 and 9.7 seconds instead of once.
- Not run in the compiled window.
