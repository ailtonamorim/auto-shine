const { sincronizarExpirados } = require('../services/expiracao-agendamentos');
const { enfileirarNotificacoes } = require('../services/notificacoes');
const express = require("express");
const prisma = require("../config/database");
const { autenticarUsuario, autenticarDono } = require("../middlewares/auth");
const { montarDisponibilidadeLoja, validarHorario, duracaoReserva } = require("../utils/agenda");
const { comAgendaBloqueada } = require('../utils/agenda-transacao');
const { minutoDia } = require('../utils/agenda-tempo');
const { erro, motivoObrigatorio, dadosEdicao, diferencas } = require("../utils/agendamento-edicao");
const { snapshotServico } = require('../utils/agendamento-snapshot');
const { validarOperacao, comRegras, antecedenciaMinutos } = require('../utils/agendamento-regras');
const { filtroLojaDisponivel } = require('../utils/loja');
const router = express.Router();

const detalhes = {
  loja: { select: { id: true, nome: true, endereco: true, agendaDias: true, agendaHorarios: true, capacidadeSimultanea: true, agendaFechamento: true, agendaBloqueios: true, formasPagamento: true } },
  servico: { select: { id: true, nome: true, preco: true, duracao: true } },
  usuario: { select: { nome: true, email: true } },
  alteracoes: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
};
const ativos = new Set(['pendente', 'confirmado']);
function responderErro(res, err) {
  if (['P2028','P2034'].includes(err.code)) return res.status(503).json({ error: 'A agenda está ocupada. Atualize os horários e tente novamente.' });
  if (err.status) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error('Erro em agendamentos:', err);
  return res.status(500).json({ error: 'Não foi possível concluir a operação. Tente novamente.' });
}
function acesso(req, tipo) {
  return tipo === 'parceiro' ? { loja: { donoId: req.dono.donoId } } : { usuarioId: req.usuario.id };
}
async function buscar(req, tipo, db = prisma) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw erro(400, 'ID inválido.');
  const ag = await db.agendamento.findFirst({ where: { id, ...acesso(req, tipo) }, include: { loja: true } });
  if (!ag) throw erro(404, 'Agendamento não encontrado ou sem permissão.');
  return ag;
}
function verificarRevisao(ag, value) {
  if (!Number.isInteger(value) || value !== ag.revisao) {
    throw Object.assign(erro(409, 'Este agendamento foi atualizado. Feche a edição e atualize a lista antes de tentar novamente.'), { code: 'REVISAO_DESATUALIZADA' });
  }
}
async function registrar(ag, dados, motivo, req, tipo, acao) {
  const { anterior, atual } = diferencas(ag, dados);
  if (!Object.keys(atual).length) throw erro(400, 'Nenhuma informação foi alterada.');
  return comAgendaBloqueada(ag.lojaId, async tx => {
    const fresh = await buscar(req, tipo, tx);
    verificarRevisao(fresh, ag.revisao);
    if (fresh.status !== ag.status) throw erro(409, 'O status mudou. Atualize a lista.');
    const now = new Date();
    const regra = validarOperacao(fresh, { tipo, acao, dados, excecaoPrazo: req.body.excecaoPrazo, now });
    if ((dados.data && dados.data !== fresh.data) || (dados.hora && dados.hora !== fresh.hora)) {
      if (!duracaoReserva(fresh)) throw erro(400, 'O parceiro precisa definir a duração desta reserva antiga antes de reagendar.');
      await validarHorario({ loja: fresh.loja, data: dados.data, hora: dados.hora, duracaoMinutos: duracaoReserva(fresh), ignorarId: fresh.id, db: tx });
    }
    const result = await tx.agendamento.updateMany({
      where: { id: ag.id, revisao: ag.revisao, status: ag.status, ...acesso(req, tipo) },
      data: { ...dados, revisao: { increment: 1 } },
    });
    if (result.count !== 1) throw Object.assign(erro(409, 'O agendamento mudou enquanto você editava. Atualize a lista.'), { code: 'REVISAO_DESATUALIZADA' });
    const autorNome = tipo === 'parceiro' ? (req.dono.nome || 'Estabelecimento') : (req.usuario.nome || 'Cliente');
    const motivoFinal = regra.excecaoUsada ? `[Exceção de prazo: ${regra.antecedenciaMinutos} min] ${motivo}` : motivo;
    await tx.alteracaoAgendamento.create({ data: {
      agendamentoId: ag.id, autorTipo: tipo, autorNome, motivo: motivoFinal, anterior, atual,
      vistoClienteEm: tipo === 'cliente' ? now : null,
      vistoParceiroEm: tipo === 'parceiro' ? now : null,
    } });
    // Outbox: a notificação confirma ou reverte junto com a alteração e o histórico.
    await enfileirarNotificacoes(tx, { agendamentoId: ag.id, autorTipo: tipo, autorNome, motivo: motivoFinal, anterior, atual, now });
    return tx.agendamento.findUnique({ where: { id: ag.id }, include: detalhes });
  });
}

router.post('/', autenticarUsuario, async (req, res) => {
  try {
    antecedenciaMinutos(); // Configuração inválida não pode falhar só depois de gravar a reserva.
    const lojaId = Number(req.body.lojaId), servicoId = Number(req.body.servicoId);
    if (!Number.isSafeInteger(lojaId) || lojaId < 1 || !Number.isSafeInteger(servicoId) || servicoId < 1) throw erro(400, 'Selecione loja e serviço válidos.');
    const agendamento = await comAgendaBloqueada(lojaId, async tx => {
      // Loja bloqueada, pendente de aprovação, inativa ou de dono bloqueado não recebe reservas.
      const loja = await tx.loja.findFirst({ where: { id: lojaId, ...filtroLojaDisponivel() } });
      if (!loja) throw erro(404, 'Loja não encontrada ou indisponível.');
      const dados = dadosEdicao(req.body, loja);
      const servico = await tx.servicoLoja.findFirst({ where: { id: servicoId, lojaId } });
      if (!servico) throw erro(404, 'Serviço não encontrado nesta loja.');
      let snapshot;
      try { snapshot = snapshotServico(servico); }
      catch (err) {
        throw erro(400, `O estabelecimento precisa corrigir o cadastro deste serviço antes de receber reservas. ${err.message}`);
      }
      // A cotação exibida é apenas uma comparação; os dados salvos vêm do banco.
      const esperado = req.body.servicoEsperado;
      if (esperado !== undefined && (!esperado || esperado.nome !== servico.nome || esperado.preco !== servico.preco || esperado.duracao !== servico.duracao)) {
        throw Object.assign(erro(409, 'O serviço mudou. Recarregue a página e confira o novo preço e a duração antes de confirmar.'), { code: 'SERVICO_ALTERADO' });
      }
      await validarHorario({ loja, ...dados, duracaoMinutos: snapshot.duracaoMinutos, db: tx });
      const novo = await tx.agendamento.create({
        // valorServico alimenta os relatórios do painel admin; precoCentavos segue como valor histórico oficial.
        data: { ...dados, ...snapshot, valorServico: servico.preco, lojaId, servicoId, usuarioId: req.usuario.id,
          nomeCliente: req.usuario.nome || null, emailCliente: req.usuario.email || null },
        include: detalhes,
      });
      await enfileirarNotificacoes(tx, { agendamentoId: novo.id, evento: 'criacao', autorTipo: 'cliente', autorNome: req.usuario.nome || 'Cliente' });
      return novo;
    });
    res.status(201).json({ agendamento: comRegras(agendamento, 'cliente') });
  } catch (err) { responderErro(res, err); }
});

router.get('/dono', autenticarDono, async (req, res) => {
  try {
    const carregar = () => prisma.agendamento.findMany({ where: acesso(req, 'parceiro'), include: detalhes, orderBy: { createdAt: 'desc' } });
    let agendamentos = await carregar();
    if (await sincronizarExpirados(agendamentos)) agendamentos = await carregar();
    res.set('Cache-Control', 'no-store');
    res.json({ agendamentos: agendamentos.map(ag => comRegras(ag, 'parceiro')) });
  } catch (err) { responderErro(res, err); }
});
router.get('/me', autenticarUsuario, async (req, res) => {
  try {
    const carregar = () => prisma.agendamento.findMany({ where: acesso(req, 'cliente'), include: detalhes, orderBy: { createdAt: 'desc' } });
    let agendamentos = await carregar();
    if (await sincronizarExpirados(agendamentos)) agendamentos = await carregar();
    res.set('Cache-Control', 'no-store');
    res.json({ agendamentos: agendamentos.map(ag => comRegras(ag, 'cliente')) });
  } catch (err) { responderErro(res, err); }
});

function disponibilidadeEdicao(tipo) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const ag = await buscar(req, tipo);
      if (!comRegras(ag, tipo).regras.podeReagendar) throw erro(409, 'O prazo para reagendar terminou ou esta reserva já foi encerrada.');
      const duracaoMinutos = duracaoReserva(ag);
      if (!duracaoMinutos) return res.json({ aberto: false, horarios: [], mensagem: 'O parceiro precisa definir a duração desta reserva antiga antes de reagendar.' });
      res.json(await montarDisponibilidadeLoja({ loja: ag.loja, data: String(req.query.data || ''), duracaoMinutos, ignorarId: ag.id }));
    } catch (err) { responderErro(res, err); }
  };
}
router.get('/:id/disponibilidade', autenticarUsuario, disponibilidadeEdicao('cliente'));
router.get('/:id/dono/disponibilidade', autenticarDono, disponibilidadeEdicao('parceiro'));

router.put('/:id/dono/duracao', autenticarDono, async (req, res) => {
  try {
    const ag = await buscar(req, 'parceiro');
    verificarRevisao(ag, req.body.revisao);
    if (!ativos.has(ag.status) || duracaoReserva(ag)) throw erro(400, 'A duração só pode ser definida para reserva antiga ativa sem duração.');
    const minutos = req.body.duracaoAgendaMinutos;
    if (!Number.isInteger(minutos) || minutos < 1 || minutos > 1440 || minutoDia(ag.hora) + minutos > 1440) throw erro(400, 'Informe minutos inteiros positivos, com término até a meia-noite da data reservada.');
    const motivo = motivoObrigatorio(req.body.motivo);
    // Substitui a ocupação conservadora do dia por um intervalo menor; não aumenta ocupação.
    // Não altera nem preenche o snapshot comercial histórico.
    const agendamento = await registrar(ag, { duracaoAgendaMinutos: minutos }, motivo, req, 'parceiro', 'duracao');
    res.json({ agendamento: comRegras(agendamento, 'parceiro') });
  } catch (err) { responderErro(res, err); }
});

function editar(tipo) {
  return async (req, res) => {
    try {
      const ag = await buscar(req, tipo);
      verificarRevisao(ag, req.body.revisao);
      if (!ativos.has(ag.status)) throw erro(400, 'Agendamentos finalizados, cancelados ou expirados não podem ser editados.');
      const motivo = motivoObrigatorio(req.body.motivo);
      const dados = dadosEdicao(req.body, ag.loja);
      if (tipo === 'cliente' && (dados.data !== ag.data || dados.hora !== ag.hora)) dados.status = 'pendente';
      // Mudanças de pagamento/observação não perdem o horário atual se a agenda da loja mudou depois da reserva.
      const agendamento = await registrar(ag, dados, motivo, req, tipo, 'editar');
      res.json({ agendamento: comRegras(agendamento, tipo) });
    } catch (err) { responderErro(res, err); }
  };
}
router.put('/:id', autenticarUsuario, editar('cliente'));
router.put('/:id/dono', autenticarDono, editar('parceiro'));

function cancelar(tipo) {
  return async (req, res) => {
    try {
      const ag = await buscar(req, tipo);
      verificarRevisao(ag, req.body.revisao);
      if (!ativos.has(ag.status)) throw erro(400, 'Este agendamento não pode ser cancelado.');
      const motivo = motivoObrigatorio(req.body.motivo);
      const agendamento = await registrar(ag, { status: 'cancelado' }, motivo, req, tipo, 'cancelar');
      res.json({ agendamento: comRegras(agendamento, tipo) });
    } catch (err) { responderErro(res, err); }
  };
}
router.put('/:id/cancelar', autenticarUsuario, cancelar('cliente'));
router.put('/:id/dono/cancelar', autenticarDono, cancelar('parceiro'));

router.put('/:id/status', autenticarDono, async (req, res) => {
  try {
    const ag = await buscar(req, 'parceiro');
    verificarRevisao(ag, req.body.revisao);
    const status = req.body.status;
    if (!['confirmado', 'finalizado'].includes(status)) throw erro(400, 'Use a ação de cancelamento com motivo.');
    if (!ativos.has(ag.status)) throw erro(400, 'Este agendamento já foi encerrado.');
    const motivo = status === 'confirmado' ? 'Agendamento confirmado pelo estabelecimento.' : 'Atendimento marcado como finalizado pelo estabelecimento.';
    const agendamento = await registrar(ag, { status }, motivo, req, 'parceiro', 'status');
    res.json({ agendamento: comRegras(agendamento, 'parceiro') });
  } catch (err) { responderErro(res, err); }
});

function marcarLidas(tipo) {
  return async (req, res) => {
    try {
      const ag = await buscar(req, tipo);
      const ids = req.body.ids;
      if (!Array.isArray(ids) || ids.length > 500 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw erro(400, 'Lista de alterações inválida.');
      const campo = tipo === 'cliente' ? 'vistoClienteEm' : 'vistoParceiroEm';
      // Somente eventos mostrados nesta tela são marcados. Novos eventos simultâneos continuam não lidos.
      await prisma.alteracaoAgendamento.updateMany({
        where: { agendamentoId: ag.id, id: { in: ids }, [campo]: null, autorTipo: { not: tipo } },
        data: { [campo]: new Date() },
      });
      res.json({ ok: true });
    } catch (err) { responderErro(res, err); }
  };
}
router.put('/:id/alteracoes/lidas', autenticarUsuario, marcarLidas('cliente'));
router.put('/:id/dono/alteracoes/lidas', autenticarDono, marcarLidas('parceiro'));

// O parceiro cancela com histórico; não apaga a reserva nem avaliações/denúncias vinculadas.
router.delete('/:id', autenticarDono, (_req, res) => res.status(405).json({ error: 'Use Cancelar agendamento e informe o motivo. O histórico deve ser preservado.' }));
module.exports = router;
