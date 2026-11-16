const express = require("express");
const bcrypt = require("bcrypt");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const prisma = require("../config/database");
const { gerarTokenUsuario, gerarTokenDono } = require("../utils/tokens");
const { normalizarEmail, cpfTemDigitoValido, redirecionamentoSeguro } = require("../utils/validators");
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
      done(null, { id: profile.id, name: profile.displayName || "Usuario Google", email, provider: "google" });
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
          let dono = await prisma.dono.findFirst({ where: { googleId: user.id } });
          if (!dono) {
            const base = String(user.email || user.name || "dono").split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 20) || "dono";
            let login = base;
            let i = 1;
            while (await prisma.dono.findUnique({ where: { login } })) login = `${base}${i++}`;
            dono = await prisma.dono.create({ data: { nome: user.name || "Parceiro Google", login, senha: null, googleId: user.id } });
          }
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
        const email = normalizarEmail(user.email);
        if (!email) return res.redirect("/cadastro.html?mode=login&auth=google_failed");
        let usuario = await prisma.usuario.findFirst({ where: { OR: [{ googleId: user.id }, { email }] } });
        if (!usuario) {
          usuario = await prisma.usuario.create({ data: { nome: user.name || email.split("@")[0] || "Usuario Google", email, googleId: user.id } });
        } else if (!usuario.googleId) {
          usuario = await prisma.usuario.update({ where: { id: usuario.id }, data: { googleId: user.id } });
        }
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
    const cpfNorm = String(cpf).replace(/\D/g, "");
    const telefoneNorm = String(telefone).replace(/\D/g, "");
    if (!cpfTemDigitoValido(cpfNorm)) return res.status(400).json({ error: "CPF invalido." });
    if (String(senha).length < 6) return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres." });
    const existente = await prisma.usuario.findFirst({ where: { OR: [{ email: emailNorm }, { cpf: cpfNorm }] } });
    if (existente) return res.status(409).json({ error: "Ja existe um cadastro com este email ou CPF." });
    const senhaHash = await bcrypt.hash(senha, 10);
    const usuario = await prisma.usuario.create({ data: { nome: String(nome).trim(), email: emailNorm, cpf: cpfNorm, telefone: telefoneNorm, senha: senhaHash } });
    const token = gerarTokenUsuario(usuario);
    res.status(201).json({ token, user: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  } catch (err) {
    console.error("Erro no cadastro:", err);
    res.status(500).json({ error: "Erro interno ao criar conta." });
  }
});

router.post("/api/auth/login", limitarAuth, async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: "Informe email e senha." });
    const usuario = await prisma.usuario.findUnique({ where: { email: normalizarEmail(email) } });
    if (!usuario) return res.status(401).json({ error: "Email ou senha inválidos." });
    if (!usuario.senha) return res.status(400).json({ error: "Esta conta usa login com Google. Clique em 'Entrar com Google'." });
    if (!(await bcrypt.compare(senha, usuario.senha))) return res.status(401).json({ error: "Email ou senha inválidos." });
    const token = gerarTokenUsuario(usuario);
    res.json({ token, user: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
  } catch (err) {
    console.error("Erro no login:", err);
    res.status(500).json({ error: "Erro interno ao fazer login." });
  }
});

module.exports = router;
