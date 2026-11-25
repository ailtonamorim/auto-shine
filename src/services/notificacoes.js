// Transactional outbox (tópico 8): cada alteração de agendamento grava, NA MESMA
// transação, as notificações que precisam sair. Se a transação reverter, nenhuma
// notificação fica na fila; se confirmar, o worker (fila-notificacoes.js) envia depois.

const CAMPOS_VISIVEIS = ['data', 'hora', 'status', 'veiculo', 'formaPagamento', 'notas'];

function tipoEvento({ evento, autorTipo, atual = {} }) {
  if (evento === 'criacao') return 'NOVA_SOLICITACAO';
  // Só a duração interna da agenda mudou: não há nada novo para o cliente.
  if (!CAMPOS_VISIVEIS.some(campo => Object.hasOwn(atual, campo))) return null;
  if (autorTipo === 'sistema') return 'EXPIRACAO_AUTOMATICA';
  if (autorTipo === 'admin') return 'ALTERACAO_ADMIN';
  const reagendou = Object.hasOwn(atual, 'data') || Object.hasOwn(atual, 'hora');
  if (autorTipo === 'cliente') {
    if (atual.status === 'cancelado') return 'CANCELAMENTO_CLIENTE';
    return reagendou ? 'REAGENDAMENTO_CLIENTE' : 'ALTERACAO_CLIENTE';
  }
  if (autorTipo === 'parceiro') {
    if (atual.status === 'cancelado') return 'CANCELAMENTO_ESTABELECIMENTO';
    if (atual.status === 'confirmado') return 'CONFIRMACAO';
    if (atual.status === 'finalizado') return 'FINALIZACAO';
    return 'ALTERACAO_ESTABELECIMENTO';
  }
  return null;
}

// Quem fez a alteração já sabe dela; avisamos a outra parte.
// Eventos do sistema/admin e a nova solicitação (recibo) vão para os dois lados.
function destinatariosDoTipo(tipo) {
  if (['NOVA_SOLICITACAO', 'ALTERACAO_ADMIN', 'EXPIRACAO_AUTOMATICA'].includes(tipo)) return ['ESTABELECIMENTO', 'CLIENTE'];
  if (['ALTERACAO_CLIENTE', 'REAGENDAMENTO_CLIENTE', 'CANCELAMENTO_CLIENTE'].includes(tipo)) return ['ESTABELECIMENTO'];
  return ['CLIENTE'];
}

function contato(ag, destinatarioTipo) {
  if (destinatarioTipo === 'CLIENTE') {
    return { email: ag.usuario?.email || ag.emailCliente || null, nome: ag.usuario?.nome || ag.nomeCliente || 'Cliente' };
  }
  return { email: ag.loja?.dono?.email || null, nome: ag.loja?.dono?.nome || ag.loja?.nome || 'Estabelecimento' };
}

function mudancas(anterior = {}, atual = {}) {
  return CAMPOS_VISIVEIS.filter(campo => Object.hasOwn(atual, campo))
    .map(campo => ({ campo, anterior: anterior[campo] ?? null, atual: atual[campo] ?? null }));
}

/**
 * Grava as notificações do evento usando o cliente da transação (tx).
 * Deve ser chamada depois do update do agendamento, dentro da mesma transação.
 */
async function enfileirarNotificacoes(tx, { agendamentoId, evento = 'alteracao', autorTipo, autorNome, motivo = null, anterior = {}, atual = {}, now = new Date() }) {
  const tipo = tipoEvento({ evento, autorTipo, atual });
  if (!tipo) return [];
  const ag = await tx.agendamento.findUnique({
    where: { id: agendamentoId },
    include: {
      loja: { select: { nome: true, endereco: true, dono: { select: { nome: true, email: true } } } },
      servico: { select: { nome: true } },
      usuario: { select: { nome: true, email: true } },
    },
  });
  if (!ag) return [];
  // A revisão já foi incrementada pelo update: identifica unicamente este evento.
  const eventoId = `agendamento:${ag.id}:rev:${ag.revisao ?? 0}`;
  const base = {
    agendamentoId: ag.id, revisao: ag.revisao ?? 0,
    loja: { nome: ag.loja?.nome || 'Estabelecimento', endereco: ag.loja?.endereco || null },
    servico: ag.servicoNome || ag.servico?.nome || 'Serviço',
    cliente: { nome: ag.usuario?.nome || ag.nomeCliente || 'Cliente' },
    data: ag.data, hora: ag.hora, status: ag.status, veiculo: ag.veiculo, formaPagamento: ag.formaPagamento ?? null,
    autor: { tipo: autorTipo, nome: autorNome || null }, motivo, mudancas: mudancas(anterior, atual),
  };
  const linhas = destinatariosDoTipo(tipo).map(destinatarioTipo => {
    const { email, nome } = contato(ag, destinatarioTipo);
    if (!email) return null;
    return {
      eventoId, chaveIdempotencia: `${eventoId}:${destinatarioTipo}`, tipo,
      destinatarioEmail: email, destinatarioTipo,
      payload: { ...base, destinatarioNome: nome },
      status: 'PENDENTE', proximaTentativaEm: now,
    };
  }).filter(Boolean);
  if (!linhas.length) return [];
  // skipDuplicates + chave única: repetir o mesmo evento não duplica e-mails.
  await tx.notificacaoFila.createMany({ data: linhas, skipDuplicates: true });
  return linhas;
}

module.exports = { tipoEvento, destinatariosDoTipo, enfileirarNotificacoes, CAMPOS_VISIVEIS };
