import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ACCIONES_PANEL, describirNueva, panelSaludBateria, panelSeguridad } from '../web/herramientas.js';
import { EXPLICACIONES } from '../web/explicaciones.js';
import { responderLocal } from '../web/intenciones.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const leer = (...ruta) => readFileSync(join(AQUI, '..', ...ruta), 'utf8').replaceAll('\r\n', '\n');

const SIN_DIMINUTIVOS = /\b[a-záéíóúñ]{3,}(it|cit)[oa]s?\b/i;
const NUEVAS = ['ver_salud_bateria', 'ver_estado_seguridad'];

test('las dos acciones tienen tarjeta, explicación y panel, y avisan que solo leen', () => {
  for (const accion of NUEVAS) {
    assert.ok(ACCIONES_PANEL.includes(accion), accion);
    assert.match(describirNueva({ accion }), /^¿.*Solo leo/s, accion);
    assert.ok(EXPLICACIONES[accion]?.length > 40, `falta la explicación de ${accion}`);
    assert.doesNotMatch(`${describirNueva({ accion })} ${EXPLICACIONES[accion]}`, SIN_DIMINUTIVOS);
  }
  assert.match(EXPLICACIONES.ver_estado_seguridad, /no garantiza/);
});

test('batería: dice cuánto conserva, en Wh y ciclos, y aconseja según el desgaste sin exagerar', () => {
  const gastada = panelSaludBateria({ tiene: true, nombre: 'DELL XPHX837', disenoMwh: 54000, cargaMwh: 36390, ciclos: 456, saludPct: 67, nivel: 'desgaste', nota: 'Conserva el 67 %…' });
  assert.equal(gastada.filas[0].titulo, 'Conserva el 67 % de su capacidad original');
  assert.match(gastada.filas[1].titulo, /Carga hoy 36\.4 Wh de 54 Wh/);
  assert.match(gastada.filas[2].titulo, /456 ciclos de carga/);
  assert.equal(gastada.filas[0].pista.nivel, 'revisar');
  const mala = panelSaludBateria({ tiene: true, disenoMwh: 50000, cargaMwh: 20000, saludPct: 40, nivel: 'muy_gastada', nota: 'x' });
  assert.equal(mala.filas[0].pista.nivel, 'respaldar');
  assert.match(mala.filas[0].pista.texto, /cambiarla pronto/);
  const buena = panelSaludBateria({ tiene: true, disenoMwh: 50000, cargaMwh: 47000, saludPct: 94, nivel: 'buena', nota: 'x' });
  assert.equal(buena.filas[0].pista, undefined);
  assert.equal(buena.filas[0].detalle, 'Desgaste normal');
});

test('batería: sin batería o sin datos lo dice y no inventa porcentajes', () => {
  assert.deepEqual(panelSaludBateria({ tiene: false, nota: 'Esta PC no tiene batería.' }), { estado: 'Esta PC no tiene batería.', filas: [] });
  assert.equal(panelSaludBateria({}).estado, 'Esta PC no tiene batería.');
  const sinDatos = panelSaludBateria({ tiene: true, saludPct: null, nivel: 'sin_datos', nota: 'Windows no me dio la capacidad original.' });
  assert.equal(sinDatos.filas.length, 0);
  assert.match(sinDatos.estado, /no me dio la capacidad/);
});

test('seguridad: marca lo que hay que revisar y lo que no se pudo comprobar, sin decir "protegido"', () => {
  const r = panelSeguridad({
    alertas: 1,
    nota: 'Hay 1 cosa para revisar. Kerni solo mira: no cambia ninguna configuración.',
    revisiones: [
      { nombre: 'Antivirus', estado: 'ok', detalle: 'Windows Defender está activo con protección en tiempo real.' },
      { nombre: 'Cortafuegos', estado: 'alerta', detalle: 'El cortafuegos de Windows está apagado en: redes públicas.' },
      { nombre: 'Control de cuentas (UAC)', estado: 'sin_dato', detalle: 'No pude leer si está activado.' },
    ],
  });
  assert.equal(r.filas.length, 3);
  assert.equal(r.filas[0].pista, undefined);
  assert.deepEqual(r.filas[1].pista, { nivel: 'respaldar', texto: 'Para revisar' });
  assert.equal(r.filas[2].pista.nivel, 'info');
  assert.match(r.estado, /Hay 1 cosa para revisar/);
  assert.doesNotMatch(JSON.stringify(r).toLowerCase(), /protegid|estás seguro|es seguro/);
  assert.match(panelSeguridad({ revisiones: [], nota: 'No pude leer el estado de seguridad de esta PC: x' }).estado, /No pude leer/);
  assert.equal(panelSeguridad().filas.length, 0);
});

test('los textos que viene del sistema se pintan con textContent (el panel nunca arma HTML)', () => {
  const r = panelSeguridad({ revisiones: [{ nombre: 'Antivirus', estado: 'sin_dato', detalle: 'Usás <img src=x onerror=alert(1)>: no puedo ver si está al día.' }] });
  assert.match(r.filas[0].detalle, /<img/); // llega como texto; main.js lo pinta con textContent
  assert.doesNotMatch(leer('web', 'main.js'), /innerHTML/);
});

test('pedidos cortos: los reconoce la interfaz sin modelo, y "cómo está la batería" sigue siendo el nivel de carga', () => {
  const casos = {
    ver_salud_bateria: ['salud de la batería', 'estado de mi batería', 'mi batería está gastada'],
    ver_estado_seguridad: ['revisá la seguridad de mi pc', 'estoy protegido?', 'tengo antivirus', 'está activo el antivirus'],
  };
  for (const [accion, frases] of Object.entries(casos)) {
    for (const f of frases) assert.equal(responderLocal(f, null)?.proponer?.accion, accion, f);
  }
  const m = { cpu: 1, ram: { usadaMb: 1, totalMb: 2 }, disco: { libreGb: 100, totalGb: 500 }, procesos: [], bateria: { porcentaje: 67, cargando: true, enchufada: false } };
  assert.match(responderLocal('cómo está la batería', m).texto, /67 %/); // dato medido: no abre ninguna tarjeta
  assert.equal(responderLocal('cómo está la batería', m).proponer, undefined);
  for (const q of ['cuál es el mejor antivirus', 'cómo activo el firewall', 'recomendame un antivirus gratis', 'por qué necesito un antivirus', 'explicame la salud de la batería']) {
    assert.ok(!NUEVAS.includes(responderLocal(q, null)?.proponer?.accion), q);
  }
});

test('cableado: Rust los registra dos veces, main.js los llama y los mapea, y el backend los conoce', () => {
  const lib = leer('src-tauri', 'src', 'lib.rs');
  const main = leer('web', 'main.js');
  const backend = leer('..', 'backend', 'src', 'acciones.js');
  const diag = leer('src-tauri', 'src', 'diagnostico.rs');
  for (const comando of NUEVAS) {
    assert.equal([...lib.matchAll(new RegExp(`diagnostico::${comando},`, 'g'))].length, 2, comando);
    assert.ok(main.includes(`llamar('${comando}')`), `main.js no llama a ${comando}`);
    assert.match(main, new RegExp(`${comando}: ver`), `${comando} no está en el mapa de vistas`);
    assert.ok(backend.includes(`'${comando}'`), `el backend no conoce ${comando}`);
    assert.ok(diag.includes(`pub async fn ${comando}()`), `Rust no define ${comando}`);
  }
  // solo leen: ningún guion cambia configuración
  assert.doesNotMatch(diag.slice(diag.indexOf('GUION_BATERIA'), diag.indexOf('mod tests_bateria_seguridad')), /Set-MpPreference|Set-NetFirewallProfile|Enable-|Disable-/);
});
