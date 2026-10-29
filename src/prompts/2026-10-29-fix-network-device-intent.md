# Fix network device request detection

## Request
When asked which devices are connected to the network, Kerni opened the general network status panel instead of the local device list.

## Decisions
- Recognize common Spanish forms such as "qué dispositivos están conectados a la red" and "hay dispositivos conectados a mi red".
- Match the specific device-list intent before the general internet/connectivity status intent in both the front end and backend.
- Keep the action read-only and preserve the existing user confirmation flow.

## Verification
- Added front-end intent cases and backend detection plus chat fallback coverage.
- `cd src/desktop && node --test test/herramientas.test.js`
- `cd src/backend && npm test -- test/herramientas.test.js`

## Follow-up: prefer the model, local rules only when unavailable
- The user clarified that recognized requests should reach the model first so it can choose the right tool.
- Moved the desktop's automatic answers behind an explicit backend fallback signal, enabled backend startup without a configured model key, and enabled local fallback for exhausted quota/no credits.
- Invalid keys, network failures, and unrelated provider failures remain visible; they do not get mislabeled as missing quota.
- Routed the single-link conversation shortcut through the model too; the direct link checker is retained only as a no-provider/quota fallback.
- Added tests for normal tool requests without a provider and fallback signaling for missing quota/credits.

### Follow-up verification
- `cd src/backend && npm test -- test/chat.test.js test/respaldo.test.js` (32 passed)
- `cd src/desktop && node --test test/integracion.test.js test/herramientas.test.js` (38 passed)
