// Tópico 8: fila de notificações (transactional outbox) — regras, e-mail e worker.
// Banco simulado em memória; o teste notificacoes-postgres.test.js usa PostgreSQL real.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
// O banco é sempre passado explicitamente; o cliente Prisma real não é carregado.
{ const id = require.resolve('../src/config/database'); require.cache[id] = { id, filename: id, loaded: true, exports: {} }; }
const { tipoEvento, destinatariosDoTipo, enfileirarNotificacoes } = require('../src/services/notificacoes');
const { montarEmailNotificacao } = require('../src/services/notificacao-email');
const { processarLote, iniciarNotificacoes, esperaAposTentativa, PRAZO_PROCESSAMENTO_MS } = require('../src/services/fila-notificacoes');

test('tipo do evento segue autor e mudança', () => {
  assert.equal(tipoEvento({ evento: 'criacao', autorTipo: 'cliente' }), 'NOVA_SOLICITACAO');
  assert.equal(tipoEvento({ autorTipo: 'cliente', atual: { status: 'cancelado' } }), 'CANCELAMENTO_CLIENTE');
  assert.equal(tipoEvento({ autorTipo: 'cliente', atual: { data: '2099-01-02', status: 'pendente' } }), 'REAGENDAMENTO_CLIENTE');
  assert.equal(tipoEvento({ autorTipo: 'cliente', atual: { notas: 'x' } }), 'ALTERACAO_CLIENTE');
  assert.equal(tipoEvento({ autorTipo: 'parceiro', atual: { status: 'confirmado' } }), 'CONFIRMACAO');
  assert.equal(tipoEvento({ autorTipo: 'parceiro', atual: { status: 'finalizado' } }), 'FINALIZACAO');
  assert.equal(tipoEvento({ autorTipo: 'parceiro', atual: { status: 'cancelado' } }), 'CANCELAMENTO_ESTABELECIMENTO');
  assert.equal(tipoEvento({ autorTipo: 'parceiro', atual: { hora: '10:00' } }), 'ALTERACAO_ESTABELECIMENTO');
  assert.equal(tipoEvento({ autorTipo: 'admin', atual: { status: 'cancelado' } }), 'ALTERACAO_ADMIN');
  assert.equal(tipoEvento({ autorTipo: 'sistema', atual: { status: 'expirado' } }), 'EXPIRACAO_AUTOMATICA');
  // Duração interna da agenda não gera e-mail.
  assert.equal(tipoEvento({ autorTipo: 'parceiro', atual: { duracaoAgendaMinutos: 60 } }), null);
});

test('quem alterou não recebe aviso da própria ação; admin, sistema e nova solicitação avisam os dois', () => {
  assert.deepEqual(destinatariosDoTipo('REAGENDAMENTO_CLIENTE'), ['ESTABELECIMENTO']);
  assert.deepEqual(destinatariosDoTipo('CONFIRMACAO'), ['CLIENTE']);
  assert.deepEqual(destinatariosDoTipo('ALTERACAO_ADMIN').sort(), ['CLIENTE', 'ESTABELECIMENTO']);
  assert.deepEqual(destinatariosDoTipo('EXPIRACAO_AUTOMATICA').sort(), ['CLIENTE', 'ESTABELECIMENTO']);
  assert.deepEqual(destinatariosDoTipo('NOVA_SOLICITACAO').sort(), ['CLIENTE', 'ESTABELECIMENTO']);
});

function txFalso(ag) {
  const gravadas = [];
  return { gravadas, agendamento: { async findUnique() { return structuredClone(ag); } },
    notificacaoFila: { async createMany({ data, skipDuplicates }) { assert.equal(skipDuplicates, true); gravadas.push(...data); return { count: data.length }; } } };
}
const agBase = { id: 7, revisao: 3, data: '2099-11-10', hora: '09:30', status: 'pendente', veiculo: 'carro', formaPagamento: 'Pix',
  servicoNome: 'Lavagem completa', emailCliente: 'antigo@example.test', nomeCliente: 'Ana',
  usuario: { nome: 'Ana Souza', email: 'ana@example.test' },
  loja: { nome: 'Brilho Prime', endereco: 'Rua A, 10', dono: { nome: 'Carlos', email: 'loja@example.test' } } };

test('enfileira com chave idempotente por evento e destinatário, com foto do que mudou', async () => {
  const tx = txFalso(agBase);
  await enfileirarNotificacoes(tx, { agendamentoId: 7, autorTipo: 'cliente', autorNome: 'Ana', motivo: 'Imprevisto no trabalho',
    anterior: { data: '2099-11-09', hora: '08:00', status: 'confirmado' }, atual: { data: '2099-11-10', hora: '09:30', status: 'pendente' } });
  assert.equal(tx.gravadas.length, 1);
  const [n] = tx.gravadas;
  assert.equal(n.tipo, 'REAGENDAMENTO_CLIENTE');
  assert.equal(n.destinatarioTipo, 'ESTABELECIMENTO');
  assert.equal(n.destinatarioEmail, 'loja@example.test');
  assert.equal(n.eventoId, 'agendamento:7:rev:3');
  assert.equal(n.chaveIdempotencia, 'agendamento:7:rev:3:ESTABELECIMENTO');
  assert.deepEqual(n.payload.mudancas.map(m => m.campo), ['data', 'hora', 'status']);
  assert.equal(n.payload.motivo, 'Imprevisto no trabalho');
});

test('destinatário sem e-mail é ignorado sem quebrar a transação', async () => {
  const tx = txFalso({ ...agBase, loja: { ...agBase.loja, dono: { nome: 'Carlos', email: null } } });
  await enfileirarNotificacoes(tx, { agendamentoId: 7, autorTipo: 'admin', autorNome: 'admin', motivo: 'Correção', anterior: { status: 'pendente' }, atual: { status: 'cancelado' } });
  assert.deepEqual(tx.gravadas.map(n => n.destinatarioTipo), ['CLIENTE']);
  assert.equal(tx.gravadas[0].destinatarioEmail, 'ana@example.test');
});

test('e-mail mostra antes/agora, motivo e escapa conteúdo do usuário', () => {
  const { assunto, texto, html } = montarEmailNotificacao({
    tipo: 'CANCELAMENTO_ESTABELECIMENTO', destinatarioTipo: 'CLIENTE',
    payload: { destinatarioNome: 'Ana', loja: { nome: 'Brilho <Prime>' }, servico: 'Lavagem', data: '2099-11-10', hora: '09:30', status: 'cancelado',
      motivo: '<script>alert(1)</script> Chuva forte', mudancas: [{ campo: 'status', anterior: 'confirmado', atual: 'cancelado' }] },
  }, { link: 'https://autoshine.example/meus-agendamentos.html' });
  assert.match(assunto, /cancelado/);
  assert.match(assunto, /10\/11\/2099 09:30/);
  assert.match(texto, /Status: Confirmado → Cancelado/);
  assert.match(texto, /Motivo informado: <script>/); // Texto puro pode conter o original.
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Brilho &lt;Prime&gt;'));
});

// ---------- Worker ----------
let fila, seq;
function comparar(row, where) {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return v.some(w => comparar(row, w));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('lte' in v) return row[k] <= v.lte;
      if ('lt' in v) return row[k] !== null && row[k] < v.lt;
    }
    return row[k] instanceof Date ? row[k].getTime() === v?.getTime?.() : row[k] === v;
  });
}
const db = { notificacaoFila: {
  async findMany({ where, take }) { return structuredClone(fila.filter(r => comparar(r, where)).sort((a, b) => a.proximaTentativaEm - b.proximaTentativaEm).slice(0, take)); },
  async updateMany({ where, data }) {
    const rows = fila.filter(r => comparar(r, where));
    for (const r of rows) for (const [k, v] of Object.entries(data)) r[k] = v && typeof v === 'object' && 'increment' in v ? r[k] + v.increment : v;
    return { count: rows.length };
  },
} };
const T0 = new Date('2026-11-22T12:00:00Z');
function linha(patch = {}) {
  return { id: `n${++seq}`, tipo: 'CONFIRMACAO', destinatarioTipo: 'CLIENTE', destinatarioEmail: 'a@example.test', payload: {},
    status: 'PENDENTE', tentativas: 0, limiteTentativas: 3, proximaTentativaEm: new Date(T0.getTime() - 1000), processandoAte: null,
    workerId: null, ultimaFalha: null, enviadoEm: null, ...patch };
}
const silencioso = { log() {}, error() {} };
beforeEach(() => { fila = []; seq = 0; });

test('envia pendentes e marca ENVIADO', async () => {
  fila.push(linha(), linha({ proximaTentativaEm: new Date(T0.getTime() + 60000) })); // a segunda ainda não venceu
  const enviados = [];
  const r = await processarLote({ db, clock: () => T0, workerId: 'w1', enviar: async n => enviados.push(n.id), logger: silencioso });
  assert.deepEqual(enviados, ['n1']);
  assert.equal(r.enviados, 1);
  assert.equal(fila[0].status, 'ENVIADO');
  assert.equal(fila[0].tentativas, 1);
  assert.equal(fila[1].status, 'PENDENTE');
});

test('falha temporária volta para PENDENTE com espera crescente e para no limite como FALHA', async () => {
  fila.push(linha());
  const falhar = async () => { throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }); };
  let agora = T0;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    await processarLote({ db, clock: () => agora, workerId: 'w1', enviar: falhar, logger: silencioso });
    assert.equal(fila[0].tentativas, tentativa);
    if (tentativa < 3) {
      assert.equal(fila[0].status, 'PENDENTE');
      assert.equal(fila[0].proximaTentativaEm.getTime(), agora.getTime() + esperaAposTentativa(tentativa));
      // Antes da espera nada acontece.
      await processarLote({ db, clock: () => agora, workerId: 'w1', enviar: falhar, logger: silencioso });
      assert.equal(fila[0].tentativas, tentativa);
      agora = new Date(fila[0].proximaTentativaEm.getTime());
    }
  }
  assert.equal(fila[0].status, 'FALHA');
  assert.match(fila[0].ultimaFalha, /ETIMEDOUT/);
});

test('endereço recusado vira FALHA na primeira tentativa', async () => {
  fila.push(linha());
  await processarLote({ db, clock: () => T0, enviar: async () => { throw Object.assign(new Error('Recipient rejected'), { responseCode: 550 }); }, logger: silencioso });
  assert.equal(fila[0].status, 'FALHA');
  assert.equal(fila[0].tentativas, 1);
});

test('duas instâncias simultâneas não enviam a mesma linha', async () => {
  fila.push(linha(), linha(), linha());
  const enviados = [];
  const enviar = async n => { await new Promise(r => setTimeout(r, 5)); enviados.push(n.id); };
  await Promise.all([
    processarLote({ db, clock: () => T0, workerId: 'w1', enviar, logger: silencioso }),
    processarLote({ db, clock: () => T0, workerId: 'w2', enviar, logger: silencioso }),
  ]);
  assert.deepEqual(enviados.sort(), ['n1', 'n2', 'n3']);
  assert.ok(fila.every(n => n.status === 'ENVIADO' && n.tentativas === 1));
});

test('linha presa em PROCESSANDO é retomada após o prazo; o worker antigo não sobrescreve', async () => {
  fila.push(linha({ status: 'PROCESSANDO', tentativas: 1, workerId: 'caiu', processandoAte: new Date(T0.getTime() - 1) }),
    linha({ status: 'PROCESSANDO', tentativas: 1, workerId: 'ativo', processandoAte: new Date(T0.getTime() + PRAZO_PROCESSAMENTO_MS) }));
  const enviados = [];
  await processarLote({ db, clock: () => T0, workerId: 'w2', enviar: async n => enviados.push(n.id), logger: silencioso });
  assert.deepEqual(enviados, ['n1']);
  assert.equal(fila[0].status, 'ENVIADO');
  assert.equal(fila[0].tentativas, 2);
  assert.equal(fila[1].status, 'PROCESSANDO');
  // O worker que caiu volta e tenta concluir com a tentativa antiga: nada muda.
  const r = await db.notificacaoFila.updateMany({ where: { id: 'n1', status: 'PROCESSANDO', workerId: 'caiu', tentativas: 1 }, data: { status: 'FALHA' } });
  assert.equal(r.count, 0);
});

test('linha presa após a última tentativa vira FALHA sem reenviar', async () => {
  fila.push(linha({ status: 'PROCESSANDO', tentativas: 3, processandoAte: new Date(T0.getTime() - 1) }));
  let chamadas = 0;
  await processarLote({ db, clock: () => T0, enviar: async () => chamadas++, logger: silencioso });
  assert.equal(chamadas, 0);
  assert.equal(fila[0].status, 'FALHA');
});

test('sem e-mail configurado a rotina não processa e avisa uma vez', async () => {
  const logs = [];
  let execucoes = 0, ciclos = 0;
  const rotina = iniciarNotificacoes({ configurado: () => false, executar: async () => execucoes++,
    logger: { log: m => logs.push(m), error() {} }, agendar: fn => { if (++ciclos < 3) setImmediate(fn); return null; } });
  await rotina.pronto;
  await new Promise(r => setTimeout(r, 20));
  rotina.parar();
  assert.equal(execucoes, 0);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /EMAIL_USER/);
});
