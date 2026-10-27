// Baja los manuales oficiales listados en conocimiento/manuales.json a conocimiento/privado/ (ignorada por git).
//   npm run manuales             descarga lo que falte (lo que ya está no se vuelve a bajar)
//   npm run manuales -- --ver    solo muestra qué hay y qué falta, sin descargar
// Después: npm run indexar -- --simular   y   npm run indexar
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { descargarManuales, leerManifiesto } from '../src/rag/manuales.js';

const raiz = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'conocimiento'));
const manuales = leerManifiesto(join(raiz, 'manuales.json'));

if (process.argv.includes('--ver')) {
  for (const m of manuales) {
    const destino = resolve(raiz, m.destino);
    const esta = existsSync(destino) && statSync(destino).size >= (m.bytesMinimos ?? 1);
    console.log(`${esta ? 'OK   ' : 'FALTA'} ${m.nombre}  ->  ${m.destino}`);
  }
  process.exit(0);
}

console.log(`${manuales.length} manuales en la lista. Se guardan en conocimiento/privado/ (git no los sube: tienen derechos de autor).\n`);
const resultados = await descargarManuales(manuales, raiz, { alAvanzar: (t) => console.log(`  ${t}`) });
for (const r of resultados) {
  const marca = r.estado === 'error' ? 'ERROR ' : r.estado === 'ya_estaba' ? 'YA ESTÁ' : 'LISTO ';
  console.log(`${marca} ${r.nombre}: ${r.detalle}`);
}
const errores = resultados.filter((r) => r.estado === 'error').length;
console.log(errores ? `\n${errores} no se pudieron bajar. Probá de nuevo, o bajalos a mano desde el sitio de soporte de Dell a esas carpetas.` : '\nListo. Siguiente: npm run indexar -- --simular y npm run indexar.');
process.exit(errores ? 1 : 0);
