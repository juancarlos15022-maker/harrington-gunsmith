const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const code=fs.readFileSync(fs.existsSync('candidate-app.js')?'candidate-app.js':'app.js','utf8'),a=code.indexOf('function pedidoCancelResumen('),b=code.indexOf('\npedBtn.onclick',a);
const save=code.slice(code.indexOf('async function savePedido(){'),code.indexOf('/* Llegada de pedidos',code.indexOf('async function savePedido(){')));
const base={id:'p1',code:'PED-TEST',proveedor:'Mina',items:[{material:'Hierro',qty:500,rq:250,price:50},{material:'Carbón',qty:800,rq:800,price:10},{material:'Sal',qty:800,rq:800,price:7}],totalCents:38600,paid:false,received:false};
async function run(choice){
const dom=new JSDOM('<body></body>',{url:'https://example.test',runScripts:'outside-only'}),w=dom.window;let rpc=0,rows=[],notifications=[];const mem=new Map();
Object.assign(w,{pedidos:[structuredClone(base)],gastos:[],pedView:'p1',pedDraft:null,bossActive:true,SANDBOX:false,empleados:[{id:'e1',name:'Vincent'}],LOTC:null,
 money:n=>'$'+(n/100).toFixed(2),pendingPed:()=>w.pedidos.filter(p=>!p.cancelled&&!p.completedAt),store:{get:k=>mem.get(k),set:(k,v)=>mem.set(k,v),remove:k=>mem.delete(k)},
 openModal:e=>e.hidden=false,closeModal:e=>e.hidden=true,sbFetch:async()=>({ok:true,json:async()=>[{valor:structuredClone(w.pedidos[0])}]}),
 sbRpc:async(name,body)=>{rpc++;assert.equal(name,'cancelar_pedido');assert.equal(body.p_recibido_pagado,choice==='yes');const rec={...structuredClone(base),items:base.items.map(i=>({...i,qty:i.rq})),totalCents:26100,received:true,paid:choice==='yes',completedAt:choice==='yes'?1:0,remainderCancelled:true,liquidacion:{receivedCents:26100,cancelledCents:12500,paidCents:choice==='yes'?26100:0,payableCents:choice==='yes'?0:26100}};return {pedido:rec,records:[{clave:'pedido:p1',valor:rec}]};},
 applyRecords:r=>{rows=r;w.pedidos[0]=r[0].valor},renderPed:()=>{},updatePedBtn:()=>{},say:m=>notifications.push(m),pedidoText:()=>'Pedido',discordSend:()=>true,cloudPut:()=>{},cloudPullRecords:async()=>{},soyPropietario:()=>true,saveGastos:()=>{},savePed:r=>w.pedidos[0]=r,
 madridParts:()=>({year:'2026',month:'10',day:'19',hour:'16',minute:'00'}),dayNum:()=>20745});
w.eval(code.slice(a,b));w.eval(save);
const task=w.cancelPedido('p1');await new Promise(r=>setImmediate(r));
assert.ok(w.document.querySelector('#pcTitle').textContent.includes('pagado'));
w.document.querySelector('[data-pc="'+choice+'"]').click();await task;
if(choice==='back'){assert.equal(rpc,0);return;}
assert.equal(rpc,1);assert.equal(w.pedidos[0].items[0].qty,250);assert.equal(w.pedidos[0].totalCents,26100);
if(choice==='no'){
 assert.equal(w.pendingPed().length,1);assert.equal(w.pedView,'p1');assert.equal(w.gastos.length,0);
 w.pedDraft={emp:'e1',received:true,oRec:true,paid:true,oPaid:false};await w.savePedido();
 assert.equal(w.gastos.length,1);assert.equal(w.gastos[0].cents,26100);assert.equal(w.pendingPed().length,0);assert.equal(w.pedidos[0].liquidacion.paidCents,26100);assert.equal(w.pedidos[0].liquidacion.payableCents,0);
}else assert.equal(w.pendingPed().length,0);
assert.equal(w.document.querySelector('#pcTitle'),null);
}
(async()=>{await run('yes');await run('no');await run('back');console.log('OK: botones Sí/No/Volver; No conserva solo lo recibido; pagar después registra 261,00 una vez y retira el pedido.');})().catch(e=>{console.error(e);process.exit(1)});
