// Pistas sobre los archivos pesados sin uso. Lógica pura (sin DOM), en el front: el modelo nunca ve los nombres.
//
// Solo mira la extensión y el tipo (archivo o carpeta); nunca el contenido. Es una orientación, no una orden:
// la app no borra nada y la persona decide con el Explorador. Ante la duda, "revisar".

const INSTALADORES = new Set(['exe', 'msi', 'msix', 'iso', 'img']);
const COMPRIMIDOS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz']);
const MULTIMEDIA = new Set(['mp4', 'mkv', 'avi', 'mov', 'wmv', 'mp3', 'wav', 'flac', 'jpg', 'jpeg', 'png', 'heic', 'raw', 'psd']);
const DOCUMENTOS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'txt', 'odt', 'csv']);

export const NIVELES = {
  suele_sobrar: 'Suele sobrar',
  respaldar: 'Respaldá antes',
  revisar: 'Revisá antes',
};

/** Texto corto de tamaño: 4300 -> "4.2 GB". */
export const tamanoLegible = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);

export function extension(nombre) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(nombre ?? ''));
  return m ? m[1].toLowerCase() : '';
}

const enDescargas = (a) => /descargas|downloads/i.test(`${a.carpeta ?? ''}`);

/**
 * @param {{ nombre: string, carpeta?: string, esCarpeta?: boolean }} a un elemento de `archivos_pesados`
 * @returns {{ nivel: 'suele_sobrar'|'respaldar'|'revisar', texto: string }}
 */
export function pistaDeArchivo(a) {
  if (a.esCarpeta) {
    return {
      nivel: 'revisar',
      texto: enDescargas(a)
        ? 'Carpeta descargada: abrila y mirá qué hay antes de decidir.'
        : 'Carpeta entera sin tocar: mirá qué tiene; si es un proyecto o un respaldo, no la borres.',
    };
  }
  const ext = extension(a.nombre);
  if (INSTALADORES.has(ext)) return { nivel: 'suele_sobrar', texto: 'Instalador: suele sobrar si el programa ya está instalado.' };
  if (COMPRIMIDOS.has(ext)) return { nivel: 'suele_sobrar', texto: 'Comprimido: si ya sacaste lo que necesitabas, suele sobrar.' };
  if (MULTIMEDIA.has(ext)) return { nivel: 'respaldar', texto: 'Parece foto, video o música: respaldalo antes de borrar.' };
  if (DOCUMENTOS.has(ext)) return { nivel: 'respaldar', texto: 'Parece un documento: revisalo y guardalo aparte antes de borrar.' };
  return { nivel: 'revisar', texto: 'No reconozco el tipo: abrilo y fijate si te sirve.' };
}

/**
 * Lo que dice la burbuja después de buscar. No nombra archivos (vienen del disco): solo cuántos y cuánto.
 * @param {Array} items elementos de `archivos_pesados`
 * @param {boolean} completa
 */
export function resumenArchivos(items, completa = true) {
  if (!items.length) return `No encontré nada pesado que lleve meses sin usarse.${completa ? ' Todo en orden.' : ' Revisé hasta donde alcancé; puede haber más.'}`;
  const total = items.reduce((s, a) => s + a.tamanoMb, 0);
  const sobran = items.filter((a) => pistaDeArchivo(a).nivel === 'suele_sobrar');
  const mbSobran = sobran.reduce((s, a) => s + a.tamanoMb, 0);
  const partes = [`Encontré ${items.length} cosas que suman ${tamanoLegible(total)}.`];
  partes.push(
    sobran.length
      ? `${sobran.length} ${sobran.length === 1 ? 'parece un instalador o comprimido' : 'parecen instaladores o comprimidos'} (${tamanoLegible(mbSobran)}) y suelen sobrar si ya los usaste.`
      : 'No veo instaladores ni comprimidos; lo demás conviene mirarlo con calma.',
  );
  partes.push('Revisá cada una en la lista antes de borrar: yo no borro nada.');
  if (!completa) partes.push('Puede haber más: no alcancé a revisar todo.');
  return partes.join(' ');
}
