const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
function reads(){const c={Map,Promise,JSON,Object,Response,queueMicrotask};vm.createContext(c);vm.runInContext(app.slice(app.indexOf('const sbReadFlights='),app.indexOf('async function sbFetch')),c);return c.sbReadRequest;}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
test('lecturas simultáneas idénticas comparten red y cada lector consume su respuesta',async()=>{
 const read=reads(),d=deferred();let requests=0;const send=()=>{requests++;return d.promise;};
 const pending=Array.from({length:10},()=>read('/rest/v1/datos?select=clave',{},'cuenta-A',send));
 await Promise.resolve();assert.equal(requests,1);d.resolve(new Response('[1]'));
 const rows=await Promise.all(pending);assert.deepEqual(await Promise.all(rows.map(r=>r.json())),Array.from({length:10},()=>[1]));
 await read('/rest/v1/datos?select=clave',{},'cuenta-A',async()=>{requests++;return new Response('[]')});assert.equal(requests,2);
});
test('cuentas, filtros y cabeceras diferentes no comparten consultas',async()=>{
 const read=reads(),d=deferred();let requests=0;const send=()=>{requests++;return d.promise;};
 const calls=[read('/rest/v1/datos',{},'A',send),read('/rest/v1/datos',{},'B',send),read('/rest/v1/datos?select=clave',{},'A',send),read('/rest/v1/datos',{headers:{Range:'0-9'}},'A',send)];
 await Promise.resolve();assert.equal(requests,4);d.resolve(new Response('[]'));await Promise.all(calls);
});
test('una escritura invalida lecturas al comenzar y terminar y nunca se agrupa',async()=>{
 const read=reads(),before=deferred(),write=deferred(),during=deferred();let requests=0;
 const send=d=>()=>{requests++;return d.promise;};
 const a=read('/rest/v1/stock',{},'A',send(before));
 const w1=read('/rest/v1/rpc/vender',{method:'POST'},'A',send(write));
 const w2=read('/rest/v1/rpc/vender',{method:'POST'},'A',send(write));
 const b=read('/rest/v1/stock',{},'A',send(during));
 await Promise.resolve();assert.equal(requests,4);write.resolve(new Response('{}'));await Promise.all([w1,w2]);
 const c=read('/rest/v1/stock',{},'A',async()=>{requests++;return new Response('[3]')});assert.deepEqual(await(await c).json(),[3]);assert.equal(requests,5);
 before.resolve(new Response('[1]'));during.resolve(new Response('[2]'));await Promise.all([a,b]);
});
test('fallos se pueden reintentar; señales y RPC de lectura conservan peticiones independientes',async()=>{
 const read=reads();let requests=0;const fail=()=>{requests++;throw Error('offline')};
 await assert.rejects(read('/rest/v1/datos',{},'A',fail),/offline/);await assert.rejects(read('/rest/v1/datos',{},'A',fail),/offline/);assert.equal(requests,2);
 const d=deferred(),send=()=>{requests++;return d.promise;};const calls=[read('/rest/v1/datos',{signal:{}},'A',send),read('/rest/v1/datos',{signal:{}},'A',send),read('/rest/v1/rpc/consulta',{},'A',send),read('/rest/v1/rpc/consulta',{},'A',send)];assert.equal(requests,6);d.resolve(new Response('[]'));await Promise.all(calls);
});
test('precios, encargos y totales se actualizan sin retener el cliente anterior',()=>{
 let lookups=0,prices={precios:{Arma:8}},loadedEnc=null;
 const c={Math,parseInt,MAX_QTY:999,inputs:[{value:'2',dataset:{name:'Arma',price:'10'}},{value:'0',dataset:{name:'Otra',price:'20'}}],specialPrices:()=>{lookups++;return prices},origQty:()=>0,currentDiscount:()=>null,manualDiscountValue:()=>0,manualDiscountAllowed:()=>false,customer:{op:'venta'},appMode:'venta',loadedEnc:null};
 vm.createContext(c);vm.runInContext(app.slice(app.indexOf('function readQty'),app.indexOf('function summaryText'))+app.slice(app.indexOf('function selected()'),app.indexOf('function saveOrder'))+app.slice(app.indexOf('function computeFin('),app.indexOf('function finToSale')),c);
 assert.equal(c.selected()[0].cents,800);assert.equal(lookups,1);prices={precios:{Arma:7}};assert.equal(c.selected()[0].cents,700);
 let fin=c.computeFin();assert.equal(fin.base,2000);assert.equal(fin.final,1400);assert.deepEqual(JSON.parse(JSON.stringify(c.computeFin({base:2000,afterPrices:1400}))),JSON.parse(JSON.stringify(fin)));
 c.loadedEnc={items:[{name:'Arma',cents:625}],depositCents:500};assert.equal(c.selected()[0].cents,625);fin=c.computeFin();assert.equal(fin.final,1250);assert.equal(fin.paid,500);assert.equal(fin.due,750);
 c.loadedEnc=null;prices=null;assert.equal(c.selected()[0].cents,1000);c.inputs[0].value='0';lookups=0;assert.equal(c.selected().length,0);assert.equal(lookups,0);
});
test('sbFetch conserva renovación tras 401 y descarta respuestas de otra cuenta',async()=>{
 const pending=deferred();let count=0;
 const c={Map,Promise,JSON,Object,Response,queueMicrotask,AbortController,setTimeout:()=>1,clearTimeout(){},ME:{id:'A'},AUTH:{emp:'A',at:'viejo'},SANDBOX:false,SB_URL:'https://prueba.invalid',SB_KEY:'public',authToken:async()=>c.AUTH.at,authRefresh:async()=>{c.AUTH.at='nuevo';return c.AUTH;},fetch:async()=>{count++;if(count===1)return new Response('{}',{status:401});if(count===2)return new Response('[1]');return pending.promise;}};
 vm.createContext(c);vm.runInContext(app.slice(app.indexOf('const sbReadFlights='),app.indexOf('/* Llamada a la función «cuentas»')),c);
 assert.deepEqual(await(await c.sbFetch('/rest/v1/datos')).json(),[1]);assert.equal(count,2);
 const waiting=c.sbFetch('/rest/v1/stock');while(count<3)await Promise.resolve();c.ME={id:'B'};c.AUTH={emp:'B',at:'otra'};pending.resolve(new Response('[2]'));const old=await waiting;assert.equal(old.status,401);assert.equal((await old.json()).message,'SESION_CAMBIADA');
});
