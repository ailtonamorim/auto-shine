const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function upsertDono({ nome, login, cnpj }) {
  const senha = await bcrypt.hash("autoshine123", 10);
  return prisma.dono.upsert({
    where: { login },
    update: { nome, cnpj },
    create: { nome, login, cnpj, senha },
  });
}

async function upsertUsuario({ nome, email, cpf, telefone }) {
  const senha = await bcrypt.hash("cliente123", 10);
  return prisma.usuario.upsert({
    where: { email },
    update: { nome, cpf, telefone },
    create: { nome, email, cpf, telefone, senha },
  });
}

function localDateKey(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function parseAgendaDias(value) {
  return String(value || "1,2,3,4,5,6")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function nextOpenDate(loja, minOffset = 1) {
  const dias = parseAgendaDias(loja.agendaDias);
  for (let offset = minOffset; offset < minOffset + 14; offset += 1) {
    const dateKey = localDateKey(offset);
    const day = String(new Date(`${dateKey}T12:00:00`).getDay());
    if (dias.includes(day)) return dateKey;
  }
  return localDateKey(minOffset);
}

async function upsertDemoAgendamento({ usuario, loja, servicoNome, data, hora, status, veiculo }) {
  const servico = await prisma.servicoLoja.findFirst({
    where: { lojaId: loja.id, nome: servicoNome },
  });
  if (!servico) throw new Error(`Servico demo nao encontrado: ${servicoNome}`);

  const existentes = await prisma.agendamento.findMany({
    where: {
      usuarioId: usuario.id,
      lojaId: loja.id,
      servicoId: servico.id,
      status,
    },
    orderBy: { id: "asc" },
  });

  const payload = {
    data,
    hora,
    status,
    veiculo,
    nomeCliente: usuario.nome,
    emailCliente: usuario.email,
    usuarioId: usuario.id,
    lojaId: loja.id,
    servicoId: servico.id,
  };

  const manter = existentes.find((item) => item.data === data && item.hora === hora) || existentes[0];
  const duplicados = existentes.filter((item) => manter && item.id !== manter.id);
  if (duplicados.length) {
    const ids = duplicados.map((item) => item.id);
    await prisma.avaliacao.updateMany({
      where: { agendamentoId: { in: ids } },
      data: { agendamentoId: null },
    });
    await prisma.agendamento.deleteMany({ where: { id: { in: ids } } });
  }

  if (manter) {
    return prisma.agendamento.update({ where: { id: manter.id }, data: payload });
  }
  return prisma.agendamento.create({ data: payload });
}

function normalizarNomeServico(nome) {
  return String(nome || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function deduplicarServicosLoja(lojaId, servicosDesejados) {
  const preferidos = new Map(
    servicosDesejados.map((servico) => [normalizarNomeServico(servico.nome), servico.nome]),
  );
  const servicos = await prisma.servicoLoja.findMany({
    where: { lojaId },
    orderBy: { id: "asc" },
  });
  const grupos = new Map();

  servicos.forEach((servico) => {
    const chave = normalizarNomeServico(servico.nome);
    grupos.set(chave, [...(grupos.get(chave) || []), servico]);
  });

  for (const [chave, grupo] of grupos.entries()) {
    if (grupo.length <= 1) continue;
    const nomePreferido = preferidos.get(chave);
    const manter = grupo.find((servico) => servico.nome === nomePreferido) || grupo[0];
    for (const duplicado of grupo) {
      if (duplicado.id === manter.id) continue;
      await prisma.agendamento.updateMany({
        where: { servicoId: duplicado.id },
        data: { servicoId: manter.id },
      });
      await prisma.servicoLoja.delete({ where: { id: duplicado.id } });
    }
  }
}

async function upsertLoja(donoId, lojaData, servicos, avaliacoes) {
  let loja = await prisma.loja.findFirst({
    where: { donoId, nome: lojaData.nome },
  });

  if (loja) {
    loja = await prisma.loja.update({
      where: { id: loja.id },
      data: lojaData,
    });
  } else {
    loja = await prisma.loja.create({
      data: { ...lojaData, donoId },
    });
  }

  for (const servico of servicos) {
    const existente = await prisma.servicoLoja.findFirst({
      where: { lojaId: loja.id, nome: servico.nome },
    });
    if (existente) {
      await prisma.servicoLoja.update({ where: { id: existente.id }, data: servico });
    } else {
      await prisma.servicoLoja.create({ data: { ...servico, lojaId: loja.id } });
    }
  }

  await deduplicarServicosLoja(loja.id, servicos);

  for (const avaliacao of avaliacoes) {
    const existente = await prisma.avaliacao.findFirst({
      where: {
        lojaId: loja.id,
        nomeCliente: avaliacao.nomeCliente,
        comentario: avaliacao.comentario,
      },
    });
    if (!existente) {
      await prisma.avaliacao.create({ data: { ...avaliacao, lojaId: loja.id } });
    }
  }

  return loja;
}

async function main() {
  const clienteDemo = await upsertUsuario({
    nome: "Cliente Demo",
    email: "cliente@autoshine.local",
    cpf: "52998224725",
    telefone: "62999990000",
  });

  const donoCentro = await upsertDono({
    nome: "Carlos Silva",
    login: "shine-centro",
    cnpj: "12345678000190",
  });
  const donoPremium = await upsertDono({
    nome: "Marina Costa",
    login: "detalhe-premium",
    cnpj: "98765432000110",
  });
  const donoPrime = await upsertDono({
    nome: "Eduardo Ramos",
    login: "prime-car-care",
    cnpj: "11222333000181",
  });
  const donoFast = await upsertDono({
    nome: "Luciana Prado",
    login: "fastwash-marista",
    cnpj: "22333444000172",
  });
  const donoEco = await upsertDono({
    nome: "Bruno Azevedo",
    login: "eco-brilho",
    cnpj: "33444555000163",
  });
  const donoStudio = await upsertDono({
    nome: "Paula Mendes",
    login: "studio-vitrificacao",
    cnpj: "44555666000154",
  });
  const donoTruck = await upsertDono({
    nome: "Henrique Torres",
    login: "truck-clean",
    cnpj: "55666777000145",
  });
  const donoMall = await upsertDono({
    nome: "Renata Lima",
    login: "mall-auto-spa",
    cnpj: "66777888000136",
  });

  // Fotos: IDs confirmados do Unsplash (todos testados e existentes)
  // A = 1558618666-fcd25c85cd64  pessoa lavando carro (confirmado)
  // B = 1619642751034-765dfdf7c58e  trabalho de vitrificação (confirmado)
  // C = 1625047509248-ec889cbff17f  lavagem de carro (confirmado)
  // D = 1552519507-da3b142c6e3d  carro esportivo (confirmado)
  // E = 1607860108855-64acf2078ed9  detalhamento automotivo (confirmado)

  const lojaCentro = await upsertLoja(
    donoCentro.id,
    {
      nome: "Shine Expert Centro",
      descricao: "Lava jato urbano com lavagem completa, polimento e atendimento agendado.",
      endereco: "Av. Anhanguera, 1250 - Centro, Goiânia",
      latitude: -16.6799,
      longitude: -49.255,
      precoMedio: 92,
      categoria: "lavagem completa",
      fotoUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80",
      capaUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=80",
      fotosAdicionais: "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=800&q=80\nhttps://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=800&q=80",
      bloqueado: false,
    },
    [
      { nome: "Lavagem simples", descricao: "Lavagem externa com secagem técnica.", preco: 49, duracao: "35 min" },
      { nome: "Lavagem completa", descricao: "Lavagem externa, interna e aspiração detalhada.", preco: 89, duracao: "1h" },
      { nome: "Polimento", descricao: "Polimento técnico para brilho e remoção de marcas leves.", preco: 220, duracao: "2h" },
    ],
    [
      { nota: 5, comentario: "Atendimento pontual e carro muito bem acabado.", nomeCliente: "Mariana P." },
      { nota: 4, comentario: "Boa lavagem completa, equipe educada.", nomeCliente: "Rafael M." },
    ],
  );

  const lojaPremium = await upsertLoja(
    donoPremium.id,
    {
      nome: "Detalhe Premium Garage",
      descricao: "Estética automotiva focada em higienização interna e proteção de pintura.",
      endereco: "Rua 9, 740 - Setor Oeste, Goiânia",
      latitude: -16.6869,
      longitude: -49.2648,
      precoMedio: 158,
      categoria: "detalhamento automotivo",
      fotoUrl: "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=800&q=80",
      capaUrl: "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1200&q=80",
      fotosAdicionais: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80\nhttps://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=800&q=80",
      bloqueado: false,
    },
    [
      { nome: "Higienização interna", descricao: "Limpeza profunda de bancos, carpetes e acabamento interno.", preco: 159, duracao: "1h30" },
      { nome: "Cristalização de pintura", descricao: "Proteção e brilho intenso para a pintura.", preco: 349, duracao: "3h" },
      { nome: "Detalhamento automotivo", descricao: "Pacote completo para acabamento interno e externo.", preco: 420, duracao: "4h" },
    ],
    [
      { nota: 5, comentario: "O interior ficou impecável.", nomeCliente: "Camila S." },
      { nota: 5, comentario: "Excelente cuidado nos detalhes.", nomeCliente: "André L." },
    ],
  );

  const lojaPrime = await upsertLoja(
    donoPrime.id,
    {
      nome: "Prime Car Care Bueno",
      descricao: "Centro premium com lavagem técnica, vitrificação e sala de espera climatizada.",
      endereco: "Av. T-4, 1180 - Setor Bueno, Goiânia",
      latitude: -16.7074,
      longitude: -49.2736,
      precoMedio: 185,
      categoria: "vitrificação",
      fotoUrl: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80",
      capaUrl: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=80",
      fotosAdicionais: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80\nhttps://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=800&q=80",
      bloqueado: false,
    },
    [
      { nome: "Lavagem técnica", descricao: "Pré-lavagem, descontaminação leve e secagem com toalha premium.", preco: 120, duracao: "1h15" },
      { nome: "Vitrificação de pintura", descricao: "Proteção cerâmica com preparo de pintura incluso.", preco: 680, duracao: "6h" },
      { nome: "Revitalização de faróis", descricao: "Lixamento, polimento e proteção UV dos faróis.", preco: 180, duracao: "1h30" },
    ],
    [
      { nota: 5, comentario: "Atendimento com padrão de oficina premium.", nomeCliente: "Felipe R." },
      { nota: 5, comentario: "A vitrificação ficou excelente.", nomeCliente: "Tatiane V." },
    ],
  );

  const lojaFast = await upsertLoja(
    donoFast.id,
    {
      nome: "FastWash Marista",
      descricao: "Lavagem rápida por agendamento para quem precisa resolver no intervalo do dia.",
      endereco: "Rua 146, 310 - Setor Marista, Goiânia",
      latitude: -16.7049,
      longitude: -49.2602,
      precoMedio: 74,
      categoria: "lavagem express",
      fotoUrl: "https://images.unsplash.com/photo-1625047509248-ec889cbff17f?auto=format&fit=crop&w=800&q=80",
      capaUrl: "https://images.unsplash.com/photo-1625047509248-ec889cbff17f?auto=format&fit=crop&w=1200&q=80",
      fotosAdicionais: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80\nhttps://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80",
      bloqueado: false,
    },
    [
      { nome: "Express externa", descricao: "Lavagem externa ágil com acabamento em cera líquida.", preco: 45, duracao: "25 min" },
      { nome: "Express completa", descricao: "Lavagem externa, aspiração e painel higienizado.", preco: 79, duracao: "45 min" },
      { nome: "Cera líquida", descricao: "Aplicação de proteção rápida para brilho imediato.", preco: 39, duracao: "20 min" },
    ],
    [
      { nota: 4, comentario: "Rápido e bem localizado.", nomeCliente: "Luiz H." },
      { nota: 5, comentario: "Ótimo para lavar antes de reunião.", nomeCliente: "Bianca N." },
    ],
  );

  const lojaEco = await upsertLoja(
    donoEco.id,
    {
      nome: "Eco Brilho Água Consciente",
      descricao: "Lavagem ecológica com baixo consumo de água e produtos biodegradáveis.",
      endereco: "Av. C-4, 455 - Jardim América, Goiânia",
      latitude: -16.7145,
      longitude: -49.2958,
      precoMedio: 88,
      categoria: "lavagem ecológica",
      fotoUrl: "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=800&q=80",
      capaUrl: "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=1200&q=80",
      fotosAdicionais: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80\nhttps://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80",
      bloqueado: false,
    },
    [
      { nome: "Eco externa", descricao: "Lavagem a seco com produto biodegradável e panos de microfibra.", preco: 59, duracao: "40 min" },
      { nome: "Eco completa", descricao: "Pacote ecológico com aspiração e limpeza interna.", preco: 99, duracao: "1h10" },
      { nome: "Higienização de ar", descricao: "Sanitização do sistema de ar condicionado.", preco: 89, duracao: "35 min" },
    ],
    [
      { nota: 5, comentario: "Gostei da proposta sustentável e do resultado.", nomeCliente: "Nádia C." },
      { nota: 4, comentario: "Lavagem cuidadosa e sem desperdício.", nomeCliente: "Diego A." },
    ],
  );

  const lojaStudio = await upsertLoja(
    donoStudio.id,
    {
      nome: "Studio Vitrificação Alphaville",
      descricao: "Estúdio especializado em proteção de pintura, PPF e acabamento de alto padrão.",
      endereco: "Av. Alphaville Flamboyant, 920 - Goiânia",
      latitude: -16.6923,
      longitude: -49.2179,
      precoMedio: 320,
      categoria: "proteção de pintura",
      fotoUrl: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80",
      capaUrl: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=80",
      fotosAdicionais: "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=800&q=80\nhttps://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80",
      bloqueado: false,
    },
    [
      { nome: "Polimento técnico", descricao: "Correção de pintura em uma etapa para recuperar brilho.", preco: 390, duracao: "4h" },
      { nome: "Vitrificação premium", descricao: "Camada cerâmica de longa duração com preparo completo.", preco: 890, duracao: "8h" },
      { nome: "PPF parcial", descricao: "Película de proteção aplicada em pontos de maior impacto.", preco: 1200, duracao: "1 dia" },
    ],
    [
      { nota: 5, comentario: "Serviço extremamente detalhista.", nomeCliente: "Otávio B." },
      { nota: 5, comentario: "Meu carro saiu com cara de zero.", nomeCliente: "Laura F." },
    ],
  );

  const lojaTruck = await upsertLoja(
    donoTruck.id,
    {
      nome: "Truck Clean Pesados",
      descricao: "Lavagem para caminhonetes, vans e utilitários com estrutura para veículos altos.",
      endereco: "BR-153, Km 508 - Setor Industrial, Goiânia",
      latitude: -16.6398,
      longitude: -49.2717,
      precoMedio: 140,
      categoria: "utilitários",
      fotoUrl: "https://images.unsplash.com/photo-1625047509248-ec889cbff17f?auto=format&fit=crop&w=800&q=80",
      capaUrl: "https://images.unsplash.com/photo-1625047509248-ec889cbff17f?auto=format&fit=crop&w=1200&q=80",
      fotosAdicionais: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80\nhttps://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&q=80",
      bloqueado: false,
    },
    [
      { nome: "Lavagem de caminhonete", descricao: "Lavagem externa reforçada para veículos altos.", preco: 119, duracao: "1h" },
      { nome: "Limpeza de baú", descricao: "Higienização de compartimento de carga.", preco: 160, duracao: "1h30" },
      { nome: "Chassi e motor", descricao: "Limpeza técnica de chassi e cofre do motor.", preco: 220, duracao: "2h" },
    ],
    [
      { nota: 4, comentario: "Boa estrutura para veículo grande.", nomeCliente: "Sérgio T." },
      { nota: 5, comentario: "Equipe entende de utilitário.", nomeCliente: "Priscila G." },
    ],
  );

  const lojaMall = await upsertLoja(
    donoMall.id,
    {
      nome: "Mall Auto Spa Flamboyant",
      descricao: "Auto spa em estacionamento de shopping com retirada e entrega no mesmo local.",
      endereco: "Av. Jamel Cecílio, 3300 - Jardim Goiás, Goiânia",
      latitude: -16.7112,
      longitude: -49.2361,
      precoMedio: 110,
      categoria: "conveniência",
      fotoUrl: "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=800&q=80",
      capaUrl: "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=1200&q=80",
      fotosAdicionais: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80\nhttps://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=800&q=80",
      bloqueado: false,
    },
    [
      { nome: "Lavagem shopping", descricao: "Lavagem completa enquanto o cliente aproveita o shopping.", preco: 99, duracao: "1h" },
      { nome: "Impermeabilização de bancos", descricao: "Proteção para bancos de tecido ou couro sintético.", preco: 240, duracao: "2h" },
      { nome: "Oxi-sanitização", descricao: "Sanitização interna por ozônio.", preco: 89, duracao: "30 min" },
    ],
    [
      { nota: 5, comentario: "Muito prático deixar o carro durante as compras.", nomeCliente: "Helena Q." },
      { nota: 4, comentario: "Boa qualidade e entrega no horário.", nomeCliente: "Marco D." },
    ],
  );

  const agendamentoFinalizadoData = nextOpenDate(lojaPremium, -5);
  const agendamentoPendenteData = nextOpenDate(lojaCentro, 1);
  const agendamentoConfirmadoData = nextOpenDate(lojaEco, 2);

  await upsertDemoAgendamento({
    usuario: clienteDemo,
    loja: lojaPremium,
    servicoNome: "Higienização interna",
    data: agendamentoFinalizadoData,
    hora: "09:30",
    status: "finalizado",
    veiculo: "carro",
  });

  await upsertDemoAgendamento({
    usuario: clienteDemo,
    loja: lojaCentro,
    servicoNome: "Lavagem completa",
    data: agendamentoPendenteData,
    hora: "11:00",
    status: "pendente",
    veiculo: "caminhonete",
  });

  await upsertDemoAgendamento({
    usuario: clienteDemo,
    loja: lojaEco,
    servicoNome: "Eco completa",
    data: agendamentoConfirmadoData,
    hora: "15:00",
    status: "confirmado",
    veiculo: "moto",
  });

  void lojaPrime;
  void lojaFast;
  void lojaStudio;
  void lojaTruck;
  void lojaMall;

  console.log("Seed concluído.");
  console.log("Cliente demo: cliente@autoshine.local / cliente123");
  console.log("Parceiros demo: senha padrão autoshine123 para shine-centro, detalhe-premium, prime-car-care, fastwash-marista, eco-brilho, studio-vitrificacao, truck-clean e mall-auto-spa");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
