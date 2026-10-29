import { test, expect } from '@playwright/test';

test('salud responde ok con version y commit', async ({ request }) => {
  const r = await request.get('/salud');
  expect(r.status()).toBe(200);
  const cuerpo = await r.json();
  expect(cuerpo.ok).toBe(true);
  expect(typeof cuerpo.version).toBe('string');
  expect(typeof cuerpo.commit).toBe('string');
});

test('version coincide con salud', async ({ request }) => {
  const salud = await (await request.get('/salud')).json();
  const version = await (await request.get('/version')).json();
  expect(version).toEqual({ version: salud.version, commit: salud.commit });
});

test('las respuestas son JSON', async ({ request }) => {
  const r = await request.get('/saldo/ana');
  expect(r.headers()['content-type']).toContain('application/json');
});

test('la URL publica devuelve el saldo de un usuario semilla', async ({ request }) => {
  const cuerpo = await (await request.get('/saldo/carla')).json();
  expect(cuerpo.usuario).toBe('carla');
  expect(typeof cuerpo.saldo).toBe('number');
});

test('cada usuario semilla tiene saldo', async ({ request }) => {
  for (const usuario of ['ana', 'beto', 'carla', 'diego', 'elena']) {
    const r = await request.get(`/saldo/${usuario}`);
    expect(r.status()).toBe(200);
    expect((await r.json()).saldo).toBeGreaterThanOrEqual(0);
  }
});

test('historial devuelve una lista', async ({ request }) => {
  const r = await request.get('/historial/elena');
  expect(r.status()).toBe(200);
  expect(Array.isArray(await r.json())).toBe(true);
});

test('una transferencia pasa por la URL publica', async ({ request }) => {
  const r = await request.post('/transferir', {
    data: { origen: 'elena', destino: 'ana', monto: 0.01 },
  });
  expect(r.status()).toBe(200);
  const cuerpo = await r.json();
  expect(cuerpo).toMatchObject({ origen: 'elena', destino: 'ana', monto: 0.01 });
  expect(typeof cuerpo.id).toBe('number');
});

test('cada movimiento del historial involucra al usuario', async ({ request }) => {
  const historial = await (await request.get('/historial/beto')).json();
  for (const m of historial) {
    expect([m.origen, m.destino]).toContain('beto');
    expect(m.monto).toBeGreaterThan(0);
  }
});

test('transferir con monto negativo es 400', async ({ request }) => {
  const r = await request.post('/transferir', {
    data: { origen: 'elena', destino: 'ana', monto: -10 },
  });
  expect(r.status()).toBe(400);
});

test('una ruta desconocida es 404', async ({ request }) => {
  const r = await request.get('/cuentas');
  expect(r.status()).toBe(404);
});
