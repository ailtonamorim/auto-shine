# Classificação de Dados por Sensibilidade - Auto Shine

## 📋 Resumo Executivo

Este documento classifica todos os dados do sistema Auto Shine por nível de sensibilidade e define as estratégias de proteção apropriadas para cada tipo.

---

## 🔐 Níveis de Sensibilidade

### **CRÍTICO** (Crítico)
- **Definição**: Dados cuja exposição causa danos legais, financeiros ou à reputação graves
- **Proteção**: Criptografia AES-256-GCM obrigatória + Autorização
- **Acesso**: Restrito a usuário proprietário/admin
- **Audit**: Registro de todos os acessos

### **ALTO** (Alta)
- **Definição**: Dados pessoais ou financeiros que requerem proteção legal (LGPD)
- **Proteção**: Criptografia AES-256-GCM + Autorização + Índices HMAC para busca
- **Acesso**: Apenas usuário autenticado (proprietário do dado ou admin)
- **Audit**: Registro de leitura/modificação

### **MÉDIO** (Média)
- **Definição**: Dados que podem identificar indiretamente uma pessoa ou conter informações comerciais sensíveis
- **Proteção**: Máscaras/Ocultar para exibição + Autorização
- **Acesso**: Usuário autenticado com permissão específica
- **Audit**: Registro de acessos anormais

### **BAIXO** (Baixa)
- **Definição**: Dados públicos ou não-sensíveis
- **Proteção**: Apenas Autorização de acesso básica
- **Acesso**: Usuários autenticados ou públicos conforme contexto
- **Audit**: Não requerido

---

## 📊 Classificação por Modelo de Dados

### **Modelo: Usuario (Usuários - Clientes)**

| Campo | Sensibilidade | Tipo | Proteção | Status Atual | Obs |
|-------|---|---|---|---|---|
| `id` | BAIXO | ID Único | Autorização | ✅ | ID interno seguro |
| `nome` | MÉDIO | Identificação | Máscaras em listagens | ⚠️ | Mostrar parcialmente em avaliações públicas |
| `email` | CRÍTICO | PII | **Criptografia AES-256-GCM** | ✅ | emailCipher + emailIndex (HMAC) |
| `cpf` | CRÍTICO | PII | **Criptografia AES-256-GCM** | ✅ | cpfCipher + cpfIndex (HMAC) |
| `telefone` | ALTO | PII | **Criptografia AES-256-GCM** | ⚠️ | telefoneCipher implementado, falta Index |
| `senha` | CRÍTICO | Hash | **Bcrypt** | ✅ | Nunca armazenar plaintext |
| `googleId` | CRÍTICO | OAuth | **Criptografia AES-256-GCM** | ✅ | googleIdCipher + googleIdIndex |
| `resetToken` | CRÍTICO | Token | **Hash SHA-256** | ✅ | resetTokenHash (nunca plaintext) |
| `resetTokenExpiry` | MÉDIO | Data | Autorização | ✅ | Apenas proprietário acessa |
| `createdAt` | BAIXO | Timestamp | Autorização | ✅ | Pode ser público |
| `agendamentos` | ALTO | Relação | Herda proteção | ✅ | Acessível apenas para proprietário |

**Recomendações:**
- ✅ Implementar índice HMAC para `telefone` (campo `telefoneIndex`)
- ✅ Garantir que buscas de email/telefone usem apenas índices, nunca dado criptografado

---

### **Modelo: Dono (Proprietários de Lojas)**

| Campo | Sensibilidade | Tipo | Proteção | Status Atual | Obs |
|-------|---|---|---|---|---|
| `id` | BAIXO | ID Único | Autorização | ✅ | ID interno seguro |
| `nome` | MÉDIO | Identificação | Autorização | ⚠️ | Público na loja, protegido para admin |
| `login` | MÉDIO | Identificação | Autorização | ⚠️ | Não deve ser exposto na API |
| `email` | CRÍTICO | PII | **Criptografia AES-256-GCM** | ✅ | emailCipher + emailIndex |
| `cnpj` | CRÍTICO | PII | **Criptografia AES-256-GCM** | ✅ | cnpjCipher + cnpjIndex |
| `senha` | CRÍTICO | Hash | **Bcrypt** | ✅ | Nunca armazenar plaintext |
| `googleId` | CRÍTICO | OAuth | **Criptografia AES-256-GCM** | ✅ | googleIdCipher + googleIdIndex |
| `resetToken` | CRÍTICO | Token | **Hash SHA-256** | ✅ | resetTokenHash |
| `resetTokenExpiry` | MÉDIO | Data | Autorização | ✅ | Apenas proprietário |
| `createdAt` | BAIXO | Timestamp | Autorização | ✅ | Pode ser público |
| `lojas` | MÉDIO | Relação | Herda proteção | ✅ | Apenas dono acessa |

**Recomendações:**
- ✅ Status de implementação está excelente
- ✅ Manter proteção rigorosa para credenciais

---

### **Modelo: Loja (Estabelecimentos)**

| Campo | Sensibilidade | Tipo | Proteção | Status Atual | Obs |
|-------|---|---|---|---|---|
| `id` | BAIXO | ID Único | Públca | ✅ | Identificador público |
| `nome` | BAIXO | Nome | Pública | ✅ | Visível em listagens e mapas |
| `descricao` | BAIXO | Texto | Pública | ✅ | Conteúdo público da loja |
| `endereco` | MÉDIO | Localização | Pública com restrição | ✅ | Público, mas com cuidado em apps de mapa |
| `latitude` | MÉDIO | Localização | Pública com restrição | ✅ | Expor com precisão limitada |
| `longitude` | MÉDIO | Localização | Pública com restrição | ✅ | Expor com precisão limitada |
| `precoMedio` | MÉDIO | Comercial | Autorização | ⚠️ | Apenas dono visualiza dados detalhados |
| `categoria` | BAIXO | Classificação | Pública | ✅ | Metadado público |
| `fotoUrl` | BAIXO | Mídia | Pública | ✅ | Foto de perfil pública |
| `capaUrl` | BAIXO | Mídia | Pública | ✅ | Foto de capa pública |
| `fotosAdicionais` | BAIXO | Mídia | Pública | ✅ | Galeria de fotos pública |
| `formasPagamento` | MÉDIO | Comercial | Pública | ✅ | Informação útil publicamente |
| `politicaCancelamento` | MÉDIO | Comercial | Pública | ✅ | Política publicamente acessível |
| `agendaDias` | MÉDIO | Comercial | Pública | ✅ | Dias de funcionamento públicos |
| `agendaHorarios` | MÉDIO | Comercial | Pública | ✅ | Horários públicos |
| `bloqueado` | MÉDIO | Status | Autorização | ⚠️ | Apenas admin vê motivo do bloqueio |
| `donoId` | MÉDIO | FK | Autorização | ⚠️ | Não expor em listagens públicas |
| `createdAt` | BAIXO | Timestamp | Pública | ✅ | Pode ser público |
| `updatedAt` | BAIXO | Timestamp | Pública | ✅ | Pode ser público |

**Recomendações:**
- ⚠️ Implementar máscara de endereço (mostrar rua, não número exato)
- ⚠️ Arredondar latitude/longitude para 2 casas decimais (precisão de ~1km)
- ⚠️ Nunca expor `donoId` em respostas de API para usuários normais
- ✅ Criar endpoint separado para dados sensíveis (apenas dono acessa)

---

### **Modelo: ServicoLoja (Serviços Oferecidos)**

| Campo | Sensibilidade | Tipo | Proteção | Status Atual | Obs |
|-------|---|---|---|---|---|
| `id` | BAIXO | ID | Pública | ✅ | Identificador de serviço |
| `nome` | BAIXO | Texto | Pública | ✅ | Nome do serviço |
| `descricao` | BAIXO | Texto | Pública | ✅ | Descrição pública |
| `preco` | MÉDIO | Comercial | Pública | ✅ | Preço visível publicamente |
| `duracao` | BAIXO | Texto | Pública | ✅ | Tempo de serviço público |
| `lojaId` | MÉDIO | FK | Autorização | ✅ | Relacionado à loja |
| `createdAt` | BAIXO | Timestamp | Pública | ✅ | Público |

**Status:** ✅ Adequado

---

### **Modelo: Agendamento (Reservas)**

| Campo | Sensibilidade | Tipo | Proteção | Status Atual | Obs |
|-------|---|---|---|---|---|
| `id` | BAIXO | ID | Autorização | ✅ | ID de agendamento |
| `data` | MÉDIO | Data | Autorização | ✅ | Apenas proprietário/cliente veem |
| `hora` | MÉDIO | Hora | Autorização | ✅ | Apenas proprietário/cliente veem |
| `veiculo` | MÉDIO | Tipo | Autorização | ✅ | Info do veículo do cliente |
| `notas` | CRÍTICO | Texto livre | **Criptografia AES-256-GCM** | ✅ | notasCipher implementado |
| `status` | MÉDIO | Estado | Autorização | ✅ | Apenas proprietário/cliente veem |
| `nomeCliente` | CRÍTICO | PII | **Criptografia AES-256-GCM** | ✅ | nomeClienteCipher implementado |
| `emailCliente` | CRÍTICO | PII | **Criptografia AES-256-GCM** | ✅ | emailClienteCipher implementado |
| `usuarioId` | MÉDIO | FK | Autorização | ✅ | Apenas proprietário/cliente acessa |
| `lojaId` | MÉDIO | FK | Autorização | ✅ | Vinculado à loja |
| `servicoId` | MÉDIO | FK | Autorização | ✅ | Vinculado ao serviço |
| `createdAt` | MÉDIO | Timestamp | Autorização | ✅ | Apenas proprietário/cliente veem |

**Recomendações:**
- ✅ Implementação está EXCELENTE
- ⚠️ Adicionar índice HMAC para `emailCliente` (emailClienteIndex) se precisar buscar por email
- ⚠️ Adicionar índice HMAC para `nomeCliente` (nomeClienteIndex) se precisar buscar por nome

---

### **Modelo: Avaliacao (Reviews)**

| Campo | Sensibilidade | Tipo | Proteção | Status Atual | Obs |
|-------|---|---|---|---|---|
| `id` | BAIXO | ID | Pública | ✅ | ID de avaliação |
| `nota` | BAIXO | Número | Pública | ✅ | Avaliação numérica pública |
| `comentario` | MÉDIO | Texto | Pública com restrição | ⚠️ | Pode conter PII, deve ser moderado |
| `fotoUrl` | BAIXO | Mídia | Pública | ✅ | Foto de avaliação pública |
| `nomeCliente` | MÉDIO | PII | **Máscara/Criptografia** | ⚠️ | Se público, usar "Cliente_XXXXX" |
| `usuarioId` | ALTO | FK | Autorização | ✅ | Apenas admin/proprietário veem |
| `lojaId` | BAIXO | FK | Pública | ✅ | Identificador público da loja |
| `agendamentoId` | ALTO | FK | Autorização | ✅ | Relação interna |
| `createdAt` | BAIXO | Timestamp | Pública | ✅ | Data pública |

**Recomendações:**
- ⚠️ Implementar máscara para `nomeCliente`: "Cliente #[ID]" em exibições públicas
- ⚠️ Implementar filtro de conteúdo para `comentario` (remover emails, telefones, etc.)
- ⚠️ Adicionar campo `aprovado` (booleano) para moderação de comentários
- ✅ Nunca expor `usuarioId` em listagens públicas de avaliações

---

### **Modelo: Denuncia (Relatórios/Reports)**

| Campo | Sensibilidade | Tipo | Proteção | Status Atual | Obs |
|-------|---|---|---|---|---|
| `id` | BAIXO | ID | Autorização | ✅ | ID de denúncia |
| `tipo` | MÉDIO | Classificação | Autorização | ✅ | Apenas admin acessa |
| `motivo` | CRÍTICO | Descrição | **Criptografia AES-256-GCM** | ⚠️ | Pode conter PII, acusações |
| `detalhes` | CRÍTICO | Texto | **Criptografia AES-256-GCM** | ✅ | detalhesCipher implementado |
| `status` | MÉDIO | Estado | Autorização | ✅ | Apenas admin/denunciante veem |
| `usuarioId` | CRÍTICO | FK | **Criptografia** | ⚠️ | Identificação de denunciante (proteger) |
| `lojaId` | MÉDIO | FK | Autorização | ✅ | Loja denunciada |
| `avaliacaoId` | MÉDIO | FK | Autorização | ✅ | Avaliação denunciada |
| `agendamentoId` | MÉDIO | FK | Autorização | ✅ | Agendamento envolvido |
| `createdAt` | MÉDIO | Timestamp | Autorização | ✅ | Apenas admin/envolvidos |
| `updatedAt` | MÉDIO | Timestamp | Autorização | ✅ | Apenas admin/envolvidos |

**Recomendações:**
- ⚠️ **CRÍTICO**: Implementar criptografia para `motivo` (motivoCipher + motivoIndex)
- ⚠️ Proteger identidade do denunciante (usuarioId deve estar criptografado ou hasheado)
- ✅ Adicionar campo `anonymo` (booleano) para permitir denúncias anônimas
- ✅ `detalhesCipher` já está implementado ✅

---

### **Modelo: Favorito (Lojas Favoritas)**

| Campo | Sensibilidade | Tipo | Proteção | Status Atual | Obs |
|-------|---|---|---|---|---|
| `id` | BAIXO | ID | Autorização | ✅ | ID do favorito |
| `usuarioId` | ALTO | FK | Autorização | ✅ | Apenas usuário acessa |
| `lojaId` | BAIXO | FK | Pública | ✅ | Loja é pública |
| `createdAt` | MÉDIO | Timestamp | Autorização | ✅ | Apenas usuário acessa |

**Recomendações:**
- ✅ Status adequado
- ⚠️ Nunca expor lista de favoritos de um usuário para outros usuários

---

## 🔧 Estratégias de Proteção Implementadas

### 1️⃣ **Criptografia AES-256-GCM**
```javascript
// Arquivo: src/utils/crypto.js

✅ IMPLEMENTADO
- Usa IV aleatório (12 bytes)
- Usa GCM para autenticação
- Formato: "base64(iv).base64(tag).base64(conteúdo)"
- Chave: 32 bytes (256 bits) em base64

Campos Criptografados:
  • Usuario.emailCipher
  • Usuario.cpfCipher
  • Usuario.googleIdCipher
  • Usuario.telefoneCipher
  • Dono.emailCipher
  • Dono.cnpjCipher
  • Dono.googleIdCipher
  • Agendamento.notasCipher
  • Agendamento.nomeClienteCipher
  • Agendamento.emailClienteCipher
  • Denuncia.detalhesCipher
  • (FALTANDO) Denuncia.motivoCipher
```

### 2️⃣ **Índices HMAC (Buscas Seguras)**
```javascript
// Permitem buscar dados criptografados sem descriptografar

✅ IMPLEMENTADO
- Usa HMAC-SHA256
- Armazenado em campo separado com sufixo "Index"
- Nunca expor ao cliente

Campos com Índice:
  • emailIndex / email (Usuario, Dono)
  • cpfIndex / cpf (Usuario)
  • cnpjIndex / cnpj (Dono)
  • googleIdIndex / googleId (Usuario, Dono)
  • telefoneCipher (⚠️ FALTA telefoneIndex)
  • (FALTANDO) emailClienteIndex (Agendamento)
  • (FALTANDO) nomeClienteIndex (Agendamento)
```

### 3️⃣ **Hashing de Tokens (SHA-256)**
```javascript
// Tokens nunca armazenados em plaintext

✅ IMPLEMENTADO
- resetTokenHash (em vez de resetToken plaintext)
- Usa SHA-256
- Tokens únicos por usuário

Aplicação:
  • Password Reset Tokens
  • Session Tokens
  • OAuth Verification Tokens
```

### 4️⃣ **Hash de Senhas (Bcrypt)**
```javascript
// Senhas usando bcrypt com salt automático

✅ IMPLEMENTADO via Passport.js
- Salt padrão: 10 rounds
- Nunca armazenar plaintext

Campos:
  • Usuario.senha
  • Dono.senha
```

### 5️⃣ **Rate Limiting**
```javascript
// Arquivo: src/middlewares/security.js

✅ IMPLEMENTADO
- limitarAuth: 30 tentativas por 15 minutos
- limitarReset: 5 tentativas por 1 hora
- limitarUploads: 40 por 10 minutos
- limitarValidacoes: 60 por 10 minutos
```

### 6️⃣ **Headers de Segurança**
```javascript
✅ IMPLEMENTADO
- X-Content-Type-Options: nosniff (previne MIME sniffing)
- X-Frame-Options: DENY (previne clickjacking)
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: geolocation, camera, microphone desabilitados
```

### 7️⃣ **Autenticação JWT**
```javascript
// Arquivo: src/middlewares/auth.js

✅ IMPLEMENTADO
- JWT para usuarios (gerarTokenUsuario)
- JWT para donos (gerarTokenDono)
- Verificação em rotas protegidas
```

---

## 📋 Checklist de Implementação

### ✅ JÁ IMPLEMENTADO
- [x] Criptografia AES-256-GCM para PII crítica
- [x] Índices HMAC para busca segura (email, cpf, cnpj, googleId)
- [x] Hash de senhas com Bcrypt
- [x] Hash de tokens de reset com SHA-256
- [x] Rate limiting em autenticação
- [x] Headers de segurança
- [x] Autenticação JWT
- [x] Criptografia de dados em agendamentos
- [x] Criptografia de denúncias

### ⚠️ PRECISA DE MELHORIAS
- [ ] Adicionar `telefoneIndex` ao modelo Usuario (índice HMAC)
- [ ] Adicionar `emailClienteIndex` ao modelo Agendamento
- [ ] Adicionar `nomeClienteIndex` ao modelo Agendamento
- [ ] Implementar `motivoCipher` e `motivoIndex` no modelo Denuncia
- [ ] Implementar máscara de `nomeCliente` em Avaliacao (público)
- [ ] Implementar máscara de endereço em Loja
- [ ] Implementar arredondamento de GPS em Loja
- [ ] Adicionar moderação de comentários em Avaliacao
- [ ] Adicionar campo `anonymo` em Denuncia
- [ ] Adicionar campo `aprovado` em Avaliacao
- [ ] Nunca expor `donoId` em listagens públicas
- [ ] Nunca expor `usuarioId` em listagens públicas de avaliações
- [ ] Implementar audit log para acessos críticos

### 🔄 ROTINAS RECOMENDADAS
- [ ] Audit log de acessos a dados críticos
- [ ] Rotina de renovação de chave de criptografia (key rotation)
- [ ] Backup criptografado de dados sensíveis
- [ ] Monitoramento de acessos anormais
- [ ] LGPD compliance: direito ao esquecimento (data deletion)

---

## 🛡️ Recomendações de Segurança

### Acesso a Dados Críticos
1. **Sempre verificar autorização** antes de descriptor dados críticos
2. **Nunca expor dados criptografados** em respostas de API
3. **Logar acessos** a dados críticos para auditoria
4. **Rate limit** em endpoints de dados críticos

### Exposição de Dados em Listagens
1. Nunca retornar `donoId` para usuários normais
2. Nunca retornar `usuarioId` em avaliações públicas
3. Nunca retornar dados criptografados (sempre descriptografar)
4. Sempre mascarar nomes em avaliações públicas

### Validação e Sanitização
1. Validar todos os inputs antes de criptografar
2. Remover PII de textos livres (comentários, denúncias)
3. Usar allowlist para categorias, tipos, status

### Gerenciamento de Chaves
1. `DATA_ENCRYPTION_KEY` deve estar em variável de ambiente
2. Nunca fazer hardcode da chave
3. Rotacionar chaves periodicamente
4. Manter backup da chave de forma segura

---

## 📚 Referências Legais

### LGPD (Lei Geral de Proteção de Dados)
- **Consentimento**: Solicitar consentimento para processar PII
- **Direito ao esquecimento**: Permitir exclusão de dados
- **Portabilidade**: Permitir export de dados pessoais
- **Segurança**: Proteger com criptografia e acesso restrito

### OWASP Top 10
- A01: Broken Access Control
- A02: Cryptographic Failures
- A03: Injection
- A04: Insecure Design
- A05: Security Misconfiguration

---

## 📞 Próximos Passos

1. **Implementar mejorlas pendientes** conforme checklist acima
2. **Adicionar audit logs** para rastreamento de acessos críticos
3. **Documentar procedimentos** de resposta a incidentes
4. **Treinar equipe** em boas práticas de segurança
5. **Realizar teste de penetração** (pentest) regularmente

---

**Última atualização**: 2026-09-21
**Status**: Classificação completa com recomendações de implementação
**Próxima revisão**: 2026-10-21
