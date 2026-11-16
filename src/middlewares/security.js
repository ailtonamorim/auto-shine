function aplicarHeadersSeguranca(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  next();
}

function criarLimitador({ janelaMs, maximo }) {
  const acessos = new Map();
  return (req, res, next) => {
    const agora = Date.now();
    const chave = `${req.ip}:${req.method}:${req.path}`;
    const registro = acessos.get(chave) || { inicio: agora, total: 0 };
    if (agora - registro.inicio > janelaMs) { registro.inicio = agora; registro.total = 0; }
    registro.total += 1;
    acessos.set(chave, registro);
    if (registro.total > maximo) return res.status(429).json({ error: "Muitas tentativas. Aguarde um pouco e tente novamente." });
    next();
  };
}

const limitarAuth = criarLimitador({ janelaMs: 15 * 60 * 1000, maximo: 30 });
const limitarValidacoes = criarLimitador({ janelaMs: 10 * 60 * 1000, maximo: 60 });
const limitarUploads = criarLimitador({ janelaMs: 10 * 60 * 1000, maximo: 40 });
const limitarReset = criarLimitador({ janelaMs: 60 * 60 * 1000, maximo: 5 });

module.exports = { aplicarHeadersSeguranca, criarLimitador, limitarAuth, limitarValidacoes, limitarUploads, limitarReset };
