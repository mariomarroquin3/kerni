# Prompt: Memoria + RAG con Supabase y pgvector

**Fecha:** 2026-10-21  
**Autor:** Mario Marroquín (mariomarroquin3)  
**Commit:** cf440a23a26ae517f30061d6d8736b4812086e3e

---

## Pedido

Integrar memoria persistente y RAG (Retrieval-Augmented Generation) en Kerni usando Supabase (PostgreSQL + pgvector):

1. **Memoria**: Guardar recuerdos (hechos, preferencias, datos), conversación y lecturas de salud por `device_id`. El modelo propone recuerdos con `proponer_recuerdo` (client tool), la persona aprueba en pantalla.
2. **RAG**: Base de conocimiento semántica (PCs, hardware, Office, best-practices) consultada por embeddings. En el chat, búsqueda con 1 reintento y 4 s de timeout para no demorar la respuesta.
3. **Seguridad**: `proponer_recuerdo` solo se ofrece si la petición trae `device_id` válido (UUID). Porcentajes de salud recortados a 0-100 (la tabla tiene check constraint).
4. **Tests**: Cobertura de memoria (contexto, porcentajes, sin device_id) y RAG (timeout chat, 429 sin reintentos).
5. **Config**: vitest timeout 20 s para cold starts en Windows.

---

## Decisiones

### Arquitectura de memoria (`src/backend/src/memoria/memoria.js`)
- **Tablas Supabase**: `kerni_recuerdos`, `kerni_conversacion`, `kerni_salud`.
- **Inyección de `db`**: Cliente con `insert`, `select`, `delete`, `rpc` para testear con dobles.
- **`device_id` obligatorio**: UUID v4. Validador estricto (regex) que rechaza inyección SQL y evita guardar si no hay device_id.
- **Contexto para el modelo**: Bloque `<memoria>` con últimos 8 recuerdos + última lectura de salud.
- **Salud**: Una lectura cada 15 min por device_id. Porcentajes clampeados a 0-100 antes de insertar.
- **`proponer_recuerdo`**: Client tool validada con Zod (`contenido` 1-500 chars, `tipo` enum). El modelo la ve solo si `memoriaActiva=true` Y `puedeRecordar=true` (hay device_id).

### RAG (`src/backend/src/rag/`)
- **`embeddings.js`**: Cliente OpenAI-compatible (OpenRouter, etc.). Parámetros `reintentos` y `timeoutMs` inyectables.
- **`conocimiento.js`**: Busca en pgvector vía RPC `kerni_buscar_conocimiento`. Umbral similitud 0.55, top-k 4.
- **Optimización chat**: `ESPERA_CHAT = { reintentos: 1, timeoutMs: 4000 }`. Un 429 (cupo agotado) falla de inmediato sin dormir. Preguntas < 12 chars no gastan embedding.

### Agente (`src/backend/src/agent/agent.js`)
- `DEFINICION_RECUERDO` se agrega a `definiciones` solo si `memoriaActiva && puedeRecordar`.
- `runTurn` recibe `memoria`, `conocimiento`, `puedeRecordar`.
- Contexto armado: persona + `<sistema>` + `<memoria>` + `<conocimiento>`.

### Chat (`src/backend/src/routes/chat.js`)
- Acepta `device_id` opcional en el body. Valida UUID antes de usar.
- `Promise.all` para `memoria.contexto(deviceId)` y `conocimiento.buscar(mensaje)` en paralelo.
- `agent.runTurn(..., puedeRecordar: Boolean(deviceId))`.
- `memoria.guardarTurno` fire-and-forget (no await) para no demorar respuesta.

### Tests nuevos
- `memoria.test.js`: Contexto arma bloques correctos, porcentajes recortados a 100, sin device_id no ve `proponer_recuerdo`.
- `rag.test.js`: Embeddings en chat usan `ESPERA_CHAT`, 429 con `reintentos: 1` falla en 1 llamada sin dormir.
- `vitest.config.js`: `testTimeout: 20000` para cold starts en Windows.

---

## Verificación

```bash
cd src/backend && npm test
# Todos los tests pasan (incluyendo nuevos: memoria y rag)
cd src/backend && npm run test:watch -- --run src/backend/test/memoria.test.js src/backend/test/rag.test.js
```

Tests específicos agregados:
- `memoria > recorta porcentajes fuera de 0-100 para que la tabla no rechace la lectura`
- `chat con memoria > sin device_id el modelo no ve la herramienta de recordar`
- `conocimiento > en el chat pide los embeddings sin reintentos y con poco tiempo`
- `embeddings > con reintentos: 1 un 429 falla de inmediato, sin dormir`

---

## Archivos cambiados

| Archivo | Cambio |
|---|---|
| `src/backend/src/agent/agent.js` | `proponer_recuerdo` condicional, contexto memoria+conocimiento |
| `src/backend/src/memoria/memoria.js` | **Nuevo**: `createMemoria`, validación, contexto, salud, aprobarRecuerdo, olvidarTodo |
| `src/backend/src/rag/conocimiento.js` | **Nuevo**: `createConocimiento`, búsqueda pgvector, formato `<conocimiento>` |
| `src/backend/src/rag/embeddings.js` | **Nuevo**: `createEmbeddings`, parámetros inyectables, manejo 429/5xx/401 |
| `src/backend/src/routes/chat.js` | `device_id`, contextos en paralelo, `puedeRecordar`, guardar turno fire-and-forget |
| `src/backend/test/memoria.test.js` | Tests de porcentajes, sin device_id, contexto |
| `src/backend/test/rag.test.js` | Tests timeout chat, 429 sin reintentos |
| `src/backend/vitest.config.js` | **Nuevo**: timeout 20 s |
| `src/backend/package.json` | `uuid` agregado a dependencies |

---

## Pendientes (siguiente sesión)

- [ ] Variables de entorno reales: `SUPABASE_URL`, `SUPABASE_KEY`, `EMBEDDINGS_API_KEY`, `EMBEDDINGS_BASE_URL`, `EMBEDDINGS_MODEL` en `.env.example`.
- [ ] Poblar `kerni_conocimiento` con datos semilla (scripts de migración/seed).
- [ ] Front: tarjeta de confirmación para `proponer_recuerdo` (reusar patrón de `confirmar`).
- [ ] App Tauri: generar/persistir `device_id` y enviarlo en cada `/chat`.
- [ ] Llamar `memoria.registrarSalud` cada 15 min desde el front.
- [ ] Endpoint/comando `olvidarTodo` (RGPD).