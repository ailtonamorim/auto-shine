// Opt-in: usa exclusivamente AGENDA_TEST_DATABASE_URL, nunca carrega .env.
// Cria um schema aleatório, aplica as migrações ali e remove SOMENTE esse schema ao terminar.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const connection = process.env.AGENDA_TEST_DATABASE_URL;

test('PostgreSQL: migração, exclusão de sobreposição concorrente e capacidade', { skip: !connection, timeout: 120000 }, async t => {
  const schema = `agenda_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(connection);
  assert.ok(['postgres:','postgresql:'].includes(url.protocol), 'Use uma conexão PostgreSQL de testes.');
  url.searchParams.set('schema',schema);
  url.searchParams.set('connection_limit','8');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  let created=false,server;
  try {
    await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created=true;
    const cli=path.join(__dirname,'../node_modules/prisma/build/index.js');
    const child=spawn(process.execPath,[cli,'migrate','deploy'],{cwd:path.join(__dirname,'..'),env:{...process.env,DATABASE_URL:url.toString()},stdio:['ignore','pipe','pipe']});
    // Evita registrar URL/credenciais se a migração falhar.
    child.stdout.resume();child.stderr.resume();
    const [code]=await once(child,'close');
    assert.equal(code,0,'Migração no schema temporário falhou; confira permissões e histórico de migrations.');
    const owner=await db.dono.create({data:{nome:'Teste agenda',login:`agenda_${schema}`}});
    const user=await db.usuario.create({data:{nome:'Teste agenda',email:`${schema}@example.test`}});
    const shop=await db.loja.create({data:{nome:'Teste',descricao:'Teste',endereco:'Teste',latitude:0,longitude:0,fotoUrl:'assets/img/logo.svg',donoId:owner.id,agendaDias:'0,1,2,3,4,5,6',agendaHorarios:'08:00,09:00,09:30,10:00,10:30,11:00',agendaFechamento:'18:00',formasPagamento:'Pix'}});
    const service=await db.servicoLoja.create({data:{nome:'Lavagem',descricao:'Teste',preco:80,duracao:'1h30',lojaId:shop.id}});
    function mock(name,exports){const id=require.resolve(name);require.cache[id]={id,filename:id,loaded:true,exports};}
    mock('../src/config/database',db);
    mock('../src/middlewares/auth',{
      autenticarUsuario(req,_res,next){req.usuario={id:user.id,nome:user.nome};next();},
      autenticarDono(req,_res,next){req.dono={donoId:owner.id,nome:owner.nome};next();},
    });
    const app=express();app.use(express.json());app.use('/bookings',require('../src/routes/agendamentos'));
    server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const base=`http://127.0.0.1:${server.address().port}`;
    const date='2099-11-10';
    async function request(route,method,data){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:response.status,...await response.json()};}
    const payload=(hora='09:00')=>({lojaId:shop.id,servicoId:service.id,data:date,hora,veiculo:'carro',formaPagamento:'Pix'});
    async function clear(){await db.agendamento.deleteMany({where:{lojaId:shop.id}});}
    await t.test('capacidade 1: duas requisições com início diferente não ultrapassam a vaga',async()=>{
      const results=await Promise.all([request('/bookings','POST',payload('09:00')),request('/bookings','POST',payload('09:30'))]);
      assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(await db.agendamento.count(),1);
    });
    await t.test('capacidade 2: aceita duas reservas no mesmo início e rejeita a terceira',async()=>{
      await clear();await db.loja.update({where:{id:shop.id},data:{capacidadeSimultanea:2}});
      const results=await Promise.all([1,2,3].map(()=>request('/bookings','POST',payload())));
      assert.deepEqual(results.map(r=>r.status).sort(),[201,201,409]);assert.equal(await db.agendamento.count(),2);
    });
    await t.test('reagendamentos concorrentes para uma vaga mantêm só um no intervalo',async()=>{
      await clear();await db.loja.update({where:{id:shop.id},data:{capacidadeSimultanea:1}});
      const a=await request('/bookings','POST',payload('08:00'));
      const b=await request('/bookings','POST',payload('11:00'));
      assert.equal(a.status,201);assert.equal(b.status,201);
      const results=await Promise.all([a,b].map(row=>request(`/bookings/${row.agendamento.id}`,'PUT',{...payload('09:30'),revisao:0,motivo:'Teste de concorrência'})));
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      assert.equal(await db.alteracaoAgendamento.count(),1);
    });
    await t.test('reserva legada permanece sem preço após definição de duração',async()=>{
      await clear();
      const old=await db.agendamento.create({data:{...payload(),usuarioId:user.id}});
      assert.equal(old.precoCentavos,null);assert.equal(old.duracaoMinutos,null);
      assert.equal((await request('/bookings','POST',payload('11:00'))).status,409);
      const result=await request(`/bookings/${old.id}/dono/duracao`,'PUT',{revisao:0,duracaoAgendaMinutos:60,motivo:'Duração confirmada pelo cliente'});
      assert.equal(result.status,200);assert.equal(result.agendamento.precoCentavos,null);
      assert.equal((await request('/bookings','POST',payload('10:00'))).status,201);
    });
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    try {
      // Identificador gerado internamente, nunca derivado de input ou de DATABASE_URL.
      if(created && /^agenda_test_[a-f0-9]{32}$/.test(schema))await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {await db.$disconnect();}
  }
});
