# 2026-10-19 · Sprites nuevos, integración con Tauri y lanzador

## Pedido

1. Agregar más sprites al rig (dormido, alerta, idle con ambos brazos colgando).
2. Revisar la integración con la app de Tauri, hacer tests y crear un `.bat` para abrirlo sin comandos.

## Decisiones

- **Dos modos nuevos**: `dormido` (3 min sin interacción, saluda al despertar; `?sueno=5` en la URL lo baja a 5 s para la demo) y `alerta` (Kerni propuso algo por iniciativa propia y espera respuesta). Lo que aprieta la persona (botón "Alimentar") no dispara alerta.
- **Idle real**: el brazo izquierdo colgando sale de la imagen `base`, ya no se espeja el derecho. La cinta cian del casco aparece en los modos "encendidos".
- **Probar la app real, no solo el navegador**: se arranca Tauri con la depuración remota de WebView2 y `scripts/probar-tauri.mjs` se conecta por CDP. Así se verificó que los comandos de Rust devuelven datos reales dentro de Tauri, que Rive carga y dibuja, y se tomó una captura de la ventana real.
- **Hallazgo**: `data-tauri-drag-region` suelto solo arrastra si el clic cae en el contenedor, y el canvas lo cubre entero (se verificó en `drag.js` de Tauri). Se pasó a `"deep"` y se desactivó `maximizable` porque el doble clic sobre una región de arrastre maximiza. Efecto: el clic sobre Kerni ya no lo saluda.
- **Rust testeable**: `leer_metricas` y `cerrar_proceso` se separaron de los comandos de Tauri. Hay un test que lanza un proceso real y comprueba que no se cierra con el nombre equivocado y sí con el correcto.
- **`Kerni.bat`**: solo ASCII y CRLF. Revisa Node/npm/Rust, instala dependencias la primera vez, enciende el backend solo si hay llave (en `.env` o en la variable de entorno), espera `/health`, abre la app y apaga el backend que encendió. `Kerni.bat check` no abre nada.
- **Errores del propio `.bat` encontrados al probarlo**: un paréntesis dentro del texto de un aviso cerraba el bloque `if` y lo hacía salir siempre; y una etiqueta dentro de un bloque con paréntesis.

## Verificación

- `cargo test`: 5 pruebas (métricas reales, protegidos, proceso real).
- `npm test` (front): incluye `integracion.test.js` con el cableado entre HTML, JS, Rust, Tauri, CSP y Rive.
- `vitest` (backend): 24 pruebas, incluidas las de CORS para los orígenes de Tauri; estables en 4 corridas seguidas.
- `probar-tauri.mjs` contra la app real: todas las comprobaciones en verde.
- Pendiente de probar a mano: el arrastre de la ventana.
