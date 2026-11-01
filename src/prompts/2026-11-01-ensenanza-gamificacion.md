# Teaching tips, level badge and "¿Por qué?" on cards

## Request

Add a bounded learning layer to Kerni, local only: a static set of tips, a "¿Por qué?" explanation on every confirmation card, a level badge, and a one-minute mini-lesson. XP must reward learning, not clicking. No model call for any of it, nothing about the PC sent anywhere, no push.

## Decisions

- **XP comes only from learning**: opening "¿Por qué?" on a card (+3, once per card type per day), reading a tip (+2, each tip once), and finishing the mini-lesson (+5, once per day). Approving or rejecting a card gives no XP; no action type is worth more than another. Daily cap: 20 XP, enforced in the backend (`src/backend/src/progreso.js`).
- **Levels** (fixed thresholds in `src/desktop/web/progreso.js`): Aprendiz from 0 XP, Vigía from 20, Guardián from 60, Experto from 120, Maestro from 200. The badge is text plus a CSS bar. Kerni's mood does not change with XP.
- **Storage**: one row per device in the local SQLite (`progreso` table, `CREATE TABLE IF NOT EXISTS`), with the day, the XP today and whether the lesson was done today. Chosen over a key/value table because the cap and the once-a-day rule need the day's totals in one read. "Olvidar todo" clears it.
- **Routes**: `GET /progreso` and `POST /progreso/evento`. The event is from a closed list; anything else gets 400. With memory off the routes answer 503 and the front shows the feature as unavailable.
- **Tips** (`src/desktop/web/consejos.js`): 20 fixed Spanish texts, one per session at most, shown after the greeting, never in panic mode or while a card is open. Seen tips are kept in localStorage.
- **Explanations** (`src/desktop/web/explicaciones.js`): one or two sentences per action, saying what it does and what it does not. A test checks coverage against `ACCIONES` in `acciones.js` (read with a regex) and against the `case` labels in `herramientas.js`.
- **Mini-lesson**: after the fifth card resolved in a day, a small card offers it ("¿Querés una lección de 1 minuto?"). It shows three unseen tips in a row and then counts once per day. No quiz, no wrong answers, no penalties.
- **Toggle**: "Consejos: activados / desactivados" in the right-click menu, stored in localStorage. When off, no tips, no lesson and no XP events; "¿Por qué?" still works.
- Nothing about the card approval flow changed except one call that counts the resolved card for the lesson.

## Verification

- Backend tests: `src/backend/test/progreso.test.js` covers the day boundary (El Salvador, UTC-6), the cap (including partial grants), the once-a-day lesson, persistence across a reopened database, the reset on "olvidar todo", 400 for a bad device id and an unknown event, and 503 with memory off.
- Desktop tests: `ensenanza.test.js` (tips and explanation coverage, sentence length, no emojis), `progreso.test.js` (levels, day state, tip and lesson rules), `aprendizaje-cableado.test.js` (ids in HTML, `textContent` for the explanation and the badge, no XP event on approve or reject, closed event list, tip gate, toggle).
- Static check: every `$('id')` used in `main.js` exists in `index.html`. `node --check` passes for the front modules.
- Not verified in the real Tauri window: the layout of the badge and the lesson card, and the timing of the tip bubble. See the final report of the session.
