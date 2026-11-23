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
    if (key === 'OR') return value.some(part=>matches(row,part));
    if (key === 'loja') return matches(shops.find(s=>s.id===row.lojaId),value);
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key]);
      if ('gt' in value) return row[key] > value.gt;
      if ('lt' in value) return row[key] < value.lt;
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
    async findMany({where,orderBy,take}) { let result=bookings.filter(b=>matches(b,where));if(orderBy?.id==='asc')result=result.sort((a,b)=>a.id-b.id);return result.slice(0,take).map(details); },
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

const { deveExpirar }=require('../src/utils/agendamento-expiracao');
const { validarOperacao,comRegras }=require('../src/utils/agendamento-regras');
const { expirarAgendamento,expirarLote,iniciarExpiracao }=require('../src/services/expiracao-agendamentos');
const start=new Date('2026-11-05T11:00:00.000Z'); // 08h em Brasília.
const clock=()=>start;
const past=patch=>booking({data:'2026-11-05',hora:'08:00',...patch});
const expiredOld=patch=>booking({data:'2000-01-01',hora:'08:00',...patch});
for(const [label,time,expected] of [['1ms antes',start.getTime()-1,false],['no início',+start,true],['depois',+start+1,true]]) {
 test(`limite de expiração: ${label}`,()=>assert.equal(deveExpirar(past(),new Date(time)),expected));
}
test('fim do prazo de cancelamento não expira a reserva antes do atendimento',()=>assert.equal(deveExpirar(past(),new Date('2026-11-05T09:00:00Z')),false));
test('fuso de Brasília na virada UTC e na meia-noite local',()=>{
 const ag=past({data:'2026-11-05',hora:'00:00'});
 assert.equal(deveExpirar(ag,new Date('2026-11-05T02:59:59.999Z')),false);
 assert.equal(deveExpirar(ag,new Date('2026-11-05T03:00:00Z')),true);
 assert.equal(deveExpirar(past({data:'2026-11-04',hora:'23:59'}),new Date('2026-11-05T02:59:00Z')),true);
});
test('confirmados, finalizados, cancelados e expirados nunca expiram novamente',()=>{
 for(const status of ['confirmado','finalizado','cancelado','expirado'])assert.equal(deveExpirar(past({status}),new Date('2026-11-10T12:00:00Z')),false);
});
test('horário inválido não é adivinhado nem encerrado automaticamente',()=>{
 for(const ag of [past({data:'2026-02-30'}),past({hora:'25:00'}),past({data:'errada'})])assert.equal(deveExpirar(ag,start),false);
});
test('expiração salva revisão e histórico uma só vez e preserva dados da reserva',async()=>{
 bookings.push(past());const before=structuredClone(bookings[0]);
 assert.equal(await expirarAgendamento(before,{db,clock}),true);
 assert.equal(bookings[0].status,'expirado');assert.equal(bookings[0].revisao,1);
 for(const key of ['data','hora','precoCentavos','duracaoMinutos','servicoNome','formaPagamento','usuarioId','servicoId','lojaId'])assert.equal(bookings[0][key],before[key]);
 assert.equal(audit.length,1);assert.equal(audit[0].autorTipo,'sistema');assert.equal(audit[0].autorNome,'AutoShine');
 assert.deepEqual(audit[0].anterior,{status:'pendente'});assert.deepEqual(audit[0].atual,{status:'expirado'});
 assert.equal(audit[0].vistoClienteEm,null);assert.equal(audit[0].vistoParceiroEm,null);assert.equal(+audit[0].createdAt,+start);
 assert.equal(await expirarAgendamento(before,{db,clock}),false);assert.equal(audit.length,1);
});
test('falha de histórico reverte status e revisão; próxima tentativa funciona',async()=>{
 bookings.push(past());failAudit=true;
 await assert.rejects(expirarAgendamento(bookings[0],{db,clock}));assert.equal(bookings[0].status,'pendente');assert.equal(bookings[0].revisao,0);assert.equal(audit.length,0);
 failAudit=false;assert.equal(await expirarAgendamento(bookings[0],{db,clock}),true);
});
test('duas instâncias expiram uma reserva sem duplicar o histórico',async()=>{
 bookings.push(past());const results=await Promise.all([expirarAgendamento(bookings[0],{db,clock}),expirarAgendamento(bookings[0],{db,clock})]);
 assert.deepEqual(results.sort(),[false,true]);assert.equal(audit.length,1);assert.equal(bookings[0].revisao,1);
});
test('após aguardar a trava, confirmação anterior é preservada',async()=>{
 bookings.push(past());const stale=structuredClone(bookings[0]);
 const confirmation=comAgendaBloqueada(1,async tx=>{await tx.agendamento.updateMany({where:{id:1,status:'pendente'},data:{status:'confirmado',revisao:{increment:1}}});},db);
 const expiration=expirarAgendamento(stale,{db,clock});await confirmation;
 assert.equal(await expiration,false);assert.equal(bookings[0].status,'confirmado');assert.equal(audit.length,0);
});
test('reagendamento anterior à trava é relido e não expira o novo horário',async()=>{
 bookings.push(past());const stale=structuredClone(bookings[0]);
 const edit=comAgendaBloqueada(1,async tx=>{await tx.agendamento.updateMany({where:{id:1},data:{data:'2099-11-10',revisao:{increment:1}}});},db);
 const expiration=expirarAgendamento(stale,{db,clock});await edit;
 assert.equal(await expiration,false);assert.equal(bookings[0].data,'2099-11-10');assert.equal(audit.length,0);
});
test('reserva excluída durante a espera não recebe histórico órfão',async()=>{
 const stale=past();assert.equal(await expirarAgendamento(stale,{db,clock}),false);assert.equal(audit.length,0);
});
test('lotes selecionam vencidos em Brasília e paginam para não monopolizar o servidor',async()=>{
 bookings.push(past({id:1}),past({id:2}),past({id:3}),booking({id:4}),past({id:5,status:'confirmado'}));
 const a=await expirarLote({db,clock,limit:2});assert.equal(a.expirados,2);assert.equal(a.proximoId,2);
 const b=await expirarLote({db,clock,limit:2,afterId:a.proximoId});assert.equal(b.expirados,1);assert.equal(b.proximoId,0);assert.equal(bookings[3].status,'pendente');assert.equal(bookings[4].status,'confirmado');
});
test('falha de uma reserva não impede processar as outras e pode ser repetida',async()=>{
 bookings.push(past({id:1}),past({id:2}));const original=db.alteracaoAgendamento.create,logs=[];
 db.alteracaoAgendamento.create=async args=>{if(args.data.agendamentoId===1)throw Error('Falha');return original(args);};
 try {const result=await expirarLote({db,clock,logger:{error:msg=>logs.push(msg)}});assert.equal(result.expirados,1);assert.equal(result.falhas,1);assert.equal(bookings[0].status,'pendente');assert.equal(bookings[1].status,'expirado');assert.equal(logs.length,1);}
 finally {db.alteracaoAgendamento.create=original;}
 assert.equal((await expirarLote({db,clock})).expirados,1);
});
test('cliente e parceiro carregam status atualizado e o histórico do sistema',async()=>{
 bookings.push(expiredOld());const client=await req('/agendamentos/me');assert.equal(client.status,200);assert.equal(client.agendamentos[0].status,'expirado');assert.equal(client.agendamentos[0].alteracoes[0].autorTipo,'sistema');
 const owner=await req('/agendamentos/dono');assert.equal(owner.agendamentos[0].status,'expirado');assert.equal(audit.length,1);assert.equal(client.cache,'no-store');
});
test('lista de cliente só reconcilia reservas que pertencem a ele',async()=>{
 bookings.push(expiredOld({usuarioId:2}));assert.equal((await req('/agendamentos/me')).agendamentos.length,0);assert.equal(bookings[0].status,'pendente');assert.equal(audit.length,0);
});
test('lista de parceiro só reconcilia reservas de suas lojas',async()=>{
 bookings.push(expiredOld());assert.equal((await req('/agendamentos/dono','GET',undefined,{'x-owner-id':'2'})).agendamentos.length,0);assert.equal(bookings[0].status,'pendente');
});
test('admin também recebe expirados sem permitir reabertura',async()=>{
 bookings.push(expiredOld());const result=await req('/admin/agendamentos');assert.equal(result.status,200);assert.equal(result.agendamentos[0].status,'expirado');
 assert.equal((await req('/admin/agendamentos/1/status','PUT',{status:'confirmado',revisao:1,motivo:'Tentativa de reabrir'})).status,409);assert.equal(bookings[0].status,'expirado');
});
test('confirmar após o início é recusado antes da rotina, inclusive por admin',async()=>{
 bookings.push(expiredOld());assert.equal((await req('/agendamentos/1/status','PUT',{status:'confirmado',revisao:0})).code,'AGENDAMENTO_EXPIRADO');
 assert.equal((await req('/admin/agendamentos/1/status','PUT',{status:'confirmado',revisao:0,motivo:'Confirmar por telefone',excecaoPrazo:true})).code,'AGENDAMENTO_EXPIRADO');assert.equal(audit.length,0);
});
test('confirmar exatamente no início ou depois nunca usa exceção de prazo',()=>{
 for(const now of [start,new Date(+start+1)])for(const tipo of ['parceiro','admin'])assert.throws(()=>validarOperacao(past(),{tipo,acao:'status',dados:{status:'confirmado'},excecaoPrazo:true,now}),{code:'AGENDAMENTO_EXPIRADO'});
 assert.doesNotThrow(()=>validarOperacao(past(),{tipo:'parceiro',acao:'status',dados:{status:'confirmado'},now:new Date(+start-1)}));
});
test('pendente vencido não pode escapar da expiração por reagendamento ou duração',()=>{
 for(const acao of ['editar','cancelar','duracao'])assert.throws(()=>validarOperacao(past(),{tipo:'parceiro',acao,dados:{data:'2099-11-10',hora:'09:00'},excecaoPrazo:true,now:start}),{code:'AGENDAMENTO_EXPIRADO'});
});
test('confirmado passado continua permitindo finalização explícita',async()=>{
 bookings.push(expiredOld({status:'confirmado'}));assert.equal((await expirarLote({db,clock})).expirados,0);
 assert.equal((await req('/agendamentos/1/status','PUT',{status:'finalizado',revisao:0})).status,200);assert.equal(bookings[0].status,'finalizado');
});
test('antes do ciclo, regras já ocultam ações de pendentes vencidos',()=>{
 const regras=comRegras(past(),'parceiro',start).regras;assert.equal(regras.expiracaoPendente,true);
 for(const k of ['podeEditar','podeReagendar','podeCancelar','podeConfirmar','podeFinalizar'])assert.equal(regras[k],false);
});
test('pendente vencido libera a capacidade futura mesmo antes de o ciclo persistir',()=>{
 const now=new Date('2026-11-05T11:01:00Z');bookings=[past({duracaoMinutos:180})];
 assert.equal(slot('09:00',{data:'2026-11-05',now}).disponivel,true);
 bookings[0].status='confirmado';assert.equal(slot('09:00',{data:'2026-11-05',now}).disponivel,false);
});
test('expiração de reserva legada sem duração libera bloqueio conservador do dia',()=>{
 const now=new Date('2026-11-05T11:01:00Z');bookings=[past({duracaoMinutos:null})];assert.equal(slot('09:00',{data:'2026-11-05',now}).disponivel,true);
});
test('rotina inicia sem visitas, agenda próximo ciclo após terminar e para ao encerrar',async()=>{
 const scheduled=[],calls=[];let finish;const pending=new Promise(resolve=>{finish=resolve;});
 const job=iniciarExpiracao({executar:async options=>{calls.push(options);await pending;return {proximoId:10};},agendar:(fn,ms)=>{scheduled.push({fn,ms});return 1;},cancelar:id=>calls.push({cancel:id})});
 assert.equal(calls.length,1);assert.equal(scheduled.length,0);finish();await job.pronto;assert.equal(scheduled.length,1);assert.equal(scheduled[0].ms,30000);
 await scheduled[0].fn();assert.equal(calls[1].afterId,10);job.parar();assert.deepEqual(calls.at(-1),{cancel:1});
});
test('banco indisponível não mata rotina: próxima execução é agendada',async()=>{
 const scheduled=[],logs=[];const job=iniciarExpiracao({executar:async()=>{throw Error('offline');},logger:{error:msg=>logs.push(msg)},agendar:fn=>{scheduled.push(fn);return 1;},cancelar(){}});
 await job.pronto;assert.equal(logs.length,1);assert.equal(scheduled.length,1);job.parar();
});
test('parada durante execução não deixa novo timer',async()=>{
 let finish,count=0;const job=iniciarExpiracao({executar:()=>new Promise(resolve=>{finish=resolve;}),agendar:()=>{count++;},cancelar(){}});
 job.parar();finish({proximoId:0});await job.pronto;assert.equal(count,0);
});
test('cartão expirado mostra motivo e não oferece edição, confirmação ou cancelamento',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../assets/js/app.js'),'utf8');const ui=vm.createContext({Intl});
 vm.runInContext(source.slice(source.indexOf('function bookingServiceName('),source.indexOf('function createBookingListController(')),ui);ui.escapeHtml=String;ui.bookingUnread=()=>[];ui.bookingDateLabel=String;ui.bookingHistoryHtml=()=>'';
 const html=ui.bookingCardHtml(past({status:'expirado'}),'parceiro');assert.match(html,/Expirado automaticamente/);assert.match(html,/booking-status-expired/);assert.doesNotMatch(html,/data-booking-action/);
});
test('ao iniciar o servidor, a rotina real expira pendências antigas sem requisições HTTP',async()=>{
 bookings.push(expiredOld(),expiredOld({status:'confirmado'}));
 const job=iniciarExpiracao({agendar:()=>1,cancelar(){}});await job.pronto;job.parar();
 assert.equal(bookings[0].status,'expirado');assert.equal(bookings[1].status,'confirmado');assert.equal(audit.length,1);
});
