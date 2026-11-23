const { minutoCivil, agoraAgenda } = require('./agenda-tempo');
function erro(status, message) {
  return Object.assign(new Error(message), { status });
}

function formasPagamento(loja) {
  const source = Array.isArray(loja?.formasPagamento) ? loja.formasPagamento : String(loja?.formasPagamento || '').split(/[\n;,]+/);
  const list = [...new Set(source.map(x => String(x).trim()).filter(Boolean))];
  return list.length ? list : ['A combinar no local'];
}

function validarPagamento(value, loja) {
  const selected = String(value || '').trim();
  const accepted = formasPagamento(loja).find(x => x === selected);
  if (!accepted) throw erro(400, 'Selecione uma forma de pagamento aceita pelo estabelecimento.');
  return accepted;
}

function validarDataHora(data, hora) {
  const inicio = minutoCivil(data, hora);
  if (inicio === null) throw erro(400, 'Informe uma data e um horário válidos.');
  if (inicio <= agoraAgenda().minuto) throw erro(400, 'Escolha uma data e um horário futuros.');
}

function motivoObrigatorio(value) {
  const motivo = String(value || '').trim();
  if (motivo.length < 5 || motivo.length > 500) throw erro(400, 'Informe o motivo com 5 a 500 caracteres.');
  return motivo;
}

function dadosEdicao(body, loja) {
  validarDataHora(body.data, body.hora);
  const veiculo = String(body.veiculo || '').trim().toLowerCase();
  if (!['carro', 'moto', 'caminhonete'].includes(veiculo)) throw erro(400, 'Selecione um tipo de veículo válido.');
  const notas = String(body.notas || '').trim();
  if (notas.length > 2000) throw erro(400, 'As observações devem ter no máximo 2000 caracteres.');
  return { data: body.data, hora: body.hora, veiculo, notas: notas || null, formaPagamento: validarPagamento(body.formaPagamento, loja) };
}

function diferencas(antes, depois) {
  const anterior = {}, atual = {};
  for (const key of ['data', 'hora', 'veiculo', 'notas', 'formaPagamento', 'status', 'duracaoAgendaMinutos']) {
    if (Object.hasOwn(depois, key) && (antes[key] ?? null) !== (depois[key] ?? null)) {
      anterior[key] = antes[key] ?? null;
      atual[key] = depois[key] ?? null;
    }
  }
  return { anterior, atual };
}

module.exports = { erro, formasPagamento, validarPagamento, validarDataHora, motivoObrigatorio, dadosEdicao, diferencas };
