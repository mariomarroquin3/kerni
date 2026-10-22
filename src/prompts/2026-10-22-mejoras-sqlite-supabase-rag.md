# Prompt: Mejoras en SQLite, Supabase y RAG

**Fecha:** 2026-10-22  
**Autor:** Equipo Kerni

---

## Pedido

Implementar mejoras técnicas y arquitectónicas en:
1. **RAG**:
   - Actualizar modelo por defecto de Gemini en embeddings a `text-embedding-004` (768 dimensiones).
   - Agregar ventana de solapamiento (`overlap`) en `fragmentar()` para preservar contexto entre secciones de texto contiguas.
   - Soportar búsqueda híbrida (vectorial con `pgvector` + texto con `tsvector`).
2. **SQLite**:
   - Almacenamiento local autónomo de telemetría de salud (`salud`) para que Kerni pueda diagnosticar tendencias de CPU/RAM sin necesidad de internet o Supabase.
   - Retención automática y purga periódica de mensajes (>15 días) y salud vieja (>30 días) en `mantenimiento()`.
   - Método `cerrar()` para evitar bloqueos de archivo (`EPERM`) en Windows.
3. **Supabase**:
   - Crear migración `supabase/migrations/20261021000200_rag_hibrido.sql` con índice GIN de texto completo en español y función RPC `kerni_buscar_conocimiento_hibrido`.
   - Mantener retrocompatibilidad y fallback transparente si la función híbrida remota no existe aún.

---

## Decisiones

### 1. RAG
- En `src/backend/src/rag/embeddings.js`, se actualizó `EMBEDDINGS_POR_DEFECTO.gemini` a `text-embedding-004`.
- En `src/backend/src/rag/fragmentos.js`, se agregó `OVERLAP_FRAGMENTO = 120` y `obtenerOverlap` buscando cortes limpios por punto o espacio dentro del rango de solapamiento. La firma de `fragmentar(texto, max = MAX_FRAGMENTO, overlap = 0)` preserva compatibilidad por defecto.
- En `src/backend/src/rag/conocimiento.js`, se expuso `buscarHibrido` y se añadió soporte de `hibrido: true` en `buscar()` con fallback automático a la función `kerni_buscar_conocimiento`.
- En `supabase/migrations/20261021000200_rag_hibrido.sql`, se definió columna generada `tsv tsvector` e índice GIN, junto con la función `kerni_buscar_conocimiento_hibrido` combinando similitud coseno con `ts_rank_cd`.

### 2. SQLite (Salud Local y Retención)
- En `src/backend/src/memoria/sqlite.js`, se añadió tabla `salud` con índice por `(device_id, creado DESC)`.
- `registrarSalud` guarda de inmediato en SQLite local y, si `supabase` está activo, sincroniza en segundo plano.
- `resumenSalud` calcula promedios y picos directamente de las lecturas locales de SQLite (rápido y offline). Si en local hay menos de 3 lecturas y hay Supabase configurado, hace fallback al resumen remoto.
- `mantenimiento()` ejecuta purgas locales con retención parametrizada (15 días de mensajes, 30 días de salud) además de invocar la limpieza remota si hay Supabase.
- Se agregó `cerrar()` (`db.close()`) y se aseguró el cleanup en `test/sqlite-memoria.test.js` para compatibilidad total con Windows.

---

## Verificación

1. **Tests de RAG y Fragmentos:**
   - `test/rag.test.js`: 22/22 tests pasados, incluyendo prueba de solapamiento (`overlap`) y llamadas RPC.
2. **Tests de SQLite:**
   - `test/sqlite-memoria.test.js`: 12/12 tests pasados, verificando salud local, cálculo de resumen sin Supabase, aislamiento de carpetas y limpieza sin errores `EPERM`.
3. **Suite Completa Backend:**
   - 9 suites, 137 tests pasados con 0 fallos (`node ./node_modules/vitest/vitest.mjs run`).
4. **Suite Frontend/Desktop:**
   - 45 tests pasados con 0 fallos (`npm test` en `src/desktop`).
