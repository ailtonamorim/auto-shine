// Motor real e rotas Express reais; persistência/autenticação simuladas.
// O teste separado agenda-postgres.test.js verifica o bloqueio com PostgreSQL real.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let shops, services, bookings, audit, sequence, queue, failAudit;
function matches(row, where = {}) {
  return row && Object.entries(where).every(([key,value]) => {
    if (key === 'loja') return matches(shops.find(s=>s.id===row.lojaId),value);
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key]);
      if ('lte' in value) return row[key] <= value.lte;
      if ('not' in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
}
function apply(row, data) { for (const [k,v] of Object.entries(data)) row[k]=v && typeof v==='object' && 'increment' in v ? row[k]+v.increment : structuredClone(v); }
function details(row) { return row ? structuredClone({...row,loja:shops.find(s=>s.id===row.lojaId),servico:services.find(s=>s.id===row.servicoId),alteracoes:audit.filter(a=>a.agendamentoId===row.id)}) : null; }
const db={
  loja: {
    async findFirst({where}) { return structuredClone(shops.find(s=>matches(s,where)) || null); },
    async findUnique({where}) { return this.findFirst({where}); },
    async update({where,data}) { const row=shops.find(s=>matches(s,where)); apply(row,data); return structuredClone(row); },
  },
  servicoLoja: { async findFirst({where}) { return structuredClone(services.find(s=>matches(s,where)) || null); } },
  agendamento: {
    async findFirst({where}) { return details(bookings.find(b=>matches(b,where))); },
    async findUnique({where}) { return this.findFirst({where}); },
    async findMany({where}) { return bookings.filter(b=>matches(b,where)).map(details); },
    async create({data}) { const row={id:sequence++,revisao:0,status:'pendente',...structuredClone(data)};bookings.push(row);return details(row); },
    async updateMany({where,data}) { const rows=bookings.filter(b=>matches(b,where));for(const row of rows)apply(row,data);return {count:rows.length}; },
    async update({where,data}) { const row=bookings.find(b=>matches(b,where));apply(row,data);return details(row); },
  },
  alteracaoAgendamento: { async create({data}) { if(failAudit)throw new Error('Falha simulada de histórico');audit.push(structuredClone(data));return data; } },
  async $transaction(fn,options) {
    // A fila só é adquirida quando a implementação executa SELECT ... FOR UPDATE.
    let release, snapshot;
    const tx={...db,async $queryRaw(strings,...values) {
      assert.match(strings.join('?'),/FROM "Loja".*FOR UPDATE/);
      const id=values[0];assert.ok(Number.isInteger(id));
      const previous=queue;queue=new Promise(resolve=>{release=resolve;});await previous;
      snapshot=structuredClone({shops,bookings,audit});
      return shops.some(s=>s.id===id)?[{id}]:[];
    }};
    try { return await fn(tx); }
    catch(err) { if(snapshot)({shops,bookings,audit}=snapshot);throw err; }
    finally { if(release)release(); }
  },
};
function mock(name,exports) {const id=require.resolve(name);require.cache[id]={id,filename:id,loaded:true,exports};}
mock('../src/config/database',db);
mock('../src/middlewares/auth',{
  autenticarUsuario(req,_res,next){req.usuario={id:Number(req.headers['x-user-id']||1),nome:'Cliente'};next();},
  autenticarDono(req,_res,next){req.dono={donoId:Number(req.headers['x-owner-id']||1),nome:'Parceiro'};next();},
  autenticarAdmin(_req,_res,next){next();},
});
const agenda=require('../src/utils/agenda');
const {dataValida,agoraAgenda}=require('../src/utils/agenda-tempo');
const {validarDataHora}=require('../src/utils/agendamento-edicao');
const {comAgendaBloqueada}=require('../src/utils/agenda-transacao');
const app=express();app.use(express.json());
app.use('/agendamentos',require('../src/routes/agendamentos'));
app.use('/lojas',require('../src/routes/lojas'));
app.use('/admin',require('../src/routes/admin'));
let server,base;
before(async()=>{server=app.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>new Promise(resolve=>server.close(resolve)));
beforeEach(()=>{
  shops=[{id:1,donoId:1,nome:'Loja',descricao:'Teste',endereco:'Rua',latitude:-16,longitude:-49,fotoUrl:'assets/img/logo.svg',bloqueado:false,formasPagamento:'Pix',agendaDias:'0,1,2,3,4,5,6',agendaHorarios:'08:00,09:00,09:30,10:00,10:30,11:00,16:00,17:00',agendaFechamento:'18:00',agendaBloqueios:[],capacidadeSimultanea:1}];
  services=[{id:1,lojaId:1,nome:'Lavagem',preco:80,duracao:'1h30'},{id:2,lojaId:1,nome:'Rápida',preco:40,duracao:'30 min'}];
  bookings=[];audit=[];sequence=1;queue=Promise.resolve();failAudit=false;
});
const date='2099-11-10';
function booking(patch={}){return {id:sequence++,lojaId:1,usuarioId:1,servicoId:1,data:date,hora:'09:00',status:'pendente',revisao:0,veiculo:'carro',formaPagamento:'Pix',duracaoMinutos:90,servicoNome:'Lavagem',precoCentavos:8000,...patch};}
function avail(patch={}){return agenda.calcularDisponibilidade({loja:shops[0],data:date,duracaoMinutos:30,agendamentos:bookings,now:new Date('2026-11-03T12:00:00Z'),...patch});}
function slot(hora,patch={}){return avail(patch).horarios.find(h=>h.hora===hora);}
function payload(patch={}){return {lojaId:1,servicoId:1,data:date,hora:'09:00',veiculo:'carro',formaPagamento:'Pix',...patch};}
async function req(url,method='GET',body,headers={}){const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,cache:res.headers.get('Cache-Control'),...await res.json()};}
async function create(patch={}){return req('/agendamentos','POST',payload(patch));}

const {validarOperacao,comRegras,antecedenciaMinutos}=require('../src/utils/agendamento-regras');
const agFixo={data:'2026-11-10',hora:'12:00',status:'pendente',duracaoMinutos:90};
const exato=new Date('2026-11-10T13:00:00.000Z'); // 10h de Brasília: faltam 2h.
for(const [label,now,aceito] of [
  ['2h exatas',exato,true],['2h e 1ms',new Date(exato.getTime()-1),true],
  ['1h59m59s999',new Date(exato.getTime()+1),false],['1h59m',new Date(exato.getTime()+60000),false],
]) test(`limite de cancelamento: ${label}`,()=>{
  const action=()=>validarOperacao(agFixo,{tipo:'cliente',acao:'cancelar',now});
  if(aceito)assert.doesNotThrow(action);else assert.throws(action,{code:'PRAZO_ENCERRADO'});
});
test('prazo usa horário de Brasília na virada da data UTC',()=>{
  assert.doesNotThrow(()=>validarOperacao({...agFixo,data:'2026-11-10',hora:'00:30'},{tipo:'cliente',acao:'cancelar',now:new Date('2026-11-10T01:30:00Z')}));
});
test('prazo opcional é configurável e configuração inválida falha de forma explícita',()=>{
  const old=process.env.AGENDAMENTO_ANTECEDENCIA_MINUTOS;
  try {
    process.env.AGENDAMENTO_ANTECEDENCIA_MINUTOS='30';assert.equal(antecedenciaMinutos(),30);
    assert.doesNotThrow(()=>validarOperacao(agFixo,{tipo:'cliente',acao:'cancelar',now:new Date('2026-11-10T14:30:00Z')}));
    for(const value of ['-1','abc','','1.5','10081']){process.env.AGENDAMENTO_ANTECEDENCIA_MINUTOS=value;assert.throws(antecedenciaMinutos,{status:503});}
  } finally {if(old===undefined)delete process.env.AGENDAMENTO_ANTECEDENCIA_MINUTOS;else process.env.AGENDAMENTO_ANTECEDENCIA_MINUTOS=old;}
});
test('reagendamento verifica o horário original e não o novo horário distante',()=>{
  assert.throws(()=>validarOperacao(agFixo,{tipo:'cliente',acao:'editar',dados:{data:date,hora:'09:00'},now:new Date('2026-11-10T14:00:00Z')}),{code:'PRAZO_ENCERRADO'});
});
test('cliente ajusta notas antes de iniciar, mas não após início',()=>{
  assert.doesNotThrow(()=>validarOperacao(agFixo,{tipo:'cliente',acao:'editar',dados:{data:agFixo.data,hora:agFixo.hora,notas:'nova'},now:new Date('2026-11-10T14:59:00Z')}));
  assert.throws(()=>validarOperacao(agFixo,{tipo:'cliente',acao:'editar',dados:agFixo,now:new Date('2026-11-10T15:00:00Z')}),{code:'AGENDAMENTO_EXPIRADO'});
});
for(const tipo of ['parceiro','admin']) test(`${tipo}: finalização só após confirmar e no término previsto`,()=>{
  assert.throws(()=>validarOperacao(agFixo,{tipo,acao:'status',dados:{status:'finalizado'},now:exato}),{code:'TRANSICAO_INVALIDA'});
  const ag={...agFixo,status:'confirmado'};
  assert.throws(()=>validarOperacao(ag,{tipo,acao:'status',dados:{status:'finalizado'},now:new Date('2026-11-10T16:29:59.999Z')}),{code:'ATENDIMENTO_NAO_TERMINOU'});
  assert.doesNotThrow(()=>validarOperacao(ag,{tipo,acao:'status',dados:{status:'finalizado'},now:new Date('2026-11-10T16:30:00Z')}));
});
test('fim usa duração reservada e aceita término no dia seguinte para legado',()=>{
  const ag={...agFixo,hora:'23:30',status:'confirmado',duracaoMinutos:90,servico:{duracao:'1 min'}};
  assert.throws(()=>validarOperacao(ag,{tipo:'parceiro',acao:'status',dados:{status:'finalizado'},now:new Date('2026-11-11T03:30:00Z')}),{code:'ATENDIMENTO_NAO_TERMINOU'});
  assert.doesNotThrow(()=>validarOperacao(ag,{tipo:'parceiro',acao:'status',dados:{status:'finalizado'},now:new Date('2026-11-11T04:00:00Z')}));
});
test('reserva antiga exige duração operacional, sem inferir duração atual do serviço',()=>{
  const ag={...agFixo,status:'confirmado',duracaoMinutos:null,servico:{duracao:'1 min'}};
  assert.throws(()=>validarOperacao(ag,{tipo:'parceiro',acao:'status',dados:{status:'finalizado'},now:new Date('2026-11-11T15:00:00Z')}),{code:'DURACAO_AUSENTE'});
  assert.doesNotThrow(()=>validarOperacao({...ag,duracaoAgendaMinutos:60},{tipo:'parceiro',acao:'status',dados:{status:'finalizado'},now:new Date('2026-11-11T15:00:00Z')}));
});
test('confirmado não pode ser confirmado novamente; cliente não pode finalizar',()=>{
  assert.throws(()=>validarOperacao({...agFixo,status:'confirmado'},{tipo:'parceiro',acao:'status',dados:{status:'confirmado'},now:exato}),{code:'TRANSICAO_INVALIDA'});
  assert.throws(()=>validarOperacao(agFixo,{tipo:'cliente',acao:'status',dados:{status:'finalizado'},now:exato}),{status:403});
});
test('exceção de prazo não ignora ciclo de vida nem término previsto',()=>{
  for(const status of ['cancelado','finalizado'])assert.throws(()=>validarOperacao({...agFixo,status},{tipo:'admin',acao:'cancelar',excecaoPrazo:true,now:exato}),{code:'AGENDAMENTO_ENCERRADO'});
  assert.throws(()=>validarOperacao({...agFixo,status:'confirmado'},{tipo:'admin',acao:'status',dados:{status:'finalizado'},excecaoPrazo:true,now:exato}),{code:'ATENDIMENTO_NAO_TERMINOU'});
});
test('HTTP: cancelamento atrasado pelo cliente não altera revisão nem histórico',async()=>{
  bookings.push(booking({data:'2000-01-01',status:'confirmado'}));
  const result=await req('/agendamentos/1/cancelar','PUT',{revisao:0,motivo:'Cancelar por atraso'});
  assert.equal(result.status,409);assert.equal(result.code,'PRAZO_ENCERRADO');assert.equal(bookings[0].status,'confirmado');assert.equal(bookings[0].revisao,0);assert.equal(audit.length,0);
});
test('HTTP: cliente não pode forjar exceção de prazo',async()=>{
  bookings.push(booking({data:'2000-01-01',status:'confirmado'}));assert.equal((await req('/agendamentos/1/cancelar','PUT',{revisao:0,motivo:'Preciso cancelar',excecaoPrazo:true})).status,403);assert.equal(audit.length,0);
});
test('HTTP: parceiro deve escolher exceção explicitamente; texto true não vale',async()=>{
  bookings.push(booking({data:'2000-01-01',status:'confirmado'}));
  for(const value of [undefined,'true',false])assert.equal((await req('/agendamentos/1/dono/cancelar','PUT',{revisao:0,motivo:'Preciso cancelar',excecaoPrazo:value})).status,409);
  const result=await req('/agendamentos/1/dono/cancelar','PUT',{revisao:0,motivo:'Cliente solicitou por telefone',excecaoPrazo:true});
  assert.equal(result.status,200);assert.equal(bookings.length,1);assert.equal(bookings[0].status,'cancelado');assert.match(audit[0].motivo,/Exceção de prazo/);assert.equal(audit[0].vistoClienteEm,null);
});
test('HTTP: reagendamento atrasado do parceiro registra exceção e verifica capacidade',async()=>{
  bookings.push(booking({data:'2000-01-01',status:'confirmado'}),booking({id:2}));
  const data=payload({revisao:0,motivo:'Reagendado por telefone',excecaoPrazo:true});
  assert.equal((await req('/agendamentos/1/dono','PUT',data)).status,409);assert.equal(audit.length,0);
  data.hora='11:00';assert.equal((await req('/agendamentos/1/dono','PUT',data)).status,200);assert.match(audit[0].motivo,/Exceção/);assert.equal(bookings[0].precoCentavos,8000);
});
test('HTTP: finalizar pendente ou futuro é recusado; confirmado passado funciona',async()=>{
  bookings.push(booking());
  assert.equal((await req('/agendamentos/1/status','PUT',{revisao:0,status:'finalizado'})).status,409);
  assert.equal((await req('/agendamentos/1/status','PUT',{revisao:0,status:'confirmado'})).status,200);
  assert.equal((await req('/agendamentos/1/status','PUT',{revisao:1,status:'finalizado'})).status,409);
  bookings[0].data='2000-01-01';
  assert.equal((await req('/agendamentos/1/status','PUT',{revisao:1,status:'finalizado'})).status,200);
  assert.equal(audit.length,2);assert.equal(bookings[0].revisao,2);
});
test('HTTP: admin exige revisão e motivo, registra autor e avisa as duas partes',async()=>{
  bookings.push(booking());
  assert.equal((await req('/admin/agendamentos/1/status','PUT',{status:'confirmado',motivo:'Contato por telefone'})).status,409);
  assert.equal((await req('/admin/agendamentos/1/status','PUT',{status:'confirmado',revisao:0})).status,400);
  assert.equal((await req('/admin/agendamentos/1/status','PUT',{status:'confirmado',revisao:0,motivo:'Contato por telefone'})).status,200);
  assert.equal(audit[0].autorTipo,'admin');assert.equal(audit[0].vistoClienteEm,null);assert.equal(audit[0].vistoParceiroEm,null);
});
test('HTTP: admin não finaliza futuro e não cancela atrasado sem exceção',async()=>{
  bookings.push(booking({status:'confirmado'}));
  assert.equal((await req('/admin/agendamentos/1/status','PUT',{status:'finalizado',revisao:0,motivo:'Tentativa de antecipar'})).status,409);
  bookings[0].data='2000-01-01';
  const body={status:'cancelado',revisao:0,motivo:'Solicitação de suporte'};
  assert.equal((await req('/admin/agendamentos/1/status','PUT',body)).status,409);
  assert.equal((await req('/admin/agendamentos/1/status','PUT',{...body,excecaoPrazo:true})).status,200);assert.match(audit[0].motivo,/Exceção/);
});
test('HTTP: exclusão direta é recusada para parceiro e admin, preservando registro',async()=>{
  bookings.push(booking());assert.equal((await req('/agendamentos/1','DELETE')).status,405);assert.equal((await req('/admin/agendamentos/1','DELETE')).status,405);assert.equal(bookings.length,1);
});
test('HTTP: duas confirmações simultâneas geram só uma transição e um histórico',async()=>{
  bookings.push(booking());const results=await Promise.all([1,2].map(()=>req('/agendamentos/1/status','PUT',{status:'confirmado',revisao:0})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(audit.length,1);assert.equal(bookings[0].revisao,1);
});
test('HTTP: transição admin também reverte se o histórico falha',async()=>{
  bookings.push(booking());failAudit=true;
  assert.equal((await req('/admin/agendamentos/1/status','PUT',{status:'confirmado',revisao:0,motivo:'Contato por telefone'})).status,500);
  assert.equal(bookings[0].status,'pendente');assert.equal(bookings[0].revisao,0);assert.equal(audit.length,0);
});
test('HTTP: autorização de cliente/parceiro continua sendo verificada',async()=>{
  bookings.push(booking());const body={revisao:0,motivo:'Solicitação indevida'};
  assert.equal((await req('/agendamentos/1/cancelar','PUT',body,{'x-user-id':'99'})).status,404);
  assert.equal((await req('/agendamentos/1/dono/cancelar','PUT',body,{'x-owner-id':'99'})).status,404);
});
test('HTTP: listas incluem permissões do servidor e não habilitam finalização prematura',async()=>{
  bookings.push(booking({status:'confirmado'}));
  const partner=await req('/agendamentos/dono');assert.equal(partner.agendamentos[0].regras.podeFinalizar,false);
  const client=await req('/agendamentos/me');assert.equal(client.agendamentos[0].regras.podeCancelar,true);assert.equal(client.cache,'no-store');
  bookings[0].data='2000-01-01';const expired=await req('/agendamentos/me');assert.equal(expired.agendamentos[0].regras.podeCancelar,false);
});

test('prazo é revalidado dentro da transação depois de esperar o bloqueio',async()=>{
  const RealDate=Date;let clock=new RealDate('2026-11-10T13:00:00Z');
  class FakeDate extends RealDate {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock.getTime();}}
  const transaction=db.$transaction;
  bookings.push(booking({data:'2026-11-10',hora:'12:00'}));
  db.$transaction=async(fn,options)=>{clock=new RealDate('2026-11-10T13:00:00.001Z');return transaction.call(db,fn,options);};
  global.Date=FakeDate;
  try {
    const result=await req('/agendamentos/1/cancelar','PUT',{revisao:0,motivo:'Cancelar no limite'});
    assert.equal(result.status,409);assert.equal(result.code,'PRAZO_ENCERRADO');assert.equal(audit.length,0);
  } finally {global.Date=RealDate;db.$transaction=transaction;}
});
test('interface usa permissões do servidor para botões e bloqueia somente horário no cliente',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8');
  const ui={Intl,Date,parseTextList:value=>String(value||'').split(','),escapeHtml:value=>String(value??'').replaceAll('<','&lt;')};
  vm.createContext(ui);
  vm.runInContext(source.slice(source.indexOf('function bookingPaymentOptions'),source.indexOf('function createBookingListController')),ui);
  const ag={...agFixo,id:1,loja:{formasPagamento:'Pix'},regras:{podeEditar:true,podeCancelar:false,podeReagendar:false,podeFinalizar:false}};
  const card=ui.bookingCardHtml(ag,'cliente');assert.doesNotMatch(card,/data-booking-action="cancel"/);
  const edit=ui.bookingEditorHtml(ag,'cliente');assert.match(edit,/name="data" type="date" disabled/);assert.match(edit,/name="hora" disabled/);
  assert.doesNotMatch(ui.bookingCardHtml(ag,'parceiro'),/data-booking-action="finish"/);
  ag.regras.podeFinalizar=true;assert.match(ui.bookingCardHtml(ag,'parceiro'),/data-booking-action="finish"/);
});
test('configuração inválida impede criação antes de gravar a reserva',async()=>{
  const old=process.env.AGENDAMENTO_ANTECEDENCIA_MINUTOS;
  try {process.env.AGENDAMENTO_ANTECEDENCIA_MINUTOS='inválido';assert.equal((await create()).status,503);assert.equal(bookings.length,0);}
  finally {if(old===undefined)delete process.env.AGENDAMENTO_ANTECEDENCIA_MINUTOS;else process.env.AGENDAMENTO_ANTECEDENCIA_MINUTOS=old;}
});
