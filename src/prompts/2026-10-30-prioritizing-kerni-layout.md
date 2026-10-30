# Prioritizing Kerni's compact layout

## Request

Diagnose why the greeting bubble is compressed in the fixed 320×620 window when the approval card, HUD, and chat are visible. Preserve the Liquid Glass appearance, keep the greeting and approval readable, let the mascot shrink before scrolling, hide the HUD while approval is pending, and use an internal message-area scrollbar only when needed. Do not change JavaScript, protected frontend logic, Rive, or Tauri window configuration.

## Decisions

- The flex column's natural worst-case height was 758 px: 99 px greeting bubble, 174 px approval card, 210 px Rive mascot, 153 px HUD, 62 px chat, 40 px gaps, and 20 px padding. Since the window is 620 px tall and the greeting is a scrollable flex child, it shrank to 26 px and overflow was clipped by the document.
- Grouped the greeting and cards in `#mensajes` so overflow scrolls inside one discreet, thin-scrollbar area.
- Made the mascot shrink as a square from 210 px to at least 110 px before the message area reaches its available-height cap.
- Used CSS `:has()` to hide the HUD only while `#confirmar` is visible; it returns when the card closes. No JavaScript was changed.
- Kept the Liquid Glass declarations, colors, and gradients unchanged. No filter or `backdrop-filter` was added.
- Deferred the duplicate greeting decision: recommend hiding a redundant “proposal is on screen” bubble while approval is pending, but keep distinct information. No text behavior was changed.

## Verification

- Simulated the requested layout in Chromium at 320×620, not in the native Windows/Tauri window.
- The typical approval case measured 281 px for the message area, 210 px for the mascot, and 62 px for chat; CSS hid the 153 px HUD. All surfaces remained inside the viewport.
- With deliberately oversized approval text, the message area scrolled at 406 px and the mascot shrank square to about 112 px. The approval button remained reachable by scrolling; the page did not overflow.
- Simulated archive and panic cards with the HUD open; the mascot shrank and the message area scrolled without document overflow.
- `npm run web:build`: passed.
- `npm test`: 103 passed, 0 failed.
- `git diff --check`: passed.
- Windows visual confirmation remains with the user.
