const { validarMonto, validarUsuario, aCentimos, aSoles } = require('./util');

class ErrorNegocio extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

function buscarUsuario(store, usuario) {
  if (!validarUsuario(usuario)) {
    throw new ErrorNegocio(400, 'usuario invalido');
  }
  const encontrado = store.usuario(usuario);
  if (!encontrado) {
    throw new ErrorNegocio(404, 'usuario inexistente');
  }
  return encontrado;
}

function saldo(store, usuario) {
  const encontrado = buscarUsuario(store, usuario);
  return { usuario: encontrado.id, saldo: aSoles(encontrado.saldo) };
}

function historial(store, usuario) {
  buscarUsuario(store, usuario);
  return store.movimientos(usuario).map((m) => ({
    id: m.id,
    origen: m.origen,
    destino: m.destino,
    monto: aSoles(m.monto),
    fecha: m.fecha,
  }));
}

function transferir(store, { origen, destino, monto } = {}) {
  const errorMonto = validarMonto(monto);
  if (errorMonto) {
    throw new ErrorNegocio(400, errorMonto);
  }
  if (!validarUsuario(origen) || !validarUsuario(destino)) {
    throw new ErrorNegocio(400, 'usuario invalido');
  }
  if (origen === destino) {
    throw new ErrorNegocio(422, 'origen y destino son el mismo usuario');
  }
  const cuentaOrigen = store.usuario(origen);
  const cuentaDestino = store.usuario(destino);
  if (!cuentaOrigen || !cuentaDestino) {
    throw new ErrorNegocio(400, 'usuario inexistente');
  }
  const centimos = aCentimos(monto);
  if (cuentaOrigen.saldo <= centimos) {
    throw new ErrorNegocio(400, 'saldo insuficiente');
  }
  const id = store.transferir(origen, destino, centimos);
  return {
    id,
    origen,
    destino,
    monto: aSoles(centimos),
    saldoOrigen: aSoles(cuentaOrigen.saldo - centimos),
  };
}

module.exports = { ErrorNegocio, saldo, historial, transferir };
