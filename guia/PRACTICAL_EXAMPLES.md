# Exemplos Práticos de Proteção de Dados

## 1. Exemplo: Criar Usuário com Criptografia

### ✅ IMPLEMENTAÇÃO CORRETA

```javascript
// src/routes/auth.js - POST /cadastro

const express = require("express");
const bcrypt = require("bcrypt");
const prisma = require("../config/database");
const { criptografar, criarIndice } = require("../utils/crypto");
const { normalizarEmail, cpfTemDigitoValido } = require("../utils/validators");

router.post("/cadastro", async (req, res) => {
  try {
    // 1️⃣ VALIDAR ENTRADA
    const { nome, email, cpf, telefone, senha } = req.body;
    
    if (!nome || nome.length < 3) {
      return res.status(400).json({ error: "Nome inválido" });
    }
    
    const emailNormalizado = normalizarEmail(email);
    if (!emailNormalizado) {
      return res.status(400).json({ error: "Email inválido" });
    }
    
    if (!cpfTemDigitoValido(cpf)) {
      return res.status(400).json({ error: "CPF inválido" });
    }
    
    if (!telefone || telefone.length < 10) {
      return res.status(400).json({ error: "Telefone inválido" });
    }
    
    if (!senha || senha.length < 8) {
      return res.status(400).json({ error: "Senha deve ter no mínimo 8 caracteres" });
    }

    // 2️⃣ VERIFICAR SE EXISTE
    const usuarioExistente = await prisma.usuario.findFirst({
      where: {
        emailIndex: criarIndice(emailNormalizado)  // 🔍 Buscar por índice
      }
    });
    
    if (usuarioExistente) {
      return res.status(409).json({ error: "Email já cadastrado" });
    }

    // 3️⃣ CRIPTOGRAFAR DADOS SENSÍVEIS
    const emailCriptografado = criptografar(emailNormalizado);
    const cpfCriptografado = criptografar(cpf);
    const telefoneCriptografado = criptografar(telefone);
    const senhaCriptografada = await bcrypt.hash(senha, 10);

    // 4️⃣ CRIAR ÍNDICES PARA BUSCA
    const emailIndice = criarIndice(emailNormalizado);
    const cpfIndice = criarIndice(cpf);
    const telefoneIndice = criarIndice(telefone);

    // 5️⃣ SALVAR NO BANCO
    const usuario = await prisma.usuario.create({
      data: {
        nome,                              // ✅ Nome pode ser público
        email: emailNormalizado,            // ✅ Email normalizado (para referência)
        emailCipher: emailCriptografado,    // 🔐 Email criptografado
        emailIndex: emailIndice,            // 🔍 Índice para busca
        cpf,                               // ✅ CPF pode ser armazenado normalmente? NÃO!
        cpfCipher: cpfCriptografado,       // 🔐 CPF criptografado
        cpfIndex: cpfIndice,               // 🔍 Índice para busca
        telefone,                          // ✅ Telefone pode ser armazenado? NÃO!
        telefoneCipher: telefoneCriptografado, // 🔐 Telefone criptografado
        telefoneIndex: telefoneIndice,     // 🔍 Índice para busca
        senha: senhaCriptografada          // 🔐 Senha com bcrypt
      },
      select: {
        id: true,
        nome: true,
        email: true  // Retornar apenas o email normalizado, nunca criptografado
      }
    });

    // 6️⃣ RETORNAR RESPOSTA SEGURA
    res.status(201).json({
      message: "Usuário cadastrado com sucesso",
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email  // ✅ Email descriptografado
      }
    });

  } catch (err) {
    console.error("Erro ao cadastrar:", err);
    res.status(500).json({ error: "Erro ao cadastrar usuário" });
  }
});
```

### ❌ ERROS COMUNS A EVITAR

```javascript
// ❌ ERRADO 1: Armazenar dados sensíveis sem criptografia
const usuario = await prisma.usuario.create({
  data: {
    email: req.body.email,        // ❌ Sem criptografia
    cpf: req.body.cpf,            // ❌ Sem criptografia
    telefone: req.body.telefone,  // ❌ Sem criptografia
    senha: req.body.senha         // ❌ Sem hash
  }
});

// ❌ ERRADO 2: Retornar dados criptografados na resposta
res.json({
  usuario: {
    emailCipher: emailCriptografado  // ❌ Nunca retornar cifrado
  }
});

// ❌ ERRADO 3: Buscar usando campo criptografado
const usuario = await prisma.usuario.findFirst({
  where: {
    emailCipher: criptografar(email)  // ❌ Dois problemas:
                                        // 1. IV aleatório gera diferentes ciphers
                                        // 2. Deve usar índice
  }
});

// ❌ ERRADO 4: Não validar entrada
const usuario = await prisma.usuario.create({
  data: {
    email: req.body.email,  // ❌ Pode conter XSS, SQL injection
    nome: req.body.nome     // ❌ Sem tamanho máximo
  }
});
```

---

## 2. Exemplo: Criar Agendamento com Proteção

### ✅ IMPLEMENTAÇÃO CORRETA

```javascript
// src/routes/agendamentos.js - POST /

const express = require("express");
const prisma = require("../config/database");
const { autenticarUsuario } = require("../middlewares/auth");
const { criptografar, criarIndice, descriptografarSeNecessario } = require("../utils/crypto");
const { registrarAudit } = require("../utils/audit");

router.post("/", autenticarUsuario, async (req, res) => {
  try {
    const {
      lojaId,
      servicoId,
      data,
      hora,
      veiculo,
      notas,
      nomeCliente,
      emailCliente
    } = req.body;

    // 1️⃣ VALIDAR ENTRADA
    if (!lojaId || isNaN(lojaId)) {
      return res.status(400).json({ error: "Loja inválida" });
    }
    if (!servicoId || isNaN(servicoId)) {
      return res.status(400).json({ error: "Serviço inválido" });
    }
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return res.status(400).json({ error: "Data inválida (formato: YYYY-MM-DD)" });
    }
    if (!hora || !/^\d{2}:\d{2}$/.test(hora)) {
      return res.status(400).json({ error: "Hora inválida (formato: HH:MM)" });
    }

    // 2️⃣ VALIDAR LOJA E SERVIÇO
    const loja = await prisma.loja.findFirst({
      where: { id: Number(lojaId), bloqueado: false }
    });
    if (!loja) {
      return res.status(404).json({ error: "Loja não encontrada" });
    }

    const servico = await prisma.servicoLoja.findFirst({
      where: { id: Number(servicoId), lojaId: Number(lojaId) }
    });
    if (!servico) {
      return res.status(404).json({ error: "Serviço não encontrado" });
    }

    // 3️⃣ CRIPTOGRAFAR DADOS SENSÍVEIS
    const agendamentoCriado = await prisma.agendamento.create({
      data: {
        lojaId: Number(lojaId),
        servicoId: Number(servicoId),
        usuarioId: req.usuario.id,  // ✅ ID do usuário autenticado
        data,                         // ✅ Data pode ser visível ao proprietário
        hora,                         // ✅ Hora pode ser visível ao proprietário
        veiculo: veiculo || "Carro",  // ✅ Tipo de veículo
        
        // 🔐 Criptografar notas (pode conter info sensível)
        notas: criptografar(notas),
        notasCipher: criptografar(notas),
        
        // 🔐 Criptografar nome do cliente
        nomeCliente: criptografar(nomeCliente),
        nomeClienteCipher: criptografar(nomeCliente),
        nomeClienteIndex: criarIndice(nomeCliente),  // 🔍 Índice para busca
        
        // 🔐 Criptografar email do cliente
        emailCliente: criptografar(emailCliente),
        emailClienteCipher: criptografar(emailCliente),
        emailClienteIndex: criarIndice(emailCliente),  // 🔍 Índice para busca
        
        status: "pendente"
      },
      include: {
        loja: { select: { nome: true } },
        servico: { select: { nome: true, preco: true } }
      }
    });

    // 4️⃣ REGISTRAR AUDIT
    await registrarAudit({
      acao: "CREATE",
      tabela: "agendamento",
      recordId: agendamentoCriado.id,
      usuarioId: req.usuario.id,
      enderecoIp: req.ip,
      detalhes: { lojaId, servicoId, data, hora }
    });

    // 5️⃣ RETORNAR RESPOSTA SEGURA (descriptografar para o cliente)
    res.status(201).json({
      message: "Agendamento criado com sucesso",
      agendamento: {
        id: agendamentoCriado.id,
        data: agendamentoCriado.data,
        hora: agendamentoCriado.hora,
        veiculo: agendamentoCriado.veiculo,
        notas: descriptografarSeNecessario(agendamentoCriado.notas),
        nomeCliente: descriptografarSeNecessario(agendamentoCriado.nomeCliente),
        emailCliente: descriptografarSeNecessario(agendamentoCriado.emailCliente),
        loja: agendamentoCriado.loja,
        servico: agendamentoCriado.servico,
        status: agendamentoCriado.status,
        createdAt: agendamentoCriado.createdAt
      }
    });

  } catch (err) {
    console.error("Erro ao criar agendamento:", err);
    
    // 4️⃣ REGISTRAR ERRO NO AUDIT
    await registrarAudit({
      acao: "CREATE",
      tabela: "agendamento",
      recordId: 0,
      usuarioId: req.usuario.id,
      enderecoIp: req.ip,
      sucesso: false,
      erro: err.message
    });

    res.status(500).json({ error: "Erro ao criar agendamento" });
  }
});
```

---

## 3. Exemplo: Listar Avaliações com Máscaras

### ✅ IMPLEMENTAÇÃO CORRETA

```javascript
// src/routes/avaliacoes.js - GET /:lojaId (listagem pública)

const express = require("express");
const prisma = require("../config/database");
const { mascararNomeCliente, sanitizarTexto } = require("../utils/masking");

router.get("/:lojaId", async (req, res) => {
  try {
    // 1️⃣ BUSCAR AVALIAÇÕES
    const avaliacoes = await prisma.avaliacao.findMany({
      where: { 
        lojaId: Number(req.params.lojaId),
        aprovado: true  // 🆕 Apenas mostrar avaliações aprovadas
      },
      include: {
        usuario: {
          select: { id: true }  // ✅ Apenas ID, nunca expor email/telefone
        }
      },
      orderBy: { createdAt: "desc" },
      take: 20  // ✅ Limitar para não expor muitos dados
    });

    // 2️⃣ MASCARAR E SANITIZAR DADOS
    const avaliacoesPublicas = avaliacoes.map(avaliacao => ({
      id: avaliacao.id,
      nota: avaliacao.nota,  // ✅ Nota numérica é pública
      
      // 🆕 Sanitizar comentário (remover emails, telefones, CPF, etc.)
      comentario: sanitizarTexto(avaliacao.comentario || ""),
      
      fotoUrl: avaliacao.fotoUrl,  // ✅ Foto é pública
      
      // 🔒 Mascarar nome do cliente
      // "João Silva" → "Cliente #a1b2c3"
      nomeCliente: mascararNomeCliente(
        avaliacao.nomeCliente,
        avaliacao.usuario?.id
      ),
      
      // ✅ Data é pública
      createdAt: avaliacao.createdAt
      
      // ❌ NUNCA incluir:
      // usuarioId, email, telefone, donoId, comentarioOriginal
    }));

    // 3️⃣ RETORNAR RESPOSTA
    res.json({
      loja_id: Number(req.params.lojaId),
      total: avaliacoesPublicas.length,
      media_notas: avaliacoes.length > 0
        ? (avaliacoes.reduce((sum, a) => sum + a.nota, 0) / avaliacoes.length).toFixed(1)
        : 0,
      avaliacoes: avaliacoesPublicas
    });

  } catch (err) {
    console.error("Erro ao buscar avaliações:", err);
    res.status(500).json({ error: "Erro ao buscar avaliações" });
  }
});

// 🆕 NOVO: GET /admin/avaliacoes (sem mascaras, apenas admin)
router.get("/admin/avaliacoes", autenticarAdmin, async (req, res) => {
  try {
    const avaliacoes = await prisma.avaliacao.findMany({
      include: {
        usuario: {
          select: { id: true, nome: true, email: true }
        },
        loja: {
          select: { id: true, nome: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    // Admin vê dados completos (descriptografados)
    const avaliacoesCompletas = avaliacoes.map(avaliacao => ({
      ...avaliacao,
      nomeCliente: descriptografarSeNecessario(avaliacao.nomeCliente),
      usuario: {
        ...avaliacao.usuario,
        email: descriptografarSeNecessario(avaliacao.usuario.email)
      }
    }));

    res.json(avaliacoesCompletas);
  } catch (err) {
    console.error("Erro ao buscar avaliações (admin):", err);
    res.status(500).json({ error: "Erro ao buscar avaliações" });
  }
});
```

---

## 4. Exemplo: Endpoint Protegido de Dados Sensíveis

### ✅ IMPLEMENTAÇÃO CORRETA

```javascript
// src/routes/lojas.js - GET /:id/admin (apenas proprietário)

const express = require("express");
const prisma = require("../config/database");
const { autenticarDono } = require("../middlewares/auth");
const { descriptografarSeNecessario } = require("../utils/crypto");
const { registrarAudit } = require("../utils/audit");

// 🆕 Endpoint protegido para dados sensíveis
router.get("/:id/admin", autenticarDono, async (req, res) => {
  try {
    // 1️⃣ BUSCAR LOJA
    const loja = await prisma.loja.findFirst({
      where: {
        id: Number(req.params.id),
        donoId: req.dono.donoId  // ✅ Verificar que é o proprietário
      },
      include: {
        servicos: true,
        agendamentos: {
          include: {
            usuario: { select: { id: true, nome: true, email: true } },
            servico: true
          },
          orderBy: { createdAt: "desc" },
          take: 100
        }
      }
    });

    if (!loja) {
      return res.status(404).json({ error: "Loja não encontrada ou sem permissão" });
    }

    // 2️⃣ REGISTRAR ACESSO
    await registrarAudit({
      acao: "READ",
      tabela: "loja",
      recordId: loja.id,
      usuarioId: req.dono.donoId,
      enderecoIp: req.ip,
      detalhes: { action: "acesso_dados_sensíveis" }
    });

    // 3️⃣ RETORNAR DADOS SENSÍVEIS (descriptografados)
    res.json({
      id: loja.id,
      nome: loja.nome,
      descricao: loja.descricao,
      endereco: loja.endereco,  // ✅ Endereço completo para proprietário
      latitude: loja.latitude,  // ✅ Coordenadas exatas
      longitude: loja.longitude,
      precoMedio: loja.precoMedio,  // ✅ Apenas proprietário vê preço
      categoria: loja.categoria,
      
      // 🔒 Dados comerciais
      formasPagamento: loja.formasPagamento,
      politicaCancelamento: loja.politicaCancelamento,
      agendaDias: loja.agendaDias,
      agendaHorarios: loja.agendaHorarios,
      
      // 📊 Serviços
      servicos: loja.servicos.map(s => ({
        id: s.id,
        nome: s.nome,
        descricao: s.descricao,
        preco: s.preco,
        duracao: s.duracao
      })),
      
      // 📅 Agendamentos (com dados sensíveis descriptografados)
      agendamentos: loja.agendamentos.map(a => ({
        id: a.id,
        data: a.data,
        hora: a.hora,
        veiculo: a.veiculo,
        notas: descriptografarSeNecessario(a.notas),  // ✅ Descriptografar
        nomeCliente: descriptografarSeNecessario(a.nomeCliente),
        emailCliente: descriptografarSeNecessario(a.emailCliente),
        usuario: {
          id: a.usuario?.id,
          nome: a.usuario?.nome,
          email: descriptografarSeNecessario(a.usuario?.email)  // ✅ Descriptografar
        },
        servico: a.servico,
        status: a.status,
        createdAt: a.createdAt
      })),
      
      bloqueado: loja.bloqueado,
      createdAt: loja.createdAt,
      updatedAt: loja.updatedAt
    });

  } catch (err) {
    console.error("Erro ao buscar dados sensíveis da loja:", err);
    
    await registrarAudit({
      acao: "READ",
      tabela: "loja",
      recordId: Number(req.params.id),
      usuarioId: req.dono.donoId,
      enderecoIp: req.ip,
      sucesso: false,
      erro: err.message
    });

    res.status(500).json({ error: "Erro ao buscar dados da loja" });
  }
});

// ✅ Endpoint público (sem dados sensíveis)
router.get("/:id", async (req, res) => {
  try {
    const { mascararEndereco, arredondarGPS } = require("../utils/masking");

    const loja = await prisma.loja.findFirst({
      where: {
        id: Number(req.params.id),
        bloqueado: false
      },
      include: {
        servicos: true,
        avaliacoes: { take: 10 }
      }
    });

    if (!loja) {
      return res.status(404).json({ error: "Loja não encontrada" });
    }

    // Mascarar coordenadas GPS
    const gps = arredondarGPS(loja.latitude, loja.longitude);

    res.json({
      id: loja.id,
      nome: loja.nome,
      descricao: loja.descricao,
      endereco: mascararEndereco(loja.endereco),  // 🔒 Mascarar endereço
      latitude: gps.latitude,   // 🔒 Arredondar GPS
      longitude: gps.longitude, // 🔒 Arredondar GPS
      categoria: loja.categoria,
      fotoUrl: loja.fotoUrl,
      capaUrl: loja.capaUrl,
      formasPagamento: loja.formasPagamento,
      politicaCancelamento: loja.politicaCancelamento,
      
      servicos: loja.servicos.map(s => ({
        id: s.id,
        nome: s.nome,
        descricao: s.descricao,
        preco: s.preco,
        duracao: s.duracao
      })),
      
      media_avaliacoes: loja.avaliacoes.length > 0
        ? (loja.avaliacoes.reduce((sum, a) => sum + a.nota, 0) / loja.avaliacoes.length).toFixed(1)
        : 0,
      
      createdAt: loja.createdAt
      
      // ❌ NUNCA expor em endpoint público:
      // donoId, precoMedio, bloqueado, agendaHorarios, agendaDias, updatedAt
    });

  } catch (err) {
    console.error("Erro ao buscar loja:", err);
    res.status(500).json({ error: "Erro ao buscar loja" });
  }
});
```

---

## 5. Exemplo: Função de Útilitário de Masking

```javascript
// src/utils/masking.js

const crypto = require("crypto");

/**
 * Gera máscara consistente para um nome de cliente
 * Garante que o mesmo cliente vê sempre a mesma máscara
 * "João Silva" + usuarioId=5 → sempre "Cliente #a1b2c3"
 */
function mascararNomeCliente(nomeOriginal, usuarioId) {
  if (!nomeOriginal || !usuarioId) return "Cliente";
  
  // Hash determinístico (mesmo input = mesmo output)
  const hash = crypto
    .createHash("md5")
    .update(`${usuarioId}-${nomeOriginal}`)
    .digest("hex")
    .substring(0, 6);
  
  return `Cliente #${hash}`;
}

/**
 * Remove número da rua e detalhes muito específicos
 * "Rua das Flores, 123, apto 45" → "Rua das Flores"
 */
function mascararEndereco(endereco) {
  if (!endereco) return "";
  
  // Pegar apenas primeira parte (antes da primeira vírgula)
  return endereco.split(",")[0].trim();
}

/**
 * Arredondar para ~1km de precisão
 * Impede rastreamento preciso de localizações
 * Latitude/Longitude com 2 decimais = ~1.1 km de precisão
 */
function arredondarGPS(latitude, longitude) {
  if (!latitude || !longitude) return { latitude: 0, longitude: 0 };
  
  return {
    latitude: Math.round(latitude * 100) / 100,
    longitude: Math.round(longitude * 100) / 100
  };
}

/**
 * Remove dados pessoais de um texto
 * Remove: emails, telefones, CPF, nomes
 */
function sanitizarTexto(texto) {
  if (!texto || typeof texto !== "string") return "";
  
  let sanitizado = texto;
  
  // Remover emails
  sanitizado = sanitizado.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, "[email oculto]");
  
  // Remover telefones (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
  sanitizado = sanitizado.replace(/\(\d{2}\)\s?\d{4,5}-\d{4}/g, "[telefone oculto]");
  
  // Remover CPF XXX.XXX.XXX-XX
  sanitizado = sanitizado.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, "[CPF oculto]");
  
  // Remover CNPJ XX.XXX.XXX/XXXX-XX
  sanitizado = sanitizado.replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, "[CNPJ oculto]");
  
  // Remover URLs
  sanitizado = sanitizado.replace(/https?:\/\/[^\s]+/g, "[link oculto]");
  
  // Limitar tamanho
  if (sanitizado.length > 500) {
    sanitizado = sanitizado.substring(0, 497) + "...";
  }
  
  return sanitizado;
}

/**
 * Remover dados sensíveis de um objeto
 */
function removerSensibilidades(objeto, chaves) {
  const copia = { ...objeto };
  for (const chave of chaves) {
    delete copia[chave];
  }
  return copia;
}

module.exports = {
  mascararNomeCliente,
  mascararEndereco,
  arredondarGPS,
  sanitizarTexto,
  removerSensibilidades
};
```

---

## 6. Testes de Implementação

```javascript
// tests/seguranca.test.js

const { 
  mascararNomeCliente, 
  mascararEndereco,
  arredondarGPS,
  sanitizarTexto 
} = require("../src/utils/masking");

describe("Proteção de Dados - Máscaras", () => {
  
  test("mascararNomeCliente gera máscara consistente", () => {
    const nome = "João Silva";
    const usuarioId = 5;
    
    const mascara1 = mascararNomeCliente(nome, usuarioId);
    const mascara2 = mascararNomeCliente(nome, usuarioId);
    
    expect(mascara1).toBe(mascara2);  // ✅ Determinístico
    expect(mascara1).toMatch(/^Cliente #[a-f0-9]{6}$/);  // ✅ Formato correto
  });

  test("mascararNomeCliente diferentes usuarios têm máscaras diferentes", () => {
    const nome = "João Silva";
    
    const mascara1 = mascararNomeCliente(nome, 5);
    const mascara2 = mascararNomeCliente(nome, 10);
    
    expect(mascara1).not.toBe(mascara2);  // ✅ Diferente por usuário
  });

  test("mascararEndereco remove número e complemento", () => {
    expect(mascararEndereco("Rua das Flores, 123, apto 45"))
      .toBe("Rua das Flores");
    
    expect(mascararEndereco("Avenida Paulista, 1000"))
      .toBe("Avenida Paulista");
    
    expect(mascararEndereco(""))
      .toBe("");
  });

  test("arredondarGPS arredonda para 2 casas decimais", () => {
    const gps = arredondarGPS(-23.550520, -46.633309);
    
    expect(gps.latitude).toBe(-23.55);
    expect(gps.longitude).toBe(-46.63);
  });

  test("sanitizarTexto remove emails", () => {
    const texto = "Contate-me em joao@email.com para mais info";
    const sanitizado = sanitizarTexto(texto);
    
    expect(sanitizado).toContain("[email oculto]");
    expect(sanitizado).not.toContain("joao@email.com");
  });

  test("sanitizarTexto remove telefones", () => {
    const texto = "Meu telefone é (11) 98765-4321";
    const sanitizado = sanitizarTexto(texto);
    
    expect(sanitizado).toContain("[telefone oculto]");
    expect(sanitizado).not.toContain("98765-4321");
  });

  test("sanitizarTexto remove CPF", () => {
    const texto = "CPF: 123.456.789-00";
    const sanitizado = sanitizarTexto(texto);
    
    expect(sanitizado).toContain("[CPF oculto]");
    expect(sanitizado).not.toContain("123.456.789-00");
  });

  test("sanitizarTexto limita tamanho a 500 caracteres", () => {
    const texto = "x".repeat(600);
    const sanitizado = sanitizarTexto(texto);
    
    expect(sanitizado.length).toBeLessThanOrEqual(500);
  });
});
```

---

## 7. Checklist de Validação

### Antes de Deploy em Produção

```
□ Verificar que todos os dados CRÍTICOS estão criptografados
□ Verificar que todos os índices HMAC estão criados
□ Verificar que dados sensíveis NÃO são retornados em endpoints públicos
□ Verificar que máscaras estão aplicadas em listagens públicas
□ Verificar que donoId NUNCA é exposto em respostas públicas
□ Verificar que usuarioId NUNCA é exposto em avaliações públicas
□ Verificar que GPS está arredondado em endpoints públicos
□ Verificar que commentários estão sanitizados
□ Verificar que audit logs estão sendo registrados
□ Executar npm test para validar tudo
□ Executar security test: npm run security:test
□ Fazer código review com focus em segurança
□ Testar em staging por 24 horas
□ Monitorar logs em produção por 7 dias
```

---

**Documento gerado em**: 2026-09-21
**Versão**: 1.0
**Próxima revisão**: 2026-10-21
