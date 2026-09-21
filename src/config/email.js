const nodemailer = require("nodemailer");

const emailUser = process.env.EMAIL_USER || "";
const emailPass = process.env.EMAIL_PASS || "";
const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

let emailTransporter = null;
if (emailUser && emailPass) {
  emailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: emailUser, pass: emailPass },
  });
}

async function enviarEmailReset({ para, nome, token, tipo }) {
  if (!emailTransporter) {
    console.warn("EMAIL_USER/EMAIL_PASS não configurados — email de reset não enviado.");
    return;
  }
  const paginaReset = tipo === "dono"
    ? `${appUrl}/reset-senha.html?token=${token}&tipo=dono`
    : `${appUrl}/reset-senha.html?token=${token}&tipo=usuario`;

  await emailTransporter.sendMail({
    from: `"AutoShine" <${emailUser}>`,
    to: para,
    subject: "Recuperação de senha — AutoShine",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a1a">Redefinir sua senha</h2>
        <p>Olá, <strong>${nome}</strong>!</p>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta no AutoShine.</p>
        <p>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.</p>
        <a href="${paginaReset}"
           style="display:inline-block;margin:16px 0;padding:12px 28px;background:#2f7fff;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Redefinir senha
        </a>
        <p style="color:#666;font-size:0.85rem">Se você não solicitou a redefinição, ignore este email.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
        <p style="color:#999;font-size:0.8rem">AutoShine — Marketplace de lava jato em Goiânia</p>
      </div>
    `,
  });
}

module.exports = { emailTransporter, enviarEmailReset };
