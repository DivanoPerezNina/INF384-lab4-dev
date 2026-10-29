const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { handler } = require('../../src/handler');

// Cada prueba trabaja sobre una base SQLite nueva, con solo los usuarios semilla.
// Asi ninguna depende de lo que dejo otra y el resultado no cambia con el orden
// ni con una segunda corrida sobre la misma maquina.
function baseNueva() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-'));
  process.env.DB_PATH = path.join(dir, 'wallet.db');
}

async function llamar(metodo, ruta, cuerpo) {
  const r = await handler({
    rawPath: ruta,
    requestContext: { http: { method: metodo } },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.statusCode, cuerpo: JSON.parse(r.body) };
}

test('una transferencia debita al origen, acredita al destino y queda en el historial', async () => {
  baseNueva();
  const r = await llamar('POST', '/transferir', { origen: 'ana', destino: 'beto', monto: 100 });
  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.saldoOrigen, 900);

  assert.deepEqual((await llamar('GET', '/saldo/ana')).cuerpo, { usuario: 'ana', saldo: 900 });
  assert.deepEqual((await llamar('GET', '/saldo/beto')).cuerpo, { usuario: 'beto', saldo: 600 });

  const historial = await llamar('GET', '/historial/ana');
  assert.equal(historial.status, 200);
  assert.equal(historial.cuerpo.length, 1);
  assert.equal(historial.cuerpo[0].destino, 'beto');
  assert.equal(historial.cuerpo[0].monto, 100);
});

test('una transferencia con saldo insuficiente es 400 y no cambia saldos', async () => {
  baseNueva();
  const r = await llamar('POST', '/transferir', { origen: 'ana', destino: 'carla', monto: 1000.01 });
  assert.equal(r.status, 400);
  assert.equal(r.cuerpo.error, 'saldo insuficiente');
  assert.equal((await llamar('GET', '/saldo/ana')).cuerpo.saldo, 1000);
  assert.equal((await llamar('GET', '/saldo/carla')).cuerpo.saldo, 750);
  assert.equal((await llamar('GET', '/historial/ana')).cuerpo.length, 0);
});

test('transferir todo el saldo deja el origen en cero y ya no puede transferir', async () => {
  baseNueva();
  const r = await llamar('POST', '/transferir', { origen: 'diego', destino: 'elena', monto: 300 });
  assert.equal(r.status, 200);
  assert.equal((await llamar('GET', '/saldo/elena')).cuerpo.saldo, 1500);
  assert.equal((await llamar('GET', '/saldo/diego')).cuerpo.saldo, 0);

  const otra = await llamar('POST', '/transferir', { origen: 'diego', destino: 'ana', monto: 0.01 });
  assert.equal(otra.status, 400);
});

test('el historial muestra solo los movimientos del usuario', async () => {
  baseNueva();
  await llamar('POST', '/transferir', { origen: 'ana', destino: 'beto', monto: 100 });
  await llamar('POST', '/transferir', { origen: 'diego', destino: 'elena', monto: 50 });
  const r = await llamar('GET', '/historial/elena');
  assert.equal(r.cuerpo.length, 1);
  assert.equal(r.cuerpo[0].origen, 'diego');
});

test('transferir al mismo usuario es 422', async () => {
  baseNueva();
  const r = await llamar('POST', '/transferir', { origen: 'beto', destino: 'beto', monto: 1 });
  assert.equal(r.status, 422);
});

test('transferir a un usuario inexistente es 400', async () => {
  baseNueva();
  const r = await llamar('POST', '/transferir', { origen: 'beto', destino: 'zoe', monto: 1 });
  assert.equal(r.status, 400);
});

test('un cuerpo que no es JSON es 400', async () => {
  baseNueva();
  const r = await handler({
    rawPath: '/transferir',
    requestContext: { http: { method: 'POST' } },
    body: 'monto=1',
  });
  assert.equal(r.statusCode, 400);
});
