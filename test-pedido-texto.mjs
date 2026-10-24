import assert from 'node:assert/strict';
import {textoPedido,sincronizarTexto} from './supabase/functions/albaranes-pedidos/texto.ts';
const p={id:'p1',code:'PED-1',proveedor:'Herrería',ediciones:2,totalCents:1250,abonoCents:250,items:[{material:'Tornillo',qty:50,price:25,rq:10}]};
const text=textoPedido(p);assert.match(text.embeds[0].description,/50 × Tornillo/);assert.match(text.embeds[0].description,/12.50/);assert.match(text.embeds[0].description,/10.00/);assert.equal(text.components[0].components[0].custom_id,'ped:rec:p1');assert.equal(textoPedido({...p,received:true}).components.length,0);
const sb={from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='bot_pedmsg'?{mensaje_id:'original'}:{message_id:'privado',channel_id:'dm',ic_message_id:'telegrama'}})})})})};
const calls=[];await sincronizarTexto(sb,async(...args)=>{calls.push(args)},'pedidos',p,'p1');assert.equal(calls.length,3);assert.deepEqual(calls.map(x=>x[0]),['PATCH','PATCH','PATCH']);assert.equal(calls[0][1],'/channels/pedidos/messages/original');assert.match(calls[2][2].content,/50 × Tornillo/);assert.match(calls[2][2].content,/12.50/);assert.equal('components' in calls[1][2],false);
await assert.rejects(()=>sincronizarTexto(sb,async()=>{throw Error('DISCORD_429')},'pedidos',p,'p1'),/429/);
await sincronizarTexto(sb,async()=>{throw Error('DISCORD_404')},'pedidos',p,'p1');
console.log('PASS: texto, total, abonos, mensaje original, privado y telegrama actualizados; reintento ante fallo.');
