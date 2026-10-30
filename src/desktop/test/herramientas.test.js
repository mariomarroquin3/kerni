import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AJUSTES, describirNueva, detallePapelera, panelActualizaciones, panelDispositivosRed, panelEquipo, panelEspacio, panelInicio, panelRed } from '../web/herramientas.js';
import { accionLocalNueva, responderLocal } from '../web/intenciones.js';

const SIN_DIMINUTIVOS = /\b[a-záéíóúñ]{3,}(it|cit)[oa]s?\b/i;

test('la tarjeta de cada acción nueva dice qué va a pasar, y la que borra avisa que no se deshace', () => {
  for (const accion of ['ver_info_equipo', 'ver_programas_inicio', 'ver_espacio_carpetas', 'ver_estado_red', 'ver_actualizaciones', 'ver_dispositivos_red']) {
    assert.match(describirNueva({ accion }), /^¿/, accion);
  }
  assert.match(describirNueva({ accion: 'ver_actualizaciones' }), /no descargo ni instalo/);
  assert.match(describirNueva({ accion: 'ver_estado_red' }), /no mando tus datos/);
  assert.match(describirNueva({ accion: 'ver_dispositivos_red' }), /no entro ni hago nada/);
  assert.match(describirNueva({ accion: 'abrir_ajuste', destino: 'actualizaciones' }), /Windows Update/);
  assert.match(describirNueva({ accion: 'vaciar_papelera', detalle: '7 elementos (120 MB)' }), /7 elementos \(120 MB\).*no se puede deshacer/);
  assert.match(describirNueva({ accion: 'vaciar_papelera' }), /no se puede deshacer/);
  assert.match(describirNueva({ accion: 'cambiar_inicio', nombre: 'Spotify', activar: false }), /Spotify.*No se desinstala/);
  assert.match(describirNueva({ accion: 'cambiar_inicio', nombre: 'Spotify', activar: true }), /vuelva a abrirse/);
  assert.equal(describirNueva({ accion: 'terminar_proceso' }), null);
  assert.equal(describirNueva({ accion: 'limpiar_temporales' }), null);
});

test('papelera: describe el contenido, o dice que está vacía', () => {
  assert.equal(detallePapelera({ elementos: 1, mb: 5 }), '1 elemento (5 MB)');
  assert.equal(detallePapelera({ elementos: 12, mb: 2048 }), '12 elementos (2.0 GB)');
  assert.equal(detallePapelera({ elementos: 0, mb: 0 }), 'nada');
});

test('equipo: muestra modelo, sistema, procesador y memoria', () => {
  const p = panelEquipo({ fabricante: 'Dell Inc.', modelo: 'Latitude 3120', so: 'Windows 11 Home', version: '10.0.22631', cpu: 'Intel Pentium Silver', nucleos: 4, ramMb: 3912 });
  assert.equal(p.filas[0].titulo, 'Dell Inc. Latitude 3120');
  assert.match(p.filas[0].detalle, /Windows 11 Home · versión 10\.0\.22631/);
  assert.equal(p.filas.length, 3);
  assert.match(p.filas[2].titulo, /3\.8 GB de memoria/);
  assert.equal(panelEquipo({}).filas[0].titulo, 'Tu equipo');
});

test('inicio: solo los del usuario tienen botón y el botón cambia según el estado', () => {
  const p = panelInicio([
    { nombre: 'Spotify', comando: 'x', ambito: 'usuario', activo: true, puedeCambiar: true },
    { nombre: 'Discord', comando: 'x', ambito: 'usuario', activo: false, puedeCambiar: true },
    { nombre: 'SecurityHealth', comando: 'x', ambito: 'equipo', activo: true, puedeCambiar: false },
  ]);
  assert.match(p.estado, /3 programas de inicio y 2 están activos/);
  assert.deepEqual(p.filas[0].boton, { texto: 'Desactivar', tipo: 'cambiar_inicio', dato: { nombre: 'Spotify', activar: false } });
  assert.deepEqual(p.filas[1].boton, { texto: 'Activar', tipo: 'cambiar_inicio', dato: { nombre: 'Discord', activar: true } });
  assert.equal(p.filas[2].boton, undefined);
  assert.match(p.filas[2].pista.texto, /administrador/);
  assert.match(panelInicio([]).estado, /No veo programas/);
});

test('espacio: lista con botón para abrirlo en el Explorador', () => {
  const p = panelEspacio({ completa: false, elementos: [{ nombre: 'clases', ruta: 'C:/x/clases', carpeta: '~/Videos', esCarpeta: true, tamanoMb: 9200, diasSinUso: 3 }] });
  assert.match(p.estado, /9\.0 GB/);
  assert.match(p.estado, /Puede haber más/);
  assert.equal(p.filas[0].titulo, 'clases (carpeta)');
  assert.deepEqual(p.filas[0].boton, { texto: 'Ver', tipo: 'mostrar', dato: 'C:/x/clases' });
  assert.match(panelEspacio({ completa: true, elementos: [] }).estado, /No encontré/);
});

test('red: distingue sin internet, sin DNS, lenta y bien', () => {
  const ad = [{ nombre: 'Wi-Fi', tipo: 'Wi-Fi', velocidad: '866 Mbps' }];
  assert.match(panelRed({ internet: false, latenciaMs: null, dns: false, adaptadores: [] }).estado, /No logro salir a internet/);
  assert.match(panelRed({ internet: true, latenciaMs: 40, dns: false, adaptadores: ad }).estado, /DNS/);
  assert.match(panelRed({ internet: true, latenciaMs: 450, dns: true, adaptadores: ad }).estado, /450 ms: está lenta/);
  const bien = panelRed({ internet: true, latenciaMs: 48, dns: true, adaptadores: ad });
  assert.match(bien.estado, /responde bien \(48 ms\)/);
  assert.equal(bien.filas[0].titulo, 'Wi-Fi (Wi-Fi)');
});

test('dispositivos red: lista con IP y MAC, o dice que no hay', () => {
  const d = panelDispositivosRed([
    { ip: '192.168.1.1', mac: 'aa-bb-cc-dd-ee-ff', nombre: 'Router' },
    { ip: '192.168.1.50', mac: '11:22:33:44:55:66', nombre: '' },
  ], '192.168.1.50');
  assert.match(d.estado, /Tu IP local es 192\.168\.1\.50\./);
  assert.match(d.estado, /tabla ARP/);
  // La IP local se marca con emoji y texto
  assert.match(d.filas[1].titulo, /🖥/);
  assert.match(d.filas[1].detalle, /Esta es tu IP local/);
  // El gateway (.1) no se marca como local
  assert.equal(d.filas[0].titulo, '192.168.1.1');
  assert.match(d.filas[0].detalle, /Router/);
  assert.match(panelDispositivosRed([]).estado, /La tabla ARP no muestra dispositivos/);
});

test('dispositivos red: no adivina que el gateway es la IP local', () => {
  const d = panelDispositivosRed([
    { ip: '192.168.1.1', mac: 'aa-bb-cc-dd-ee-ff', nombre: 'Router' },
  ]);
  assert.match(d.estado, /No pude identificar tu IP local con certeza/);
  assert.doesNotMatch(d.estado, /Tu IP local es 192\.168\.1\.1\./);
  assert.equal(d.filas[0].titulo, '192.168.1.1');
  assert.doesNotMatch(d.filas[0].detalle, /Esta es tu IP local/);
});

test('dispositivos red: muestra la IP local aunque la tabla ARP esté vacía', () => {
  const d = panelDispositivosRed([], '192.168.1.29');
  assert.match(d.estado, /Tu IP local es 192\.168\.1\.29\./);
  assert.deepEqual(d.filas, []);
});

test('actualizaciones: cuenta, marca las críticas y nunca dice que instaló algo', () => {
  assert.match(panelActualizaciones([]).estado, /al día/);
  const p = panelActualizaciones([
    { titulo: 'Acumulativa', mb: 512, critica: true, reinicio: true },
    { titulo: 'Definiciones', mb: 28, critica: false, reinicio: false },
  ]);
  assert.match(p.estado, /2 actualizaciones pendientes \(hasta 540 MB\), 1 crítica/);
  assert.match(p.estado, /Alguna pide reiniciar/);
  assert.match(p.estado, /No instalé nada/);
  assert.match(p.filas[0].pista.texto, /Crítica/);
  assert.deepEqual(p.boton, { texto: 'Abrir Windows Update', tipo: 'ajuste', dato: 'actualizaciones' });
});

test('los nombres con trucos quedan como texto: el panel nunca arma HTML', () => {
  const p = panelInicio([{ nombre: '<img src=x onerror=alert(1)>', comando: 'x', ambito: 'usuario', activo: true, puedeCambiar: true }]);
  assert.equal(p.filas[0].titulo, '<img src=x onerror=alert(1)>'); // se pinta con textContent en main.js
});

test('pedidos cortos reconocidos sin modelo', () => {
  const casos = {
    vaciar_papelera: ['vaciá la papelera', 'limpiar la papelera'],
    ver_programas_inicio: ['qué programas se abren al iniciar', 'programas de inicio'],
    ver_actualizaciones: ['hay actualizaciones pendientes'],
    ver_estado_red: ['tengo internet', 'revisá mi wifi'],
    ver_reporte_soporte: ['haceme un reporte del equipo', 'quiero un informe para soporte técnico', 'armame un resumen de mi computadora para el técnico'],
    ver_info_equipo: ['qué pc tengo', 'qué procesador tiene', 'qué modelo de laptop tenía', 'cual modelo de mi computadora tengo', 'qué tipo de laptop tengo'],
    ver_espacio_carpetas: ['qué carpeta ocupa más', 'espacio por carpeta'],
    ver_dispositivos_red: ['cuál es mi ip', 'mi ip', 'mi dirección ip', 'qué dispositivos están conectados a la red', 'hay dispositivos conectados a la red'],
  };
  for (const [accion, frases] of Object.entries(casos)) {
    for (const f of frases) assert.equal(accionLocalNueva(f)?.proponer.accion, accion, f);
  }
  const ajuste = accionLocalNueva('abrime la configuración de almacenamiento');
  assert.equal(ajuste.proponer.accion, 'abrir_ajuste');
  assert.equal(ajuste.proponer.destino, 'almacenamiento');
  assert.ok(Object.keys(AJUSTES).includes(ajuste.proponer.destino));
  assert.equal(responderLocal('qué pc tengo', null).proponer.accion, 'ver_info_equipo'); // no hace falta la lectura del sistema
  assert.equal(responderLocal('qué tipo de laptop tengo', null).proponer.accion, 'ver_info_equipo');
  assert.equal(responderLocal('haceme un reporte del equipo', null).proponer.accion, 'ver_reporte_soporte');
});

test('charla normal, preguntas largas o dudosas no abren nada solas', () => {
  for (const q of ['hola', 'cuánta RAM tengo', 'la papelera de la cocina está llena', 'por qué mi internet es lento hoy en la noche cuando todos usan netflix en casa', 'abrí la configuración', '']) {
    assert.equal(accionLocalNueva(q), null, q);
  }
  assert.equal(responderLocal('qué información debe llevar un informe del equipo', null), null);
});

test('los textos fijos de las herramientas no usan diminutivos ni emojis', () => {
  const textos = [
    describirNueva({ accion: 'ver_info_equipo' }),
    describirNueva({ accion: 'ver_programas_inicio' }),
    describirNueva({ accion: 'vaciar_papelera' }),
    panelInicio([]).estado,
    panelRed({ internet: true, latenciaMs: 10, dns: true, adaptadores: [] }).estado,
    panelActualizaciones([]).estado,
    ...['vaciá la papelera', 'qué pc tengo', 'tengo internet', 'hay actualizaciones'].map((q) => accionLocalNueva(q).texto),
  ];
  for (const t of textos) {
    assert.doesNotMatch(t, SIN_DIMINUTIVOS, t);
    assert.doesNotMatch(t, /(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}/u, t);
  }
});

test('mismos falsos positivos descartados que en el backend', () => {
  for (const q of ['abrí el programa de inicio de sesión', 'hay actualizaciones de office', 'información del equipo de ventas', 'revisá la red del colegio', 'la red social está lenta']) {
    assert.equal(accionLocalNueva(q), null, q);
  }
  assert.equal(accionLocalNueva('hay actualizaciones de windows').proponer.accion, 'ver_actualizaciones');
});

test('actualizaciones: las definiciones del antivirus se instalan solas y no cuentan como pendientes', () => {
  const sola = { titulo: 'Security Intelligence Update for Microsoft Defender', mb: 1641, critica: false, reinicio: false, automatica: true };
  const solo = panelActualizaciones([sola]);
  assert.match(solo.estado, /al día/);
  assert.match(solo.estado, /1 del antivirus que se instala sola/);
  assert.match(solo.filas[0].pista.texto, /Se instala sola/);
  assert.match(solo.filas[0].detalle, /^hasta 1\.6 GB/);
  const mixto = panelActualizaciones([sola, { titulo: 'Acumulativa', mb: 512, critica: true, reinicio: true, automatica: false }]);
  assert.match(mixto.estado, /Hay 1 actualización pendiente \(hasta 512 MB\), 1 crítica/);
  assert.match(mixto.estado, /1 del antivirus que se instala sola/);
});
