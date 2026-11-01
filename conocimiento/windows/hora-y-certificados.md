# La hora de la PC: por qué importa y cómo ponerla automática

Una hora mal puesta parece un detalle, pero puede hacer fallar actualizaciones, el inicio de sesión y las páginas seguras (las que empiezan con https). Esta guía explica por qué pasa y cómo dejar la hora automática.

## Por qué la hora influye
Las conexiones seguras usan certificados: pequeños documentos que dicen que un sitio es quien dice ser, y que tienen fechas de inicio y de vencimiento. Si la hora de la PC está muy lejos de la real, la PC puede pensar que un certificado todavía no empezó o que ya venció, y el navegador lo rechaza. Por eso aparecen avisos de "conexión no segura" o "certificado vencido" aunque el sitio esté bien.

Lo mismo pasa con otros servicios que usan certificados o contraseñas con tiempo limitado: si los relojes no coinciden, pueden fallar.

Esta explicación es general y no viene de una fuente de Microsoft que hayamos verificado. Lo que sí conviene saber: una hora incorrecta puede hacer fallar otras cosas, como las actualizaciones, y la solución habitual es corregir la hora y la zona horaria y dejar la sincronización automática activada.

## Cómo poner la hora automática (Windows 11)
Según Microsoft:
1. Abrí Configuración.
2. Entrá en Hora e idioma > Fecha y hora. (Los nombres en español pueden variar un poco; buscá "fecha y hora" en la lupa de Configuración.)
3. Activá **Establecer la hora automáticamente**.
4. Si tu zona horaria también puede cambiar sola, activá **Establecer la zona horaria automáticamente**. Así el horario de verano se ajusta solo.

Si la PC está conectada a internet, Windows sincroniza la hora con un servidor. Si la hora sigue mal después de activar la opción, reiniciá la PC y revisá otra vez.

## Cambiar la hora a mano
Solo hacelo si la automática no funciona, por ejemplo sin internet. Desactivá primero la opción automática y después usá el botón de cambiar fecha y hora. Volvé a activar la automática cuando tengas conexión.

## Zona horaria
Si la hora está bien pero varía en un día, revisá la zona horaria. Es común que quede en una zona que no corresponde por un cambio manual. Revisala en la misma pantalla de Fecha y hora.

## Qué hacer si la hora vuelve a cambiar sola
- Revisá si la PC tiene una batería de reloj (CMOS) baja: el reloj se detiene o se atrasa al apagar la PC. Eso lo resuelve un técnico cambiando la pila.
- Revisá que no haya un programa que cambie la hora por su cuenta.
- Si el problema persiste, consultá con un técnico.

## Qué no hacer
- No cambies la hora de la PC para "saltarte" un aviso de certificado. Es justamente la protección que se está activando. Si un sitio de tu banco o de una institución da error de certificado, no entres en él y consultá con la institución.
- No instales programas que prometen "arreglar la hora" o "cambiar la fecha" para algo que no es tuyo.

## Fuentes
- Microsoft Support, "Set time, date, and time zone settings in Windows": https://support.microsoft.com/en-us/windows/experience/personalization/set-time-date-and-time-zone-settings-in-windows