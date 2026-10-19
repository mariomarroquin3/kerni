# 2026-10-19 · Integración con Gemini y OpenRouter

## Pedido

"Necesitamos integración con API de OpenRouter y Gemini": que el cerebro de Kerni no dependa solo de Anthropic.

## Decisiones

- **Un solo cliente para los dos**: Gemini tiene un endpoint compatible con OpenAI (`generativelanguage.googleapis.com/v1beta/openai/chat/completions`), igual que OpenRouter. Se partió del proveedor de OpenRouter de Bitoo y se generalizó (`chatCompletions.js`) en vez de agregar el SDK de Google.
- **Selección**: `LLM_PROVIDER` (anthropic | gemini | openrouter) o, vacío, la primera llave presente en ese orden. Pedir uno sin su llave, o uno que no existe, hace fallar el arranque con un mensaje que dice qué variable falta.
- **Modelos por defecto**: `gemini-3.6-flash` y `anthropic/claude-haiku-4.5` en OpenRouter, ambos configurables. Google recomienda `3.8-flash` y `3.5-flash-lite`, pero al medirlos con una llave real fueron lentos (ver abajo): se eligió por datos, no por la recomendación.
- **Particularidades de Gemini manejadas**: errores que llegan como lista (`[{error:…}]`), 429 por minuto (se reintenta) contra cupo diario (no), 503 por sobrecarga (se reintenta), `tool_calls` sin id (se les inventa uno para poder devolver el resultado) y el campo `name` en los mensajes `tool`. Tope de tokens más alto (los modelos con razonamiento gastan parte pensando) y `GEMINI_REASONING_EFFORT` opcional.
- **Errores para la persona**: llave inválida, cupo agotado, sin créditos o sin red llegan como 503 con un mensaje claro; cualquier otro error, como un 502 genérico. Nunca se filtra la llave ni el cuerpo crudo.
- **Sin cambio de proveedor a mitad de sesión**: el historial queda en el formato del proveedor activo (Anthropic y OpenAI difieren). No se hizo respaldo automático entre proveedores por la misma razón.
- **URL base configurable** (`GEMINI_BASE_URL`, `OPENROUTER_BASE_URL`): sirve para un proxy y para probar contra un servidor local.
- **`/health`** ahora dice el proveedor y el modelo activos, y el lanzador lo muestra al encender el backend.

## Verificación

- 60 pruebas del backend en verde: cliente (reintentos, `retry-after`, 401/402, cupo, errores en lista, tiempo agotado), proveedor (tools, ids, argumentos rotos, rechazo), selección y creación de proveedores, y agente completo con tool calling.
- `test/http-real.test.js`: un servidor HTTP local que imita a Gemini y OpenRouter, para probar la red de verdad (cabeceras, cuerpo, 401, 429 con reintento, tool call sin id).
- Arranque real de `server.js` con cada proveedor y los dos errores de configuración, mirando `/health`.
- **Prueba con una llave real de Gemini** (`npm run probar-llm` y llamadas directas para medir): el tool calling funciona (llamó a `proponer_accion` con el pid correcto), pero la latencia depende mucho del modelo:
  - `gemini-3.6-flash`: ~3 s, tool calling correcto 2/2 → **elegido**.
  - `gemini-3.8-flash`: 55 s con `reasoning_effort=low`, 503 por alta demanda sin él; además rechaza `reasoning_effort=minimal` (400).
  - `gemini-3.5-flash-lite`: 15-39 s en llamadas de ~100 tokens y 503 intermitentes; en la primera corrida una respuesta superó los 45 s de tiempo límite.
  - `gemini-3.1-flash-lite`: ~2 s pero devolvió `terminar_processo` (valor inválido); el esquema lo rechazaría.
- **Descubrimiento: el plan gratuito de Gemini no alcanza para Kerni.** La respuesta cruda de la API del 429 decía `limit: 20`, `GenerateRequestsPerDayPerProjectPerModel-FreeTier`: **20 pedidos por día por modelo**, y cada mensaje del chat gasta 1 o 2. Las pruebas de esta sesión (unas 30 llamadas entre modelos) agotaron la cuota de hoy de `gemini-3.6-flash` en esa llave; se renueva a las ~10 h. Para usar Kerni en serio hace falta activar la facturación en Google AI Studio o usar otra llave (OpenRouter, Anthropic).
- **Bug encontrado por eso**: el cliente solo buscaba "per-day" en el mensaje, pero Gemini dice el tipo de cupo en `details`. Trataba el cupo diario como un límite por minuto y reintentaba tres veces. Ahora mira `details` (`QuotaFailure`/`RetryInfo`): un cupo diario, o una espera sugerida de más de 30 s, falla de una vez con un mensaje que dice cuándo se renueva y por qué; un límite por minuto espera lo que pide Google y reintenta.
- **Experimento que no funcionó**: acortar el tiempo límite a 12 s y reintentar hasta 2 veces para cortar los picos de latencia. Los picos duraban varios pedidos seguidos (una llamada tardó 44 s con tres intentos) y los reintentos gastan cuota. Se revirtió; `GEMINI_TIMEOUT_MS` queda como ajuste opcional.
- **Segunda corrida de `probar-llm` con `gemini-3.6-flash`**: 3 de 4 bien (1.7, 3.9 y 4.4 s), con un pico de 26 s en la otra; la tercera corrida ya fue de las lentas (hasta 44 s) y la cuarta chocó con el 429. La latencia de Gemini es muy variable durante el día.
- **Hallazgo del harness**: un modelo puede "decir" que propone cerrar un proceso sin llamar a la herramienta (pasó una vez con `3.5-flash-lite`). La persona solo ve la tarjeta de confirmación si llamó a `proponer_accion`; por eso `probar-llm` lo comprueba.
- OpenRouter: sin probar con llave real.
