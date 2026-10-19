# 2026-10-19 · Personaje de Kerni en Rive

## Pedido

Crear un recurso en Rive para Kerni, como el de Bitoo, con saludo, modo sonriente, modo asustado, modo research e idle, usando tres imágenes de referencia (saludo, sonriente con pulgares, research con lupa), e integrarlo a las reacciones de la app.

## Decisiones

- **Mismo flujo que Bitoo**: piezas a partir de las imágenes, escena generada por código (`construir.py` → `scene.rml`) y compilada con el Rive CLI. `segmentar.py` de Bitoo está calibrado para su cuerpo naranja, así que se reescribió.
- **Regiones, no colores**: cada zona de color encerrada por el contorno oscuro del dibujo es una pieza (`regiones.py`). Se vectorizan con potrace y se pintan con degradado vertical y contorno. `segmentar.py` falla si una región cambia de lugar.
- **Cara y lupa nativas**: ojos, bocas, gota de sudor, luces y lupa se dibujan con formas de Rive, porque cambian de expresión y así no dependen de una imagen por gesto.
- **Idle y asustado se derivan** del rig (no hay imagen): idle es la pose base; asustado cambia la cara, encoge el cuerpo, tiembla y sube los brazos.
- **Brazo izquierdo colgando = espejo del derecho**: solo existía un brazo abajo en las imágenes.
- **`modo` como lista** (no solo disparadores como Bitoo): `idle | sonriente | asustado | research`, más el disparador `saludar` y `mirar_x/y`. Cada animación de modo toca todas las propiedades de modo para que el cruce de 0.35 s vuelva siempre a los valores base.
- **Cuándo cambia de modo la app**: `asustado` (pánico) > `research` (esperando al modelo o vigilante de RAM) > `sonriente` (4 s tras una acción exitosa) > `idle`. Sonriente no es el estado de "todo sano" a propósito: pulgares arriba permanentes cansarían.
- **Herramientas instaladas con permiso**: Rive CLI 1.6.0 (script oficial, revisado antes de ejecutarlo; verifica SHA-256) y `potracer` (port en Python de potrace, `pip --user`), porque Chocolatey no trae potrace.
- **Fallo encontrado y corregido**: el canvas quedaba de 0×0 si se medía antes de mostrarlo; ahora se muestra primero.

## Verificación

- `rive . --verify` y `rive inspect . --summary` sin errores ni problemas.
- Capturas del CLI de los cuatro modos y de tres cuadros del saludo, comparadas con las imágenes de referencia.
- En el navegador con datos de demostración (`npm run web:dev`): Rive carga, entra en `asustado` con `?panico` y pasa a `sonriente` al aprobar una limpieza.
- `npm test` del front: 21 pruebas en verde (incluye la prioridad de `modoKerni`).
- Pendiente: probarlo dentro de la ventana de Tauri y que los ojos sigan el cursor.
