const dotenv = require("dotenv");

dotenv.config();

const prisma = require("../src/config/database");
const {
  criptografar,
  descriptografarSeNecessario,
  criarIndice,
} = require("../src/utils/crypto");

function valorLegado(valor, cipher) {
  return descriptografarSeNecessario(cipher || valor);
}

async function atualizarEmLotes(model, registros, montarDados) {
  for (const registro of registros) {
    const data = montarDados(registro);
    if (Object.values(data).some((valor) => valor !== undefined && valor !== null)) {
      await prisma[model].update({ where: { id: registro.id }, data });
    }
  }
}

async function main() {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, telefone: true, telefoneCipher: true, telefoneIndex: true },
  });
  await atualizarEmLotes("usuario", usuarios, (usuario) => {
    const telefone = valorLegado(usuario.telefone, usuario.telefoneCipher);
    return { telefoneIndex: usuario.telefoneIndex || criarIndice(telefone) };
  });

  const agendamentos = await prisma.agendamento.findMany({
    select: {
      id: true,
      nomeCliente: true,
      nomeClienteCipher: true,
      nomeClienteIndex: true,
      emailCliente: true,
      emailClienteCipher: true,
      emailClienteIndex: true,
    },
  });
  await atualizarEmLotes("agendamento", agendamentos, (agendamento) => {
    const nome = valorLegado(agendamento.nomeCliente, agendamento.nomeClienteCipher);
    const email = valorLegado(agendamento.emailCliente, agendamento.emailClienteCipher);
    return {
      nomeClienteIndex: agendamento.nomeClienteIndex || criarIndice(nome),
      emailClienteIndex: agendamento.emailClienteIndex || criarIndice(email),
    };
  });

  const denuncias = await prisma.denuncia.findMany({
    select: { id: true, motivo: true, motivoCipher: true, motivoIndex: true, detalhes: true, detalhesCipher: true },
  });
  await atualizarEmLotes("denuncia", denuncias, (denuncia) => {
    const motivo = valorLegado(denuncia.motivo, denuncia.motivoCipher);
    const detalhes = valorLegado(denuncia.detalhes, denuncia.detalhesCipher);
    return {
      motivoCipher: denuncia.motivoCipher || criptografar(motivo),
      motivoIndex: denuncia.motivoIndex || criarIndice(motivo),
      detalhesCipher: denuncia.detalhesCipher || criptografar(detalhes),
    };
  });

  console.log("Índices e cifras complementares atualizados.");
}

main()
  .catch((error) => {
    console.error("Falha ao migrar dados sensíveis:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
