// Tópico 8 com PostgreSQL real. Opt-in: usa exclusivamente AGENDA_TEST_DATABASE_URL, nunca carrega .env.
// Cria um schema aleatório, aplica as migrações ali e remove SOMENTE esse schema ao terminar.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const connection = process.env.AGENDA_TEST_DATABASE_URL;

test('PostgreSQL: notificações entram na mesma transação das alterações', { skip: !connection, timeout: 120000 }, async t => {
  const schema = `agenda_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(connection);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'Use uma conexão PostgreSQL de testes.');
  url.searchParams.set('schema', schema);
  url.searchParams.set('connection_limit', '8');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  let created = false, server;
  try {
    await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    const cli = path.join(__dirname, '../node_modules/prisma/build/index.js');
    const child = spawn(process.execPath, [cli, 'migrate', 'deploy'], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATABASE_URL: url.toString() }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.resume(); child.stderr.resume();
    const [code] = await once(child, 'close');
    assert.equal(code, 0, 'Migração no schema temporário falhou; confira permissões e histórico de migrations.');

    const owner = await db.dono.create({ data: { nome: 'Carlos', login: `n_${schema}`, email: `loja_${schema}@example.test` } });
    const user = await db.usuario.create({ data: { nome: 'Ana', email: `ana_${schema}@example.test` } });
    const shop = await db.loja.create({ data: { nome: 'Brilho', descricao: 'Teste', endereco: 'Rua A', latitude: 0, longitude: 0, fotoUrl: 'assets/img/logo.svg', donoId: owner.id, agendaDias: '0,1,2,3,4,5,6', agendaHorarios: '08:00,09:00,10:00,11:00', agendaFechamento: '18:00', formasPagamento: 'Pix' } });
    const service = await db.servicoLoja.create({ data: { nome: 'Lavagem', descricao: 'Teste', preco: 80, duracao: '1h', lojaId: shop.id } });
    function mock(name, exports) { const id = require.resolve(name); require.cache[id] = { id, filename: id, loaded: true, exports }; }
    mock('../src/config/database', db);
    mock('../src/middlewares/auth', {
      autenticarUsuario(req, _res, next) { req.usuario = { id: user.id, nome: user.nome, email: user.email }; next(); },
      autenticarDono(req, _res, next) { req.dono = { donoId: owner.id, nome: owner.nome }; next(); },
    });
    const { processarLote } = require('../src/services/fila-notificacoes');
    const app = express(); app.use(express.json()); app.use('/bookings', require('../src/routes/agendamentos'));
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(route, method, data) { const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return { status: r.status, ...await r.json() }; }
    const payload = (hora = '09:00') => ({ lojaId: shop.id, servicoId: service.id, data: '2099-11-10', hora, veiculo: 'carro', formaPagamento: 'Pix' });
    const fila = () => db.notificacaoFila.findMany({ orderBy: [{ criadoEm: 'asc' }, { chaveIdempotencia: 'asc' }] });

    let reserva;
    await t.test('nova reserva avisa estabelecimento e envia recibo ao cliente', async () => {
      const r = await request('/bookings', 'POST', payload());
      assert.equal(r.status, 201);
      reserva = r.agendamento;
      const linhas = await fila();
      assert.deepEqual(linhas.map(n => [n.tipo, n.destinatarioTipo, n.destinatarioEmail]).sort(), [
        ['NOVA_SOLICITACAO', 'CLIENTE', user.email], ['NOVA_SOLICITACAO', 'ESTABELECIMENTO', owner.email]].sort());
    });

    await t.test('confirmação do parceiro avisa só o cliente', async () => {
      const r = await request(`/bookings/${reserva.id}/status`, 'PUT', { status: 'confirmado', revisao: 0 });
      assert.equal(r.status, 200);
      const novas = (await fila()).filter(n => n.tipo === 'CONFIRMACAO');
      assert.equal(novas.length, 1);
      assert.equal(novas[0].destinatarioEmail, user.email);
      assert.equal(novas[0].eventoId, `agendamento:${reserva.id}:rev:1`);
    });

    await t.test('alteração recusada (revisão antiga) não grava notificação', async () => {
      const antes = await db.notificacaoFila.count();
      const r = await request(`/bookings/${reserva.id}/cancelar`, 'PUT', { revisao: 0, motivo: 'Revisão desatualizada' });
      assert.equal(r.status, 409);
      assert.equal(await db.notificacaoFila.count(), antes);
    });

    await t.test('se a fila falhar, a alteração e o histórico são revertidos juntos', async () => {
      const antes = await db.agendamento.findUnique({ where: { id: reserva.id } });
      // Força erro só na inserção da fila deste tipo de evento.
      await db.$executeRawUnsafe(`ALTER TABLE "${schema}"."notificacao_fila" ADD CONSTRAINT teste_falha CHECK ("tipo" <> 'REAGENDAMENTO_CLIENTE')`);
      const r = await request(`/bookings/${reserva.id}`, 'PUT', { ...payload('11:00'), revisao: antes.revisao, motivo: 'Mudança de planos' });
      assert.equal(r.status, 500);
      const depois = await db.agendamento.findUnique({ where: { id: reserva.id } });
      assert.equal(depois.hora, '09:00');
      assert.equal(depois.revisao, antes.revisao);
      assert.equal(await db.alteracaoAgendamento.count({ where: { agendamentoId: reserva.id, motivo: 'Mudança de planos' } }), 0);
      await db.$executeRawUnsafe(`ALTER TABLE "${schema}"."notificacao_fila" DROP CONSTRAINT teste_falha`);
      const ok = await request(`/bookings/${reserva.id}`, 'PUT', { ...payload('11:00'), revisao: antes.revisao, motivo: 'Mudança de planos' });
      assert.equal(ok.status, 200);
      const [n] = (await fila()).filter(x => x.tipo === 'REAGENDAMENTO_CLIENTE');
      assert.equal(n.destinatarioTipo, 'ESTABELECIMENTO');
      assert.deepEqual(n.payload.mudancas.map(m => m.campo), ['hora', 'status']);
    });

    await t.test('expiração automática avisa cliente e estabelecimento', async () => {
      const { expirarAgendamento } = require('../src/services/expiracao-agendamentos');
      const vencida = await db.agendamento.create({ data: { ...payload('08:00'), data: '2020-01-06', usuarioId: user.id, emailCliente: user.email } });
      assert.equal(await expirarAgendamento(vencida), true);
      const linhas = (await fila()).filter(n => n.tipo === 'EXPIRACAO_AUTOMATICA');
      assert.deepEqual(linhas.map(n => n.destinatarioTipo).sort(), ['CLIENTE', 'ESTABELECIMENTO']);
      // Repetir não duplica: a reserva já não está pendente e a chave é única.
      assert.equal(await expirarAgendamento(vencida), false);
      assert.equal((await fila()).filter(n => n.tipo === 'EXPIRACAO_AUTOMATICA').length, 2);
    });

    await t.test('dois workers concorrentes enviam cada notificação uma única vez', async () => {
      const total = await db.notificacaoFila.count({ where: { status: 'PENDENTE' } });
      const enviados = [];
      const enviar = async n => { await new Promise(r => setTimeout(r, 10)); enviados.push(n.id); };
      const silencioso = { log() {}, error() {} };
      await Promise.all([processarLote({ db, enviar, workerId: 'a', logger: silencioso }), processarLote({ db, enviar, workerId: 'b', logger: silencioso })]);
      assert.equal(enviados.length, total);
      assert.equal(new Set(enviados).size, total);
      assert.equal(await db.notificacaoFila.count({ where: { status: 'ENVIADO' } }), total);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      if (created && /^agenda_test_[a-f0-9]{32}$/.test(schema)) await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    } finally { await db.$disconnect(); }
  }
});
