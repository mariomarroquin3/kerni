# Windows UI smoke test

Run this against the real Tauri window after changing the compact layout, cards, or context menu. It uses WebView2's CDP connection and checks actual element bounds rather than a browser mock.

1. In a separate PowerShell terminal, start the local backend (a model key is not needed for the layout checks):

   ```powershell
   cd src/backend
   npm run dev
   ```

2. In another PowerShell terminal, start Kerni with WebView2 remote debugging enabled:

   ```powershell
   cd src/desktop
   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
   npm run dev
   ```

3. In a third terminal:

   ```powershell
   cd src/desktop
   node scripts/probar-tauri.mjs 9222
   ```

The script checks the 320×620 window with a long bubble, an approval card, the HUD, and file/panic cards. It verifies that the messages remain in their internal scroll area, the mascot stays at least 110 px tall, the HUD collapses during approval, and the context menu stays inside the window at all four corners with the chat, HUD, and approval states.

Also check manually:

- Open and close the memory panel from the right-click menu; remove one fact and one reflection, and toggle automatic learning.
- Confirm that **Borrar todo…** names the conversation and health history in its warning, and cancel it.
- Test the long-bubble approval layout, file and panic cards, and menu placement at each window corner.
- Open **Más herramientas…**, scroll the submenu to its last option, use **Volver al menú**, and confirm both views stay within the window.
- Confirm text and buttons remain readable over both light and dark desktop backgrounds.

The automated script cannot verify Acrylic/compositor appearance or Windows frame-time/CPU behavior; those still need a manual Windows check.