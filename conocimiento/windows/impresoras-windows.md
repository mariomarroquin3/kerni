# Impresoras en Windows: agregar, cola y "fuera de línea"

Esta guía cubre lo básico: agregar una impresora, entender la cola de impresión, reiniciar el servicio de impresión y resolver el mensaje "impresora fuera de línea". Los pasos son los que documenta Microsoft; si tu equipo no coincide, buscá la palabra clave en la lupa de Configuración.

## Agregar una impresora
1. Encendé la impresora y conectala a la misma red (Wi-Fi o cable) o a la PC por USB, según corresponda.
2. Abrí Configuración > Bluetooth y dispositivos > Impresoras y escáneres (en Windows 11).
3. Elegí Agregar dispositivo junto a "Agregar una impresora o escáner" y seguí las indicaciones.

Si la impresora no aparece, revisá que esté encendida y que la PC y la impresora estén en la misma red. Muchas impresoras de red tienen una página de configuración con su dirección IP; no cambies nada ahí sin saber qué hacés.

## La cola de impresión
Cuando mandás algo a imprimir, Windows lo pone en una cola. Ahí se ve el trabajo, su estado y el orden. Si un trabajo queda trabado, todos los que vienen detrás también se quedan esperando.

Para abrir la cola: Configuración > Bluetooth y dispositivos > Impresoras y escáneres, elegí la impresora y entrá en la cola.

Para cancelar un trabajo trabado, seleccionalo y cancelalo desde la misma ventana. Si la cola no responde, pasá al siguiente paso.

## Reiniciar el servicio de impresión (Print Spooler)
El servicio de impresión (Print Spooler) administra todos los trabajos. Cuando se traba, reiniciarlo suele destrabar la cola. Según Microsoft:

1. Presioná la tecla Windows + R, escribí `services.msc` y confirmá.
2. Buscá **Cola de impresión** (Print Spooler) en la lista.
3. Hacé clic derecho y elegí reiniciar.

Importante:
- Reiniciar un servicio de Windows normalmente pide una cuenta de administrador. La página de Microsoft que revisamos no lo dice de forma explícita, así que tomalo como requisito probable y verificá en tu equipo.
- Antes de reiniciarlo, cancelá los trabajos trabados si podés y guardá tu trabajo en otros programas.
- No detengas el servicio y lo dejes apagado: reiniciá la PC si no vuelve a arrancar.

## "La impresora está fuera de línea"
Este mensaje quiere decir que Windows no se comunica con la impresora, aunque la impresora pueda estar encendida. Pasos que Microsoft recomienda, en orden:

1. **Ejecutá el solucionador de impresoras.** En Windows 11 se abre desde la app Obtener ayuda (Get Help). Microsoft lo llama "Run the troubleshooter in Get Help", con el enlace aka.ms/OfflinePrinter.
2. **Apagá la impresora, desconectala de la corriente, esperá unos 30 segundos, conectala y encendela.**
3. **Revisá que la impresora sea la predeterminada** si tu caso lo requiere. Si Windows administra la predeterminada, desactivá esa opción primero.
4. **En Windows 10**, en la cola de la impresora, revisá que no estén marcadas las opciones "Usar impresora sin conexión" o "Pausar impresión". En Windows 11, Microsoft no menciona este paso; si no ves esas opciones, seguí con el siguiente.
5. **Eliminá la impresora y agregala de nuevo.** En Windows 11: Configuración > Bluetooth y dispositivos > Impresoras y escáneres, elegí la impresora, Quitar; después Agregar dispositivo. Asegurate de que la impresora esté encendida y conectada.
6. **Reiniciá la cola de impresión** (ver arriba) y después la PC.

Si la impresora está conectada por red con cable, y sigue apareciendo fuera de línea, la causa suele estar en la dirección IP o en el puerto. Ese caso es más técnico: consultá con quien administra la red antes de cambiar nada.

## Impresión que sale mal o no sale
- Revisá papel, tinta o tóner y tapas abiertas en la impresora. Muchas veces el error es físico.
- Si la impresora imprime hojas en blanco, revisá los cartuchos o el tóner; limpiar cabezales es una tarea del fabricante. Seguí su manual.
- Si el problema aparece solo con un programa, probá imprimir un documento de prueba desde otro programa.

## Qué no hacer
- No instales "drivers" bajados de sitios que no son del fabricante.
- No compartas el acceso a la impresora con personas que no conocés.
- No borres archivos del sistema de la carpeta de impresión a mano. Si hace falta limpiar la cola, usá la cola de impresión y el reinicio del servicio.

## Cuándo pedir ayuda
- Un error de controladores que no se resuelve al reinstalar la impresora.
- Un problema de red que afecta a varias PCs.
- Una impresora de la institución: consultá con el área de sistemas antes de cambiar configuraciones compartidas.

## Fuentes
- Microsoft Support, "Troubleshooting offline printer problems in Windows": https://support.microsoft.com/en-us/windows/hardware/printer/troubleshooting-offline-printer-problems-in-windows
- Microsoft Support, "Fix print spooler service not running errors in Windows": https://support.microsoft.com/en-us/windows/hardware/printer/fix-print-spooler-service-not-running-errors-in-windows
