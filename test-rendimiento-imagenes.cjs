const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(__dirname+'/app.js','utf8'),sw=fs.readFileSync(__dirname+'/sw.js','utf8');
test('importes y fechas conservan precisión, cambio de minuto y horario de Madrid',()=>{
 const c={Intl,Date,Map};vm.createContext(c);
 vm.runInContext(app.slice(app.indexOf('const moneyFmt='),app.indexOf('function numIn'))+app.slice(app.indexOf('const madridFmt='),app.indexOf('function esc')),c);
 const money=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 for(const n of [0,1,50,125,-1,-500,123456789,0.5,NaN,Infinity])assert.equal(c.money(n),'$'+money.format(n/100));
 let amount=100;const changing={valueOf:()=>amount};assert.equal(c.money(changing),'$1.00');amount=200;assert.equal(c.money(changing),'$2.00');
 const fmt=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 for(const date of ['2026-03-29T00:59:59Z','2026-03-29T01:00:00Z','2026-10-25T00:59:59Z','2026-10-25T01:00:00Z']){const expected=Object.fromEntries(fmt.formatToParts(new Date(date)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));assert.deepEqual({...c.madridParts(date)},expected);const a=c.madridParts(date);a.hour='corrupto';assert.deepEqual({...c.madridParts(date)},expected)}
 assert.throws(()=>c.madridParts('fecha inválida'),/Invalid time/);
});
function worker(code,shared,network,broken=false){
 const listeners={},waits=[];const caches={keys:async()=>[...shared.keys()],delete:async n=>shared.delete(n),open:async name=>{if(broken)throw Error('CACHE_NO_DISPONIBLE');if(!shared.has(name))shared.set(name,new Map());const m=shared.get(name),key=r=>typeof r==='string'?r:r.url;return {match:async r=>m.get(key(r))?.clone(),put:async(r,v)=>m.set(key(r),v.clone()),keys:async()=>[...m.keys()].map(k=>new Request(k)),delete:async r=>m.delete(key(r))}}};
 const context={URL,Request,Response,Headers,Set,Map,Object,console,setTimeout,clearTimeout,self:{registration:{scope:'https://sitio.invalid/app/'},clients:{claim:async()=>{}},addEventListener:(k,f)=>listeners[k]=f},caches,fetch:async r=>{network.push(r.url);if(r.headers.get('If-None-Match'))return new Response(null,{status:304});return new Response('imagen-'+network.length,{headers:{etag:'"imagen-'+network.length+'"'}})}};
 vm.runInNewContext(code,context);
 return {activate:async()=>{let p;listeners.activate({waitUntil:r=>p=r});await p;},get:async(url,headers)=>{let p;listeners.fetch({request:new Request(url,{headers}),respondWith:r=>p=r,waitUntil:r=>waits.push(r)});return p?await p:undefined}};
}
test('imágenes: otra versión de código reutiliza el archivo; cambiar su huella descarga el nuevo',async()=>{
 const stores=new Map(),net=[],a=worker(sw,stores,net),url='https://sitio.invalid/app/diploma.webp';
 assert.equal(await(await a.get(url)).text(),'imagen-1');assert.equal(await(await a.get(url+'?v=otra')).text(),'imagen-1');assert.equal(net.length,1);
 const b=worker(sw.replace("PREFIX+'20261021-entradapc1'","PREFIX+'release-test-2'"),stores,net);await b.activate();assert.equal(await(await b.get(url)).text(),'imagen-1');assert.equal(net.length,2);assert.equal(await(await b.get(url)).text(),'imagen-1');assert.equal(net.length,2);
 const changed=sw.replace(/("diploma.webp":")[a-f0-9]+"/,'$1'+'b'.repeat(40)+'"'),c=worker(changed,stores,net);await c.activate();assert.equal(await(await c.get(url)).text(),'imagen-3');assert.equal(net.length,3);
 assert.equal(await c.get(url,{Authorization:'Bearer cuenta'}),undefined);assert.equal(await c.get('https://otro.invalid/diploma.webp'),undefined);
});
test('si el almacenamiento de imágenes falla, la página sigue recibiéndolas desde la red',async()=>{
 const net=[],w=worker(sw,new Map(),net,true);assert.equal(await(await w.get('https://sitio.invalid/app/diploma.webp')).text(),'imagen-1');
});
test('decoración opcional: no compite al arrancar y limita las descargas simultáneas a dos',()=>{
 const idle=[],timers=[],images=[],seen=[];class Image{constructor(){images.push(this)}set src(v){this.url=v}}
 const c={Image,window:{requestIdleCallback:true},requestIdleCallback:f=>idle.push(f),setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length},clearTimeout(){}};
 vm.createContext(c);vm.runInContext(app.slice(app.indexOf('const optionalImages='),app.indexOf("probeImg('sello-lacre")),c);
 for(let i=0;i<4;i++)c.probeImg('img-'+i,img=>seen.push(img.url));assert.equal(images.length,0);assert.equal(idle.length,1);idle.shift()();assert.equal(images.length,2);assert.equal(images[0].decoding,'async');
 images[0].onload();for(const t of timers.filter(x=>x.ms===0))t.f();assert.equal(images.length,3);assert.deepEqual(seen,['img-0']);
});
test('dibujar recibos simultáneos reutiliza el emblema y un fallo permite cargarlo de nuevo',async()=>{
 const images=[];class Image{constructor(){images.push(this)}set src(v){this.url=v}}
 const c={Image,Map,setTimeout:()=>1,clearTimeout(){}};vm.createContext(c);vm.runInContext(app.slice(app.indexOf('const documentImages='),app.indexOf('async function',app.indexOf('const documentImages='))),c);
 const a=c.loadImage('emblema.png'),b=c.loadImage('emblema.png');assert.equal(a,b);assert.equal(images.length,1);images[0].onload();assert.equal(await a,images[0]);
 const failed=c.loadImage('otro.png');images[1].onerror();assert.equal(await failed,null);const retry=c.loadImage('otro.png');assert.equal(images.length,3);images[2].onload();await retry;
});

