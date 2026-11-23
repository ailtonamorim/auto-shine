const prisma = require('../config/database');
const { comAgendaBloqueada } = require('../utils/agenda-transacao');
const { deveExpirar, filtroVencidos } = require('../utils/agendamento-expiracao');
const { enfileirarNotificacoes } = require('./notificacoes');

const MOTIVO = 'Prazo de confirmação encerrado. O horário agendado foi atingido sem confirmação do estabelecimento.';

async function expirarAgendamento(ag, { db = prisma, clock = () => new Date() } = {}) {
  return comAgendaBloqueada(ag.lojaId, async tx => {
    // A mesma trava das confirmações e edições impede uma expiração concorrente indevida.
    const atual = await tx.agendamento.findUnique({ where: { id: ag.id } });
    const now = clock();
    if (!atual || atual.lojaId !== ag.lojaId || !deveExpirar(atual, now)) return false;
    const result = await tx.agendamento.updateMany({
      where: { id: atual.id, lojaId: atual.lojaId, status: 'pendente', revisao: atual.revisao, data: atual.data, hora: atual.hora },
      data: { status: 'expirado', revisao: { increment: 1 } },
    });
    if (result.count !== 1) return false;
    // Status e histórico confirmam juntos ou são revertidos juntos.
    await tx.alteracaoAgendamento.create({ data: {
      agendamentoId: atual.id, autorTipo: 'sistema', autorNome: 'AutoShine',
      motivo: MOTIVO, anterior: { status: 'pendente' }, atual: { status: 'expirado' },
      vistoClienteEm: null, vistoParceiroEm: null, createdAt: now,
    } });
    await enfileirarNotificacoes(tx, { agendamentoId: atual.id, autorTipo: 'sistema', autorNome: 'AutoShine',
      motivo: MOTIVO, anterior: { status: 'pendente' }, atual: { status: 'expirado' }, now });
    return true;
  }, db);
}

// As consultas também reconciliam seus próprios registros, sem depender do próximo ciclo.
async function sincronizarExpirados(agendamentos, options = {}) {
  const clock = options.clock || (() => new Date());
  const candidatos = agendamentos.filter(ag => deveExpirar(ag, clock()));
  for (const ag of candidatos) await expirarAgendamento(ag, { ...options, clock });
  // Reconsulta mesmo se uma confirmação/reprogramação concorrente venceu a disputa.
  return candidatos.length > 0;
}

async function expirarLote({ db = prisma, clock = () => new Date(), afterId = 0, limit = 200, logger = console } = {}) {
  const candidatos = await db.agendamento.findMany({
    where: { ...filtroVencidos(clock()), id: { gt: afterId } },
    orderBy: { id: 'asc' }, take: limit,
    select: { id: true, lojaId: true, data: true, hora: true, status: true },
  });
  let expirados = 0, falhas = 0;
  for (const ag of candidatos) {
    try { if (await expirarAgendamento(ag, { db, clock })) expirados++; }
    catch {
      falhas++;
      logger.error(`Não foi possível expirar o agendamento ${ag.id}. Haverá nova tentativa.`);
    }
  }
  return { expirados, falhas, proximoId: candidatos.length === limit ? candidatos.at(-1).id : 0 };
}

// Executa na inicialização e a cada 30s após terminar o ciclo, sem sobreposição local.
// Várias instâncias são seguras graças ao bloqueio e à transação no banco.
function iniciarExpiracao({ intervaloMs = 30000, executar = expirarLote, logger = console,
  agendar = setTimeout, cancelar = clearTimeout } = {}) {
  let stopped = false, timer, afterId = 0;
  async function ciclo() {
    try {
      const result = await executar({ afterId });
      afterId = result.proximoId;
    } catch {
      logger.error('Falha na rotina de expiração de agendamentos. Haverá nova tentativa.');
    } finally {
      if (!stopped) {
        timer = agendar(ciclo, intervaloMs);
        timer?.unref?.();
      }
    }
  }
  const pronto = ciclo();
  return { pronto, parar() { stopped = true; if (timer) cancelar(timer); } };
}

module.exports = { MOTIVO, expirarAgendamento, sincronizarExpirados, expirarLote, iniciarExpiracao };
