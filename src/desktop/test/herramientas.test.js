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

test('respuestas locales sin modelo: texto fijo y datos medidos', () => {
  const m = {
    cpu: 45.2,
    ram: { usadaMb: 3200, totalMb: 8192 },
    disco: { libreGb: 50, totalGb: 256 },
    procesos: [
      { nombre: 'Chrome', memoriaMb: 800, cpu: 12, pid: 1 },
      { nombre: 'Spotify', memoriaMb: 200, cpu: 2, pid: 2 },
      { nombre: 'Word', memoriaMb: 150, cpu: 1, pid: 3 },
    ],
    bateria: { porcentaje: 67, cargando: true, enchufada: false },
  };

  // --- Textos fijos: siempre responden, sin datos. ---
  assert.ok(responderLocal('hola', null)?.texto?.startsWith('¡Hola'));
  assert.ok(responderLocal('buenas', null)?.texto?.startsWith('¡Hola'));
  assert.ok(responderLocal('buenos días', null)?.texto?.startsWith('¡Hola'));
  assert.ok(responderLocal('buenas tardes', null)?.texto?.startsWith('¡Hola'));
  assert.ok(responderLocal('buenas noches', null)?.texto?.startsWith('¡Hola'));
  assert.ok(responderLocal('hey', null)?.texto?.startsWith('¡Hola'));
  // Negativos saludo
  assert.equal(responderLocal('hola, cómo estás', null), null);
  assert.equal(responderLocal('buenos días, ¿qué hora es?', null), null);

  // --- Positivos gracias ---
  assert.ok(responderLocal('gracias', null)?.texto?.startsWith('De nada'));
  assert.ok(responderLocal('muchas gracias', null)?.texto?.startsWith('De nada'));
  assert.ok(responderLocal('mil gracias', null)?.texto?.startsWith('De nada'));
  assert.ok(responderLocal('te agradezco', null)?.texto?.startsWith('De nada'));
  // Negativos gracias
  assert.equal(responderLocal('gracias, pero por qué va lenta mi pc', null), null);

  // --- Positivo qué puedes ---
  assert.ok(responderLocal('qué puedes hacer', null)?.texto?.length > 10);
  // Negativo qué puedes
  assert.equal(responderLocal('y qué haces cuando el disco se llena', null), null);

  // --- Positivos hora ---
  assert.match(responderLocal('qué hora es', null)?.texto, /El Salvador/);
  assert.match(responderLocal('qué hora son', null)?.texto, /El Salvador/);
  assert.match(responderLocal('hora actual', null)?.texto, /El Salvador/);
  assert.match(responderLocal('hora en el salvador', null)?.texto, /El Salvador/);
  // Negativo hora
  assert.equal(responderLocal('a qué hora cierra el banco', null), null);
  assert.equal(responderLocal('qué hora será en Nueva York', null), null);

  // --- Positivos RAM ---
  assert.match(responderLocal('cuánta ram uso', m)?.texto, /39 %/);
  assert.match(responderLocal('cuánta ram estoy usando', m)?.texto, /39 %/);
  assert.match(responderLocal('cómo está la ram', m)?.texto, /39 %/);
  assert.match(responderLocal('cómo está la memoria', m)?.texto, /39 %/);
  // Negativos RAM obligatorios (sin datos → null)
  assert.equal(responderLocal('cuánta ram uso', null), null);
  // Negativos RAM adicionales
  assert.equal(responderLocal('cuánta ram usa chrome', null), null);
  assert.equal(responderLocal('cuánta ram debería tener', null), null);
  assert.equal(responderLocal('qué hago con la ram llena', null), null);

  // --- Positivos CPU ---
  assert.match(responderLocal('cuánta cpu uso', m)?.texto, /45 %/);
  assert.match(responderLocal('cuánta cpu estoy usando', m)?.texto, /45 %/);
  assert.match(responderLocal('cpu actual', m)?.texto, /45 %/);
  assert.match(responderLocal('cómo está la cpu', m)?.texto, /45 %/);
  // Negativo CPU
  assert.equal(responderLocal('cuánta cpu necesito para jugar', m), null);

  // --- Positivos top_mem ---
  assert.match(responderLocal('que programa consume mas ram', m)?.texto, /800 MB/);
  assert.match(responderLocal('que proceso usa mas memoria', m)?.texto, /800 MB/);
  assert.match(responderLocal('que app ocupa mas ram', m)?.texto, /800 MB/);
  // Negativos top_mem obligatorios
  assert.equal(responderLocal('que tanta memoria usa chrome', m), null);
  assert.equal(responderLocal('cuanta ram usa chrome', m), null);
  assert.equal(responderLocal('programa para monitorear la cpu', m), null);

  // --- Positivos top_cpu ---
  assert.match(responderLocal('que programa consume mas cpu', m)?.texto, /12\.0 %/);
  assert.match(responderLocal('que proceso usa mas cpu', m)?.texto, /12\.0 %/);
  assert.match(responderLocal('que app ocupa mas cpu', m)?.texto, /12\.0 %/);

  // --- Positivos batería ---
  assert.match(responderLocal('como esta la bateria', m)?.texto, /67 %.*cargando/);
  assert.match(responderLocal('cuanta bateria tengo', m)?.texto, /67 %/);
  assert.match(responderLocal('cuanta bateria me queda', m)?.texto, /67 %/);
  assert.match(responderLocal('cual es la bateria', m)?.texto, /67 %/);
  // Negativo batería
  assert.equal(responderLocal('como esta la bateria de mi hermana', m), null);
});

test('charla normal, preguntas largas o dudosas no abren nada solas', () => {
  for (const q of ['la papelera de la cocina está llena', 'por qué mi internet es lento hoy en la noche cuando todos usan netflix en casa', 'abrí la configuración', '']) {
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
