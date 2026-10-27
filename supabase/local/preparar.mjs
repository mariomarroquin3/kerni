// Prepares the local Supabase stand-in: generates its secrets once and points the backend at it.
//   node supabase/local/preparar.mjs
// - supabase/local/.env            secrets for docker compose (git-ignored)
// - supabase/local/generado/       SQL with the database password (git-ignored)
// - src/backend/.env               SUPABASE_URL and SUPABASE_SECRET_KEY (git-ignored); existing values are never overwritten
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ENV_COMPOSE = join(AQUI, '.env');
const ENV_BACKEND = join(AQUI, '..', '..', 'src', 'backend', '.env');
const URL_LOCAL = 'http://127.0.0.1:54321';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function firmarJwt(payload, secreto) {
  const cuerpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${cuerpo}.${createHmac('sha256', secreto).update(cuerpo).digest('base64url')}`;
}
function leerVariables(ruta) {
  if (!existsSync(ruta)) return {};
  return Object.fromEntries(readFileSync(ruta, 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
}

// 1) Secrets for the stack: reused if they already exist, so the database password never drifts from the volume.
let v = leerVariables(ENV_COMPOSE);
if (!v.KERNI_DB_PASSWORD || !v.KERNI_JWT_SECRET || !v.KERNI_SERVICE_KEY) {
  const KERNI_DB_PASSWORD = randomBytes(18).toString('hex');
  const KERNI_JWT_SECRET = randomBytes(32).toString('hex');
  const ahora = Math.floor(Date.now() / 1000);
  const KERNI_SERVICE_KEY = firmarJwt({ role: 'service_role', iss: 'kerni-local', iat: ahora, exp: ahora + 10 * 365 * 86400 }, KERNI_JWT_SECRET);
  v = { KERNI_DB_PASSWORD, KERNI_JWT_SECRET, KERNI_SERVICE_KEY };
  writeFileSync(ENV_COMPOSE, Object.entries(v).map(([k, val]) => `${k}=${val}`).join('\n') + '\n');
  console.log('Claves locales generadas en supabase/local/.env');
} else {
  console.log('Ya había claves locales: se reutilizan.');
}

// 2) SQL that sets the PostgREST login password (only read the first time the volume is created).
mkdirSync(join(AQUI, 'generado'), { recursive: true });
writeFileSync(join(AQUI, 'generado', '01-authenticator.sql'), `alter role authenticator password '${v.KERNI_DB_PASSWORD}';\n`);

// 3) Point the backend at it, without touching anything the person already set.
let env = existsSync(ENV_BACKEND) ? readFileSync(ENV_BACKEND, 'utf8') : '';
const poner = (clave, valor) => {
  const linea = new RegExp(`^${clave}=(.*)$`, 'm');
  const actual = env.match(linea)?.[1]?.trim();
  if (actual) { console.log(`src/backend/.env ya tiene ${clave}: no lo toco.`); return; }
  env = linea.test(env) ? env.replace(linea, `${clave}=${valor}`) : `${env.replace(/\s*$/, '')}\n${clave}=${valor}\n`;
  console.log(`src/backend/.env: ${clave} configurada.`);
};
poner('SUPABASE_URL', URL_LOCAL);
poner('SUPABASE_SECRET_KEY', v.KERNI_SERVICE_KEY);
writeFileSync(ENV_BACKEND, env);

console.log('\nSiguiente: docker compose -f supabase/local/docker-compose.yml up -d');
