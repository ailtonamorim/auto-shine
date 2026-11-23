// Rotas HTTP reais; persistência, Google e entrega de e-mail simulados.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const bcrypt = require('bcrypt');
const { hashTokenRecuperacao: digest } = require('../src/utils/senha');
process.env.JWT_SECRET = 'somente-testes-verificacao';
process.env.GOOGLE_CLIENT_ID = ''; process.env.GOOGLE_CLIENT_SECRET = '';
const password = 'Original123', hash = bcrypt.hashSync(password, 4);
let rows, sent, failMail, failWrite, beforeWrite;
function matches(row, where = {}) {
  return Object.entries(where).every(([key, val]) => {
    if (key === 'OR') return val.some(part => matches(row, part));
    if (val instanceof Date) return +row[key] === +val;
    if (val && typeof val === 'object') {
      if ('gt' in val) return row[key] != null && row[key] > val.gt;
      if ('lte' in val) return row[key] != null && row[key] <= val.lte;
    }
    return row[key] === val;
  });
}
const defaults = () => ({ senha: null, email: null, googleId: null, cpf: null, cnpj: null, authVersion: 0, emailVerificadoEm: null, emailVerificacaoToken: null, emailVerificacaoExpiraEm: null, emailVerificacaoEnviadaEm: null, resetToken: null, resetTokenExpiry: null });
const db = {};
for (const tipo of ['usuario', 'dono']) {
  function unique(data, except) {
    for (const field of ['email', 'googleId', 'emailVerificacaoToken', ...(tipo === 'usuario' ? ['cpf'] : ['login'])]) {
      if (data[field] != null && rows[tipo].some(x => x.id !== except && x[field] === data[field])) throw Object.assign(new Error('unique'), { code:'P2002' });
    }
  }
  db[tipo] = {
    async findUnique({where}) { return structuredClone(rows[tipo].find(r => matches(r, where)) || null); },
    async findFirst({where}) { return this.findUnique({where}); },
    async create({data}) { unique(data); const row = {...defaults(), id:rows[tipo].length+1, ...data}; rows[tipo].push(row); return structuredClone(row); },
    async updateMany({where, data}) {
      if (beforeWrite) beforeWrite(tipo, where, data);
      if (failWrite) throw new Error('database unavailable');
      let count=0;
      for(const row of rows[tipo]) if(matches(row,where)) {
        unique(data,row.id);
        for(const [k,v] of Object.entries(data)) row[k] = v && typeof v === 'object' && 'increment' in v ? row[k]+v.increment : v;
        count++;
      }
      return {count};
    },
    async update({where,data}) { const result=await this.updateMany({where,data}); assert.equal(result.count,1); return this.findUnique({where}); },
  };
}
db.$transaction = async fn => { const snapshot=structuredClone(rows); try { return await fn(db); } catch(e) { rows=snapshot; throw e; } };
function mock(name, exports) { const id=require.resolve(name); require.cache[id]={id,filename:id,loaded:true,exports}; }
mock('../src/config/database',db);
mock('../src/utils/geocode',{consultarCnpjBrasilApi:async()=>({valido:true})});
const email = {emailTransporter:{}, enviarEmailVerificacao:async data=>{if(failMail) throw Error('smtp');sent.push({...data,purpose:'verify'});}, enviarEmailReset:async data=>{if(failMail) throw Error('smtp');sent.push({...data,purpose:'reset'});}};
mock('../src/config/email',email);
const security=require('../src/middlewares/security');
mock('../src/middlewares/security',{...security,limitarVerificacao:(_q,_s,n)=>n(),limitarAuth:(_q,_s,n)=>n(),limitarReset:(_q,_s,n)=>n()});
const app=express();app.use(express.json());
app.use(require('../src/routes/auth'));
app.use('/api/dono',require('../src/routes/dono'));
app.use('/verify',require('../src/routes/verificacaoEmail'));
app.use('/reset',require('../src/routes/resetSenha'));
app.use('/api/admin',require('../src/routes/admin'));
const auth=require('../src/middlewares/auth'), tokens=require('../src/utils/tokens');
app.get('/private',auth.autenticarUsuario,(_q,s)=>s.json({ok:true}));
app.get('/upload',auth.autenticarUpload,(_q,s)=>s.json({ok:true}));
app.get('/optional',auth.tentarAutenticarUsuario,(q,s)=>s.json({ok:!!q.usuario}));
const { obterContaGoogle }=require('../src/utils/conta-google');
// Outra instância, sem SMTP: bloqueia antes de gravar o cadastro.
const utilityPath=require.resolve('../src/utils/verificacao-email'), authPath=require.resolve('../src/routes/auth');
const savedUtility=require.cache[utilityPath];
delete require.cache[utilityPath];delete require.cache[authPath];mock('../src/config/email',{...email,emailTransporter:null});
app.use('/sem-email',require('../src/routes/auth'));
require.cache[utilityPath]=savedUtility;mock('../src/config/email',email);
let server, base;
before(async()=>{server=app.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(r=>server.close(r));});
beforeEach(()=>{rows={usuario:[],dono:[]};sent=[];failMail=false;failWrite=false;beforeWrite=null;});
async function req(path,body,extra={}) { const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...extra.headers},...(body===undefined?{}:{body:JSON.stringify(body)}),...extra}); return {status:res.status,body:await res.json()}; }
const signup = {
 usuario:{path:'/api/auth/signup',body:{nome:'Cliente',email:' Pessoa@Example.test ',cpf:'52998224725',telefone:'62999999999',senha:password}},
 dono:{path:'/api/dono/cadastro',body:{nome:'Parceiro',email:' Pessoa@Example.test ',login:'parceiro',cnpj:'11222333000181',senha:password}},
};
async function register(tipo){return req(signup[tipo].path,signup[tipo].body);}
const login=(tipo)=>req(tipo==='usuario'?'/api/auth/login':'/api/dono/login',tipo==='usuario'?{email:'pessoa@example.test',senha:password}:{login:'parceiro',senha:password});
const confirm=(tipo,token)=>req('/verify/confirmar',{tipo,token});
for(const tipo of ['usuario','dono']) {
 test(`${tipo}: cadastro exige confirmação e só então permite login`,async()=>{
  const created=await register(tipo);assert.equal(created.status,201);assert.equal(created.body.token,undefined);assert.equal(created.body.verificacaoPendente,true);
  const conta=rows[tipo][0];assert.equal(conta.email,'pessoa@example.test');assert.equal(conta.emailVerificadoEm,null);
  assert.equal(sent[0].para,conta.email);assert.equal(sent[0].tipo,tipo);assert.equal(conta.emailVerificacaoToken,digest(sent[0].token));assert.notEqual(conta.emailVerificacaoToken,sent[0].token);
  assert.equal((await login(tipo)).body.code,'EMAIL_NAO_VERIFICADO');
  assert.equal((await confirm(tipo,sent[0].token)).status,200);assert.ok(conta.emailVerificadoEm);assert.equal(conta.emailVerificacaoToken,null);
  assert.equal((await login(tipo)).status,200);assert.equal((await confirm(tipo,sent[0].token)).status,400);
 });
 test(`${tipo}: logins repetidos não enviam e-mail nem desfazem a confirmação`,async()=>{
  await register(tipo);await confirm(tipo,sent[0].token);
  const marker=rows[tipo][0].emailVerificadoEm, mailCount=sent.length;
  for(let i=0;i<2;i++) {const result=await login(tipo);assert.equal(result.status,200);assert.ok(result.body.token);}
  assert.equal(sent.length,mailCount);assert.equal(rows[tipo][0].emailVerificadoEm,marker);
  assert.equal(rows[tipo][0].emailVerificacaoToken,null);
 });
 test(`${tipo}: recuperação usa exatamente o e-mail confirmado e token separado`,async()=>{
  await register(tipo);const verification=sent[0].token;
  assert.equal((await req('/reset/confirmar',{tipo,token:verification,novaSenha:'NovaSenha123'})).status,400);
  await confirm(tipo,verification);
  await req('/reset/solicitar',{tipo,email:'PESSOA@example.test'});const recovery=sent.at(-1);
  assert.equal(recovery.purpose,'reset');assert.equal(recovery.para,rows[tipo][0].email);
  assert.equal((await confirm(tipo,recovery.token)).status,400);
  assert.equal((await req('/reset/confirmar',{tipo,token:recovery.token,novaSenha:'NovaSenha123'})).status,200);
  assert.ok(await bcrypt.compare('NovaSenha123',rows[tipo][0].senha));
 });
 test(`${tipo}: link vencido não ativa a conta`,async()=>{
  await register(tipo);rows[tipo][0].emailVerificacaoExpiraEm=new Date(0);
  assert.equal((await confirm(tipo,sent[0].token)).status,400);assert.equal(rows[tipo][0].emailVerificadoEm,null);
 });
 test(`${tipo}: reenvio tem intervalo, substitui o link e não altera senha`,async()=>{
  await register(tipo);const old=sent[0].token, senha=rows[tipo][0].senha;
  await req('/verify/solicitar',{tipo,email:'pessoa@example.test'});assert.equal(sent.length,1);
  rows[tipo][0].emailVerificacaoEnviadaEm=new Date(Date.now()-61000);
  await Promise.all([req('/verify/solicitar',{tipo,email:'pessoa@example.test'}),req('/verify/solicitar',{tipo,email:'pessoa@example.test'})]);
  assert.equal(sent.length,2);assert.equal(rows[tipo][0].senha,senha);assert.equal((await confirm(tipo,old)).status,400);assert.equal((await confirm(tipo,sent[1].token)).status,200);
 });
 test(`${tipo}: duas confirmações simultâneas produzem um só sucesso`,async()=>{
  await register(tipo);const results=await Promise.all([confirm(tipo,sent[0].token),confirm(tipo,sent[0].token)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal(rows[tipo][0].authVersion,1);
 });
 test(`${tipo}: falha no envio mantém cadastro pendente e permite reenviar`,async()=>{
  failMail=true;const created=await register(tipo);assert.equal(created.status,503);assert.equal(created.body.verificacaoPendente,true);
  assert.equal(rows[tipo][0].emailVerificacaoToken,null);assert.equal((await login(tipo)).status,403);
  failMail=false;assert.equal((await req('/verify/solicitar',{tipo,email:'pessoa@example.test'})).status,200);assert.equal(sent.length,1);
 });
 test(`${tipo}: e-mail inválido ou ausente não cria conta`,async()=>{
  for(const email of ['invalid','',null,{},'a@b.test\r\nBcc: c@d.test']) assert.equal((await req(signup[tipo].path,{...signup[tipo].body,email})).status,400);
  assert.equal(rows[tipo].length,0);assert.equal(sent.length,0);
 });
 test(`${tipo}: recuperação de conta pendente envia confirmação, nunca reset`,async()=>{
  await register(tipo);sent=[];rows[tipo][0].emailVerificacaoEnviadaEm=null;
  assert.equal((await req('/reset/solicitar',{tipo,email:'pessoa@example.test'})).status,200);
  assert.equal(sent.length,1);assert.equal(sent[0].purpose,'verify');assert.equal(rows[tipo][0].resetToken,null);
 });
}
test('sem SMTP não cria cadastro nem informa envio',async()=>{const result=await req('/sem-email/api/auth/signup',signup.usuario.body);assert.equal(result.status,503);assert.equal(rows.usuario.length,0);});
test('JWT antigo ou forjado de conta pendente não libera API, upload ou acesso opcional',async()=>{
 await register('usuario');const bearer=tokens.gerarTokenUsuario(rows.usuario[0]);const headers={Authorization:`Bearer ${bearer}`};
 assert.equal((await req('/private',undefined,{headers})).status,401);assert.equal((await req('/upload',undefined,{headers})).status,401);assert.equal((await req('/optional',undefined,{headers})).body.ok,false);
});
test('erro de banco não confirma nem consome token',async()=>{await register('usuario');failWrite=true;assert.equal((await confirm('usuario',sent[0].token)).status,503);assert.equal(rows.usuario[0].emailVerificadoEm,null);failWrite=false;assert.equal((await confirm('usuario',sent[0].token)).status,200);});
test('token não aceita papel diferente nem formato inválido',async()=>{await register('usuario');assert.equal((await confirm('dono',sent[0].token)).status,400);for(const token of ['',null,{},'x'.repeat(64)]) assert.equal((await confirm('usuario',token)).status,400);assert.equal((await confirm('admin',sent[0].token)).status,400);});
test('reenvio não revela conta inexistente ou já confirmada',async()=>{await register('usuario');const data={tipo:'usuario',email:'pessoa@example.test'};const pending=await req('/verify/solicitar',data);await confirm('usuario',sent[0].token);assert.deepEqual(await req('/verify/solicitar',data),pending);assert.deepEqual(await req('/verify/solicitar',{...data,email:'missing@example.test'}),pending);});
test('falha de envio não apaga link posterior',async()=>{await register('usuario');rows.usuario[0].emailVerificacaoEnviadaEm=null;failMail=true;beforeWrite=(_t,where)=>{if(where.emailVerificacaoToken){rows.usuario[0].emailVerificacaoToken='newer';beforeWrite=null;}};assert.equal((await req('/verify/solicitar',{tipo:'usuario',email:'pessoa@example.test'})).status,503);assert.equal(rows.usuario[0].emailVerificacaoToken,'newer');});
test('GET não confirma: scanners não consomem o link',async()=>{await register('usuario');const result=await fetch(base+'/verify/confirmar?token='+sent[0].token);assert.equal(result.status,404);assert.equal(rows.usuario[0].emailVerificadoEm,null);});
test('cadastro duplicado não altera senha nem sobrescreve conta pendente',async()=>{await register('usuario');const senha=rows.usuario[0].senha;assert.equal((await req(signup.usuario.path,{...signup.usuario.body,senha:'Diferente123'})).status,409);assert.equal(rows.usuario[0].senha,senha);});
test('parceiro legado precisa da senha para vincular e-mail e só entra após confirmar',async()=>{
 rows.dono.push({...defaults(),id:1,nome:'Antigo',login:'antigo',senha:hash});
 const body={login:'antigo',senha:password,email:'antigo@example.test'};
 assert.equal((await req('/api/dono/login',{login:'antigo',senha:password})).body.code,'EMAIL_NECESSARIO');
 assert.equal((await req('/verify/vincular',{...body,senha:'errada'})).status,401);assert.equal(rows.dono[0].email,null);
 assert.equal((await req('/verify/vincular',body)).status,200);assert.equal(rows.dono[0].emailVerificadoEm,null);
 assert.equal((await req('/verify/vincular',{...body,email:'outro@example.test'})).status,409);
 assert.equal((await confirm('dono',sent[0].token)).status,200);
 assert.equal((await req('/api/dono/login',{login:'antigo',senha:password})).status,200);
});
test('troca de e-mail por admin revoga sessões, links e confirmação anterior',async()=>{
 await register('usuario');await confirm('usuario',sent[0].token);const old=tokens.gerarTokenUsuario(rows.usuario[0]);
 const result=await req('/api/admin/usuarios/1',{email:'novo@example.test'},{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${tokens.gerarTokenAdmin()}`}});
 assert.equal(result.status,200);assert.equal(rows.usuario[0].emailVerificadoEm,null);assert.equal(rows.usuario[0].resetToken,null);
 assert.equal((await req('/private',undefined,{headers:{Authorization:`Bearer ${old}`}})).status,401);
});
test('recuperação revalida o e-mail na gravação: não sobrescreve troca concorrente',async()=>{
 await register('usuario');await confirm('usuario',sent[0].token);await req('/reset/solicitar',{tipo:'usuario',email:'pessoa@example.test'});
 beforeWrite=()=>{rows.usuario[0].email='outro@example.test';rows.usuario[0].emailVerificadoEm=null;beforeWrite=null;};
 assert.equal((await req('/reset/confirmar',{tipo:'usuario',token:sent.at(-1).token,novaSenha:'NovaSenha123'})).status,400);
});
for(const tipo of ['usuario','dono']) {
 test(`Google ${tipo}: exige e-mail confirmado pelo provedor`,async()=>{
  await assert.rejects(obterContaGoogle({id:'google1',email:'g@example.test',emailVerified:false},tipo));assert.equal(rows[tipo].length,0);
  const c=await obterContaGoogle({id:'google1',email:'g@example.test',emailVerified:true},tipo);assert.ok(c.emailVerificadoEm);assert.equal(c.email,'g@example.test');
 });
 test(`Google ${tipo}: não mantém senha de cadastro pendente ao vincular identidade`,async()=>{
  await register(tipo);const c=await obterContaGoogle({id:'google1',email:'pessoa@example.test',emailVerified:true},tipo);
  assert.equal(rows[tipo].length,1);assert.equal(c.senha,null);assert.equal(c.googleId,'google1');assert.equal(c.emailVerificacaoToken,null);assert.equal(c.authVersion,1);
 });
}
test('limite real de solicitações devolve 429 após a cota',()=>{
 const limit=security.criarLimitador({janelaMs:10000,maximo:2});let next=0,status;
 const res={status(v){status=v;return this;},json(){}};for(let i=0;i<3;i++)limit({ip:'local',method:'POST',path:'/solicitar'},res,()=>next++);
 assert.equal(next,2);assert.equal(status,429);
});

const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
function screen({token='ab'.repeat(32),tipo='usuario',respond=async()=>({ok:true,json:async()=>({mensagem:'Confirmado'})})}={}) {
 const ids=['email-tipo','email-confirm-form','email-request-form','email-link-form','email-feedback','email-login-link','email-reset-link','email-legacy-panel','email-address','email-login','email-password','email-new-address'];
 const elements={};for(const id of ids){const hidden=new Set();elements[id]={value:'',disabled:false,button:{disabled:false},listeners:{},attributes:{},classList:{toggle(k,on){on?hidden.add(k):hidden.delete(k);},add:k=>hidden.add(k),remove:k=>hidden.delete(k),contains:k=>hidden.has(k)},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){this.listeners[k]=v;},querySelector(){return this.button;},reset(){this.wasReset=true;}};}
 const state={calls:[],redirects:[],url:null};const context={URLSearchParams,redirectWithNotice:(url,message,type)=>state.redirects.push({url,message,type}),document:{body:{dataset:{page:'verificar-email'}},getElementById:id=>elements[id]},window:{location:{search:`?tipo=${tipo}`,hash:token?`#token=${token}`:''},history:{replaceState:(_a,_b,url)=>{state.url=url;}}},sessionStorage:{getItem:()=>'',removeItem(){}},fetch:async(url,options)=>{state.calls.push({url,body:JSON.parse(options.body)});return respond();}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/verificar-email.js'),'utf8').replace('if (document.body.dataset.page === \"verificar-email\") initVerificarEmailPage();','inicializacao = initVerificarEmailPage();'),context);
 return {elements,state,ready:context.inicializacao,submit:id=>elements[id].listeners.submit({preventDefault(){}})};
}
test('tela: abrir link retira token da URL e confirma automaticamente',async()=>{
 const s=screen();assert.equal(s.state.calls.length,1);assert.equal(s.state.url,'verificar-email.html?tipo=usuario');
 assert.equal(s.elements['email-tipo'].disabled,true);assert.equal(s.state.redirects.length,0);
 await s.ready;assert.equal(s.state.calls[0].body.token,'ab'.repeat(32));
 assert.equal(s.state.calls[0].url,'/api/verificacao-email/confirmar');
});
for(const tipo of ['usuario','dono']) test(`tela ${tipo}: só redireciona ao login após confirmação do servidor`,async()=>{
 let finish;const pending=new Promise(r=>{finish=r;});const s=screen({tipo,respond:()=>pending});
 assert.equal(s.state.redirects.length,0);assert.equal(s.elements['email-feedback'].textContent,'Processando…');
 finish({ok:true,json:async()=>({mensagem:'Confirmado'})});await s.ready;
 assert.equal(s.elements['email-confirm-form'].classList.contains('hidden'),true);
 assert.equal(s.state.redirects.length,1);
 assert.equal(s.state.redirects[0].url,`cadastro.html?perfil=${tipo==='dono'?'empresa':'cliente'}&mode=login`);
 assert.equal(s.state.redirects[0].type,'success');
});
test('tela: sem token não confirma nem envia e-mail automaticamente',async()=>{
 const s=screen({token:null});await s.ready;assert.equal(s.state.calls.length,0);assert.equal(s.state.redirects.length,0);
 assert.equal(s.elements['email-request-form'].classList.contains('hidden'),false);
});
test('tela: falha temporária permite repetir a confirmação',async()=>{
 let attempt=0;const s=screen({respond:async()=>++attempt===1?{ok:false,json:async()=>({error:'Falha temporária'})}:{ok:true,json:async()=>({mensagem:'Confirmado'})}});
 await s.ready;assert.equal(s.state.redirects.length,0);assert.equal(s.elements['email-confirm-form'].classList.contains('hidden'),false);
 assert.equal(s.elements['email-confirm-form'].button.disabled,false);assert.equal(s.elements['email-feedback'].attributes.role,'alert');
 await s.submit('email-confirm-form');assert.equal(s.state.calls.length,2);assert.equal(s.state.redirects.length,1);
});
test('tela: link vencido oferece reenvio no mesmo tipo de conta',async()=>{
 const s=screen({tipo:'dono',respond:async()=>({ok:false,json:async()=>({code:'EMAIL_TOKEN_INVALIDO',error:'Expirado'})})});await s.ready;
 assert.equal(s.state.redirects.length,0);assert.equal(s.elements['email-request-form'].classList.contains('hidden'),false);
 assert.equal(s.elements['email-confirm-form'].classList.contains('hidden'),true);assert.equal(s.elements['email-reset-link'].href,'reset-senha.html?tipo=dono');
});
test('tela: clique durante confirmação automática não duplica a solicitação',async()=>{
 let finish;const pending=new Promise(r=>{finish=r;});const s=screen({respond:()=>pending});await s.submit('email-confirm-form');
 assert.equal(s.state.calls.length,1);finish({ok:true,json:async()=>({mensagem:'Confirmado'})});await s.ready;assert.equal(s.state.redirects.length,1);
});
test('tela: vínculo legado envia credenciais só no corpo e limpa formulário no sucesso',async()=>{
 const s=screen({token:null,tipo:'dono'});s.elements['email-login'].value='antigo';s.elements['email-password'].value='Segredo123';s.elements['email-new-address'].value='antigo@example.test';
 await s.submit('email-link-form');assert.equal(s.state.calls[0].url,'/api/verificacao-email/vincular');assert.equal(s.state.calls[0].body.senha,'Segredo123');assert.equal(s.elements['email-link-form'].wasReset,true);assert.equal(s.elements['email-address'].value,'antigo@example.test');
});
test('tela: falha de conexão não redireciona e libera botão',async()=>{
 const s=screen({respond:async()=>{throw Error('offline');}});await s.ready;assert.equal(s.state.redirects.length,0);
 assert.match(s.elements['email-feedback'].textContent,/conectar/);assert.equal(s.elements['email-confirm-form'].button.disabled,false);
});

test('mensagens: links usam APP_URL, propósitos separados e nome escapado',async()=>{
 const env={user:process.env.EMAIL_USER,pass:process.env.EMAIL_PASS,url:process.env.APP_URL};
 process.env.EMAIL_USER='sender@example.test';process.env.EMAIL_PASS='fake';process.env.APP_URL='https://autoshine.example.test';
 let mail;const nodemailerPath=require.resolve('nodemailer'),old=require.cache[nodemailerPath];
 mock('nodemailer',{createTransport:()=>({sendMail:async data=>{mail=data;return {accepted:[data.to]};}})});
 const emailPath=require.resolve('../src/config/email');delete require.cache[emailPath];
 try {
  const service=require('../src/config/email');
  await service.enviarEmailVerificacao({para:'person@example.test',nome:'<img src=x>',tipo:'dono',token:'ab'.repeat(32)});
  assert.equal(mail.to,'person@example.test');assert.match(mail.text,/https:\/\/autoshine.example.test\/verificar-email.html\?tipo=dono#token=/);assert.match(mail.html,/&lt;img src=x&gt;/);assert.doesNotMatch(mail.html,/<img src=x>/);
  await service.enviarEmailReset({para:'person@example.test',nome:'Pessoa',tipo:'usuario',token:'cd'.repeat(32)});
  assert.match(mail.text,/reset-senha.html\?tipo=usuario&token=/);assert.match(mail.html,/1 hora/);
 } finally {
  if(old)require.cache[nodemailerPath]=old;else delete require.cache[nodemailerPath];mock('../src/config/email',email);
  for(const [key,val] of Object.entries({EMAIL_USER:env.user,EMAIL_PASS:env.pass,APP_URL:env.url})) {if(val===undefined)delete process.env[key];else process.env[key]=val;}
 }
});
