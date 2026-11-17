const prisma = require("../config/database");

const horariosPadrao = ["08:00", "09:30", "11:00", "13:30", "15:00", "16:30"];
const diasPadraoAgenda = ["1", "2", "3", "4", "5", "6"];
const statusValidos = new Set(["pendente", "confirmado", "finalizado", "cancelado"]);
const statusBloqueiamHorario = ["pendente", "confirmado"];

function normalizarHorariosAgenda(valor) {
  const lista = Array.isArray(valor) ? valor : String(valor || "").split(/[,\n;]/).map((item) => item.trim());
  const unicos = new Set();
  lista.forEach((item) => {
    const match = String(item || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return;
    const hora = Number(match[1]);
    const minuto = Number(match[2]);
    if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return;
    unicos.add(`${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`);
  });
  return [...unicos].sort((a, b) => a.localeCompare(b));
}

function normalizarDiasAgenda(valor) {
  const lista = Array.isArray(valor) ? valor : String(valor || "").split(/[,\n;]/).map((item) => item.trim());
  const unicos = new Set();
  lista.forEach((item) => {
    const dia = Number(item);
    if (Number.isInteger(dia) && dia >= 0 && dia <= 6) unicos.add(String(dia));
  });
  return [...unicos].sort((a, b) => Number(a) - Number(b));
}

function serializarAgendaDias(valor) {
  const dias = normalizarDiasAgenda(valor);
  return dias.length ? dias.join(",") : diasPadraoAgenda.join(",");
}

function serializarAgendaHorarios(valor) {
  const horarios = normalizarHorariosAgenda(valor);
  return horarios.length ? horarios.join(",") : horariosPadrao.join(",");
}

function obterAgendaDias(loja) {
  return normalizarDiasAgenda(loja?.agendaDias || diasPadraoAgenda);
}

function obterAgendaHorarios(loja) {
  return normalizarHorariosAgenda(loja?.agendaHorarios || horariosPadrao);
}

function diaSemanaData(dataTexto) {
  const data = new Date(`${dataTexto}T12:00:00`);
  return data.getDay();
}

async function horarioOcupado({ lojaId, data, hora, ignorarId = null }) {
  const ocupado = await prisma.agendamento.findFirst({
    where: { lojaId: Number(lojaId), data, hora, status: { in: statusBloqueiamHorario }, ...(ignorarId ? { id: { not: Number(ignorarId) } } : {}) },
    select: { id: true },
  });
  return Boolean(ocupado);
}

async function montarDisponibilidadeLoja({ loja, data, ignorarId = null }) {
  const dias = obterAgendaDias(loja);
  const horariosConfigurados = obterAgendaHorarios(loja);
  const diaSemana = String(diaSemanaData(data));
  const aberto = dias.includes(diaSemana);
  if (!aberto) return { aberto: false, diasFuncionamento: dias, horariosConfigurados, horarios: [], mensagem: "A loja não atende nesta data." };
  const agendamentos = await prisma.agendamento.findMany({
    where: { lojaId: loja.id, data, status: { in: statusBloqueiamHorario }, ...(ignorarId ? { id: { not: Number(ignorarId) } } : {}) },
    select: { hora: true },
  });
  const ocupados = new Set(agendamentos.map((a) => a.hora));
  return { aberto: true, diasFuncionamento: dias, horariosConfigurados, horarios: horariosConfigurados.map((hora) => ({ hora, disponivel: !ocupados.has(hora) })) };
}

function erroHorarioReservado(err) {
  return err?.code === "P2002" || /Agendamento_lojaId_data_hora_ativo_key/i.test(String(err?.message || ""));
}

module.exports = {
  horariosPadrao, diasPadraoAgenda, statusValidos, statusBloqueiamHorario,
  normalizarHorariosAgenda, normalizarDiasAgenda, serializarAgendaDias, serializarAgendaHorarios,
  obterAgendaDias, obterAgendaHorarios, diaSemanaData, horarioOcupado, montarDisponibilidadeLoja, erroHorarioReservado,
};
