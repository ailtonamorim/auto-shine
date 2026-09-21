const { PrismaClient } = require("@prisma/client");
const { criptografar, criarIndice, criarHashToken } = require("../src/utils/crypto");

const prisma = new PrismaClient();

async function migrarUsuarios() {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, email: true, emailIndex: true, cpf: true, cpfIndex: true, telefone: true, telefoneCipher: true, googleId: true, googleIdIndex: true, resetToken: true, resetTokenHash: true },
  });

  for (const usuario of usuarios) {
    const data = {};
    if (!usuario.emailIndex && usuario.email) { data.email = criptografar(usuario.email); data.emailCipher = data.email; data.emailIndex = criarIndice(usuario.email); }
    if (!usuario.cpfIndex && usuario.cpf) { data.cpf = criptografar(usuario.cpf); data.cpfCipher = data.cpf; data.cpfIndex = criarIndice(usuario.cpf); }
    if (!usuario.telefoneCipher && usuario.telefone) { data.telefone = criptografar(usuario.telefone); data.telefoneCipher = data.telefone; }
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

async function main() {
  await migrarUsuarios();
  await migrarDonos();
  console.log("Dados sensíveis migrados.");
}

main().catch((err) => {
  console.error("Falha na migração de dados sensíveis:", err.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());