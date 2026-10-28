import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { armarReporte, describirNueva, DIAS_SIN_REINICIAR, panelReporte, tiempoEncendida } from '../web/herramientas.js';
import { avisoReinicio } from '../web/reglas.js';
import { accionLocalNueva } from '../web/intenciones.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const leer = (...ruta) => readFileSync(join(AQUI, '..', ...ruta), 'utf8');

const equipo = { fabricante: 'Dell Inc.', modelo: 'Latitude 3120', so: 'Microsoft Windows 11 Home', version: '10.0.22631', cpu: 'Intel Pentium Silver N6000', nucleos: 4 };
const metricas = {
  ram: { usadaMb: 3000, totalMb: 3912 },
  disco: { libreGb: 38.2, totalGb: 119 },
  bateria: { porcentaje: 85, cargando: false, enchufada: true },
  encendidaS: 12 * 86400 + 3600,
  procesos: [
    { nombre: 'svchost.exe', memoriaMb: 80 }, { nombre: 'chrome.exe', memoriaMb: 1200 }, { nombre: 'Code.exe', memoriaMb: 850 },
    { nombre: 'a.exe', memoriaMb: 1 }, { nombre: 'b.exe', memoriaMb: 2 }, { nombre: 'c.exe', memoriaMb: 3 },
  ],
};
const inicio = [
  { nombre: 'OneDrive', activo: true }, { nombre: 'Spotify', activo: true }, { nombre: 'Discord', activo: false },
];
const red = { internet: true, latenciaMs: 48, dns: true, adaptadores: [{ nombre: 'Wi-Fi', tipo: 'Wi-Fi', velocidad: '866 Mbps' }] };

test('el reporte junta equipo, memoria, disco, inicio y red, en texto plano', () => {
  const t = armarReporte({ fecha: new Date(2026, 9, 28, 14, 5), equipo, metricas, inicio, red });
  assert.match(t, /^Resumen del equipo para soporte \(armado por Kerni el 28\/10\/2026 14:05\)/);
  assert.match(t, /Equipo: Dell Inc\. Latitude 3120/);
  assert.match(t, /Sistema: Microsoft Windows 11 Home \(versión 10\.0\.22631\)/);
  assert.match(t, /Procesador: Intel Pentium Silver N6000 \(4 núcleos\)/);
  assert.match(t, /Memoria: 3\.8 GB instalada, 2\.9 GB en uso \(77 %\)/);
  assert.match(t, /Disco principal: 38\.2 GB libres de 119\.0 GB \(68 % usado\)/);
  assert.match(t, /Batería: 85 % \(enchufada\)/);
  assert.match(t, /Encendida desde el último arranque completo: 12 días/);
  assert.match(t, /Procesos que más memoria usan: chrome\.exe \(1\.2 GB\), Code\.exe \(0\.8 GB\), svchost\.exe/);
  assert.match(t, /Programas que se abren al iniciar Windows: 2 activos de 3 \(OneDrive, Spotify\)/);
  assert.match(t, /Red: con internet, respuesta de 48 ms; conexión Wi-Fi 866 Mbps/);
  assert.match(t, /No incluye las actualizaciones de Windows/);
});

test('lo que no se pudo leer no aparece y nada se inventa; sin internet lo dice', () => {
  const t = armarReporte({ fecha: new Date(2026, 0, 2, 3, 4), equipo: { modelo: 'X1' }, red: { internet: false, adaptadores: [] } });
  assert.match(t, /^Resumen del equipo para soporte \(armado por Kerni el 02\/01\/2026 03:04\)/);
  assert.match(t, /Equipo: X1/);
  assert.match(t, /Red: sin internet/);
  for (const ausente of [/Memoria:/, /Disco/, /Batería/, /Sistema:/, /Procesador:/, /Programas que se abren/]) assert.doesNotMatch(t, ausente);
  assert.doesNotThrow(() => armarReporte());
});

test('el reporte no lleva rutas, comandos ni nombre de usuario', () => {
  const t = armarReporte({
    equipo, metricas, red,
    inicio: [{ nombre: 'Spotify', comando: 'C:\\Users\\mario\\AppData\\Roaming\\Spotify\\Spotify.exe', activo: true }],
  });
  assert.doesNotMatch(t, /C:\\|Users|mario|AppData/);
});

test('el panel ofrece copiar el texto exacto y muestra cada línea completa', () => {
  const texto = armarReporte({ equipo, red });
  const p = panelReporte(texto);
  assert.deepEqual(p.boton, { texto: 'Copiar resumen', tipo: 'copiar', dato: texto });
  assert.ok(p.filas.every((f) => f.largo === true));
  assert.match(p.estado, /Se copia solo si tocás el botón/);
  assert.match(describirNueva({ accion: 'ver_reporte_soporte' }), /solo se copia si vos tocás el botón/);
});

test('cuánto lleva encendida: días, horas o minutos', () => {
  assert.equal(tiempoEncendida(86400), '1 día');
  assert.equal(tiempoEncendida(3 * 86400 + 5), '3 días');
  assert.equal(tiempoEncendida(5 * 3600), '5 horas');
  assert.equal(tiempoEncendida(3600), '1 hora');
  assert.equal(tiempoEncendida(10), '1 minuto');
  assert.equal(tiempoEncendida(40 * 60), '40 minutos');
});

test('aviso de reinicio: desde los 7 días, dice cuántos y explica que Apagar no siempre alcanza', () => {
  assert.equal(DIAS_SIN_REINICIAR, 7);
  assert.equal(avisoReinicio(6 * 86400 + 86399), null);
  const a = avisoReinicio(7 * 86400);
  assert.equal(a.dias, 7);
  assert.match(a.texto, /lleva 7 días sin reiniciarse/);
  assert.match(a.texto, /Apagar no siempre alcanza/);
  assert.match(a.texto, /Guardá tu trabajo/);
  assert.equal(avisoReinicio(30 * 86400).dias, 30);
  assert.equal(avisoReinicio(undefined), null);
  assert.equal(avisoReinicio(NaN), null);
  assert.equal(avisoReinicio(10 * 86400, 14), null); // umbral configurable
  assert.doesNotMatch(a.texto, /\b[a-záéíóúñ]{3,}(it|cit)[oa]s?\b|\p{Extended_Pictographic}/u);
});

test('pedidos cortos del reporte se reconocen sin modelo, y "soporte" a secas no', () => {
  for (const q of ['reporte para soporte técnico', 'resumen para el técnico', 'armame un informe para soporte']) {
    assert.equal(accionLocalNueva(q)?.proponer.accion, 'ver_reporte_soporte', q);
  }
  assert.equal(accionLocalNueva('necesito soporte'), null);
});

test('cableado: menú, evento, vista, copiar al portapapeles, aviso diario y dato de arranque en Rust', () => {
  const lib = leer('src-tauri', 'src', 'lib.rs');
  const main = leer('web', 'main.js');
  const sistema = leer('src-tauri', 'src', 'sistema.rs');
  assert.ok(lib.includes('MenuItem::with_id(app, "reporte"'));
  assert.ok(lib.includes('"reporte" => avisar_a_kerni(app, "pedir-reporte")'));
  assert.ok(main.includes("listen('pedir-reporte', verReporte)"));
  assert.match(main, /ver_reporte_soporte: verReporte/);
  assert.match(main, /navigator\.clipboard\.writeText\(texto\)/);
  assert.match(main, /localStorage\.getItem\('kerni\.avisoReinicio'\)/); // como mucho una vez al día
  assert.match(sistema, /encendida_s: System::uptime\(\)/);
  assert.match(sistema, /pub encendida_s: u64/);
  // el reporte nunca se manda solo: copiar es un botón
  assert.doesNotMatch(main, /fetch\([^)]*reporte/i);
});
