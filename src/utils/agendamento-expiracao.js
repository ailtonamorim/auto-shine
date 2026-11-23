const { minutoCivil, agoraAgenda } = require('./agenda-tempo');

function deveExpirar(ag, now = new Date()) {
  if (ag.status !== 'pendente') return false;
  const inicio = minutoCivil(ag.data, ag.hora);
  return inicio !== null && inicio <= agoraAgenda(now).minuto;
}

function filtroVencidos(now = new Date()) {
  const { data, hora } = agoraAgenda(now);
  return { status: 'pendente', OR: [{ data: { lt: data } }, { data, hora: { lte: hora } }] };
}

module.exports = { deveExpirar, filtroVencidos };
