# Preguntas para Kerni

Lista de frases que podés escribir en el chat de Kerni, con lo que pasa al escribirlas. Está revisada contra el código de las reglas (no de memoria).

## Cómo preguntar

- Escribí en el chat de la burbuja, como si le hablaras a una persona. No hace falta usar comandos.
- Las frases cortas y claras (por ejemplo "cuánta RAM uso") se responden al instante, con datos de tu PC o con un texto fijo.
- Las preguntas que piden pensar (por qué, cómo, qué conviene) pasan al modelo de lenguaje. Eso necesita una llave configurada (ver la sección "Verificado").
- **Toda acción que cambia algo o abre una pantalla pide aprobación.** Kerni muestra una tarjeta con lo que va a hacer. Nada se ejecuta hasta que tocás **Aprobar**. Si no querés, cerrás la tarjeta.
- Las respuestas sobre el estado de tu PC (números, procesos, espacio, red) dependen del momento: cambian cada vez que preguntás.

Las tablas usan estos tipos:

- **Respuesta local**: contesta al instante con datos medidos o con un texto fijo. No gasta modelo.
- **Tarjeta**: muestra una tarjeta para aprobar. Dice qué acción es.
- **Modelo**: la pregunta va al modelo de lenguaje. Necesita una llave (Anthropic, Gemini u OpenRouter).
- **Revisión de enlace**: revisa la dirección de un enlace sin abrirlo.

## Estado de la PC

| Pregunta | Qué pasa |
|---|---|
| cuánta RAM uso | Respuesta local: porcentaje de RAM usada y los MB usados de los totales. |
| cómo está la RAM | Respuesta local, igual que la anterior. |
| cuánta CPU estoy usando | Respuesta local: porcentaje de procesador ahora mismo. |
| cómo está la CPU | Respuesta local, igual que la anterior. |
| qué programa consume más RAM | Respuesta local: los tres procesos que más memoria usan, con sus MB. |
| qué proceso usa más CPU | Respuesta local: los tres procesos que más CPU usan, con su porcentaje. |
| cómo está la batería | Respuesta local: porcentaje y si está cargando o enchufada. En una PC de escritorio dice que no detectó batería. |
| cuánta batería me queda | Respuesta local, igual que la anterior. |
| cuánto espacio libre tengo | Respuesta local: uso del disco principal y GB libres. Si el disco pasa del 85 %, ofrece limpiar temporales con tarjeta. |
| cuánto espacio me queda en el disco | Respuesta local, igual que la anterior. |

## Equipo

| Pregunta | Qué pasa |
|---|---|
| qué modelo de PC tengo | Tarjeta `ver_info_equipo`: al aprobar, muestra fabricante, modelo, sistema, procesador y RAM. |
| qué equipo tengo | Tarjeta `ver_info_equipo`. |
| qué procesador tengo | Tarjeta `ver_info_equipo`. |
| datos de mi equipo | Tarjeta `ver_info_equipo`. |
| especificaciones de la laptop | Tarjeta `ver_info_equipo`. |
| qué tipo de compu tengo | Tarjeta `ver_info_equipo`. |

## Red

| Pregunta | Qué pasa |
|---|---|
| tengo internet | Tarjeta `ver_estado_red`: hace una prueba corta y dice si hay conexión y cuánto tarda. No manda tus datos. |
| funciona el internet | Tarjeta `ver_estado_red`. |
| el internet está lento | Tarjeta `ver_estado_red`. |
| cómo está mi conexión | Tarjeta `ver_estado_red`. |
| mi wifi anda mal | Tarjeta `ver_estado_red`. |
| revisá si tengo internet | Tarjeta `ver_estado_red`. |
| cuál es mi IP | Tarjeta `ver_dispositivos_red`: muestra tu IP local y los dispositivos que tu PC vio hace poco en la red. |
| qué IP tengo | Tarjeta `ver_dispositivos_red`. |
| mostrame la IP | Tarjeta `ver_dispositivos_red`. |
| qué dispositivos hay en mi red | Tarjeta `ver_dispositivos_red`. Lista lo que está en la tabla ARP (lo visto recientemente), no hace un escaneo activo. |
| quién está conectado al wifi | Tarjeta `ver_dispositivos_red`. |
| escaneá la red | Tarjeta `ver_dispositivos_red`. |

## Inicio y actualizaciones

| Pregunta | Qué pasa |
|---|---|
| qué programas se abren al iniciar | Tarjeta `ver_programas_inicio`: lista lo que arranca con Windows y si está activo. Solo lista. |
| qué programas arrancan con Windows | Tarjeta `ver_programas_inicio`. |
| la compu tarda en prender | Tarjeta `ver_programas_inicio`. |
| programas de inicio | Tarjeta `ver_programas_inicio`. |
| hay actualizaciones de Windows | Tarjeta `ver_actualizaciones`: busca pendientes, **no instala nada**. Puede tardar más de un minuto. |
| revisá las actualizaciones | Tarjeta `ver_actualizaciones`. |
| hay actualizaciones pendientes | Tarjeta `ver_actualizaciones`. |

## Archivos y espacio

Kerni solo mira nombres, tamaños y fechas en tus carpetas personales (Descargas, Escritorio, Documentos, Videos, Imágenes, Música). Nunca mira el contenido, y no borra nada.

| Pregunta | Qué pasa |
|---|---|
| archivos pesados | Tarjeta `ver_archivos_pesados`: lista archivos grandes que no usaste hace tiempo. Son más de 200 MB y más de 90 días sin uso. |
| qué archivos pesados tengo | Tarjeta `ver_archivos_pesados`. |
| carpetas grandes | Tarjeta `ver_archivos_pesados`. |
| qué ocupa más espacio | Tarjeta `ver_archivos_pesados`. |
| archivos que ya no uso | Tarjeta `ver_archivos_pesados`. |
| archivos viejos | Tarjeta `ver_archivos_pesados`. |
| qué archivos viejos puedo borrar | Tarjeta `ver_archivos_pesados`. La lista te sirve para decidir; el borrado lo hacés vos en el Explorador. |
| qué puedo borrar | Tarjeta `ver_archivos_pesados`. |
| archivos pesados de descargas | Tarjeta `ver_archivos_pesados`. |
| hay archivos que no uso | Tarjeta `ver_archivos_pesados`. |
| qué carpetas ocupan más espacio | Tarjeta `ver_espacio_carpetas`: las carpetas personales que más espacio ocupan. |
| espacio por carpeta | Tarjeta `ver_espacio_carpetas`. |
| qué carpetas pesan más | Tarjeta `ver_espacio_carpetas`. |

## Papelera

| Pregunta | Qué pasa |
|---|---|
| vaciar la papelera | Tarjeta `vaciar_papelera`. Dice cuántos elementos hay y que **se borra para siempre**. Solo vacía si aprobás. |
| vacía la papelera | Tarjeta `vaciar_papelera`. |
| borrá la papelera | Tarjeta `vaciar_papelera`. |
| limpiá la papelera | Tarjeta `vaciar_papelera`. |
| vaciar papelera | Tarjeta `vaciar_papelera`. |

## Ajustes de Windows

Para abrir una pantalla de Configuración, la frase tiene que decir **configuración** o **ajustes**, y nombrar el tema. Kerni abre solo pantallas de una lista cerrada.

| Pregunta | Qué pasa |
|---|---|
| abre la configuración de almacenamiento | Tarjeta `abrir_ajuste` → Almacenamiento. |
| abrí configuración de actualizaciones | Tarjeta `abrir_ajuste` → Windows Update. |
| abre la configuración de Windows Update | Tarjeta `abrir_ajuste` → Windows Update. |
| llevame a la configuración de red | Tarjeta `abrir_ajuste` → Red e internet. |
| abre la configuración de wifi | Tarjeta `abrir_ajuste` → Red e internet. |
| mostrame los ajustes de energía | Tarjeta `abrir_ajuste` → Energía y batería. |
| abre la configuración de batería | Tarjeta `abrir_ajuste` → Energía y batería. |
| abrí la configuración de programas de inicio | Tarjeta `abrir_ajuste` → Aplicaciones de inicio. |
| abre la configuración para desinstalar programas | Tarjeta `abrir_ajuste` → Aplicaciones instaladas. |

## Reporte para soporte técnico

| Pregunta | Qué pasa |
|---|---|
| arma un reporte para soporte técnico | Tarjeta `ver_reporte_soporte`: al aprobar arma un resumen del equipo (modelo, memoria, disco, batería, programas de inicio, red y los cinco procesos que más memoria usan). Se queda en pantalla y se copia solo si tocás **Copiar resumen**. No incluye rutas ni tu nombre de usuario. |
| resumen del equipo para soporte | Tarjeta `ver_reporte_soporte`. |
| dame un informe para el técnico | Tarjeta `ver_reporte_soporte`. |
| reporte de soporte | Tarjeta `ver_reporte_soporte`. |
| dame un reporte del equipo | Tarjeta `ver_reporte_soporte`. |

## Revisar enlaces

Kerni revisa la dirección: si usa http, si imita a otra marca, si tiene terminaciones de estafa, si esconde el destino con `@`, etc. **No abre el sitio.** Los ejemplos son direcciones falsas a propósito.

| Pregunta | Qué pasa |
|---|---|
| ¿es segura paypa1-login.com/verify? | Revisión de enlace. Resultado: **peligroso**. Se parece a PayPal sin serlo, el nombre tiene "login" y le falta https. Con modelo, el modelo llama a la revisión; sin modelo (o si se agotó su cupo), Kerni revisa la dirección directamente. |
| ¿es phishing esto: paypal.com.cuenta-segura.xyz? | Revisión de enlace. Resultado: **peligroso**. Empieza con "paypal" pero el sitio real es cuenta-segura.xyz, tiene la terminación .xyz y la palabra "cuenta". |
| ¿es peligrosa la página http://tienda-oferta-gratis.xyz? | Revisión de enlace. Resultado: **dudoso**. No usa conexión cifrada (HTTP), tiene la terminación .xyz y la palabra "gratis". |

Kerni **nunca dice que un sitio "es seguro"**. Como mucho dice que no ve señales de peligro, y eso no es una garantía. Si no hay llave de Google Safe Browsing, lo aclara: solo miró la dirección.

## Frases que no hacen nada especial

Estas se responden con un texto fijo, sin tarjeta ni datos.

| Pregunta | Qué pasa |
|---|---|
| hola | Respuesta local: saludo y presentación. |
| buenas | Respuesta local: saludo. |
| gracias | Respuesta local: "De nada". |
| qué puedes hacer | Respuesta local: lista lo que puede mirar y proponer. |
| qué hora es | Respuesta local: hora en El Salvador. |

## Preguntas abiertas (dependen del modelo)

Estas frases **no tienen regla local**. Van al modelo de lenguaje, que contesta con la foto del sistema y la memoria del chat. Necesitan una llave configurada; sin llave, Kerni contesta solo con las reglas de arriba y lo dice.

| Pregunta | Qué pasa |
|---|---|
| por qué la compu va lenta | Modelo. Contesta con la foto del sistema (CPU, RAM, disco, procesos). Si ve algo para revisar, puede proponer una tarjeta. |
| la compu está lenta | Modelo, igual que la anterior. |
| cómo está el disco de mi compu | Modelo. (Con "cómo" la regla local no responde; el modelo sí.) |
| cómo puedo liberar espacio | Modelo. Puede proponer limpiar temporales (tarjeta) o revisar archivos pesados. |
| hay que limpiar el disco | Modelo, igual que la anterior. |
| limpiá los temporales | Modelo. Si propone limpiar temporales, aparece la tarjeta. Nada se borra sin aprobar. |
| cuánta RAM le puedo agregar | Modelo. Usa el modelo de tu equipo y, si hay base de conocimiento, sus manuales. |
| qué sistema operativo tengo | Modelo. |
| cuánta memoria uso | Modelo. |
| cuánto ocupa la papelera | Modelo. No tiene regla local para contar la papelera. |
| no vacíes la papelera | Modelo. Una negación nunca dispara la tarjeta: el modelo solo responde. |
| actualizaciones de Office | Modelo. Las actualizaciones de programas que no son de Windows no disparan la regla. |
| abre los ajustes de inicio | Modelo. "inicio" solo no alcanza para abrir una pantalla; el modelo puede proponer el ajuste, o podés pedir "abre la configuración de programas de inicio". |
| qué sistema tengo | Modelo. |
| qué pasa con el inicio de sesión | Modelo. La palabra "inicio" sola no dispara la regla de programas de inicio. |

## Qué no hace Kerni

- **No borra ni mueve archivos sueltos.** Solo borra dos cosas, siempre con tarjeta y aprobación: los temporales de más de 24 horas (`limpiar_temporales`) y el contenido de la papelera (`vaciar_papelera`, que no se puede deshacer). La lista de archivos pesados solo muestra; el borrado lo hacés vos en el Explorador.
- **No mira la pantalla.** No ve lo que tenés abierto ni lo que escribís en otras ventanas.
- **No abre sitios.** Revisa enlaces por la dirección, sin entrar.
- **No instala actualizaciones.** Solo las busca y te dice cuáles hay.
- **No hace copias de seguridad.**
- **No reinicia ni apaga la PC.** Puede avisar, si llevás muchos días sin reiniciar.
- **No cierra procesos por su cuenta.** Si propone cerrar uno, va con tarjeta, y nunca cierra procesos de Windows ni de seguridad.
- **No cambia el inicio de Windows desde el chat.** Eso se hace con el botón de cada fila de la lista de programas de inicio, con tarjeta.

## Verificado

- **Fecha**: 2026-11-01.
- **Cómo**: cada frase se pasó por las funciones reales de las reglas, con una lectura de ejemplo (RAM 6 GB de 8 GB, disco 40 GB libres de 256 GB, batería al 80 %):
  - `responderLocal`, `accionLocalNueva` y `enlaceParaRevisar` de `src/desktop/web/intenciones.js` (la app).
  - `detectarAccion`, `pideArchivosPesados` y `destinoDeAjuste` de `src/backend/src/intenciones.js` (el backend, cuando el modelo no llama a una herramienta).
  - `analizarEnlace` de `src/backend/src/enlaces.js` para los tres ejemplos de enlaces (sin llave de Safe Browsing).
  - Las tarjetas y textos salen de `src/desktop/web/herramientas.js`.
- **Qué no se probó aquí**: las respuestas del modelo, la base de conocimiento (RAG), las cifras de la PC (cambian), la revisión real con Google Safe Browsing (hace falta una llave) y la ventana de Tauri en vivo.
- **Depende del entorno**: los números de RAM, CPU, disco y batería; la hora; los dispositivos de la red; lo que la PC tiene en inicio y en actualizaciones; y, en las preguntas abiertas, lo que decida el modelo.
