const REDACTED = '[REDACTED]';

const sensitiveKeyPatterns = [
  'password',
  'senha',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'set-cookie',
  'secret',
  'cpf',
  'cnpj',
  'email',
  'telefone',
  'phone',
  'googleid',
  'resettoken',
  'apikey',
  'api-key',
];

function matchesSensitiveKey(key) {
  const normalized = String(key || '').trim().toLowerCase();
  return sensitiveKeyPatterns.some((pattern) => normalized === pattern || normalized.includes(pattern));
}

function sanitizeString(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();

  if (!trimmed) return value;
  if (/^bearer\s+/i.test(trimmed)) return REDACTED;
  if (/^basic\s+/i.test(trimmed)) return REDACTED;

  const containsSensitiveData = /\b\d{11}\b|\b\d{14}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(trimmed) || /\b\d{10,11}\b/.test(trimmed);
  if (containsSensitiveData && !/^(?:\[|\{)/.test(trimmed)) {
    return REDACTED;
  }

  return value;
}

function sanitizarParaLog(value) {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizarParaLog(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    const clone = {};
    for (const [key, item] of Object.entries(value)) {
      if (matchesSensitiveKey(key)) {
        clone[key] = REDACTED;
      } else {
        clone[key] = sanitizarParaLog(item);
      }
    }
    return clone;
  }

  return value;
}

function createLogger() {
  const levels = ['log', 'info', 'warn', 'error', 'debug'];

  return Object.fromEntries(
    levels.map((level) => [
      level,
      (...args) => {
        const sanitizedArgs = args.map((arg) => sanitizarParaLog(arg));
        return console[level](...sanitizedArgs);
      },
    ])
  );
}

const logger = createLogger();

module.exports = {
  REDACTED,
  sanitizarParaLog,
  logger,
};
