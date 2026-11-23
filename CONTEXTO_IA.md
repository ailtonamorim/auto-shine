# AutoShine — Contexto do Projeto para IA

Este arquivo existe para que qualquer IA (Claude, ChatGPT, Gemini, etc.) possa entender rapidamente o projeto sem precisar explorar o código do zero.

---

## O que é o AutoShine

Marketplace de lava jatos e detalhamento automotivo. Projeto TCC do curso de Análise e Desenvolvimento de Sistemas. Tem site web completo + app mobile.

**Objetivo acadêmico:** apresentar progresso para o orientador periodicamente. Estratégia: implementar uma funcionalidade nova por reunião.

---

## Repositório e URLs

- **GitHub:** https://github.com/ailtonamorim/auto-shine
- **Site em produção:** https://auto-shine.onrender.com (Render — deploy automático no push)
- **Branch principal:** `main` (protegida)

---

## Estrutura de pastas

```
auto shine/          ← raiz do projeto web (Node.js + Express)
├── server.js        ← ponto de entrada do servidor
├── src/
│   ├── config/      ← database.js (Prisma), passport.js (Google OAuth)
│   ├── middlewares/ ← auth.js (JWT)
│   ├── routes/      ← agendamentos.js, lojas.js, auth.js, avaliacoes.js, dono.js, ...
│   └── utils/       ← validators.js, agenda.js
├── assets/
│   ├── js/app.js    ← frontend Vanilla JS (~5000 linhas, toda a lógica do site)
│   └── css/styles.css
├── prisma/
│   └── schema.prisma ← modelos: Usuario, Loja, Agendamento, Avaliacao, Favorito, ...
├── app/             ← cópia do app mobile para o git (sincronizar com app_auto_shine)
└── CONTEXTO_IA.md   ← este arquivo
```

**App que roda no celular (fora do repo):**
```
C:\Users\Amori\OneDrive\Documentos\auto shine\app_auto_shine\
```
> ⚠️ Sempre editar o `app_auto_shine/` para ver no celular. A pasta `app/` dentro do repo é só a cópia para o git.

---

## Stack

**Backend (web):**
- Node.js + Express
- Prisma ORM + PostgreSQL (Neon — banco na nuvem)
- JWT para autenticação de clientes
- JWT separado para donos de loja (`autenticarDono`)
- Google OAuth 2.0
- Bcrypt para senhas
- Cloudinary para upload de fotos
- `crypto.randomBytes` para gerar código de retirada (hex 6 chars)

**Frontend web:**
- Vanilla JS, HTML, CSS
- Leaflet + OpenStreetMap para mapas

**App mobile:**
- React Native + Expo SDK 58 + TypeScript
- React Navigation (bottom tabs + native stack)
- AsyncStorage para token JWT
- react-native-maps + expo-location para GPS

---

## Como rodar

**Servidor web:**
```bash
cd "auto shine/auto shine"
node server.js
# → AutoShine ativo em http://localhost:3000
```
Se der EADDRINUSE: `npx kill-port 3000` depois tenta de novo.

**App mobile:**
```bash
cd "auto shine/app_auto_shine"
npx expo start
# escanear QR code com Expo Go no iPhone
```
> ⚠️ O IP muda a cada rede Wi-Fi. Sempre atualizar `app_auto_shine/src/constants/index.ts` → `API_URL` com o IP atual (`ipconfig`).

**Migration do banco (quando mudar o schema.prisma):**
```bash
npx prisma migrate deploy
npx prisma generate
node server.js
```

---

## Funcionalidades implementadas

### Web (completo)
| Área | Descrição |
|---|---|
| Autenticação | Login/cadastro cliente, Google OAuth, recuperação de senha por email |
| Lojas | Listagem, busca, filtro por preço, ordenação por distância/nota/preço |
| Perfil da loja | Carrossel de fotos, serviços, avaliações, horários, formas de pagamento |
| Agendamento | Data, horário em tempo real, tipo de veículo, observações |
| Meus agendamentos | Listar, cancelar, reagendar, ver código de retirada |
| Avaliações | Enviar nota (1-5) + comentário + foto (requer agendamento finalizado) |
| Favoritos | Marcar/desmarcar lojas, tela "Meus favoritos" |
| Painel do dono | Dashboard, métricas, agenda do dia, gráficos, gerenciar loja |
| Admin | Painel completo de administração |
| Código de retirada | Dono digita código no site → agendamento vai para "finalizado" |

### App mobile
| Tela | Descrição |
|---|---|
| HomeScreen | Lista lojas, busca por texto, toggle favorito, pull-to-refresh |
| MapaScreen | Mapa nativo, marcadores, "Como chegar" |
| AgendamentosScreen | Lista agendamentos, cancelar, código de retirada, botão Avaliar |
| PerfilLojaScreen | Carrossel de fotos, serviços, botão Agendar |
| AgendamentoScreen | Calendário 14 dias, horários em tempo real, tipo veículo, observações |
| FavoritosScreen | Lojas favoritadas |
| PerfilScreen | Dados do usuário, logout |
| LoginScreen / CadastroScreen | Autenticação |

---

## Fluxo completo de agendamento

1. Cliente escolhe loja → serviço → clica "Agendar"
2. Escolhe data, horário disponível, tipo de veículo, observações
3. Confirma → backend gera código de retirada (ex: `A3F8C2`) + salva no banco
4. Código aparece em destaque na tela "Meus agendamentos" do app
5. Cliente vai buscar o carro → mostra o código ao dono
6. Dono digita o código no site → agendamento muda para "finalizado"
7. App mostra botão "⭐ Avaliar serviço" → modal com estrelas + comentário

---

## Banco de dados (Prisma) — modelos principais

```
Usuario        — id, nome, email, senha, googleId, fotoUrl, telefone
Loja           — id, nome, descricao, fotoUrl, capaUrl, fotosAdicionais, categoria, precoMedio,
                 latitude, longitude, formasPagamento, agendaDias, agendaHorarios, donoId
ServicoLoja    — id, nome, preco, duracao, lojaId
Agendamento    — id, data, hora, status, codigoRetirada, veiculo, notas, usuarioId, lojaId, servicoId
                 status: "pendente" | "confirmado" | "finalizado" | "cancelado"
Avaliacao      — id, nota, comentario, fotoUrl, lojaId, usuarioId, agendamentoId
Favorito       — id, usuarioId, lojaId
Dono           — id, nome, email, senha, lojaId
```

> ⚠️ Status usa "finalizado" (não "concluido"). O app e o web devem seguir isso.

---

## Padrões do código

**App — autenticação:**
```typescript
// SEMPRE usar este padrão:
import { useAuth } from "../../context/AuthContext";
const { token, usuario } = useAuth();

// NUNCA usar:
import { AuthContext } from "../../context/AuthContext"; // AuthContext não é exportado
useContext(AuthContext); // isso causa crash
```

**App — navegar para uma aba a partir de Stack:**
```typescript
// CERTO (AgendamentoScreen é Stack, Agendamentos é Tab):
navigation.navigate("Tabs", { screen: "Agendamentos" });

// ERRADO:
navigation.navigate("Agendamentos"); // não funciona de dentro de Stack
```

**Backend — gerar código de retirada:**
```javascript
const crypto = require("crypto");
function gerarCodigoRetirada() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}
```

**App — fotosAdicionais (backend manda string, não array):**
```typescript
// backend manda: "url1\nurl2\nurl3"
const fotos = loja.fotosAdicionais
  ? loja.fotosAdicionais.split("\n").map(u => u.trim()).filter(Boolean)
  : [];
```

---

## Problemas comuns e soluções

| Sintoma | Causa | Solução |
|---|---|---|
| Cards não aparecem no app | IP desatualizado | `ipconfig` → atualizar `app_auto_shine/src/constants/index.ts` → `API_URL` |
| EADDRINUSE porta 3000 | Servidor já rodando | `npx kill-port 3000` depois `node server.js` |
| Token inválido ou expirado | JWT expirou | Deslogar e logar de novo no app |
| SDK incompatível com Expo Go | Expo Go atualizou | `npx expo install expo@^58.0.0` + `npx expo install --fix` |
| Prisma "Unknown argument" | Client não regenerado | `npx prisma migrate deploy` + `npx prisma generate` |
| Navigate não funciona (Tab dentro de Stack) | Estrutura de navegação errada | `navigation.navigate("Tabs", { screen: "NomeDaTab" })` |
| $$typeof crash no app | Importando AuthContext direto | Usar `useAuth()` sempre |

---

## Regras do projeto

1. **Nunca fazer push sem permissão explícita do usuário** ("não subi mais para o git sem minha permissão")
2. Testar local antes de qualquer push
3. Sempre editar `app_auto_shine/` para mudanças no app (não a pasta `app/` do repo)
4. Sincronizar `app/` com `app_auto_shine/` antes de commitar

---

*Última atualização: 16/11/2026*
