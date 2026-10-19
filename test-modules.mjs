import assert from 'node:assert/strict';
import {catalog,defaults} from './supabase/functions/discord-bot/module-catalog.ts';
import {plan,roleStyle,soundData,quietAt} from './supabase/functions/discord-bot/module-engine.ts';
import {sample,allSamples} from './supabase/functions/discord-bot/module-samples.ts';
import {executeModule,tickModules,eventModules,handleModulePanel,isChief,previewModule,configureModule} from './supabase/functions/discord-bot/module-runtime.ts';
import {canView} from './supabase/functions/discord-bot/module-access.ts';
import {readFeed} from './supabase/functions/discord-bot/module-feed.ts';
const c={guild_id:'1520875506214371439',app_id:'1559241466654761132',rol_jefe:'1520884742512447590',canal_configuracion_bot:'1561742079477026946'};
let writes=0,rpcs=0,network=0;const tables={bot_equipo:[]};
function mock(){return {rpc:async()=>{rpcs++;return {data:true}},from(t){let fs=[],single=false;const q={select(){return q},eq(k,v){fs.push(x=>x[k]===v);return q},maybeSingle(){single=true;return q},upsert(x){writes++;const i=tables[t].findIndex(r=>r.id===x.id);if(i<0)tables[t].push(x);else tables[t][i]=x;return q},insert(){writes++;return q},delete(){writes++;return q},then(resolve,reject){const rows=(tables[t]||[]).filter(x=>fs.every(f=>f(x)));return Promise.resolve({data:single?rows[0]||null:rows}).then(resolve,reject)}};return q}};}
const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{network++;throw Error('No debe usarse la red en estas pruebas');};
assert.equal(catalog.length,43);assert.equal(new Set(catalog.map(x=>x.id)).size,43);assert.ok(Object.values(defaults()).every(x=>x.enabled===false));
for(const s of allSamples()){
 const before=JSON.stringify(s.state),r=plan(s.module,s.action,s.input,s.state,s.settings,s.context);assert.equal(r.module,s.module);assert.equal(JSON.stringify(s.state),before);
 assert.equal(previewModule(s.module).networkCalls,0);
 await assert.rejects(executeModule(mock(),c,s.module,s.action,s.input,{uid:'1398183011232518164',chief:true}),/MODULO_DESACTIVADO/);
}
assert.deepEqual(await tickModules(mock(),c),{disabled:43,active:0});assert.equal((await eventModules(mock(),c,{type:'MESSAGE_CREATE'})).handled,0);assert.equal(writes,0);assert.equal(rpcs,0);assert.equal(network,0);
const jefe={guild_id:c.guild_id,channel_id:c.canal_configuracion_bot,member:{user:{id:'1520884139438379018'},roles:[c.rol_jefe]},data:{custom_id:'mod:page:0'}};
assert.ok(isChief(c,jefe));assert.ok(!isChief(c,{...jefe,member:{user:{id:'2'},roles:['1520884932107567394']}}));
const denied=await (await handleModulePanel({...jefe,member:{user:{id:'2'},roles:[]}},c,mock())).json();assert.equal(denied.type,4);assert.equal(denied.data.flags,64);
assert.throws(()=>roleStyle({primary:1,secondary:2,style:'gradient'},{id:c.guild_id,features:[]},{id:'r',position:1},11),/desbloqueados/);
assert.throws(()=>roleStyle({primary:1},{id:c.guild_id},{id:'r',position:12},11),/protegido/);
assert.equal(roleStyle({primary:1,style:'holographic'},{id:c.guild_id,features:['ENHANCED_ROLE_COLORS']},{id:'r',position:1},11).colors.tertiary_color,16761760);
assert.throws(()=>soundData({name:'x',sound:'data:audio/mpeg;base64,AAAA',duration:1}),/Nombre/);
assert.throws(()=>soundData({name:'Hola',sound:'data:audio/mpeg;base64,AAAA',duration:6}),/rango/);
assert.ok(quietAt({quiet:{start:23,end:8},timezone:'Europe/Madrid'},Date.parse('2026-10-19T23:00:00Z')));
const ev=sample('espera'),event=plan('espera','crear',{id:'e',capacity:1},{},{},ev.context).state;
let r=plan('espera','apuntar',{id:'e',user:'1520884139438379018'},event,{},ev.context);r=plan('espera','apuntar',{id:'e',user:'1520884932107567394'},r.state,{},ev.context);assert.equal(r.state.entries.e.waiting.length,1);r=plan('espera','borrar',{id:'e',user:'1520884139438379018'},r.state,{},ev.context);assert.equal(r.state.entries.e.people[0].uid,'1520884932107567394');
const slot=sample('recompensas');let economy=plan(slot.module,slot.action,slot.input,{},slot.settings,slot.context);let again=plan(slot.module,slot.action,slot.input,economy.state,slot.settings,slot.context);assert.equal(again.state.balances[slot.input.user],10);
const privateCh={permission_overwrites:[{id:c.guild_id,type:0,deny:'1024',allow:'0'},{id:c.rol_jefe,type:0,allow:'1024',deny:'0'}]};assert.ok(!canView(c.guild_id,[{id:c.guild_id,permissions:'1024'}],{user:{id:'x'},roles:[]},privateCh));assert.ok(canView(c.guild_id,[{id:c.guild_id,permissions:'1024'}],{user:{id:'x'},roles:[c.rol_jefe]},privateCh));
const feed=await readFeed('https://example.org/rss',async()=>new Response('<rss><item><guid>1</guid><title>A &amp; B</title><link>https://example.org/1</link></item></rss>'));assert.equal(feed[0].title,'A & B');await assert.rejects(readFeed('https://127.0.0.1/feed'),/PUBLICA/);
await assert.rejects(configureModule(mock(),c,'tickets',{enabled:true},{uid:'1398183011232518164',chief:true}),/ACTIVACION_BLOQUEADA/);assert.equal(network,0);
globalThis.fetch=oldFetch;console.log('OK: 43 motores, 43 bloqueos de ejecución, cron y Gateway inactivos sin efectos, panel solo jefes, jerarquía/boosts de roles, sonidos, espera, puntos idempotentes, privacidad y RSS.');
