# Batería de la laptop: desgaste y buenos hábitos

Las baterías de las laptops se gastan con el tiempo, aunque nadie las use mucho. Esta guía explica qué es normal, cómo revisar el estado de la batería y cómo cuidarla con hábitos sencillos.

## Por qué la batería pierde autonomía
Las baterías de litio se desgastan con cada ciclo de carga y descarga, y más rápido con calor. Con los años, la batería guarda menos carga: la laptop dura menos enchufada sin cargador y puede apagarse antes de lo que marcaba.

Eso es normal. Lo que sí conviene vigilar es una caída rápida, un equipo que se apaga de golpe con batería que parecía tener carga, o una batería que se hincha.

## Capacidad de diseño y capacidad actual
Windows puede generar un informe de la batería con el comando `powercfg /batteryreport`, documentado por Microsoft. Se ejecuta desde la consola (buscá "Símbolo del sistema" o "Terminal" en el menú Inicio, abrí como administrador y escribí el comando). El informe se guarda como archivo HTML en la carpeta que indique la consola.

En el informe vas a encontrar la capacidad de diseño (lo que la batería podía guardar de fábrica) y la capacidad de carga completa actual (lo que guarda hoy). Mientras más se separan, más desgastada está. Los nombres exactos de esos campos en tu informe: verificar en tu equipo, porque la documentación de Microsoft que revisamos no los lista.

No hay una cifra oficial única de "batería muerta". Si la capacidad actual es muy baja y la laptop se apaga sola, consultá con un técnico o con el fabricante de tu equipo sobre el reemplazo.

## Cuidados que Microsoft recomienda
Según la ayuda de Microsoft sobre cuidado de la batería:

- **Mantené la carga entre aproximadamente 20 % y 80 %** cuando sea posible. Evitá descargas profundas frecuentes.
- **Evitá el calor.** Usar o cargar la laptop a temperaturas altas acelera el desgaste y puede reducir la capacidad de forma permanente. No la dejes al sol ni sobre cobijas o almohadas que tapen las rejillas.
- **Si tu equipo tiene carga inteligente** (Smart charging), actívala si está disponible. Hace que la batería se mantenga en el nivel recomendado aunque esté enchufada. Revisá en el fabricante o en la configuración del equipo dónde está esa opción, porque la ruta puede variar.
- **Si vas a guardar la laptop sin usar por un tiempo**, dejala con la batería entre 40 % y 60 %, en un lugar fresco y seco. No la guardes llena ni vacía.
- **Si la batería se hincha** y empuja la carcasa, dejá de usar la laptop y consultá a un técnico. Es un riesgo de seguridad.

Un mito frecuente: no hace falta descargar la batería del todo cada mes. Eso era una recomendación de baterías viejas, y no es necesario para las de litio actuales.

## Modo de energía
Windows 11 tiene modos de energía. Según Microsoft, la opción "Mejor eficiencia energética" reduce la actividad en segundo plano para gastar menos energía, tanto con cargador como con batería. Para cambiarla: Configuración > Sistema > Energía y batería > Modo de energía. Los nombres de los demás modos los dejamos sin describir porque la página de Microsoft que revisamos no los detalla: verificar en tu equipo.

Otros ahorros que Microsoft menciona: bajar el brillo, acortar el tiempo de suspensión y activar el modo avión cuando no necesitás conexión inalámbrica.

## Ahorro de batería
El "Ahorro de batería" de Windows apaga funciones que consumen energía cuando la carga baja de cierto nivel. Podés activarlo al momento o dejar que se active solo con un umbral que elijas (la ubicación exacta del umbral en tu versión de Windows: verificar). Es una herramienta, no una solución para una batería desgastada.

## Cuándo consultar a un técnico
- La batería se hincha, huele raro o se calienta de forma anormal.
- La laptop se apaga con batería a porcentajes altos.
- El cargador calienta mucho o no carga.
- Pasa de dar varias horas a durar muy poco en poco tiempo.

## Qué hace Kerni con la batería
Kerni muestra el porcentaje de carga y usa ese dato para cambiar su cara. No reemplaza el informe de la batería ni diagnostica el estado de desgaste. Si Kerni dice que la batería está baja, revisá el cargador antes de asumir que hay un problema.

## Fuentes
- Microsoft Support, "Caring for your battery in Windows": https://support.microsoft.com/en-us/windows/experience/power-battery/caring-for-your-battery-in-windows
- Microsoft Support, "Power settings in Windows 11": https://support.microsoft.com/en-us/windows/power-settings-in-windows-11-0d6a2b6b-2e87-4611-9980-ac9ea2175734
- Microsoft Learn, "Powercfg command-line options": https://learn.microsoft.com/en-us/windows-hardware/design/device-experiences/powercfg-command-line-options
