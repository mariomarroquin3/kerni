# Wi-Fi e internet: cuando la PC no se conecta

Esta guía sigue los pasos que documenta Microsoft para arreglar problemas de conexión Wi-Fi en Windows, en el mismo orden. Empezá por el primero y pasá al siguiente solo si no resolvió. Los nombres de los menús pueden variar un poco según la versión de Windows y el idioma: si no encontrás uno, escribí la palabra clave en la lupa de Configuración.

## Primero: el solucionador de red
En Windows 11, Microsoft recomienda empezar con el solucionador automático de Red e internet, que está en la app Obtener ayuda (Get Help). Corre un diagnóstico y trata de arreglar solo la mayoría de los problemas. Si usás una versión anterior de Windows, pasá directo a los pasos de abajo.

## Qué dice el ícono de red
- **Conectado a Wi-Fi:** hay conexión a la red y a internet. Si aun así algo falla, el problema puede estar en un programa o sitio puntual, o en un cortafuegos que bloquea la conexión.
- **Barras que suben y bajan:** el equipo todavía se está conectando. Esperá a que queden fijas.
- **Sin internet:** la PC no tiene salida a internet. Con Wi-Fi puede deberse a varias causas; seguí los pasos.

## Paso a paso
1. **Revisá el estado de la conexión.** Tocá el ícono de red, sonido o batería a la derecha de la barra de tareas. Verificá que Wi-Fi esté activado y que tu red diga "Conectado". Si no, elegí una red que reconozcas, tocala e intentá conectarte.
2. **Revisá el modo avión.** Configuración > Red e internet > Modo avión. Tiene que estar apagado.
3. **Olvidá la red y volvé a conectarte.** Configuración > Red e internet > Wi-Fi > Administrar redes conocidas. Elegí tu red y tocá Olvidar. Después seleccionala de nuevo y escribí la contraseña.
4. **Reiniciá el módem y el router.** Esto crea una conexión nueva con tu proveedor de internet y desconecta por un rato a todos los que usan esa red. Desenchufá el router, desenchufá el módem (si tiene batería de respaldo y las luces siguen encendidas, sacale la batería), esperá al menos 30 segundos, volvé a poner la batería si la sacaste, enchufá el módem y esperá a que las luces dejen de parpadear. Después enchufá el router y esperá unos minutos. Si tenés un equipo que es módem y router a la vez, seguí los pasos solo con ese. Intentá conectarte otra vez.
5. **Probá la otra banda.** Muchos routers emiten en 2.4 GHz y en 5 GHz, y aparecen como dos redes separadas en la lista. Si ves las dos, probá con la otra.
6. **Probá la misma red con otro dispositivo,** como un celular u otra laptop. Si ese sí se conecta, el problema está en tu PC.
7. **Reiniciá la configuración de red con comandos.** Buscá "símbolo del sistema" (command prompt), elegí Ejecutar como administrador y confirmá. Corré estos comandos en este orden, uno por uno, y revisá si se arregló: `netsh winsock reset`, `netsh int ip reset`, `ipconfig /release`, `ipconfig /renew` y `ipconfig /flushdns`.
8. **Desinstalá el controlador del adaptador de red y reiniciá.** Sirve sobre todo si la conexión dejó de funcionar después de una actualización. Antes, bajá el controlador más reciente desde el sitio del fabricante de tu PC (si la PC no tiene internet, hacelo desde otra y pasalo en una memoria USB; vas a necesitar la marca y el modelo). En el Administrador de dispositivos, abrí Adaptadores de red, elegí el tuyo, clic derecho > Desinstalar dispositivo, marcá "Intentar quitar el controlador de este dispositivo" y desinstalá. Reiniciá: Windows instala el controlador automáticamente. Si no lo hace, instalá el que guardaste.
9. **Hacé una prueba de ping al router.** En el símbolo del sistema como administrador escribí `ipconfig` y buscá, en tu red Wi-Fi, la dirección que dice Puerta de enlace predeterminada (por ejemplo 192.168.1.1). Después escribí `ping` seguido de esa dirección. Si hay respuestas, la PC sí llega al router y el problema puede estar en el módem o en el proveedor de internet. Si no hay respuesta, probá conectar la PC al módem con un cable de red: si así hay internet, la falla está en el router (revisá que tenga el firmware al día).
10. **Desactivá el ahorro de energía del adaptador Wi-Fi.** En el Administrador de dispositivos, abrí Adaptadores de red, clic derecho en tu adaptador Wi-Fi > Propiedades > pestaña Administración de energía, y desmarcá "Permitir que el equipo apague este dispositivo para ahorrar energía".
11. **Buscá actualizaciones de Windows.** Inicio > Configuración > Windows Update > Buscar actualizaciones, e instalá las que haya.
12. **Reiniciá la PC.** Muchas actualizaciones lo piden. Guardá tu trabajo antes.
13. **Restablecimiento de red: el último recurso.** Configuración > Red e internet; en Windows 11, Configuración avanzada de red > Restablecimiento de red > Restablecer ahora. Quita todos los adaptadores de red instalados y sus configuraciones; al reiniciar se reinstalan con los valores por defecto. Después puede hacerte falta reinstalar o configurar de nuevo software de red como un cliente VPN, y Windows puede marcar tus redes conocidas como públicas.

## Qué no hacer
- No cambies la configuración del router sin saber qué hacés: puede dejar sin internet a todos los que lo usan.
- No bajes controladores de sitios que no sean del fabricante de tu PC o del adaptador.
- No uses el restablecimiento de red como primer paso: borra configuraciones.

## Cuándo pedir ayuda
- Si en una red institucional (oficina, escuela) la conexión falla en varias PCs a la vez: consultá con el área de sistemas antes de tocar nada.
- Si el ping al router responde pero no hay internet: es probable que el problema esté en el módem o en el proveedor; llamá a tu proveedor de internet.
- Si el Wi-Fi dejó de aparecer por completo o falla solo en ciertas situaciones (internet lento, se corta seguido), la página de Microsoft tiene secciones para esos casos que conviene mirar en la fuente.

## Fuentes
- Microsoft Support, "Fix Wi-Fi connection issues in Windows": https://support.microsoft.com/en-us/windows/experience/connectivity-networking/fix-wi-fi-connection-issues-in-windows
