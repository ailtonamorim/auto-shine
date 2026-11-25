// Testes locais: Express, bcrypt e JWT reais; banco e envio de e-mail simulados.
// Não lê .env, não conecta a banco externo e não envia mensagens.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { once } = require('node:events');
const { erroSenha, hashTokenRecuperacao } = require('../src/utils/senha');
process.env.JWT_SECRET = 'chave-local-exclusiva-dos-testes';
process.env.GOOGLE_CLIENT_ID = '';
process.env.GOOGLE_CLIENT_SECRET = '';
const originalPassword = 'Original123';
const originalHash = bcrypt.hashSync(originalPassword, 4);
const token = 'ab'.repeat(32);
let state, emailMessages, failWrite, failRead, failEmail, written, beforeWrite;
const db = {};
function matches(row, where) {
  return Object.entries(where).every(([k, v]) => {
    if (v instanceof Date) return +row[k] === +v;
    if (v && typeof v === 'object' && 'gt' in v) return row[k] != null && row[k] > v.gt;
    return row[k] === v;
  });
}
function apply(row, data) {
  for (const [k, v] of Object.entries(data)) row[k] = v && typeof v === 'object' && 'increment' in v ? row[k] + v.increment : v;
}
for (const tipo of ['usuario', 'dono']) {
  db[tipo] = {
    async findUnique({ where }) {
      if (failRead) throw new Error('simulated read failure');
      const row = state[tipo];
      return row && matches(row, where) ? structuredClone(row) : null;
    },
    async update({ where, data }) {
      if (failWrite) throw new Error('simulated write failure');
      const row = state[tipo];
      assert.ok(row && matches(row, where));
      apply(row, data); written++;
      return structuredClone(row);
    },
    async updateMany({ where, data }) {
      if (beforeWrite) beforeWrite(tipo, where, data);
      if (failWrite) throw new Error('simulated write failure');
      const row = state[tipo];
      if (!row || !matches(row, where)) return { count: 0 };
      apply(row, data); written++;
      return { count: 1 };
    },
  };
}
function mockModule(name, exports) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
mockModule('../src/config/database', db);
const emailMock = { emailTransporter: {}, enviarEmailReset: async data => {
  if (failEmail) throw new Error('simulated mail failure');
  emailMessages.push(data);
} };
mockModule('../src/config/email', emailMock);
// Evita que casos independentes compartilhem a cota de 5 solicitações por hora.
const security = require('../src/middlewares/security');
mockModule('../src/middlewares/security', { ...security, limitarReset: (_req, _res, next) => next() });
const tokens = require('../src/utils/tokens');
const auth = require('../src/middlewares/auth');
const app = express();
app.use(express.json());
app.use('/reset', require('../src/routes/resetSenha'));
app.use(require('../src/routes/auth'));
app.use('/api/dono', require('../src/routes/dono'));
app.use(require('../src/routes/profile'));
app.use('/api/admin', require('../src/routes/admin'));
db.$transaction = async fn => fn(db);
app.get('/user', auth.autenticarUsuario, (req, res) => res.json({ nome: req.usuario.nome }));
app.get('/owner', auth.autenticarDono, (_req, res) => res.json({ ok: true }));
app.get('/upload', auth.autenticarUpload, (_req, res) => res.json({ ok: true }));
app.get('/optional', auth.tentarAutenticarUsuario, (req, res) => res.json({ authenticated: !!req.usuario }));
app.get('/admin', auth.autenticarAdmin, (_req, res) => res.json({ ok: true }));
// Uma segunda instância da rota permite verificar ausência da configuração SMTP.
const resetPath = require.resolve('../src/routes/resetSenha');
delete require.cache[resetPath];
mockModule('../src/config/email', { ...emailMock, emailTransporter: null });
app.use('/no-email', require('../src/routes/resetSenha'));
mockModule('../src/config/email', emailMock);
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
});
beforeEach(() => {
  state = {};
  for (const tipo of ['usuario','dono']) state[tipo] = {
    id: 1, nome: 'Conta de teste', email: `${tipo}@example.test`, login: tipo,
    senha: originalHash, authVersion: 0, emailVerificadoEm: new Date(0), resetToken: hashTokenRecuperacao(token),
    resetTokenExpiry: new Date(Date.now() + 60000),
  };
  emailMessages = []; failWrite = false; failRead = false; failEmail = false;
  written = 0; beforeWrite = null;
});
async function request(path, { body, bearer, method } = {}) {
  const response = await fetch(base + path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
const confirm = (tipo = 'usuario', extra = {}) => request('/reset/confirmar', { body: { tipo, token, novaSenha: 'Atualizada456', ...extra } });

for (const tipo of ['usuario','dono']) {
  test(`${tipo}: link válido troca senha, revoga acessos e não pode ser reutilizado`, async () => {
    const old = tipo === 'usuario' ? tokens.gerarTokenUsuario(state[tipo]) : tokens.gerarTokenDono(state[tipo]);
    const path = tipo === 'usuario' ? '/user' : '/owner';
    assert.equal((await request(path, { bearer: old })).status, 200);
    assert.equal((await confirm(tipo)).status, 200);
    assert.equal(await bcrypt.compare('Atualizada456', state[tipo].senha), true);
    assert.equal(await bcrypt.compare(originalPassword, state[tipo].senha), false);
    assert.equal(state[tipo].resetToken, null);
    assert.equal(state[tipo].authVersion, 1);
    assert.equal((await confirm(tipo)).status, 400);
    assert.equal((await request(path, { bearer: old })).status, 401);
    assert.equal((await request('/upload', { bearer: old })).status, 401);
    const body = tipo === 'usuario' ? { email: state[tipo].email, senha: 'Atualizada456' } : { login: state[tipo].login, senha: 'Atualizada456' };
    const login = await request(tipo === 'usuario' ? '/api/auth/login' : '/api/dono/login', { body });
    assert.equal(login.status, 200);
    assert.equal((await request(path, { bearer: login.body.token })).status, 200);
  });
  test(`${tipo}: falha na gravação não informa sucesso nem consome o link`, async () => {
    failWrite = true;
    const result = await confirm(tipo);
    assert.equal(result.status, 500);
    assert.equal(result.body.ok, undefined);
    assert.equal(state[tipo].senha, originalHash);
    assert.equal(state[tipo].resetToken, hashTokenRecuperacao(token));
    failWrite = false;
    assert.equal((await confirm(tipo)).status, 200);
  });
  test(`${tipo}: link expirado é rejeitado`, async () => {
    state[tipo].resetTokenExpiry = new Date(Date.now() - 1);
    assert.equal((await confirm(tipo)).body.code, 'RESET_TOKEN_INVALIDO');
    assert.equal(written, 0);
  });
  test(`${tipo}: duas confirmações simultâneas produzem um único sucesso`, async () => {
    const results = await Promise.all([confirm(tipo), confirm(tipo, { novaSenha: 'OutraSenha789' })]);
    assert.deepEqual(results.map(r=>r.status).sort(), [200, 400]);
    assert.equal(state[tipo].authVersion, 1);
    assert.equal(written, 1);
  });
  test(`${tipo}: solicitar link guarda somente o hash e usa a conta correta`, async () => {
    const result = await request('/reset/solicitar', { body: { email: state[tipo].email, tipo } });
    assert.equal(result.status, 200);
    assert.equal(emailMessages.length, 1);
    const sent = emailMessages[0];
    assert.equal(sent.tipo, tipo);
    assert.match(sent.token, /^[a-f0-9]{64}$/);
    assert.notEqual(state[tipo].resetToken, sent.token);
    assert.equal(state[tipo].resetToken, hashTokenRecuperacao(sent.token));
    assert.equal((await confirm(tipo)).status, 400);
    assert.equal((await confirm(tipo, { token: sent.token })).status, 200);
  });
}

test('banco indisponível: erro ao confirmar, sem mensagem de sucesso', async () => {
  failRead = true;
  assert.equal((await confirm()).status, 500);
});
test('link inexistente e token malformado são rejeitados', async () => {
  for (const invalid of ['cd'.repeat(32), '', {}, null]) {
    assert.equal((await confirm('usuario', { token: invalid })).body.code, 'RESET_TOKEN_INVALIDO');
  }
  assert.equal(written, 0);
});
test('senha fraca ou acima do limite do bcrypt não consome o link', async () => {
  for (const novaSenha of ['abc123', 'abcdefgh', '12345678', 'A1'+'x'.repeat(71), 'A1'+'😀'.repeat(18), 12345678]) {
    assert.equal((await confirm('usuario', { novaSenha })).status, 400);
  }
  assert.equal(written, 0);
});
test('senha no limite de 72 bytes e espaços são preservados', async () => {
  const senha = ' A1'+'x'.repeat(68)+' ';
  assert.equal(erroSenha(senha), null);
  assert.equal((await confirm('usuario', { novaSenha: senha })).status, 200);
  assert.equal(await bcrypt.compare(senha, state.usuario.senha), true);
  assert.equal(await bcrypt.compare(senha.trim(), state.usuario.senha), false);
});
test('conta inexistente recebe a mesma resposta genérica de solicitação', async () => {
  const known = await request('/reset/solicitar', { body: { email: state.usuario.email, tipo:'usuario' } });
  const unknown = await request('/reset/solicitar', { body: { email: 'absent@example.test', tipo:'usuario' } });
  assert.deepEqual(unknown, known);
  assert.equal(emailMessages.length, 1);
});
test('sem SMTP configurado, a solicitação falha para qualquer email', async () => {
  for (const email of [state.usuario.email, 'absent@example.test']) {
    assert.equal((await request('/no-email/solicitar', { body:{email,tipo:'usuario'} })).status, 503);
  }
  assert.equal(written, 0);
});
test('falha no SMTP não informa envio e invalida o link que não foi enviado', async () => {
  failEmail = true;
  const result = await request('/reset/solicitar', { body:{email:state.usuario.email,tipo:'usuario'} });
  assert.equal(result.status, 503);
  assert.equal(state.usuario.resetToken, null);
});
test('falha ao emitir link é apresentada como erro', async () => {
  failWrite = true;
  assert.equal((await request('/reset/solicitar', { body:{email:state.usuario.email,tipo:'usuario'} })).status, 503);
  assert.equal(emailMessages.length, 0);
});
test('falha de email antigo não apaga um link emitido depois', async () => {
  failEmail = true;
  beforeWrite = (_tipo, where) => { if (where.resetToken) { state.usuario.resetToken = 'newer-link-hash'; beforeWrite = null; } };
  assert.equal((await request('/reset/solicitar', { body:{email:state.usuario.email,tipo:'usuario'} })).status, 503);
  assert.equal(state.usuario.resetToken, 'newer-link-hash');
});
test('JWT legado funciona na versão zero e é revogado após troca de senha', async () => {
  const legacy = jwt.sign({ id:1 }, process.env.JWT_SECRET);
  assert.equal((await request('/user', { bearer: legacy })).status, 200);
  await confirm();
  assert.equal((await request('/user', { bearer: legacy })).status, 401);
  assert.equal((await request('/optional', { bearer: legacy })).body.authenticated, false);
});
test('conta removida não continua autenticada', async () => {
  const bearer = tokens.gerarTokenUsuario(state.usuario);
  state.usuario = null;
  assert.equal((await request('/user', { bearer })).status, 401);
});
test('falha de banco na autenticação retorna 503, sem simular logout', async () => {
  const bearer = tokens.gerarTokenUsuario(state.usuario);
  failRead = true;
  assert.equal((await request('/user', { bearer })).status, 503);
});
test('perfis continuam separados e o token admin permanece válido', async () => {
  assert.equal((await request('/owner', { bearer:tokens.gerarTokenUsuario(state.usuario) })).status, 403);
  assert.equal((await request('/user', { bearer:tokens.gerarTokenDono(state.dono) })).status, 403);
  assert.equal((await request('/admin', { bearer:tokens.gerarTokenAdmin() })).status, 200);
});
test('troca pelo perfil exige senha atual, encerra acessos e invalida links anteriores', async () => {
  const bearer = tokens.gerarTokenUsuario(state.usuario);
  const body = { senhaAtual:originalPassword, novaSenha:'PerfilNovo123', confirmarSenha:'PerfilNovo123' };
  assert.equal((await request('/api/profile/password', { body:{...body,senhaAtual:'incorreta'},bearer })).status, 401);
  assert.equal(state.usuario.authVersion, 0);
  assert.equal((await request('/api/profile/password', { body,bearer })).status, 200);
  assert.equal(state.usuario.authVersion, 1);
  assert.equal(state.usuario.resetToken, null);
  assert.equal((await request('/user', { bearer })).status, 401);
});
test('perfil não sobrescreve uma troca concorrente', async () => {
  const bearer = tokens.gerarTokenUsuario(state.usuario);
  beforeWrite = () => { state.usuario.authVersion++; beforeWrite=null; };
  const result = await request('/api/profile/password', { bearer,body:{senhaAtual:originalPassword,novaSenha:'PerfilNovo123',confirmarSenha:'PerfilNovo123'} });
  assert.equal(result.status, 409);
  assert.equal(state.usuario.senha, originalHash);
});
test('cadastro do cliente e parceiro recusam a mesma senha fraca', async () => {
  assert.equal((await request('/api/auth/signup', { body:{nome:'Teste',email:'test@example.test',cpf:'52998224725',telefone:'62999999999',senha:'abc123'} })).body.error, erroSenha('abc123'));
  assert.equal((await request('/api/dono/cadastro', { body:{nome:'Teste',login:'teste',email:'teste@example.test',cnpj:'11222333000181',senha:'abc123'} })).body.error, erroSenha('abc123'));
});

test('expiração é revalidada na gravação, depois do cálculo da senha', async () => {
  beforeWrite = () => { state.usuario.resetTokenExpiry = new Date(0); beforeWrite = null; };
  assert.equal((await confirm()).status, 400);
  assert.equal(state.usuario.senha, originalHash);
});
for (const [tipo, endpoint] of [['usuario','usuarios'],['dono','donos']]) {
  test(`admin: troca de senha de ${tipo} usa a política e revoga acessos`, async () => {
    const old = tipo === 'usuario' ? tokens.gerarTokenUsuario(state[tipo]) : tokens.gerarTokenDono(state[tipo]);
    const bearer = tokens.gerarTokenAdmin();
    const path = `/api/admin/${endpoint}/1`;
    assert.equal((await request(path,{method:'PUT',bearer,body:{senha:'abc123'}})).status, 400);
    assert.equal((await request(path,{method:'PUT',bearer,body:{senha:'AlteradaAdmin123'}})).status, 200);
    assert.equal(state[tipo].authVersion, 1);
    assert.equal(state[tipo].resetToken, null);
    assert.equal(await bcrypt.compare('AlteradaAdmin123', state[tipo].senha), true);
    assert.equal((await request('/upload',{bearer:old})).status, 401);
  });
}

// Exercita o controlador da tela sem navegador ou dependências extras.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function resetScreen(search, responder) {
  const ids = ['reset-request-panel','reset-confirm-panel','reset-request-form','reset-request-success','reset-confirm-form','reset-confirm-success','reset-invalid-token','reset-login-link','reset-tipo','reset-new-link','reset-new-password','reset-confirm-password','reset-email'];
  const elements = {};
  for (const id of ids) {
    const hidden = new Set(id.includes('success') || id === 'reset-invalid-token' || id === 'reset-confirm-panel' ? ['hidden'] : []);
    elements[id] = { value:'', href:'', button:{disabled:false}, listeners:{},
      classList: { add:x=>hidden.add(x), remove:x=>hidden.delete(x), contains:x=>hidden.has(x) },
      addEventListener(type, fn) { this.listeners[type]=fn; },
      querySelector() { return this.button; },
      reset() { this.didReset = true; },
    };
  }
  const changes = { notices:[], calls:0, cleared:[], url:null };
  const source = fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8');
  const start = source.indexOf('function initResetSenhaPage()');
  const end = source.indexOf('// ── Inicialização por página', start);
  const context = {
    // O bloqueio genérico é exercitado separadamente em popups.test.js.
    guardAction: handler => handler,
    URLSearchParams, AutoShinePassword:{erroSenha},
    document:{getElementById:id=>elements[id]},
    window:{location:{search},history:{replaceState:(_a,_b,url)=>{changes.url=url;}}},
    fetch:async()=>{changes.calls++;return responder();},
    notify:msg=>changes.notices.push(msg),
    clearCurrentUser:()=>changes.cleared.push('usuario'), clearDonoToken:()=>changes.cleared.push('dono'),
  };
  vm.runInNewContext(source.slice(start,end)+'\ninitResetSenhaPage();',context);
  elements['reset-new-password'].value='SenhaTela123';
  elements['reset-confirm-password'].value='SenhaTela123';
  elements['reset-email'].value='conta@example.test';
  return { elements, changes, submit:which=>elements[which].listeners.submit({preventDefault(){}}) };
}
const reply = (status, body) => ({ok:status>=200&&status<300,status,json:async()=>body});
test('tela: falha de gravação mantém formulário, libera botão e não mostra sucesso', async () => {
  const ui = resetScreen(`?token=${token}`,()=>reply(500,{error:'Não foi possível alterar a senha.'}));
  await ui.submit('reset-confirm-form');
  assert.equal(ui.elements['reset-confirm-form'].classList.contains('hidden'),false);
  assert.equal(ui.elements['reset-confirm-success'].classList.contains('hidden'),true);
  assert.equal(ui.elements['reset-confirm-form'].button.disabled,false);
  assert.equal(ui.changes.notices.length,1);
  assert.deepEqual(ui.changes.cleared,[]);
});
test('tela: sucesso encerra sessão, limpa formulário e remove token da URL', async () => {
  const ui = resetScreen(`?tipo=dono&token=${token}`,()=>reply(200,{ok:true}));
  await ui.submit('reset-confirm-form');
  assert.equal(ui.elements['reset-confirm-success'].classList.contains('hidden'),false);
  assert.equal(ui.elements['reset-confirm-form'].didReset,true);
  assert.deepEqual(ui.changes.cleared,['dono']);
  assert.equal(ui.changes.url,'reset-senha.html?tipo=dono');
});
test('tela: link inválido do parceiro permite solicitar outro link de parceiro', async () => {
  const ui = resetScreen(`?tipo=dono&token=${token}`,()=>reply(400,{code:'RESET_TOKEN_INVALIDO'}));
  await ui.submit('reset-confirm-form');
  assert.equal(ui.elements['reset-invalid-token'].classList.contains('hidden'),false);
  assert.equal(ui.elements['reset-new-link'].href,'reset-senha.html?tipo=dono');
});
test('tela: clique duplo não envia confirmações duplicadas', async () => {
  let finish;
  const pending = new Promise(resolve=>{finish=resolve;});
  const ui = resetScreen(`?token=${token}`,()=>pending);
  const first=ui.submit('reset-confirm-form');
  await ui.submit('reset-confirm-form');
  assert.equal(ui.changes.calls,1);
  assert.equal(ui.elements['reset-confirm-form'].button.disabled,true);
  finish(reply(200,{ok:true}));
  await first;
});
test('tela: senhas diferentes são rejeitadas antes da requisição', async () => {
  const ui = resetScreen(`?token=${token}`,()=>reply(200,{ok:true}));
  ui.elements['reset-confirm-password'].value='Diferente123';
  await ui.submit('reset-confirm-form');
  assert.equal(ui.changes.calls,0);
});
test('tela: falha ao solicitar email mantém o formulário disponível', async () => {
  const ui = resetScreen('?tipo=dono',()=>reply(503,{error:'Temporariamente indisponível.'}));
  await ui.submit('reset-request-form');
  assert.equal(ui.elements['reset-request-success'].classList.contains('hidden'),true);
  assert.equal(ui.elements['reset-request-form'].button.disabled,false);
  assert.equal(ui.changes.notices.length,1);
});
test('telas carregam a política compartilhada antes do código principal', () => {
  for (const page of ['cadastro.html','cadastro-dono.html','reset-senha.html','perfil-usuario.html','admin.html']) {
    const html=fs.readFileSync(path.join(__dirname,'..',page),'utf8');
    const policy=html.indexOf('src="assets/js/politica-senha.js"');
    assert.ok(policy>0 && policy<html.indexOf('src="assets/js/app.js"'));
  }
});
