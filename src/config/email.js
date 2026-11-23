const nodemailer = require("nodemailer");
const emailUser = process.env.EMAIL_USER || "";
const emailPass = process.env.EMAIL_PASS || "";
let emailTransporter = null;
if (emailUser && emailPass) {
  emailTransporter = nodemailer.createTransport({
    service: "gmail", auth: { user: emailUser, pass: emailPass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
  });
}
function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function baseApp() {
  const base = new URL(process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`);
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || (process.env.NODE_ENV === "production" && base.protocol !== "https:")) throw new Error("APP_URL_INVALIDA");
  return base;
}
function linkApp(pagina) {
  return new URL(pagina, baseApp().origin).href;
}
function linkConta(pagina, tipo, token, fragmento = false) {
  const url = new URL(pagina, baseApp().origin);
  url.searchParams.set("tipo", tipo);
  if (fragmento) url.hash = new URLSearchParams({ token }).toString();
  else url.searchParams.set("token", token);
  return url.href;
}
async function enviarMensagem({ para, nome, link, assunto, titulo, descricao, botao, prazo }) {
  if (!emailTransporter) throw new Error("EMAIL_NOT_CONFIGURED");
  const resultado = await emailTransporter.sendMail({
    from: `"AutoShine" <${emailUser}>`, to: para, subject: assunto,
    text: `Olá, ${nome}!\n${descricao}\n${botao}: ${link}\nO link expira em ${prazo}. Se não solicitou, ignore este e-mail.`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2>${escapeHtml(titulo)}</h2><p>Olá, <strong>${escapeHtml(nome)}</strong>!</p>
      <p>${escapeHtml(descricao)}</p><p>O link expira em <strong>${escapeHtml(prazo)}</strong>.</p>
      <a href="${escapeHtml(link)}" style="display:inline-block;margin:16px 0;padding:12px 28px;background:#2f7fff;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(botao)}</a>
      <p>Se não solicitou esta ação, ignore este e-mail.</p><p>AutoShine — LavaJá</p></div>`,
  });
  if (!resultado.accepted?.length) throw new Error("EMAIL_NOT_ACCEPTED");
}
async function enviarEmailReset({ para, nome, token, tipo }) {
  return enviarMensagem({ para, nome, link: linkConta("/reset-senha.html", tipo, token), assunto: "Recuperação de senha — AutoShine", titulo: "Redefinir sua senha", descricao: "Recebemos uma solicitação para redefinir a senha da sua conta no AutoShine.", botao: "Redefinir senha", prazo: "1 hora" });
}
async function enviarEmailVerificacao({ para, nome, token, tipo }) {
  return enviarMensagem({ para, nome, link: linkConta("/verificar-email.html", tipo, token, true), assunto: "Confirme seu e-mail — AutoShine", titulo: "Confirme seu e-mail", descricao: "Confirme este endereço para ativar sua conta. Este mesmo e-mail será usado para recuperar sua senha.", botao: "Confirmar meu e-mail", prazo: "24 horas" });
}
function emailConfigurado() {
  return Boolean(emailTransporter);
}
// Envio genérico usado pela fila de notificações de agendamento.
async function enviarEmail({ para, assunto, texto, html }) {
  if (!emailTransporter) throw new Error("EMAIL_NOT_CONFIGURED");
  const resultado = await emailTransporter.sendMail({ from: `"AutoShine" <${emailUser}>`, to: para, subject: assunto, text: texto, html });
  if (!resultado.accepted?.length) throw new Error("EMAIL_NOT_ACCEPTED");
}
module.exports = { emailTransporter, enviarEmailReset, enviarEmailVerificacao, emailConfigurado, enviarEmail, linkApp };
