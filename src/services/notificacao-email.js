// Monta o e-mail de uma notificação a partir do payload gravado na fila.
// O payload é uma foto do evento: o texto mostra o que mudou naquele momento.

const STATUS = { pendente: 'Aguardando confirmação', confirmado: 'Confirmado', finalizado: 'Finalizado', cancelado: 'Cancelado', expirado: 'Expirado' };
const CAMPOS = { data: 'Data', hora: 'Horário', status: 'Status', veiculo: 'Veículo', formaPagamento: 'Pagamento', notas: 'Observações' };
const VEICULOS = { carro: 'Carro', moto: 'Moto', caminhonete: 'Caminhonete' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dataBR(data) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(data || '');
}
function valor(campo, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (campo === 'data') return dataBR(v);
  if (campo === 'status') return STATUS[v] || v;
  if (campo === 'veiculo') return VEICULOS[v] || v;
  return String(v);
}

// Assunto e frase de abertura por tipo e destinatário.
function textos(tipo, dest, p) {
  const loja = p.loja?.nome || 'O estabelecimento', cliente = p.cliente?.nome || 'O cliente';
  const quando = `${dataBR(p.data)} às ${p.hora}`;
  const t = {
    NOVA_SOLICITACAO: dest === 'CLIENTE'
      ? ['Recebemos sua solicitação', `Sua solicitação de ${p.servico} para ${quando} foi enviada para ${loja}. Avisaremos assim que o estabelecimento responder.`]
      : ['Nova solicitação de agendamento', `${cliente} solicitou ${p.servico} para ${quando}. Confirme ou ajuste a reserva no painel.`],
    ALTERACAO_CLIENTE: ['Agendamento alterado pelo cliente', `${cliente} alterou os dados do agendamento de ${quando}.`],
    REAGENDAMENTO_CLIENTE: ['Cliente pediu um novo horário', `${cliente} reagendou para ${quando}. A reserva voltou para "aguardando confirmação" e precisa da sua resposta.`],
    CANCELAMENTO_CLIENTE: ['Agendamento cancelado pelo cliente', `${cliente} cancelou o agendamento de ${p.servico} de ${quando}. O horário foi liberado na sua agenda.`],
    ALTERACAO_ESTABELECIMENTO: ['Seu agendamento foi alterado', `${loja} alterou seu agendamento. Confira abaixo o que mudou.`],
    CONFIRMACAO: ['Agendamento confirmado', `${loja} confirmou seu agendamento de ${p.servico} para ${quando}.`],
    FINALIZACAO: ['Atendimento finalizado', `${loja} registrou seu atendimento como finalizado. Se puder, deixe uma avaliação — ela ajuda outros clientes.`],
    CANCELAMENTO_ESTABELECIMENTO: ['Seu agendamento foi cancelado', `${loja} cancelou seu agendamento de ${quando}. Você pode escolher outro horário quando quiser.`],
    ALTERACAO_ADMIN: ['Agendamento atualizado pela equipe AutoShine', `A equipe AutoShine atualizou o agendamento de ${p.servico} de ${quando}.`],
    EXPIRACAO_AUTOMATICA: dest === 'CLIENTE'
      ? ['Sua solicitação expirou', `${loja} não confirmou a reserva até o horário marcado (${quando}), então ela expirou. Você pode agendar outro horário.`]
      : ['Solicitação expirada sem confirmação', `A solicitação de ${cliente} para ${quando} expirou porque não foi confirmada até o horário marcado.`],
  }[tipo];
  return t || ['Atualização do seu agendamento', 'Houve uma atualização no agendamento.'];
}

// Motivos gerados automaticamente não acrescentam informação.
const SEM_MOTIVO = new Set(['NOVA_SOLICITACAO', 'CONFIRMACAO', 'FINALIZACAO']);

function montarEmailNotificacao(notificacao, { link }) {
  const p = notificacao.payload || {}, tipo = notificacao.tipo, dest = notificacao.destinatarioTipo;
  const [titulo, abertura] = textos(tipo, dest, p);
  const nome = p.destinatarioNome || (dest === 'CLIENTE' ? 'Cliente' : 'Parceiro');
  const mudancas = Array.isArray(p.mudancas) ? p.mudancas : [];
  const motivo = !SEM_MOTIVO.has(tipo) && p.motivo ? String(p.motivo) : null;
  const botao = dest === 'CLIENTE' ? 'Ver meus agendamentos' : 'Abrir painel do parceiro';
  const resumo = [
    ['Estabelecimento', p.loja?.nome], ['Serviço', p.servico], ['Data e horário', `${dataBR(p.data)} às ${p.hora}`],
    ['Endereço', p.loja?.endereco], ['Status atual', STATUS[p.status] || p.status],
  ].filter(([, v]) => v);
  const assunto = `${titulo} — ${p.loja?.nome || 'AutoShine'}, ${dataBR(p.data)} ${p.hora}`;

  const texto = [
    `Olá, ${nome}!`, '', abertura, '',
    ...(mudancas.length ? ['O que mudou:', ...mudancas.map(m => `- ${CAMPOS[m.campo] || m.campo}: ${valor(m.campo, m.anterior)} → ${valor(m.campo, m.atual)}`), ''] : []),
    ...(motivo ? [`Motivo informado: ${motivo}`, ''] : []),
    ...resumo.map(([k, v]) => `${k}: ${v}`), '',
    `${botao}: ${link}`, '',
    'Você recebe este e-mail porque tem um agendamento no AutoShine.',
  ].join('\n');

  const td = 'padding:6px 8px;border-bottom:1px solid #e6e8ec;vertical-align:top';
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1d2433">
    <h2 style="margin:0 0 12px">${escapeHtml(titulo)}</h2>
    <p>Olá, <strong>${escapeHtml(nome)}</strong>!</p>
    <p>${escapeHtml(abertura)}</p>
    ${mudancas.length ? `<h3 style="font-size:15px;margin:20px 0 6px">O que mudou</h3>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <tr><th style="${td};text-align:left">Item</th><th style="${td};text-align:left">Antes</th><th style="${td};text-align:left">Agora</th></tr>
      ${mudancas.map(m => `<tr><td style="${td}">${escapeHtml(CAMPOS[m.campo] || m.campo)}</td><td style="${td};color:#7a8191;text-decoration:line-through">${escapeHtml(valor(m.campo, m.anterior))}</td><td style="${td}"><strong>${escapeHtml(valor(m.campo, m.atual))}</strong></td></tr>`).join('')}
    </table>` : ''}
    ${motivo ? `<p style="margin:16px 0;padding:10px 12px;background:#f4f6fa;border-left:3px solid #2f7fff"><strong>Motivo informado:</strong> ${escapeHtml(motivo)}</p>` : ''}
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin-top:12px">
      ${resumo.map(([k, v]) => `<tr><td style="${td};color:#5b6372;width:40%">${escapeHtml(k)}</td><td style="${td}">${escapeHtml(v)}</td></tr>`).join('')}
    </table>
    <a href="${escapeHtml(link)}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#2f7fff;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(botao)}</a>
    <p style="font-size:12px;color:#7a8191">Você recebe este e-mail porque tem um agendamento no AutoShine.</p>
    <p style="font-size:12px;color:#7a8191">AutoShine — LavaJá</p></div>`;
  return { assunto, texto, html };
}

module.exports = { montarEmailNotificacao, dataBR };
