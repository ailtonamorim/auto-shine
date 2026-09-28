const { PrismaClient } = require("@prisma/client");
const { criptografar, descriptografarSeNecessario, criarIndice, criarHashToken } = require("../src/utils/crypto");

const prisma = new PrismaClient();

function recuperarValor(valor, cipher) {
  return descriptografarSeNecessario(cipher || valor);
}

function salvarCampoCriptografado(data, campo, campoCipher, valor, campoIndex, valorIndex = valor) {
  if (valor === null || valor === undefined || valor === "") return;
  const cipher = criptografar(valor);
  data[campo] = cipher;
  data[campoCipher] = cipher;
  if (campoIndex) data[campoIndex] = criarIndice(valorIndex);
}

async function migrarUsuarios() {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, email: true, emailIndex: true, cpf: true, cpfIndex: true, telefone: true, telefoneCipher: true, telefoneIndex: true, googleId: true, googleIdIndex: true, resetToken: true, resetTokenHash: true },
  });

  for (const usuario of usuarios) {
    const data = {};
    if (!usuario.emailIndex && usuario.email) { data.email = criptografar(usuario.email); data.emailCipher = data.email; data.emailIndex = criarIndice(usuario.email); }
    if (!usuario.cpfIndex && usuario.cpf) { data.cpf = criptografar(usuario.cpf); data.cpfCipher = data.cpf; data.cpfIndex = criarIndice(usuario.cpf); }
    const telefone = recuperarValor(usuario.telefone, usuario.telefoneCipher);
    const telefoneNormalizado = String(telefone || "").replace(/\D/g, "");
    if (telefoneNormalizado && (usuario.telefone !== usuario.telefoneCipher || !usuario.telefoneIndex || usuario.telefoneIndex !== criarIndice(telefoneNormalizado))) {
      salvarCampoCriptografado(data, "telefone", "telefoneCipher", telefoneNormalizado, "telefoneIndex");
    }
    if (!usuario.googleIdIndex && usuario.googleId) { data.googleId = criptografar(usuario.googleId); data.googleIdCipher = data.googleId; data.googleIdIndex = criarIndice(usuario.googleId); }
    if (!usuario.resetTokenHash && usuario.resetToken) { data.resetTokenHash = criarHashToken(usuario.resetToken); data.resetToken = null; }
    if (Object.keys(data).length) await prisma.usuario.update({ where: { id: usuario.id }, data });
  }
}

async function migrarDonos() {
  const donos = await prisma.dono.findMany({
    select: { id: true, email: true, emailIndex: true, cnpj: true, cnpjIndex: true, googleId: true, googleIdIndex: true, resetToken: true, resetTokenHash: true },
  });

  for (const dono of donos) {
    const data = {};
    if (!dono.emailIndex && dono.email) { data.email = criptografar(dono.email); data.emailCipher = data.email; data.emailIndex = criarIndice(dono.email); }
    if (!dono.cnpjIndex && dono.cnpj) { data.cnpj = criptografar(dono.cnpj); data.cnpjCipher = data.cnpj; data.cnpjIndex = criarIndice(dono.cnpj); }
    if (!dono.googleIdIndex && dono.googleId) { data.googleId = criptografar(dono.googleId); data.googleIdCipher = data.googleId; data.googleIdIndex = criarIndice(dono.googleId); }
    if (!dono.resetTokenHash && dono.resetToken) { data.resetTokenHash = criarHashToken(dono.resetToken); data.resetToken = null; }
    if (Object.keys(data).length) await prisma.dono.update({ where: { id: dono.id }, data });
  }
}

async function migrarAgendamentos() {
  const agendamentos = await prisma.agendamento.findMany({
    select: { id: true, notas: true, notasCipher: true, nomeCliente: true, nomeClienteCipher: true, nomeClienteIndex: true, emailCliente: true, emailClienteCipher: true, emailClienteIndex: true },
  });

  for (const agendamento of agendamentos) {
    const data = {};
    const notas = recuperarValor(agendamento.notas, agendamento.notasCipher);
    const nomeCliente = String(recuperarValor(agendamento.nomeCliente, agendamento.nomeClienteCipher) || "").trim();
    const emailCliente = String(recuperarValor(agendamento.emailCliente, agendamento.emailClienteCipher) || "").trim().toLowerCase();

    if (notas && (!agendamento.notasCipher || agendamento.notas !== agendamento.notasCipher)) salvarCampoCriptografado(data, "notas", "notasCipher", notas);
    if (nomeCliente && (agendamento.nomeCliente !== agendamento.nomeClienteCipher || !agendamento.nomeClienteIndex || agendamento.nomeClienteIndex !== criarIndice(nomeCliente))) {
      salvarCampoCriptografado(data, "nomeCliente", "nomeClienteCipher", nomeCliente, "nomeClienteIndex");
    }
    if (emailCliente && (agendamento.emailCliente !== agendamento.emailClienteCipher || !agendamento.emailClienteIndex || agendamento.emailClienteIndex !== criarIndice(emailCliente))) {
      salvarCampoCriptografado(data, "emailCliente", "emailClienteCipher", emailCliente, "emailClienteIndex");
    }
    if (Object.keys(data).length) await prisma.agendamento.update({ where: { id: agendamento.id }, data });
  }
}

async function migrarDenuncias() {
  const denuncias = await prisma.denuncia.findMany({
    select: { id: true, motivo: true, motivoCipher: true, motivoIndex: true, detalhes: true, detalhesCipher: true },
  });

  for (const denuncia of denuncias) {
    const motivo = String(recuperarValor(denuncia.motivo, denuncia.motivoCipher) || "").trim().slice(0, 120);
    const detalhes = String(recuperarValor(denuncia.detalhes, denuncia.detalhesCipher) || "").trim().slice(0, 600);
    const data = {};

    if (motivo && (denuncia.motivo !== null || !denuncia.motivoCipher || !denuncia.motivoIndex)) {
      salvarCampoCriptografado(data, "motivo", "motivoCipher", motivo, "motivoIndex");
      data.motivo = null;
    }
    if (detalhes && (denuncia.detalhes !== null || !denuncia.detalhesCipher)) {
      const cipher = criptografar(detalhes);
      data.detalhes = null;
      data.detalhesCipher = cipher;
    }
    if (Object.keys(data).length) await prisma.denuncia.update({ where: { id: denuncia.id }, data });
  }
}

async function main() {
  await migrarUsuarios();
  await migrarDonos();
  await migrarAgendamentos();
  await migrarDenuncias();
  console.log("Dados sensíveis migrados.");
}

main().catch((err) => {
  console.error("Falha na migração de dados sensíveis:", err.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());