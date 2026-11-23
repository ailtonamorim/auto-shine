const prisma = require('../config/database');
const { erro } = require('./agendamento-edicao');

async function bloquearAgenda(tx, lojaId) {
  if (!Number.isSafeInteger(lojaId) || lojaId < 1) throw erro(400, 'Loja inválida.');
  // Todas as escritas que ocupam/liberam agenda e as configurações usam a mesma linha.
  // O bloqueio dura até commit/rollback e funciona entre processos/instâncias Node.
  const rows = await tx.$queryRaw`SELECT "id" FROM "Loja" WHERE "id" = ${lojaId} FOR UPDATE`;
  if (!rows.length) throw erro(404, 'Loja não encontrada.');
}
async function comAgendaBloqueada(lojaId, operation, db = prisma) {
  return db.$transaction(async tx => {
    await bloquearAgenda(tx, lojaId);
    return operation(tx);
  }, { isolationLevel: 'ReadCommitted', maxWait: 10000, timeout: 15000 });
}
module.exports = { bloquearAgenda, comAgendaBloqueada };
