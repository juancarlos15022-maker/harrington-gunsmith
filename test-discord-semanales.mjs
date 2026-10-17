import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import client from './discord-semanales.js';
import {tipoSemanal} from './supabase/functions/discord-envios/discord-semanales.ts';
import {reubicarSemanal} from './supabase/functions/discord-bot/reubicar-semanal.ts';
test('los informes semanales usan destinos propios; tickets y gastos diarios conservan los suyos',()=>{
 for(const [kind,text,file,expected] of [['ventas','REGISTRO SEMANAL DE VENTAS','Semana_Ventas_TODOS.txt','ventas_semanales'],['gastos','REGISTRO DE GASTOS · SEMANAL','Gastos_Semanal_09.txt','gastos_semanales'],['ventas','VENTA · HG-1','ticket.png','ventas'],['gastos','REGISTRO DE GASTOS · DIARIO','Gastos_Diario_09.txt','gastos'],['balance','REGISTRO SEMANAL','','balance']]){
  assert.equal(client.tipo(kind,text,file),expected);assert.equal(tipoSemanal(kind,{embeds:[{title:text}]},[file]),expected.endsWith('_semanales')?expected:null);
 }
});
test('web: envío manual y automático se redirigen y la configuración conserva ambos canales',async()=>{
 const sent=[],ctx={DC_LABELS:{},KIND_COLOR:{ventas:1,gastos:2},webhook:{urls:{ventas_semanales:'v',gastos_semanales:'g'},ev:{ventas_semanales:true,gastos_semanales:true}},ME:{id:'emuzvkc99z8q'},discordSend(...args){sent.push(args);return true},renderModDiscord:()=>'<div class="pay-err" id="whErr"></div>',autoWeekly:()=>7,esc:x=>x,dcFail(){throw Error('fallo')},say(){}};
 vm.runInNewContext(fs.readFileSync('discord-semanales.js','utf8'),ctx);await ctx.discordSend('ventas','REGISTRO SEMANAL DE VENTAS');await ctx.discordSend('gastos','REGISTRO DE GASTOS · SEMANAL');await ctx.discordSend('ventas','VENTA · HG-1');assert.deepEqual(sent.map(x=>x[0]),['ventas_semanales','gastos_semanales','ventas']);assert.match(ctx.renderModDiscord(),/data-whu="ventas_semanales"/);assert.equal(ctx.autoWeekly(),7);ctx.ME.id='empleado';await ctx.autoWeekly();
});
const from='1520880618735669441',to='1520881877542502492',id='1560384210517106762';
function env({publishStatus=200,badCopy=false,normal=false}={}){
 const calls=[],store=new Map(),original={id,channel_id:from,webhook_id:'webhook',content:'',embeds:[{title:'CIERRE DE SEMANA',description:normal?'VENTA INDIVIDUAL':'REGISTRO SEMANAL DE VENTAS'}],attachments:[{filename:'Semana_Ventas_TODOS.txt',size:3,url:`https://cdn.discordapp.com/attachments/${from}/111/doc.txt`}]};let saved;
 const sb={from:table=>({select(){return this},eq(k,v){this.key=v;return this},maybeSingle:async()=>({data:null}),upsert:async v=>{store.set(v.clave,v.valor);return {}},insert:async()=>({})})};
 const request=async(url,options={})=>{url=String(url);calls.push({url,method:options.method||'GET'});if(url.includes('cdn.discordapp.com'))return new Response('abc');if(options.method==='POST'){saved=JSON.parse(options.body.get('payload_json'));return new Response(JSON.stringify({id:'1555555555555555555'}),{status:publishStatus});}if(options.method==='DELETE')return new Response(null,{status:204});if(url.endsWith('/'+id))return Response.json(original);return Response.json({...original,id:'1555555555555555555',channel_id:to,content:badCopy?'distinto':'',embeds:saved.embeds});};
 return {sb,request,calls,store};
}
test('traslado conserva documento y texto; verifica el destino antes de borrar el original',async()=>{const e=env();const r=await reubicarSemanal(e.sb,{token:'test'},{origen:from,mensaje:id},e.request);assert.equal(r.verificado,true);assert.equal(r.destino,to);const del=e.calls.findIndex(x=>x.method==='DELETE'),verify=e.calls.findIndex(x=>x.url.includes('/'+to+'/messages/1555555555555555555'));assert.ok(verify>=0&&del>verify);assert.equal(e.store.size,1);});
test('fallo de publicación, copia distinta o venta individual nunca borra el original',async()=>{for(const opts of [{publishStatus:403},{badCopy:true},{normal:true}]){const e=env(opts);await assert.rejects(reubicarSemanal(e.sb,{token:'test'},{origen:from,mensaje:id},e.request));assert.equal(e.calls.some(x=>x.method==='DELETE'),false);}});
