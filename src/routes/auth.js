const express = require("express");
const bcrypt = require("bcrypt");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const prisma = require("../config/database");
const { gerarTokenUsuario, gerarTokenDono, definirCookieAuth, limparCookieAuth } = require("../utils/tokens");
const { criptografar, descriptografarSeNecessario, criarIndice } = require("../utils/crypto");
const { normalizarEmail, cpfTemDigitoValido, redirecionamentoSeguro } = require("../utils/validators");
const { limitarAuth } = require("../middlewares/security");
const { registrarLogin } = require("../utils/audit");
const { autenticarUsuario } = require("../middlewares/auth");
const { registrarAudit, registrarExportacao, TiposAcao } = require("../utils/audit");
const { usuarioPublicSelect, serializarUsuarioPublic } = require("../utils/serializers");
const { logger } = require("../utils/logger");

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
          let dono = await prisma.dono.findFirst({ where: { googleIdIndex: criarIndice(user.id) } });
          if (!dono) {
            const base = String(user.email || user.name || "dono").split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 20) || "dono";
            let login = base;
            let i = 1;
            while (await prisma.dono.findUnique({ where: { login } })) login = `${base}${i++}`;
            const googleIdCipher = criptografar(user.id);
            dono = await prisma.dono.create({ data: { nome: user.name || "Parceiro Google", login, senha: null, googleId: googleIdCipher, googleIdCipher, googleIdIndex: criarIndice(user.id) } });
          }
          const token = gerarTokenDono(dono);
          definirCookieAuth(res, "dono", token);
          const next = encodeURIComponent(returnTo);
          res.redirect(`/cadastro-dono.html?auth=dono_google_success&next=${next}`);
        } catch (err) {
          logger.error("Erro no Google auth do dono:", err);
          res.redirect("/cadastro-dono.html?auth=google_failed");
        }
      })();
      return;
    }

    (async () => {
      try {
        const email = normalizarEmail(user.email);
        if (!email) return res.redirect("/cadastro.html?mode=login&auth=google_failed");
        let usuario = await prisma.usuario.findFirst({ where: { OR: [{ googleIdIndex: criarIndice(user.id) }, { emailIndex: criarIndice(email) }] } });
        if (!usuario) {
          const emailCipher = criptografar(email);
          const googleIdCipher = criptografar(user.id);
          usuario = await prisma.usuario.create({ data: { nome: user.name || email.split("@")[0] || "Usuario Google", email: emailCipher, emailCipher, emailIndex: criarIndice(email), googleId: googleIdCipher, googleIdCipher, googleIdIndex: criarIndice(user.id) } });
        } else if (!usuario.googleIdIndex) {
          usuario = await prisma.usuario.update({ where: { id: usuario.id }, data: { googleId: criptografar(user.id), googleIdIndex: criarIndice(user.id) } });
        }
        const token = gerarTokenUsuario(usuario);
        definirCookieAuth(res, "usuario", token);
        const next = encodeURIComponent(returnTo);
        res.redirect(`/cadastro.html?mode=login&auth=success&provider=google&next=${next}`);
      } catch (err) {
        logger.error("Erro no Google auth do cliente:", err);
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

router.get("/api/auth/me", autenticarUsuario, async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: usuarioPublicSelect });
    if (!usuario) return res.status(401).json({ authenticated: false, user: null });
    res.json({ authenticated: true, user: serializarUsuarioPublic(usuario) });
  } catch {
    res.status(500).json({ error: "Erro ao consultar a sessão." });
  }
});
router.post("/api/auth/logout", (_req, res) => {
  limparCookieAuth(res, "usuario");
  res.json({ ok: true });
});
router.get("/api/auth/config", (_req, res) => res.json({ googleOAuthConfigured }));

router.get("/api/meus-dados", autenticarUsuario, async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario.id },
      select: {
        id: true, nome: true, email: true, cpf: true, telefone: true, createdAt: true,
        agendamentos: { select: { id: true, data: true, hora: true, status: true, lojaId: true, servicoId: true } },
        avaliacoes: { select: { id: true, nota: true, comentario: true, lojaId: true, createdAt: true } },
        denuncias: { select: { id: true, tipo: true, motivo: true, motivoCipher: true, detalhes: true, detalhesCipher: true, status: true, anonima: true, createdAt: true } },
      },
    });
    if (!usuario) return res.status(404).json({ error: "Usuário não encontrado." });
    await registrarAudit({ acao: TiposAcao.ACESSAR, tabela: "Usuario", recordId: usuario.id, usuarioId: usuario.id, enderecoIp: req.ip });
    const { denuncias, ...dadosUsuario } = usuario;
    res.json({ dados: {
      ...dadosUsuario,
      email: descriptografarSeNecessario(usuario.email),
      cpf: descriptografarSeNecessario(usuario.cpf),
      telefone: descriptografarSeNecessario(usuario.telefone),
      denuncias: denuncias.map(({ motivo, motivoCipher, detalhes, detalhesCipher, ...denuncia }) => ({
        ...denuncia,
        motivo: descriptografarSeNecessario(motivoCipher || motivo),
        detalhes: descriptografarSeNecessario(detalhesCipher || detalhes),
      })),
    } });
  } catch (err) {
    logger.error("Erro ao consultar dados do titular:", err);
    res.status(500).json({ error: "Erro ao consultar seus dados." });
  }
});

router.get("/api/meus-dados/exportar", autenticarUsuario, async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id }, select: { id: true, nome: true, email: true, cpf: true, telefone: true, createdAt: true } });
    if (!usuario) return res.status(404).json({ error: "Usuário não encontrado." });
    await registrarExportacao({ usuarioId: usuario.id, enderecoIp: req.ip });
    res.json({ dados: {
      ...usuario,
      email: descriptografarSeNecessario(usuario.email),
      cpf: descriptografarSeNecessario(usuario.cpf),
      telefone: descriptografarSeNecessario(usuario.telefone),
    } });
  } catch {
    res.status(500).json({ error: "Erro ao exportar seus dados." });
  }
});

router.patch("/api/meus-dados", autenticarUsuario, async (req, res) => {
  try {
    const atual = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    if (!atual) return res.status(404).json({ error: "Usuário não encontrado." });
    const nome = req.body?.nome === undefined ? atual.nome : String(req.body.nome).trim();
    const telefone = req.body?.telefone === undefined ? descriptografarSeNecessario(atual.telefone) : String(req.body.telefone).replace(/\D/g, "");
    if (!nome || (telefone && telefone.length < 10)) return res.status(400).json({ error: "Nome ou telefone inválido." });
    const atualizado = await prisma.usuario.update({
      where: { id: atual.id },
      data: { nome, telefone: criptografar(telefone), telefoneCipher: criptografar(telefone), telefoneIndex: criarIndice(telefone) },
      select: { id: true, nome: true, telefone: true },
    });
    await registrarAudit({ acao: TiposAcao.ATUALIZAR, tabela: "Usuario", recordId: atual.id, usuarioId: atual.id, enderecoIp: req.ip, detalhes: { campos: ["nome", "telefone"] } });
    res.json({ usuario: { ...atualizado, telefone: descriptografarSeNecessario(atualizado.telefone) } });
  } catch {
    res.status(500).json({ error: "Erro ao atualizar seus dados." });
  }
});

router.delete("/api/meus-dados", autenticarUsuario, async (req, res) => {
  if (req.body?.confirmacao !== "EXCLUIR") return res.status(400).json({ error: "Envie confirmacao: EXCLUIR para apagar seus dados." });
  try {
    const usuarioId = req.usuario.id;
    await prisma.$transaction(async (tx) => {
      await tx.denuncia.deleteMany({ where: { usuarioId } });
      await tx.avaliacao.deleteMany({ where: { usuarioId } });
      const agendamentos = await tx.agendamento.findMany({ where: { usuarioId }, select: { id: true } });
      const agendamentoIds = agendamentos.map((item) => item.id);
      if (agendamentoIds.length) await tx.denuncia.deleteMany({ where: { agendamentoId: { in: agendamentoIds } } });
      if (agendamentoIds.length) await tx.avaliacao.deleteMany({ where: { agendamentoId: { in: agendamentoIds } } });
      await tx.agendamento.deleteMany({ where: { usuarioId } });
      await tx.favorito.deleteMany({ where: { usuarioId } });
      await tx.usuario.delete({ where: { id: usuarioId } });
    });
    await registrarAudit({ acao: TiposAcao.DELETAR, tabela: "Usuario", recordId: usuarioId, usuarioId, enderecoIp: req.ip });
    res.json({ ok: true });
  } catch (err) {
    logger.error("Erro ao excluir dados do titular:", err);
    res.status(500).json({ error: "Não foi possível excluir seus dados." });
  }
});

router.post("/api/auth/signup", limitarAuth, async (req, res) => {
  try {
    const { nome, email, cpf, telefone, senha } = req.body;
    if (!nome || !email || !cpf || !telefone || !senha) return res.status(400).json({ error: "Todos os campos são obrigatórios." });
    const emailNorm = normalizarEmail(email);
    const cpfNorm = String(cpf).replace(/\D/g, "");
    const telefoneNorm = String(telefone).replace(/\D/g, "");
    if (!cpfTemDigitoValido(cpfNorm)) return res.status(400).json({ error: "CPF invalido." });
    if (String(senha).length < 6) return res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres." });
    const existente = await prisma.usuario.findFirst({ where: { OR: [{ emailIndex: criarIndice(emailNorm) }, { cpfIndex: criarIndice(cpfNorm) }] } });
    if (existente) return res.status(409).json({ error: "Ja existe um cadastro com este email ou CPF." });
    const senhaHash = await bcrypt.hash(senha, 10);
    const emailCipher = criptografar(emailNorm);
    const cpfCipher = criptografar(cpfNorm);
    const telefoneCipher = criptografar(telefoneNorm);
    const usuario = await prisma.usuario.create({ data: { nome: String(nome).trim(), email: emailCipher, emailCipher, emailIndex: criarIndice(emailNorm), cpf: cpfCipher, cpfCipher, cpfIndex: criarIndice(cpfNorm), telefone: telefoneCipher, telefoneCipher, telefoneIndex: criarIndice(telefoneNorm), senha: senhaHash } });
    const token = gerarTokenUsuario(usuario);
    definirCookieAuth(res, "usuario", token);
    res.status(201).json({ user: { id: usuario.id, nome: usuario.nome, email: emailNorm } });
  } catch (err) {
    logger.error("Erro no cadastro:", err);
    res.status(500).json({ error: "Erro interno ao criar conta." });
  }
});

router.post("/api/auth/login", limitarAuth, async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: "Informe email e senha." });
    const usuario = await prisma.usuario.findUnique({ where: { emailIndex: criarIndice(normalizarEmail(email)) } });
    if (!usuario) {
      await registrarLogin({ usuarioEmail: criarIndice(normalizarEmail(email)), sucesso: false, enderecoIp: req.ip, motivo: "Usuário não encontrado" });
      return res.status(401).json({ error: "Email ou senha inválidos." });
    }
    if (!usuario.senha) return res.status(400).json({ error: "Esta conta usa login com Google. Clique em 'Entrar com Google'." });
    if (!(await bcrypt.compare(senha, usuario.senha))) {
      await registrarLogin({ usuarioEmail: criarIndice(normalizarEmail(email)), usuarioId: usuario.id, sucesso: false, enderecoIp: req.ip, motivo: "Senha incorreta" });
      return res.status(401).json({ error: "Email ou senha inválidos." });
    }
    await registrarLogin({ usuarioEmail: criarIndice(normalizarEmail(email)), usuarioId: usuario.id, enderecoIp: req.ip });
    const token = gerarTokenUsuario(usuario);
    definirCookieAuth(res, "usuario", token);
    res.json({ user: { id: usuario.id, nome: usuario.nome, email: normalizarEmail(email) } });
  } catch (err) {
    logger.error("Erro no login:", err);
    res.status(500).json({ error: "Erro interno ao fazer login." });
  }
});

module.exports = router;
