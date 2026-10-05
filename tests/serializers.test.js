const test = require('node:test');
const assert = require('node:assert/strict');

const {
  serializarUsuarioPublic,
  serializarDonoPublic,
  usuarioPublicSelect,
  donoPublicSelect,
} = require('../src/utils/serializers');
const { mascararEmail, mascararNomeCliente } = require('../src/utils/masking');
const { sanitizarParaLog, logger } = require('../src/utils/logger');
const { normalizarNomeArquivoExterno } = require('../src/utils/imagem');

test('serializarUsuarioPublic remove campos sensíveis e mascara CPF', () => {
  const usuario = {
    id: 7,
    nome: 'Ana',
    email: 'ana@email.com',
    cpf: '12345678909',
    telefone: '11999998888',
    senha: 'secret',
    googleId: 'google-123',
    resetToken: 'token-abc',
    resetTokenHash: 'hash-abc',
    googleIdIndex: 'indexed',
    cpfCipher: 'enc-cpf',
    cpfIndex: 'cpf-index',
    emailCipher: 'enc-email',
    emailIndex: 'email-index',
  };

  const serializado = serializarUsuarioPublic(usuario);

  assert.equal(serializado.id, 7);
  assert.equal(serializado.nome, 'Ana');
  assert.notEqual(serializado.email, 'ana@email.com');
  assert.ok(serializado.email.includes('@'));
  assert.equal(serializado.cpf, '***.***.***-09');
  assert.equal(serializado.telefone, '11999998888');
  assert.ok(!('senha' in serializado));
  assert.ok(!('googleId' in serializado));
  assert.ok(!('resetToken' in serializado));
});

test('serializarDonoPublic remove campos sensíveis e mascara CNPJ', () => {
  const dono = {
    id: 3,
    nome: 'Loja Verde',
    login: 'lojaverde',
    cnpj: '12345678000199',
    email: 'contato@lojaverde.com',
    senha: 'secret',
    googleId: 'google-321',
    resetToken: 'token-xyz',
    resetTokenHash: 'hash-xyz',
    googleIdIndex: 'gindex',
    cnpjCipher: 'enc-cnpj',
    cnpjIndex: 'cnpj-index',
  };

  const serializado = serializarDonoPublic(dono);

  assert.equal(serializado.id, 3);
  assert.equal(serializado.nome, 'Loja Verde');
  assert.equal(serializado.login, 'lojaverde');
  assert.equal(serializado.cnpj, '**.***.***/****-99');
  assert.notEqual(serializado.email, 'contato@lojaverde.com');
  assert.ok(serializado.email.includes('@'));
  assert.ok(!('senha' in serializado));
  assert.ok(!('googleId' in serializado));
  assert.ok(!('resetToken' in serializado));
});

test('selects públicos não incluem campos sensíveis', () => {
  assert.ok(!('senha' in usuarioPublicSelect));
  assert.ok(!('googleId' in usuarioPublicSelect));
  assert.ok(!('resetToken' in usuarioPublicSelect));
  assert.ok(!('cpfCipher' in usuarioPublicSelect));
  assert.ok(!('cnpjCipher' in donoPublicSelect));
  assert.ok(!('googleId' in donoPublicSelect));
  assert.ok(!('resetTokenHash' in donoPublicSelect));
});

test('mascararEmail e mascararNomeCliente protegem dados pessoais', () => {
  const email = mascararEmail('joao.silva@gmail.com');
  const nome = mascararNomeCliente('João Silva', 42);

  assert.ok(email.includes('@'));
  assert.ok(!email.includes('joao'));
  assert.ok(nome.startsWith('Cliente #'));
  assert.ok(nome !== 'João Silva');
});

test('sanitizarParaLog remove senha, token, authorization, CPF, CNPJ, email e telefone', () => {
  const payload = {
    password: '123456',
    token: 'abc123',
    Authorization: 'Bearer abc123',
    cpf: '12345678909',
    cnpj: '12345678000199',
    email: 'joao@email.com',
    telefone: '11999998888',
    nested: { senha: 'segredo', accessToken: 'tok', email: 'a@b.com' },
  };

  const saida = sanitizarParaLog(payload);

  assert.equal(saida.password, '[REDACTED]');
  assert.equal(saida.token, '[REDACTED]');
  assert.equal(saida.Authorization, '[REDACTED]');
  assert.equal(saida.cpf, '[REDACTED]');
  assert.equal(saida.cnpj, '[REDACTED]');
  assert.equal(saida.email, '[REDACTED]');
  assert.equal(saida.telefone, '[REDACTED]');
  assert.equal(saida.nested.senha, '[REDACTED]');
  assert.equal(saida.nested.accessToken, '[REDACTED]');
  assert.equal(saida.nested.email, '[REDACTED]');
  assert.equal(typeof logger.info, 'function');
});

test('normalizarNomeArquivoExterno remove dados pessoais antes do envio para serviços externos', () => {
  const nome = normalizarNomeArquivoExterno('joao-silva-12345678909-foto.jpg');

  assert.ok(nome.startsWith('imagem-'));
  assert.ok(!nome.includes('joao'));
  assert.ok(!nome.includes('12345678909'));
  assert.ok(!nome.includes('silva'));
});

test('logs e respostas HTTP não expõem segredos nem PII completa', () => {
  const resposta = serializarUsuarioPublic({
    id: 42,
    nome: 'Ana Souza',
    email: 'ana.souza@email.com',
    cpf: '12345678909',
    telefone: '11999998888',
    senha: 'super-secret',
    googleId: 'google-123',
    resetToken: 'token-abc',
    emailCipher: 'enc-email',
    cpfCipher: 'enc-cpf',
  });

  const payload = {
    password: 'super-secret',
    Authorization: 'Bearer secret-token',
    email: 'ana.souza@email.com',
    cpf: '12345678909',
    token: 'token-abc',
    nested: { senha: 'senha-oculta', accessToken: 'abc123' },
  };

  const logSanitizado = sanitizarParaLog(payload);
  const respostaJson = JSON.stringify(resposta);
  const logJson = JSON.stringify(logSanitizado);

  assert.ok(!respostaJson.includes('super-secret'));
  assert.ok(!respostaJson.includes('12345678909'));
  assert.ok(!respostaJson.includes('ana.souza@email.com'));
  assert.ok(!logJson.includes('super-secret'));
  assert.ok(!logJson.includes('secret-token'));
  assert.ok(!logJson.includes('12345678909'));
  assert.ok(!logJson.includes('ana.souza@email.com'));
  assert.equal(resposta.cpf, '***.***.***-09');
  assert.equal(logSanitizado.password, '[REDACTED]');
  assert.equal(logSanitizado.Authorization, '[REDACTED]');
  assert.equal(logSanitizado.nested.senha, '[REDACTED]');
});
