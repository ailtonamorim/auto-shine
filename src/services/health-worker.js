const prisma = require("../config/database");
const { calcularSaudeLoja } = require("../utils/health");

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_SHOP_FILTER = {
  bloqueado: false,
  statusAprovacao: "aprovada",
  dono: { is: { bloqueado: false } },
};

async function recalcularStatusSaudeLojas(now = new Date()) {
  const lojas = await prisma.loja.findMany({
    where: {
      ...ACTIVE_SHOP_FILTER,
      OR: [{ inativoAte: null }, { inativoAte: { lte: now } }],
    },
    select: { id: true, createdAt: true },
  });
  if (!lojas.length) return { lojasAnalisadas: 0 };

  const lojaIds = lojas.map((loja) => loja.id);
  const inicioPeriodo = new Date(now.getTime() - 30 * DAY_MS);
  const [agendamentos, avaliacoes, concluidos] = await Promise.all([
    prisma.agendamento.findMany({
      where: { lojaId: { in: lojaIds }, createdAt: { gte: inicioPeriodo } },
      select: { lojaId: true, status: true },
    }),
    prisma.avaliacao.findMany({
      where: { lojaId: { in: lojaIds }, bloqueado: false, createdAt: { gte: inicioPeriodo } },
      select: { lojaId: true, nota: true },
    }),
    prisma.agendamento.findMany({
      where: { lojaId: { in: lojaIds }, status: "finalizado" },
      select: { lojaId: true, data: true },
    }),
  ]);

  const updates = lojas.map((loja) => {
    const saude = calcularSaudeLoja({
      loja,
      agendamentos: agendamentos.filter((item) => item.lojaId === loja.id),
      avaliacoes: avaliacoes.filter((item) => item.lojaId === loja.id),
      concluidos: concluidos.filter((item) => item.lojaId === loja.id),
      now,
    });
    return prisma.loja.update({
      where: { id: loja.id },
      data: { healthStatus: saude.healthStatus, healthReasons: saude.healthReasons },
    });
  });
  const resultados = await prisma.$transaction(updates);

  return {
    lojasAnalisadas: resultados.length,
    saudaveis: resultados.filter((loja) => loja.healthStatus === "healthy").length,
    emAtencao: resultados.filter((loja) => loja.healthStatus === "warning").length,
    criticas: resultados.filter((loja) => loja.healthStatus === "critical").length,
  };
}

function agendarProximaExecucao() {
  const agora = new Date();
  const proximaExecucao = new Date(agora);
  proximaExecucao.setHours(2, 0, 0, 0);
  if (proximaExecucao <= agora) proximaExecucao.setDate(proximaExecucao.getDate() + 1);
  return proximaExecucao.getTime() - agora.getTime();
}

async function iniciarHealthWorker() {
  async function executarEAgendar(aguardarProximoDia = false) {
    let proximoIntervalo = aguardarProximoDia ? agendarProximaExecucao() : 5 * 60 * 1000;
    try {
      const resultado = await recalcularStatusSaudeLojas();
      console.info("Análise de saúde das lojas concluída:", resultado);
      proximoIntervalo = agendarProximaExecucao();
    } catch (err) {
      console.error("Falha ao recalcular a saúde das lojas:", err);
    } finally {
      setTimeout(executarEAgendar, proximoIntervalo);
    }
  }

  let proximoIntervalo = agendarProximaExecucao();
  try {
    const resultado = await recalcularStatusSaudeLojas();
    console.info("Análise inicial de saúde das lojas concluída:", resultado);
  } catch (err) {
    console.error("Falha na análise inicial de saúde das lojas:", err);
    proximoIntervalo = 5 * 60 * 1000;
  }
  setTimeout(executarEAgendar, proximoIntervalo);
}

module.exports = { iniciarHealthWorker, recalcularStatusSaudeLojas };
