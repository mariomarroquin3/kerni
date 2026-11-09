// Prepara lo que viaja DENTRO del instalador: el backend de Kerni (código + dependencias de producción) y un Node.js propio,
// para que la app funcione en una PC sin Node instalado.
//
//   node scripts/preparar-backend.mjs               descarga node.exe (Windows x64) de nodejs.org y verifica su SHA-256
//   node scripts/preparar-backend.mjs --node-local  usa el Node que corre este script (para probar en Linux/Mac)
//
// Resultado (ignorado por git, salvo .gitkeep):
//   src-tauri/resources/backend/   src/, package.json, node_modules (solo producción)
//   src-tauri/resources/node/      node.exe  (o node)
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESKTOP = join(AQUI, '..');
const BACKEND_ORIGEN = join(DESKTOP, '..', 'backend');
const RECURSOS = join(DESKTOP, 'src-tauri', 'resources');
const DESTINO_BACKEND = join(RECURSOS, 'backend');
const DESTINO_NODE = join(RECURSOS, 'node');
const NODE_LOCAL = process.argv.includes('--node-local');
const SERIE_NODE = 'latest-v22.x'; // node:sqlite necesita Node 22.5 o más

function limpiar(dir) {
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f !== '.gitkeep') rmSync(join(dir, f), { recursive: true, force: true });
}

/** Devuelve el hash que nodejs.org publica para un archivo de esa versión (null si no aparece). */
export function hashDeSumas(texto, archivo) {
  for (const linea of texto.split(/\r?\n/)) {
    const [hash, nombre] = linea.trim().split(/\s+/);
    if (nombre === archivo && /^[0-9a-f]{64}$/.test(hash)) return hash;
  }
  return null;
}

async function descargarNodeWindows() {
  const base = `https://nodejs.org/dist/${SERIE_NODE}`;
  const sumas = await (await fetch(`${base}/SHASUMS256.txt`)).text();
  const version = /node-v(\d+\.\d+\.\d+)-win-x64\.zip/.exec(sumas)?.[1];
  const esperado = hashDeSumas(sumas, 'win-x64/node.exe');
  if (!version || !esperado) throw new Error('No encontré node.exe en SHASUMS256.txt de nodejs.org.');
  console.log(`Descargando Node ${version} (win-x64)…`);
  const res = await fetch(`https://nodejs.org/dist/v${version}/win-x64/node.exe`);
  if (!res.ok) throw new Error(`nodejs.org respondió ${res.status}.`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const real = createHash('sha256').update(bytes).digest('hex');
  if (real !== esperado) throw new Error(`El SHA-256 de node.exe no coincide (esperado ${esperado}, recibido ${real}). No se usa.`);
  writeFileSync(join(DESTINO_NODE, 'node.exe'), bytes);
  console.log(`node.exe ${version} verificado (${(bytes.length / 1048576).toFixed(0)} MB).`);
}

async function principal() {
  if (!existsSync(join(BACKEND_ORIGEN, 'package.json'))) throw new Error(`No encuentro el backend en ${BACKEND_ORIGEN}.`);

  limpiar(DESTINO_BACKEND);
  limpiar(DESTINO_NODE);

  cpSync(join(BACKEND_ORIGEN, 'src'), join(DESTINO_BACKEND, 'src'), { recursive: true });
  copyFileSync(join(BACKEND_ORIGEN, 'package.json'), join(DESTINO_BACKEND, 'package.json'));
  copyFileSync(join(BACKEND_ORIGEN, 'package-lock.json'), join(DESTINO_BACKEND, 'package-lock.json'));
  console.log('Instalando dependencias de producción del backend…');
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: DESTINO_BACKEND, stdio: 'inherit', shell: process.platform === 'win32' });

  if (NODE_LOCAL) {
    const destino = join(DESTINO_NODE, process.platform === 'win32' ? 'node.exe' : 'node');
    copyFileSync(process.execPath, destino);
    if (process.platform !== 'win32') chmodSync(destino, 0o755);
    console.log(`Usando el Node local (${process.version}).`);
  } else {
    await descargarNodeWindows();
  }
  console.log('Listo: src-tauri/resources/backend y src-tauri/resources/node.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  principal().catch((err) => { console.error(`✗ ${err.message}`); process.exit(1); });
}
