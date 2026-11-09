# Sonido y audio: cuando la PC no suena

Esta guía sigue la lista de Microsoft para arreglar problemas de sonido en Windows. Los pasos están en orden: empezá por el primero y pasá al siguiente solo si no resolvió. Los nombres de los menús pueden variar un poco según la versión de Windows y el idioma: si no encontrás uno, escribí la palabra clave en la lupa de Configuración.

## Primero: el solucionador de audio
En Windows 11, Microsoft recomienda empezar con el solucionador automático de audio de la app Obtener ayuda (Get Help). Corre un diagnóstico y trata de arreglar solo la mayoría de los problemas. Si no alcanza, seguí con los pasos.

## Paso a paso
1. **Revisá la salida de audio.** Tocá el ícono del altavoz en la barra de tareas y la flecha a la derecha del control de volumen para ver la lista de dispositivos de audio. Verificá que esté elegido el que querés: bocinas, audífonos, etc.
2. **Revisá el hardware y los controles de volumen.** Buscá cables flojos o mal conectados; si hay varias entradas de 3,5 mm, que cada cable esté en la correcta (algunos equipos usan verde para salida y rosado para micrófono, o las rotulan "audífonos" y "micrófono"). Verificá que las bocinas estén encendidas, que el silencio (mute) esté apagado y subí todos los controles de volumen: algunas bocinas y programas tienen el suyo. Probá otro puerto USB si el audio va por USB. Puede que las bocinas no suenen mientras hay unos audífonos enchufados: desenchufalos y probá.
3. **Apagá las mejoras de audio.** Inicio > Configuración > Sonido. En Salida, elegí el dispositivo que usás. Bajá hasta Configuración avanzada y poné Mejoras de audio en Desactivado.
4. **Ejecutá el solucionador de audio.** Inicio > Configuración > Sistema > Solucionar problemas > Otros solucionadores > Audio > Ejecutar.
5. **Revisá que no esté silenciado ni deshabilitado.** Clic derecho en el altavoz, abrí la lista de dispositivos de salida y entrá a la configuración del mezclador de volumen: si algún control tiene una "x", está silenciado; tocá el control o el ícono para activarlo. Después, en Configuración > Sistema > Sonido, en Avanzado entrá a Más opciones de sonido, elegí la pestaña Reproducción (salida) o Grabación (entrada), seleccioná el dispositivo > Propiedades y, junto a Uso del dispositivo, verificá que diga "Usar este dispositivo (habilitar)".
6. **Elegí el dispositivo predeterminado.** Si el audio va por USB o HDMI, puede que tengas que marcarlo como predeterminado: Configuración > Sistema > Sonido, y en Salida elegí el dispositivo que querés usar (al elegirlo queda como predeterminado). Si usás un monitor externo sin bocinas incorporadas, verificá que no esté elegido como salida predeterminada: si lo está, no vas a oír nada.
7. **Instalá las actualizaciones de Windows.** Inicio > Configuración > Windows Update > Buscar actualizaciones, e instalá las que haya.
8. **Reiniciá la PC** para aplicar las actualizaciones. Guardá tu trabajo antes.
9. **Actualizá o reinstalá el controlador de audio.** En el Administrador de dispositivos, abrí Controladores de sonido, vídeo y juegos, clic derecho en tu tarjeta de sonido o dispositivo > Actualizar controlador > Buscar controladores automáticamente. Si Windows no encuentra uno, buscá en el sitio del fabricante. Si no funciona, desinstalá el controlador (clic derecho > Desinstalar dispositivo, marcá "Intentar quitar el controlador de este dispositivo") y reiniciá: Windows lo reinstala solo. Como último intento, usá el controlador genérico de Windows: Actualizar controlador > Buscar controladores en el equipo > Permitirme elegir en una lista de controladores disponibles.

## Si el sonido falló después de una actualización
Si el audio funcionaba antes de una actualización de Windows y ahora no, probá revertir el controlador: Administrador de dispositivos > Controladores de sonido, vídeo y juegos > clic derecho en tu dispositivo > Propiedades > pestaña Controlador > Revertir al controlador anterior. Si no se puede, probá restaurar la PC desde un punto de restauración: Microsoft dice que crea uno cuando instala actualizaciones. Mirá la guía de restaurar el sistema.

## Qué no hacer
- No instales controladores de sitios que no sean del fabricante de tu PC o de tu dispositivo de audio.
- No borres archivos del sistema para "arreglar" el sonido.
- Si el audio es por Bluetooth, revisá primero la guía de Bluetooth: puede ser un problema de emparejamiento o del dispositivo de salida.

## Cuándo pedir ayuda
- Si el dispositivo de audio ni siquiera aparece en el Administrador de dispositivos o en la lista de salida después de reinstalar el controlador.
- Si es una PC de una institución: consultá con el área de sistemas antes de cambiar controladores.
- Microsoft tiene páginas aparte para síntomas puntuales (sin sonido por bocinas o audífonos, dispositivo de salida no detectado, volumen bajo, audio distorsionado, micrófono): conviene mirarlas en la fuente si tu caso es uno de esos.

## Fuentes
- Microsoft Support, "Fix sound or audio problems in Windows": https://support.microsoft.com/en-us/windows/hardware/audio/fix-sound-or-audio-problems-in-windows
