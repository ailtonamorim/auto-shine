const { PrismaClient } = require("@prisma/client");
const readline = require("readline");

const prisma = new PrismaClient();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function pergunta(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim()));
  });
}

function moeda(valor) {
  return `R$ ${Number(valor || 0).toFixed(2).replace(".", ",")}`;
}

function dataCurta(valor) {
  if (!valor) return "N/A";
  return new Date(valor).toLocaleDateString("pt-BR");
}

function parseId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function confirmarAcao(nomeAcao) {
  const confirmacao = await pergunta(`Digite 'sim' para confirmar ${nomeAcao}: `);
  return confirmacao.toLowerCase() === "sim";
}

async function listarUsuarios() {
  console.log("\nLISTANDO USUÁRIOS\n");
  const usuarios = await prisma.usuario.findMany({
    include: {
      _count: { select: { agendamentos: true, avaliacoes: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!usuarios.length) {
    console.log("Nenhum usuário encontrado.");
    return;
  }

  console.log(`Total: ${usuarios.length} usuário(s)\n`);
  usuarios.forEach((u, i) => {
    console.log(
      `${i + 1}. ID: ${u.id} | Nome: ${u.nome} | Email: ${u.email} | CPF: ${u.cpf || "N/A"} | Agendamentos: ${u._count.agendamentos} | Avaliações: ${u._count.avaliacoes}`,
    );
  });
}

async function listarDonos() {
  console.log("\nLISTANDO DONOS\n");
  const donos = await prisma.dono.findMany({
    include: { lojas: true },
    orderBy: { createdAt: "desc" },
  });

  if (!donos.length) {
    console.log("Nenhum dono encontrado.");
    return;
  }

  console.log(`Total: ${donos.length} dono(s)\n`);
  donos.forEach((d, i) => {
    console.log(
      `${i + 1}. ID: ${d.id} | Nome: ${d.nome} | Login: ${d.login} | CNPJ: ${d.cnpj || "N/A"} | Lojas: ${d.lojas.length}`,
    );
  });
}

async function listarLojas() {
  console.log("\nLISTANDO LOJAS\n");
  const lojas = await prisma.loja.findMany({
    include: {
      dono: { select: { nome: true, login: true } },
      _count: { select: { servicos: true, agendamentos: true, avaliacoes: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!lojas.length) {
    console.log("Nenhuma loja encontrada.");
    return;
  }

  console.log(`Total: ${lojas.length} loja(s)\n`);
  lojas.forEach((loja, i) => {
    const status = loja.bloqueado ? "bloqueada" : "ativa";
    console.log(
      `${i + 1}. ID: ${loja.id} | ${loja.nome} | Dono: ${loja.dono?.nome || "N/A"} (${loja.dono?.login || "N/A"}) | Status: ${status} | Serviços: ${loja._count.servicos} | Agendamentos: ${loja._count.agendamentos} | Avaliações: ${loja._count.avaliacoes}`,
    );
  });
}

async function listarServicos() {
  console.log("\nLISTANDO SERVIÇOS\n");
  const servicos = await prisma.servicoLoja.findMany({
    include: {
      loja: {
        select: {
          nome: true,
          dono: { select: { nome: true } },
        },
      },
      _count: { select: { agendamentos: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!servicos.length) {
    console.log("Nenhum serviço encontrado.");
    return;
  }

  console.log(`Total: ${servicos.length} serviço(s)\n`);
  servicos.forEach((s, i) => {
    console.log(
      `${i + 1}. ID: ${s.id} | ${s.nome} | Preço: ${moeda(s.preco)} | Duração: ${s.duracao} | Loja: ${s.loja?.nome || "N/A"} | Dono: ${s.loja?.dono?.nome || "N/A"} | Agendamentos: ${s._count.agendamentos}`,
    );
  });
}

async function listarAgendamentos() {
  console.log("\nLISTANDO AGENDAMENTOS\n");
  const agendamentos = await prisma.agendamento.findMany({
    include: {
      usuario: { select: { nome: true, email: true } },
      loja: { select: { nome: true } },
      servico: { select: { nome: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!agendamentos.length) {
    console.log("Nenhum agendamento encontrado.");
    return;
  }

  console.log(`Total: ${agendamentos.length} agendamento(s)\n`);
  agendamentos.forEach((a, i) => {
    const cliente = a.usuario?.nome || a.nomeCliente || "N/A";
    const email = a.usuario?.email || a.emailCliente || "N/A";
    console.log(
      `${i + 1}. ID: ${a.id} | Cliente: ${cliente} (${email}) | Loja: ${a.loja?.nome || "N/A"} | Serviço: ${a.servico?.nome || "N/A"} | Data: ${a.data} ${a.hora} | Status: ${a.status}`,
    );
  });
}

async function listarAvaliacoes() {
  console.log("\nLISTANDO AVALIAÇÕES\n");
  const avaliacoes = await prisma.avaliacao.findMany({
    include: {
      usuario: { select: { nome: true } },
      loja: { select: { nome: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!avaliacoes.length) {
    console.log("Nenhuma avaliação encontrada.");
    return;
  }

  console.log(`Total: ${avaliacoes.length} avaliação(ões)\n`);
  avaliacoes.forEach((av, i) => {
    console.log(
      `${i + 1}. ID: ${av.id} | Nota: ${av.nota} | Cliente: ${av.usuario?.nome || av.nomeCliente || "N/A"} | Loja: ${av.loja?.nome || "N/A"} | Data: ${dataCurta(av.createdAt)}`,
    );
  });
}

async function deletarUsuario() {
  console.log("\nDELETAR USUARIO\n");
  await listarUsuarios();
  const id = parseId(await pergunta("\nDigite o ID do usuário a deletar (ou Enter para cancelar): "));
  if (!id) return console.log("Operação cancelada.");
  if (!(await confirmarAcao("a exclusão do usuário"))) return console.log("Operação cancelada.");

  await prisma.$transaction([
    prisma.avaliacao.updateMany({ where: { usuarioId: id }, data: { usuarioId: null } }),
    prisma.agendamento.updateMany({ where: { usuarioId: id }, data: { usuarioId: null } }),
    prisma.usuario.delete({ where: { id } }),
  ]);

  console.log("Usuário deletado com sucesso. Agendamentos e avaliações foram preservados como histórico.");
}

async function deletarLojaPorId(id) {
  const agendamentos = await prisma.agendamento.findMany({
    where: { lojaId: id },
    select: { id: true },
  });
  const agendamentoIds = agendamentos.map((a) => a.id);

  await prisma.avaliacao.deleteMany({
    where: {
      OR: [
        { lojaId: id },
        agendamentoIds.length ? { agendamentoId: { in: agendamentoIds } } : { id: -1 },
      ],
    },
  });
  await prisma.agendamento.deleteMany({ where: { lojaId: id } });
  await prisma.servicoLoja.deleteMany({ where: { lojaId: id } });
  await prisma.loja.delete({ where: { id } });
}

async function deletarDono() {
  console.log("\nDELETAR DONO\n");
  await listarDonos();
  const id = parseId(await pergunta("\nDigite o ID do dono a deletar (ou Enter para cancelar): "));
  if (!id) return console.log("Operação cancelada.");
  if (!(await confirmarAcao("a exclusão do dono e suas lojas"))) return console.log("Operação cancelada.");

  const lojas = await prisma.loja.findMany({ where: { donoId: id }, select: { id: true } });
  for (const loja of lojas) {
    await deletarLojaPorId(loja.id);
  }
  await prisma.dono.delete({ where: { id } });

  console.log("Dono e dados relacionados deletados com sucesso.");
}

async function deletarLoja() {
  console.log("\nDELETAR LOJA\n");
  await listarLojas();
  const id = parseId(await pergunta("\nDigite o ID da loja a deletar (ou Enter para cancelar): "));
  if (!id) return console.log("Operação cancelada.");
  if (!(await confirmarAcao("a exclusão da loja"))) return console.log("Operação cancelada.");

  await deletarLojaPorId(id);
  console.log("Loja e dados relacionados deletados com sucesso.");
}

async function deletarServico() {
  console.log("\nDELETAR SERVIÇO\n");
  await listarServicos();
  const id = parseId(await pergunta("\nDigite o ID do serviço a deletar (ou Enter para cancelar): "));
  if (!id) return console.log("Operação cancelada.");
  if (!(await confirmarAcao("a exclusão do serviço"))) return console.log("Operação cancelada.");

  const agendamentos = await prisma.agendamento.findMany({
    where: { servicoId: id },
    select: { id: true },
  });
  const agendamentoIds = agendamentos.map((a) => a.id);

  await prisma.$transaction([
    prisma.avaliacao.deleteMany({ where: { agendamentoId: { in: agendamentoIds.length ? agendamentoIds : [-1] } } }),
    prisma.agendamento.deleteMany({ where: { servicoId: id } }),
    prisma.servicoLoja.delete({ where: { id } }),
  ]);

  console.log("Serviço deletado com sucesso.");
}

async function deletarAgendamento() {
  console.log("\nDELETAR AGENDAMENTO\n");
  await listarAgendamentos();
  const id = parseId(await pergunta("\nDigite o ID do agendamento a deletar (ou Enter para cancelar): "));
  if (!id) return console.log("Operação cancelada.");
  if (!(await confirmarAcao("a exclusão do agendamento"))) return console.log("Operação cancelada.");

  await prisma.$transaction([
    prisma.avaliacao.deleteMany({ where: { agendamentoId: id } }),
    prisma.agendamento.delete({ where: { id } }),
  ]);

  console.log("Agendamento deletado com sucesso.");
}

async function limparBancoDados() {
  console.log("\nATENÇÃO: você está prestes a deletar todo o banco de dados.\n");
  const confirmacao1 = await pergunta("Digite 'ENTENDO OS RISCOS' para continuar: ");
  if (confirmacao1 !== "ENTENDO OS RISCOS") return console.log("Operação cancelada.");
  const confirmacao2 = await pergunta("Digite 'DELETAR TUDO' para confirmar: ");
  if (confirmacao2 !== "DELETAR TUDO") return console.log("Operação cancelada.");

  await prisma.$transaction([
    prisma.avaliacao.deleteMany({}),
    prisma.agendamento.deleteMany({}),
    prisma.servicoLoja.deleteMany({}),
    prisma.loja.deleteMany({}),
    prisma.usuario.deleteMany({}),
    prisma.dono.deleteMany({}),
  ]);

  console.log("Banco de dados limpo com sucesso.");
}

async function menu() {
  console.log(`
==============================
 ADMINISTRADOR DO BANCO
==============================

LISTAR DADOS:
  1. Usuários
  2. Donos
  3. Lojas
  4. Servicos
  5. Agendamentos
  6. Avaliações

DELETAR DADOS:
  7. Deletar Usuario
  8. Deletar Dono
  9. Deletar Loja
  10. Deletar Servico
  11. Deletar Agendamento
  12. Limpar todo o banco de dados

0. Sair
`);

  const opcao = await pergunta("Escolha uma opção: ");

  try {
    switch (opcao) {
      case "1":
        await listarUsuarios();
        break;
      case "2":
        await listarDonos();
        break;
      case "3":
        await listarLojas();
        break;
      case "4":
        await listarServicos();
        break;
      case "5":
        await listarAgendamentos();
        break;
      case "6":
        await listarAvaliacoes();
        break;
      case "7":
        await deletarUsuario();
        break;
      case "8":
        await deletarDono();
        break;
      case "9":
        await deletarLoja();
        break;
      case "10":
        await deletarServico();
        break;
      case "11":
        await deletarAgendamento();
        break;
      case "12":
        await limparBancoDados();
        break;
      case "0":
        console.log("\nAté logo!");
        rl.close();
        await prisma.$disconnect();
        process.exit(0);
      default:
        console.log("Opção inválida.");
    }
  } catch (err) {
    console.error("Erro:", err.message);
  }

  console.log("");
  await menu();
}

async function main() {
  try {
    await menu();
  } catch (err) {
    console.error("Erro fatal:", err);
    rl.close();
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
