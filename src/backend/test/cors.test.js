import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

const preflight = (app, origin) => app.inject({
  method: 'OPTIONS', url: '/chat',
  headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
});

describe('CORS para la app de escritorio', () => {
  it.each(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'http://localhost:1421'])(
    'deja pasar el origen %s', async (origin) => {
      const { app } = createTestApp();
      const res = await preflight(app, origin);
      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
    },
  );

  it('no da permiso a un sitio cualquiera', async () => {
    const { app } = createTestApp();
    const res = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://sitio-malo.example' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('responde /health para que el lanzador sepa que el backend está vivo', async () => {
    const { app } = createTestApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json()).toMatchObject({ ok: true, proveedor: 'anthropic' });
  });
});
