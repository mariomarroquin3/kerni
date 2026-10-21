# 2026-10-20 · Persistencia local con SQLite

## Pedido

Agregar persistencia local con SQLite (`kerni.db`) para que Kerni aprenda patrones de esta PC: historial de métricas, eventos y un resumen para el chat. Todo local, cero red.

## Decisiones

- **Motor SQLite integrado**: `rusqlite` con el feature `bundled`. Base de datos en `%APPDATA%\sv.cubo.kerni\kerni.db` en Windows, `~/.local/share/sv.cubo.kerni/kerni.db` en Linux.
- **Tolerancia total a fallos**: el estado `Almacen` envuelve la conexión. Si no se puede abrir o falla una consulta, se registra con `eprintln!` y el almacén pasa a modo `Desactivado`: Kerni sigue funcionando normalmente sin historial y `metricas` nunca hace panic.
- **Muestreo sin hilos extra**: la lectura de métricas se realiza dentro del comando `metricas` que el front invoca cada 2 s. Se aplica un throttle de 60 s sin bloquear el `Monitor(Mutex<System>)` (el lock se suelta antes de escribir en la BD).
- **Esquema relacional**:
  - `muestras`: métricas cada 60 s (ts, cpu, ram_usada_mb, ram_total_mb, disco_libre_gb, disco_total_gb, bateria, cargando).
  - `resumen_hora`: compactación horaria para datos de más de 30 días.
  - `proceso_stats`: acumulador con promedio móvil del top 3 de procesos por consumo de RAM (excluyendo protegidos).
  - `eventos`: registro de pánico, alertas de RAM, acciones aprobadas y rechazadas (máx. 90 días).
  - `perfil`: reservado para XP/nivel.
- **Saneamiento en Rust y JS**: los nombres de procesos y detalles de eventos pasan por `limpiar_nombre` (espejo exacto de `limpiarNombre` en `telemetria.js`).
- **Resumen para el chat**: el comando `resumen_historial` arma un JSON camelCase de menos de 1 KB con: días de datos, tendencia de disco por regresión lineal (mínimo diario de los últimos 7 días; `null` si no baja o tarda >365 días), horas pico de CPU/RAM, top 3 de procesos habituales y eventos de la semana.
- **Inyección en el prompt**: el backend parsea el historial opcional con `HistorialSchema` y agrega un bloque `<historial>` en el contexto del agente. La persona de Kerni usa el bloque para dar consejos proactivos sólo cuando hay suficientes días de datos.
- **Vigilante de disco**: `crearVigilanteDisco` en `reglas.js` sugiere limpiar temporales con voseo salvadoreño cuando `diasHastaLlenarse` < 14, con enfriamiento de 24 horas.

## Verificación

- **Rust**: `cargo test` (22 tests pasados). Pruebas de migraciones idempotentes, throttle de 60 s, compactación, promedios de procesos, exclusión de protegidos, saneamiento de nombres, lista blanca de eventos, resumen sin datos, tendencia sintética de disco y modo desactivado.
- **Backend**: `npm test` (68 tests pasados). Pruebas de `/chat` ignorando historiales malformados o enormes, inyección del bloque `<historial>` saneado en el contexto y validaciones de Zod.
- **Front**: `npm test` (47 tests pasados). Pruebas de `crearVigilanteDisco` (umbral < 14 días, enfriamiento de 24 h, retornos `null`) e integración.
