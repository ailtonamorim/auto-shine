const express = require("express");
const prisma = require("../config/database");
const { autenticarDono } = require("../middlewares/auth");
const { coordenadasValidas, imagemLojaValida, serializarFotosAdicionais, serializarListaTexto } = require("../utils/validators");
const { serializarAgendaDias, serializarAgendaHorarios, montarDisponibilidadeLoja, configuracaoAgenda } = require("../utils/agenda");
const { deletarLojaComRelacionados, filtroLojaDisponivel } = require("../utils/loja");

const { snapshotServico, precoEmCentavos } = require('../utils/agendamento-snapshot');
function validarServico(servico) {
  snapshotServico(servico);
  return servico;
}
const { comAgendaBloqueada } = require('../utils/agenda-transacao');
const { erro } = require('../utils/agendamento-edicao');
const { politicaAgendamento } = require('../utils/agendamento-regras');
const router = express.Router();
const comPolitica = loja => ({ ...loja, politicaCancelamentoEfetiva: politicaAgendamento().texto });

router.get("/", async (_req, res) => {
  try {
    const lojas = await prisma.loja.findMany({
      where: filtroLojaDisponivel(),
      include: { servicos: true, avaliacoes: { where: { bloqueado: false }, select: { nota: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ lojas: lojas.map(comPolitica) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar lojas." });
  }
});

router.get("/minhas", autenticarDono, async (req, res) => {
  try {
    const lojas = await prisma.loja.findMany({
      where: { donoId: req.dono.donoId },
      include: {
        servicos: true,
        avaliacoes: { include: { usuario: { select: { nome: true, email: true } } }, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ lojas: lojas.map(comPolitica) });
  } catch {
    res.status(500).json({ error: "Erro ao buscar lojas." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID de loja invalido." });
    const loja = await prisma.loja.findFirst({
      where: { id, ...filtroLojaDisponivel() },
      include: { servicos: true, avaliacoes: { where: { bloqueado: false }, orderBy: { createdAt: "desc" } } },
    });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
    res.json({ loja: comPolitica(loja) });
  } catch {
    res.status(500).json({ error: "Erro interno." });
  }
});

router.get("/:id/disponibilidade", async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const lojaId = Number(req.params.id), servicoId = Number(req.query.servicoId);
    if (!Number.isSafeInteger(lojaId) || lojaId < 1 || !Number.isSafeInteger(servicoId) || servicoId < 1) throw erro(400, 'Selecione uma loja e um serviço válidos.');
    if (req.query.ignorarAgendamentoId !== undefined) throw erro(400, 'Use a consulta autenticada do agendamento para reagendar.');
    // Loja bloqueada, pendente de aprovação, inativa ou de dono bloqueado não recebe reservas.
    const loja = await prisma.loja.findFirst({ where: { id: lojaId, ...filtroLojaDisponivel() } });
    if (!loja) throw erro(404, 'Loja não encontrada.');
    const servico = await prisma.servicoLoja.findFirst({ where: { id: servicoId, lojaId } });
    if (!servico) throw erro(404, 'Serviço não encontrado nesta loja.');
    const snapshot = snapshotServico(servico);
    res.json(await montarDisponibilidadeLoja({ loja, data: String(req.query.data || ''), duracaoMinutos: snapshot.duracaoMinutos }));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro ao buscar disponibilidade.' });
  }
});

router.post("/", autenticarDono, async (req, res) => {
  try {
    const { nome, descricao, endereco, latitude, longitude, precoMedio, categoria, fotoUrl, capaUrl, servicos, agendaDias, agendaHorarios, fotosAdicionais, formasPagamento, politicaCancelamento } = req.body;
    if (!nome || !descricao || !endereco || !fotoUrl) return res.status(400).json({ error: "Preencha todos os campos obrigatórios." });
    const latitudeNum = Number(latitude);
    const longitudeNum = Number(longitude);
    if (!coordenadasValidas(latitudeNum, longitudeNum)) return res.status(400).json({ error: "Latitude e longitude invalidas." });
    if (!imagemLojaValida(fotoUrl) || (capaUrl && !imagemLojaValida(capaUrl))) return res.status(400).json({ error: "Fotos devem ser URLs http/https ou arquivos em assets/img." });
    const loja = await prisma.loja.create({
      data: {
        nome, descricao, endereco,
        latitude: latitudeNum, longitude: longitudeNum,
        precoMedio: Number(precoMedio) || 0,
        categoria: categoria || "serviços gerais",
        fotoUrl, capaUrl: capaUrl || null,
        fotosAdicionais: serializarFotosAdicionais(fotosAdicionais),
        formasPagamento: serializarListaTexto(formasPagamento) || "Pix, Cartão, Dinheiro",
        politicaCancelamento: String(politicaCancelamento || "").trim() || "Cancelamentos e reagendamentos podem ser feitos até 2 horas antes do horário marcado.",
        ...configuracaoAgenda(req.body),
        agendaDias: serializarAgendaDias(agendaDias),
        agendaHorarios: serializarAgendaHorarios(agendaHorarios),
        statusAprovacao: "pendente",
        donoId: req.dono.donoId,
        servicos: Array.isArray(servicos) && servicos.length
          ? { create: servicos.map((s) => validarServico({
              nome: s.name || s.nome || "",
              descricao: s.description || s.descricao || "",
              preco: precoEmCentavos(s.price ?? s.preco) / 100,
              duracao: s.duration || s.duracao || "",
              inclusos: s.inclusos || null,
              etapas: s.etapas || null,
              produtos: s.produtos || null,
              orientacoes: s.orientacoes || null,
              garantia: s.garantia || null,
            })) }
          : undefined,
      },
      include: { servicos: true },
    });
    res.status(201).json({ loja });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error("Erro ao criar loja:", err);
    res.status(500).json({ error: "Erro ao criar loja." });
  }
});

router.put("/:id", autenticarDono, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const atualizada = await comAgendaBloqueada(id, async tx => {
      const loja = await tx.loja.findFirst({ where: { id, donoId: req.dono.donoId } });
      if (!loja) throw erro(404, "Loja não encontrada ou sem permissão.");
      const { nome, descricao, endereco, latitude, longitude, precoMedio, categoria, fotoUrl, capaUrl, agendaDias, agendaHorarios, fotosAdicionais, formasPagamento, politicaCancelamento } = req.body;
      const latitudeNum = latitude !== undefined ? Number(latitude) : loja.latitude;
      const longitudeNum = longitude !== undefined ? Number(longitude) : loja.longitude;
      const proximaFoto = fotoUrl ?? loja.fotoUrl;
      const proximaCapa = capaUrl !== undefined ? (capaUrl || null) : loja.capaUrl;
      if (!coordenadasValidas(latitudeNum, longitudeNum)) throw erro(400, "Latitude e longitude invalidas.");
      if (!imagemLojaValida(proximaFoto) || (proximaCapa && !imagemLojaValida(proximaCapa))) throw erro(400, "Fotos devem ser URLs http/https ou arquivos em assets/img.");
      return tx.loja.update({
        where: { id },
        data: {
          nome: nome ?? loja.nome, descricao: descricao ?? loja.descricao, endereco: endereco ?? loja.endereco,
          latitude: latitudeNum, longitude: longitudeNum,
          precoMedio: precoMedio !== undefined ? Number(precoMedio) : loja.precoMedio,
          categoria: categoria ?? loja.categoria, fotoUrl: proximaFoto, capaUrl: proximaCapa,
          fotosAdicionais: fotosAdicionais !== undefined ? serializarFotosAdicionais(fotosAdicionais) : loja.fotosAdicionais,
          formasPagamento: formasPagamento !== undefined ? (serializarListaTexto(formasPagamento) || loja.formasPagamento) : loja.formasPagamento,
          politicaCancelamento: politicaCancelamento !== undefined ? (String(politicaCancelamento || "").trim() || loja.politicaCancelamento) : loja.politicaCancelamento,
          ...configuracaoAgenda(req.body, loja),
          agendaDias: agendaDias !== undefined ? serializarAgendaDias(agendaDias) : loja.agendaDias,
          agendaHorarios: agendaHorarios !== undefined ? serializarAgendaHorarios(agendaHorarios) : loja.agendaHorarios,
        },
        include: { servicos: true },
      });
    });
    res.json({ loja: atualizada });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar loja." });
  }
});

router.delete("/:id", autenticarDono, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const loja = await prisma.loja.findFirst({ where: { id, donoId: req.dono.donoId } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada ou sem permissão." });
    await deletarLojaComRelacionados(id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir loja." });
  }
});

router.post("/:lojaId/servicos", autenticarDono, async (req, res) => {
  try {
    const lojaId = Number(req.params.lojaId);
    const loja = await prisma.loja.findFirst({ where: { id: lojaId, donoId: req.dono.donoId } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
    const { nome, descricao, preco, duracao, inclusos, etapas, produtos, orientacoes, garantia } = req.body;
    if (!nome || !descricao || !duracao) return res.status(400).json({ error: "Preencha todos os campos do serviço." });
    validarServico({ nome, preco, duracao });
    const servico = await prisma.servicoLoja.create({
      data: {
        nome,
        descricao,
        preco: precoEmCentavos(preco) / 100,
        duracao,
        inclusos: inclusos || null,
        etapas: etapas || null,
        produtos: produtos || null,
        orientacoes: orientacoes || null,
        garantia: garantia || null,
        lojaId,
      },
    });
    res.status(201).json({ servico });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Erro ao criar serviço." });
  }
});

router.put("/:lojaId/servicos/:id", autenticarDono, async (req, res) => {
  try {
    const lojaId = Number(req.params.lojaId);
    const id = Number(req.params.id);
    const loja = await prisma.loja.findFirst({ where: { id: lojaId, donoId: req.dono.donoId } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
    const servico = await prisma.servicoLoja.findFirst({ where: { id, lojaId } });
    if (!servico) return res.status(404).json({ error: "Serviço não encontrado." });
    const { nome, descricao, preco, duracao, inclusos, etapas, produtos, orientacoes, garantia } = req.body;
    validarServico({ nome: nome ?? servico.nome, preco: preco !== undefined ? preco : servico.preco, duracao: duracao ?? servico.duracao });
    const atualizado = await prisma.servicoLoja.update({
      where: { id },
      data: {
        nome: nome ?? servico.nome,
        descricao: descricao ?? servico.descricao,
        preco: preco !== undefined ? precoEmCentavos(preco) / 100 : servico.preco,
        duracao: duracao ?? servico.duracao,
        inclusos: inclusos !== undefined ? (inclusos || null) : servico.inclusos,
        etapas: etapas !== undefined ? (etapas || null) : servico.etapas,
        produtos: produtos !== undefined ? (produtos || null) : servico.produtos,
        orientacoes: orientacoes !== undefined ? (orientacoes || null) : servico.orientacoes,
        garantia: garantia !== undefined ? (garantia || null) : servico.garantia,
      },
    });
    res.json({ servico: atualizado });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Erro ao atualizar serviço." });
  }
});

router.delete("/:lojaId/servicos/:id", autenticarDono, async (req, res) => {
  try {
    const lojaId = Number(req.params.lojaId);
    const id = Number(req.params.id);
    const loja = await prisma.loja.findFirst({ where: { id: lojaId, donoId: req.dono.donoId } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
    const servico = await prisma.servicoLoja.findFirst({ where: { id, lojaId } });
    if (!servico) return res.status(404).json({ error: "Serviço não encontrado." });
    const count = await prisma.servicoLoja.count({ where: { lojaId } });
    if (count <= 1) return res.status(400).json({ error: "A loja precisa ter pelo menos 1 serviço." });
    const agendamentos = await prisma.agendamento.count({ where: { servicoId: id } });
    if (agendamentos > 0) return res.status(400).json({ error: "Este serviço possui agendamentos. Cancele ou finalize os agendamentos antes de excluir." });
    await prisma.servicoLoja.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir serviço." });
  }
});

module.exports = router;
