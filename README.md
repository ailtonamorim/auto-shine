# AutoShine Marketplace

Marketplace responsivo para lava jatos e estética automotiva, com cadastro de clientes, parceiros, lojas, serviços, mapa, agendamentos, avaliações e painel admin.

## Tecnologias

- HTML5, CSS3 e JavaScript vanilla
- Node.js + Express
- Prisma + PostgreSQL
- JWT para API autenticada
- Papéis `client`, `partner` e `admin`, com páginas protegidas por cookie HttpOnly assinado
- Passport Google OAuth 2.0
- Tema claro/escuro compartilhado por tokens CSS

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

O painel administrativo oferece indicadores com filtros de hoje, 7 ou 30 dias ou intervalo personalizado (até 366 dias), fila de pendências, gráficos diários interativos de agendamentos e faturamento estimado, além de rankings de lojas por agendamentos, avaliações e favoritos. Lojas cadastradas por parceiros aguardam aprovação administrativa antes de serem exibidas publicamente; lojas existentes permanecem aprovadas.

O dashboard também apresenta GMV reservado, receita estimada da plataforma e ticket médio nos mesmos períodos. Esses números são estimativas de reservas não canceladas, não pagamentos recebidos: o sistema ainda não integra checkout nem confirma liquidação. Novos agendamentos guardam o preço do serviço no momento da reserva; registros anteriores sem esse histórico usam o preço atual. A comissão ilustrativa é configurável por `PLATFORM_COMMISSION_RATE_PERCENT` (padrão demonstrativo de 10%).

Nos módulos de usuários, parceiros e avaliações, o administrador pode bloquear e desbloquear contas e avaliações. Usuários e parceiros também podem receber suspensão disciplinar por 30 dias, com restauração automática do acesso ao fim do prazo ou reativação antecipada pelo painel. Contas bloqueadas perdem acesso às rotas autenticadas e ao login; avaliações bloqueadas deixam de ser exibidas publicamente, mas permanecem disponíveis no painel para auditoria e eventual desbloqueio.

No painel administrativo, lojas podem ser inativadas por 30 dias sem apagar seus dados, serviços ou agendamentos. Elas deixam de aparecer nas listagens públicas durante esse período e voltam automaticamente ao fim do prazo; também podem ser reativadas manualmente pelo painel.

O painel também mostra a saúde operacional de cada loja. A classificação considera cancelamentos e avaliações dos últimos 30 dias e o tempo desde o último agendamento concluído. A análise roda ao iniciar o servidor e diariamente às 02:00; filtros rápidos de saúde e aprovação exibem contagens e atualizam a listagem sem recarregar a página. A API administrativa aceita `health` (`HEALTHY`, `WARNING` ou `CRITICAL`), `statusAprovacao` e `bloqueado` em `/api/admin/stores` (o filtro de saúde também aceita `healthStatus` em `/api/admin/lojas`).

## Configuração

Copie `.env.example` para `.env` e preencha:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/autoshine?schema=public"
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

Os logins emitem JWTs com papel explícito e os gravam também em cookie HttpOnly para que o servidor valide o acesso às páginas de cliente, parceiro e administração. As rotas de navegação do marketplace redirecionam sessões de parceiro/admin ao portal correspondente; as telas do parceiro usam navegação própria para gestão, sem links para o marketplace. Após esta mudança, sessões antigas devem entrar novamente para receber o cookie de acesso. O tema selecionado é compartilhado entre as telas e seus componentes flutuantes, incluindo campos autofill e sobreposições.

Para validar o projeto:

```bash
npm run check
npm test
```

## Seed

O seed cria lojas, serviços, avaliações, usuários demo e 30 agendamentos fictícios distribuídos pelos últimos 30 dias para apresentar os indicadores e gráficos administrativos.

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

## Notificações de agendamento (tópico 8)

Toda mudança em um agendamento avisa a outra parte por e-mail, mostrando o que mudou (antes → agora), o motivo informado e o status atual.

| Evento | Quem recebe |
| --- | --- |
| Nova solicitação | Estabelecimento (pedido) e cliente (recibo) |
| Cliente altera, reagenda ou cancela | Estabelecimento |
| Estabelecimento altera, confirma, finaliza ou cancela | Cliente |
| Administrador altera | Cliente e estabelecimento |
| Expiração automática | Cliente e estabelecimento |

Definir a duração de uma reserva antiga não gera e-mail, porque só afeta a agenda interna.

Como funciona (transactional outbox):

- A notificação é gravada na tabela `notificacao_fila` **na mesma transação** da alteração e do histórico. Se a alteração falhar, nenhum aviso fica na fila. Se for confirmada, o aviso não se perde mesmo que o e-mail esteja fora do ar.
- `src/services/fila-notificacoes.js` roda junto com o servidor e envia a cada 15 s. Várias instâncias podem rodar ao mesmo tempo sem duplicar envios.
- Falhas temporárias são repetidas após 1 min e 5 min. Na 3ª falha, ou se o endereço for recusado, a linha fica com status `FALHA` e o erro em `ultima_falha`.
- A entrega é "pelo menos uma vez": se o servidor cair logo depois de enviar e antes de registrar o envio, o e-mail pode sair de novo uma vez.
- Sem `EMAIL_USER`/`EMAIL_PASS`, os avisos ficam `PENDENTE` e são enviados quando o e-mail for configurado.

Variáveis opcionais: `NOTIFICACOES_EMAIL_ATIVAS=false` para não enviar (a fila continua sendo gravada) e `NOTIFICACOES_INTERVALO_MS` para mudar o intervalo.

Para consultar falhas: `SELECT tipo, destinatario_email, tentativas, ultima_falha FROM notificacao_fila WHERE status = 'FALHA';`. Para reenviar: `UPDATE notificacao_fila SET status = 'PENDENTE', tentativas = 0, proxima_tentativa_em = now() WHERE id = '...';`.

## Pendências conhecidas

Funcionalidades para evoluir depois da apresentação

Recuperação de senha para cliente, dono e admin.

Confirmação de e-mail e/ou telefone. Hoje qualquer cadastro pode criar conta sem validar contato.

Fluxo de pagamento ou pelo menos indicação clara de pagamento no local/online.

Notificações por WhatsApp para confirmação, cancelamento e reagendamento (o e-mail já está implementado; veja "Notificações de agendamento").

Ordenação dos resultados da home por distância real usando a localização do usuário.

Página de detalhes do parceiro mais robusta: horário de funcionamento, políticas de cancelamento, formas de pagamento, fotos adicionais e endereço com rota.

Moderação de avaliações e fotos. Avaliações públicas sem moderação podem virar problema rápido.

Painel admin mais completo: usuários, donos, agendamentos, avaliações, denúncias, logs e auditoria.

Usabilidade
Trocar muitos alert()/confirm() por toasts, mensagens inline e modais melhores. O JS usa bastante isso, por exemplo em assets/js/app.js (line 2236) e vários outros fluxos.

Melhorar estados de loading. Em login, cadastro, upload e agendamento, o usuário precisa perceber que algo está processando.

Melhorar estados vazios: sem lojas, sem serviços, sem avaliações, sem agendamentos.

Adicionar confirmação visual depois de salvar/editar no painel do parceiro, sem depender só de alerta.
