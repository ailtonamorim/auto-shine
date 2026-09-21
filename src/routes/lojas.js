const express = require("express");
const prisma = require("../config/database");
const { autenticarDono } = require("../middlewares/auth");
const { coordenadasValidas, imagemLojaValida, serializarFotosAdicionais, serializarListaTexto, dataEhPassado } = require("../utils/validators");
const { serializarAgendaDias, serializarAgendaHorarios, montarDisponibilidadeLoja } = require("../utils/agenda");
const { deletarLojaComRelacionados } = require("../utils/loja");

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const lojas = await prisma.loja.findMany({
      where: { bloqueado: false },
      include: { servicos: true, avaliacoes: { select: { nota: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ lojas });
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
    res.json({ lojas });
  } catch {
    res.status(500).json({ error: "Erro ao buscar lojas." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID de loja invalido." });
    const loja = await prisma.loja.findFirst({
      where: { id, bloqueado: false },
      include: { servicos: true, avaliacoes: { orderBy: { createdAt: "desc" } } },
    });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
    res.json({ loja });
  } catch {
    res.status(500).json({ error: "Erro interno." });
  }
});

router.get("/:id/disponibilidade", async (req, res) => {
  try {
    const lojaId = Number(req.params.id);
    const data = String(req.query.data || "").trim();
    const ignorarId = req.query.ignorarAgendamentoId ? Number(req.query.ignorarAgendamentoId) : null;
    if (!lojaId) return res.status(400).json({ error: "ID invalido." });
    if (dataEhPassado(data)) return res.status(400).json({ error: "Informe uma data valida a partir de hoje." });
    const loja = await prisma.loja.findFirst({ where: { id: lojaId, bloqueado: false } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada." });
    res.json(await montarDisponibilidadeLoja({ loja, data, ignorarId }));
  } catch {
    res.status(500).json({ error: "Erro ao buscar disponibilidade." });
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
    const existente = await prisma.loja.findFirst({ where: { donoId: req.dono.donoId } });
    if (existente) return res.status(409).json({ error: "Voce ja possui um lava jato publicado.", lojaId: existente.id });
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
        agendaDias: serializarAgendaDias(agendaDias),
        agendaHorarios: serializarAgendaHorarios(agendaHorarios),
        donoId: req.dono.donoId,
        servicos: Array.isArray(servicos) && servicos.length
          ? { create: servicos.map((s) => ({ nome: s.name || s.nome || "", descricao: s.description || s.descricao || "", preco: Number(s.price ?? s.preco) || 0, duracao: s.duration || s.duracao || "" })) }
          : undefined,
      },
      include: { servicos: true },
    });
    res.status(201).json({ loja });
  } catch (err) {
    console.error("Erro ao criar loja:", err);
    res.status(500).json({ error: "Erro ao criar loja." });
  }
});

router.put("/:id", autenticarDono, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const loja = await prisma.loja.findFirst({ where: { id, donoId: req.dono.donoId } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada ou sem permissão." });
    const { nome, descricao, endereco, latitude, longitude, precoMedio, categoria, fotoUrl, capaUrl, agendaDias, agendaHorarios, fotosAdicionais, formasPagamento, politicaCancelamento } = req.body;
    const latitudeNum = latitude !== undefined ? Number(latitude) : loja.latitude;
    const longitudeNum = longitude !== undefined ? Number(longitude) : loja.longitude;
    const proximaFoto = fotoUrl ?? loja.fotoUrl;
    const proximaCapa = capaUrl !== undefined ? (capaUrl || null) : loja.capaUrl;
    if (!coordenadasValidas(latitudeNum, longitudeNum)) return res.status(400).json({ error: "Latitude e longitude invalidas." });
    if (!imagemLojaValida(proximaFoto) || (proximaCapa && !imagemLojaValida(proximaCapa))) return res.status(400).json({ error: "Fotos devem ser URLs http/https ou arquivos em assets/img." });
    const atualizada = await prisma.loja.update({
      where: { id },
      data: {
        nome: nome ?? loja.nome, descricao: descricao ?? loja.descricao, endereco: endereco ?? loja.endereco,
        latitude: latitudeNum, longitude: longitudeNum,
        precoMedio: precoMedio !== undefined ? Number(precoMedio) : loja.precoMedio,
        categoria: categoria ?? loja.categoria, fotoUrl: proximaFoto, capaUrl: proximaCapa,
        fotosAdicionais: fotosAdicionais !== undefined ? serializarFotosAdicionais(fotosAdicionais) : loja.fotosAdicionais,
        formasPagamento: formasPagamento !== undefined ? (serializarListaTexto(formasPagamento) || loja.formasPagamento) : loja.formasPagamento,
        politicaCancelamento: politicaCancelamento !== undefined ? (String(politicaCancelamento || "").trim() || loja.politicaCancelamento) : loja.politicaCancelamento,
        agendaDias: agendaDias !== undefined ? serializarAgendaDias(agendaDias) : loja.agendaDias,
        agendaHorarios: agendaHorarios !== undefined ? serializarAgendaHorarios(agendaHorarios) : loja.agendaHorarios,
      },
      include: { servicos: true },
    });
    res.json({ loja: atualizada });
  } catch (err) {
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
    const { nome, descricao, preco, duracao } = req.body;
    if (!nome || !descricao || !duracao) return res.status(400).json({ error: "Preencha todos os campos do serviço." });
    const servico = await prisma.servicoLoja.create({ data: { nome, descricao, preco: Number(preco) || 0, duracao, lojaId } });
    res.status(201).json({ servico });
  } catch {
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
    const { nome, descricao, preco, duracao } = req.body;
    const atualizado = await prisma.servicoLoja.update({
      where: { id },
      data: { nome: nome ?? servico.nome, descricao: descricao ?? servico.descricao, preco: preco !== undefined ? Number(preco) : servico.preco, duracao: duracao ?? servico.duracao },
    });
    res.json({ servico: atualizado });
  } catch {
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
