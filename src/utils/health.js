const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(date, now) {
  const dateUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((nowUtc - dateUtc) / DAY_MS));
}

function parseBookingDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function calcularSaudeLoja({ loja, agendamentos, avaliacoes, concluidos, now = new Date() }) {
  const totalAgendamentos = agendamentos.length;
  const cancelamentos = agendamentos.filter((agendamento) => agendamento.status === "cancelado").length;
  const taxaCancelamento = totalAgendamentos ? (cancelamentos / totalAgendamentos) * 100 : 0;
  const notaMedia = avaliacoes.length
    ? avaliacoes.reduce((total, avaliacao) => total + avaliacao.nota, 0) / avaliacoes.length
    : null;

  const ultimaConclusao = concluidos.reduce((maisRecente, agendamento) => {
    const data = parseBookingDate(agendamento.data);
    if (!data) return maisRecente;
    return !maisRecente || data > maisRecente ? data : maisRecente;
  }, null);
  const inicioInatividade = ultimaConclusao || loja.createdAt;
  const diasSemConclusao = daysBetween(inicioInatividade, now);
  const healthReasons = [];
  let healthStatus = "healthy";

  if (taxaCancelamento >= 15) {
    healthStatus = "critical";
    healthReasons.push(`Taxa de cancelamento de ${taxaCancelamento.toFixed(1)}% nos últimos 30 dias (limite: 15%).`);
  }
  if (notaMedia !== null && notaMedia < 4) {
    healthStatus = "critical";
    healthReasons.push(`Nota média de ${notaMedia.toFixed(1)} nos últimos 30 dias (abaixo de 4,0).`);
  }
  if (diasSemConclusao > 14) {
    healthStatus = "critical";
    healthReasons.push(`Sem agendamentos concluídos há ${diasSemConclusao} dias (limite: 14).`);
  }

  if (diasSemConclusao >= 7 && diasSemConclusao <= 14) {
    if (healthStatus !== "critical") healthStatus = "warning";
    healthReasons.push(`Sem agendamentos concluídos há ${diasSemConclusao} dias.`);
  }
  if (notaMedia !== null && notaMedia >= 4 && notaMedia <= 4.2) {
    if (healthStatus !== "critical") healthStatus = "warning";
    healthReasons.push(`Nota média de ${notaMedia.toFixed(1)} nos últimos 30 dias.`);
  }

  return { healthStatus, healthReasons };
}

module.exports = { calcularSaudeLoja };
