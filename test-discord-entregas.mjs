import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {entregarDiscord,textoFichaje} from './supabase/functions/discord-bot/entregas-discord.ts';
import vm from 'node:vm';
test('web: agrupa publicaciones de stock y elimina solo avisos anteriores a la confirmación',async()=>{
 let finish,calls=0,saves=0;const wait=new Promise(r=>finish=r),ctx={SANDBOX:false,Map,Set,Promise,Number,DCH:{stock:{ts:100},fichajes:{ts:300}},applyRecord(){},saveDCH(){saves++;},invPublish:async()=>{calls++;if(calls===1)await wait;}};
 vm.runInNewContext(fs.readFileSync('discord-estado.js','utf8'),ctx);const a=ctx.invPublish('stock'),b=ctx.invPublish('stock');assert.equal(a,b);await Promise.resolve();assert.equal(calls,1);ctx.invPublish('stock');finish();await a;assert.equal(calls,2);
 ctx.applyRecord('dcerr:stock',{deleted:true,ts:200});ctx.applyRecord('dcerr:fichajes',{deleted:true,ts:200});assert.equal(ctx.DCH.stock,undefined);assert.equal(ctx.DCH.fichajes.ts,300);assert.equal(saves,1);
});
test('web: cierre mantiene su referencia mientras espera a sincronizar',async()=>{
 let finish;const wait=new Promise(r=>finish=r),ctx={SANDBOX:false,ME:{id:'e'},lastShift:{uid:'primero'},cloud:{flushing:false},dcPayload:()=>({}),cloudFlushOutbox:()=>wait,loadLog:()=>[],publishClient(){},publishAgenda(){},cloudFlush(){}};
 vm.runInNewContext('var sent=[];function discordSend(kind,text){sent.push(dcPayload(kind,text));}',ctx);vm.runInNewContext(fs.readFileSync('discord-meta.js','utf8'),ctx);
 const p=ctx.discordSend('fichajes','SALIDA · Uno');ctx.lastShift={uid:'otro'};finish();await p;assert.equal(ctx.sent[0]._hg.ref,'turno:primero');
});
test('la orden nace al guardar; entrada y salida sobreviven al borrado del fichaje abierto',async()=>{
 const db=new PGlite();try{
  await db.exec("create role anon;create role authenticated;create role service_role;create table stock(producto text primary key,cantidad int,minimo int default 0);create table datos(clave text primary key,valor jsonb,actualizado timestamptz default now());");
  await db.exec(fs.readFileSync('discord-entregas.sql','utf8'));
  await db.exec(`insert into stock values('Rifle',1,0),('mat:Tornillo',3,0);insert into datos values('fichaje:e','{"name":"Uno","empId":"e","start":100}');insert into datos values('turno:t','{"name":"Uno","start":100,"end":200}');update datos set valor='{"deleted":true}' where clave='fichaje:e';`);
  let rows=(await db.query('select * from hg_discord_outbox order by kind,record_key')).rows;assert.equal(rows.length,4);assert.equal(rows.find(x=>x.record_key==='fichaje:e:100').snapshot.start,100);assert.equal(rows.find(x=>x.record_key==='turno:t:100').snapshot.end,200);
  await db.exec("update stock set cantidad=2 where producto='Rifle';update stock set cantidad=2 where producto='Rifle';");assert.equal((await db.query("select version from hg_discord_outbox where kind='stock'")).rows[0].version,2);
  await db.exec("begin;update stock set cantidad=4 where producto='Rifle';rollback;");assert.equal((await db.query("select version from hg_discord_outbox where kind='stock'")).rows[0].version,2);
  assert.equal((await db.query("select has_table_privilege('authenticated','hg_discord_outbox','insert') as ok")).rows[0].ok,false);
 }finally{await db.close();}
});
const job={kind:'fichajes',record_key:'turno:t:100',snapshot:{ref:'turno:t',name:'Uno',start:100,end:200},version:1,attempts:0};
function mock({old=null,claim=true,changed=false}={}){
 const state={jobs:[structuredClone(job)],messages:[],errors:[],calls:[]};
 const sb={rpc:async()=>({data:claim}),from(table){const filters={};let op='select',value;const q={select(){return q},lte(){return q},order(){return q},limit(){return q},eq(k,v){filters[k]=v;return q},single(){return q},maybeSingle(){return q},delete(){op='delete';return q},update(v){op='update';value=v;return q},upsert(v){op='upsert';value=v;return q},then(resolve,reject){return Promise.resolve().then(()=>{
  state.calls.push({table,op,filters:{...filters},value});
  if(table==='hg_discord_outbox'){if(op==='select')return {data:state.jobs.map(x=>structuredClone(x))};if(op==='delete'&&!changed)state.jobs=[];if(op==='update')Object.assign(state.jobs[0],value);}
  if(table==='datos'){if(op==='select')return {data:{valor:{ev:{fichajes:true},urls:{fichajes:'https://discord.com/api/webhooks/123/token'}}}};if(op==='upsert')state.errors.push(value);}
  if(table==='hg_discord_messages'){if(op==='select')return {data:old};if(op==='upsert')state.messages.push(value);}
  return {data:null};
 }).then(resolve,reject)}};return q;}};return {sb,state};
}
test('fichaje conserva hora real y rechaza registros incompletos',()=>{assert.match(textoFichaje(job.snapshot).title,/SALIDA · Uno/);for(const x of [{deleted:true},{name:'Uno',start:NaN},{ref:'turno:t',name:'Uno',start:200,end:100}])assert.throws(()=>textoFichaje(x));});
test('entrega repara mensaje borrado y confirma sin borrar un cambio nuevo',async()=>{const {sb,state}=mock({old:{message_id:'44',webhook_id:'123'},changed:true}),methods=[];const r=await entregarDiscord(sb,async(u,o)=>{methods.push(o.method);assert.equal(JSON.parse(o.body).allowed_mentions.parse.length,0);return methods.length===1?new Response('{}',{status:404}):new Response('{"id":"55"}');});assert.deepEqual(methods,['PATCH','POST']);assert.equal(r.sent,1);assert.equal(state.jobs.length,1);assert.equal(state.messages[0].message_id,'55');assert.equal(state.errors[0].valor.deleted,true);assert.equal(state.calls.find(x=>x.table==='hg_discord_outbox'&&x.op==='delete').filters.version,1);});
test('fallo de Discord conserva entrega, programa reintento y deja aviso visible',async()=>{const {sb,state}=mock();const r=await entregarDiscord(sb,async()=>new Response('{}',{status:429}));assert.equal(r.pending,1);assert.equal(state.jobs[0].last_error,'DISCORD_429');assert.equal(state.jobs[0].attempts,1);assert.equal(state.messages.length,0);assert.equal(state.errors[0].valor.st,429);assert.ok(state.calls.some(x=>x.table==='hg_discord_leases'&&x.op==='delete'));});
test('dos emisores no publican a la vez si la reserva está ocupada',async()=>{const {sb,state}=mock({claim:false});let calls=0;await entregarDiscord(sb,async()=>{calls++;});assert.equal(calls,0);assert.equal(state.jobs.length,1);assert.equal(state.calls.some(x=>x.table==='hg_discord_leases'&&x.op==='delete'),false);});
