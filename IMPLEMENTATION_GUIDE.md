# Guia de Implementação - Proteção de Dados

## 🔧 Como Implementar as Estratégias de Proteção

### 1. Criptografia de Dados Sensíveis

#### ✅ Já Implementado - Email do Usuario

```javascript
// src/routes/auth.js - Exemplo
const usuario = await prisma.usuario.create({
  data: {
    nome: req.body.nome,
    email: normalizarEmail(req.body.email),
    emailCipher: criptografar(req.body.email),      // ✅ Armazenar criptografado
    emailIndex: criarIndice(req.body.email),         // ✅ Índice para busca
    cpf: req.body.cpf,
    cpfCipher: criptografar(req.body.cpf),
    cpfIndex: criarIndice(req.body.cpf),
    telefone: req.body.telefone,
    telefoneCipher: criptografar(req.body.telefone),
    telefoneCipher: criptografar(req.body.telefone), // ⚠️ ADICIONAR INDEX
    senha: await bcrypt.hash(req.body.senha, 10)
  }
});
```

#### ⚠️ PRECISA: Adicionar índice para telefone

**Arquivo a modificar**: `prisma/schema.prisma`

```prisma
model Usuario {
  // ... campos anteriores
  telefone          String?
  telefoneCipher    String?
  telefoneIndex     String?       @unique  // 🆕 ADICIONAR ESTA LINHA
  // ... campos posteriores
}
```

**Arquivo a modificar**: `src/routes/auth.js` (criar usuario)

```javascript
const usuario = await prisma.usuario.create({
  data: {
    // ... dados anteriores
    telefone: req.body.telefone,
    telefoneCipher: criptografar(req.body.telefone),
    telefoneIndex: criarIndice(req.body.telefone),  // 🆕 ADICIONAR
    // ... dados posteriores
  }
});
```

---

### 2. Buscas com Índices HMAC

#### ✅ Exemplo Correto - Buscar por Email

```javascript
// src/routes/auth.js - Buscar usuario por email
const { criarIndice } = require("../utils/crypto");

// ✅ CORRETO: Usar apenas o índice, nunca o texto criptografado
const usuario = await prisma.usuario.findFirst({
  where: {
    emailIndex: criarIndice(emailInformado)  // ✅ Buscar só pelo índice
  }
});

// ❌ ERRADO: Nunca fazer assim
// const usuario = await prisma.usuario.findFirst({
//   where: { emailCipher: criptografar(emailInformado) }
// });
```

#### ⚠️ ADICIONAR: Índices para Agendamento

**Arquivo a modificar**: `prisma/schema.prisma`

```prisma
model Agendamento {
  // ... campos anteriores
  nomeCliente          String?
  nomeClienteCipher    String?
  nomeClienteIndex     String?       @unique  // 🆕 ADICIONAR
  emailCliente         String?
  emailClienteCipher   String?
  emailClienteIndex    String?       @unique  // 🆕 ADICIONAR
  // ... campos posteriores
}
```

**Arquivo a modificar**: `src/routes/agendamentos.js`

```javascript
// Ao criar agendamento
const agendamento = await prisma.agendamento.create({
  data: {
    // ... dados anteriores
    nomeCliente: criptografar(nomeCliente),
    nomeClienteCipher: criptografar(nomeCliente),
    nomeClienteIndex: criarIndice(nomeCliente),    // 🆕 ADICIONAR
    emailCliente: criptografar(emailCliente),
    emailClienteCipher: criptografar(emailCliente),
    emailClienteIndex: criarIndice(emailCliente),  // 🆕 ADICIONAR
    // ... dados posteriores
  }
});
```

---

### 3. Criptografia de Denúncias

#### ⚠️ ADICIONAR: Motivo da Denúncia

**Arquivo a modificar**: `prisma/schema.prisma`

```prisma
model Denuncia {
  id             Int          @id @default(autoincrement())
  tipo           String
  motivo         String
  motivoCipher   String?      // 🆕 ADICIONAR ESTA LINHA
  motivoIndex    String?      // 🆕 ADICIONAR ESTA LINHA
  detalhes       String?
  detalhesCipher String?
  // ... resto do modelo
}
```

**Arquivo a modificar**: `src/routes/denuncias.js`

```javascript
// Ao criar denúncia
const denuncia = await prisma.denuncia.create({
  data: {
    tipo: req.body.tipo,
    motivo: req.body.motivo,
    motivoCipher: criptografar(req.body.motivo),  // 🆕 ADICIONAR
    motivoIndex: criarIndice(req.body.motivo),    // 🆕 ADICIONAR
    detalhes: req.body.detalhes,
    detalhesCipher: criptografar(req.body.detalhes),
    // ... resto dos dados
  }
});
```

---

### 4. Máscaras de Dados em Listagens Públicas

#### Exemplo: Máscara de Nome em Avaliações

**Novo arquivo**: `src/utils/masking.js`

```javascript
const crypto = require("crypto");

/**
 * Máscara de nome para avaliações públicas
 * "João Silva" → "Cliente #15a4e2"
 */
function mascararNomeCliente(nomeOriginal, usuarioId) {
  if (!nomeOriginal || !usuarioId) return "Cliente";
  
  const hash = crypto
    .createHash("md5")
    .update(`${usuarioId}${nomeOriginal}`)
    .digest("hex")
    .substring(0, 6);
  
  return `Cliente #${hash}`;
}

/**
 * Máscara de endereço para lojas
 * "Rua das Flores, 123" → "Rua das Flores"
 */
function mascararEndereco(endereco) {
  if (!endereco) return "";
  
  // Remove número e complemento
  const partes = endereco.split(",");
  return partes[0].trim(); // Retorna apenas rua/avenida
}

/**
 * Arredondar coordenadas GPS para ~1km de precisão
 * Latitude/Longitude: 2 casas decimais = ~1.1 km
 */
function arredondarGPS(latitude, longitude) {
  return {
    latitude: Math.round(latitude * 100) / 100,
    longitude: Math.round(longitude * 100) / 100
  };
}

/**
 * Remover dados pessoais de texto
 * Remove emails, telefones, CPF, etc.
 */
function sanitizarTexto(texto) {
  if (!texto) return "";
  
  let sanitizado = texto;
  
  // Remover emails
  sanitizado = sanitizado.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, "[email]");
  
  // Remover telefones (XX) XXXXX-XXXX
  sanitizado = sanitizado.replace(/\(\d{2}\)\s?\d{4,5}-\d{4}/g, "[telefone]");
  
  // Remover CPF XXX.XXX.XXX-XX
  sanitizado = sanitizado.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, "[cpf]");
  
  return sanitizado;
}

module.exports = {
  mascararNomeCliente,
  mascararEndereco,
  arredondarGPS,
  sanitizarTexto
};
```

**Modificar**: `src/routes/avaliacoes.js` - GET (listagem pública)

```javascript
const { mascararNomeCliente, sanitizarTexto } = require("../utils/masking");

router.get("/:lojaId", async (req, res) => {
  try {
    const avaliacoes = await prisma.avaliacao.findMany({
      where: { lojaId: Number(req.params.lojaId) },
      include: { usuario: { select: { id: true } } },
      orderBy: { createdAt: "desc" }
    });

    // Mascarar dados pessoais
    const avaliacoesPublicas = avaliacoes.map(avaliacao => ({
      id: avaliacao.id,
      nota: avaliacao.nota,
      comentario: sanitizarTexto(avaliacao.comentario), // 🆕 Sanitizar
      fotoUrl: avaliacao.fotoUrl,
      nomeCliente: mascararNomeCliente(        // 🆕 Mascarar
        avaliacao.nomeCliente,
        avaliacao.usuario?.id
      ),
      createdAt: avaliacao.createdAt
    }));

    res.json(avaliacoesPublicas);
  } catch (err) {
    console.error("Erro ao buscar avaliações:", err);
    res.status(500).json({ error: "Erro ao buscar avaliações" });
  }
});
```

**Modificar**: `src/routes/lojas.js` - GET (listagem pública)

```javascript
const { mascararEndereco, arredondarGPS } = require("../utils/masking");

router.get("/", async (req, res) => {
  try {
    const lojas = await prisma.loja.findMany({
      where: { bloqueado: false },
      include: { dono: { select: { nome: true } } }
    });

    const lojasPublicas = lojas.map(loja => {
      const gps = arredondarGPS(loja.latitude, loja.longitude); // 🆕 Arredondar GPS
      
      return {
        id: loja.id,
        nome: loja.nome,
        descricao: loja.descricao,
        endereco: mascararEndereco(loja.endereco),  // 🆕 Mascarar endereço
        latitude: gps.latitude,                      // 🆕 Usar GPS arredondado
        longitude: gps.longitude,
        categoria: loja.categoria,
        fotoUrl: loja.fotoUrl,
        capaUrl: loja.capaUrl,
        // Nunca expor donoId em respostas públicas
        createdAt: loja.createdAt
      };
    });

    res.json(lojasPublicas);
  } catch (err) {
    console.error("Erro ao buscar lojas:", err);
    res.status(500).json({ error: "Erro ao buscar lojas" });
  }
});
```

---

### 5. Audit Log para Acessos Críticos

**Novo arquivo**: `prisma/schema.prisma` - Adicionar modelo

```prisma
model AuditLog {
  id          Int      @id @default(autoincrement())
  acao        String   // "READ", "CREATE", "UPDATE", "DELETE"
  tabela      String   // "usuario", "agendamento", etc
  recordId    Int      // ID do registro afetado
  usuarioId   Int?     // Quem fez a ação
  enderecoIp  String?  // IP de origem
  detalhes    String?  // Dados adicionais
  sucesso     Boolean  @default(true)
  erro        String?  // Se falhou, qual foi o erro
  createdAt   DateTime @default(now())
}
```

**Novo arquivo**: `src/utils/audit.js`

```javascript
const prisma = require("../config/database");

/**
 * Registrar ação em audit log
 */
async function registrarAudit({
  acao,        // "READ" | "CREATE" | "UPDATE" | "DELETE"
  tabela,      // Nome da tabela
  recordId,    // ID do registro
  usuarioId,   // ID do usuário que realizou ação
  enderecoIp,  // IP de origem (req.ip)
  detalhes,    // Dados adicionais opcionais
  sucesso = true,
  erro = null
}) {
  try {
    // Só logar acessos críticos
    const tabelasCriticas = ["usuario", "dono", "agendamento", "denuncia"];
    if (!tabelasCriticas.includes(tabela.toLowerCase())) return;

    await prisma.auditLog.create({
      data: {
        acao,
        tabela,
        recordId,
        usuarioId,
        enderecoIp,
        detalhes: detalhes ? JSON.stringify(detalhes) : null,
        sucesso,
        erro: erro ? erro.toString() : null
      }
    });
  } catch (err) {
    console.error("Erro ao registrar audit:", err);
  }
}

module.exports = { registrarAudit };
```

**Usar em rotas críticas**:

```javascript
const { registrarAudit } = require("../utils/audit");

// Exemplo em agendamentos.js
router.get("/dono", autenticarDono, async (req, res) => {
  try {
    // ... lógica de busca
    
    // 🆕 Registrar acesso
    await registrarAudit({
      acao: "READ",
      tabela: "agendamento",
      recordId: 0, // Se listando múltiplos
      usuarioId: req.dono.donoId,
      enderecoIp: req.ip,
      detalhes: { listaCount: agendamentos.length }
    });

    res.json({ agendamentos });
  } catch (err) {
    // 🆕 Registrar erro
    await registrarAudit({
      acao: "READ",
      tabela: "agendamento",
      recordId: 0,
      usuarioId: req.dono.donoId,
      enderecoIp: req.ip,
      sucesso: false,
      erro: err.message
    });
    
    res.status(500).json({ error: "Erro ao buscar agendamentos" });
  }
});
```

---

### 6. Validação e Sanitização de Inputs

**Novo arquivo**: `src/utils/validators-enhanced.js`

```javascript
const { sanitizarTexto } = require("./masking");

/**
 * Validar e sanitizar dados de agendamento
 */
function validarAgendamento(dados) {
  const erros = [];

  if (!dados.lojaId || isNaN(dados.lojaId)) {
    erros.push("lojaId inválido");
  }

  if (!dados.servicoId || isNaN(dados.servicoId)) {
    erros.push("servicoId inválido");
  }

  if (!dados.data || !/^\d{4}-\d{2}-\d{2}$/.test(dados.data)) {
    erros.push("Data deve estar no formato YYYY-MM-DD");
  }

  if (!dados.hora || !/^\d{2}:\d{2}$/.test(dados.hora)) {
    erros.push("Hora deve estar no formato HH:MM");
  }

  // Sanitizar e validar notas
  if (dados.notas) {
    dados.notas = sanitizarTexto(dados.notas);
    if (dados.notas.length > 500) {
      erros.push("Notas não podem ter mais de 500 caracteres");
    }
  }

  // Validar nome do cliente
  if (dados.nomeCliente && dados.nomeCliente.length > 100) {
    erros.push("Nome do cliente muito longo");
  }

  // Validar email do cliente
  if (dados.emailCliente) {
    if (!/^[\w\.-]+@[\w\.-]+\.\w+$/.test(dados.emailCliente)) {
      erros.push("Email do cliente inválido");
    }
    if (dados.emailCliente.length > 255) {
      erros.push("Email muito longo");
    }
  }

  if (erros.length > 0) {
    return { valido: false, erros };
  }

  return { valido: true, dados };
}

module.exports = { validarAgendamento };
```

---

## 🔄 Procedimento de Migração

### Passo 1: Executar migração Prisma

```bash
npx prisma migrate dev --name add_indices_and_cipher_fields
```

### Passo 2: Script de Migração de Dados Existentes

**Arquivo**: `scripts/adicionar-indices.js`

```javascript
const prisma = require("../src/config/database");
const { criarIndice } = require("../src/utils/crypto");

async function migrarIndices() {
  console.log("🔄 Iniciando migração de índices...");

  try {
    // Migrar usuários
    console.log("👤 Migrando índices de usuarios...");
    const usuarios = await prisma.usuario.findMany({
      where: { emailCipher: { not: null } }
    });

    for (const usuario of usuarios) {
      if (!usuario.emailIndex && usuario.email) {
        await prisma.usuario.update({
          where: { id: usuario.id },
          data: { emailIndex: criarIndice(usuario.email) }
        });
      }
      if (!usuario.telefoneIndex && usuario.telefone) {
        await prisma.usuario.update({
          where: { id: usuario.id },
          data: { telefoneIndex: criarIndice(usuario.telefone) }
        });
      }
    }
    console.log(`✅ ${usuarios.length} usuarios migrados`);

    // Migrar agendamentos
    console.log("📅 Migrando índices de agendamentos...");
    const agendamentos = await prisma.agendamento.findMany();

    for (const agendamento of agendamentos) {
      const updates = {};
      if (!agendamento.emailClienteIndex && agendamento.emailCliente) {
        updates.emailClienteIndex = criarIndice(agendamento.emailCliente);
      }
      if (!agendamento.nomeClienteIndex && agendamento.nomeCliente) {
        updates.nomeClienteIndex = criarIndice(agendamento.nomeCliente);
      }
      if (Object.keys(updates).length > 0) {
        await prisma.agendamento.update({
          where: { id: agendamento.id },
          data: updates
        });
      }
    }
    console.log(`✅ ${agendamentos.length} agendamentos migrados`);

    console.log("✅ Migração concluída com sucesso!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Erro na migração:", err);
    process.exit(1);
  }
}

migrarIndices();
```

**Adicionar em `package.json`**:

```json
{
  "scripts": {
    "migrate:indices": "node scripts/adicionar-indices.js"
  }
}
```

**Executar**:

```bash
npm run migrate:indices
```

---

## ✅ Checklist de Implementação

```
Fase 1: Preparação
  - [ ] Revisar DATA_CLASSIFICATION.md
  - [ ] Criar backup do banco de dados
  - [ ] Comunicar com equipe sobre mudanças

Fase 2: Schema
  - [ ] Adicionar campos em prisma/schema.prisma
  - [ ] Executar npx prisma migrate dev
  - [ ] Testar migração em staging

Fase 3: Código
  - [ ] Criar src/utils/masking.js
  - [ ] Atualizar src/routes/agendamentos.js
  - [ ] Atualizar src/routes/avaliacoes.js
  - [ ] Atualizar src/routes/lojas.js
  - [ ] Criar src/utils/audit.js
  - [ ] Adicionar registros de audit às rotas críticas

Fase 4: Dados Existentes
  - [ ] Executar npm run migrate:indices
  - [ ] Validar integridade de dados
  - [ ] Testar buscas com índices

Fase 5: Testes
  - [ ] Testes unitários para criptografia
  - [ ] Testes de integração para mascaras
  - [ ] Testes de segurança (OWASP Top 10)
  - [ ] Testes de performance

Fase 6: Deploy
  - [ ] Deploy para staging
  - [ ] Testes em produção (canário)
  - [ ] Deploy para produção
  - [ ] Monitoramento de logs
```

---

**Documento gerado em**: 2026-09-21
**Versão**: 1.0
**Status**: Pronto para implementação
