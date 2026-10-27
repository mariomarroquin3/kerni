// Prueba de integración contra la app Tauri REAL, desde dentro de su WebView.
//
// Cómo: arranca la app con la depuración remota de WebView2 activada y este script se conecta
// por el protocolo CDP (WebSocket) a la página que muestra la ventana de Kerni.
//
//   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'; npm run dev
//   node scripts/probar-tauri.mjs [puerto] [--captura ruta.png]
//
// Comprueba que los comandos de Rust responden con datos reales, que Rive cargó y dibujó, que el
// cambio de modo llega al rig, y que no hay errores en la consola. Sale con código 1 si algo falla.
import { writeFileSync } from 'node:fs';

const puerto = process.argv.find((a) => /^\d+$/.test(a)) ?? '9222';
const iCaptura = process.argv.indexOf('--captura');
const captura = iCaptura > 0 ? process.argv[iCaptura + 1] : null;

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
const ok = (cond, texto, detalle = '') => {
  console.log(`${cond ? '  ok  ' : ' FALLA'} ${texto}${detalle ? ` — ${detalle}` : ''}`);
  if (!cond) fallos += 1;
};

async function paginas() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${puerto}/json`);
      const lista = (await r.json()).filter((p) => p.type === 'page');
      if (lista.length) return lista;
    } catch { /* la app todavía arranca */ }
    await pausa(1500);
  }
  throw new Error(`no encuentro el WebView en el puerto ${puerto}: ¿arrancó la app con la depuración remota?`);
}

const pagina = (await paginas()).find((p) => /Kerni|tauri|localhost|index/i.test(p.title + p.url)) ?? (await paginas())[0];
console.log(`Página: "${pagina.title}"  ${pagina.url}`);

const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('no abrió el WebSocket de CDP')); });
let id = 0;
const pendientes = new Map();
const consola = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
    consola.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  }
  if (m.method === 'Runtime.exceptionThrown') consola.push(`excepción: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
};
const cdp = (method, params = {}) => new Promise((res) => { const n = ++id; pendientes.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluar = async (expresion) => {
  const r = await cdp('Runtime.evaluate', { expression: expresion, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'error al evaluar');
  return r.result.result.value;
};

await cdp('Runtime.enable');
await pausa(3000); // que cargue Rive y entre la primera lectura

console.log('\nEntorno');
ok(await evaluar('Boolean(window.__TAURI_INTERNALS__)'), 'la página corre dentro de Tauri (no es un navegador)');

console.log('\nComandos de Rust');
const m = await evaluar(`window.__TAURI_INTERNALS__.invoke('metricas')`);
ok(m && m.ram?.totalMb > 0 && m.ram.usadaMb <= m.ram.totalMb, 'metricas: RAM real', m && `${Math.round(m.ram.usadaMb)} / ${Math.round(m.ram.totalMb)} MB`);
ok(m && m.disco?.totalGb > 0, 'metricas: disco real', m && `${m.disco.libreGb.toFixed(0)} GB libres de ${m.disco.totalGb.toFixed(0)}`);
ok(m && m.cpu >= 0 && m.cpu <= 100, 'metricas: CPU en rango', m && `${m.cpu.toFixed(0)}%`);
ok(m && m.procesos.length > 0 && m.procesos.length <= 15, 'metricas: lista de procesos', m && `${m.procesos.length} procesos, el mayor: ${m.procesos[0]?.nombre}`);
ok(m && m.procesos.every((p) => typeof p.protegido === 'boolean' && p.pid > 0), 'metricas: cada proceso trae pid y marca de protegido');

const protegido = await evaluar(`window.__TAURI_INTERNALS__.invoke('terminar_proceso', { pid: 4, nombre: 'System' }).then(() => 'SE CERRO', (e) => String(e))`);
ok(/protegido/.test(protegido), 'terminar_proceso rechaza un proceso protegido', protegido);
const fantasma = await evaluar(`window.__TAURI_INTERNALS__.invoke('terminar_proceso', { pid: 4294967000, nombre: 'fantasma.exe' }).then(() => 'SE CERRO', (e) => String(e))`);
ok(/ya no existe/.test(fantasma), 'terminar_proceso rechaza un pid que no existe', fantasma);

console.log('\nInterfaz');
const ui = await evaluar(`(() => {
  const c = document.getElementById('kerni-rive');
  const m = document.getElementById('mascota');
  return { rive: m.classList.contains('rive-listo'), cw: c.width, ch: c.height, modo: m.dataset.modo ?? 'idle',
           cpu: document.getElementById('txt-cpu').textContent, ram: document.getElementById('txt-ram').textContent,
           disco: document.getElementById('txt-disco').textContent, zonas: [...document.querySelectorAll('.zona')].filter((e) => !e.hidden).length };
})()`);
ok(ui.rive, 'el rig de Rive cargó (clase rive-listo)');
ok(ui.cw > 50 && ui.ch > 50, 'el canvas de Rive tiene tamaño (no 0×0)', `${ui.cw}×${ui.ch}`);
ok(/%$/.test(ui.cpu) && /GB/.test(ui.ram) && /GB/.test(ui.disco), 'el HUD muestra métricas reales', `CPU ${ui.cpu} · RAM ${ui.ram} · disco ${ui.disco}`);
ok(ui.zonas >= 3, 'hay zonas interactivas para el click-through', `${ui.zonas} zonas`);

console.log('\nCara según la BATERÍA (70 % o más idle · 30-69 % neutro · menos de 30 % aburrido)');
const bat = (await evaluar(`window.__TAURI_INTERNALS__.invoke('metricas')`)).bateria;
const modoCarga = await evaluar(`document.getElementById('mascota').dataset.modo ?? 'idle'`);
const eventos = ['asustado', 'alerta', 'research', 'sonriente', 'dormido'];
if (!bat) {
  ok(modoCarga === 'idle' || eventos.includes(modoCarga), 'sin batería (equipo de escritorio) queda la cara de siempre', modoCarga);
} else {
  ok(Number.isInteger(bat.porcentaje) && bat.porcentaje >= 0 && bat.porcentaje <= 100, 'la batería real llega desde Rust', `${bat.porcentaje} %${bat.cargando ? ' (cargando)' : bat.enchufada ? ' (enchufada)' : ''}`);
  const esperada = bat.porcentaje >= 70 ? 'idle' : bat.porcentaje >= 30 ? 'neutro' : 'aburrido';
  const lejos = Math.abs(bat.porcentaje - 30) > 5 && Math.abs(bat.porcentaje - 70) > 5; // la histéresis es de 4 puntos
  if (eventos.includes(modoCarga)) ok(true, 'hay un evento activo que manda sobre la cara de la batería', modoCarga);
  else if (lejos) ok(modoCarga === esperada, `la cara coincide con la batería (${bat.porcentaje} %)`, `esperada ${esperada}, tiene ${modoCarga}`);
  else ok(true, `batería ${bat.porcentaje} % cerca de un umbral: no se exige una cara`, modoCarga);
}

console.log('\nTransparencia en reposo');
const reposo = await evaluar(`(async () => {
  const esperar = async (cond, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await new Promise((r) => setTimeout(r, 250)); } return cond(); };
  const mascota = document.getElementById('mascota');
  const llego = await esperar(() => document.body.dataset.reposo === '1', 15000);
  await new Promise((r) => setTimeout(r, 1200)); // deja terminar la transición de 0.8 s
  const opacidadReposo = Number(getComputedStyle(mascota).opacity);
  // una interacción de verdad (movimiento del puntero) lo vuelve opaco al instante
  document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
  const activo = document.body.dataset.reposo;
  await new Promise((r) => setTimeout(r, 1200));
  const opacidadActivo = Number(getComputedStyle(mascota).opacity);
  return { llego, opacidadReposo, activo, opacidadActivo };
})()`);
ok(reposo.llego, 'tras unos segundos sin usarlo, Kerni entra en reposo (data-reposo=1)');
ok(reposo.opacidadReposo > 0 && reposo.opacidadReposo < 0.9, 'en reposo se ve un poco transparente', `opacidad ${reposo.opacidadReposo}`);
ok(reposo.activo === '0' && reposo.opacidadActivo === 1, 'al moverle el puntero vuelve a ser opaco', `opacidad ${reposo.opacidadActivo}`);

console.log('\nMétricas ocultas por defecto');
const metricas = await evaluar(`(() => {
  const hud = document.getElementById('hud'), ocultar = document.getElementById('alternar-metricas');
  const estado = () => ({ oculto: hud.hidden, visible: hud.offsetParent !== null });
  const alInicio = estado();
  window.__kerni.mostrarMetricas(true); const mostrado = estado();
  ocultar.click(); const vuelto = estado();
  return { alInicio, mostrado, vuelto };
})()`);
ok(metricas.alInicio.oculto && !metricas.alInicio.visible, 'la barra de métricas arranca 100% oculta');
ok(metricas.mostrado.visible, 'se puede mostrar (desde el menú nativo llega el mismo evento)');
ok(metricas.vuelto.oculto, 'el botón Ocultar la vuelve a esconder');

console.log('\nRive: cambio de modo');
const pixelesDistintos = async () => evaluar(`(() => {
  const c = document.getElementById('kerni-rive'); const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
  return n;
})()`);
const dibujados = await pixelesDistintos();
ok(dibujados > 2000, 'el canvas tiene píxeles dibujados (Kerni se ve)', `${dibujados} px opacos`);
// El personaje no es global; se prueba por el DOM: el modo que pide la app queda en data-modo.
ok(['idle', 'sonriente', 'asustado', 'research', 'dormido', 'alerta', 'neutro', 'aburrido'].includes(ui.modo), 'la app tiene un modo válido', ui.modo);

console.log('\nSaludo sin caras apiladas (desde un modo con cara propia)');
const apilado = await evaluar(`(async () => {
  const k = window.__kerni?.personaje;
  if (!k) return { sinGancho: true };
  const c = document.getElementById('kerni-rive'); const g = c.getContext('2d');
  const cian = () => { const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] < 140 && d[i + 1] > 200 && d[i + 2] > 200) n++; return n; };
  k.setModo('aburrido'); await new Promise((r) => setTimeout(r, 900));
  const aburrido = cian();
  k.saludar(); await new Promise((r) => setTimeout(r, 900));
  const saludando = cian();
  return { aburrido, saludando };
})()`);
if (apilado.sinGancho) ok(false, 'no existe window.__kerni: ¿la app corre en modo desarrollo?');
else ok(apilado.aburrido > 0 && apilado.saludando > 0, 'hay luz cian en la cara aburrida y en el saludo', `${apilado.aburrido} px → ${apilado.saludando} px`);

console.log('\nChat sin backend (debe fallar con elegancia)');
const resp = await evaluar(`(async () => {
  const entrada = document.getElementById('mensaje'); entrada.value = 'hola, ¿cómo vas?';
  document.getElementById('chat').requestSubmit();
  await new Promise((r) => setTimeout(r, 2500));
  return document.getElementById('globo').textContent;
})()`);
ok(typeof resp === 'string' && resp.length > 0, 'el globo responde algo', resp);

console.log('\nDisco por reglas (sin modelo)');
const disco = await evaluar(`(async () => {
  const entrada = document.getElementById('mensaje'); entrada.value = '¿cuánto disco me queda?';
  document.getElementById('chat').requestSubmit();
  await new Promise((r) => setTimeout(r, 500));
  return document.getElementById('globo').textContent;
})()`);
ok(/disco principal va al \d+%/.test(disco), 'responde el porcentaje del disco con datos reales', disco);

console.log('\nConsola');
const graves = consola.filter((l) => !/Failed to fetch|ERR_CONNECTION_REFUSED|NetworkError|127\.0\.0\.1:8788/.test(l));
ok(graves.length === 0, 'sin errores ni advertencias inesperadas', graves.join(' | '));

if (captura) {
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(captura, Buffer.from(r.result.data, 'base64'));
  console.log(`\nCaptura de la ventana real: ${captura}`);
}
ws.close();
console.log(fallos ? `\n${fallos} comprobación(es) fallaron` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
