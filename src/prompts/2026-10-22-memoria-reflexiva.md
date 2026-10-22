# Prompt: Memoria Reflexiva Automática (Memory Stream)

**Fecha:** 2026-10-22  
**Autor:** Equipo Kerni

---

## Pedido

Poner en marcha el plan de memoria reflexiva automática (`plan-memoria-reflexiva.md`) para que Kerni aprenda de forma autónoma hábitos, preferencias, proyectos y patrones del usuario a partir del diálogo cotidiano:
1. **Cero latencia en el chat:** La extracción de aprendizajes debe ocurrir estrictamente en segundo plano tras enviar la respuesta al usuario.
2. **Almacenamiento local SQLite:** Tablas `recuerdos_reflexivos`, `reflexiones_olvidadas` (tombstones de olvido) y `ajustes_memoria` (`aprendizaje_auto`).
3. **Deduplicación y ranking dinámico:** Fusión por tokens normalizados y similitud Jaccard $\ge 0.6$, con decaimiento temporal y refuerzo por menciones.
4. **Seguridad y privacidad estrictas:** Filtro estricto que rechaza contraseñas, API keys, JWT, tokens, correos, teléfonos, rutas de usuario e intentos de inyección de prompts ("ignora tus reglas", etc.).
5. **Invariante de acciones:** Los recuerdos aprendidos son exclusivamente datos informativos (`<reflexiones>`), nunca instrucciones y bajo ningún concepto pueden auto-aprobar o alterar el circuito de aprobación de acciones de Kerni.
6. **Transparencia y control:** Endpoints REST para listar, eliminar, vaciar y activar/desactivar el aprendizaje automático por dispositivo.

---

## Decisiones

### 1. Almacenamiento y ranking (`src/backend/src/memoria/sqlite.js`)
- Tablas creadas:
  - `recuerdos_reflexivos`: campos `device_id`, `categoria`, `contenido`, `clave`, `importancia`, `menciones`, `creado`, `actualizado`, `ultima_mencion`.
  - `reflexiones_olvidadas`: registro tombstone `(device_id, clave)` para que lo que el usuario borra nunca vuelva a aprenderse.
  - `ajustes_memoria`: switch `aprendizaje_auto` por `device_id`.
- Se implementó algoritmo de normalización de tokens (minúsculas, NFD sin diacríticos, puntuación y stopwords eliminadas) y cálculo de similitud Jaccard.
- Deduplicación automática con coincidencia exacta o Jaccard $\ge 0.6$ sobre tokens en la misma categoría: incrementa menciones, actualiza fecha y conserva la variante más informativa.
- Límite duro de 200 reflexiones por dispositivo con purga de menor puntaje.
- Fórmula de ranking en consultas:
  $$\text{puntaje} = \text{importancia} + \ln(1 + \text{menciones}) - \frac{\text{días}}{30}$$
- `contexto()` inyecta `<reflexiones nota="...">` respetando un presupuesto máximo de caracteres (~800 chars) y saneando caracteres `< >`.
- En Windows/OneDrive se activó `PRAGMA synchronous = NORMAL;` con WAL para garantizar lecturas y escrituras atómicas ultrarrápidas.

### 2. Motor de reflexión y cola en segundo plano (`src/backend/src/memoria/reflexion.js`)
- Pre-filtro determinista sin costo de LLM: descarta mensajes $< 10$ o $> 2000$ caracteres, saludos vacíos, agradecimientos, confirmaciones de acciones ("ok", "aprobar") o consultas directas de métricas de CPU/RAM/disco.
- Extractor con contrato JSON estricto (`agregar`, `reemplazar`, `retirar`) limitado a máx 3 operaciones.
- Prompt del extractor configurado con delimitadores `<mensaje>`, instrucción imperativa de que el contenido es dato, no instrucciones, y rechazo de datos sensibles.
- Cola en memoria con concurrencia 1, cooldown de 15 segundos por `device_id` y circuit breaker que suspende extracciones por 10 minutos tras 5 fallos consecutivos de proveedor.
- Integración en `src/backend/src/routes/chat.js`: la extracción se encola tras enviar la respuesta HTTP (`reply.send`), sin `await`.

### 3. Endpoints REST de transparencia (`src/backend/src/routes/memoria.js`)
- `GET /memoria/reflexiones`: lista paginada y filtrable por categoría con cálculo de puntajes.
- `DELETE /memoria/reflexiones/:id`: borrado individual con inserción inmediata de tombstone.
- `DELETE /memoria/reflexiones`: borrado total de reflexiones del dispositivo.
- `GET /memoria/reflexiones/ajustes` y `PUT /memoria/reflexiones/ajustes`: consulta y modificación de `aprendizaje_auto`.
- Todos los endpoints validan `device_id` UUID y aíslan registros por dispositivo (404 si el id no pertenece al dispositivo solicitante).

---

## Verificación

1. **Suite de pruebas unitarias y de integración (`test/reflexion.test.js`):**
   - 16 pruebas completas que verifican: deduplicación exacta, similitud Jaccard, contradicciones/reemplazos, borrado permanente con tombstones, filtro previo sin llamadas al LLM, validación de esquemas y rechazo de inyecciones/secretos/rutas personales, circuit breaker, endpoints REST y formato de contexto seguro.
2. **Suite completa del Backend:**
   - 10 archivos de prueba, 153 tests pasados con 0 fallos (`node ./node_modules/vitest/vitest.mjs run`).
3. **Suite completa del Frontend/Desktop:**
   - 45 tests pasados con 0 fallos (`npm test` en `src/desktop`).
