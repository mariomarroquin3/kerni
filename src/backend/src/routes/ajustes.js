import { llaveValida, modeloValido, PROVEEDORES_AJUSTES, vistaPublica } from '../ajustes.js';
import { crearProveedor } from '../llm/proveedores.js';

const PLAZO_PRUEBA_MS = 25_000;

/** Config de un solo proveedor con la llave de la persona (lo demás sale de la config normal). */
export function configConLlave(config, proveedor, apiKey, modelo = '') {
  const base = { ...config, llmProvider: proveedor, anthropicApiKey: '', gemini: { ...config.gemini, apiKey: '' }, openrouter: { ...config.openrouter, apiKey: '' } };
  if (proveedor === 'anthropic') return { ...base, anthropicApiKey: apiKey, ...(modelo ? { agentModel: modelo } : {}) };
  if (proveedor === 'gemini') return { ...base, gemini: { ...config.gemini, apiKey, ...(modelo ? { model: modelo } : {}) } };
  return { ...base, openrouter: { ...config.openrouter, apiKey, ...(modelo ? { model: modelo } : {}) } };
}

/**
 * Elegir la IA desde la app (pantalla de bienvenida y "Cambiar IA…"):
 *   GET    /ajustes          → qué hay configurado (nunca la llave)
 *   POST   /ajustes/probar   { proveedor, apiKey?, modelo? } → { ok } | { ok:false, error, codigo }   (un pedido corto de verdad)
 *   PUT    /ajustes          { proveedor, apiKey?, modelo? } | { sinIA:true } → guarda y cambia la IA al instante
 *   DELETE /ajustes          → olvida las llaves
 * Solo escucha en 127.0.0.1 (Host y CORS ya filtrados en app.js).
 */
export async function ajustesRoutes(app, { ajustes, config, proveedor, limitador, origenEntorno = false, fabrica = {} }) {
  const vista = () => vistaPublica(ajustes.leer(), {
    origen: proveedor.activo ? (origenEntorno ? 'env' : 'app') : null,
    nombreActivo: proveedor.activo ? proveedor.name : '',
    modeloActivo: proveedor.activo ? proveedor.model : '',
  });

  /** Nunca devuelve la llave aunque el servicio la repita en su error. */
  const limpio = (texto, llave) => String(texto ?? '').split(llave).join('[llave]').slice(0, 300);

  function validar(body) {
    const p = body?.proveedor;
    if (!PROVEEDORES_AJUSTES.includes(p)) return { error: 'Elegí un servicio: gemini, openrouter o anthropic.' };
    const apiKey = body?.apiKey === undefined || body?.apiKey === '' ? '' : String(body.apiKey).trim();
    if (apiKey && !llaveValida(apiKey)) return { error: 'La llave no parece válida (sin espacios, entre 16 y 400 caracteres).' };
    const modelo = body?.modelo === undefined ? undefined : String(body.modelo ?? '').trim();
    if (modelo && !modeloValido(modelo)) return { error: 'El nombre del modelo no es válido.' };
    return { p, apiKey, modelo };
  }

  app.get('/ajustes', async () => vista());

  app.post('/ajustes/probar', async (req, reply) => {
    if (limitador && !limitador.permitir('ajustes')) return reply.code(429).send({ ok: false, error: 'Muchos intentos seguidos; esperá un momento.' });
    const v = validar(req.body);
    if (v.error) return reply.code(400).send({ ok: false, error: v.error });
    const guardada = ajustes.leer();
    const llave = v.apiKey || guardada.claves[v.p];
    if (!llave) return reply.code(400).send({ ok: false, error: 'Pegá la llave de ese servicio.' });
    try {
      const { provider } = crearProveedor(configConLlave(config, v.p, llave, v.modelo ?? guardada.modelos[v.p] ?? ''), fabrica);
      const r = await provider.step({
        persona: 'Respondé solo con la palabra: ok',
        history: [provider.userMessage('Probando la conexión.')],
        tools: [],
        signal: AbortSignal.timeout(PLAZO_PRUEBA_MS),
      });
      if (r.kind === 'refusal') return { ok: false, codigo: 'fallo', error: 'El servicio no quiso responder esa prueba. Probá con otro modelo.' };
      return { ok: true, modelo: provider.model };
    } catch (err) {
      req.log.warn({ codigo: err.codigo, status: err.status }, 'ajustes: la prueba de la llave falló');
      return reply.code(200).send({ ok: false, codigo: err.codigo ?? 'fallo', error: limpio(err.message, llave) || 'No pude probar la llave.' });
    }
  });

  app.put('/ajustes', async (req, reply) => {
    if (limitador && !limitador.permitir('ajustes')) return reply.code(429).send({ error: 'Muchos intentos seguidos; esperá un momento.' });
    try {
      if (req.body?.sinIA === true) {
        ajustes.sinIA();
        proveedor.cambiar(null);
        return vista();
      }
      const v = validar(req.body);
      if (v.error) return reply.code(400).send({ error: v.error });
      const guardado = ajustes.elegir({ proveedor: v.p, apiKey: v.apiKey, modelo: v.modelo });
      const { provider, nombre } = crearProveedor(configConLlave(config, v.p, guardado.claves[v.p], guardado.modelos[v.p] ?? ''), fabrica);
      proveedor.cambiar(provider, nombre);
      return vista();
    } catch (err) {
      req.log.error({ err: err.message }, 'ajustes: no se pudo guardar');
      return reply.code(400).send({ error: err.message });
    }
  });

  app.delete('/ajustes', async () => {
    ajustes.olvidar();
    proveedor.cambiar(null);
    return vista();
  });
}
