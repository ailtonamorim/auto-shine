const path = require("path");
const fs = require("fs/promises");
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const dotenv = require("dotenv");

dotenv.config();

const requiredConfig = ["JWT_SECRET", "SESSION_SECRET", "ADMIN_LOGIN", "ADMIN_SENHA"];
const missingConfig = requiredConfig.filter((key) => !process.env[key]);
if (missingConfig.length) {
  console.error(`Configuracao obrigatoria ausente: ${missingConfig.join(", ")}. Confira o arquivo .env.`);
  process.exit(1);
}

const { aplicarHeadersSeguranca } = require("./src/middlewares/security");
const { garantirIndicesBanco } = require("./src/utils/loja");

const authRouter = require("./src/routes/auth");
const donoRouter = require("./src/routes/dono");
const resetSenhaRouter = require("./src/routes/resetSenha");
const lojasRouter = require("./src/routes/lojas");
const favoritosRouter = require("./src/routes/favoritos");
const agendamentosRouter = require("./src/routes/agendamentos");
const avaliacoesRouter = require("./src/routes/avaliacoes");
const denunciasRouter = require("./src/routes/denuncias");
const utilsRouter = require("./src/routes/utils");
const adminRouter = require("./src/routes/admin");

const app = express();
const PORT = process.env.PORT || 3000;
const baseDir = __dirname;
const uploadsDir = path.join(baseDir, "assets", "uploads");

const publicPages = new Set([
  "index.html", "mapa.html", "perfil.html", "agendamento.html", "meus-agendamentos.html",
  "avaliacoes.html", "cadastro.html", "cadastro-dono.html", "admin.html", "termos.html",
  "privacidade.html", "favoritos.html", "login.html", "reset-senha.html",
]);

fs.mkdir(uploadsDir, { recursive: true }).catch((err) => {
  console.error("Não foi possível preparar a pasta de uploads:", err);
});

app.disable("x-powered-by");
app.use(aplicarHeadersSeguranca);

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 },
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json({ limit: "8mb" }));

app.use(authRouter);
app.use("/api/dono", donoRouter);
app.use("/api/reset-senha", resetSenhaRouter);
app.use("/api/lojas", lojasRouter);
app.use("/api/favoritos", favoritosRouter);
app.use("/api/agendamentos", agendamentosRouter);
app.use("/api/avaliacoes", avaliacoesRouter);
app.use("/api/denuncias", denunciasRouter);
app.use("/api", utilsRouter);
app.use("/api/admin", adminRouter);

app.use("/assets", express.static(path.join(baseDir, "assets")));
app.get("/", (_req, res) => res.sendFile(path.join(baseDir, "index.html")));
app.get("/parceiro-cadastrar.html", (_req, res) => res.redirect(301, "/cadastro-dono.html"));
app.get("/:page", (req, res, next) => {
  const { page } = req.params;
  if (!publicPages.has(page)) return next();
  return res.sendFile(path.join(baseDir, page));
});

app.use((_req, res) => {
  res.status(404).json({ error: "Recurso não encontrado." });
});

let server;

async function iniciarServidor() {
  await garantirIndicesBanco();
  server = app.listen(PORT, () => {
    console.log(`AutoShine ativo em http://localhost:${PORT}`);
    const googleOAuthConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    if (!googleOAuthConfigured) console.log("OAuth Google desativado: configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env");
  });
}

iniciarServidor().catch((err) => {
  console.error("Nao foi possivel iniciar o AutoShine:", err);
  process.exit(1);
});

module.exports = { app, get server() { return server; }, iniciarServidor };
