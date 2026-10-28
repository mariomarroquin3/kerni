// Convierte PDFs con texto a Markdown (un título "Página N" por página) para revisarlos o editarlos antes de indexar.
//   npm run pdf-a-md -- ruta/manual.pdf                 escribe manual.md junto al PDF
//   npm run pdf-a-md -- conocimiento/privado            convierte todos los PDF de la carpeta
//   npm run pdf-a-md -- ruta --salida otra/carpeta      deja los .md en otra carpeta
//   npm run pdf-a-md -- ruta --sobrescribir             rehace los .md que ya existan
// No hace OCR: un PDF escaneado (solo imágenes) se avisa y se salta.
// Ojo: si dejás el .md junto al PDF, `npm run indexar` usa el .md y salta el PDF (no se indexa dos veces).
import { relative } from 'node:path';
import { convertirTodo } from '../src/rag/convertir.js';

const args = process.argv.slice(2);
const sobrescribir = args.includes('--sobrescribir');
const iSalida = args.indexOf('--salida');
const salida = iSalida >= 0 ? args[iSalida + 1] : undefined;
const ruta = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--salida');

if (!ruta || (iSalida >= 0 && !salida)) {
  console.error('Uso: npm run pdf-a-md -- <archivo.pdf | carpeta> [--salida carpeta] [--sobrescribir]');
  process.exit(1);
}

const nombre = (p) => relative(process.cwd(), p) || p;
let resultados;
try {
  resultados = await convertirTodo(ruta, { salida, sobrescribir }, (r) => {
    const marca = { convertido: 'OK     ', existe: 'YA ESTA', escaneado: 'ESCANEADO', error: 'ERROR  ' }[r.estado];
    const extra = r.estado === 'convertido' ? `${r.paginas} páginas -> ${nombre(r.md)}` : r.detalle;
    console.log(`${marca}  ${nombre(r.pdf)}: ${extra}`);
  });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

if (!resultados.length) { console.error('No encontré ningún PDF.'); process.exit(1); }
const n = (e) => resultados.filter((r) => r.estado === e).length;
console.log(`\n${n('convertido')} convertidos, ${n('existe')} ya existían, ${n('escaneado')} escaneados (necesitan OCR), ${n('error')} con error.`);
process.exit(n('error') || n('escaneado') ? 1 : 0);
