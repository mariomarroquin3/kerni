# 2026-10-19 · Caras por carga, transparencia en reposo y ocultar métricas

## Pedido

Umbrales de carga de la PC para la cara de Kerni (la "carga" era la de la batería; ver la corrección al final): 70 % o más, la cara sonriente normal; de 30 % a 69 %, la imagen 1 (cara seria); menos, la imagen 2 (cara aburrida). Que en reposo se vuelva un poco transparente, como Bitoo, y poder ocultar las métricas.

## Decisiones

- ~~"Carga" = CPU~~ **(interpretación equivocada, corregida abajo).** Se implementó con la CPU promediada en 5 lecturas y con histéresis de 4 puntos.
- ~~**La regla se aplicó como se pidió**, aunque parezca al revés: con la PC en reposo Kerni se vería aburrido.~~ Esa "rareza" era la pista de que se había entendido mal.
- **Dos modos nuevos del rig**, `neutro` y `aburrido`, con caras nativas hechas sobre las dos imágenes de referencia. El aburrido trae las dos barras cian del casco (calculadas sobre la cinta del casco del rig, no con las coordenadas de la imagen, que tiene otra proporción) y un respirar lento.
- **Prioridad**: los eventos (susto, alerta, pensando, reacción, sueño) mandan sobre la cara de la carga.
- **Transparencia**: en los modos de reposo (`idle`, `neutro`, `aburrido`, `dormido`), sin interacción en 4 s, sin globo ni tarjeta abiertos, la mascota baja a 0.6 de opacidad y algo de saturación y el panel a 0.55. Mover el puntero sobre la ventana o escribir la devuelve a opaca.
- **Ocultar métricas**: el botón del panel oculta solo las tres barras; "Alimentar" y el chat siguen. La preferencia se guarda en `localStorage` (siempre dentro de try/catch).

## Verificación

- `npm test` del front: 42 pruebas (umbrales en los bordes 29.9/30/69.9/70, promedio, histéresis, prioridad con eventos, modos de reposo, ocultar métricas y que el `.riv` traiga los modos nuevos).
- `probar-tauri.mjs` contra la app real: con CPU media de 12 % la cara fue `aburrido`; el reposo se activó solo, bajó a 0.6 de opacidad y volvió a 1 al mover el puntero; el botón ocultó y mostró las métricas y guardó la preferencia.
- Capturas de la ventana real en reposo, activa y sin métricas.
- Pendiente: ver las caras `neutro` e `idle` en la app real (el equipo estuvo siempre con CPU baja), con carga real o forzando la CPU.

## Corrección (mismo día): la carga es la de la batería

El usuario mandó una captura con Kerni serio/aburrido y escribió que se mostraba "aunque tenga 97 % de batería". La regla 70 / 30-69 / menos hablaba de la **batería**, no de la CPU: mucha batería = contento, poca = aburrido. Se había leído "carga de la PC" como carga de procesador, y la señal de que algo no cuadraba (Kerni aburrido siempre, con la PC en reposo) se tomó por una consecuencia curiosa del pedido en vez de preguntar.

- **Rust**: `Metricas.bateria` (`porcentaje`, `cargando`, `enchufada`; `null` si no hay batería) con `GetSystemPowerStatus` de kernel32, declarada a mano para no sumar dependencias. `interpretar_bateria` está separada para probarla con casos (97 % enchufada, 20 % cargando, sin batería, desconocida).
- **Front**: la cara sale de `m.bateria.porcentaje` con histéresis de 4 puntos y sin promedio (la batería cambia despacio). Sin batería, la cara de siempre. En la demo del navegador: `?bateria=25` o `?bateria=ninguna`.
- **Segundo fallo, visto en la misma captura: caras apiladas.** El saludo solo apagaba las caras viejas y la cara nueva del modo (`aburrido`: ojos entrecerrados, barras del casco) quedaba dibujada debajo de la del saludo (ojos felices). Se arregló haciendo que el saludo tome el control de todas las propiedades de modo, se acortaron los cruces entre modos a 200 ms y se agregó un test de regresión que lee `scene.rml`: la versión subida tenía 280 propiedades sin cubrir (35 por modo); la arreglada, 0.
- **Verificación**: `cargo test` (7, incluye la interpretación de la batería), `npm test` del front (44), saludo disparado desde los siete modos (`fotografiar_saludo.py`) y la demo en el navegador con 97 / 50 / 20 % y sin batería (`idle` / `neutro` / `aburrido` / `idle`).
- **No verificado en la ventana real de Tauri**: el usuario tenía su propia instancia abierta (con `Kerni.bat`), que se recargó sola con los cambios; no se la cerró ni se abrió una segunda. La lectura de batería real en esa ventana queda por comprobar a ojo y con `probar-tauri.mjs`.
- **Lección**: cuando una regla pedida produce un comportamiento raro en el caso más común, preguntar antes de implementarla.
