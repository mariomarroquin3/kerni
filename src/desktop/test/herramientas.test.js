import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AJUSTES, describirNueva, detallePapelera, panelActualizaciones, panelEquipo, panelEspacio, panelInicio, panelRed } from '../web/herramientas.js';
import { accionLocalNueva, responderLocal } from '../web/intenciones.js';

const SIN_DIMINUTIVOS = /\b[a-záéíóúñ]{3,}(it|cit)[oa]s?\b/i;

test('la tarjeta de cada acción nueva dice qué va a pasar, y la que borra avisa que no se deshace', () => {
  for (const accion of ['ver_info_equipo', 'ver_programas_inicio', 'ver_espacio_carpetas', 'ver_estado_red', 'ver_actualizaciones']) {
    assert.match(describirNueva({ accion }), /^¿/, accion);
  }
  assert.match(describirNueva({ accion: 'ver_actualizaciones' }), /no descargo ni instalo/);
  assert.match(describirNueva({ accion: 'ver_estado_red' }), /no mando tus datos/);
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

test('actualizaciones: cuenta, marca las críticas y nunca dice que instaló algo', () => {
  assert.match(panelActualizaciones([]).estado, /al día/);
  const p = panelActualizaciones([
    { titulo: 'Acumulativa', mb: 512, critica: true, reinicio: true },
    { titulo: 'Definiciones', mb: 28, critica: false, reinicio: false },
  ]);
  assert.match(p.estado, /2 actualizaciones pendientes \(540 MB\), 1 crítica/);
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
    ver_info_equipo: ['qué pc tengo', 'qué procesador tiene'],
    ver_espacio_carpetas: ['qué carpeta ocupa más', 'espacio por carpeta'],
  };
  for (const [accion, frases] of Object.entries(casos)) {
    for (const f of frases) assert.equal(accionLocalNueva(f)?.proponer.accion, accion, f);
  }
  const ajuste = accionLocalNueva('abrime la configuración de almacenamiento');
  assert.equal(ajuste.proponer.accion, 'abrir_ajuste');
  assert.equal(ajuste.proponer.destino, 'almacenamiento');
  assert.ok(Object.keys(AJUSTES).includes(ajuste.proponer.destino));
  assert.equal(responderLocal('qué pc tengo', null).proponer.accion, 'ver_info_equipo'); // no hace falta la lectura del sistema
});

test('charla normal, preguntas largas o dudosas no abren nada solas', () => {
  for (const q of ['hola', 'cuánta RAM tengo', 'la papelera de la cocina está llena', 'por qué mi internet es lento hoy en la noche cuando todos usan netflix en casa', 'abrí la configuración', '']) {
    assert.equal(accionLocalNueva(q), null, q);
  }
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
