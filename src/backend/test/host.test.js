import { describe, expect, it } from 'vitest';
import { buildApp, hostPermitido } from '../src/app.js';
import { createTestApp } from './helpers.js';

describe('hostPermitido', () => {
  it('acepta solo loopback; con puerto conocido exige ese puerto', () => {
    expect(hostPermitido('127.0.0.1:8788', 8788)).toBe(true);
    expect(hostPermitido('localhost:8788', 8788)).toBe(true);
    expect(hostPermitido('127.0.0.1:9999', 8788)).toBe(false);
    expect(hostPermitido('127.0.0.1', 8788)).toBe(false);
    expect(hostPermitido('evil.com:8788', 8788)).toBe(false);
    expect(hostPermitido('127.0.0.1.nip.io:8788', 8788)).toBe(false);
    expect(hostPermitido(undefined, 8788)).toBe(false);
    // sin puerto conocido (pruebas con inject) basta el nombre de host
    expect(hostPermitido('localhost:80')).toBe(true);
    expect(hostPermitido('evil.com')).toBe(false);
  });
});

describe('Host de las peticiones', () => {
  it('rechaza un Host ajeno aunque la ruta exista (DNS rebinding)', async () => {
    const { app } = createTestApp();
    const res = await app.inject({ method: 'GET', url: '/health', headers: { host: 'evil.example:8788' } });
    expect(res.statusCode).toBe(403);
  });

  it('con el puerto de producción, solo 127.0.0.1 o localhost en ese puerto', async () => {
    const app = buildApp({ config: { port: 8788 } });
    expect((await app.inject({ method: 'GET', url: '/health', headers: { host: '127.0.0.1:8788' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/health', headers: { host: 'localhost:8788' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/health', headers: { host: 'localhost:1421' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/health', headers: { host: 'attacker.com:8788' } })).statusCode).toBe(403);
  });
});
