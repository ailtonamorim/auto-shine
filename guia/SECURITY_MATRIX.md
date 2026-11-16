# Matriz de Proteção de Dados - Auto Shine

## 📊 Tabela Comparativa Rápida

```
┌─────────────────────────────┬──────────────────┬────────────────────────────┬─────────────────┐
│ Modelo / Campo              │ Sensibilidade    │ Proteção Recomendada       │ Status          │
├─────────────────────────────┼──────────────────┼────────────────────────────┼─────────────────┤
│ USUARIO                     │                  │                            │                 │
│  └─ id                      │ BAIXO            │ Autorização                │ ✅ OK           │
│  └─ nome                    │ MÉDIO            │ Máscaras em listagens      │ ⚠️ MELHORAR     │
│  └─ email                   │ CRÍTICO          │ Criptografia + Índice      │ ✅ OK           │
│  └─ cpf                     │ CRÍTICO          │ Criptografia + Índice      │ ✅ OK           │
│  └─ telefone                │ ALTO             │ Criptografia + Índice      │ ⚠️ FALTA ÍNDICE │
│  └─ senha                   │ CRÍTICO          │ Bcrypt Hash                │ ✅ OK           │
│  └─ googleId                │ CRÍTICO          │ Criptografia + Índice      │ ✅ OK           │
│  └─ resetToken              │ CRÍTICO          │ Hash SHA-256               │ ✅ OK           │
│                             │                  │                            │                 │
│ DONO                        │                  │                            │                 │
│  └─ id                      │ BAIXO            │ Autorização                │ ✅ OK           │
│  └─ email                   │ CRÍTICO          │ Criptografia + Índice      │ ✅ OK           │
│  └─ cnpj                    │ CRÍTICO          │ Criptografia + Índice      │ ✅ OK           │
│  └─ senha                   │ CRÍTICO          │ Bcrypt Hash                │ ✅ OK           │
│  └─ googleId                │ CRÍTICO          │ Criptografia + Índice      │ ✅ OK           │
│                             │                  │                            │                 │
│ LOJA                        │                  │                            │                 │
│  └─ id                      │ BAIXO            │ Pública                    │ ✅ OK           │
│  └─ endereco                │ MÉDIO            │ Máscaras                   │ ⚠️ SEM MÁSCARA  │
│  └─ latitude/longitude      │ MÉDIO            │ Arredondar (2 casas)       │ ⚠️ SEM ARREDOND │
│  └─ precoMedio              │ MÉDIO            │ Apenas dono visualiza      │ ⚠️ VALIDAR      │
│  └─ donoId                  │ MÉDIO            │ Nunca expor público        │ ⚠️ RISCO        │
│  └─ bloqueado               │ MÉDIO            │ Autorização admin          │ ✅ OK           │
│                             │                  │                            │                 │
│ AGENDAMENTO                 │                  │                            │                 │
│  └─ notas                   │ CRÍTICO          │ Criptografia               │ ✅ OK           │
│  └─ nomeCliente             │ CRÍTICO          │ Criptografia + Índice      │ ⚠️ FALTA ÍNDICE │
│  └─ emailCliente            │ CRÍTICO          │ Criptografia + Índice      │ ⚠️ FALTA ÍNDICE │
│  └─ veiculo                 │ MÉDIO            │ Criptografia/Autorização   │ ⚠️ REVISAR      │
│  └─ data/hora               │ MÉDIO            │ Autorização                │ ✅ OK           │
│  └─ status                  │ MÉDIO            │ Autorização                │ ✅ OK           │
│  └─ usuarioId               │ MÉDIO            │ Autorização                │ ✅ OK           │
│                             │                  │                            │                 │
│ AVALIACAO                   │                  │                            │                 │
│  └─ nota                    │ BAIXO            │ Pública                    │ ✅ OK           │
│  └─ comentario              │ MÉDIO            │ Sanitizar + Moderar        │ ⚠️ SEM SANIT.   │
│  └─ nomeCliente             │ MÉDIO            │ Máscaras em público        │ ⚠️ SEM MÁSCARA  │
│  └─ usuarioId               │ ALTO             │ Nunca expor público        │ ✅ OK           │
│  └─ aprovado                │ MÉDIO            │ Novo campo (moderação)     │ ⚠️ NÃO EXISTE   │
│                             │                  │                            │                 │
│ DENUNCIA                    │                  │                            │                 │
│  └─ tipo                    │ MÉDIO            │ Autorização admin          │ ✅ OK           │
│  └─ motivo                  │ CRÍTICO          │ Criptografia + Índice      │ ⚠️ FALTA CIPHER │
│  └─ detalhes                │ CRÍTICO          │ Criptografia               │ ✅ OK           │
│  └─ usuarioId               │ CRÍTICO          │ Ocultar/Hash (anônimo)     │ ⚠️ EXPOSTO      │
│  └─ anonymo                 │ MÉDIO            │ Novo campo                 │ ⚠️ NÃO EXISTE   │
│                             │                  │                            │                 │
│ FAVORITO                    │                  │                            │                 │
│  └─ usuarioId               │ ALTO             │ Autorização                │ ✅ OK           │
│  └─ lojaId                  │ BAIXO            │ Pública                    │ ✅ OK           │
└─────────────────────────────┴──────────────────┴────────────────────────────┴─────────────────┘

Legenda:
✅ OK        = Implementado e funcionando
⚠️ MELHORAR  = Implementado mas precisa melhorias
⚠️ FALTA     = Não implementado, precisa adicionar
```

---

## 🎯 Prioridades de Implementação

### 🔴 CRÍTICO (Implementar IMEDIATAMENTE)
1. **Adicionar `telefoneIndex`** ao Usuario (índice HMAC)
2. **Adicionar `motivoCipher` + `motivoIndex`** à Denuncia
3. **Adicionar `emailClienteIndex`** ao Agendamento
4. **Adicionar `nomeClienteIndex`** ao Agendamento
5. **Nunca expor `donoId`** em listagens públicas

**Impacto**: Segurança de dados críticos, conformidade LGPD

### 🟠 ALTO (Implementar em 1-2 semanas)
1. Implementar máscaras em Avaliação (nomeCliente)
2. Sanitizar comentários em Avaliação
3. Criar endpoint protegido para dados sensíveis de Loja
4. Adicionar arredondamento de GPS
5. Criar audit log para acessos críticos

**Impacto**: Privacidade de usuários, prevenção de vazamento de dados

### 🟡 MÉDIO (Implementar em 1 mês)
1. Adicionar campo `aprovado` em Avaliação (moderação)
2. Adicionar campo `anonymo` em Denuncia
3. Implementar rotate de chave de criptografia
4. Criar dashboard de audit logs
5. Testes de segurança (OWASP Top 10)

**Impacto**: Conformidade legal, qualidade de dados

---

## 📋 Plano de Implementação por Fase

### FASE 1: SEMANA 1 (Índices e Criptografia)

#### 1.1 - Modificação de Schema
```bash
# Tempo estimado: 30 minutos
# Arquivos: prisma/schema.prisma
# Mudanças:
#   - Adicionar telefoneIndex a Usuario
#   - Adicionar emailClienteIndex a Agendamento
#   - Adicionar nomeClienteIndex a Agendamento
#   - Adicionar motivoCipher e motivoIndex a Denuncia
#   - Adicionar anonymo a Denuncia
#   - Adicionar aprovado a Avaliacao
```

#### 1.2 - Migração Prisma
```bash
# Tempo estimado: 5 minutos
npx prisma migrate dev --name add_missing_protection_fields

# Validar em database:
npx prisma studio
```

#### 1.3 - Script de Migração de Dados
```bash
# Tempo estimado: 1 hora
# Arquivo: scripts/migrar-dados-sensiveis-fase2.js
# Ações:
#   - Calcular índices para telefone existentes
#   - Calcular índices para emailCliente existentes
#   - Calcular índices para nomeCliente existentes
#   - Criptografar motivo em denúncias
npm run migrate:sensitive-data-phase2
```

#### 1.4 - Atualizar Rotas
```bash
# Tempo estimado: 2 horas
# Arquivos:
#   - src/routes/auth.js (criar usuario/dono com índices)
#   - src/routes/agendamentos.js (criar agendamento com índices)
#   - src/routes/denuncias.js (criptografar motivo)
# Testes: npm test -- routes/
```

#### 1.5 - Testes
```bash
# Tempo estimado: 1 hora
# Validar:
#   - Criar usuario com telefone -> verificar índice criado
#   - Buscar usuario por telefone -> usar índice
#   - Criar agendamento -> verificar índices
#   - Criar denúncia -> verificar criptografia
npm test
```

**Total Fase 1: ~5-6 horas**

---

### FASE 2: SEMANA 2 (Máscaras e Sanitização)

#### 2.1 - Criar utilitário de máscaras
```bash
# Tempo estimado: 1 hora
# Arquivo: src/utils/masking.js
# Funções:
#   - mascararNomeCliente()
#   - mascararEndereco()
#   - arredondarGPS()
#   - sanitizarTexto()
```

#### 2.2 - Atualizar rotas de listagem pública
```bash
# Tempo estimado: 2 horas
# Arquivos:
#   - src/routes/lojas.js (GET /) - arredondar GPS, mascarar endereco
#   - src/routes/avaliacoes.js (GET /:lojaId) - mascarar nome, sanitizar comentário
#   - src/routes/favoritos.js - nunca expor lista de outros usuários
# Testes: npm test -- routes/
```

#### 2.3 - Testes de máscaras
```bash
# Tempo estimado: 1 hora
# Validações:
#   - Nomes mascarados em avaliações
#   - Endereços sem número
#   - GPS com 2 casas decimais
#   - Emails removidos de comentários
npm test
```

**Total Fase 2: ~4 horas**

---

### FASE 3: SEMANA 3 (Audit e Segurança)

#### 3.1 - Criar modelo AuditLog
```bash
# Tempo estimado: 30 minutos
# Arquivo: prisma/schema.prisma
# Executar: npx prisma migrate dev --name add_audit_log
```

#### 3.2 - Implementar utilitário de audit
```bash
# Tempo estimado: 1 hora
# Arquivo: src/utils/audit.js
# Função: registrarAudit()
```

#### 3.3 - Adicionar registro de audit às rotas críticas
```bash
# Tempo estimado: 2 horas
# Arquivos a atualizar:
#   - src/routes/agendamentos.js
#   - src/routes/denuncias.js
#   - src/routes/avaliacoes.js
#   - src/middlewares/auth.js (logins)
# Testes: npm test
```

#### 3.4 - Dashboard de audit logs
```bash
# Tempo estimado: 2 horas
# Arquivo: src/routes/admin.js
# Endpoint: GET /admin/audit
# Filtros: data, acao, tabela, usuarioId
```

**Total Fase 3: ~5.5 horas**

---

### FASE 4: SEMANA 4 (Testes e Deploy)

#### 4.1 - Testes unitários
```bash
# Tempo estimado: 2 horas
# Arquivos:
#   - tests/utils/crypto.test.js
#   - tests/utils/masking.test.js
#   - tests/utils/audit.test.js
npm test
```

#### 4.2 - Testes de integração
```bash
# Tempo estimado: 2 horas
# Endpoints críticos:
#   - Criar usuario com todos os campos
#   - Criar agendamento com notas sensíveis
#   - Criar denúncia anônima
#   - Listar avaliações (mascaradas)
npm test:integration
```

#### 4.3 - Testes de segurança
```bash
# Tempo estimado: 2 horas
# Validações:
#   - Não expor dados criptografados em resposta
#   - Não expor IDs internos (usuarioId, donoId)
#   - Rate limiting em endpoints críticos
#   - Verificar headers de segurança
npm run security:test
```

#### 4.4 - Deploy
```bash
# Deploy em staging
git push staging main
# Testes em staging por 24 horas

# Deploy em produção (canário)
# Deploy para 10% de usuários por 24 horas

# Deploy completo
# Monitorar logs por 7 dias
```

**Total Fase 4: ~6-8 horas**

---

## 🔐 Conformidade Legal (LGPD)

### Artigo 1: Definição de Dados Pessoais
```
✅ IMPLEMENTADO:
  - Identificar e categorizar dados pessoais (PII)
  - Aplicar proteção apropriada por nível
  - Manter registro de processamento
```

### Artigo 5: Fundamentos
```
✅ EM PROGRESSO:
  - [x] Necessidade: Justificado o uso
  - [x] Finalidade: Explícito em coleta
  - [x] Minimização: Coletar o mínimo necessário
  - [ ] Exatidão: Manter dados corretos e atualizados
  - [x] Segurança: Criptografia + Autorização
  - [ ] Transparência: Política de privacidade clara
```

### Artigo 6: Direitos do Titular
```
⚠️ PRECISA:
  - [ ] Direito de acesso (GET /meus-dados)
  - [ ] Direito de correção (PATCH /meus-dados)
  - [ ] Direito ao esquecimento (DELETE /meus-dados)
  - [ ] Direito de portabilidade (EXPORT /meus-dados)
  - [ ] Direito de oposição (BLOCK /agendamentos)
```

### Artigo 7: Consentimento
```
✅ IMPLEMENTADO:
  - [x] Solicitar consentimento explícito
  - [x] Armazenar comprovante de consentimento
  - [ ] Permitir revogação de consentimento
```

### Artigo 9: Dados Sensíveis
```
🔴 CRÍTICO:
  - Não coletar dados de saúde, raça, religião
  - Email/Telefone requerem consentimento expresso
  - Criptografar se coletado
```

---

## 🛡️ Checklist de Segurança

### Autenticação
```
✅ IMPLEMENTADO:
  - [x] Bcrypt para senhas
  - [x] JWT para sessão
  - [x] OAuth Google
  - [x] Rate limiting (30 tentativas/15min)
  - [x] Tokens com expiração
  - [ ] 2FA (Autenticação de Dois Fatores)
  - [ ] Session timeout
```

### Autorização
```
✅ IMPLEMENTADO:
  - [x] Middleware de autenticação em rotas protegidas
  - [x] Verificar propriedade de recursos
  - [x] Separação de papéis (Usuario, Dono, Admin)
  - [ ] RBAC granular (Role-Based Access Control)
  - [ ] ABAC (Attribute-Based Access Control)
```

### Criptografia
```
✅ IMPLEMENTADO:
  - [x] AES-256-GCM para dados em repouso
  - [x] HTTPS para dados em trânsito
  - [x] HMAC para índices de busca
  - [ ] TLS 1.3 mínimo
  - [ ] Rotação de chaves (anual)
```

### Validação
```
✅ IMPLEMENTADO:
  - [x] Validar entrada (length, format, type)
  - [x] Sanitizar para SQL injection
  - [ ] Validar saída (não expor dados internos)
  - [ ] Proteção contra XSS
  - [ ] Proteção contra CSRF
```

### Auditoria
```
⚠️ EM PROGRESSO:
  - [x] Rate limiting (uso)
  - [ ] Audit log (quem, quando, o quê)
  - [ ] Alertas de acesso anormal
  - [ ] Retenção de logs (90 dias?)
```

### OWASP Top 10 2021

```
A01 - Broken Access Control
  Status: ✅ EM PROGRESSO
  Ações:
    - [x] Autorização em rotas
    - [x] Verificar propriedade
    - [ ] Testes de autorização

A02 - Cryptographic Failures
  Status: ✅ IMPLEMENTADO
  Ações:
    - [x] AES-256-GCM
    - [x] HTTPS
    - [x] Hashing de senhas

A03 - Injection
  Status: ✅ PREVENIDO
  Ações:
    - [x] Usar Prisma (prepared statements)
    - [x] Validar entrada
    - [x] Não concatenar SQL

A04 - Insecure Design
  Status: ✅ DESIGN SEGURO
  Ações:
    - [x] Threat modeling
    - [x] Minimização de dados
    - [x] Separação de papéis

A05 - Security Misconfiguration
  Status: ⚠️ EM PROGRESSO
  Ações:
    - [x] Headers de segurança
    - [x] Variáveis de ambiente
    - [ ] Desabilitar features desnecessárias
    - [ ] Testes de configuração

A06 - Vulnerable & Outdated Components
  Status: ✅ EM PROGRESSO
  Ações:
    - [x] npm audit
    - [x] Updates regulares
    - [ ] SCA (Software Composition Analysis)

A07 - Authentication Failures
  Status: ✅ IMPLEMENTADO
  Ações:
    - [x] Senhas fortes (Bcrypt)
    - [x] JWT com expiração
    - [x] Rate limiting

A08 - Software & Data Integrity Failures
  Status: ⚠️ EM PROGRESSO
  Ações:
    - [x] HTTPS
    - [ ] Assinatura de código
    - [ ] Verificação de integridade

A09 - Logging & Monitoring Failures
  Status: ⚠️ EM PROGRESSO
  Ações:
    - [ ] Audit log
    - [ ] Monitoramento
    - [ ] Alertas

A10 - SSRF (Server-Side Request Forgery)
  Status: ✅ PREVENIDO
  Ações:
    - [x] Validar URLs
    - [x] Whitelist de domínios
```

---

## 📊 KPIs de Segurança

### Monitorar Continuamente
```
1. Taxa de Exposição de Dados
   - Meta: 0% de exposição
   - Método: Testes de security scanning mensais

2. Tempo de Detecção
   - Meta: < 1 hora para anomalia
   - Método: Monitoramento de audit logs

3. Cobertura de Criptografia
   - Meta: 100% de dados críticos/altos
   - Método: Verificação de schema

4. Falhas de Autenticação
   - Meta: < 1% de taxa de erro legítimo
   - Método: Monitoramento de logs

5. Conformidade LGPD
   - Meta: 100% de conformidade
   - Método: Auditorias trimestrais
```

---

## 🚀 Roadmap de Segurança (6 meses)

### Mês 1-2: Fundação
- [x] Classificação de dados
- [ ] Índices e criptografia
- [ ] Máscaras e sanitização

### Mês 3: Operacional
- [ ] Audit logs
- [ ] Monitoramento
- [ ] Testes de segurança

### Mês 4: Conformidade
- [ ] LGPD compliance
- [ ] Direitos do titular
- [ ] Política de privacidade

### Mês 5: Detecção
- [ ] Anomaly detection
- [ ] Alertas em tempo real
- [ ] Dashboards

### Mês 6: Manutenção
- [ ] Rotação de chaves
- [ ] Atualizações de dependências
- [ ] Testes de penetração

---

## 📞 Contato e Suporte

**Responsável por Segurança**: [Nome]
**Email**: security@auto-shine.com
**Telefone**: [Número]
**Horário**: 9h-18h (seg-sex)

---

**Documento gerado em**: 2026-09-21
**Última atualização**: 2026-09-21
**Próxima revisão**: 2026-10-21
**Status**: APROVADO PARA IMPLEMENTAÇÃO
