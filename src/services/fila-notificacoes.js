// Worker da fila de notificações (transactional outbox, tópico 8).
// - Reivindica cada linha com update condicional (status + tentativas), então várias
//   instâncias podem rodar ao mesmo tempo sem enviar a mesma linha duas vezes em paralelo.
// - A reivindicação tem prazo (processandoAte). Se o processo cair no meio do envio,
//   outra rodada retoma a linha depois do prazo.
// - Falhas temporárias voltam para PENDENTE com espera crescente; ao atingir o limite,
//   a linha fica em FALHA para análise.
// Entrega "pelo menos uma vez": se o e-mail sair e o processo cair antes de marcar ENVIADO,
// a mensagem pode ser reenviada uma vez após o prazo.
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const prisma = require('../config/database');
const { emailConfigurado, enviarEmail, linkApp } = require('../config/email');
const { montarEmailNotificacao } = require('./notificacao-email');

const PRAZO_PROCESSAMENTO_MS = 2 * 60 * 1000;
const ESPERAS_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000];

function esperaAposTentativa(tentativa) {
  return ESPERAS_MS[Math.min(Math.max(tentativa, 1), ESPERAS_MS.length) - 1];
}
function resumoFalha(err) {
  const texto = [err?.code, err?.responseCode, err?.message].filter(Boolean).join(' ');
  return (texto || 'Falha desconhecida').slice(0, 500);
}
// Endereço recusado pelo servidor: repetir não resolve.
function falhaPermanente(err) {
  return err?.code === 'EENVELOPE' || err?.message === 'EMAIL_NOT_ACCEPTED' || [550, 551, 553].includes(err?.responseCode);
}

async function enviarNotificacao(n) {
  const link = linkApp(n.destinatarioTipo === 'CLIENTE' ? '/meus-agendamentos.html' : '/cadastro-dono.html');
  const { assunto, texto, html } = montarEmailNotificacao(n, { link });
  await enviarEmail({ para: n.destinatarioEmail, assunto, texto, html });
}

async function processarLote({ db = prisma, enviar = enviarNotificacao, clock = () => new Date(),
  workerId = `${os.hostname()}:${process.pid}`, limite = 20, logger = console } = {}) {
  const agora = clock();
  const candidatos = await db.notificacaoFila.findMany({
    where: { OR: [
      { status: 'PENDENTE', proximaTentativaEm: { lte: agora } },
      { status: 'PROCESSANDO', processandoAte: { lt: agora } },
    ] },
    orderBy: { proximaTentativaEm: 'asc' }, take: limite,
  });
  let enviados = 0, reagendados = 0, falhas = 0;
  for (const n of candidatos) {
    const mesmaLinha = { id: n.id, status: n.status, tentativas: n.tentativas };
    if (n.tentativas >= n.limiteTentativas) {
      // Ficou presa em PROCESSANDO depois da última tentativa permitida.
      const r = await db.notificacaoFila.updateMany({ where: mesmaLinha, data: {
        status: 'FALHA', workerId: null, processandoAte: null,
        ultimaFalha: n.ultimaFalha || 'Processamento interrompido na última tentativa.' } });
      if (r.count === 1) falhas++;
      continue;
    }
    const tentativa = n.tentativas + 1;
    const reivindicada = await db.notificacaoFila.updateMany({ where: mesmaLinha, data: {
      status: 'PROCESSANDO', workerId, tentativas: { increment: 1 },
      ultimaTentativaEm: agora, processandoAte: new Date(agora.getTime() + PRAZO_PROCESSAMENTO_MS) } });
    if (reivindicada.count !== 1) continue; // Outra instância pegou primeiro.
    const minha = { id: n.id, status: 'PROCESSANDO', workerId, tentativas: tentativa };
    try {
      await enviar({ ...n, tentativas: tentativa });
      await db.notificacaoFila.updateMany({ where: minha, data: {
        status: 'ENVIADO', enviadoEm: clock(), processandoAte: null, ultimaFalha: null } });
      enviados++;
    } catch (err) {
      const definitiva = tentativa >= n.limiteTentativas || falhaPermanente(err);
      await db.notificacaoFila.updateMany({ where: minha, data: definitiva
        ? { status: 'FALHA', processandoAte: null, ultimaFalha: resumoFalha(err) }
        : { status: 'PENDENTE', processandoAte: null, ultimaFalha: resumoFalha(err),
          proximaTentativaEm: new Date(clock().getTime() + esperaAposTentativa(tentativa)) } });
      if (definitiva) {
        falhas++;
        logger.error(`Notificação ${n.id} (${n.tipo}) não foi enviada após ${tentativa} tentativa(s).`);
      } else reagendados++;
    }
  }
  return { enviados, reagendados, falhas, lotes: candidatos.length, cheio: candidatos.length === limite };
}

// Roda na inicialização e a cada intervalo, sem sobreposição local.
// Sem EMAIL_USER/EMAIL_PASS as linhas ficam PENDENTES e saem quando o e-mail for configurado.
function iniciarNotificacoes({ intervaloMs = Number(process.env.NOTIFICACOES_INTERVALO_MS) || 15000,
  executar = processarLote, configurado = emailConfigurado, logger = console,
  agendar = setTimeout, cancelar = clearTimeout } = {}) {
  const workerId = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  let stopped = false, timer, avisado = false;
  if (process.env.NOTIFICACOES_EMAIL_ATIVAS === 'false') {
    logger.log('Notificações de agendamento por e-mail desativadas (NOTIFICACOES_EMAIL_ATIVAS=false). A fila continua sendo gravada.');
    return { pronto: Promise.resolve(), parar() {} };
  }
  async function ciclo() {
    let repetir = false;
    try {
      if (!configurado()) {
        if (!avisado) logger.log('Notificações de agendamento aguardando EMAIL_USER e EMAIL_PASS. Elas ficam na fila até o e-mail ser configurado.');
        avisado = true;
      } else {
        const r = await executar({ workerId });
        repetir = r?.cheio === true; // Há mais itens prontos: continua sem esperar.
      }
    } catch {
      logger.error('Falha na rotina de notificações. Haverá nova tentativa.');
    } finally {
      if (!stopped) {
        timer = agendar(ciclo, repetir ? 0 : intervaloMs);
        timer?.unref?.();
      }
    }
  }
  const pronto = ciclo();
  return { pronto, parar() { stopped = true; if (timer) cancelar(timer); } };
}

module.exports = { processarLote, iniciarNotificacoes, enviarNotificacao, esperaAposTentativa, PRAZO_PROCESSAMENTO_MS };
