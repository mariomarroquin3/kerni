# 2026-10-19 · Caras por carga, transparencia en reposo y ocultar métricas

## Pedido

Umbrales de carga de la PC para la cara de Kerni: 70 % o más, la cara sonriente normal; de 30 % a 69 %, la imagen 1 (cara seria); menos, la imagen 2 (cara aburrida). Que en reposo se vuelva un poco transparente, como Bitoo, y poder ocultar las métricas.

## Decisiones

- **"Carga" = CPU.** La RAM de esta PC ronda 75-85 % siempre y la cara quedaría fija. Se promedian las últimas 5 lecturas (10 s) y el cambio de nivel exige pasarse 4 puntos del umbral (histéresis), para que una CPU alrededor de 30 % o 70 % no haga parpadear la cara cada 2 s. La primera lectura de CPU de sysinfo siempre es 0 y se descarta.
- **La regla se aplicó como se pidió**, aunque parezca al revés: mucha carga = cara normal, poca carga = aburrido. Consecuencia que conviene saber: con la PC en reposo (lo típico, 10-20 % de CPU) Kerni se ve aburrido, no sonriente.
- **Dos modos nuevos del rig**, `neutro` y `aburrido`, con caras nativas hechas sobre las dos imágenes de referencia. El aburrido trae las dos barras cian del casco (calculadas sobre la cinta del casco del rig, no con las coordenadas de la imagen, que tiene otra proporción) y un respirar lento.
- **Prioridad**: los eventos (susto, alerta, pensando, reacción, sueño) mandan sobre la cara de la carga.
- **Transparencia**: en los modos de reposo (`idle`, `neutro`, `aburrido`, `dormido`), sin interacción en 4 s, sin globo ni tarjeta abiertos, la mascota baja a 0.6 de opacidad y algo de saturación y el panel a 0.55. Mover el puntero sobre la ventana o escribir la devuelve a opaca.
- **Ocultar métricas**: el botón del panel oculta solo las tres barras; "Alimentar" y el chat siguen. La preferencia se guarda en `localStorage` (siempre dentro de try/catch).

## Verificación

- `npm test` del front: 42 pruebas (umbrales en los bordes 29.9/30/69.9/70, promedio, histéresis, prioridad con eventos, modos de reposo, ocultar métricas y que el `.riv` traiga los modos nuevos).
- `probar-tauri.mjs` contra la app real: con CPU media de 12 % la cara fue `aburrido`; el reposo se activó solo, bajó a 0.6 de opacidad y volvió a 1 al mover el puntero; el botón ocultó y mostró las métricas y guardó la preferencia.
- Capturas de la ventana real en reposo, activa y sin métricas.
- Pendiente: ver las caras `neutro` e `idle` en la app real (el equipo estuvo siempre con CPU baja), con carga real o forzando la CPU.
