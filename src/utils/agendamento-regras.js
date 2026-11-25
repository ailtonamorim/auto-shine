const { deveExpirar } = require('./agendamento-expiracao');
const { minutoCivil, agoraAgenda } = require('./agenda-tempo');
const { erro } = require('./agendamento-edicao');

const ATIVOS = new Set(['pendente', 'confirmado']);
function antecedenciaMinutos() {
  const value = process.env.AGENDAMENTO_ANTECEDENCIA_MINUTOS ?? '120';
  const minutos = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(minutos) || minutos < 0 || minutos > 10080) {
    throw erro(503, 'A política de agendamentos está indisponível. Entre em contato com o estabelecimento.');
  }
  return minutos;
}
function politicaAgendamento() {
  const minutos = antecedenciaMinutos();
  const prazo = minutos % 60 === 0 ? `${minutos / 60} hora(s)` : `${minutos} minutos`;
  return { antecedenciaMinutos: minutos, fuso: 'America/Sao_Paulo', texto:
    `Cancelamentos e reagendamentos pelo cliente exigem pelo menos ${prazo} de antecedência. Exceções do estabelecimento ou administrador exigem justificativa e ficam no histórico. Agendamentos pendentes expiram ao atingir o horário marcado sem confirmação.` };
}
function rejeitar(message, code = 'REGRA_AGENDAMENTO', status = 409) {
  throw Object.assign(erro(status, message), { code });
}
function contexto(ag, now = new Date()) {
  const inicio = minutoCivil(ag.data, ag.hora);
  if (inicio === null) rejeitar('O horário desta reserva precisa ser corrigido pelo estabelecimento.');
  // Inclui segundos e milissegundos: 1h59m59s não equivale a duas horas.
  const agora = agoraAgenda(now).minuto + now.getUTCSeconds() / 60 + now.getUTCMilliseconds() / 60000;
  const duracao = ag.duracaoMinutos ?? ag.duracaoAgendaMinutos;
  const fim = Number.isSafeInteger(duracao) && duracao > 0 ? inicio + duracao : null;
  const prazo = antecedenciaMinutos();
  return { inicio, agora, fim, prazo, dentroPrazo: inicio > agora && inicio - agora >= prazo };
}
function validarOperacao(ag, { tipo, acao, dados = {}, excecaoPrazo = false, now = new Date() }) {
  if (!['cliente', 'parceiro', 'admin'].includes(tipo)) rejeitar('Perfil sem permissão.', 'SEM_PERMISSAO', 403);
  if (!ATIVOS.has(ag.status)) rejeitar('Agendamentos finalizados, cancelados ou expirados não podem ser alterados nem reabertos.', 'AGENDAMENTO_ENCERRADO');
  if (excecaoPrazo === true && tipo === 'cliente') rejeitar('Somente o estabelecimento ou administrador pode registrar uma exceção de prazo.', 'SEM_PERMISSAO', 403);
  if (deveExpirar(ag, now)) rejeitar('O horário de confirmação terminou. Este agendamento expirou. Atualize a lista.', 'AGENDAMENTO_EXPIRADO');
  const c = contexto(ag, now);
  let excecaoUsada = false;
  function conferirPrazo() {
    if (c.dentroPrazo) return;
    if (tipo !== 'cliente' && excecaoPrazo === true) { excecaoUsada = true; return; }
    rejeitar(tipo === 'cliente'
      ? `O prazo para cancelar ou reagendar terminou. É necessário ter pelo menos ${c.prazo} minutos de antecedência. Entre em contato com o estabelecimento.`
      : 'O prazo normal terminou. Para continuar, confirme a exceção de prazo e informe o motivo.', 'PRAZO_ENCERRADO');
  }
  if (acao === 'cancelar') conferirPrazo();
  else if (acao === 'editar') {
    const mudouHorario = dados.data !== ag.data || dados.hora !== ag.hora;
    if (mudouHorario) conferirPrazo();
    else if (c.inicio <= c.agora) rejeitar('O atendimento já começou. Não é possível editar os dados desta reserva.', 'ATENDIMENTO_INICIADO');
  } else if (acao === 'status') {
    if (tipo === 'cliente') rejeitar('O cliente não pode confirmar ou finalizar atendimentos.', 'SEM_PERMISSAO', 403);
    if (dados.status === 'confirmado') {
      if (ag.status !== 'pendente') rejeitar('Somente agendamentos pendentes podem ser confirmados.', 'TRANSICAO_INVALIDA');
    } else if (dados.status === 'finalizado') {
      if (ag.status !== 'confirmado') rejeitar('Confirme o agendamento antes de finalizar o atendimento.', 'TRANSICAO_INVALIDA');
      if (c.fim === null) rejeitar('Defina a duração desta reserva antiga antes de finalizar.', 'DURACAO_AUSENTE');
      if (c.agora < c.fim) rejeitar('O atendimento só pode ser finalizado após o término previsto.', 'ATENDIMENTO_NAO_TERMINOU');
    } else rejeitar('Transição de status não permitida. Use o cancelamento com motivo.', 'TRANSICAO_INVALIDA');
  } else if (acao === 'duracao') {
    if (tipo === 'cliente' || c.fim !== null) rejeitar('A duração só pode ser definida pelo estabelecimento para reserva antiga sem duração.');
  } else rejeitar('Operação de agendamento inválida.', 'OPERACAO_INVALIDA', 400);
  return { excecaoUsada, antecedenciaMinutos: c.prazo };
}
function comRegras(ag, tipo, now = new Date()) {
  const expiracaoPendente = deveExpirar(ag, now);
  const ativo = ATIVOS.has(ag.status) && !expiracaoPendente, privilegiado = tipo === 'parceiro' || tipo === 'admin';
  const c = contexto(ag, now);
  let motivoFinalizar = '';
  if (ativo && privilegiado) {
    try { validarOperacao(ag, { tipo, acao: 'status', dados: { status: 'finalizado' }, now }); }
    catch (err) { motivoFinalizar = err.message; }
  }
  const formatar = valor => new Date(valor * 60000).toISOString().slice(0, 16).replace('T', ' ');
  return { ...ag, regras: {
    antecedenciaMinutos: c.prazo, fuso: 'America/Sao_Paulo', expiracaoPendente,
    limiteCancelamento: formatar(c.inicio - c.prazo), fimPrevisto: c.fim === null ? null : formatar(c.fim),
    podeEditar: ativo && (privilegiado || c.inicio > c.agora),
    podeReagendar: ativo && (privilegiado || c.dentroPrazo),
    podeCancelar: ativo && (privilegiado || c.dentroPrazo),
    exigeExcecaoPrazo: ativo && privilegiado && !c.dentroPrazo,
    podeConfirmar: ativo && privilegiado && ag.status === 'pendente',
    podeFinalizar: ativo && privilegiado && !motivoFinalizar,
    motivoFinalizar,
  } };
}
module.exports = { antecedenciaMinutos, politicaAgendamento, validarOperacao, comRegras };
