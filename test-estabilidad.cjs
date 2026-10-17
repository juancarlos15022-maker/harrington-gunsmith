const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
function mount(full=false){
 const dom=new JSDOM(fs.readFileSync(__dirname+'/index.html','utf8'),{url:'https://prueba.invalid/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.matchMedia=()=>({matches:true,addEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.fetch=async()=>{throw Error('RED BLOQUEADA')};w.WebSocket=undefined;w.setTimeout=()=>0;w.setInterval=()=>0;w.requestAnimationFrame=()=>0;w.TextEncoder=TextEncoder;w.AbortController=AbortController;
 const MO=w.MutationObserver;w.MutationObserver=class{observe(){}disconnect(){}};
 w.eval(fs.readFileSync(__dirname+'/auto-fabricacion.js','utf8'));let code=fs.readFileSync(__dirname+'/app.js','utf8');if(full)code+='\n'+[...w.document.querySelectorAll('script[src]')].map(x=>x.getAttribute('src').split('?')[0]).filter(x=>!['app.js','auto-fabricacion.js'].includes(x)).map(x=>fs.readFileSync(__dirname+'/'+x,'utf8')).join('\n');w.Response=Response;w.TextDecoder=TextDecoder;w.eval(code);
 w.MutationObserver=MO;return {dom,w};
}
test('barra móvil: sincronizar sin cambios no vuelve a mutar body ni realimenta su observador',async()=>{
 const {dom,w}=mount();try{w.mnSync();await Promise.resolve();let mutations=0;const obs=new w.MutationObserver(r=>mutations+=r.length);obs.observe(w.document.body,{attributes:true,attributeFilter:['class']});w.mnSync();w.mnSync();await Promise.resolve();obs.disconnect();assert.equal(mutations,0);}finally{dom.window.close();}
});
test('cierre de turno conserva el identificador exacto del registro que se envía a Discord',()=>{
 const {dom,w}=mount();try{const sent=[];w.cloudPut=(k,v)=>sent.push({k,v});const r={name:'Prueba',start:10,end:20};w.logShift(r);assert.ok(r.uid);assert.equal(sent[0].k,'turno:'+r.uid);assert.equal(sent[0].v.start,10);assert.equal(sent[0].v.end,20);}finally{dom.window.close();}
});
test('actualización: no recarga si hay configuración sin sincronizar',()=>{
 const {dom,w}=mount();try{w.document.querySelectorAll('.modal-overlay').forEach(x=>x.hidden=true);w.eval('cloud.dirty={precios:true};cloud.outbox=[];cloud.flushing=false');assert.equal(w.updSafe(),false);w.eval('cloud.dirty={}');assert.equal(w.updSafe(),true);}finally{dom.window.close();}
});
test('comprobaciones de versión simultáneas comparten una única petición',async()=>{
 const {dom,w}=mount();try{let n=0,done;w.fetch=()=>{n++;return new Promise(r=>done=r)};const a=w.verCheck(),b=w.verCheck();assert.equal(a,b);assert.equal(n,1);done({ok:true,text:async()=>'<script src="app.js?v=20261017-estabilidad1"></script>'});await a;}finally{dom.window.close();}
});
test('almacén sin cambios no repinta ni escribe almacenamiento local',()=>{
 const {dom,w}=mount();try{w.applyStockMap({'mat:Tornillo':5});let writes=0,paints=0;w.saveStock=()=>writes++;w.matPaint=()=>paints++;w.applyStockMap({'mat:Tornillo':5});assert.equal(writes,0);assert.equal(paints,0);w.applyStockMap({'mat:Tornillo':6});assert.equal(writes,1);assert.equal(paints,1);}finally{dom.window.close();}
});
function worker(hit){const listeners={},net=[],pending=[];const ctx={URL,Request,Response,Set,console,setTimeout,clearTimeout,self:{registration:{scope:'https://sitio.invalid/app/'},addEventListener:(k,f)=>listeners[k]=f},caches:{open:async()=>({match:async()=>hit,put:async()=>{},keys:async()=>[]})},fetch:async r=>{net.push(r.url);return new Response('red')}};vm.runInNewContext(fs.readFileSync(__dirname+'/sw.js','utf8'),ctx);return {net,fire:(url,headers)=>{let response;listeners.fetch({request:new Request(url,{headers}),respondWith:p=>response=p,waitUntil:p=>pending.push(p)});return response;}};}
test('caché: imagen guardada genera cero descargas de red',async()=>{const c=worker(new Response('cache'));const r=await c.fire('https://sitio.invalid/app/reloj.webp');assert.equal(await r.text(),'cache');assert.equal(c.net.length,0)});
test('caché: imagen nueva se descarga; APIs autenticadas y dominios externos quedan fuera',async()=>{const c=worker(undefined);assert.equal(await (await c.fire('https://sitio.invalid/app/reloj.webp')).text(),'red');assert.equal(c.net.length,1);assert.equal(c.fire('https://sitio.invalid/app/datos.js',{Authorization:'Bearer prueba'}),undefined);assert.equal(c.fire('https://otro.invalid/foto.webp'),undefined);assert.equal(c.net.length,1)});
test('caché: código sin versión se renueva desde red y funciona sin conexión con copia guardada',async()=>{const c=worker(new Response('viejo'));assert.equal(await (await c.fire('https://sitio.invalid/app/app.js')).text(),'red');assert.equal(c.net.length,1)});
test('arranque: todos los complementos de producción cargan juntos sin errores de JavaScript',()=>{const {dom,w}=mount(true);try{assert.ok(w.document.querySelector('#finish'));assert.equal(typeof w.hgSyncReportError,'function');}finally{dom.window.close();}});
test('balance: rehacer la consulta no anula fabricaciones anteriores adicionales',()=>{const {dom,w}=mount(true);try{const a={ts:1,why:'Fabricación',prods:{Arco:1}},b={ts:2,why:'Fabricación',prods:{Arco:1}},undo={ts:3,why:'Fabricación deshecha',prods:{Arco:1}};w.stockReplay=()=>({groups:[a,b,undo]});assert.equal(w.fbReplay().length,1);assert.equal(w.fbReplay()[0].ts,1);assert.equal(a.undone,undefined);assert.equal(b.undone,true);}finally{dom.window.close();}});
test('Discord: fabricación propia usa movimiento exacto aunque otra persona fabrique después',()=>{const {dom,w}=mount(true);try{const now=Date.now(),own={ts:now-10,date:'17/10/2026',time:'15:00',why:'Fabricación',who:'Uno',prods:{Arco:1},lines:[]},other={...own,ts:now,who:'Otro'};const f=[own,other];f.all=f;w.fbReplay=()=>f;w.whoAmI=()=>({name:'Uno'});w.recipeOf=()=>[{m:'Fibra',q:1}];w.fbRealLines=()=>[{n:'Arco',q:1,c:1,p:100,d:99,tc:1,tp:100,res:99,mats:[]}];w.loadLog=()=>[{uid:'exacto',who:'Uno',why:'Fabricación',ts:own.ts}];let captured;w.discordSend=(kind,text)=>{captured=w.dcPayload(kind,text)};w.fbAuto([{producto:'Arco',delta:1}]);assert.equal(captured._hg.ref,'mov:exacto');}finally{dom.window.close();}});
