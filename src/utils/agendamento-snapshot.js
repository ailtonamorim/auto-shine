const { erro } = require('./agendamento-edicao');

const MAX_INT = 2147483647;

function precoEmCentavos(value) {
  // Conversão decimal por dígitos: não soma valores monetários em ponto flutuante.
  const texto = typeof value === 'number' && Number.isFinite(value)
    ? String(value) : typeof value === 'string' ? value.trim() : '';
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(texto);
  if (!match) throw erro(400, 'Informe um preço não negativo com no máximo duas casas decimais.');
  const centavos = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos) || centavos > MAX_INT) throw erro(400, 'Preço acima do limite permitido.');
  return centavos;
}

function duracaoEmMinutos(value) {
  const texto = typeof value === 'string' ? value.trim().toLowerCase() : '';
  let minutos;
  let match;
  if ((match = /^(\d+)\s*(?:min|minuto|minutos)$/.exec(texto))) {
    minutos = Number(match[1]);
  } else if ((match = /^(\d+)\s*(?:h|hora|horas)(?:\s*(\d{1,2})\s*(?:min|minuto|minutos)?)?$/.exec(texto))) {
    if (Number(match[2] || 0) >= 60) throw erro(400, 'Após as horas, informe minutos entre 0 e 59.');
    minutos = Number(match[1]) * 60 + Number(match[2] || 0);
  } else if ((match = /^(\d+)\s*dias?$/.exec(texto))) {
    minutos = Number(match[1]) * 1440;
  }
  if (!Number.isSafeInteger(minutos) || minutos <= 0 || minutos > MAX_INT) {
    throw erro(400, 'Informe a duração como 45 min, 1h, 1h30 ou 1 dia (24 horas).');
  }
  return minutos;
}

function snapshotServico(servico) {
  const servicoNome = typeof servico?.nome === 'string' ? servico.nome.trim() : '';
  if (!servicoNome) throw erro(400, 'Informe o nome do serviço.');
  return {
    servicoNome,
    precoCentavos: precoEmCentavos(servico.preco),
    duracaoMinutos: duracaoEmMinutos(servico.duracao),
  };
}

module.exports = { precoEmCentavos, duracaoEmMinutos, snapshotServico };
