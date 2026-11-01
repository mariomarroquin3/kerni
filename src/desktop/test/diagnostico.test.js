// Diagnóstico de solo lectura (ver_arranque y las que siguen): textos de la tarjeta, paneles y pedidos locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describirNueva, panelArranque, panelConsumoBateria, panelDuplicados, panelProgramasSinUso, panelPuntos, panelSaludDisco, ACCIONES_PANEL } from '../web/herramientas.js';
import { accionLocalNueva, responderLocal } from '../web/intenciones.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const leer = (...ruta) => readFileSync(join(AQUI, '..', ...ruta), 'utf8');
const lib = leer('src-tauri', 'src', 'lib.rs');
const main = leer('web', 'main.js');

test('ver_arranque: la tarjeta dice que solo mira y no cambia nada', () => {
  assert.match(describirNueva({ accion: "ver_arranque" }), /No cambio nada/);
  assert.ok(ACCIONES_PANEL.includes('ver_arranque'));
});

test('ver_arranque: dice cuánto tardó, o que no lo puede medir sin inventar una duración', () => {
  const p = panelArranque({ duracionS: 48.2, fecha: '2026-10-31T08:02:11', programasActivos: 7, programasTotal: 12, nota: 'Lo tomé del último registro de arranque de Windows.' });
  assert.match(p.estado, /tardó 48 segundos/);
  assert.match(p.estado, /7 de 12 programas/);
  assert.match(p.estado, /ayuda a que prenda/);
  assert.equal(p.filas[0].detalle, '2026-10-31 08:02:11');
  const sin = panelArranque({ duracionS: null, fecha: null, programasActivos: 2, programasTotal: 3, nota: 'No encuentro el registro de tiempos de arranque de Windows. Puede que haga falta administrador.' });
  assert.match(sin.estado, /No pude medir/);
  assert.match(sin.estado, /administrador/);
  assert.doesNotMatch(sin.estado, /tardó \d/);
  assert.deepEqual(sin.filas, []);
});

test('ver_arranque: "¿por qué tarda en prender?" abre la tarjeta sin modelo; "la compu tarda en prender" sigue siendo la lista de inicio', () => {
  assert.equal(accionLocalNueva('¿por qué tarda en prender?')?.proponer.accion, 'ver_arranque');
  assert.equal(accionLocalNueva('cuánto tarda en prender la compu')?.proponer.accion, 'ver_arranque');
  assert.equal(accionLocalNueva('la compu tarda en prender')?.proponer.accion, 'ver_programas_inicio');
});

test('ver_arranque: está registrado en lib.rs (dos listas) y la interfaz lo llama y lo muestra', () => {
  assert.equal([...lib.matchAll(/diagnostico::ver_arranque,/g)].length, 2);
  assert.match(lib, /^mod diagnostico;/m);
  assert.ok(main.includes("llamar('ver_arranque'"));
  assert.match(main, /ver_arranque: verArranque/);
});

test('ver_salud_disco: la tarjeta dice que solo mira y "¿cómo está el disco?" la abre sin modelo', () => {
  assert.match(describirNueva({ accion: 'ver_salud_disco' }), /no pruebo, no reparo ni borro nada/);
  assert.ok(ACCIONES_PANEL.includes('ver_salud_disco'));
  assert.equal(accionLocalNueva('¿cómo está el disco?')?.proponer.accion, 'ver_salud_disco');
  assert.equal(accionLocalNueva('cómo está el disco lleno'), null);
});

test('ver_salud_disco: separa alerta de sin alertas y nunca dice "sano"', () => {
  const alerta = panelSaludDisco({ discos: [{ nombre: 'HDD', tipo: 'HDD', gb: 1000, nivel: 'alerta', motivos: ['Windows marca advertencia en la salud del disco'], temperaturaC: null, desgastePct: null, erroresLectura: null, datosParciales: false }], nota: '' });
  assert.match(alerta.estado, /alerta. Respaldá tus archivos ya/);
  assert.match(alerta.filas[0].pista.texto, /Respaldá ya/);
  const ok = panelSaludDisco({ discos: [{ nombre: 'SSD', tipo: 'SSD', gb: 476, nivel: 'sin_alertas', motivos: [], temperaturaC: 34, desgastePct: 3, erroresLectura: 0, datosParciales: false }], nota: '' });
  assert.match(ok.estado, /Sin alertas en tus discos/);
  assert.doesNotMatch(ok.estado + JSON.stringify(ok.filas), /sano/i);
  const vacio = panelSaludDisco({ discos: [], nota: 'No pude leer los discos de esta PC: Tardó demasiado y lo cancelé' });
  assert.match(vacio.estado, /No pude leer/);
});

test('ver_salud_disco: registrado en lib.rs (dos listas) y la interfaz lo llama', () => {
  assert.equal([...lib.matchAll(/diagnostico::ver_salud_disco,/g)].length, 2);
  assert.ok(main.includes("llamar('ver_salud_disco'"));
  assert.match(main, /ver_salud_disco: verSaludDisco/);
});

test('ver_puntos_restauracion: la tarjeta dice que no crea ni borra, y el pedido corto abre la lista', () => {
  assert.match(describirNueva({ accion: 'ver_puntos_restauracion' }), /no creo ni borro ninguno/);
  assert.ok(ACCIONES_PANEL.includes('ver_puntos_restauracion'));
  assert.equal(accionLocalNueva('¿puedo volver atrás si algo sale mal?')?.proponer.accion, 'ver_puntos_restauracion');
  assert.equal(accionLocalNueva('cómo puedo volver atrás'), null);
});

test('ver_puntos_restauracion: lista los puntos del más nuevo, o dice por qué no hay', () => {
  const p = panelPuntos({ puntos: [
    { numero: 5, descripcion: 'Controlador GPU', fecha: '2026-10-28T18:01:00', tipo: 'instalación de un controlador' },
    { numero: 4, descripcion: 'Instalación de Office', fecha: '2026-10-20T09:15:00', tipo: 'instalación de un programa' },
  ], nota: 'Solo los listo.' });
  assert.match(p.estado, /Hay 2 puntos de restauración/);
  assert.match(p.estado, /más nuevo es del 2026-10-28 18:01:00/);
  assert.match(p.estado, /decidís vos desde Windows/);
  assert.equal(p.filas[0].titulo, 'Controlador GPU');
  const vacio = panelPuntos({ puntos: [], nota: 'No hay puntos de restauración. Windows no los crea si la protección del sistema está desactivada.' });
  assert.match(vacio.estado, /protección del sistema está desactivada/);
  assert.deepEqual(vacio.filas, []);
});

test('ver_puntos_restauracion: registrado en lib.rs (dos listas) y la interfaz lo llama', () => {
  assert.equal([...lib.matchAll(/diagnostico::ver_puntos_restauracion,/g)].length, 2);
  assert.ok(main.includes("llamar('ver_puntos_restauracion'"));
  assert.match(main, /ver_puntos_restauracion: verPuntos/);
});

test('ver_duplicados_posibles: la tarjeta dice que no borra, y "archivos repetidos" abre la lista sin modelo', () => {
  assert.match(describirNueva({ accion: 'ver_duplicados_posibles' }), /no abro ni leo|no abrir ni leer|no borro nada/);
  assert.ok(ACCIONES_PANEL.includes('ver_duplicados_posibles'));
  assert.equal(accionLocalNueva('tengo archivos repetidos')?.proponer.accion, 'ver_duplicados_posibles');
  assert.equal(accionLocalNueva('cómo borro archivos duplicados'), null);
});

test('ver_duplicados_posibles: rotula cada grupo como posibles duplicados y ofrece Ver por copia', () => {
  const p = panelDuplicados({ grupos: [{ nombre: 'foto.jpg', tamanoMb: 2.1, cantidad: 2, totalMb: 4.2, copias: [{ ruta: 'C:/a/foto.jpg', carpeta: '~/Downloads' }, { ruta: 'C:/b/foto.jpg', carpeta: '~/Pictures' }] }], completa: true, nota: 'Revisá antes de borrar.' });
  assert.match(p.estado, /posibles duplicados, revisá antes de borrar/);
  assert.equal(p.filas[0].titulo, 'Grupo 1: foto.jpg (2 copias)');
  assert.equal(p.filas[1].boton.tipo, 'mostrar');
  assert.equal(p.filas[1].boton.dato, 'C:/a/foto.jpg');
  const vacio = panelDuplicados({ grupos: [], nota: 'No encontré archivos con el mismo nombre y tamaño.' });
  assert.match(vacio.estado, /No encontré/);
  assert.deepEqual(vacio.filas, []);
});

test('ver_duplicados_posibles: registrado en lib.rs (dos listas) y la interfaz lo llama', () => {
  assert.equal([...lib.matchAll(/diagnostico::ver_duplicados_posibles,/g)].length, 2);
  assert.ok(main.includes("llamar('ver_duplicados_posibles'"));
  assert.match(main, /ver_duplicados_posibles: verDuplicados/);
});

test('ver_programas_sin_uso: la tarjeta dice que no desinstala, y el panel avisa que no hay último uso', () => {
  assert.match(describirNueva({ accion: 'ver_programas_sin_uso' }), /no desinstalo nada/);
  const p = panelProgramasSinUso({ programas: [{ nombre: 'Git', version: '2.4', editor: 'Git', instalado: '2022-03-01' }], total: 1, nota: 'Windows no me dice cuándo usaste cada programa sin permisos de administrador.' });
  assert.match(p.estado, /administrador/);
  assert.match(p.estado, /1 programa instalado/);
  assert.equal(p.filas[0].titulo, 'Git');
  assert.match(p.filas[0].detalle, /instalado el 2022-03-01/);
  const sinFecha = panelProgramasSinUso({ programas: [{ nombre: 'Viejo', version: '', editor: '', instalado: null }], total: 3 });
  assert.match(sinFecha.filas[0].detalle, /fecha de instalación desconocida/);
  assert.equal(sinFecha.filas[1].titulo, 'Y 2 más');
});

test('ver_programas_sin_uso: "programas sin usar" es un pedido de programas, no la lista de archivos pesados', () => {
  const medida = { cpu: 10, ram: { usadaMb: 4000, totalMb: 16000 }, disco: { libreGb: 100, totalGb: 500 }, procesos: [] };
  assert.equal(accionLocalNueva('programas que no uso')?.proponer.accion, 'ver_programas_sin_uso');
  assert.equal(responderLocal('programas sin usar', medida)?.proponer?.accion, 'ver_programas_sin_uso');
  assert.equal(responderLocal('qué programas puedo borrar', medida)?.proponer?.accion, 'ver_programas_sin_uso');
  assert.equal(responderLocal('qué archivos sin usar tengo', medida)?.proponer?.accion, 'ver_archivos_pesados');
  assert.equal(accionLocalNueva('explicame por qué programas sin usar'), null);
});

test('ver_programas_sin_uso: registrado en lib.rs (dos listas) y la interfaz lo llama', () => {
  assert.equal([...lib.matchAll(/diagnostico::ver_programas_sin_uso,/g)].length, 2);
  assert.ok(main.includes("llamar('ver_programas_sin_uso'"));
  assert.match(main, /ver_programas_sin_uso: verProgramasSinUso/);
});

test('ver_consumo_bateria: la tarjeta dice que no cierra nada, y las frases de batería abren la tarjeta sin modelo', () => {
  assert.match(describirNueva({ accion: 'ver_consumo_bateria' }), /no cierro nada/);
  assert.ok(ACCIONES_PANEL.includes('ver_consumo_bateria'));
  assert.equal(accionLocalNueva('qué consume la batería')?.proponer.accion, 'ver_consumo_bateria');
  assert.equal(accionLocalNueva('me dura poco la batería')?.proponer.accion, 'ver_consumo_bateria');
  const medida = { cpu: 10, ram: { usadaMb: 4000, totalMb: 16000 }, disco: { libreGb: 100, totalGb: 500 }, procesos: [], bateria: { porcentaje: 50, cargando: false, enchufada: false } };
  assert.equal(responderLocal('cuánta batería tengo', medida)?.proponer, undefined);
});

test('ver_consumo_bateria: en un escritorio dice que no tiene batería; en una laptop muestra el dato como aproximado', () => {
  const escritorio = panelConsumoBateria({ hayBateria: false, nota: 'Esta PC no tiene batería.' });
  assert.equal(escritorio.estado, 'Esta PC no tiene batería.');
  assert.deepEqual(escritorio.filas, []);
  const laptop = panelConsumoBateria({ hayBateria: true, porcentaje: 62, cargando: false, enchufada: false, programas: [{ nombre: 'chrome.exe', cpuPromedio: 12.44 }], muestras: 3 });
  assert.match(laptop.estado, /62 %/);
  assert.match(laptop.estado, /aproximado, según la CPU de cada programa/);
  assert.equal(laptop.filas[0].titulo, 'chrome.exe');
  assert.equal(laptop.filas[0].detalle, '12.4 % de CPU en promedio');
});

test('ver_consumo_bateria: registrado en lib.rs (dos listas) y la interfaz lo llama', () => {
  assert.equal([...lib.matchAll(/diagnostico::ver_consumo_bateria,/g)].length, 2);
  assert.ok(main.includes("llamar('ver_consumo_bateria'"));
  assert.match(main, /ver_consumo_bateria: verBateria/);
});
