const { obterContaGoogle } = require("../utils/conta-google");
const { exigirEnvioEmail, pendenciaEmail, responderCadastroPendente } = require("../utils/verificacao-email");
const { erroSenha } = require("../utils/senha");
const express = require("express");
const bcrypt = require("bcrypt");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const prisma = require("../config/database");
const { gerarTokenUsuario, gerarTokenDono } = require("../utils/tokens");
const { normalizarEmail, emailValido, cpfTemDigitoValido, redirecionamentoSeguro } = require("../utils/validators");
const { limitarAuth } = require("../middlewares/security");

const router = express.Router();

const PORT = process.env.PORT || 3000;
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL || `http://localhost:${PORT}/auth/google/callback`;
const googleOAuthConfigured = Boolean(googleClientId && googleClientSecret);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

if (googleOAuthConfigured) {
  passport.use(new GoogleStrategy(
    { clientID: googleClientId, clientSecret: googleClientSecret, callbackURL: googleCallbackUrl },
    (_at, _rt, profile, done) => {
      const email = Array.isArray(profile.emails) && profile.emails[0] ? profile.emails[0].value : "";
      done(null, { id: profile.id, name: profile.displayName || "Usuario Google", email, emailVerified: profile.emails?.[0]?.verified === true, provider: "google" });
    },
  ));
}

router.get("/auth/google", (req, res, next) => {
  req.session.returnTo = redirecionamentoSeguro(req.query.next, "/index.html");
  req.session.parceiro = req.query.parceiro === "1";
  if (!googleOAuthConfigured) {
    const dest = req.session.parceiro ? "/cadastro-dono.html" : "/cadastro.html?mode=login";
    const sep = dest.includes("?") ? "&" : "?";
    return res.redirect(`${dest}${sep}auth=google_not_configured`);
  }
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

router.get("/auth/google/callback", (req, res, next) => {
  const returnTo = redirecionamentoSeguro(req.session.returnTo, "/index.html");
  const parceiro = Boolean(req.session.parceiro);
  delete req.session.returnTo;
  delete req.session.parceiro;

  if (!googleOAuthConfigured) {
    const dest = parceiro ? "/cadastro-dono.html" : "/cadastro.html?mode=login";
    const sep = dest.includes("?") ? "&" : "?";
    return res.redirect(`${dest}${sep}auth=google_not_configured`);
  }

  const failDest = parceiro ? "/cadastro-dono.html?auth=google_failed" : "/cadastro.html?mode=login&auth=google_failed";
  passport.authenticate("google", { failureRedirect: failDest })(req, res, () => {
    const user = req.user || {};

    if (parceiro) {
      (async () => {
        try {
          const dono = await obterContaGoogle(user, "dono");
          if (dono.bloqueado || (dono.suspensoAte && dono.suspensoAte > new Date())) return res.redirect("/cadastro-dono.html?auth=blocked");
          const token = gerarTokenDono(dono);
          const next = encodeURIComponent(returnTo);
          res.redirect(`/cadastro-dono.html?auth=dono_google_success&token=${token}&next=${next}`);
        } catch (err) {
          console.error("Erro no Google auth do dono:", err);
          res.redirect("/cadastro-dono.html?auth=google_failed");
        }
      })();
      return;
    }

    (async () => {
      try {
        const usuario = await obterContaGoogle(user, "usuario");
        if (usuario.bloqueado || (usuario.suspensoAte && usuario.suspensoAte > new Date())) return res.redirect("/cadastro.html?mode=login&auth=blocked");
        const token = gerarTokenUsuario(usuario);
        const name = encodeURIComponent(usuario.nome);
        const emailParam = encodeURIComponent(usuario.email);
        const next = encodeURIComponent(returnTo);
        res.redirect(`/cadastro.html?mode=login&auth=success&provider=google&token=${encodeURIComponent(token)}&name=${name}&email=${emailParam}&next=${next}`);
      } catch (err) {
        console.error("Erro no Google auth do cliente:", err);
        res.redirect("/cadastro.html?mode=login&auth=google_failed");
      }
    })();
  });
});

router.get("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect("/index.html"));
  });
});

router.get("/api/auth/me", (req, res) => res.json({ authenticated: Boolean(req.user), user: req.user || null }));
router.get("/api/auth/config", (_req, res) => res.json({ googleOAuthConfigured }));

router.post("/api/auth/signup", limitarAuth, async (req, res) => {
  try {
    const { nome, email, cpf, telefone, senha } = req.body;
    if (!nome || !email || !cpf || !telefone || !senha) return res.status(400).json({ error: "Todos os campos são obrigatórios." });
    const emailNorm = normalizarEmail(email);
    if (typeof email !== "string" || !emailValido(emailNorm)) return res.status(400).json({ error: "Informe um e-mail válido." });
    const cpfNorm = String(cpf).replace(/\D/g, "");
    const telefoneNorm = String(telefone).replace(/\D/g, "");
    if (!cpfTemDigitoValido(cpfNorm)) return res.status(400).json({ error: "CPF invalido." });
    const erroSenhaNova = erroSenha(senha);
    if (erroSenhaNova) return res.status(400).json({ error: erroSenhaNova });
    exigirEnvioEmail();
    const existente = await prisma.usuario.findFirst({ where: { OR: [{ email: emailNorm }, { cpf: cpfNorm }] } });
    if (existente) return res.status(409).json({ error: "Já existe um cadastro com este e-mail ou CPF. Entre ou solicite a confirmação do e-mail." });
    const senhaHash = await bcrypt.hash(senha, 10);
    const usuario = await prisma.usuario.create({ data: { nome: String(nome).trim(), email: emailNorm, cpf: cpfNorm, telefone: telefoneNorm, senha: senhaHash } });
    return responderCadastroPendente(res, usuario, "usuario");
  } catch (err) {
    console.error("Erro no cadastro:", err);
    res.status(err.status || (err.code === "P2002" ? 409 : 500)).json({ error: err.status === 503 ? err.message : "Não foi possível cadastrar. Confira se o e-mail ou CPF já está em uso." });
  }
});

router.post("/api/auth/login", limitarAuth, async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: "Informe email e senha." });
    const usuario = await prisma.usuario.findUnique({ where: { email: normalizarEmail(email) } });
    if (!usuario) return res.status(401).json({ error: "Email ou senha inválidos." });
    if (usuario.bloqueado) return res.status(403).json({ error: "Conta bloqueada. Entre em contato com o suporte." });
    if (usuario.suspensoAte && usuario.suspensoAte > new Date()) return res.status(403).json({ error: `Conta suspensa até ${usuario.suspensoAte.toLocaleDateString("pt-BR")}.` });
    if (!usuario.senha) return res.status(400).json({ error: "Esta conta usa login com Google. Clique em 'Entrar com Google'." });
    if (!(await bcrypt.compare(senha, usuario.senha))) return res.status(401).json({ error: "Email ou senha inválidos." });
    const pendencia = pendenciaEmail(usuario);
    if (pendencia) return res.status(403).json(pendencia);
    const token = gerarTokenUsuario(usuario);
    res.json({ token, user: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  } catch (err) {
    console.error("Erro no login:", err);
    res.status(500).json({ error: "Erro interno ao fazer login." });
  }
});

module.exports = router;
