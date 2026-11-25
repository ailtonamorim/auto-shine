const { deveExpirar } = require('./agendamento-expiracao');
const prisma = require("../config/database");
const { erro } = require('./agendamento-edicao');
const { dataValida, minutoDia, minutoCivil, agoraAgenda } = require('./agenda-tempo');

const horariosPadrao = ["08:00", "09:30", "11:00", "13:30", "15:00", "16:30"];
const diasPadraoAgenda = ["1", "2", "3", "4", "5", "6"];
const statusValidos = new Set(["pendente", "confirmado", "finalizado", "cancelado", "expirado"]);
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
    if (String(item).trim() === "") return;
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

function diaSemanaData(data) {
  return dataValida(data) ? new Date(`${data}T12:00:00Z`).getUTCDay() : NaN;
}
function configuracaoAgenda(input = {}, atual = {}) {
  const capacidade = input.capacidadeSimultanea ?? atual.capacidadeSimultanea ?? 1;
  const capacidadeSimultanea = typeof capacidade === 'number' ? capacidade : /^\d+$/.test(String(capacidade)) ? Number(capacidade) : NaN;
  if (!Number.isInteger(capacidadeSimultanea) || capacidadeSimultanea < 1 || capacidadeSimultanea > 100) throw erro(400, 'A capacidade deve ser de 1 a 100 veículos simultâneos.');
  const agendaFechamento = input.agendaFechamento ?? atual.agendaFechamento ?? '18:00';
  if (minutoDia(agendaFechamento) === null) throw erro(400, 'Informe o encerramento no formato HH:MM.');
  const agendaBloqueios = normalizarBloqueios(input.agendaBloqueios ?? atual.agendaBloqueios ?? []);
  const horarios = obterAgendaHorarios({ agendaHorarios: input.agendaHorarios ?? atual.agendaHorarios });
  if (!horarios.length || horarios.some(h => minutoDia(h) >= minutoDia(agendaFechamento))) {
    throw erro(400, 'Todos os horários de início devem ser anteriores ao encerramento.');
  }
  return { capacidadeSimultanea, agendaFechamento, agendaBloqueios };
}
function normalizarBloqueios(value) {
  const list = typeof value === 'string' ? value.split(/\r?\n/).map(x => x.trim()).filter(Boolean) : value;
  if (!Array.isArray(list) || list.length > 200) throw erro(400, 'Informe até 200 bloqueios de agenda.');
  return list.map(item => {
    let data, inicio, fim;
    if (typeof item === 'string') {
      const match = /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2}))?$/.exec(item);
      if (!match) throw erro(400, 'Use um bloqueio por linha: AAAA-MM-DD ou AAAA-MM-DD HH:MM-HH:MM.');
      [, data, inicio, fim] = match;
    } else if (item && typeof item === 'object') ({ data, inicio, fim } = item);
    if (!dataValida(data)) throw erro(400, 'Data de bloqueio inválida.');
    if (inicio == null && fim == null) return { data };
    if (minutoDia(inicio) === null || minutoDia(fim) === null || inicio >= fim) throw erro(400, 'O bloqueio deve terminar depois do início, no mesmo dia.');
    return { data, inicio, fim };
  });
}
function duracaoReserva(ag) {
  const value = ag.duracaoMinutos ?? ag.duracaoAgendaMinutos;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
function intervaloReserva(ag) {
  const inicio = minutoCivil(ag.data, ag.hora);
  if (inicio === null) return null;
  const duracao = duracaoReserva(ag);
  // Uma reserva legada sem duração bloqueia conservadoramente sua data inteira.
  return duracao ? { inicio, fim: inicio + duracao } : { inicio: minutoCivil(ag.data), fim: minutoCivil(ag.data) + 1440, semDuracao: true };
}
function picoOcupacao(intervalos, inicio, fim) {
  const eventos = [];
  for (const x of intervalos) {
    if (x.inicio < fim && x.fim > inicio) eventos.push([Math.max(inicio, x.inicio), 1], [Math.min(fim, x.fim), -1]);
  }
  // Final às 10h libera vaga para início exatamente às 10h.
  eventos.sort((a,b) => a[0] - b[0] || a[1] - b[1]);
  let uso = 0, pico = 0;
  for (const [, delta] of eventos) { uso += delta; pico = Math.max(pico, uso); }
  return pico;
}
function calcularDisponibilidade({ loja, data, duracaoMinutos, agendamentos = [], ignorarId = null, now = new Date() }) {
  if (!dataValida(data)) throw erro(400, 'Data inválida.');
  if (!Number.isSafeInteger(duracaoMinutos) || duracaoMinutos <= 0) throw erro(400, 'A duração do serviço precisa estar definida.');
  const dias = obterAgendaDias(loja), horariosConfigurados = obterAgendaHorarios(loja);
  const capacidade = loja.capacidadeSimultanea ?? 1;
  const fechamento = minutoCivil(data, loja.agendaFechamento ?? '18:00');
  const agora = agoraAgenda(now);
  const base = { diasFuncionamento: dias, horariosConfigurados, capacidadeSimultanea: capacidade, duracaoMinutos };
  if (loja.bloqueado || !dias.includes(String(diaSemanaData(data))) || data < agora.data) {
    return { ...base, aberto: false, horarios: [], mensagem: data < agora.data ? 'Data passada.' : 'A loja não atende nesta data.' };
  }
  const intervalos = agendamentos.filter(a => a.lojaId === loja.id && a.id !== ignorarId && statusBloqueiamHorario.includes(a.status) && !deveExpirar(a, now)).map(intervaloReserva).filter(Boolean);
  const bloqueios = normalizarBloqueios(loja.agendaBloqueios ?? []).filter(b => b.data === data).map(b => ({
    inicio: minutoCivil(data, b.inicio || '00:00'), fim: b.fim ? minutoCivil(data, b.fim) : minutoCivil(data) + 1440,
  }));
  const horarios = horariosConfigurados.map(hora => {
    const inicio = minutoCivil(data, hora), fim = inicio + duracaoMinutos;
    let motivo = '';
    if (inicio <= agora.minuto) motivo = 'Horário passado';
    else if (fechamento === null || fim > fechamento) motivo = 'Não termina antes do encerramento';
    else if (bloqueios.some(b => b.inicio < fim && b.fim > inicio)) motivo = 'Bloqueado pelo estabelecimento';
    else if (intervalos.some(b => b.semDuracao && b.inicio < fim && b.fim > inicio)) motivo = 'Duração de reserva antiga pendente';
    const vagas = Math.max(0, capacidade - picoOcupacao(intervalos, inicio, fim));
    if (!motivo && vagas === 0) motivo = 'Capacidade esgotada';
    return { hora, disponivel: !motivo, vagas: motivo ? 0 : vagas, motivo };
  });
  return { ...base, aberto: true, horarios, mensagem: horarios.some(h => h.disponivel) ? '' : 'Nenhum horário disponível para a duração selecionada.' };
}
async function montarDisponibilidadeLoja({ loja, data, duracaoMinutos, ignorarId = null, db = prisma, now }) {
  if (!dataValida(data)) throw erro(400, 'Data inválida.');
  // Inclui reservas de datas anteriores que possam atravessar a meia-noite.
  const agendamentos = await db.agendamento.findMany({
    where: { lojaId: loja.id, data: { lte: data }, status: { in: statusBloqueiamHorario } },
    select: { id: true, lojaId: true, data: true, hora: true, status: true, duracaoMinutos: true, duracaoAgendaMinutos: true },
  });
  return calcularDisponibilidade({ loja, data, duracaoMinutos, ignorarId, agendamentos, now });
}
async function validarHorario({ loja, data, hora, duracaoMinutos, ignorarId = null, db = prisma }) {
  const info = await montarDisponibilidadeLoja({ loja, data, duracaoMinutos, ignorarId, db });
  const slot = info.horarios.find(x => x.hora === hora);
  if (!info.aberto || !slot?.disponivel) throw Object.assign(erro(409, slot?.motivo || info.mensagem || 'Horário indisponível para este estabelecimento.'), { code: 'HORARIO_OCUPADO' });
}
function erroHorarioReservado(err) {
  return err?.code === 'HORARIO_OCUPADO';
}
module.exports = {
  horariosPadrao, diasPadraoAgenda, statusValidos, statusBloqueiamHorario,
  normalizarHorariosAgenda, normalizarDiasAgenda, serializarAgendaDias, serializarAgendaHorarios,
  obterAgendaDias, obterAgendaHorarios, diaSemanaData, configuracaoAgenda, normalizarBloqueios,
  duracaoReserva, intervaloReserva, picoOcupacao, calcularDisponibilidade, montarDisponibilidadeLoja,
  validarHorario, erroHorarioReservado,
};
