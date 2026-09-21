# AutoShine Marketplace

Marketplace responsivo para lava jatos e estética automotiva, com cadastro de clientes, parceiros, lojas, serviços, mapa, agendamentos, avaliações e painel admin.

## Tecnologias

- HTML5, CSS3 e JavaScript vanilla
- Node.js + Express
- Prisma + SQLite
- JWT para API autenticada
- Passport Google OAuth 2.0

## Telas

1. `index.html` - home com busca, categorias e lojas publicadas
2. `mapa.html` - mapa com estabelecimentos, filtros e rota
3. `perfil.html` - perfil real de uma loja via `shopId`
4. `agendamento.html` - criação de agendamento com disponibilidade
5. `meus-agendamentos.html` - histórico, reagendamento e cancelamento do cliente
6. `avaliacoes.html` - listagem e publicação de avaliações
7. `cadastro.html` - login/cadastro de cliente
8. `cadastro-dono.html` - login, cadastro e painel do parceiro
9. `admin.html` - painel administrativo
10. `termos.html` e `privacidade.html` - páginas legais básicas

## Configuração

Copie `.env.example` para `.env` e preencha:

```env
DATABASE_URL="file:./data/dev.db"
PORT=3000
SESSION_SECRET=troque-para-uma-chave-segura
JWT_SECRET=troque-para-uma-chave-jwt-segura
ADMIN_LOGIN=admin-local
ADMIN_SENHA=troque-esta-senha
GOOGLE_CLIENT_ID=seu-google-client-id
GOOGLE_CLIENT_SECRET=seu-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
SERPRO_CPF_API_URL=https://gateway.apiserpro.serpro.gov.br/sua-api-cpf/v1/cpf/{cpf}
SERPRO_CPF_BEARER_TOKEN=seu-token-serpro
SERPRO_CPF_CONSUMER_KEY=seu-consumer-key-serpro
SERPRO_CPF_CONSUMER_SECRET=seu-consumer-secret-serpro
SERPRO_CPF_TOKEN_URL=https://gateway.apiserpro.serpro.gov.br/token
GEOCODING_USER_AGENT="AutoShine Marketplace/1.0 contato@seudominio.com"
IMAGE_MODERATION_ENABLED=true
IMAGE_MODERATION_REQUIRED=false
IMAGE_MODERATION_API_URL=
IMAGE_MODERATION_API_TOKEN=
IMAGE_MODERATION_TIMEOUT_MS=8000
IMAGE_MODERATION_BLOCK_THRESHOLD=0.8
IMAGE_MODERATION_BLOCK_CATEGORIES=adult,nudity,porn,sexual,violence,gore,hate,self-harm,weapon,drugs,illegal,child-safety
IMAGE_MAX_PIXELS=25000000
```

## Comandos

```bash
npm install
npm run migrate
npm run seed
npm run dev
```

Acesse `http://localhost:3000`.

Para validar o projeto:

```bash
npm run check
```

## Seed

O seed cria lojas, serviços, avaliações, usuários demo e agendamentos de apresentação.

- Cliente: `cliente@autoshine.local` / `cliente123`
- O cliente demo possui agendamentos pendente, confirmado e finalizado para testar histórico e publicação de avaliação.
- Parceiros: senha `autoshine123` para `shine-centro`, `detalhe-premium`, `prime-car-care`, `fastwash-marista`, `eco-brilho`, `studio-vitrificacao`, `truck-clean` e `mall-auto-spa`

## Google OAuth

Crie credenciais OAuth no Google Cloud Console e cadastre a URI:

http://localhost:3000/auth/google/callback

O login Google de cliente cria/atualiza um `Usuario` real e entrega JWT para chamadas autenticadas. O login Google de parceiro cria/atualiza um `Dono` real.

## Validação de CPF

A rota `GET /api/validacoes/cpf/:cpf` valida os dígitos do CPF e, quando `SERPRO_CPF_API_URL` estiver configurada, consulta a API oficial Consulta CPF do SERPRO usando `SERPRO_CPF_BEARER_TOKEN` ou o fluxo OAuth com `SERPRO_CPF_CONSUMER_KEY` e `SERPRO_CPF_CONSUMER_SECRET`.

## Validação de CNPJ

A rota `GET /api/validacoes/cnpj/:cnpj` valida os dígitos do CNPJ e consulta a BrasilAPI no servidor. O cadastro de parceiro usa essa rota, evitando chamada direta do navegador.

## Segurança

O servidor aplica headers básicos de segurança, limite de tentativas em rotas sensíveis e serve somente as páginas HTML públicas e a pasta `assets`.

Fotos de lojas podem usar URLs `http/https` ou caminhos locais dentro de `assets/img`, por exemplo `assets/img/eco-brilho-estetica.png`.
O painel do parceiro também permite upload real de fotos, salvas em `assets/uploads`.

## Moderação de imagens

Uploads em `POST /api/uploads/imagem` passam por validação de formato real, tamanho, dimensões e moderação antes de serem salvos. A rota `POST /api/moderacao/imagem` permite pré-validar a mesma imagem sem gravar arquivo.

Configure `IMAGE_MODERATION_API_URL` para apontar para um serviço externo de classificação. O AutoShine envia `imagem`, `mimeType`, `nomeArquivo`, `escopo`, `tamanhoBytes` e `dimensões`, e aceita respostas com campos como `allowed`, `blocked`, `flagged`, `score`, `categories`/`category_scores` ou equivalentes em português. Se `IMAGE_MODERATION_REQUIRED=true`, uploads falham quando o serviço externo estiver indisponível.

## Agenda por loja

Cada loja possui dias de funcionamento e horários configuráveis. O cadastro do parceiro salva `agendaDias` e `agendaHorarios`, e a disponibilidade de agendamento respeita esses campos por estabelecimento.

## Geocoding

O cadastro do parceiro pode buscar coordenadas pelo endereço e preencher o endereço pela localização atual. O servidor usa Nominatim/OpenStreetMap e envia o `GEOCODING_USER_AGENT` configurado no `.env`.

## Pendências conhecidas

Funcionalidades para evoluir depois da apresentação

Recuperação de senha para cliente, dono e admin.

Confirmação de e-mail e/ou telefone. Hoje qualquer cadastro pode criar conta sem validar contato.

Fluxo de pagamento ou pelo menos indicação clara de pagamento no local/online.

Notificações por e-mail/WhatsApp para confirmação, cancelamento e reagendamento.

Ordenação dos resultados da home por distância real usando a localização do usuário.

Página de detalhes do parceiro mais robusta: horário de funcionamento, políticas de cancelamento, formas de pagamento, fotos adicionais e endereço com rota.

Moderação de avaliações e fotos. Avaliações públicas sem moderação podem virar problema rápido.

Painel admin mais completo: usuários, donos, agendamentos, avaliações, denúncias, logs e auditoria.

Usabilidade
Trocar muitos alert()/confirm() por toasts, mensagens inline e modais melhores. O JS usa bastante isso, por exemplo em assets/js/app.js (line 2236) e vários outros fluxos.

Melhorar estados de loading. Em login, cadastro, upload e agendamento, o usuário precisa perceber que algo está processando.

Melhorar estados vazios: sem lojas, sem serviços, sem avaliações, sem agendamentos.

Adicionar confirmação visual depois de salvar/editar no painel do parceiro, sem depender só de alerta.
