# Solución de problemas comunes en Windows

## Disco al 100% en reposo
Cuando el Administrador de tareas muestra el disco al 100% sin programas abiertos pesados, la PC se siente lenta o congelada. En discos mecánicos tradicionales (HDD) esto ocurre con frecuencia por servicios de mantenimiento en segundo plano como SysMain (Superfetch), la indexación de Windows Search o análisis del antivirus. Si el disco pasa minutos al tope, conviene abrir el Administrador de tareas, ordenar por Disco y revisar si es un servicio de Windows o un programa colgado. En discos duros viejos, cambiar a una unidad de estado sólido (SSD) es la mejora más notable para eliminar este cuello de botella.

## Problemas de conexión a internet o Wi-Fi
Si la computadora aparece conectada pero no carga páginas web, o la red se desconecta sola, la causa suele ser una dirección IP duplicada, caché DNS corrupta o problemas con el adaptador de red. Un primer paso rápido es reiniciar el módem o router y la PC. Si persiste, abrir la terminal (Símbolo del sistema o PowerShell) y ejecutar `ipconfig /flushdns` para limpiar la caché de nombres, seguido de `ipconfig /renew`. Si la conexión sigue fallando, restablecer el catálogo de red con `netsh winsock reset` y reiniciar el equipo suele solucionar configuraciones atascadas.

## Windows Update bloqueado o trabado
A veces las actualizaciones de Windows se quedan pegadas en un porcentaje (por ejemplo en 0% o 100%) por horas debido a archivos de descarga dañados o un servicio detenido. Lo peor es forzar el apagado mientras la pantalla dice "No apagues el equipo", ya que puede corromper el arranque de Windows. Si el bloqueo ocurre dentro de la ventana de Configuración, se puede reiniciar el servicio de actualización (`wuauserv`) desde la aplicación Servicios, o pausar las actualizaciones por una semana y reanudarlas para forzar una comprobación limpia.

## Pantalla azul o reinicio inesperado (BSOD)
Una pantalla azul con código de detención ocurre cuando Windows detecta un error crítico de hardware o controladores (drivers) y se reinicia para evitar daños en los datos. Si la pantalla azul empezó tras conectar un periférico nuevo o instalar un controlador, desconectarlo o revertir el controlador suele bastar. Si ocurre al azar, las causas más frecuentes son calentamiento excesivo por polvo, sectores dañados en el disco o fallos en los módulos de memoria RAM. Para diagnosticar la memoria, Windows incluye la herramienta Diagnóstico de memoria (`mdsched.exe`). Para reparar archivos del sistema dañados, se puede ejecutar `sfc /scannow` como administrador.

## Aplicaciones que no responden o se congelan
Cuando una ventana se pone blanca y muestra "No responde", significa que el programa está ocupado esperando respuesta del disco, de la red o de un cálculo pesado. Si el disco o la CPU están al máximo, esperar un minuto suele permitir que el programa termine su tarea. Si pasa mucho tiempo y no reacciona, se puede cerrar de forma ordenada con Alt + F4 o finalizar su proceso desde el Administrador de tareas. Conviene guardar el trabajo seguido en aplicaciones como Word o Excel para no perder cambios si una aplicación se cuelga.

## Sin sonido o problemas con el micrófono
Si la PC se queda sin audio repentinamente, lo más común es que la salida de audio predeterminada haya cambiado sola al conectar una pantalla por HDMI, unos auriculares o un control de juegos. En el icono de parlante junto al reloj se puede desplegar la lista y elegir la salida correcta. Si el micrófono no funciona en llamadas, revisar en Configuración > Privacidad y seguridad > Micrófono que el acceso esté permitido para las aplicaciones deseadas.
