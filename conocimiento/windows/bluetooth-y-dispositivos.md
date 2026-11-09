# Bluetooth: conectar audífonos, mouse y otros dispositivos

Esta guía cubre cómo emparejar un dispositivo Bluetooth con Windows y qué revisar cuando no se conecta, según las páginas de Microsoft. Se puede emparejar casi cualquier cosa: teclados, mouse, celulares, bocinas, audífonos, impresoras y escáneres. Los nombres de los menús pueden variar un poco según la versión de Windows y el idioma: si no encontrás uno, escribí la palabra clave en la lupa de Configuración.

## Antes de empezar
La PC tiene que tener Bluetooth. La mayoría de las laptops ya lo traen. Si la tuya no, se puede agregar con un adaptador Bluetooth USB. Si no estás seguro, mirá las especificaciones de tu equipo: algunos modelos no tienen Bluetooth.

## Encender Bluetooth en Windows 11
Hay dos formas:
- **Configuración:** Inicio > Configuración > Bluetooth y dispositivos. Verificá que Bluetooth esté activado.
- **Configuración rápida:** tocá el ícono de red, sonido o batería junto a la hora y la fecha, y tocá el mosaico de Bluetooth para encenderlo o apagarlo. Si no aparece, hay que agregarlo a la configuración rápida.

Si tu laptop tiene un interruptor físico para Bluetooth, verificá que esté encendido.

## Emparejar un dispositivo (audífonos, bocina, mouse)
1. Encendé el dispositivo y ponelo en modo visible o de emparejamiento. Cómo se hace depende de cada dispositivo: mirá su manual o la página del fabricante.
2. En la PC, tocá el ícono de red, sonido o batería junto a la hora.
3. En el mosaico de Bluetooth, tocá la flecha (Administrar dispositivos Bluetooth) y elegí tu dispositivo en la lista de Nuevos dispositivos. Puede hacer falta desplazarse por la lista.
4. Seguí las instrucciones que aparezcan y tocá Listo.

Cuando Bluetooth está encendido, el dispositivo y la PC se conectan solos cada vez que están al alcance uno del otro. Para una impresora o un escáner Bluetooth: Inicio > Configuración > Bluetooth y dispositivos > Impresoras y escáneres.

Si el dispositivo no aparece en la lista, puede ser que tengas que cambiar la detección a Avanzado: Inicio > Configuración > Bluetooth y dispositivos > Dispositivos, y en Configuración de dispositivo, en Detección de dispositivos Bluetooth, elegí Avanzado en vez de Predeterminado (que solo muestra los dispositivos comunes).

## Si no se conecta: pasos en orden
1. **Verificá que la PC tenga Bluetooth** (ver arriba).
2. **Verificá que Bluetooth esté encendido** y, si hay interruptor físico, que esté activado.
3. **Revisá el dispositivo:** que esté encendido, cargado o con pilas nuevas y al alcance de la PC. Apagalo, esperá unos segundos y encendelo. Si responde lento, fijate que no esté muy cerca de otro dispositivo USB conectado a un puerto USB 3.0: los USB sin blindaje a veces interfieren con Bluetooth.
4. **Cambiá la detección de dispositivos a Avanzado** (ver arriba) si el dispositivo no aparece.
5. **Revisá el hardware y la configuración de la PC:** el modo avión debe estar apagado; apagá Bluetooth, esperá unos segundos y volvé a encenderlo; quitá el dispositivo (Configuración > Bluetooth y dispositivos > Dispositivos, tres puntos del dispositivo > Quitar dispositivo > Sí) y volvé a emparejarlo.
6. **Ejecutá el solucionador de Bluetooth:** Inicio > Configuración > Sistema > Solucionar problemas > Otros solucionadores, y junto a Bluetooth tocá Ejecutar. En Windows 11 también hay uno en la app Obtener ayuda (Get Help).
7. **Actualizá el controlador.** Microsoft dice que un controlador desactualizado o incompatible es una de las causas más comunes de problemas de Bluetooth. En el Administrador de dispositivos, abrí Bluetooth, elegí el adaptador (el nombre puede incluir la palabra "radio"), clic derecho > Actualizar controlador > Buscar controladores automáticamente. Si Windows no encuentra uno nuevo, bajá el más reciente del sitio del fabricante de tu PC y reiniciá si te lo pide.
8. **Desinstalá el adaptador Bluetooth** si el ícono no aparece pero el adaptador sí está en el Administrador de dispositivos: clic derecho > Desinstalar dispositivo > Desinstalar; después apagá la PC por completo, esperá unos segundos y encendela. Windows trata de reinstalar el controlador. Si no lo hace, en el Administrador de dispositivos elegí Acción > Buscar cambios de hardware.

## Conectado pero sin sonido, o se desconecta seguido
La página de Microsoft tiene secciones aparte para "Bluetooth conectado pero sin sonido", "Bluetooth se desconecta seguido" y "audio solo en un canal". Si el dispositivo conecta pero no suena, revisá también la guía de sonido y audio: muchas veces el dispositivo de salida predeterminado no es el de los audífonos.

## Qué no hacer
- No instales controladores de sitios que no sean del fabricante de tu PC o de tu adaptador.
- No emparejes dispositivos que no reconocés: una lista con nombres raros cerca de vos puede ser de otras personas.
- Para equipos de una institución, consultá con el área de sistemas antes de cambiar controladores.

## Fuentes
- Microsoft Support, "Fix Bluetooth problems in Windows": https://support.microsoft.com/en-us/windows/hardware/bluetooth/fix-bluetooth-problems-in-windows
- Microsoft Support, "Pair a Bluetooth device in Windows": https://support.microsoft.com/en-us/windows/hardware/bluetooth/pair-a-bluetooth-device-in-windows
