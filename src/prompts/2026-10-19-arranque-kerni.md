# 2026-10-19 · Arranque de Kerni

## Pedido

Crear "Kerni", un agente similar a Bitoo que se encargue de la salud de la PC, partiendo de la propuesta *CyberPet AI 2026* (Tauri + Rust) y reutilizando el patrón de Bitoo.

## Decisiones

- **Cerebro**: se reutiliza el patrón del backend de Bitoo (Fastify + harness de tool calling + proveedor Anthropic con interfaz `step`). Las acciones sobre la PC se ejecutan en Rust, local.
- **Alcance del hito 1**: módulos A (salud del sistema) y D (modo pánico) de la propuesta. Los módulos B, C y E quedan para hitos siguientes.
- **El modelo no ejecuta**: `proponer_accion` es una client tool; la persona aprueba en pantalla. Se valida en el backend contra la foto del sistema y otra vez en Rust.
- **Foto del sistema por turno**: la app manda CPU/RAM/disco/procesos en cada mensaje; el modelo solo ve eso. Se trata como dato no confiable (nombres limpiados, etiquetas `<sistema>`).
- **Sin memoria larga ni Supabase** por ahora: el historial vive en la sesión del proceso. La persistencia local (XP, nivel) va en un hito posterior.
- **Modelo por defecto** `claude-haiku-5-5` (respuestas cortas y baratas); configurable con `KERNI_MODEL`.
- **Pánico**: 3 lecturas seguidas (6 s) con CPU ≥ 95% para entrar y 3 bajo el umbral para salir, para que un pico suelto no asuste a Kerni.
- **Limpieza**: solo `%TEMP%` del usuario, archivos de más de 24 h, sin seguir enlaces simbólicos y solo si la carpeta se llama `temp`/`tmp`. Prefetch queda fuera (exige administrador).
- **Diferido**: "congelar" procesos (suspender) en modo pánico; hoy solo se ofrece cerrar, con confirmación.

- **Reglas sin API key**: `reglas.js` vigila la RAM (proceso ≥ 1.5 GB o 15 % con la RAM total ≥ 85 % durante 3 lecturas; fuga = +300 MB en 30 s sin bajar; 5 min de enfriamiento; nunca protegidos). `intenciones.js` responde "¿cuánto disco me queda?" con el porcentaje real; si el disco está ≥ 85 % ofrece limpiar temporales con confirmación. Preguntas de causa o consejo (por qué, cómo, limpiar…) y mensajes de más de 8 palabras siguen yendo al modelo.

## Verificación

- Backend: `npm test` en `src/backend` (propuestas válidas e inválidas, procesos protegidos, inyección en nombres de proceso, historial, límites, error del modelo).
- Front: `npm test` en `src/desktop` (detector de pánico, ánimo, sospechosos).
- Rust: `cargo test` en `src/desktop/src-tauri` (procesos protegidos, limpieza por edad).
- Pendiente: probar con una llave real de Anthropic y revisar la persona con conversaciones reales.
