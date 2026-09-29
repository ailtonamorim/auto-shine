require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { criptografar, descriptografar, descriptografarSeNecessario, criarIndice, criarHashToken } = require("../src/utils/crypto");
const { normalizarEmail, normalizarCpf, normalizarCnpj, normalizarTelefone } = require("../src/utils/validators");

const prisma = new PrismaClient();

function recuperarValor(valor, cipher) {
  return descriptografarSeNecessario(cipher || valor);
}

function salvarCampoProtegido(data, registro, { campo, campoCipher, campoIndex, valor, ocultarTexto = false }) {
  if (valor === null || valor === undefined || valor === "") return;

  const persistido = registro[campoCipher] || registro[campo];
  let cipher;
  if (persistido) {
    try {
      descriptografar(persistido);
      cipher = persistido;
    } catch (err) {
      if (registro[campoCipher]) {
        throw new Error(`Não foi possível decifrar ${campo}; confirme que DATA_ENCRYPTION_KEY é a chave original.`, { cause: err });
      }
      cipher = criptografar(valor);
    }
  } else {
    cipher = criptografar(valor);
  }

  if (campo) data[campo] = ocultarTexto ? null : cipher;
  if (campoCipher) data[campoCipher] = cipher;
  if (campoIndex) data[campoIndex] = criarIndice(valor);
}

async function migrarUsuarios() {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, email: true, emailCipher: true, cpf: true, cpfCipher: true, telefone: true, telefoneCipher: true, googleId: true, googleIdCipher: true, resetToken: true, resetTokenHash: true },
  });

  for (const usuario of usuarios) {
    const data = {};
    const email = normalizarEmail(recuperarValor(usuario.email, usuario.emailCipher));
    const cpf = normalizarCpf(recuperarValor(usuario.cpf, usuario.cpfCipher));
    const telefone = normalizarTelefone(recuperarValor(usuario.telefone, usuario.telefoneCipher));
    const googleId = recuperarValor(usuario.googleId, usuario.googleIdCipher);
    salvarCampoProtegido(data, usuario, { campo: "email", campoCipher: "emailCipher", campoIndex: "emailIndex", valor: email });
    salvarCampoProtegido(data, usuario, { campo: "cpf", campoCipher: "cpfCipher", campoIndex: "cpfIndex", valor: cpf });
    salvarCampoProtegido(data, usuario, { campo: "telefone", campoCipher: "telefoneCipher", campoIndex: "telefoneIndex", valor: telefone });
    salvarCampoProtegido(data, usuario, { campo: "googleId", campoCipher: "googleIdCipher", campoIndex: "googleIdIndex", valor: googleId });
    if (!usuario.resetTokenHash && usuario.resetToken) { data.resetTokenHash = criarHashToken(usuario.resetToken); data.resetToken = null; }
    if (Object.keys(data).length) await prisma.usuario.update({ where: { id: usuario.id }, data });
  }
}

async function migrarDonos() {
  const donos = await prisma.dono.findMany({
    select: { id: true, email: true, emailCipher: true, cnpj: true, cnpjCipher: true, googleId: true, googleIdCipher: true, resetToken: true, resetTokenHash: true },
  });

  for (const dono of donos) {
    const data = {};
    const email = normalizarEmail(recuperarValor(dono.email, dono.emailCipher));
    const cnpj = normalizarCnpj(recuperarValor(dono.cnpj, dono.cnpjCipher));
    const googleId = recuperarValor(dono.googleId, dono.googleIdCipher);
    salvarCampoProtegido(data, dono, { campo: "email", campoCipher: "emailCipher", campoIndex: "emailIndex", valor: email });
    salvarCampoProtegido(data, dono, { campo: "cnpj", campoCipher: "cnpjCipher", campoIndex: "cnpjIndex", valor: cnpj });
    salvarCampoProtegido(data, dono, { campo: "googleId", campoCipher: "googleIdCipher", campoIndex: "googleIdIndex", valor: googleId });
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

    salvarCampoProtegido(data, agendamento, { campo: "notas", campoCipher: "notasCipher", valor: notas });
    salvarCampoProtegido(data, agendamento, { campo: "nomeCliente", campoCipher: "nomeClienteCipher", campoIndex: "nomeClienteIndex", valor: nomeCliente });
    salvarCampoProtegido(data, agendamento, { campo: "emailCliente", campoCipher: "emailClienteCipher", campoIndex: "emailClienteIndex", valor: emailCliente });
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

    salvarCampoProtegido(data, denuncia, { campo: "motivo", campoCipher: "motivoCipher", campoIndex: "motivoIndex", valor: motivo, ocultarTexto: true });
    salvarCampoProtegido(data, denuncia, { campo: "detalhes", campoCipher: "detalhesCipher", valor: detalhes, ocultarTexto: true });
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