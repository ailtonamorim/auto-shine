# Guia Rápido de Referência - Proteção de Dados

## 🎯 Quick Reference Card

Imprima este documento para manter na mesa!

---

## ⚡ Regra de Ouro

```
┌──────────────────────────────────────────────────┐
│  SEM EXCEÇÃO:                                    │
│                                                  │
│  1. Validar TODA entrada do usuário             │
│  2. Criptografar dados CRÍTICOS antes de salvar │
│  3. Nunca retornar dados criptografados na API  │
│  4. Verificar autorização ANTES de expor dados  │
│  5. Remover/Mascarar dados sensíveis públicos   │
│  6. Registrar TODOS os acessos a dados críticos │
│  7. Nunca expor IDs internos (usuarioId, donoId)│
│  8. Arredondar GPS em endpoints públicos        │
└──────────────────────────────────────────────────┘
```

---

## 🔐 Matriz de Decisão Rápida

### Devo criptografar este campo?

```
É um dado pessoal (email, CPF, telefone)?
    SIM → CRIPTOGRAFAR com AES-256-GCM + ÍNDICE HMAC
    NÃO → próxima pergunta

É uma senha ou token?
    SIM → USAR HASH (Bcrypt ou SHA-256)
    NÃO → próxima pergunta

Pode expor o usuário a riscos (financeiro, reputacional)?
    SIM → CRIPTOGRAFAR
    NÃO → Usar AUTORIZAÇÃO + MÁSCARAS

É informação comercial sensível?
    SIM → CRIPTOGRAFAR ou RESTRINGIR ACESSO
    NÃO → OK expor (com máscaras se público)
```

---

## 📋 Template: Criando um Campo Novo

### Se o campo é CRÍTICO (email, telefone, CPF, etc):

```javascript
// 1. Adicionar ao schema
model Tabela {
  valor          String?           // Pode ter plaintext para referência
  valorCipher    String?           // 🔐 SEMPRE ADICIONAR ISTO
  valorIndex     String? @unique   // 🔍 Para buscar sem descriptografar
}

// 2. Ao SALVAR
const usuario = await prisma.usuario.create({
  data: {
    valor: "dados-originais",
    valorCipher: criptografar("dados-originais"),  // 🔐
    valorIndex: criarIndice("dados-originais"),    // 🔍
  }
});

// 3. Ao BUSCAR
const usuario = await prisma.usuario.findFirst({
  where: {
    valorIndex: criarIndice("search-term")  // 🔍 Use índice
  }
});

// 4. Ao RETORNAR
res.json({
  usuario: {
    valor: descriptografarSeNecessario(usuario.valorCipher)  // ✅ Descriptografado
    // NUNCA retornar: usuario.valorCipher
  }
});
```

---

## 🔍 Como Buscar Dados Criptografados

### ✅ CORRETO
```javascript
// Usar ÍNDICE HMAC (determinístico)
const usuario = await prisma.usuario.findFirst({
  where: {
    emailIndex: criarIndice(emailBuscado)  // ✅ Sempre retorna mesmo hash
  }
});
```

### ❌ ERRADO
```javascript
// NÃO fazer isto (não funciona!)
const usuario = await prisma.usuario.findFirst({
  where: {
    emailCipher: criptografar(emailBuscado)  // ❌ IV aleatório = hash diferente
  }
});
```

---

## 🎭 Máscaras - Quando Usar

| Campo | Pública | Máscara | Exemplo |
|-------|---------|---------|---------|
| Nome em Avaliação | ✅ SIM | Sim | "Cliente #a1b2c3" |
| Email em Avaliação | ❌ NÃO | N/A | Nunca expor |
| Endereço em Loja | ✅ SIM | Sim | "Rua das Flores" (sem número) |
| GPS da Loja | ✅ SIM | Sim | Arredondar p/ 2 decimais |
| Comentário Avaliação | ✅ SIM | Sim | Remover emails/telefones |
| Dados em /admin | ❌ NÃO | Não | Completos (descriptografados) |

---

## 📊 Sensibilidade por Tipo

```
┌──────────────────────┬───────────────┬──────────────────────┐
│ Tipo de Dado         │ Sensibilidade │ Proteção             │
├──────────────────────┼───────────────┼──────────────────────┤
│ Email/CPF/Telefone   │ 🔴 CRÍTICO    │ Criptografia + Índice│
│ Senha/Token          │ 🔴 CRÍTICO    │ Hash (não retornar)  │
│ Notas de Agendamento │ 🔴 CRÍTICO    │ Criptografia         │
│ Motivo de Denúncia   │ 🔴 CRÍTICO    │ Criptografia + Índice│
│                      │               │                      │
│ Dados de Loja (Dono) │ 🟠 ALTO      │ Autorização + Cript. │
│ Preços (Dono)        │ 🟠 ALTO      │ Autorização          │
│ Localização (GPS)    │ 🟠 ALTO      │ Máscaras + Arredondar│
│                      │               │                      │
│ Notas em Publicações │ 🟡 MÉDIO     │ Sanitização          │
│ Data/Hora            │ 🟡 MÉDIO     │ Autorização          │
│ Categoria            │ 🟡 MÉDIO     │ Nada (público)       │
│                      │               │                      │
│ Nome de Loja         │ 🟢 BAIXO     │ Público              │
│ Foto de Loja         │ 🟢 BAIXO     │ Público              │
│ Avaliações (notas)   │ 🟢 BAIXO     │ Público              │
└──────────────────────┴───────────────┴──────────────────────┘
```

---

## 🛠️ Funções Prontas para Usar

### Criptografar
```javascript
const { criptografar, descriptografar, criarIndice } = require("../utils/crypto");

// Criptografar
const emailEncrypted = criptografar("joao@email.com");
// → "base64_iv.base64_tag.base64_content"

// Índice para busca
const emailIndex = criarIndice("joao@email.com");
// → "a1b2c3d4e5f6..." (determinístico)

// Descriptografar
const emailOriginal = descriptografar(emailEncrypted);
// → "joao@email.com"
```

### Máscaras
```javascript
const { mascararNomeCliente, mascararEndereco, arredondarGPS, sanitizarTexto } 
  = require("../utils/masking");

// Mascarar nome
mascararNomeCliente("João Silva", 5);
// → "Cliente #a1b2c3"

// Mascarar endereço
mascararEndereco("Rua das Flores, 123");
// → "Rua das Flores"

// Arredondar GPS
arredondarGPS(-23.550520, -46.633309);
// → { latitude: -23.55, longitude: -46.63 }

// Sanitizar texto
sanitizarTexto("Me liga (11) 98765-4321 ou joao@email.com");
// → "Me liga [telefone oculto] ou [email oculto]"
```

### Audit
```javascript
const { registrarAudit } = require("../utils/audit");

await registrarAudit({
  acao: "READ",           // CREATE, READ, UPDATE, DELETE
  tabela: "agendamento",  // nome da tabela
  recordId: 123,          // ID do registro
  usuarioId: 5,           // Quem fez
  enderecoIp: "192.168.1.1",
  detalhes: { lojaId: 10 },
  sucesso: true,
  erro: null
});
```

---

## ✅ Checklist por Tipo de Endpoint

### Criar Novo Recurso (POST)
```
□ Validar entrada (length, format, type)
□ Verificar autorização
□ Criptografar dados CRÍTICOS
□ Criar índices HMAC se necessário
□ Registrar em audit log
□ Retornar apenas dados descriptografados
□ Nunca retornar IDs internos de outros usuários
```

### Buscar Recurso (GET)
```
□ Verificar autorização
□ Se busca por email/cpf: usar ÍNDICE, não cipher
□ Descriptografar dados antes de retornar
□ Aplicar máscaras se é listagem pública
□ Limitar resultados (take: 50)
□ Nunca expor IDs internos
□ Registrar em audit se acesso crítico
```

### Atualizar Recurso (PATCH/PUT)
```
□ Verificar autorização (só proprietário)
□ Validar novos dados
□ Se mudar dados críticos: recriar índices
□ Descriptografar antes de comparar com original
□ Registrar mudança em audit
□ Retornar apenas dados descriptografados
```

### Deletar Recurso (DELETE)
```
□ Verificar autorização (só proprietário/admin)
□ Registrar em audit (para histórico)
□ Opcionalmente: soft delete (marcar como deletado)
□ Considerar dados relacionados
□ Alertar usuário sobre exclusão irreversível
```

---

## 🚨 Red Flags - Sinais de Problema

### Código que levanta suspeita:
```javascript
// ❌ Retornar cipher na API
res.json({ emailCipher: usuario.emailCipher });

// ❌ Buscar usando cipher
where: { emailCipher: criptografar(email) }

// ❌ Não validar entrada
await prisma.usuario.create({ data: req.body });

// ❌ Expor ID interno de outro usuário
res.json({ usuarios: [...].map(u => ({ usuarioId: u.id })) });

// ❌ Sem autorização
const agendamento = await prisma.agendamento.findUnique(...);
res.json(agendamento);  // E se for de outro usuário?

// ❌ Sem audit log
await prisma.usuario.delete({ where: { id } });

// ❌ Dados sensíveis em logs
console.log("Email:", usuario.email);  // Pode expor em stack trace

// ❌ GPS exato em público
res.json({ latitude: -23.550520, longitude: -46.633309 });

// ❌ Email em comentário público
res.json({ comentarios: [{ texto, email: usuario.email }] });
```

---

## 📈 Progresso Visual

```
                Status Atual
┌───────────────────────────────────────────┐
│ Criptografia ████████████░░░░ 70%        │
│ Índices ██████░░░░░░░░░░░░░░░ 30%        │
│ Máscaras ░░░░░░░░░░░░░░░░░░░░░ 0%        │
│ Sanitização ░░░░░░░░░░░░░░░░░░░░░ 0%    │
│ Autorização █████████░░░░░░░░░░░ 60%    │
│ Rate Limiting ████████████████░░░░ 80% │
│ Headers █████████████████████░░ 85%    │
│ Audit ░░░░░░░░░░░░░░░░░░░░░ 0%        │
│ LGPD ██░░░░░░░░░░░░░░░░░░░░ 10%      │
│ Testes ░░░░░░░░░░░░░░░░░░░░░ 0%       │
└───────────────────────────────────────────┘

SCORE: 50.5% ⚠️
META:  95%+ ✅
```

---

## 📚 Como Encontrar Coisas

### Onde está a criptografia?
`src/utils/crypto.js` - Função `criptografar()` e `descriptografar()`

### Onde estão as máscaras?
`src/utils/masking.js` - (CRIAR NOVO) Funções de masking

### Onde está o audit?
`src/utils/audit.js` - (CRIAR NOVO) Função `registrarAudit()`

### Onde está a autorização?
`src/middlewares/auth.js` - `autenticarUsuario()`, `autenticarDono()`, `autenticarAdmin()`

### Onde estão as rotas?
`src/routes/` - Cada arquivo é um recurso (usuarios, agendamentos, etc)

### Onde estão os testes?
`tests/` - (CRIAR NOVO) Testes de segurança

### Onde estão as migrações?
`prisma/migrations/` - Histórico de mudanças no banco

---

## 🎓 Conceitos-Chave

### Criptografia Simétrica (AES-256-GCM)
- **O quê**: Codificar dados com uma chave
- **Como**: `criptografar("texto")` → "base64_iv.tag.content"
- **Quando**: Dados pessoais (email, CPF, telefone, senhas)
- **Vantagem**: Rápido, reversível (pode descriptografar)
- **Desvantagem**: Se perder chave, perde dados; se chave vazar, compromete tudo

### Índices HMAC (Hash-based Message Authentication Code)
- **O quê**: Hash determinístico de um valor
- **Como**: `criarIndice("texto")` → "a1b2c3d4..." (sempre igual)
- **Quando**: Precisa buscar dados criptografados
- **Vantagem**: Seguro para busca, não pode descriptografar para trás
- **Desvantagem**: Apenas para igualdade, não funciona com "começa com"

### Hash (SHA-256, Bcrypt)
- **O quê**: Transformação irreversível de um valor
- **Como**: `bcrypt.hash("senha", 10)` → hash único
- **Quando**: Senhas, tokens de segurança
- **Vantagem**: Irreversível (não pode descriptografar)
- **Desvantagem**: Não pode usar para buscar

### Máscaras
- **O quê**: Mostrar valor parcial ou transformado
- **Como**: "João Silva" → "Cliente #a1b2c3"
- **Quando**: Dados públicos que expõem identidade
- **Vantagem**: Mantém privacidade, permite moderação
- **Desvantagem**: Usuário não vê seu próprio nome completo (às vezes)

### Sanitização
- **O quː**: Remover dados sensíveis de texto
- **Como**: "Liga (11) 98765-4321" → "Liga [telefone oculto]"
- **Quando**: Comentários, reviews, texto livre
- **Vantagem**: Evita exposição acidental de contato
- **Desvantagem**: Pode remover informações legítimas

---

## 🆘 Preciso de Ajuda Com...

### "Como criptografar um campo?"
→ Ver `PRACTICAL_EXAMPLES.md` - Seção 1

### "Como buscar um valor criptografado?"
→ Ver `PRACTICAL_EXAMPLES.md` - Seção 2

### "Como aplicar máscaras?"
→ Ver `PRACTICAL_EXAMPLES.md` - Seção 3

### "Como fazer endpoint protegido?"
→ Ver `PRACTICAL_EXAMPLES.md` - Seção 4

### "Quais são os riscos?"
→ Ver `README_SECURITY.md` - Seção "Riscos de Segurança"

### "Qual é o roadmap?"
→ Ver `SECURITY_MATRIX.md` - Seção "Plano por Fase"

### "Preciso entender tudo?"
→ Leia na ordem: 1. README_SECURITY.md 2. DATA_CLASSIFICATION.md 3. IMPLEMENTATION_GUIDE.md

---

**Última atualização**: 2026-09-21
**Versão**: 1.0
**Tempo de Leitura**: ~5 minutos

👉 **Imprima este documento!** Mantenha na mesa enquanto desenvolve.
