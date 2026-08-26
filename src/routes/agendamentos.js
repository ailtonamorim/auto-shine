const express = require("express");
const prisma = require("../config/database");
const { autenticarUsuario, autenticarDono } = require("../middlewares/auth");
const { dataEhPassado } = require("../utils/validators");
const { horarioOcupado, montarDisponibilidadeLoja, statusValidos, statusBloqueiamHorario, erroHorarioReservado } = require("../utils/agenda");

const router = express.Router();

router.post("/", autenticarUsuario, async (req, res) => {
  try {
    const { lojaId, servicoId, data, hora, veiculo, notas, nomeCliente, emailCliente } = req.body;
    if (!lojaId || !servicoId || !data || !hora) return res.status(400).json({ error: "Dados incompletos para agendamento." });
    if (dataEhPassado(data)) return res.status(400).json({ error: "Escolha uma data valida a partir de hoje." });
    const loja = await prisma.loja.findFirst({ where: { id: Number(lojaId), bloqueado: false } });
    if (!loja) return res.status(404).json({ error: "Loja não encontrada ou indisponível." });
    const disponibilidade = await montarDisponibilidadeLoja({ loja, data });
    const horarioDisponivel = disponibilidade.horarios.find((item) => item.hora === hora && item.disponivel);
    if (!disponibilidade.aberto || !horarioDisponivel) return res.status(400).json({ error: "Horário indisponível para esta loja." });
    const servico = await prisma.servicoLoja.findFirst({ where: { id: Number(servicoId), lojaId: Number(lojaId) } });
    if (!servico) return res.status(404).json({ error: "Serviço não encontrado nesta loja." });
    if (await horarioOcupado({ lojaId, data, hora })) return res.status(409).json({ error: "Este horário já foi reservado. Escolha outro horário." });
    const agendamento = await prisma.agendamento.create({
      data: { data, hora, veiculo: veiculo || "Carro", notas: notas || null, nomeCliente: nomeCliente || null, emailCliente: emailCliente || null, usuarioId: req.usuario.id, lojaId: Number(lojaId), servicoId: Number(servicoId) },
      include: { loja: { select: { nome: true } }, servico: { select: { nome: true } } },
    });
    res.status(201).json({ agendamento });
  } catch (err) {
    if (erroHorarioReservado(err)) return res.status(409).json({ error: "Este horário já foi reservado. Escolha outro horário." });
    console.error("Erro ao criar agendamento:", err);
    res.status(500).json({ error: "Erro ao criar agendamento." });
  }
});

router.get("/dono", autenticarDono, async (req, res) => {
  try {
    const lojas = await prisma.loja.findMany({ where: { donoId: req.dono.donoId }, select: { id: true } });
    const lojaIds = lojas.map((l) => l.id);
    const agendamentos = await prisma.agendamento.findMany({
      where: { lojaId: { in: lojaIds } },
      include: {
        loja: { select: { id: true, nome: true } },
        servico: { select: { id: true, nome: true, preco: true, duracao: true } },
        usuario: { select: { nome: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ agendamentos });
  } catch {
    res.status(500).json({ error: "Erro ao buscar agendamentos." });
  }
});

router.get("/me", autenticarUsuario, async (req, res) => {
  try {
    const agendamentos = await prisma.agendamento.findMany({
      where: { usuarioId: req.usuario.id },
      include: {
        loja: { select: { id: true, nome: true, endereco: true, agendaDias: true, agendaHorarios: true } },
        servico: { select: { id: true, nome: true, preco: true, duracao: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ agendamentos });
  } catch {
    res.status(500).json({ error: "Erro ao buscar seus agendamentos." });
  }
});

router.put("/:id", autenticarUsuario, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { data, hora, veiculo, notas } = req.body;
    if (!id) return res.status(400).json({ error: "ID invalido." });
    if (!data || !hora) return res.status(400).json({ error: "Informe nova data e horario." });
    if (dataEhPassado(data)) return res.status(400).json({ error: "Escolha uma data valida a partir de hoje." });
    const agendamento = await prisma.agendamento.findFirst({ where: { id, usuarioId: req.usuario.id }, include: { loja: true } });
    if (!agendamento) return res.status(404).json({ error: "Agendamento não encontrado." });
    if (["finalizado", "cancelado"].includes(agendamento.status)) return res.status(400).json({ error: "Este agendamento não pode mais ser alterado." });
    const disponibilidade = await montarDisponibilidadeLoja({ loja: agendamento.loja, data, ignorarId: id });
    const horarioDisponivel = disponibilidade.horarios.find((item) => item.hora === hora && item.disponivel);
    if (!disponibilidade.aberto || !horarioDisponivel) return res.status(400).json({ error: "Horário indisponível para esta loja." });
    if (await horarioOcupado({ lojaId: agendamento.lojaId, data, hora, ignorarId: id })) return res.status(409).json({ error: "Este horário já foi reservado. Escolha outro horário." });
    const atualizado = await prisma.agendamento.update({
      where: { id },
      data: { data, hora, veiculo: veiculo || agendamento.veiculo, notas: notas === undefined ? agendamento.notas : notas || null, status: "pendente" },
      include: { loja: { select: { id: true, nome: true, endereco: true } }, servico: { select: { id: true, nome: true, preco: true, duracao: true } } },
    });
    res.json({ agendamento: atualizado });
  } catch (err) {
    if (erroHorarioReservado(err)) return res.status(409).json({ error: "Este horário já foi reservado. Escolha outro horário." });
    res.status(500).json({ error: "Erro ao atualizar agendamento." });
  }
});

router.put("/:id/cancelar", autenticarUsuario, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido." });
    const agendamento = await prisma.agendamento.findFirst({ where: { id, usuarioId: req.usuario.id } });
    if (!agendamento) return res.status(404).json({ error: "Agendamento não encontrado." });
    if (agendamento.status === "finalizado") return res.status(400).json({ error: "Agendamento finalizado não pode ser cancelado." });
    const atualizado = await prisma.agendamento.update({ where: { id }, data: { status: "cancelado" } });
    res.json({ agendamento: atualizado });
  } catch {
    res.status(500).json({ error: "Erro ao cancelar agendamento." });
  }
});

router.put("/:id/status", autenticarDono, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Informe o status." });
    if (!statusValidos.has(status)) return res.status(400).json({ error: "Status invalido." });
    const agendamento = await prisma.agendamento.findFirst({ where: { id }, include: { loja: true } });
    if (!agendamento || agendamento.loja.donoId !== req.dono.donoId) return res.status(404).json({ error: "Agendamento não encontrado ou sem permissão." });
    if (statusBloqueiamHorario.includes(status) && await horarioOcupado({ lojaId: agendamento.lojaId, data: agendamento.data, hora: agendamento.hora, ignorarId: id })) {
      return res.status(409).json({ error: "Este horário já foi reservado. Escolha outro horário." });
    }
    const atualizado = await prisma.agendamento.update({ where: { id }, data: { status } });
    res.json({ agendamento: atualizado });
  } catch (err) {
    if (erroHorarioReservado(err)) return res.status(409).json({ error: "Este horário já foi reservado. Escolha outro horário." });
    res.status(500).json({ error: "Erro ao atualizar status." });
  }
});

router.delete("/:id", autenticarDono, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const agendamento = await prisma.agendamento.findFirst({ where: { id }, include: { loja: true } });
    if (!agendamento || agendamento.loja.donoId !== req.dono.donoId) return res.status(404).json({ error: "Agendamento não encontrado ou sem permissão." });
    await prisma.denuncia.deleteMany({ where: { agendamentoId: id } });
    await prisma.avaliacao.deleteMany({ where: { agendamentoId: id } });
    await prisma.agendamento.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Erro ao excluir agendamento." });
  }
});

module.exports = router;
