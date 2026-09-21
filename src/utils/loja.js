const prisma = require("../config/database");
const { coordenadasValidas, imagemLojaValida, serializarFotosAdicionais, serializarListaTexto } = require("./validators");
const { serializarAgendaDias, serializarAgendaHorarios, diasPadraoAgenda, horariosPadrao } = require("./agenda");

async function deletarLojaComRelacionados(id) {
  const agendamentos = await prisma.agendamento.findMany({ where: { lojaId: id }, select: { id: true } });
  const agendamentoIds = agendamentos.map((a) => a.id);
  await prisma.denuncia.deleteMany({
    where: { OR: [{ lojaId: id }, agendamentoIds.length ? { agendamentoId: { in: agendamentoIds } } : { id: -1 }, { avaliacao: { lojaId: id } }] },
  });
  await prisma.avaliacao.deleteMany({ where: { OR: [{ lojaId: id }, agendamentoIds.length ? { agendamentoId: { in: agendamentoIds } } : { id: -1 }] } });
  await prisma.agendamento.deleteMany({ where: { lojaId: id } });
  await prisma.servicoLoja.deleteMany({ where: { lojaId: id } });
  await prisma.loja.delete({ where: { id } });
}

async function garantirIndicesBanco() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Agendamento_lojaId_data_hora_ativo_key"
      ON "Agendamento" ("lojaId", "data", "hora")
      WHERE "status" IN ('pendente', 'confirmado')
    `);
  } catch (err) {
    console.warn("Aviso: não foi possível criar índice de agendamento:", err?.message);
  }
}

function prepararLojaAdmin(lojaInput = {}) {
  const loja = {
    nome: String(lojaInput.nome || "").trim(),
    descricao: String(lojaInput.descricao || "").trim(),
    endereco: String(lojaInput.endereco || "").trim(),
    latitude: Number(lojaInput.latitude),
    longitude: Number(lojaInput.longitude),
    precoMedio: Number(lojaInput.precoMedio) || 0,
    categoria: String(lojaInput.categoria || "serviços gerais").trim() || "serviços gerais",
    fotoUrl: String(lojaInput.fotoUrl || "").trim(),
    capaUrl: String(lojaInput.capaUrl || "").trim() || null,
    fotosAdicionais: serializarFotosAdicionais(lojaInput.fotosAdicionais),
    formasPagamento: serializarListaTexto(lojaInput.formasPagamento) || "Pix, Cartão, Dinheiro",
    politicaCancelamento: String(lojaInput.politicaCancelamento || "").trim() || "Cancelamentos e reagendamentos podem ser feitos até 2 horas antes do horário marcado.",
    agendaDias: serializarAgendaDias(lojaInput.agendaDias ?? diasPadraoAgenda),
    agendaHorarios: serializarAgendaHorarios(lojaInput.agendaHorarios ?? horariosPadrao),
    bloqueado: lojaInput.bloqueado === true || lojaInput.bloqueado === "true",
  };
  if (!loja.nome || !loja.descricao || !loja.endereco || !loja.fotoUrl) { const erro = new Error("Preencha nome, descrição, endereço e foto da loja."); erro.status = 400; throw erro; }
  if (!coordenadasValidas(loja.latitude, loja.longitude)) { const erro = new Error("Latitude e longitude invalidas."); erro.status = 400; throw erro; }
  if (!imagemLojaValida(loja.fotoUrl) || (loja.capaUrl && !imagemLojaValida(loja.capaUrl))) { const erro = new Error("Fotos devem ser URLs http/https ou arquivos em assets/img."); erro.status = 400; throw erro; }
  return loja;
}

function prepararServicosAdmin(servicos = []) {
  return (Array.isArray(servicos) ? servicos : [])
    .map((servico) => ({ id: servico.id ? Number(servico.id) : null, nome: String(servico.nome || "").trim(), descricao: String(servico.descricao || "").trim(), preco: Number(servico.preco), duracao: String(servico.duracao || "").trim() }))
    .filter((servico) => servico.nome || servico.descricao || servico.duracao || Number.isFinite(servico.preco));
}

module.exports = { deletarLojaComRelacionados, garantirIndicesBanco, prepararLojaAdmin, prepararServicosAdmin };
