/* HARRINGTON GUNSMITH · app.js · versión 20261009n
   Este archivo va junto a index.html y estilos.css en la misma carpeta. */
/* ===== MODO PRUEBA (Arthur Ayudante) =====
   Si esta pestaña está en modo prueba, nada sale de este móvil: la nube y Discord se simulan en memoria.
   Al entrar se copia una vez lo que hay en la nube (solo lectura) para probar con datos reales;
   todo lo que se hace después se queda aquí y desaparece al salir o cerrar la pestaña. */
var SANDBOX=false;try{SANDBOX=sessionStorage.getItem('harrington_sandbox')==='1'}catch(e){}
var SBX={dc:[]};
if(SANDBOX)(function(){
 const PRUEBA={id:'prueba',name:'Arthur Ayudante',puesto:'Jefe',sueldo:5000,horas:10,inicio:'2026-01-01',prueba:'',sinPrueba:true,alta:Date.now()};
 /* 1) almacenamiento local: una copia en memoria; el de verdad no se toca */
 const mem={};
 try{for(let i=0;i<window.localStorage.length;i++){const k=window.localStorage.key(i);mem[k]=window.localStorage.getItem(k)}}catch(e){}
 delete mem['harrington_cloud_outbox'];delete mem['harrington_cloud_dirty'];
 try{const em=JSON.parse(mem['harrington_empleados_v1']||'[]');if(Array.isArray(em)&&!em.some(x=>x.id==='prueba')){em.push(PRUEBA);mem['harrington_empleados_v1']=JSON.stringify(em)}}catch(e){mem['harrington_empleados_v1']=JSON.stringify([PRUEBA])}
 const fakeLS={getItem:k=>Object.prototype.hasOwnProperty.call(mem,k)?mem[k]:null,setItem:(k,v)=>{mem[k]=String(v)},removeItem:k=>{delete mem[k]},clear:()=>{for(const k in mem)delete mem[k]},key:i=>Object.keys(mem)[i]||null,get length(){return Object.keys(mem).length}};
 try{Object.defineProperty(window,'localStorage',{configurable:true,get:()=>fakeLS})}catch(e){}
 /* 2) sin avisos instantáneos de la nube real */
 try{window.WebSocket=undefined}catch(e){}
 /* 3) la nube y Discord simulados */
 const realFetch=window.fetch.bind(window), DB={}, ST={};let CNT=0, seeded=null;
 const J=(o,st)=>Promise.resolve(new Response(o===null?null:JSON.stringify(o),{status:st||200,headers:{'Content-Type':'application/json'}}));
 const now=()=>new Date().toISOString();
 const SB='https://mrlpvjxuifvspeaqtscm.supabase.co', KEY='sb_publishable_OvDXH0UuWJMMBd6fYgOxtg_IsVBZKTz';
 function seed(){
  if(seeded)return seeded;
  const h={apikey:KEY};
  seeded=Promise.all([
   realFetch(SB+'/rest/v1/datos?select=clave,valor,actualizado',{headers:h}).then(r=>r.ok?r.json():[]).catch(()=>[]),
   realFetch(SB+'/rest/v1/stock?select=producto,cantidad',{headers:h}).then(r=>r.ok?r.json():[]).catch(()=>[]),
   realFetch(SB+'/rest/v1/contador?select=valor&id=eq.1',{headers:h}).then(r=>r.ok?r.json():[]).catch(()=>[])
  ]).then(([d,s,c])=>{
   (d||[]).forEach(x=>{if(!/^(presencia-|expulsion:)/.test(x.clave))DB[x.clave]={valor:x.valor,actualizado:x.actualizado}});
   const em=DB.empleados&&Array.isArray(DB.empleados.valor)?DB.empleados.valor:[];
   if(!em.some(x=>x.id==='prueba'))DB.empleados={valor:em.concat([PRUEBA]),actualizado:now()};
   (s||[]).forEach(x=>{ST[x.producto]=x.cantidad});
   CNT=(c&&c[0]&&c[0].valor)||0;
  });
  return seeded;
 }
 const pre=f=>decodeURIComponent(f.slice(5)).replace(/\*/g,'');
 function rowsFor(q){
  let rows=Object.keys(DB).map(k=>({clave:k,valor:DB[k].valor,actualizado:DB[k].actualizado}));
  const f=q.get('clave');
  if(f){
   if(f.startsWith('in.('))rows=rows.filter(r=>f.slice(4,-1).split(',').includes(r.clave));
   else if(f.startsWith('eq.'))rows=rows.filter(r=>r.clave===f.slice(3));
   else if(f.startsWith('like.')){const p=decodeURIComponent(f.slice(5));rows=p==='*:*'?rows.filter(r=>r.clave.includes(':')):rows.filter(r=>r.clave.startsWith(pre(f)))}
  }
  const a=q.get('actualizado');if(a&&a.startsWith('gt.')){const t=Date.parse(a.slice(3));rows=rows.filter(r=>Date.parse(r.actualizado)>t)}
  if(q.get('order')==='actualizado.asc')rows.sort((x,y)=>Date.parse(x.actualizado)-Date.parse(y.actualizado));
  if(q.get('limit'))rows=rows.slice(0,+q.get('limit'));
  const sel=q.get('select');if(sel&&sel!=='*'){const c=sel.split(',');rows=rows.map(r=>{const o={};c.forEach(k=>{if(k in r)o[k]=r[k]});return o})}
  return rows;
 }
 async function fakeSB(url,init){
  await seed();
  const u=new URL(url), path=u.pathname.replace('/rest/v1/',''), q=u.searchParams, m=((init&&init.method)||'GET').toUpperCase();
  const body=init&&init.body?JSON.parse(init.body):null, pref=String(((init&&init.headers)||{}).Prefer||((init&&init.headers)||{}).prefer||'');
  if(path.startsWith('rpc/')){
   const fn=path.slice(4);
   if(fn==='siguiente_numero'){CNT++;return J(CNT)}
   if(fn==='mover_stock'){const n=Object.assign({},ST);for(const it of (body&&body.p_items)||[]){let v=n[it.producto];if(v==null){if(it.delta<0)return J({message:'STOCK_INSUFICIENTE',code:'P0001'},400);v=0}v+=it.delta;if(v<0)return J({message:'STOCK_INSUFICIENTE',code:'P0001'},400);n[it.producto]=v}Object.assign(ST,n);return J(Object.assign({},ST))}
   return J({},200);
  }
  if(path==='datos'){
   if(m==='GET')return J(rowsFor(q));
   if(m==='POST'){const ins=[];(body||[]).forEach(r=>{if(/ignore-duplicates/.test(pref)&&DB[r.clave])return;DB[r.clave]={valor:r.valor,actualizado:r.actualizado||now()};ins.push({clave:r.clave,valor:r.valor,actualizado:DB[r.clave].actualizado})});return /return=representation/.test(pref)?J(ins,201):J(null,201)}
   if(m==='DELETE'){const f=q.get('clave')||'';if(f.startsWith('eq.'))delete DB[decodeURIComponent(f.slice(3))];else if(f.startsWith('like.')){const p=pre(f);Object.keys(DB).forEach(k=>{if(k.startsWith(p))delete DB[k]})}return J(null,204)}
  }
  if(path==='stock'){
   if(m==='GET')return J(Object.keys(ST).map(k=>({producto:k,cantidad:ST[k]})));
   if(m==='POST'){(body||[]).forEach(r=>{ST[r.producto]=r.cantidad});return J(null,201)}
   if(m==='PATCH'){const f=decodeURIComponent(q.get('producto')||'');Object.keys(ST).forEach(k=>{if(f.startsWith('not.like.mat:')&&k.startsWith('mat:'))return;if(f.startsWith('like.mat:')&&!k.startsWith('mat:'))return;ST[k]=body.cantidad});return J(null,204)}
  }
  if(path==='contador'){if(m==='GET')return J([{valor:CNT}]);if(m==='PATCH'){CNT=body.valor;return J(null,204)}}
  return J({},200);
 }
 let mid=900000;
 function fakeDiscord(url,init){
  let text='';
  try{const b=init&&init.body;const pj=b instanceof FormData?JSON.parse(b.get('payload_json')||'{}'):JSON.parse(b||'{}');const e=(pj.embeds||[])[0];text=pj.content||(e?((e.title||'')+'\n'+(e.description||'')):'');text=text.replace(/\*\*/g,'')}catch(e){}
  let ch='general';try{const W=typeof webhook!=='undefined'?webhook:null;if(W)ch=Object.keys(W.urls||{}).find(k=>W.urls[k]&&url.indexOf(W.urls[k].split('?')[0])===0)||'general'}catch(e){}
  const edit=/\/messages\//.test(url);
  SBX.dc.push({ch:ch,text:text,edit:edit,ts:Date.now(),file:!!(init&&init.body instanceof FormData&&init.body.get('files[0]'))});
  try{sbxPaint()}catch(e){}
  if(edit){const m=url.match(/messages\/(\d+)/);return J({id:m?m[1]:String(++mid)})}
  if(url.indexOf('wait=true')>=0)return J({id:String(++mid)});
  return J(null,204);
 }
 window.fetch=function(u,init){
  const url=typeof u==='string'?u:((u&&u.url)||'');
  if(url.indexOf(SB)===0)return fakeSB(url,init);
  if(/discord(app)?\.com\/api\/webhooks/.test(url))return fakeDiscord(url,init);
  return realFetch(u,init);
 };
 SBX.exit=function(){try{['harrington_sandbox','harrington_me_v1','harrington_boss_active_v1','harrington_tab'].forEach(k=>sessionStorage.removeItem(k))}catch(e){}location.reload()};
})();
/* ===== Referencias ===== */
/* Productos añadidos y precios editados desde Dirección: se aplican antes de leer el catálogo */
(function(){
 let cp=[],pr={};
 try{cp=JSON.parse(localStorage.getItem('harrington_custprod_v1')||'[]');pr=JSON.parse(localStorage.getItem('harrington_prices_v1')||'{}')}catch(e){}
 const CN={revolveres:'Revolveres',pistolas:'Pistolas',repetidoras:'Repetidoras',rifles:'Rifles',escopetas:'Escopetas',blancas:'Armas blancas',municion:'Munición',suministros:'Suministros'};
 const x2=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const tpl=document.querySelector('.product');
 if(tpl&&Array.isArray(cp))cp.forEach(x=>{
  if(!x||!CN[x.cat]||!x.name)return;
  const el=tpl.cloneNode(true), inp=el.querySelector('.qty input');
  el.dataset.cat=x.cat;el.dataset.name=String(x.name).toLowerCase();el.dataset.custom='1';
  el.querySelector('.pname').innerHTML=x2(x.name)+'<small>'+CN[x.cat]+'</small>'+(x.created&&Date.now()-x.created<2592000000?'<span class="newtag">NUEVO</span>':'');
  inp.value=0;inp.dataset.name=x.name;inp.dataset.price=Number(x.price).toFixed(2);inp.dataset.custom='1';
  const same=[...document.querySelectorAll('.product[data-cat="'+x.cat+'"]')].pop();
  (same||document.querySelector('.product:last-child')).after(el);
 });
 document.querySelectorAll('.qty input').forEach(i=>{i.dataset.price0=i.dataset.price;if(pr&&pr[i.dataset.name]!=null&&Number(pr[i.dataset.name])>=0)i.dataset.price=Number(pr[i.dataset.name]).toFixed(2)});
})();
const inputs=[...document.querySelectorAll('.qty input')];
const grand=document.getElementById('grand'), cart=document.getElementById('cart'), toast=document.getElementById('toast');
const summaryEl=document.getElementById('summary');
const MAX_QTY=9999;
const KEY_ORDER='harrington_order_v1', KEY_SALE='harrington_sale_v1', KEY_COUNTER='harrington_sale_counter_v1';
let sale=null; /* venta finalizada en curso (con su número) */

/* ===== Utilidades ===== */
/* Configuración compartida entre dispositivos (se sincroniza con Supabase) */
var CLOUD_MAP={'harrington_empleados_v1':'empleados','harrington_clientes_v1':'clientes','harrington_descuentos_v1':'descuentos','harrington_prices_v1':'precios','harrington_custprod_v1':'productos','harrington_webhook_v1':'discord','harrington_stockmin_v1':'stockmin','harrington_proveedores_v1':'proveedores','harrington_recetas_v1':'recetas','harrington_boss_cred_v1':'jefe'};
var CLOUD_REV={};Object.keys(CLOUD_MAP).forEach(function(k){CLOUD_REV[CLOUD_MAP[k]]=k});
var cloud={ok:null,last:0,dirty:{},stamps:{},applying:false,timers:{},reloading:false,outbox:[],sig:{},since:'',revSeen:0,resetSeen:0,flushing:false,skipStockOk:false,num:0,joined:false};
try{cloud.outbox=JSON.parse(localStorage.getItem('harrington_cloud_outbox')||'[]')||[];cloud.since=localStorage.getItem('harrington_cloud_since')||'';cloud.resetSeen=Number(localStorage.getItem('harrington_reset_seen')||0);cloud.joined=localStorage.getItem('harrington_cloud_joined')==='1'}catch(e){}
try{cloud.dirty=JSON.parse(localStorage.getItem('harrington_cloud_dirty')||'{}')||{}}catch(e){}
const store={
 get(k){try{return localStorage.getItem(k)}catch(e){return null}},
 set(k,v){try{localStorage.setItem(k,v)}catch(e){}if(CLOUD_MAP[k]&&!cloud.applying)cloudPush(CLOUD_MAP[k])},
 remove(k){try{localStorage.removeItem(k)}catch(e){}}
};
function money(cents){return '$'+(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function numIn(v){let s=String(v||'').trim();if(s.indexOf(',')>=0&&s.indexOf('.')>=0){s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'')}else s=s.replace(',','.');return s}
function pad(n,l=2){return String(n).padStart(l,'0')}
/* Hora de España (Europe/Madrid), sea cual sea el país del usuario */
const madridFmt=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function madridParts(ms){const o={};madridFmt.formatToParts(new Date(ms)).forEach(p=>{if(p.type!=='literal')o[p.type]=p.value});return o}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function norm(s){return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function readQty(i){return Math.min(MAX_QTY,Math.max(0,parseInt(i.value)||0))}
function baseCents(i){return Math.round(parseFloat(i.dataset.price)*100)}
/* Precio efectivo: precio especial del cliente > precio de convenio > descuento de convenio > precio base */
function priceCents(i){
 const name=i.dataset.name, sp=specialPrices();
 const fz=loadedEnc&&loadedEnc.items.find(x=>x.name===name);
 if(fz)return fz.cents;
 if(sp&&sp.precios[name]!=null)return Math.round(sp.precios[name]*100);
 return baseCents(i);
}
function summaryText(p,u){return `${p} ${p===1?'producto':'productos'} · ${u} ${u===1?'unidad':'unidades'}`}
const EMPTY_ART={
 rev:'<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M6 14h34l4-4h10v8H44l-3 3h-7l-2 12h-9l2-12H6z"/><circle cx="27" cy="17" r="3.5"/><path d="M50 10V6M30 21l-1 4"/></svg>',
 scroll:'<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M14 6h34a4 4 0 0 1 4 4v20a4 4 0 0 0 4 4H22a4 4 0 0 1-4-4V10a4 4 0 0 0-4-4a4 4 0 0 0-4 4v3h8"/><path d="M24 14h20M24 19h20M24 24h14"/></svg>',
 crate:'<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M12 12l20-8 20 8v18l-20 8-20-8z"/><path d="M12 12l20 8 20-8M32 20v18M22 8l20 8"/></svg>',
 anvil:'<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M8 12h34l10-6h4v10h-8l-6 6H22l-2 8h8v4H12v-4h4l2-8H8z"/></svg>'
};
const EMPTY_IMG={rev:'vacio-pedido.webp',scroll:'vacio-encargos.webp',crate:'vacio-pedidos.webp',anvil:'vacio-materiales.png'};
/* Imagen propia si está subida; si no, el dibujo de líneas */
function emptyArt(k){return '<span class="empty-art"><img src="'+EMPTY_IMG[k]+'" alt="" loading="lazy" decoding="async" onerror="this.parentNode.classList.add(\'nofile\')">'+(EMPTY_ART[k]||'')+'</span>'}
function bump(el){el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump')}
/* Evita el doble toque: mientras una operación con la nube está en marcha, el botón no responde otra vez */
const busyOps={};
async function once(key,fn,btn){
 if(busyOps[key])return;
 busyOps[key]=1;if(btn){btn.dataset.busy='1';btn.setAttribute('aria-busy','true')}setSaving(true);
 try{return await fn()}finally{delete busyOps[key];if(btn){delete btn.dataset.busy;btn.removeAttribute('aria-busy')}setSaving(false)}
}
function ago(ms){
 if(!ms)return '';const d=Math.max(0,Date.now()-ms), m=Math.floor(d/60000);
 if(m<1)return 'hace un momento';if(m<60)return 'hace '+m+' min';
 const hh=Math.floor(m/60);if(hh<24)return 'hace '+hh+' h';
 const dd=Math.floor(hh/24);return dd===1?'hace 1 día':'hace '+dd+' días';
}
/* Sello que cae en pantalla al fabricar o al recibir un pedido */
function stampFx(text){
 try{
  const el=document.createElement('div');el.className='stamp-fx';el.innerHTML='<span>'+esc(text)+'</span>';
  document.body.appendChild(el);setTimeout(()=>el.remove(),1500);
 }catch(e){}
}
let toastTimer;
const ERR_RE=/^(Sin conexión|No se pudo|No se puede|Falta|Faltan|No hay(?! cambios)|Selecciona|Escribe|Introduce|Indica|Otro empleado|Configura|Ya no se puede|Este pedido ya|Contraseña incorrecta|Las contraseñas|Añade algún|Para hacer un encargo|El presupuesto está vacío|Ningún empleado)/;
function say(t,kind,undo){const bad=kind==='err'||(kind===undefined&&ERR_RE.test(String(t)));toast.textContent=t;toast.classList.toggle('err',bad);toast.classList.toggle('has-undo',!!undo);
 if(undo){const b=document.createElement('button');b.type='button';b.className='t-undo';b.textContent='DESHACER';b.onclick=ev=>{ev.stopPropagation();clearTimeout(toastTimer);toast.classList.remove('show','has-undo');try{undo()}catch(e){}};toast.appendChild(b)}
 toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show','has-undo'),undo?5500:bad?4200:kind==='long'?4500:2000)}

/* ===== Pedido ===== */
function selected(){
 return inputs.map(i=>({name:i.dataset.name,cents:priceCents(i),qty:readQty(i),oq:origQty(i.dataset.name)})).filter(x=>x.qty>0);
}
function saveOrder(items){
 if(!items.length) return store.remove(KEY_ORDER);
 const o={};items.forEach(x=>o[x.name]=x.qty);
 store.set(KEY_ORDER,JSON.stringify(o));
}
function restoreOrder(){
 try{
  const o=JSON.parse(store.get(KEY_ORDER)||'{}');
  inputs.forEach(i=>{const q=parseInt(o[i.dataset.name]);if(q>0)i.value=Math.min(MAX_QTY,q)});
 }catch(e){}
}
function calc(animate=true){
 applyStockLimits(animate);
 let totalCents=0,units=0,products=0;
 inputs.forEach(i=>{
  const q=readQty(i), sub=q*priceCents(i), row=i.closest('.product'), subEl=row.querySelector('.subtotal'), txt=money(sub);
  if(subEl.textContent!==txt){subEl.textContent=txt;if(animate)bump(subEl)}
  const pe=row.querySelector('.price'), bc=baseCents(i), ec=priceCents(i), ptxt=ec!==bc?`<small class="was">${money(bc)}</small>${money(ec)}`:money(ec);
  if(pe.dataset.v!==ptxt){pe.innerHTML=ptxt;pe.dataset.v=ptxt}
  row.classList.toggle('has-qty',q>0);
  totalCents+=sub;units+=q;if(q>0)products++;
 });
 const fin=computeFin();renderFin(fin);
 const gTxt=money(fin.due);
 if(grand.dataset.v!==gTxt){grand.dataset.v=gTxt;rollTo(grand,fin.due,!animate);if(animate)bump(grand)}
 updateOrderBar(units,products,fin.due);
 summaryEl.textContent=summaryText(products,units);
 const items=selected();
 if(!items.length) cart.innerHTML='<div class="empty">'+emptyArt('rev')+'Aún no hay productos en el pedido.<br>Añade cantidades desde el catálogo.</div>';
 else cart.innerHTML=cartHTML(items);
 if(appMode==='venta')saveOrder(items);
 return totalCents;
}

/* ===== Venta, número y comprobante ===== */
function nextSaleNumber(){
 const n=(parseInt(store.get(KEY_COUNTER))||0)+1;
 store.set(KEY_COUNTER,String(n));
 return n;
}
function signature(items){return items.map(x=>x.name+':'+x.qty+':'+x.cents).join('|')+'#'+customerName()+'#'+(currentDiscount()?currentDiscount().id+currentDiscount().pct:'')+'#'+empName()+'#'+customer.op+'#'+customer.telegram.trim()+'#'+computeFin().paid+'#'+(loadedEnc?loadedEnc.id:'')+'#'+customer.note+'#'+customer.promise}
function snapshot(items,now){
 const total=items.reduce((a,x)=>a+x.qty*x.cents,0), units=items.reduce((a,x)=>a+x.qty,0);
 return {
  items:items.map(x=>({name:x.name,cents:x.cents,qty:x.qty,oq:x.oq||0})),
  totalCents:total,units:units,products:items.length,sig:signature(items),
  client:customerName(),employee:empName(),note:customer.note.trim(),promise:(customer.op==='encargo'&&!loadedEnc)?customer.promise:'',convenio:discTag(currentDiscount()),convenioKind:currentDiscount()?(currentDiscount().kind==='oferta'?'Oferta':'Convenio'):'',
  ...finToSale(computeFin()),op:loadedEnc?'venta':customer.op,fromEncargo:loadedEnc?loadedEnc.id:'',telegram:loadedEnc?loadedEnc.telegram:(customer.op==='encargo'?customer.telegram.trim():''),
  date:`${madridParts(now.getTime()).day}/${madridParts(now.getTime()).month}/${madridParts(now.getTime()).year}`,
  time:`${madridParts(now.getTime()).hour}:${madridParts(now.getTime()).minute}`
 };
}
/* Crea la venta (asigna número solo la primera vez) o actualiza sus datos si el pedido cambió. */
function ensureSale(){
 const items=selected();
 if(!items.length){say('Añade algún producto primero');return null}
 if(!customerOk())return null;
 if(!stockOk(items))return null;
 if(customer.op==='encargo'&&!loadedEnc&&computeFin().raw<=0){
  say('Para hacer un encargo es obligatorio indicar el pago por adelantado');
  depositInput.focus();return false;
 }
 const now=new Date();
 if(!sale){
  const mp=madridParts(now.getTime());
  const id=`HG-${mp.day}${mp.month}${mp.year.slice(-2)}-${pad(cloud.num||nextSaleNumber(),3)}`;cloud.num=0;
  sale=Object.assign({id:id},snapshot(items,now));
  store.set(KEY_SALE,JSON.stringify(sale));
 }else if(sale.sig!==signature(items)){
  sale=Object.assign({id:sale.id,stockApplied:sale.stockApplied,sentSig:sale.sentSig},snapshot(items,now));
  store.set(KEY_SALE,JSON.stringify(sale));
 }
 applyStock(sale);
 logSale(sale);
 rememberClient(sale);
 if(sale.op==='encargo')saveEncargoFromSale(sale);
 return sale;
}
function restoreSale(){
 try{
  const s=JSON.parse(store.get(KEY_SALE)||'null');
  if(s&&s.id&&Array.isArray(s.items))sale=s;
 }catch(e){}
}
function resetSale(){sale=null;store.remove(KEY_SALE)}
/* Desglose económico: subtotal, convenio, precio final, señal / abonado */
function parseMoney(v){const n=parseFloat(numIn(v).replace(/[^0-9.]/g,''));return isFinite(n)&&n>0?Math.round(Math.min(n,99999999)*100):0}
function computeFin(){
 let base=0,afterPrices=0;
 inputs.forEach(i=>{const q=readQty(i);if(q){base+=q*baseCents(i);afterPrices+=q*priceCents(i)}});
 /* Convenio u oferta: beneficio calculado sobre la mercancía (ver benefitFor) */
 const dsc=currentDiscount(), bd=dsc?benefitFor(dsc,afterPrices):{cents:0,label:''};
 const final=afterPrices-bd.cents, discounts=[];
 if(base-afterPrices>0)discounts.push({label:'Precio especial',cents:base-afterPrices});
 if(bd.cents>0)discounts.push({label:bd.label,cents:bd.cents});
 const enc=customer.op==='encargo'&&!loadedEnc&&appMode==='venta';
 const raw=loadedEnc?loadedEnc.depositCents:(enc?parseMoney(customer.deposit):0);
 const kind=loadedEnc?'fianza':(enc?'senal':'');
 const paid=Math.min(raw,final);
 return {base:base,final:final,discount:Math.max(0,base-final),discounts:discounts,discInfo:dsc,raw:raw,over:raw>final,kind:kind,paid:paid,pending:final-paid,due:kind?final-paid:final};
}
function finToSale(f){return {baseCents:f.base,discountCents:f.discount,discounts:f.discounts,discInfo:f.discInfo,kind:f.kind,totalCents:f.final,paidCents:f.paid,pendingCents:f.pending}}
function finRows(s){
 const r=[], ds=s.discounts||(s.discountCents>0?[{label:s.discountLabel||'Convenio',cents:s.discountCents}]:[]), disc=ds.length>0;
 if(disc){r.push(['Subtotal',money(s.baseCents)]);ds.forEach(d=>r.push([d.label,'−'+money(d.cents),'disc']))}
 if(s.kind){
  r.push([s.kind==='senal'?'Precio final del encargo':(s.kind==='fianza'&&!disc?'Subtotal mercancía':'Precio final'),money(s.totalCents)]);
  r.push([s.kind==='senal'?'Pago por adelantado':s.kind==='fianza'?'Fianza ya pagada':'Ya abonado','−'+money(s.paidCents),'paid']);
 }
 return r;
}
function dueLabel(s){return s.kind==='senal'?'PENDIENTE AL RECOGER':s.kind==='previo'?'TOTAL A COBRAR AHORA':s.kind==='fianza'?'TOTAL A COBRAR':'TOTAL'}
function dueCents(s){return s.kind?s.pendingCents:s.totalCents}
function receiptText(s){
 const line='────────────────────', enc=s.op==='encargo';
 const out=['HARRINGTON GUNSMITH',enc?'REGISTRO DE ENCARGO':'REGISTRO DE VENTA','Saint Denis · 1880','',(enc?'Encargo: ':'Venta: ')+s.id,'Fecha: '+s.date,'Hora: '+s.time];
 if(s.employee)out.push('Empleado: '+s.employee);
 if(s.client)out.push('Cliente: '+s.client);
 if(s.telegram)out.push('Telegrama: '+s.telegram);
 if(s.convenio)out.push((s.convenioKind||'Convenio')+': '+s.convenio);
 if(s.fromEncargo)out.push('Entrega del encargo: '+s.fromEncargo);
 if(s.note)out.push('Nota: '+s.note);
 if(s.promise)out.push('Entrega prevista: '+fmtISO(s.promise));
 out.push('');
 groupItems(s).forEach(g=>{if(g.title)out.push(g.title,'');g.items.forEach(x=>{out.push(x.name);out.push(`${x.qty} × ${money(x.cents)} = ${money(x.qty*x.cents)}`);out.push('')})});
 out.push(line,summaryText(s.products,s.units));
 finRows(s).forEach(r=>out.push(r[0]+': '+r[1]));
 out.push(dueLabel(s)+': '+money(dueCents(s)),line,'','El precio de un apellido.');
 return out.join('\n');
}
function renderReceipt(s){
 const enc=s.op==='encargo', $=id=>document.getElementById(id);
 $('rcTitle').textContent=enc?'REGISTRO DE ENCARGO':'REGISTRO DE VENTA';
 $('rcIdLabel').textContent=enc?'Encargo N.º':'Venta N.º';
 $('rcId').textContent=s.id;
 $('rcDate').textContent=s.date;
 $('rcTime').textContent=s.time;
 $('rcRows').innerHTML=groupItems(s).map(g=>(g.title?`<div class="rc-sub">${g.title}</div>`:'')+g.items.map(x=>`<div class="rc-row"><span>${esc(x.name)}</span><span>${x.qty}</span><span>${money(x.cents)}</span><span>${money(x.qty*x.cents)}</span></div>`).join('')).join('');
 $('rcSummary').textContent=summaryText(s.products,s.units);
 $('rcFin').innerHTML=finRows(s).map(r=>`<div class="rfin ${r[2]||''}"><span>${esc(r[0])}</span><span>${r[1]}</span></div>`).join('');
 $('rcTotalLabel').textContent=dueLabel(s);
 $('rcTotal').textContent=money(dueCents(s));
 $('rcClient').textContent=s.client||'';
 $('rcClientWrap').hidden=!s.client;
 $('rcEmp').textContent=s.employee||'';
 const st=$('paidStamp');st.textContent=s.op==='encargo'?'ANOTADO':'PAGADO';st.classList.toggle('img',document.body.classList.contains('has-pagado')&&s.op!=='encargo');st.classList.toggle('ent',!!(s.fromEncargo&&IMG_OK['sello-entregado.webp']));st.classList.remove('hit');void st.offsetWidth;st.style.animationDelay=s.op==='encargo'?'1.2s':'.6s';st.classList.add('hit');
 $('rcEmpWrap').hidden=!s.employee;
 $('rcTel').textContent=s.telegram||'';
 $('rcTelWrap').hidden=!s.telegram;
 $('rcConv').textContent=s.convenio||'';
 $('rcNote').textContent=s.note||'';$('rcNoteWrap').hidden=!s.note;
 $('rcProm').textContent=s.promise?fmtISO(s.promise):'';$('rcPromWrap').hidden=!s.promise;
 $('rcConvWrap').hidden=!s.convenio;$('rcConvWrap').firstElementChild.textContent=s.convenioKind||'Convenio';
}

/* ===== Ventanas ===== */
function openModal(el){el.hidden=false;document.body.classList.add('modal-open')}
function closeModal(el){el.hidden=true;if(!document.querySelector('.modal-overlay:not([hidden])'))document.body.classList.remove('modal-open')}
const receiptModal=document.getElementById('receiptModal'), confirmModal=document.getElementById('confirmModal');
let confirmResolve=null;
function askConfirm(title,text,yes){
 document.getElementById('confirmTitle').textContent=title;
 document.getElementById('confirmText').textContent=text;
 document.getElementById('confirmYes').textContent=yes||'Confirmar';
 openModal(confirmModal);
 document.getElementById('confirmNo').focus();
 return new Promise(r=>{confirmResolve=r});
}
function answerConfirm(v){closeModal(confirmModal);if(confirmResolve){const r=confirmResolve;confirmResolve=null;r(v)}}
document.getElementById('confirmYes').onclick=()=>answerConfirm(true);
document.getElementById('confirmNo').onclick=()=>answerConfirm(false);
confirmModal.addEventListener('click',e=>{if(e.target===confirmModal)answerConfirm(false)});
receiptModal.addEventListener('click',e=>{if(e.target===receiptModal)closeModal(receiptModal)});
document.addEventListener('keydown',e=>{
 if(e.key!=='Escape')return;
 if(!confirmModal.hidden)answerConfirm(false);
 else if(!pedModal.hidden)closeModal(pedModal);
 else if(!tutModal.hidden)closeModal(tutModal);
 else if(!prodModal.hidden)closeModal(prodModal);
 else if(!bossModal.hidden)closeModal(bossModal);
 else if(!dirModal.hidden)closeModal(dirModal);
 else if(!encModal.hidden)closeModal(encModal);
 else if(!entryModal.hidden)closeModal(entryModal);
 else if(!shiftModal.hidden)closeModal(shiftModal);
 else if(!receiptModal.hidden)closeModal(receiptModal);
});

/* ===== Acciones ===== */
async function copyText(t){
 try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(t);return true}}catch(e){}
 try{
  const ta=document.createElement('textarea');
  ta.value=t;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;opacity:0;font-size:16px';
  document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,t.length);
  const ok=document.execCommand('copy');ta.remove();return ok;
 }catch(e){return false}
}
async function doCopy(){
 const s=await ensureSaleCloud(); if(!s)return;
 const t=receiptText(s);
 if(await copyText(t))say('Venta copiada para Discord');
 else prompt('Copia este texto:',t);
}
async function doDownload(){
 const s=await ensureSaleCloud(); if(!s)return;
 const blob=new Blob(['\ufeff'+receiptText(s)],{type:'text/plain;charset=utf-8'}), a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download='Harrington_'+s.id+'.txt';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(a.href),1500);
 say('Comprobante descargado');
}
function clearQuantities(){inputs.forEach(i=>i.value=0)}
function printFx(){receiptModal.classList.remove('printing');void receiptModal.offsetWidth;receiptModal.classList.add('printing');try{playPrint()}catch(e){}}
function playPrint(){if(!soundOn)return;const c=ac();if(!c)return;const t0=c.currentTime+.05;for(let i=0;i<22;i++){const t=t0+i*.055+Math.random()*.01, len=Math.floor(c.sampleRate*.012), b=c.createBuffer(1,len,c.sampleRate), d=b.getChannelData(0);for(let k=0;k<len;k++)d[k]=(Math.random()*2-1)*(1-k/len);const s=c.createBufferSource(), f=c.createBiquadFilter(), g=c.createGain();s.buffer=b;f.type='bandpass';f.frequency.value=2400+Math.random()*600;g.gain.value=.05;s.connect(f);f.connect(g);g.connect(c.destination);s.start(t)}}
async function doNew(){
 const hasData=selected().length>0||sale;
 if(hasData&&!await askConfirm('Nueva venta','Se borrarán las cantidades y el comprobante actual. Los productos y precios no cambian.','Nueva venta'))return;
 const snap=!sale&&!loadedEnc&&selected().length?{q:[...inputs].map(i=>[i,i.value]),c:JSON.parse(JSON.stringify(customer))}:null;
 clearQuantities();resetSale();resetCustomer();calc(false);closeModal(receiptModal);
 say('Nueva venta preparada',undefined,snap?()=>{snap.q.forEach(([i,v])=>i.value=v);customer=Object.assign(defaultCustomer(),snap.c);renderCustomer();customerChanged();calc();say('Venta recuperada')}:null);
}
document.querySelectorAll('.plus').forEach(b=>b.onclick=()=>{const i=b.parentElement.querySelector('input');i.value=Math.min(MAX_QTY,readQty(i)+1);calc()});
document.querySelectorAll('.minus').forEach(b=>b.onclick=()=>{const i=b.parentElement.querySelector('input');i.value=Math.max(0,readQty(i)-1);calc()});
inputs.forEach(i=>{
 i.addEventListener('input',()=>calc());
 i.addEventListener('change',()=>{i.value=readQty(i);calc()});
 i.addEventListener('focus',()=>i.select());
});
document.getElementById('clear').onclick=async()=>{
 if(!selected().length)return say('El pedido ya está vacío');
 if(!await askConfirm('Vaciar pedido','¿Seguro que quieres borrar todos los productos del pedido actual?','Vaciar'))return;
 clearQuantities();if(appMode==='venta'){resetSale();releaseEncargo()}calc(false);say('Pedido vaciado');
};
document.getElementById('new').onclick=doNew;
document.querySelector('.panel.order').addEventListener('input',()=>setTimeout(updateFinish,0));
document.querySelector('.panel.order').addEventListener('change',()=>setTimeout(updateFinish,0));
document.getElementById('finish').onclick=e=>once('finish',async()=>{
 const s=await ensureSaleCloud(); if(!s)return;
 renderReceipt(s);openModal(receiptModal);receiptModal.scrollTop=0;printFx();if(s.op==='encargo')playPencil();else playRegister();notifySale(s);setTimeout(playThump,s.op==='encargo'?1250:650);say((s.op==='encargo'?'Encargo guardado · ':'Venta finalizada · ')+s.id);
 if(s.op!=='encargo'){askSerials(s);setTimeout(()=>checkRecord(s),1600);setTimeout(coinsFx,200);setTimeout(renderGoal,1200)}
},e.currentTarget);
/* ¡Récord de la casa!: la mayor venta o el mejor día de todos */
function checkRecord(s){
 try{
  const all=loadLog(KEY_SALELOG).filter(r=>!r.voided&&r.op!=='encargo'), prev=all.filter(r=>r.id!==s.id);
  if(prev.length<5)return;
  const me=collected(all.find(r=>r.id===s.id)||{op:'venta',dueCents:0,totalCents:0});
  const best=Math.max(0,...prev.map(collected));
  if(me>best){return recordFx('¡RÉCORD DE LA CASA!','La mayor venta de la historia: '+money(me))}
  const t=todayNum(), byDay={};prev.forEach(r=>{const d=saleDay(r);if(d!==t)byDay[d]=(byDay[d]||0)+collected(r)});
  const bestDay=Math.max(0,...Object.values(byDay)), today=all.filter(r=>saleDay(r)===t).reduce((a,r)=>a+collected(r),0);
  let flag='';try{flag=localStorage.getItem('harrington_recday')||''}catch(e){}
  if(bestDay>0&&today>bestDay&&flag!==String(t)){try{localStorage.setItem('harrington_recday',String(t))}catch(e){}recordFx('¡RÉCORD DE LA CASA!','El mejor día de la historia: '+money(today))}
 }catch(e){}
}
function recordFx(t,sub){
 const el=document.createElement('div');el.className='record-fx';el.innerHTML=`<div><b>${esc(t)}</b><span>${esc(sub)}</span></div>`;
 document.body.appendChild(el);setTimeout(()=>el.remove(),3600);playBells();
}
/* Al vender armas a un cliente con nombre, se pueden apuntar sus números de serie (opcional) */
let serSale=null;
const serModal=document.getElementById('serModal');
function weaponUnits(s){const W=weaponNames(),L=[];(s.items||[]).forEach(x=>{if(W.indexOf(x.name)>=0)for(let i=0;i<Math.min(x.qty,20);i++)L.push(x.name)});return L}
function askSerials(s){
 if(!s||!s.client||s.serialsAsked||customer.type==='sheriff')return;
 const L=weaponUnits(s); if(!L.length)return;
 s.serialsAsked=true;try{store.set(KEY_SALE,JSON.stringify(s))}catch(e){}
 serSale={id:s.id,client:s.client,units:L};
 document.getElementById('serBody').innerHTML=`<p class="bk-note">Opcional: apunta el número de serie de cada arma vendida a <b>${esc(s.client)}</b>. Se guardan en su ficha de cliente (y en su mensaje de Discord).</p>`+
  L.map((n,i)=>`<label class="ser-l">${esc(n)}<input data-sv="${i}" type="text" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="N.º de serie (opcional)"></label>`).join('')+
  '<div class="enc-actions two" style="margin-top:10px"><button type="button" id="serSkip">Ahora no</button><button type="button" class="primary" id="serSave">GUARDAR EN SU FICHA</button></div>';
 setTimeout(()=>{openModal(serModal);serModal.scrollTop=0},700);
}
serModal.addEventListener('input',e=>{const t=e.target;if(t.dataset.sv!==undefined){const v=t.value.toUpperCase().replace(/[^A-Z0-9\-\/.]/g,'').slice(0,20);if(v!==t.value)t.value=v}});
async function saveSerials(){
 if(!serSale)return closeModal(serModal);
 const vals=[...serModal.querySelectorAll('[data-sv]')].map(i=>({s:i.value.trim(),a:serSale.units[+i.dataset.sv]})).filter(x=>x.s);
 if(!vals.length){closeModal(serModal);return say('No se ha apuntado ningún número')}
 let base=clientes;
 try{const r=await sbFetch('/rest/v1/datos?select=valor&clave=eq.clientes');const rows=r.ok?await r.json():[];if(rows[0]&&Array.isArray(rows[0].valor))base=rows[0].valor}catch(e){}
 clientes=base.map(x=>Object.assign({},x));
 let c=clientes.find(x=>norm(x.name)===norm(serSale.client));
 if(!c){c={id:'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),name:serSale.client,type:'particular',telegram:'',precios:{}};clientes.push(c)}
 const S=(c.series||[]).slice(), have={};S.forEach(r=>have[r.s]=1);
 let add=0,full=0;vals.forEach(v=>{if(have[v.s])return;if(S.length>=MAX_SERIES){full++;return}S.push(v);have[v.s]=1;add++});
 c.series=S;saveClientes();refreshClientList();closeModal(serModal);
 say(add?`${add} ${add===1?'número guardado':'números guardados'} en la ficha de ${c.name}`+(full?` (ficha llena: máximo ${MAX_SERIES})`:''):'Esos números ya estaban en su ficha');
 if(add)publishClient(c.id);
 serSale=null;
}
document.getElementById('serClose').onclick=()=>closeModal(serModal);
serModal.addEventListener('click',e=>{if(e.target===serModal)closeModal(serModal);else if(e.target.id==='serSkip')closeModal(serModal);else if(e.target.id==='serSave')once('ser',saveSerials,e.target)});


document.getElementById('rcCopy').onclick=doCopy;
document.getElementById('rcDownload').onclick=doDownload;
document.getElementById('rcNew').onclick=doNew;
document.getElementById('rcClose').onclick=()=>closeModal(receiptModal);

/* ===== Categorías y buscador ===== */
let cat='todos';
const categoryVisuals={
 todos:{image:'cabecera-harrington.webp',title:'Catálogo Harrington'},
 revolveres:{image:'revolveres.webp',title:'Revólveres'},
 pistolas:{image:'pistolas.webp',title:'Pistolas'},
 repetidoras:{image:'repetidoras.webp',title:'Repetidoras'},
 rifles:{image:'rifles.webp',title:'Rifles'},
 escopetas:{image:'escopetas.webp',title:'Escopetas'},
 blancas:{image:'armas-blancas.webp',title:'Armas blancas'},
 municion:{image:'municion.webp',title:'Munición'},
 suministros:{image:'suministros.webp',title:'Suministros'}
};
function updateCategoryVisual(){
 const v=categoryVisuals[cat]||categoryVisuals.todos;
 document.getElementById('categoryImage').src=catImg(v.image);
 document.getElementById('categoryImage').alt=v.title+' · Harrington Gunsmith';
 document.getElementById('categoryTitle').textContent=v.title;
}
function filter(){
 const q=norm(document.getElementById('search').value.trim());
 let shown=0;
 document.querySelectorAll('.product').forEach(p=>{
  const ok=(cat==='todos'||p.dataset.cat===cat)&&norm(p.dataset.name).includes(q);
  p.style.display=ok?'grid':'none';if(ok)shown++;
 });
 document.getElementById('noResults').hidden=shown>0;
}
document.querySelectorAll('.cat-btn').forEach(b=>b.onclick=()=>{
 playClick();
 document.querySelectorAll('.cat-btn').forEach(x=>{x.classList.remove('active');x.setAttribute('aria-pressed','false')});
 b.classList.add('active');b.setAttribute('aria-pressed','true');
 cat=b.dataset.cat;updateCategoryVisual();filter();
});
document.getElementById('search').oninput=filter;

/* ===== Volver arriba ===== */
const toTop=document.getElementById('toTop');
let scrollTick=false;
window.addEventListener('scroll',()=>{
 if(scrollTick)return;scrollTick=true;
 requestAnimationFrame(()=>{toTop.classList.toggle('show',window.scrollY>600);scrollTick=false});
},{passive:true});
toTop.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});

/* ===== Cliente, descuentos (convenios y ofertas) y precios especiales =====
   Los convenios y ofertas los crea la Dirección desde el Modo Jefe (se guardan en este dispositivo).
   PRECIOS_CLIENTE: precios especiales por producto que se aplican solos cuando el nombre del cliente coincide.
   Ejemplo: {cliente:'Nombre del cliente',precios:{'Cattleman Revolver':9.99}} */
/* Estado de encargos almacenados (se declara aquí porque el cliente depende de él) */
const KEY_ENC='harrington_encargos_v1', KEY_LOADED='harrington_loaded_v1';
let encargos=[];
try{encargos=JSON.parse(store.get(KEY_ENC)||'[]')}catch(e){}
if(!Array.isArray(encargos))encargos=[];
let loadedEnc=encargos.find(e=>e.id===store.get(KEY_LOADED))||null;
const bannerEl=document.getElementById('loadedBanner'), finishEncBtn=document.getElementById('finishEnc'), encBtn=document.getElementById('encBtn'), encModal=document.getElementById('encModal');
function origQty(name){const f=loadedEnc&&loadedEnc.items.find(x=>x.name===name);return f?f.qty:0}
function sanitizeTelegram(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,10)}
/* Modo de la calculadora, empleados y stock */
let appMode='venta';
const modeStash={};
const KEY_EMP='harrington_empleados_v1', KEY_STOCK='harrington_stock_v1';
function loadObj(k,fallback){try{const v=JSON.parse(store.get(k)||'null');return v&&typeof v===typeof fallback?v:fallback}catch(e){return fallback}}
let empleados=loadObj(KEY_EMP,[]);
if(!Array.isArray(empleados))empleados=[];
let stockMap=loadObj(KEY_STOCK,{});
if(Array.isArray(stockMap))stockMap={};
const empSel=document.getElementById('empSel');
const noteInput=document.getElementById('saleNote'), promiseInput=document.getElementById('promiseDate'), promiseWrap=document.getElementById('promiseWrap'), clientList=document.getElementById('clientList');
const KEY_CLIENTES='harrington_clientes_v1';
let clientes=loadObj(KEY_CLIENTES,[]);
if(!Array.isArray(clientes))clientes=[];
function saveClientes(){store.set(KEY_CLIENTES,JSON.stringify(clientes))}
const KEY_PROVEEDORES='harrington_proveedores_v1', KEY_PEDIDOS='harrington_pedidos_v1', KEY_RECETAS='harrington_recetas_v1', KEY_AUS='harrington_ausencias_v1';
var ausencias=loadObj(KEY_AUS,[]);if(!Array.isArray(ausencias))ausencias=[];
var recetas=loadObj(KEY_RECETAS,{});if(!recetas||typeof recetas!=='object'||Array.isArray(recetas))recetas={};
function saveRecetas(){store.set(KEY_RECETAS,JSON.stringify(recetas))}
let proveedores=loadObj(KEY_PROVEEDORES,[]);
if(!Array.isArray(proveedores))proveedores=[];
let pedidos=loadObj(KEY_PEDIDOS,[]);
if(!Array.isArray(pedidos))pedidos=[];
function saveProveedores(){store.set(KEY_PROVEEDORES,JSON.stringify(proveedores))}
function refreshClientList(){clientList.innerHTML=clientes.map(c=>`<option value="${esc(c.name)}"></option>`).join('')}
function fmtISO(v){const t=String(v||'').split('-');return t.length===3?`${t[2]}/${t[1]}/${t[0]}`:String(v||'')}
function todayISO(){const m=madridParts(Date.now());return `${m.year}-${m.month}-${m.day}`}
/* Clientes: se guardan solos al finalizar una venta y se pueden elegir al escribir el nombre */
async function rememberClient(sl){
 if(!sl.client||customer.type==='sheriff')return;
 let base=clientes;
 try{const r=await sbFetch('/rest/v1/datos?select=valor&clave=eq.clientes');const rows=r.ok?await r.json():[];if(rows[0]&&Array.isArray(rows[0].valor))base=rows[0].valor}catch(e){}
 const merged=base.map(x=>Object.assign({},x));
 let c=merged.find(x=>norm(x.name)===norm(sl.client)), changed=false;
 if(!c){c={id:'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),name:sl.client,type:customer.type,telegram:'',precios:{}};merged.push(c);changed=true}
 if(sl.telegram&&!c.telegram){c.telegram=sl.telegram;changed=true}
 if(changed){clientes=merged;saveClientes();refreshClientList()}
}
function applyClient(c){
 customer.name=c.name;customer.type=c.type||'particular';
 if(c.telegram&&!customer.telegram)customer.telegram=c.telegram;
 renderCustomer();customerChanged();say('Cliente guardado: '+c.name);
}
function saveEmp(){store.set(KEY_EMP,JSON.stringify(empleados))}
function saveStock(){store.set(KEY_STOCK,JSON.stringify(stockMap))}
function empName(){const e=empleados.find(x=>x.id===customer.employee);return e?e.name:''}
let empSig='';
function refreshEmpSelect(){
 const me=typeof meEmp==='function'?meEmp():null;if(me)customer.employee=me.id;
 if(customer.employee&&!empleados.some(e=>e.id===customer.employee))customer.employee='';
 const sig=empleados.map(e=>e.id+e.name).join('|');
 if(sig!==empSig){empSig=sig;empSel.innerHTML='<option value="">Seleccionar empleado</option>'+empleados.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}
 empSel.value=customer.employee||'';empSel.disabled=!!me;
}
/* Stock: sin registrar = sin límite. El empleado nunca ve cantidades; solo se le impide superar las existencias. */
function limitFor(name){
 if(appMode!=='venta'||(customer.op==='encargo'&&!loadedEnc))return Infinity;
 return (stockMap[name]||0)+((sale&&sale.stockApplied&&sale.stockApplied[name])||0)+origQty(name);
}
function applyStockLimits(animate){
 let clamped=null;
 inputs.forEach(i=>{
  const lim=limitFor(i.dataset.name), row=i.closest('.product'), none=lim<=0;
  if(readQty(i)>lim){i.value=Math.max(0,lim);clamped=i.dataset.name}
  row.classList.toggle('no-stock',none);
  const q=readQty(i);
  row.querySelectorAll('.qty input,.minus').forEach(el=>{el.disabled=none});
  row.querySelectorAll('.plus,.quick button').forEach(el=>{el.disabled=q>=lim});
  const f=row.querySelector('.nostock');if(f)f.hidden=!none;
 });
 if(clamped&&animate)say('No hay más unidades disponibles de '+clamped);
}
/* Descuenta el stock una sola vez por venta real (y ajusta si la venta se edita antes de cerrarla) */
function applyStock(sl){
 /* El stock ya se ha movido en la nube (stockPrepare); aquí solo se anota lo aplicado y el movimiento */
 if(sl.op==='encargo')return;
 const want={};
 sl.items.forEach(x=>{const q=x.qty-(x.oq||0);if(q>0)want[x.name]=q});
 const prev=sl.stockApplied||{};
 new Set(Object.keys(want).concat(Object.keys(prev))).forEach(n=>{const d=(want[n]||0)-(prev[n]||0);if(d)logStock(n,-d,'Venta '+sl.id)});
 sl.stockApplied=want;
 store.set(KEY_SALE,JSON.stringify(sl));
}
const GROUPS={suministros:['suministros'],municiones:['municion'],ambos:['suministros','municion']};
const GROUP_NAMES={suministros:'SUMINISTROS',municiones:'MUNICIONES',ambos:'SUMINISTROS Y MUNICIONES'};
function discText(d){
 if(!d.group)return `${d.nombre} — ${d.pct} %`;
 return `${d.nombre} — ${GROUP_NAMES[d.group]}: `+(d.benefit==='gratis'?`${d.freeUnits} gratis por cada ${d.threshold}`:`${d.pct} % desde ${d.threshold} uds.`);
}
function leftTxt(d){if(!d.endMs)return '';const n=Math.max(0,Math.ceil((d.endMs-Date.now())/86400000));return ` · caduca en ${n} ${n===1?'día':'días'}`}
function discTag(d){return d?(d.group?d.nombre:`${d.nombre} (${d.pct} %)`):''}
/* Beneficio de un convenio u oferta. Convenio por grupo: el porcentaje se activa al llegar al umbral (no se multiplica);
   las unidades gratis se repiten por bloques completos y salen las más baratas de las realmente seleccionadas. */
function benefitFor(d,total){
 const tag=d.kind==='oferta'?'Oferta':'Convenio';
 if(!d.group)return {cents:Math.round(total*d.pct/100),label:`${tag} ${d.nombre} (${d.pct} %)`};
 const cats=GROUPS[d.group]||[], el=[];
 inputs.forEach(i=>{const q=readQty(i);if(q&&cats.includes(i.closest('.product').dataset.cat))el.push({q:q,price:priceCents(i)})});
 const units=el.reduce((a,x)=>a+x.q,0), sub=el.reduce((a,x)=>a+x.q*x.price,0);
 if(!d.threshold||units<d.threshold)return {cents:0,label:''};
 if(d.benefit==='porcentaje')return {cents:Math.round(sub*d.pct/100),label:`${tag} ${d.nombre} (${d.pct} %)`};
 let rem=Math.floor(units/d.threshold)*d.freeUnits,cents=0,used=0;
 el.sort((a,b)=>a.price-b.price).forEach(x=>{const t=Math.min(rem,x.q);cents+=t*x.price;rem-=t;used+=t});
 return {cents:cents,label:`${tag} ${d.nombre}: ${used} ${used===1?'unidad gratis':'unidades gratis'}`};
}
/* Segunda comprobación de stock al finalizar: nunca se permite stock negativo */
function stockOk(items){
 if(cloud.skipStockOk||(customer.op==='encargo'&&!loadedEnc))return true;
 for(const x of items){
  const avail=(stockMap[x.name]||0)+((sale&&sale.stockApplied&&sale.stockApplied[x.name])||0), need=x.qty-(x.oq||0);
  if(need>avail){say('No hay stock suficiente de '+x.name);return false}
 }
 return true;
}
const KEY_DISC='harrington_descuentos_v1';
let descuentos=[];
try{descuentos=JSON.parse(store.get(KEY_DISC)||'[]')}catch(e){}
if(!Array.isArray(descuentos))descuentos=[];
const ofertaSel=document.getElementById('oferta'), ofertaWrap=document.getElementById('ofertaWrap');
function saveDisc(){store.set(KEY_DISC,JSON.stringify(descuentos))}
function isActiveDisc(d){return Date.now()<d.endMs}
function activeDescuentos(kind){return descuentos.filter(d=>d.kind===kind&&isActiveDisc(d)&&(kind!=='convenio'||d.clientType===customer.type))}
/* Descuento actual: el del encargo cargado, o el convenio / oferta que seleccionó el empleado (solo si sigue vigente) */
function currentDiscount(){
 if(loadedEnc)return loadedEnc.disc||null;
 const id=customer.convenio!=='ninguno'?customer.convenio:(customer.oferta!=='ninguno'?customer.oferta:null);
 if(!id)return null;
 const d=descuentos.find(x=>x.id===id&&isActiveDisc(x)&&(x.kind!=='convenio'||x.clientType===customer.type));
 return d?{id:d.id,kind:d.kind,nombre:d.nombre,pct:d.pct||0,group:d.group||'',threshold:d.threshold||0,benefit:d.benefit||'',freeUnits:d.freeUnits||0}:null;
}
let discSig='';
function refreshDiscountSelects(){
 const ld=!!loadedEnc, convs=ld?[]:activeDescuentos('convenio'), ofs=ld?[]:activeDescuentos('oferta');
 if(!ld){
  if(customer.convenio!=='ninguno'&&!convs.some(d=>d.id===customer.convenio))customer.convenio='ninguno';
  if(customer.oferta!=='ninguno'&&!ofs.some(d=>d.id===customer.oferta))customer.oferta='ninguno';
  if(customer.convenio!=='ninguno')customer.oferta='ninguno';
 }
 const sig=(ld?'L'+loadedEnc.id:'')+'|'+convs.map(d=>d.id).join()+'|'+ofs.map(d=>d.id).join();
 if(sig!==discSig){
  discSig=sig;
  const opt=(v,t)=>`<option value="${esc(v)}">${esc(t)}</option>`;
  if(ld){const x=loadedEnc.disc;convSel.innerHTML=opt('ninguno',x?`${x.kind==='oferta'?'Oferta':'Convenio'}: ${discText(x)}`:'Sin convenio')}
  else{
   convSel.innerHTML=opt('ninguno','Sin convenio')+convs.map(d=>opt(d.id,discText(d)+leftTxt(d))).join('');
   ofertaSel.innerHTML=opt('ninguno','Sin oferta')+ofs.map(d=>opt(d.id,discText(d)+leftTxt(d))).join('');
  }
 }
 convSel.value=ld?'ninguno':customer.convenio;ofertaSel.value=customer.oferta;
 convSel.disabled=ld;ofertaWrap.hidden=ld||!ofs.length;
}
/* Caducidad automática: si el descuento seleccionado deja de estar vigente, se retira solo */
function tickDiscounts(){
 if(loadedEnc)return;
 const before=customer.convenio+'|'+customer.oferta;
 refreshDiscountSelects();
 if(before!==customer.convenio+'|'+customer.oferta){customerChanged();say('El descuento seleccionado ya no está disponible')}
}
const CLIENTE_SHERIFF='Departamento del Sheriff';
const PRECIOS_CLIENTE=[
];
const KEY_CUSTOMER='harrington_customer_v1';
const typeSel=document.getElementById('clientType'), nameInput=document.getElementById('clientName'), convSel=document.getElementById('convenio');
const nameWrap=document.getElementById('clientNameWrap'), nameLabel=document.getElementById('clientNameLabel'), noteEl=document.getElementById('clientNote');
function defaultCustomer(){return {type:'particular',name:'',convenio:'ninguno',oferta:'ninguno',employee:'',note:'',promise:'',op:'venta',telegram:'',deposit:''}}
const opSel=document.getElementById('opType'), telInput=document.getElementById('telegram'), telWrap=document.getElementById('telegramWrap');
const depositBox=document.getElementById('depositBox');
const depositInput=document.getElementById('depositAmt');

const breakdownEl=document.getElementById('breakdown'), totalLabel=document.getElementById('totalLabel');
function renderFin(f){
 const s=finToSale(f);
 breakdownEl.innerHTML=finRows(s).map(r=>`<div class="brow ${r[2]||''}"><span>${esc(r[0])}</span><span>${r[1]}</span></div>`).join('');
 totalLabel.textContent=dueLabel(s);
 [['depositErr','El pago por adelantado']].forEach(([id,txt])=>{
  const el=document.getElementById(id), show=f.over&&((id==='depositErr')===(f.kind==='senal'));
  el.hidden=!show;if(show)el.textContent=`${txt} no puede superar el precio final (${money(f.final)}).`;
 });
}
let customer=defaultCustomer();
function customerName(){return customer.type==='sheriff'?CLIENTE_SHERIFF:customer.name.trim()}
function specialPrices(){const n=norm(customerName());if(!n)return null;const st=PRECIOS_CLIENTE.find(c=>norm(c.cliente)===n);if(st)return st;const c=clientes.find(x=>norm(x.name)===n&&x.precios&&Object.keys(x.precios).length);return c?{precios:c.precios}:null}
function customerOk(){
 if(!customerName()){
  say(customer.type==='empresa'?'Indica el nombre de la empresa':'Indica el nombre del cliente');
  nameInput.focus();return false;
 }
 if(!empName()){
  say(empleados.length?'Selecciona el empleado que realiza la operación':'Dirección todavía no ha creado empleados');
  empSel.focus();return false;
 }
 if(customer.op==='encargo'&&!loadedEnc&&!/^[A-Z0-9-]{1,10}$/.test(customer.telegram)){
  say(customer.telegram?'Telegrama no válido: solo letras, números y guiones (máx. 10)':'El telegrama de contacto es obligatorio en un encargo');
  telInput.focus();return false;
 }
 if(computeFin().over){
  say(loadedEnc?'La fianza supera el precio final: añade productos o revisa el encargo':customer.op==='encargo'?'El pago por adelantado no puede superar el precio final':'La cantidad abonada no puede superar el precio final');
  return false;
 }
 return true;
}
function renderCustomer(){
 const enc=customer.op==='encargo';
 opSel.value=customer.op;typeSel.value=customer.type;nameInput.value=customer.name;refreshDiscountSelects();refreshEmpSelect();
 telInput.value=customer.telegram;depositInput.value=customer.deposit;noteInput.value=customer.note;promiseInput.value=customer.promise;
 nameWrap.hidden=customer.type==='sheriff';
 const ld=!!loadedEnc;
 telWrap.hidden=!enc||ld;promiseWrap.hidden=!enc||ld;depositBox.hidden=!enc||ld;opSel.disabled=ld;
 bannerEl.hidden=!ld;finishEncBtn.hidden=!ld||loadedEnc.finished;
 if(ld)bannerEl.innerHTML=`<b>${loadedEnc.finished?'ENCARGO FINALIZADO':'ENCARGO CARGADO'} · ${esc(loadedEnc.id)}</b><span>${esc(loadedEnc.client)} · Telegrama ${esc(loadedEnc.telegram)}</span><span>Fianza ya pagada: ${money(loadedEnc.depositCents)}</span>`;


 nameLabel.textContent=customer.type==='empresa'?'Nombre de la empresa':'Nombre del cliente';
 nameInput.placeholder=customer.type==='empresa'?'Empresa':'Nombre';
}
function customerChanged(){
 if(appMode==='venta')store.set(KEY_CUSTOMER,JSON.stringify(customer));
 const d=currentDiscount();
 noteEl.textContent=[specialPrices()?'Precios especiales del cliente aplicados':'',d?`${d.kind==='oferta'?'Oferta':'Convenio'} aplicado: ${d.nombre}${d.group?'':` (−${d.pct} %)`}`:''].filter(Boolean).join(' · ');
 noteEl.hidden=!noteEl.textContent;
 calc();
}
function resetCustomer(){loadedEnc=null;store.remove(KEY_LOADED);customer=defaultCustomer();renderCustomer();customerChanged()}

typeSel.onchange=()=>{customer.type=typeSel.value;renderCustomer();customerChanged()};
nameInput.addEventListener('input',()=>{customer.name=nameInput.value;customerChanged()});
convSel.onchange=()=>{customer.convenio=convSel.value;if(customer.convenio!=='ninguno')customer.oferta='ninguno';refreshDiscountSelects();customerChanged()};
ofertaSel.onchange=()=>{customer.oferta=ofertaSel.value;if(customer.oferta!=='ninguno')customer.convenio='ninguno';refreshDiscountSelects();customerChanged()};
opSel.onchange=()=>{customer.op=opSel.value;renderCustomer();customerChanged()};
const telHint=document.getElementById('telHint');
telInput.addEventListener('input',()=>{
 const raw=telInput.value, v=sanitizeTelegram(raw);
 telInput.value=v;customer.telegram=v;telHint.hidden=(raw===v);customerChanged();
});
function moneyField(inp,key){
 inp.addEventListener('input',()=>{
  const v=inp.value.replace(/[^0-9.,]/g,'');
  if(v!==inp.value)inp.value=v;
  customer[key]=v;customerChanged();
 });
}
moneyField(depositInput,'deposit');
noteInput.addEventListener('input',()=>{customer.note=noteInput.value;customerChanged()});
promiseInput.addEventListener('change',()=>{customer.promise=promiseInput.value;customerChanged()});
nameInput.addEventListener('change',()=>{const c=clientes.find(x=>norm(x.name)===norm(nameInput.value.trim()));if(c)applyClient(c)});

try{
 const c=JSON.parse(store.get(KEY_CUSTOMER)||'null');
 if(c&&['particular','empresa','sheriff'].includes(c.type)){customer.type=c.type;customer.name=String(c.name||'').slice(0,40);customer.employee=String(c.employee||'');customer.note=String(c.note||'').slice(0,120);customer.promise=/^\d{4}-\d{2}-\d{2}$/.test(c.promise||'')?c.promise:'';customer.convenio=String(c.convenio||'ninguno');customer.oferta=String(c.oferta||'ninguno');
  customer.op=c.op==='encargo'?'encargo':'venta';customer.telegram=sanitizeTelegram(c.telegram);
  customer.deposit=String(c.deposit||'').replace(/[^0-9.,]/g,'').slice(0,12)}
}catch(e){}
renderCustomer();
noteEl.hidden=true;

/* Cantidades rápidas para munición */
document.querySelectorAll('.product[data-cat="municion"] .qty').forEach(q=>{
 const i=q.querySelector('input'), d=document.createElement('div');d.className='quick';
 [10,50,100].forEach(n=>{
  const b=document.createElement('button');b.type='button';b.textContent='+'+n;b.setAttribute('aria-label','Añadir '+n);
  b.onclick=()=>{i.value=Math.min(MAX_QTY,readQty(i)+n);calc()};d.appendChild(b);
 });
 q.appendChild(d);
});

/* ===== Encargos almacenados ===== */
function saveEncs(){store.set(KEY_ENC,JSON.stringify(encargos));encargos.forEach(e=>{const sg=JSON.stringify(e),k='encargo:'+e.id;if(cloud.sig[k]!==sg){cloud.sig[k]=sg;cloudPut(k,e)}})}
function pendingEncs(){return encargos.filter(e=>!e.finished)}
const ICO_ENC='<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h10a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2z"/><path d="M6 4a2 2 0 0 0-2 2v1h2M9 9h6M9 12h6M9 15h4"/></svg>', ICO_PED='<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9M7.5 6l9 4"/></svg>';
function updateEncBtn(){const n=pendingEncs().length;encBtn.innerHTML=ICO_ENC+(n?`ENCARGOS (${n})`:'ENCARGOS')}
function releaseEncargo(){if(!loadedEnc)return;loadedEnc=null;store.remove(KEY_LOADED);renderCustomer()}
function groupItems(s){
 if(!s.fromEncargo)return [{title:'',items:s.items}];
 const o=[],a=[];
 s.items.forEach(x=>{
  const oq=Math.min(x.qty,x.oq||0), aq=x.qty-oq;
  if(oq)o.push({name:x.name,cents:x.cents,qty:oq});
  if(aq)a.push({name:x.name,cents:x.cents,qty:aq});
 });
 return [{title:'ENCARGO ORIGINAL',items:o},{title:'PRODUCTOS AÑADIDOS',items:a}].filter(g=>g.items.length);
}
function cartRow(x){return `<div class="cartrow"><span>${esc(x.name)}</span><span>${x.qty}</span><span>${money(x.cents)}</span><span>${money(x.qty*x.cents)}</span></div>`}
function cartHTML(items){
 const head='<div class="cartrow carthead"><span>Producto</span><span>Cant.</span><span>P. unit.</span><span>Subtotal</span></div>';
 if(!loadedEnc)return head+items.map(cartRow).join('');
 return head+groupItems({fromEncargo:true,items:items}).map(g=>`<div class="cart-sub">${g.title}</div>`+g.items.map(cartRow).join('')).join('');
}
/* Guarda (o actualiza) automáticamente el encargo al completarlo. Conserva sus estados si ya existía. */
function saveEncargoFromSale(sl){
 const data={id:sl.id,date:sl.date,time:sl.time,clientType:customer.type,client:sl.client,telegram:sl.telegram,convenioId:customer.convenio,convenio:sl.convenio,
  items:sl.items.map(x=>({name:x.name,cents:x.cents,qty:x.qty})),baseCents:sl.baseCents,discountCents:sl.discountCents,
  employee:sl.employee||'',note:sl.note||'',promise:sl.promise||'',totalCents:sl.totalCents,depositCents:sl.paidCents,pendingCents:sl.pendingCents,discounts:sl.discounts||[],disc:sl.discInfo||null};
 const cur=encargos.find(e=>e.id===sl.id);
 if(cur)Object.assign(cur,data);
 else encargos.push(Object.assign(data,{fab:'PENDIENTE',avisado:false,finished:false,ts:Date.now()}));
 saveEncs();updateEncBtn();
}
const TYPE_NAMES={particular:'Cliente particular',empresa:'Empresa',sheriff:'Departamento del Sheriff'};
let encView=null, encDraft=null;
function promiseBadge(x){if(!x.promise)return '';return x.promise<todayISO()?`<span class="badge no">VENCIDO · ${fmtISO(x.promise)}</span>`:`<span class="badge pend">Entrega: ${fmtISO(x.promise)}</span>`}
function badgesHTML(e){return `<span class="badge ${e.fab==='FABRICADO'?'fab':'pend'}">${e.fab}</span><span class="badge ${e.avisado?'si':'no'}">Cliente avisado: ${e.avisado?'SÍ':'NO'}</span>`}
function renderEnc(){
 const body=document.getElementById('encBody'), title=document.getElementById('encTitle');
 const e=encView?pendingEncs().find(x=>x.id===encView):null;
 if(!e){
  encView=null;
  const list=pendingEncs().slice().reverse();
  title.textContent=`ENCARGOS PENDIENTES (${list.length})`;
  body.innerHTML=list.length?list.map(x=>{
   const its=x.items.slice(0,2).map(i=>`${esc(i.name)} ×${i.qty}`).join(', ')+(x.items.length>2?` y ${x.items.length-2} más`:'');
   return `<button type="button" class="enc-card" data-open="${esc(x.id)}"><div class="t">${esc(x.client)} — Telegrama ${esc(x.telegram)}</div><div class="it">${its}</div>`+
    `<div class="enc-money"><span>Total: ${money(x.totalCents)}</span><span>Fianza pagada: ${money(x.depositCents)}</span><span>Pendiente: ${money(x.pendingCents)}</span></div><div class="badges">${badgesHTML(x)}${promiseBadge(x)}${x.ts?`<span class="ago">${ago(x.ts)}</span>`:''}</div></button>`;
  }).join(''):'<div class="enc-empty">'+emptyArt('scroll')+'No hay encargos pendientes.<br>Los encargos nuevos se guardan aquí automáticamente.</div>';
  return;
 }
 title.textContent='FICHA DEL ENCARGO';
 const dr=(encDraft&&encDraft.id===e.id)?encDraft:(encDraft={id:e.id,fab:e.fab,avisado:e.avisado});
 const dirty=dr.fab!==e.fab||dr.avisado!==e.avisado;
 const rows=finRows({baseCents:e.baseCents,discountCents:e.discountCents,discounts:e.discounts,discountLabel:'Convenio',kind:'senal',totalCents:e.totalCents,paidCents:e.depositCents}).map(r=>[r[0],r[1],r[2]]);
 body.innerHTML=`<button type="button" class="enc-back" data-act="back">◂ Volver a la lista</button>
  <div class="enc-id">${esc(e.id)} · ${esc(e.date)} ${esc(e.time)}</div>
  ${stepsHTML(e)}
  <div class="enc-kv"><div class="full"><span>Cliente</span><b>${esc(e.client)}</b></div><div><span>Tipo</span><b>${esc(TYPE_NAMES[e.clientType]||'')}</b></div><div><span>Telegrama</span><b>${esc(e.telegram)}</b></div>${e.employee?`<div class="full"><span>Empleado</span><b>${esc(e.employee)}</b></div>`:''}${e.note?`<div class="full"><span>Nota</span><b>${esc(e.note)}</b></div>`:''}${e.promise?`<div class="full"><span>Entrega prevista</span><b${e.promise<todayISO()?' class="neg"':''}>${fmtISO(e.promise)}${e.promise<todayISO()?' · VENCIDO':''}</b></div>`:''}${e.convenio?`<div class="full"><span>Convenio</span><b>${esc(e.convenio)}</b></div>`:''}</div>
  <div class="cartrow carthead"><span>Producto</span><span>Cant.</span><span>P. unit.</span><span>Subtotal</span></div>${e.items.map(cartRow).join('')}
  <div style="margin-top:8px">${rows.map(r=>`<div class="brow ${r[2]||''}"><span>${esc(r[0])}</span><span>${r[1]}</span></div>`).join('')}<div class="brow due"><span>PENDIENTE</span><span>${money(e.pendingCents)}</span></div></div>
  <div class="enc-sec">
   ${dr.fab==='FABRICADO'&&e.items.some(i=>(stockMap[i.name]||0)<i.qty)?'<div class="enc-note warnote">Recuerda: para poder entregarlo, el jefe tiene que sumar estas unidades en STOCK (así se gastan sus materiales). Ahora no hay suficientes.</div>':''}
   <label>ESTADO DE FABRICACIÓN<select id="encFab"><option value="PENDIENTE"${dr.fab==='PENDIENTE'?' selected':''}>PENDIENTE</option><option value="FABRICADO"${dr.fab==='FABRICADO'?' selected':''}>FABRICADO</option></select></label>
   <label>¿CLIENTE AVISADO?<select id="encAv"><option value="NO"${!dr.avisado?' selected':''}>NO</option><option value="SI"${dr.avisado?' selected':''}${dr.fab==='PENDIENTE'?' disabled':''}>SÍ</option></select></label>
   ${dr.fab==='PENDIENTE'?'<div class="enc-note">Podrás marcar «avisado» cuando el encargo esté FABRICADO.</div>':''}
   ${dirty?'<div class="enc-note" style="color:#f0c27a">Hay cambios sin guardar.</div>':''}
  </div>
  <div class="enc-actions"><button type="button" class="gold" data-act="save">GUARDAR CAMBIOS</button>${e.fab==='FABRICADO'?'<button type="button" data-act="tele">COPIAR AVISO (TELEGRAMA)</button>':''}<button type="button" class="primary" data-act="load">CARGAR ENCARGO</button><button type="button" class="warn" data-act="finish">FINALIZAR ENCARGO</button><button type="button" class="warn" data-act="cancel">CANCELAR ENCARGO</button></div>`;
}
function saveEncDraft(){
 const e=pendingEncs().find(x=>x.id===encView);
 if(!e||!encDraft||encDraft.id!==e.id)return;
 if(encDraft.fab===e.fab&&encDraft.avisado===e.avisado)return say('No hay cambios que guardar');
 e.fab=encDraft.fab;e.avisado=encDraft.fab==='FABRICADO'&&encDraft.avisado; /* coherencia: pendiente nunca puede estar avisado */
 saveEncs();encDraft=null;encView=null;renderEnc();say('Cambios guardados');
}
function openEnc(){encView=null;encDraft=null;renderEnc();openModal(encModal);encModal.scrollTop=0}
async function loadEncargo(id){
 const e=pendingEncs().find(x=>x.id===id); if(!e)return;
 if((selected().length||sale)&&!await askConfirm('Cargar encargo','Se reemplazará el pedido actual por el encargo '+e.id+'.','Cargar'))return;
 clearQuantities();resetSale();
 e.items.forEach(x=>{const i=inputs.find(n=>n.dataset.name===x.name);if(i)i.value=x.qty});
 loadedEnc=e;store.set(KEY_LOADED,e.id);
 customer=Object.assign(defaultCustomer(),{type:e.clientType||'particular',name:e.clientType==='sheriff'?'':e.client,convenio:'ninguno',telegram:e.telegram});
 renderCustomer();customerChanged();closeModal(encModal);
 if(window.innerWidth<=900)document.querySelector('.order').scrollIntoView({behavior:'smooth',block:'start'});
 say('Encargo cargado · '+e.id);
}
function stepsHTML(e){
 const st=[['Encargado',true],['Fabricado',e.fab==='FABRICADO'],['Avisado',!!e.avisado],['Entregado',false]];
 return `<div class="steps">${st.map(x=>`<div class="stp${x[1]?' done':''}"><i>${x[1]?'✓':''}</i><span>${x[0]}</span></div>`).join('')}</div>`;
}
function plainCaps(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()}
function telegramText(e){
 return `Nos complace anunciarle, Sr./Sra. ${e.client}, que su encargo en Armería Harrington Gunsmith ya está fabricado.\n\nPuede pasar a recogerlo cuando quiera. Dispone de un plazo de 10 días para hacerlo: transcurrido ese plazo, perderá el producto y el dinero depositado como fianza.\n\nEl precio de un apellido.`;
}
async function copyTelegram(id){
 const e=pendingEncs().find(x=>x.id===id); if(!e)return;
 const t=telegramText(e);
 if(await copyText(t))say('Aviso copiado · pégalo donde escribas al cliente');else prompt('Copia este texto:',t);
}
async function cancelEncargo(id){
 const e=pendingEncs().find(x=>x.id===id); if(!e)return;
 if(!await askConfirm('Cancelar encargo','El encargo '+e.id+' se cancelará y dejará de estar pendiente.','Cancelar encargo'))return;
 let refund=false;
 if(e.depositCents>0)refund=await askConfirm('Adelanto de '+money(e.depositCents),'¿Se devuelve el adelanto al cliente? Si no, la casa se lo queda.','Devolver');
 e.finished=true;e.cancelled=true;e.refunded=refund;e.finishedAt=Date.now();saveEncs();updateEncBtn();
 if(refund){const now=Date.now(),m=madridParts(now);gastos.push({id:'g'+now.toString(36)+'r',cat:'otros',concepto:'Devolución del adelanto · encargo '+e.id,cents:e.depositCents,day:dayNum(+m.year,+m.month,+m.day),date:`${m.day}/${m.month}/${m.year}`,time:`${m.hour}:${m.minute}`});saveGastos();cloudPut('gasto:'+gastos[gastos.length-1].id,gastos[gastos.length-1])}
 discordSend('encargos','ENCARGO CANCELADO\n'+e.id+' · '+e.client+(e.depositCents?'\nAdelanto '+money(e.depositCents)+(refund?' devuelto':' retenido'):''));
 renderCustomer();renderEnc();say('Encargo cancelado');
}
async function finishFromCard(id){
 const e=pendingEncs().find(x=>x.id===id); if(!e)return;
 if(!await askConfirm('Finalizar encargo','El encargo '+e.id+' dejará de aparecer en la lista de pendientes. ¿Continuar?','Finalizar'))return;
 e.finished=true;e.finishedAt=Date.now();saveEncs();updateEncBtn();renderCustomer();renderEnc();say('Encargo finalizado');
}
encBtn.onclick=openEnc;
document.getElementById('encClose').onclick=()=>closeModal(encModal);
encModal.addEventListener('click',e=>{
 if(e.target===encModal)return closeModal(encModal);
 const card=e.target.closest('[data-open]');
 if(card){encView=card.dataset.open;encDraft=null;renderEnc();encModal.scrollTop=0;return}
 const act=e.target.closest('[data-act]');
 if(!act)return;
 if(act.dataset.act==='back'){encView=null;encDraft=null;renderEnc()}
 else if(act.dataset.act==='save')saveEncDraft();
 else if(act.dataset.act==='load')loadEncargo(encView);
 else if(act.dataset.act==='finish')finishFromCard(encView);
 else if(act.dataset.act==='cancel')cancelEncargo(encView);
 else if(act.dataset.act==='tele')copyTelegram(encView);
});
encModal.addEventListener('change',e=>{
 if(!encDraft||encDraft.id!==encView)return;
 if(e.target.id==='encFab'){encDraft.fab=e.target.value;if(encDraft.fab==='PENDIENTE')encDraft.avisado=false}
 else if(e.target.id==='encAv')encDraft.avisado=e.target.value==='SI'&&encDraft.fab==='FABRICADO';
 else return;
 renderEnc();
});
finishEncBtn.onclick=e=>once('finishEnc',()=>finishEncargoNow(),e.currentTarget);
async function finishEncargoNow(){
 if(!loadedEnc||loadedEnc.finished)return;
 const sl=await ensureSaleCloud(); if(!sl)return;
 if(!await askConfirm('Finalizar encargo','Se marcará el encargo '+loadedEnc.id+' como entregado y cobrado. Dejará de aparecer en pendientes.','Finalizar'))return;
 loadedEnc.finished=true;loadedEnc.finishedAt=Date.now();loadedEnc.deliverySale=sl.id;
 saveEncs();updateEncBtn();renderCustomer();
 renderReceipt(sl);openModal(receiptModal);receiptModal.scrollTop=0;printFx();playRegister();notifySale(sl);setTimeout(()=>{if(!stampImgFx('entregado',2.57))playThump()},700);setTimeout(coinsFx,200);say('Encargo finalizado');
 askSerials(sl);
}
updateEncBtn();

/* ===== Sonidos sintetizados con Web Audio (no hay archivos de audio) ===== */
const KEY_SOUND='harrington_sound_v1';
let soundOn=store.get(KEY_SOUND)!=='off', audioCtx=null;
function ac(){
 try{
  if(!audioCtx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;audioCtx=new C()}
  if(audioCtx.state==='suspended')audioCtx.resume();
  return audioCtx;
 }catch(e){return null}
}
function noiseBurst(c,t,dur,freq,vol){
 const n=Math.floor(c.sampleRate*dur), buf=c.createBuffer(1,n,c.sampleRate), d=buf.getChannelData(0);
 for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n);
 const src=c.createBufferSource(), f=c.createBiquadFilter(), g=c.createGain();
 src.buffer=buf;f.type='bandpass';f.frequency.value=freq;g.gain.value=vol;
 src.connect(f);f.connect(g);g.connect(c.destination);src.start(t);
}
function ding(c,t,freq,vol,dur){
 [1,2.4].forEach((m,i)=>{
  const o=c.createOscillator(), g=c.createGain();
  o.type='sine';o.frequency.value=freq*m;
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol/(i+1),t+.005);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+dur+.05);
 });
}
function buzz(p){try{if(navigator.userActivation&&!navigator.userActivation.hasBeenActive)return;if(soundOn&&navigator.vibrate)navigator.vibrate(p)}catch(e){}}
/* Golpe seco del sello al caer sobre el papel */
function playThump(){
 buzz(35);
 const c=soundOn&&ac(); if(!c)return;
 const t=c.currentTime, o=c.createOscillator(), g=c.createGain();
 o.type='sine';o.frequency.setValueAtTime(130,t);o.frequency.exponentialRampToValueAtTime(48,t+.14);
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.5,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.2);
 o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+.22);
 noiseBurst(c,t,.06,220,.5);
}
/* Pulsación de botón: pequeño "clic" de madera y latón */
function playClick(){
 buzz(12);
 const c=soundOn&&ac(); if(!c)return;
 const t=c.currentTime, o=c.createOscillator(), g=c.createGain();
 o.type='triangle';o.frequency.setValueAtTime(1100,t);o.frequency.exponentialRampToValueAtTime(420,t+.06);
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.16,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+.09);
 o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+.1);
}
/* Caja registradora: golpe del mecanismo y dos campanadas */
function playRegister(){
 buzz([30,40,50]);
 const c=soundOn&&ac(); if(!c)return;
 const t=c.currentTime;
 noiseBurst(c,t,.07,900,.5);
 noiseBurst(c,t+.08,.05,3200,.25);
 ding(c,t+.16,1568,.22,1.1);
 ding(c,t+.33,2093,.2,1.3);
 noiseBurst(c,t+.52,.12,500,.25);
}
/* Lápiz sobre papel: trazos rápidos de grafito y un último trazo largo, como apuntar un encargo en una libreta */
function scratch(c,t,dur,freq,vol){
 const n=Math.floor(c.sampleRate*dur), buf=c.createBuffer(1,n,c.sampleRate), d=buf.getChannelData(0);
 for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.sin(Math.PI*i/n);
 const src=c.createBufferSource(), f=c.createBiquadFilter(), g=c.createGain();
 src.buffer=buf;f.type='bandpass';f.frequency.value=freq;g.gain.value=vol;
 src.connect(f);f.connect(g);g.connect(c.destination);src.start(t);
}
function playPencil(){
 buzz([15,25,15,25,15,25,40]);
 const c=soundOn&&ac(); if(!c)return;
 const t=c.currentTime;
 [[0,.09,4200],[.12,.11,3600],[.26,.08,4800],[.37,.12,3900],[.52,.07,5200],[.62,.10,4300]].forEach(x=>scratch(c,t+x[0],x[1],x[2],.55));
 scratch(c,t+.78,.34,3400,.5);
 noiseBurst(c,t+1.14,.025,2200,.35);
}
/* Yunque: dos golpes metálicos al fabricar */
function playAnvil(){
 buzz([20,70,20]);
 const c=soundOn&&ac(); if(!c)return;
 const t=c.currentTime;
 [0,.3].forEach((d,k)=>{noiseBurst(c,t+d,.03,2600,.5);[1,2.76,5.4,8.93].forEach((m,i)=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=(k?880:830)*m;g.gain.setValueAtTime(.0001,t+d);g.gain.exponentialRampToValueAtTime(.2/(i+1),t+d+.004);g.gain.exponentialRampToValueAtTime(.0001,t+d+1.1-i*.2);o.connect(g);g.connect(c.destination);o.start(t+d);o.stop(t+d+1.2)})});
}
/* Baúl de madera: crujido de la tapa y golpe al cerrarse, al recibir un pedido */
function playChest(){
 buzz([40,40,25]);
 const c=soundOn&&ac(); if(!c)return;
 const t=c.currentTime, o=c.createOscillator(), g=c.createGain(), f=c.createBiquadFilter();
 o.type='sawtooth';o.frequency.setValueAtTime(90,t);o.frequency.linearRampToValueAtTime(150,t+.35);f.type='bandpass';f.frequency.value=650;f.Q.value=7;
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.1,t+.05);g.gain.exponentialRampToValueAtTime(.0001,t+.4);
 o.connect(f);f.connect(g);g.connect(c.destination);o.start(t);o.stop(t+.45);
 const o2=c.createOscillator(), g2=c.createGain();
 o2.type='sine';o2.frequency.setValueAtTime(115,t+.46);o2.frequency.exponentialRampToValueAtTime(44,t+.64);
 g2.gain.setValueAtTime(.0001,t+.46);g2.gain.exponentialRampToValueAtTime(.55,t+.47);g2.gain.exponentialRampToValueAtTime(.0001,t+.72);
 o2.connect(g2);g2.connect(c.destination);o2.start(t+.46);o2.stop(t+.76);
 noiseBurst(c,t+.46,.08,300,.45);noiseBurst(c,t+.72,.02,3000,.3);
}
/* Campanas de celebración (récord) */
function playBells(){
 buzz([40,60,40,60,80]);
 const c=soundOn&&ac(); if(!c)return;
 const t=c.currentTime;[1568,1976,2349,3136].forEach((f,i)=>ding(c,t+i*.16,f,.2,1.4));ding(c,t+.75,2637,.22,1.8);
}
/* ===== Piano de saloon: melodía propia sencilla, generada en el navegador ===== */
const MUS={on:store.get('harrington_music')!=='off',started:false,timer:null,next:0,step:0,bus:null,ctx:null};
const MN=n=>440*Math.pow(2,(n-69)/12);
const PROG=[[48,[64,67,72]],[48,[64,67,70]],[53,[65,69,72]],[54,[63,66,72]],[43,[64,67,72]],[45,[61,67,69]],[50,[66,69,72]],[43,[65,67,71]]];
const MEL=[[76,0,79,0,84,0,79,76],[72,0,74,76,79,0,76,0],[77,0,81,0,84,0,81,77],[75,0,72,0,78,0,75,0],[79,0,76,74,72,0,76,0],[73,0,76,0,79,0,81,79],[78,0,74,0,81,0,78,74],[77,0,74,0,71,0,67,0]];
function pianoNote(c,t,n,v,dur){
 const f=MN(n);[[f,'triangle',v],[f*1.0042,'triangle',v*.55],[f*2,'sine',v*.22]].forEach(([fr,ty,g])=>{const o=c.createOscillator(),gn=c.createGain();o.type=ty;o.frequency.value=fr;gn.gain.setValueAtTime(.0001,t);gn.gain.exponentialRampToValueAtTime(g,t+.006);gn.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(gn);gn.connect(MUS.bus);o.start(t);o.stop(t+dur+.05)});
}
function musTick(){
 const c=MUS.ctx; if(!c||!MUS.on)return;
 const e8=60/104/2;
 while(MUS.next<c.currentTime+.6){
  const bar=Math.floor(MUS.step/8)%PROG.length, s=MUS.step%8, t=MUS.next+(s%2?e8*.22:0), [root,ch]=PROG[bar];
  if(s===0)pianoNote(c,t,root-12,.32,.9);if(s===4)pianoNote(c,t,root-5,.28,.9);
  if(s===2||s===6)ch.forEach(n=>pianoNote(c,t,n-12,.1,.35));
  const m=MEL[bar][s];if(m)pianoNote(c,t,m,.17,.6);
  MUS.next+=e8;MUS.step++;
 }
}
function musStart(){
 if(!MUS.on||MUS.timer||document.visibilityState!=='visible')return;
 const c=ac(); if(!c)return;
 if(!MUS.bus){const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2600;const g=c.createGain();g.gain.value=.11;lp.connect(g);g.connect(c.destination);MUS.bus=lp;MUS.gain=g}
 MUS.ctx=c;MUS.next=c.currentTime+.15;MUS.started=true;MUS.timer=setInterval(musTick,120);musTick();
}
function musStop(){clearInterval(MUS.timer);MUS.timer=null}
['pointerdown','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{if(MUS.on&&!MUS.timer)musStart()},{passive:true}));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(MUS.started&&MUS.on)musStart()}else musStop()});
const soundBtn=document.getElementById('soundBtn');
function renderSound(){soundBtn.textContent=soundOn?'♪ SÍ':'♪ NO';soundBtn.classList.toggle('on',soundOn)}
soundBtn.onclick=()=>{soundOn=!soundOn;store.set(KEY_SOUND,soundOn?'on':'off');renderSound();if(soundOn)playClick();say(soundOn?'Sonidos activados':'Sonidos silenciados')};
renderSound();
{const mb=document.getElementById('musicBtn');const rm=()=>{mb.textContent=MUS.on?'♫ SÍ':'♫ NO';mb.classList.toggle('on',MUS.on)};rm();
 mb.onclick=e=>{e.stopPropagation();MUS.on=!MUS.on;store.set('harrington_music',MUS.on?'on':'off');rm();if(MUS.on)musStart();else musStop();say(MUS.on?'Música de fondo activada':'Música de fondo apagada')}}
/* ===== 10) Ambiente día / noche según la hora española (o fijo desde ⚙) ===== */
const THEMES=['auto','dia','noche'], THEME_TXT={auto:'AUTO',dia:'☀ DÍA',noche:'☾ NOCHE'};
function themeNow(){const m=store.get('harrington_theme')||'auto';if(m!=='auto')return m;const hh=+madridParts(Date.now()).hour;return hh>=8&&hh<20?'dia':'noche'}
function applyTheme(){const t=themeNow();document.body.classList.toggle('theme-day',t==='dia');document.body.classList.toggle('theme-night',t==='noche');const b=document.getElementById('themeBtn');if(b)b.textContent=THEME_TXT[store.get('harrington_theme')||'auto']+((store.get('harrington_theme')||'auto')==='auto'?(t==='dia'?' · ☀':' · ☾'):'')}
document.getElementById('themeBtn').onclick=e=>{e.stopPropagation();const cur=store.get('harrington_theme')||'auto', nx=THEMES[(THEMES.indexOf(cur)+1)%3];store.set('harrington_theme',nx);applyTheme();say('Ambiente: '+({auto:'automático según la hora',dia:'día',noche:'noche'})[nx])};
applyTheme();setInterval(applyTheme,300000);
/* Menú ⚙ de ajustes (sonido, tamaño del texto y contraste) */
(function(){
 const btn=document.getElementById('setBtn'), pop=document.getElementById('setPop');
 document.body.appendChild(pop); /* fuera de la barra para que nada lo tape */
 const place=()=>{const r=btn.getBoundingClientRect(), w=Math.min(280,window.innerWidth-16);pop.style.width=w+'px';pop.style.top=Math.round(r.bottom+6)+'px';pop.style.left=Math.round(Math.max(8,Math.min(r.right-w,window.innerWidth-w-8)))+'px'};
 const close=()=>{pop.hidden=true;btn.setAttribute('aria-expanded','false')};
 btn.onclick=e=>{e.stopPropagation();if(pop.hidden){place();pop.hidden=false;btn.setAttribute('aria-expanded','true');playClick()}else close()};
 document.addEventListener('click',e=>{if(!pop.hidden&&!pop.contains(e.target)&&e.target!==btn)close()});
 window.addEventListener('resize',()=>{if(!pop.hidden)place()});
 window.addEventListener('scroll',()=>{if(!pop.hidden)close()},{passive:true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!pop.hidden)close()});
})();

/* ===== Registros (historial de fichajes y ventas para Dirección) ===== */
const KEY_SHIFTLOG='harrington_shiftlog_v1', KEY_SALELOG='harrington_salelog_v1';
function loadLog(k){try{const a=JSON.parse(store.get(k)||'[]');return Array.isArray(a)?a:[]}catch(e){return []}}
function logShift(r){const a=loadLog(KEY_SHIFTLOG), rec={uid:'t'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),name:r.name,start:r.start,end:r.end};a.push(rec);store.set(KEY_SHIFTLOG,JSON.stringify(a.slice(-5000)));cloudPut('turno:'+rec.uid,rec)}
function logSale(sl){
 const a=loadLog(KEY_SALELOG), e={items:sl.items.map(x=>({name:x.name,qty:x.qty,cents:x.cents,oq:x.oq||0})),stock:sl.stockApplied||{},note:sl.note||'',id:sl.id,date:sl.date,time:sl.time,op:sl.op,client:sl.client,employee:sl.employee||'',products:sl.products,units:sl.units,dueCents:dueCents(sl),totalCents:sl.totalCents,convenio:sl.convenio||'',fromEncargo:sl.fromEncargo||''};
 const k=a.findIndex(x=>x.id===sl.id);
 if(k>=0){e.voided=a[k].voided;e.voidedAt=a[k].voidedAt;a[k]=e}else a.push(e);
 e.ts=new Date().toISOString();
 store.set(KEY_SALELOG,JSON.stringify(a.slice(-5000)));
 cloudPut('venta:'+e.id,e);
}

/* ===== Modo Jefe ===== */
const KEY_BOSS_PW='harrington_boss_pw_v1', KEY_BOSS_ACTIVE='harrington_boss_active_v1';
const bossBtn=document.getElementById('bossBtn'), dirBtn=document.getElementById('dirBtn'), bossModal=document.getElementById('bossModal'), dirModal=document.getElementById('dirModal');
const bossPw1=document.getElementById('bossPw1'), bossPw2=document.getElementById('bossPw2'), bossWord=document.getElementById('bossWord'), bossErr=document.getElementById('bossErr');
const KEY_BOSS_WORD='harrington_boss_word_v1';
let bossActive=false, bossMode='login';
try{bossActive=sessionStorage.getItem(KEY_BOSS_ACTIVE)==='1'}catch(e){}
function setBoss(v){
 bossActive=v;
 try{if(v)sessionStorage.setItem(KEY_BOSS_ACTIVE,'1');else sessionStorage.removeItem(KEY_BOSS_ACTIVE)}catch(e){}
 dirBtn.hidden=!v;bossBtn.classList.toggle('on',v);bossBtn.textContent=v?'JEFE ✓':'JEFE';bumpBoss();
 try{const c=document.getElementById('meChip'), me=meEmp();if(c&&me)c.innerHTML=ICO_USER+esc(me.name)+(v?' · JEFE':'')}catch(e){}
}
function bossError(t){bossErr.textContent=t;bossErr.hidden=!t}
const wnorm=v=>norm(String(v||'').trim());
/* Modos: setup (primer acceso) · login · word (añadir palabra a una contraseña antigua) · resetword → resetpw (cambiar contraseña) */
function openBoss(mode){
 bossMode=mode||(bossCreds()?'login':'setup');
 const M={
  setup:{t:'CONFIGURAR ACCESO JEFE',l1:'Nueva contraseña',w1:1,w2:1,ww:1,hint:'Te servirá para cambiar la contraseña si la olvidas.',ok:'GUARDAR'},
  login:{t:'ACCESO JEFE',l1:'Contraseña',w1:1,w2:0,ww:0,hint:'',ok:'ACCEDER'},
  word:{t:'AÑADE UNA PALABRA DE SEGURIDAD',l1:'',w1:0,w2:0,ww:1,hint:'Es obligatoria. Te servirá para cambiar la contraseña si la olvidas.',ok:'GUARDAR'},
  resetword:{t:'CAMBIAR CONTRASEÑA',l1:'',w1:0,w2:0,ww:1,hint:'Escribe tu palabra de seguridad.',ok:'CONTINUAR'},
  resetpw:{t:'NUEVA CONTRASEÑA',l1:'Nueva contraseña',w1:1,w2:1,ww:0,hint:'',ok:'GUARDAR'}
 }[bossMode];
 document.getElementById('bossTitle').textContent=M.t;
 if(M.l1)document.getElementById('bossLbl1').textContent=M.l1;
 document.getElementById('bossWrap1').hidden=!M.w1;
 document.getElementById('bossWrap2').hidden=!M.w2;
 document.getElementById('bossWrapWord').hidden=!M.ww;
 document.getElementById('bossHint').textContent=M.hint;
 document.getElementById('bossOk').textContent=M.ok;
 document.getElementById('bossChange').hidden=!(bossMode==='login'&&bossCreds()&&bossCreds().word);
 bossPw1.value='';bossPw2.value='';bossWord.value='';bossError('');
 openModal(bossModal);setTimeout(()=>(M.w1?bossPw1:bossWord).focus(),60);
}
function finishBoss(msg){closeModal(bossModal);setBoss(true);if(G&&G.pending){const e=G.pending;G.pending=null;return gateHello(e)}applyMe();say(msg||'MODO JEFE ACTIVADO')}
function checkNewWord(word,pw){
 if(word.length<3)return 'La palabra de seguridad debe tener al menos 3 caracteres';
 if(wnorm(word)===wnorm(pw))return 'La palabra de seguridad debe ser distinta de la contraseña';
 return '';
}
const KEY_BOSS_CRED='harrington_boss_cred_v1';
let bossTyped='';
function bossCreds(){
 const c=loadObj(KEY_BOSS_CRED,null);
 if(c&&c.pw)return {pw:c.pw,word:c.word||'',hashed:true};
 const pw=store.get(KEY_BOSS_PW);
 return pw?{pw:pw,word:store.get(KEY_BOSS_WORD)||'',hashed:false}:null;
}
async function hashStr(t){try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('harrington|'+t));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')}catch(e){return 'plain:'+t}}
async function checkPw(v){const c=bossCreds();return !!c&&(c.hashed?(await hashStr(v))===c.pw:v===c.pw)}
async function checkWord(v){const c=bossCreds();return !!c&&!!c.word&&(c.hashed?(await hashStr(wnorm(v)))===c.word:wnorm(v)===wnorm(c.word))}
async function saveCreds(pw,word,wordIsHash){
 store.set(KEY_BOSS_CRED,JSON.stringify({pw:await hashStr(pw),word:wordIsHash?word:await hashStr(wnorm(word))}));
 store.remove(KEY_BOSS_PW);store.remove(KEY_BOSS_WORD);
}
async function submitBoss(){
 const word=bossWord.value.trim();
 if(bossMode==='setup'){
  if(!bossPw1.value)return bossError('Escribe una contraseña');
  if(bossPw1.value!==bossPw2.value)return bossError('Las contraseñas no coinciden');
  const e=checkNewWord(word,bossPw1.value); if(e)return bossError(e);
  await saveCreds(bossPw1.value,word);return finishBoss();
 }
 if(bossMode==='login'){
  if(!await checkPw(bossPw1.value))return bossError('Contraseña incorrecta');
  const c=bossCreds();
  if(!c.word){bossTyped=bossPw1.value;return openBoss('word')} /* contraseña creada antes de existir la palabra de seguridad */
  if(!c.hashed)await saveCreds(bossPw1.value,c.word); /* una contraseña antigua pasa a la nube, cifrada */
  return finishBoss();
 }
 if(bossMode==='word'){
  const e=checkNewWord(word,bossTyped); if(e)return bossError(e);
  await saveCreds(bossTyped,word);bossTyped='';return finishBoss();
 }
 if(bossMode==='resetword'){
  if(!await checkWord(word))return bossError('Palabra de seguridad incorrecta');
  return openBoss('resetpw');
 }
 if(bossMode==='resetpw'){
  if(!bossPw1.value)return bossError('Escribe una contraseña');
  if(bossPw1.value!==bossPw2.value)return bossError('Las contraseñas no coinciden');
  const c=bossCreds(), same=c.hashed?(await hashStr(wnorm(bossPw1.value)))===c.word:wnorm(bossPw1.value)===wnorm(c.word);
  if(same)return bossError('La contraseña debe ser distinta de la palabra de seguridad');
  await saveCreds(bossPw1.value,c.hashed?c.word:await hashStr(wnorm(c.word)),true);return finishBoss('Contraseña cambiada · MODO JEFE ACTIVADO');
 }
}
bossBtn.onclick=()=>{if(bossActive){setBoss(false);closeModal(dirModal);say('Modo Jefe desactivado')}else openBoss()};
document.getElementById('bossOk').onclick=submitBoss;
document.getElementById('bossCancel').onclick=()=>{closeModal(bossModal);if(G&&G.open){if(G.pendMode==='setup')gBigClose();G.pending=null;G.pendMode=''}};
document.getElementById('bossChange').onclick=()=>openBoss('resetword');
[bossPw1,bossPw2,bossWord].forEach(i=>i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();submitBoss()}}));
bossModal.addEventListener('click',e=>{if(e.target===bossModal)closeModal(bossModal)});
setBoss(bossActive);

/* ===== Consola de Dirección (modular: para añadir un módulo basta con añadirlo a esta lista) ===== */
const DIRECCION_MODULOS=[
 {id:'convenios',titulo:'CONVENIOS Y OFERTAS',desc:'Crear y administrar convenios y ofertas.',render:()=>renderModConvenios()},
 {id:'empleados',titulo:'EMPLEADOS',desc:'Añadir, editar y eliminar empleados.',render:()=>renderModEmpleados()},
 {id:'clientes',titulo:'CLIENTES',desc:'Clientes guardados y sus precios especiales.',render:()=>renderModClientes()},
 {id:'productos',titulo:'PRODUCTOS Y PRECIOS',desc:'Cambiar precios y añadir productos nuevos.',render:()=>renderModProductos()},
 {id:'stock',titulo:'STOCK',desc:'Añadir nuevas existencias y fijar mínimos.',render:()=>renderModStock()},
 {id:'regstock',titulo:'REGISTRO DE STOCK',desc:'Existencias actuales y movimientos.',render:()=>renderModRegistroStock()},
 {id:'fabricacion',titulo:'FABRICACIÓN',desc:'Recetas: qué materiales gasta cada producto al fabricarlo.',render:()=>renderModFabricacion()},
 {id:'horarios',titulo:'REGISTROS HORARIOS',desc:'Consultar los fichajes de los empleados.',render:()=>renderModHorarios()},
 {id:'ausencias',titulo:'AUSENCIAS',desc:'Quién está ausente, hasta cuándo y por qué.',render:()=>renderModAusencias()},
 {id:'ventas',titulo:'REGISTROS DE VENTAS',desc:'Consultar y anular operaciones.',render:()=>renderModVentas()},
 {id:'semanales',titulo:'REGISTROS SEMANALES',desc:'Resumen semanal de ventas y fichajes de cada empleado.',render:()=>renderModSemanales()},
 {id:'gastos',titulo:'GASTOS',desc:'Registrar gastos y descargar el registro.',render:()=>renderModGastos()},
 {id:'sueldos',titulo:'SUELDOS',desc:'Pago de los domingos según las horas echadas.',render:()=>renderModSueldos()},
 {id:'objetivo',titulo:'OBJETIVO SEMANAL',desc:'Meta de ventas de la semana con su barra.',render:()=>renderModObjetivo()},
 {id:'revision',titulo:'REVISIÓN DE DATOS',desc:'Comprueba que todo cuadra y qué arreglar.',render:()=>renderModRevision()},
 {id:'empficha',titulo:'FICHA DEL EMPLEADO',desc:'',hidden:true,render:()=>renderModEmpFicha()},
 {id:'balance',titulo:'BALANCE DE CUENTAS',desc:'Ingresos, gastos y beneficios.',render:()=>renderModBalance()},
 {id:'cierre',titulo:'CIERRE DE CAJA',desc:'Contar la caja del día y ver la diferencia.',render:()=>renderModCierre()},
 {id:'proveedores',titulo:'PROVEEDORES',desc:'Crear y gestionar tus proveedores (herrerías, minas, talas…).',render:()=>renderModProveedores()},
 {id:'nuevopedido',titulo:'REALIZAR NUEVO PEDIDO',desc:'Pedir materiales a un proveedor.',render:()=>renderModNuevoPedido()},
 {id:'regpedidos',titulo:'REGISTRO DE PEDIDOS',desc:'Pedidos completados, diarios y semanales.',render:()=>renderModRegPedidos()},
 {id:'discord',titulo:'DISCORD',desc:'Enviar las operaciones a un canal automáticamente.',render:()=>renderModDiscord()},
 {id:'nube',titulo:'NUBE (SUPABASE)',desc:'Estado de la sincronización entre dispositivos.',render:()=>renderModNube()},
 {id:'reset',titulo:'RESETEAR DATOS',desc:'Borrar ventas, gastos, encargos y demás datos de operación.',render:()=>renderModReset()},
 {id:'copia',titulo:'COPIA DE SEGURIDAD',desc:'Guardar y restaurar todos los datos.',render:()=>renderModCopia()}
];
let dirMod=null, dirForm=null;
function fmtLong(ms){return new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',day:'numeric',month:'long'}).format(ms)}
function plural(n,a,b){return n===1?a:b}
function descItemHTML(d){
 const act=isActiveDisc(d), conv=d.kind==='convenio';
 const ben=d.group?(d.benefit==='gratis'?`${d.freeUnits} ${d.freeUnits===1?'unidad gratis':'unidades gratis'}`:`${d.pct} % de descuento`):`${d.pct} % de descuento`;
 return `<div class="enc-card dir-item"><div class="t">${esc(d.nombre.toUpperCase())}</div>`+
  (conv?`<div class="it">Tipo: ${esc((TYPE_NAMES[d.clientType]||'').toUpperCase())}</div>`:'')+
  (d.group?`<div class="enc-money"><span>Aplica a: ${GROUP_NAMES[d.group]}</span><span>Por cada: ${d.threshold} uds.</span></div>`:'')+
  `<div class="enc-money"><span>Beneficio: ${ben}</span><span>Duración: ${d.days} ${plural(d.days,'día','días')}</span></div>`+
  `<div class="enc-money"><span>Inicio: ${fmtLong(d.startMs)}</span><span>${conv?'Caduca':'Finalización'}: ${fmtLong(d.endMs)}</span></div>`+
  `<div class="badges"><span class="badge ${act?'fab':'no'}">Estado: ${act?(conv?'ACTIVO':'ACTIVA'):(conv?'CADUCADO':'CADUCADA')}</span></div>`+
  `<div class="enc-actions" style="margin-top:8px"><button type="button" class="warn" data-dir="del:${esc(d.id)}">ELIMINAR</button></div></div>`;
}
function renderModConvenios(){
 if(dirForm){
  const conv=dirForm==='convenio';
  return `<div class="dir-form enc-sec"><div class="dir-sec-title" style="margin-top:0">${conv?'AÑADIR CONVENIO':'AÑADIR OFERTA'}</div>
   <label>${conv?'NOMBRE DEL CONVENIO':'NOMBRE DE LA OFERTA'}<input id="dfName" type="text" maxlength="40" autocomplete="off" placeholder="${conv?'Ej.: Blackwater Transport':'Ej.: Semana Harrington'}"></label>`+
   (conv?`<label>TIPO DE CLIENTE<select id="dfType"><option value="">Seleccionar…</option><option value="particular">PARTICULAR</option><option value="empresa">EMPRESA</option><option value="sheriff">DEPARTAMENTO DEL SHERIFF</option></select></label>`:'')+
   (conv?`<label>APLICAR A<select id="dfGroup"><option value="">Seleccionar…</option><option value="suministros">SUMINISTROS</option><option value="municiones">MUNICIONES</option><option value="ambos">SUMINISTROS Y MUNICIONES</option></select></label>
   <label>POR CADA (UNIDADES)<input id="dfThr" type="number" inputmode="numeric" min="1" step="1" placeholder="Ej.: 25"></label>
   <label>TIPO DE BENEFICIO<select id="dfBenefit"><option value="">Seleccionar…</option><option value="porcentaje">DESCUENTO POR PORCENTAJE</option><option value="gratis">UNIDADES GRATIS</option></select></label>
   <label id="dfPctWrap" hidden>DESCUENTO (%)<input id="dfPctN" type="number" inputmode="decimal" min="0.01" max="100" step="any" placeholder="Ej.: 5"></label>
   <label id="dfFreeWrap" hidden>UNIDADES GRATIS<input id="dfFree" type="number" inputmode="numeric" min="1" step="1" placeholder="Ej.: 1"></label>`:
   `<label>PORCENTAJE DE DESCUENTO<select id="dfPct"><option value="">Seleccionar…</option>${[1,2,3,4,5].map(n=>`<option value="${n}">${n} %</option>`).join('')}</select></label>`)+`
   <label>DURACIÓN (DÍAS)<input id="dfDays" type="number" inputmode="numeric" min="1" max="365" placeholder="Ej.: 7"></label>
   <div class="pay-err" id="dfErr" hidden></div>
   <div class="enc-actions two" style="margin-top:10px"><button type="button" data-dir="cancel-form">Cancelar</button><button type="button" class="primary" data-dir="save-form">${conv?'GUARDAR CONVENIO':'ACTIVAR OFERTA'}</button></div></div>`;
 }
 const cs=descuentos.filter(d=>d.kind==='convenio'), os=descuentos.filter(d=>d.kind==='oferta');
 return `<div class="enc-actions two"><button type="button" class="primary" data-dir="form:convenio">AÑADIR CONVENIO</button><button type="button" class="primary" data-dir="form:oferta">AÑADIR OFERTA</button></div>
  <div class="dir-sec-title">CONVENIOS (${cs.length})</div>${cs.length?cs.slice().reverse().map(descItemHTML).join(''):'<div class="enc-empty">No hay convenios.</div>'}
  <div class="dir-sec-title">OFERTAS (${os.length})</div>${os.length?os.slice().reverse().map(descItemHTML).join(''):'<div class="enc-empty">No hay ofertas.</div>'}`;
}
function searchBox(ph){return `<input class="dir-search" type="text" data-filter="1" placeholder="${ph}" autocomplete="off">`}
function renderModHorarios(){
 const a=loadLog(KEY_SHIFTLOG).slice().reverse().slice(0,200);
 const open=shifts.length?`<div class="dir-sec-title" style="margin-top:0">TURNOS ABIERTOS (${shifts.length})</div>`+shifts.map(x=>{const lg=Date.now()-x.start>MAX_SHIFT_H*3600000, def=fmtTime(Math.min(Date.now(),x.start+4*3600000));return `<div class="enc-card dir-item${lg?' shift-long':''}"><div class="t">${esc(x.name)}</div><div class="it">Entrada: ${fmtDate(x.start)} ${fmtTime(x.start)} · lleva ${fmtDuration(x.start,Date.now())}${lg?' · <b class="neg">¿se le olvidó fichar la salida?</b>':''}</div><div class="shift-fix"><label>Hora real de salida<input type="time" data-shfix="${esc(x.empId)}" value="${def}"></label><button type="button" class="warn" data-dir="sh-fix:${esc(x.empId)}">CERRAR TURNO</button></div></div>`}).join(''):'';
 return open+`<div class="dir-sec-title"${shifts.length?'':' style="margin-top:0"'}>HISTORIAL DE FICHAJES (${a.length})</div>${searchBox('⌕  Buscar por empleado o fecha…')}<div class="ledger">`+(a.length?a.map(r=>`<div class="dir-log" data-q="${esc(norm(r.name+' '+fmtDate(r.start)))}"><b>${esc(r.name)}</b><br>${fmtDate(r.start)} ${fmtTime(r.start)} → ${fmtDate(r.end)} ${fmtTime(r.end)} · ${fmtDuration(r.start,r.end)}</div>`).join(''):'<div class="enc-empty">Todavía no hay fichajes registrados.<br>Se guardan a partir de ahora al fichar la salida.</div>')+'</div>';
}
function renderModVentas(){
 const a=loadLog(KEY_SALELOG).slice().reverse().slice(0,200);
 return `<div class="dir-sec-title" style="margin-top:0">VENTAS REGISTRADAS (${a.length})</div>${searchBox('⌕  Buscar por cliente, empleado o número…')}<div class="ledger">`+(a.length?a.map(r=>`<div class="dir-log${r.voided?' voided':''}" data-q="${esc(norm([r.id,r.client,r.employee,r.date].join(' ')))}"><b>${esc(r.id)}</b> · ${esc(r.date)} ${esc(r.time)}${r.op==='encargo'?' · ENCARGO':''}${r.voided?'<span class="void-tag">ANULADA</span>':''}<br>Cliente: ${esc(r.client||'—')}<br>Empleado: ${esc(r.employee||'—')}<br>${summaryText(r.products,r.units)}${r.convenio?' · '+esc(r.convenio):''}${r.note?'<br>Nota: '+esc(r.note):''}<br>Total: ${money(r.totalCents)}${r.dueCents!==r.totalCents?' · A cobrar: '+money(r.dueCents):''}${r.voided?'':`<div class="emp-btns"><button type="button" class="warn" data-dir="void:${esc(r.id)}">ANULAR</button></div>`}</div>`).join(''):'<div class="enc-empty">Todavía no hay ventas registradas.<br>Se guardan a partir de ahora al finalizar cada venta.</div>')+'</div>';
}
async function voidSale(id){
 const a=loadLog(KEY_SALELOG), r=a.find(x=>x.id===id); if(!r||r.voided)return;
 const hasStock=r.stock&&Object.keys(r.stock).length;
 if(!await askConfirm('Anular venta',`Se anulará ${r.id} y dejará de contar en los balances.${hasStock?' El stock vendido se devolverá.':''}`,'Anular'))return;
 buzz(90);
 const back=Object.keys(r.stock||{}).map(n=>({producto:n,delta:r.stock[n]}));
 if(back.length){try{await moverStock(back,'Anulación '+r.id);back.forEach(x=>logStock(x.producto,x.delta,'Anulación '+r.id))}catch(e){return say('Sin conexión: no se puede anular ahora')}}
 r.voided=true;r.voidedAt=Date.now();r.ts=new Date().toISOString();store.set(KEY_SALELOG,JSON.stringify(a));cloudPut('venta:'+r.id,r);
 const enc=encargos.find(e=>e.id===r.id); if(enc){enc.finished=true;enc.cancelled=true;saveEncs();updateEncBtn()}
 if(r.fromEncargo){const o=encargos.find(e=>e.id===r.fromEncargo);if(o){o.finished=false;saveEncs();updateEncBtn()}}
 if(sale&&sale.id===r.id){sale.stockApplied={};resetSale()}
 discordSend('anulaciones','VENTA ANULADA\n'+r.id+' · '+r.date+' '+r.time+'\nCliente: '+(r.client||'—')+'\nEmpleado: '+(r.employee||'—')+'\nTotal: '+money(r.totalCents));
 renderDir();calc(false);say('Venta anulada');
}
let wkType=null, wkOffset=0, wkEmp=null;
/* Semana de viernes a jueves (la semana del servidor), en hora de España */
function dayNum(y,m,d){return Math.floor(Date.UTC(y,m-1,d)/86400000)}
function dayStr(n){const d=new Date(n*86400000);return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}/${d.getUTCFullYear()}`}
function weekStart(off){const m=madridParts(Date.now()),n=dayNum(+m.year,+m.month,+m.day),dow=new Date(n*86400000).getUTCDay();return n-((dow+2)%7)+off*7}
function saleDay(r){const t=String(r.date).split('/').map(Number);return dayNum(t[2],t[1],t[0])}
function shiftDay(r){const m=madridParts(r.start);return dayNum(+m.year,+m.month,+m.day)}
/* Cobrado: venta normal = total; encargo = pago adelantado; entrega de encargo = lo que se cobra al recoger */
function collected(r){return r.op==='encargo'?r.totalCents-r.dueCents:r.dueCents}
function weekData(){
 const ws=weekStart(wkOffset), out={}, get=n=>out[n]||(out[n]={name:n,sales:[],shifts:[]});
 empleados.forEach(e=>get(e.name));
 loadLog(KEY_SALELOG).forEach(r=>{if(r.voided)return;const d=saleDay(r);if(d>=ws&&d<=ws+6)get(r.employee||'Sin empleado').sales.push(r)});
 loadLog(KEY_SHIFTLOG).forEach(r=>{const d=shiftDay(r);if(d>=ws&&d<=ws+6)get(r.name||'Sin empleado').shifts.push(r)});
 return {ws:ws,list:Object.values(out).sort((a,b)=>a.name.localeCompare(b.name,'es'))};
}
function salesSum(e){return {ops:e.sales.length,units:e.sales.filter(r=>r.op!=='encargo').reduce((a,r)=>a+r.units,0),cash:e.sales.reduce((a,r)=>a+collected(r),0)}}
function shiftsSum(e){return {n:e.shifts.length,ms:e.shifts.reduce((a,r)=>a+Math.max(0,r.end-r.start),0)}}
function contractH(name){const x=empleados.find(e=>e.name===name);return x&&x.puesto?(x.horas||10):0}
function hoursVs(name,ms,ws){return ''}
function empLines(e,type){
 const L=[];
 if(type==='ventas'){
  e.sales.forEach(r=>{
   L.push(`${r.id} · ${r.date} ${r.time}${r.op==='encargo'?' · ENCARGO':''}${r.fromEncargo?' · ENTREGA DEL ENCARGO '+r.fromEncargo:''}`,'Cliente: '+(r.client||'—'));
   if(r.items)r.items.forEach(x=>L.push(`  ${x.qty} × ${x.name} · ${money(x.qty*x.cents)}`));else L.push('  '+summaryText(r.products,r.units));
   if(r.convenio)L.push('Convenio: '+r.convenio);
   L.push('Total: '+money(r.totalCents)+' · Cobrado: '+money(collected(r)),'');
  });
  const t=salesSum(e);
  L.push('Operaciones: '+t.ops,'Unidades entregadas: '+t.units,'TOTAL COBRADO: '+money(t.cash));
 }else{
  e.shifts.forEach(r=>L.push(`${fmtDate(r.start)} ${fmtTime(r.start)} → ${fmtDate(r.end)} ${fmtTime(r.end)} · ${fmtDuration(r.start,r.end)}`));
  const t=shiftsSum(e);
  L.push('','Fichajes: '+t.n,'TIEMPO TOTAL: '+fmtDuration(0,t.ms)+hoursVs(e.name,t.ms));
 }
 return L;
}
function weekDoc(list,type,ws){
 const line='────────────────────', now=Date.now();
 const out=['HARRINGTON GUNSMITH',type==='ventas'?'REGISTRO SEMANAL DE VENTAS':'REGISTRO SEMANAL DE FICHAJES','Saint Denis · 1880','','Semana: '+dayStr(ws)+' – '+dayStr(ws+6),'Generado: '+fmtDate(now)+' '+fmtTime(now),''];
 list.forEach(e=>{out.push(line,'EMPLEADO: '+e.name,line,'');empLines(e,type).forEach(x=>out.push(x));out.push('')});
 out.push(line,'','El precio de un apellido.');
 return out.join('\n');
}
function saveTextFile(text,name){
 const blob=new Blob(['\ufeff'+text],{type:'text/plain;charset=utf-8'}), a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download=name;
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}
function downloadWeek(name){
 const wd=weekData(), list=name===null?wd.list.filter(e=>e.sales.length||e.shifts.length):wd.list.filter(e=>e.name===name);
 if(!list.length)return say('No hay registros esta semana');
 const safe=n=>n.replace(/[^A-Za-z0-9áéíóúüñÁÉÍÓÚÜÑ_-]+/g,'_');
 saveTextFile(weekDoc(list,wkType,wd.ws),`Semana_${dayStr(wd.ws).replace(/\//g,'-')}_${name===null?'TODOS':safe(name)}_${wkType==='ventas'?'Ventas':'Fichajes'}.txt`);
 say('Documento descargado');
}
function renderModSemanales(){
 if(!wkType)return '<button type="button" class="enc-card" data-dir="wk-type:ventas"><div class="t">REGISTRO DE VENTAS</div><div class="it">Ventas semanales de cada empleado.</div></button><button type="button" class="enc-card" data-dir="wk-type:fichajes"><div class="t">REGISTRO DE FICHAJE</div><div class="it">Horas fichadas cada semana por empleado.</div></button>';
 const wd=weekData(), ven=wkType==='ventas';
 const nav=`<div style="display:grid;grid-template-columns:48px 1fr 48px;gap:8px;margin-bottom:10px" class="enc-actions"><button type="button" data-dir="wk-prev" aria-label="Semana anterior">◂</button><button type="button" data-dir="wk-now" style="font-size:13px">${dayStr(wd.ws)} – ${dayStr(wd.ws+6)}${wkOffset===0?'<br>(esta semana)':''}</button><button type="button" data-dir="wk-next" aria-label="Semana siguiente"${wkOffset>=0?' disabled':''}>▸</button></div>`;
 const head=`<div class="dir-sec-title" style="margin-top:0">${ven?'REGISTRO DE VENTAS':'REGISTRO DE FICHAJE'}</div>`;
 if(wkEmp!==null){
  const e=wd.list.find(x=>x.name===wkEmp)||{name:wkEmp,sales:[],shifts:[]}, has=ven?e.sales.length:e.shifts.length;
  const body=ven?e.sales.map(r=>`<div class="dir-log"><b>${esc(r.id)}</b> · ${esc(r.date)} ${esc(r.time)}${r.op==='encargo'?' · ENCARGO':''}${r.fromEncargo?' · ENTREGA':''}<br>Cliente: ${esc(r.client||'—')}<br>${r.items?r.items.map(x=>`${x.qty} × ${esc(x.name)}`).join(', '):summaryText(r.products,r.units)}${r.convenio?'<br>Convenio: '+esc(r.convenio):''}<br>Total: ${money(r.totalCents)} · Cobrado: ${money(collected(r))}</div>`).join(''):
   e.shifts.map(r=>`<div class="dir-log">${fmtDate(r.start)} ${fmtTime(r.start)} → ${fmtDate(r.end)} ${fmtTime(r.end)}<br><b>${fmtDuration(r.start,r.end)}</b></div>`).join('');
  const sum=ven?(t=>`Operaciones: ${t.ops} · Unidades entregadas: ${t.units}<br><b>Total cobrado: ${money(t.cash)}</b>`)(salesSum(e)):(t=>`Fichajes: ${t.n}<br><b>Tiempo total: ${fmtDuration(0,t.ms)}${hoursVs(e.name,t.ms)}</b>`)(shiftsSum(e));
  return `${nav}${head}<div class="enc-card dir-item"><div class="t">${esc(e.name)}</div><div class="it">${sum}</div></div>${has?body:'<div class="enc-empty">Sin actividad esta semana.</div>'}<div class="enc-actions" style="margin-top:10px"><button type="button" class="primary" data-dir="wk-dl:${encodeURIComponent(e.name)}">DESCARGAR DOCUMENTO</button></div>`;
 }
 const cards=wd.list.map(e=>{
  const has=ven?e.sales.length:e.shifts.length;
  const sum=ven?(t=>`${t.ops} ${t.ops===1?'operación':'operaciones'} · ${t.units} uds. · Cobrado: ${money(t.cash)}`)(salesSum(e)):(t=>`${t.n} ${t.n===1?'fichaje':'fichajes'} · ${fmtDuration(0,t.ms)}${hoursVs(e.name,t.ms)}`)(shiftsSum(e));
  return `<div class="enc-card dir-item"><div class="t">${esc(e.name)}</div><div class="it">${has?sum:'Sin actividad esta semana'}</div><div class="enc-actions two"><button type="button" data-dir="wk-emp:${encodeURIComponent(e.name)}">VER</button><button type="button" class="primary" data-dir="wk-dl:${encodeURIComponent(e.name)}"${has?'':' disabled'}>DESCARGAR</button></div></div>`;
 }).join('');
 const any=wd.list.some(e=>ven?e.sales.length:e.shifts.length);
 return `${nav}${head}${ven?rankingHTML(wd.list):''}${cards||'<div class="enc-empty">No hay empleados ni registros.</div>'}<div class="enc-actions" style="margin-top:6px"><button type="button" class="gold" data-dir="wk-dlall"${any?'':' disabled'}>DESCARGAR TODOS LOS EMPLEADOS</button>${ven?`<button type="button" data-dir="wk-dc"${any?'':' disabled'}>ENVIAR A DISCORD</button>`:''}</div>`;
}
/* ===== Gastos y balance de cuentas ===== */
const KEY_GASTOS='harrington_gastos_v1';
const CAT_NAMES={proveedor:'PROVEEDOR',sueldos:'SUELDOS',otros:'OTROS GASTOS'};
let gastos=loadObj(KEY_GASTOS,[]);
if(!Array.isArray(gastos))gastos=[];
let gxDraft={cat:'',concepto:'',amt:''};
const per={g:{mode:'dia',off:0},b:{mode:'dia',off:0}};
const DIAS=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
function saveGastos(){store.set(KEY_GASTOS,JSON.stringify(gastos))}
function todayNum(){const m=madridParts(Date.now());return dayNum(+m.year,+m.month,+m.day)}
function sgn(c){return c<0?'−'+money(-c):money(c)}
function periodRange(k){const p=per[k];if(p.mode==='sem'){const w=weekStart(p.off);return {s:w,e:w+6}}const t=todayNum()+p.off;return {s:t,e:t}}
function periodInfo(k){const r=periodRange(k), sem=per[k].mode==='sem';return {r:r,sem:sem,kind:sem?'SEMANAL':'DIARIO',label:sem?dayStr(r.s)+' – '+dayStr(r.e):dayStr(r.s)}}
/* Ingresos = dinero cobrado en ventas (mismo criterio que los registros semanales); beneficio = ingresos − gastos */
function accounts(r){
 const sales=loadLog(KEY_SALELOG).filter(x=>{if(x.voided)return false;const d=saleDay(x);return d>=r.s&&d<=r.e});
 const ex=gastos.filter(x=>x.day>=r.s&&x.day<=r.e), byCat={proveedor:0,sueldos:0,otros:0};
 ex.forEach(x=>{byCat[x.cat]+=x.cents});
 const ing=sales.reduce((a,x)=>a+collected(x),0), gas=ex.reduce((a,x)=>a+x.cents,0);
 return {sales:sales,ex:ex,ing:ing,gas:gas,ben:ing-gas,byCat:byCat,ops:sales.length};
}
function periodBar(k){
 const pi=periodInfo(k), p=per[k];
 return `<div class="seg" style="margin-bottom:8px"><button type="button" class="${p.mode==='dia'?'on':''}" data-dir="pm:${k}dia">DIARIO</button><button type="button" class="${p.mode==='sem'?'on':''}" data-dir="pm:${k}sem">SEMANAL</button></div>
 <div class="enc-actions" style="grid-template-columns:48px 1fr 48px;margin-bottom:10px"><button type="button" data-dir="pp:${k}" aria-label="Anterior">◂</button><button type="button" data-dir="pw:${k}" style="font-size:13px">${pi.label}${p.off===0?'<br>('+(pi.sem?'esta semana':'hoy')+')':''}</button><button type="button" data-dir="pn:${k}" aria-label="Siguiente"${p.off>=0?' disabled':''}>▸</button></div>`;
}
function repButtons(k){return `<div class="enc-actions" style="margin-top:10px"><button type="button" class="primary" data-dir="rep-dl:${k}">DESCARGAR ${per[k].mode==='sem'?'SEMANAL':'DIARIO'}</button><button type="button" class="gold" data-dir="rep-dc:${k}">ENVIAR A DISCORD</button><button type="button" data-dir="rep-cp:${k}">COPIAR PARA DISCORD</button></div>`}
const REPORTS={g:{doc:()=>gastosDoc(),name:'Gastos',kind:'gastos'},b:{doc:()=>balanceDoc(),name:'Balance',kind:'balance'},p:{doc:()=>pedidosDoc(),name:'Pedidos',kind:'pedidos'}};
function docSummary(doc){const L=doc.split('\n');return L.slice(0,5).concat(L.slice(5).filter(l=>/^\s*(TOTAL|BENEFICIO|INGRESOS|GASTOS$|Proveedor:|Sueldos:|Otros gastos:|Total gastos:|Pedidos:)/.test(l))).join('\n')+'\n(documento completo adjunto)'}
async function reportSend(kind,doc,fname){
 if(!(webhook.urls[kind]||webhook.url))return say('Configura primero el canal en Dirección → Discord');
 const blob=new Blob(['\ufeff'+doc],{type:'text/plain;charset=utf-8'});
 await discordSend(kind,docSummary(doc),blob,fname,true);
}
function weeklySalesPayload(){
 const wd=weekData(), list=wd.list.filter(e=>e.sales.length), lab='Semana: '+dayStr(wd.ws)+' – '+dayStr(wd.ws+6);
 if(!list.length)return {empty:true,sum:['HARRINGTON GUNSMITH','REGISTRO SEMANAL DE VENTAS',lab,'','Sin ventas esta semana.'].join('\n')};
 const doc=weekDoc(list,'ventas',wd.ws), sum=['HARRINGTON GUNSMITH','REGISTRO SEMANAL DE VENTAS',lab,''].concat(list.map(e=>{const t=salesSum(e);return e.name+': '+t.ops+' '+plural(t.ops,'operación','operaciones')+' · cobrado '+money(t.cash)}),['','TOTAL COBRADO: '+money(list.reduce((a,e)=>a+salesSum(e).cash,0)),'(documento completo adjunto)']).join('\n');
 return {sum:sum,blob:new Blob(['\ufeff'+doc],{type:'text/plain;charset=utf-8'}),fname:'Semana_'+dayStr(wd.ws).replace(/\//g,'-')+'_Ventas_TODOS.txt'};
}
function sendWeekSales(){
 const p=weeklySalesPayload();
 if(p.empty)return say('No hay ventas esta semana');
 if(!(webhook.urls.ventas||webhook.url))return say('Configura primero el canal en Dirección → Discord');
 discordSend('ventas',p.sum,p.blob,p.fname,true);
}
/* ===== Envío automático cada jueves a las 22:00 (hora de España) de la semana de viernes a jueves ===== */
const AUTO_FIRST_WEEK=dayNum(2026,10,9), AUTO_HOUR=22;
let autoBusy=false;
function autoTargetWeek(){
 const m=madridParts(Date.now()), t=dayNum(+m.year,+m.month,+m.day), ws=weekStart(0);
 const w=(t===ws+6&&(+m.hour%24)>=AUTO_HOUR)?ws:ws-7;
 return w>=AUTO_FIRST_WEEK?w:null;
}
async function sendWeeklyReports(w,kinds){
 const off=Math.round((w-weekStart(0))/7), sv={g:per.g,b:per.b,wk:wkOffset,we:wkEmp}, head='ENVÍO AUTOMÁTICO · CIERRE DE SEMANA (JUEVES 22:00)\n', out=[];
 try{ /* los documentos se preparan de golpe y se deja todo como estaba */
  wkOffset=off;wkEmp=null;
  if(kinds.indexOf('ventas')>=0){const p=weeklySalesPayload();out.push(['ventas',head+p.sum,p.blob||null,p.fname||null])}
  if(kinds.indexOf('gastos')>=0){per.g={mode:'sem',off:off};const d=gastosDoc();out.push(['gastos',head+docSummary(d),new Blob(['\ufeff'+d],{type:'text/plain;charset=utf-8'}),'Gastos_Semanal_'+dayStr(w).replace(/\//g,'-')+'.txt'])}
  if(kinds.indexOf('balance')>=0){per.b={mode:'sem',off:off};const d=balanceDoc();out.push(['balance',head+docSummary(d),new Blob(['\ufeff'+d],{type:'text/plain;charset=utf-8'}),'Balance_Semanal_'+dayStr(w).replace(/\//g,'-')+'.txt'])}
 }finally{per.g=sv.g;per.b=sv.b;wkOffset=sv.wk;wkEmp=sv.we}
 let ok=false;
 for(const x of out){if(await discordSend(x[0],x[1],x[2],x[3],false))ok=true}
 return ok;
}
async function autoWeekly(){
 if(autoBusy||!cloud.ok)return;
 const w=autoTargetWeek(); if(w===null)return;
 let done=0;try{done=+localStorage.getItem('harrington_auto_week')||0}catch(e){}
 if(done>=w)return;
 const kinds=['ventas','gastos','balance'].filter(k=>(webhook.urls[k]||webhook.url)&&webhook.ev[k]);
 if(!kinds.length)return;
 const mark=()=>{try{localStorage.setItem('harrington_auto_week',String(w))}catch(e){}};
 autoBusy=true;
 try{
  /* reserva atómica en la nube: solo UN dispositivo consigue crear esta fila y hace el envío */
  const key='semanal-'+w;
  const r=await sbFetch('/rest/v1/datos?on_conflict=clave',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify([{clave:key,valor:{semana:dayStr(w),ts:Date.now()},actualizado:new Date().toISOString()}])});
  if(!r.ok)throw new Error(r.status);
  const rows=await r.json();
  if(!Array.isArray(rows)||!rows.length){mark();return} /* ya lo envió otro dispositivo */
  if(await sendWeeklyReports(w,kinds))mark();
  else await sbFetch('/rest/v1/datos?clave=eq.'+encodeURIComponent(key),{method:'DELETE'}).catch(()=>{}); /* no llegó nada: se reintentará */
 }catch(e){}finally{autoBusy=false}
}
async function repCopy(text){if(await copyText(text))say('Copiado para Discord');else prompt('Copia este texto:',text)}
function renderModGastos(){
 const pi=periodInfo('g'), a=accounts(pi.r);
 const form=`<div class="dir-form enc-sec"><div class="dir-sec-title" style="margin-top:0">NUEVO GASTO</div>
  <label>TIPO DE GASTO<select id="gxCat"><option value="">Seleccionar…</option>${Object.keys(CAT_NAMES).map(c=>`<option value="${c}"${gxDraft.cat===c?' selected':''}>${CAT_NAMES[c]}</option>`).join('')}</select></label>
  <label>CONCEPTO<input id="gxConcept" type="text" maxlength="80" autocomplete="off" placeholder="Ej.: Sueldo de Vincent Harrington" value="${esc(gxDraft.concepto)}"></label>
  <label>CANTIDAD ($)<div class="money"><i>$</i><input id="gxAmt" inputmode="decimal" placeholder="0.00" autocomplete="off" value="${esc(gxDraft.amt)}"></div></label>
  <div class="pay-err" id="gxErr" hidden></div>
  <div class="enc-actions" style="margin-top:8px"><button type="button" class="primary" data-dir="gxsave">GUARDAR</button></div></div>`;
 const list=a.ex.length?a.ex.slice().reverse().map(x=>`<div class="dir-log"><b>${CAT_NAMES[x.cat]}</b> · ${esc(x.date)} ${esc(x.time)}<br>${esc(x.concepto)}<br><b>${money(x.cents)}</b><div class="emp-btns"><button type="button" class="warn" data-dir="gxdel:${esc(x.id)}">🗑 ELIMINAR</button></div></div>`).join(''):'<div class="enc-empty">No hay gastos en este periodo.</div>';
 return `${form}<div class="dir-sec-title">REGISTRO DE GASTOS</div>${periodBar('g')}${list}
  <div class="enc-actions" style="margin:8px 0"><button type="button" class="gold" data-dir="open:sueldos">PAGAR SUELDOS (SEGÚN LAS HORAS)</button></div>
  <div class="enc-card dir-item" style="margin-top:8px"><div class="enc-money"><span>Proveedor: ${money(a.byCat.proveedor)}</span><span>Sueldos: ${money(a.byCat.sueldos)}</span><span>Otros: ${money(a.byCat.otros)}</span></div><div class="brow due"><span>TOTAL GASTOS</span><span>${money(a.gas)}</span></div></div>${repButtons('g')}`;
}
function saveGasto(){
 const err=t=>{const e=document.getElementById('gxErr');e.textContent=t;e.hidden=false};
 const concepto=gxDraft.concepto.trim().replace(/\s+/g,' '), cents=parseMoney(gxDraft.amt);
 if(!gxDraft.cat)return err('Selecciona el tipo de gasto');
 if(!concepto)return err('Escribe el concepto');
 if(!(cents>0))return err('Introduce una cantidad mayor que 0');
 const now=Date.now(), m=madridParts(now);
 gastos.push({id:'g'+now.toString(36)+Math.random().toString(36).slice(2,5),cat:gxDraft.cat,concepto:concepto,cents:cents,day:dayNum(+m.year,+m.month,+m.day),date:`${m.day}/${m.month}/${m.year}`,time:`${m.hour}:${m.minute}`});
 discordSend('gastos','GASTO · '+CAT_NAMES[gxDraft.cat]+'\n'+concepto+'\nImporte: '+money(cents));
 saveGastos();cloudPut('gasto:'+gastos[gastos.length-1].id,gastos[gastos.length-1]);gxDraft={cat:'',concepto:'',amt:''};per.g={mode:'dia',off:0};renderDir();say('Gasto guardado');
}
/* ===== Sueldos: semana de lunes a domingo, se pagan el domingo =====
   El pago se apunta como gasto el día que se paga, así que cae en la semana de cuentas (viernes a jueves) en curso. */
const SUELDO_PUESTO={'Jefe':5000,'Gerente':4000,'Armero experto':3000,'Armero':2500,'Aprendiz de armero':2000};
const ASCENSO={'Aprendiz de armero':'Armero','Armero':'Armero experto','Armero experto':'Gerente'};
function payMonday(off){const n=todayNum(),dow=new Date(n*86400000).getUTCDay();return n-((dow+6)%7)+off*7}
/* Semana que toca pagar: la que termina hoy si es domingo; si no, la que terminó el domingo pasado */
function payDueWeek(){const dow=new Date(todayNum()*86400000).getUTCDay();return payMonday(dow===0?0:-1)}
let sueOff=0;
function sueWeek(){return payDueWeek()+sueOff*7}
function sueIsCur(ws){return ws>payDueWeek()}
function isoDay(n){const d=new Date(n*86400000);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())}
function sueEmps(ws){const fin=isoDay(ws+6);return empleados.filter(e=>e.puesto&&e.sueldo>0&&(!e.inicio||e.inicio<=fin))}
function suePaid(e,ws){return gastos.find(g=>g.cat==='sueldos'&&g.sueldo&&g.sueldo.ws===ws&&g.sueldo.emp===e.id)}
/* Las horas de una semana van desde su lunes hasta que se paga (o hasta el lunes siguiente); lo fichado después de pagar pasa a la semana siguiente */
function sueCut(e,ws){const end=madridMidnight(ws+7), p=suePaid(e,ws);return p&&p.sueldo.at?Math.min(p.sueldo.at,end):end}
function workedMs(e,ws){
 const a=sueCut(e,ws-7), b=sueCut(e,ws);let ms=0;
 loadLog(KEY_SHIFTLOG).forEach(r=>{if(r.name===e.name&&r.start>=a&&r.start<b)ms+=Math.max(0,r.end-r.start)});
 const o=shifts.find(x=>x.empId===e.id);if(o&&o.start>=a&&o.start<b)ms+=Math.max(0,Math.min(Date.now(),b)-o.start);
 return ms;
}
/* Sueldo de un día concreto: con un ascenso, el día del ascenso se cobra aún el antiguo y el nuevo cuenta desde el día siguiente */
function salaryOn(e,day){let s=e.sueldo;(e.ascensos||[]).slice().sort((a,b)=>b.desde-a.desde).forEach(x=>{if(day<x.desde)s=x.antes});return s}
function sueSegs(e,ws){const out=[];for(let d=0;d<7;d++){const s=salaryOn(e,ws+d), l=out[out.length-1];if(l&&l.s===s)l.n++;else out.push({s:s,n:1})}return out}
function sueBase(e,ws){return Math.round(sueSegs(e,ws).reduce((a,x)=>a+x.s*x.n,0)/7)}
function segTxt(seg){return seg.length>1?seg.map(x=>x.n+' '+(x.n===1?'día':'días')+' a '+money(x.s)).join(' + '):''}
function sueCalc(e,ws){
 const p=suePaid(e,ws);if(p&&p.sueldo.pay!=null)return Object.assign({paid:p},p.sueldo);
 const c=e.horas||10, req=weekRequired(e.name,ws), need=req.h*3600000, w=workedMs(e,ws), base=sueBase(e,ws), seg=sueSegs(e,ws);
 const miss=Math.max(0,need-w), extra=need?Math.max(0,w-need):0, desc=Math.min(base,Math.round(base*miss/(c*3600000)));
 const o=shifts.find(x=>x.empId===e.id);
 return {c:c,req:req.h,abs:req.d,worked:w,miss:miss,extra:extra,base:base,seg:seg,rate:Math.round(base/c),desc:desc,pay:base-desc,nuevo:!!(e.inicio&&e.inicio>isoDay(ws)),open:!!o,name:e.name,puesto:e.puesto};
}
function hm(ms){const m=Math.round(ms/60000);return Math.floor(m/60)+' h'+(m%60?' '+pad(m%60)+' min':'')}
function sueLab(ws){return dayStr(ws).slice(0,5)+' – '+dayStr(ws+6).slice(0,5)}
function sueDue(ws){return sueEmps(ws).filter(e=>suePaid(e,ws)||sueCalc(e,ws).pay>0)}
function suePending(ws){return sueDue(ws).filter(e=>!suePaid(e,ws))}
/* Estado de la placa de la pantalla principal */
function payState(){
 const ws=payDueWeek(), L=sueDue(ws);if(!L.length)return null;
 const paid=L.filter(e=>suePaid(e,ws)).length;
 if(paid<L.length)return {st:'due',ws:ws,paid:paid,total:L.length};
 return todayNum()<=ws+6+4?{st:'paid',ws:ws,paid:paid,total:L.length}:null;
}
function renderPayPlate(){
 const el=document.getElementById('payPlate');if(!el)return;
 const s=payState();if(!s){el.hidden=true;el.innerHTML='';return}
 const me=meEmp(), mine=me&&sueDue(s.ws).some(e=>e.id===me.id)?sueCalc(me,s.ws):null;
 const own=mine?` · Tu sueldo: <b>${money(mine.pay)}</b> · ${mine.paid?'pagado ✓':'pendiente'}`:'';
 const html=s.st==='due'
  ?`<span class="pp-coin" aria-hidden="true">$</span><div><small>DOMINGO ${esc(dayStr(s.ws+6).slice(0,5))} · SEMANA ${esc(sueLab(s.ws))}</small><b>DÍA DE PAGO</b><span>${s.paid} de ${s.total} sueldos pagados${own}</span></div>`
  :`<span class="pp-coin ok" aria-hidden="true">✓</span><div><small>SEMANA ${esc(sueLab(s.ws))}</small><b>SUELDOS PAGADOS</b><span>Todos los sueldos están pagados${own}</span></div><i class="pp-stamp" aria-hidden="true">PAGADO</i>`;
 el.className='pay-plate '+s.st;
 if(el.innerHTML!==html)el.innerHTML=html;el.hidden=false;
}
setInterval(renderPayPlate,60000);
function renderModSueldos(){
 const ws=sueWeek(), cur=sueIsCur(ws), L=sueEmps(ws), sun=ws+6, canNext=ws+7<=payMonday(0);
 let tot=0, paid=0;
 const cards=L.map(e=>{
  const k=sueCalc(e,ws), p=k.paid;tot+=k.pay;if(p)paid+=p.cents;
  const st=k.req===0?`<span class="badge si">EXENTO</span>`:k.miss?`<span class="badge no">FALTAN ${esc(hm(k.miss))}</span>`:k.extra>=60000?`<span class="badge si">+${esc(hm(k.extra))} EXTRA</span>`:`<span class="badge si">✓ HORAS CUMPLIDAS</span>`;
  const sg=segTxt(k.seg||[]);
  return `<div class="enc-card dir-item"><div class="t">${esc(e.name)} ${st}</div>
   <div class="it">${esc((e.puesto||'').toUpperCase())} · Horas echadas: <b>${esc(hm(k.worked))}</b> de ${k.req} h${k.req<k.c?` (ausente ${k.abs} días${k.req?': la mitad':': exento'})`:''}${k.open&&!p?'<br>Está fichado ahora: cuenta hasta este momento.':''}${k.nuevo?`<br>Empezó el ${esc(fmtISO(e.inicio))} (semana incompleta)`:''}</div>
   <div class="enc-money"><span>Sueldo: ${money(k.base)}${sg?' ('+esc(sg)+')':''}</span>${k.desc?`<span>Descuento: −${money(k.desc)} (${esc(hm(k.miss))} × ${money(k.rate)}/h)</span>`:''}${k.extra>=60000&&!k.miss?`<span>Horas extra: ${esc(hm(k.extra))} (sin pagar)</span>`:''}</div>
   <div class="brow due"><span>${p?'PAGADO':'A PAGAR'}</span><span>${money(p?p.cents:k.pay)}</span></div>
   ${p?`<div class="enc-note">✓ Pagado el ${esc(p.date)} a las ${esc(p.time)}${k.by?' por '+esc(k.by):''} · está en GASTOS.</div>`:cur?`<div class="enc-note">Semana en curso: se paga el domingo ${esc(dayStr(sun).slice(0,5))}.</div>`:k.pay>0?`<div class="enc-actions"><button type="button" class="primary" data-dir="su-pay:${esc(e.id)}">PAGAR ${money(k.pay)}</button></div>`:'<div class="enc-note">No ha echado ninguna hora: no hay nada que pagar.</div>'}</div>`;
 }).join('');
 const nav=`<div style="display:grid;grid-template-columns:48px 1fr 48px;gap:8px;margin-bottom:10px" class="enc-actions"><button type="button" data-dir="su-prev" aria-label="Semana anterior">◂</button><button type="button" data-dir="su-now" style="font-size:14px">${cur?'SEMANA EN CURSO':'SEMANA '+esc(sueLab(ws))}</button><button type="button" data-dir="su-next" aria-label="Semana siguiente"${canNext?'':' disabled'}>▸</button></div>`;
 return `${nav}<div class="dir-sec-title" style="margin-top:0">${cur?'PROVISIONAL · SE PAGA EL DOMINGO '+esc(dayStr(sun).slice(0,5)):'PAGO DEL DOMINGO '+esc(dayStr(sun).slice(0,5))}</div>
  <p class="bk-note">Semana de sueldos del lunes ${esc(dayStr(ws).slice(0,5))} al domingo ${esc(dayStr(sun).slice(0,5))}. Si un empleado no echa sus horas se le descuenta lo proporcional: sueldo ÷ horas de contrato × horas que faltan. Las horas cuentan hasta que pulsas PAGAR; lo que fiche después pasa a la semana siguiente. Si asciende a mitad de semana, cada día se cobra con el sueldo que tenía ese día. Las horas de más se muestran, pero no se pagan.</p>
  ${cards||'<div class="enc-empty">Ningún empleado tiene sueldo esa semana. Complétalo en EMPLEADOS.</div>'}
  ${L.length?`<div class="enc-card dir-item"><div class="brow"><span>Total de la semana</span><span>${money(tot)}</span></div><div class="brow"><span>Ya pagado</span><span>${money(paid)}</span></div><div class="brow due"><span>PENDIENTE</span><span>${money(Math.max(0,tot-paid))}</span></div></div>`:''}`;
}
async function claimRow(key,val){
 const r=await sbFetch('/rest/v1/datos?on_conflict=clave',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify([{clave:key,valor:val,actualizado:new Date().toISOString()}])});
 if(!r.ok)throw new Error(r.status);
 const rows=await r.json();return Array.isArray(rows)&&rows.length>0;
}
async function paySueldo(id){
 const ws=sueWeek(), e=empleados.find(x=>x.id===id);if(!e||sueIsCur(ws))return;
 if(suePaid(e,ws))return say('El sueldo de '+e.name+' de esa semana ya está pagado');
 const k=sueCalc(e,ws), lab=sueLab(ws);
 if(!(k.pay>0))return;
 if(!await askConfirm('Pagar sueldo',e.name+' · semana '+lab+': '+hm(k.worked)+' de '+k.req+' h.'+(k.open?' Está fichado ahora: cuenta hasta este momento.':'')+(k.desc?' Sueldo '+money(k.base)+' − descuento '+money(k.desc)+'.':'')+' Se apuntará en GASTOS: '+money(k.pay)+'.','Pagar'))return;
 const now=Date.now();
 try{if(!await claimRow('sueldo-'+ws+'-'+e.id,{ts:now,cents:k.pay})){await cloudPullRecords();renderDir();return say('Ese sueldo ya lo pagó otro dispositivo')}}
 catch(err){return say('Sin conexión: no se ha pagado. Inténtalo de nuevo')}
 const m=madridParts(now), by=meEmp()?meEmp().name:'';
 const snap={ws:ws,emp:e.id,at:now,by:by,name:e.name,puesto:e.puesto,c:k.c,req:k.req,abs:k.abs,worked:k.worked,miss:k.miss,extra:k.extra,base:k.base,seg:k.seg,rate:k.rate,desc:k.desc,pay:k.pay};
 const g={id:'g'+now.toString(36)+Math.random().toString(36).slice(2,5),cat:'sueldos',concepto:'Sueldo · '+e.name+' ('+lab+')'+(k.desc?' · −'+money(k.desc)+' por '+hm(k.miss)+' sin echar':''),cents:k.pay,day:dayNum(+m.year,+m.month,+m.day),date:`${m.day}/${m.month}/${m.year}`,time:`${m.hour}:${m.minute}`,sueldo:snap};
 gastos.push(g);saveGastos();cloudPut('gasto:'+g.id,g);
 renderDir();renderPayPlate();
 const left=suePending(ws).length;
 say('Sueldo pagado: '+e.name+' · '+money(k.pay)+(left?' · quedan '+left:' · ¡todos los sueldos pagados!'));
 if(!left)paySummary(ws);
}
/* Cuando se paga el último sueldo, un solo mensaje al canal «Sueldos» con toda la semana */
function paySummaryText(ws){
 const L=sueEmps(ws), out=['SUELDOS PAGADOS · Semana '+dayStr(ws)+' – '+dayStr(ws+6),''];let tot=0, dsc=0, by='';
 L.forEach(e=>{
  const k=sueCalc(e,ws), sg=segTxt(k.seg||[]);
  out.push(e.name+' · '+(k.puesto||e.puesto||''));
  out.push('  Horas: '+hm(k.worked)+' de '+k.req+' h'+(k.req<k.c?' (ausente '+k.abs+' días'+(k.req?': la mitad':': exento')+')':''));
  if(k.paid){
   tot+=k.pay;dsc+=k.desc;if(k.by)by=k.by;
   out.push('  Sueldo: '+money(k.base)+(sg?' ('+sg+')':'')+(k.desc?' · Descuento: −'+money(k.desc)+' ('+hm(k.miss)+' sin echar)':' · íntegro')+(k.extra>=60000&&!k.miss?' · +'+hm(k.extra)+' extra (sin pagar)':''));
   out.push('  Pagado: '+money(k.pay));
  }else out.push('  No ha echado horas: no cobra esta semana');
  out.push('');
 });
 out.push('Total pagado: '+money(tot),'Total descontado: '+money(dsc));
 if(by)out.push('Pagado por: '+by);
 return out.join('\n');
}
async function paySummary(ws){
 try{if(!await claimRow('sueldos-resumen-'+ws,{ts:Date.now()}))return}catch(e){return}
 discordSend('sueldos',paySummaryText(ws));
}
/* Ascensos: Aprendiz de armero → Armero → Armero experto → Gerente (tope) */
async function empAscenso(id){
 const e=empleados.find(x=>x.id===id), nx=e&&ASCENSO[e.puesto];if(!nx||!empHasContract(e))return;
 const ns=SUELDO_PUESTO[nx];
 if(!await askConfirm('Ascenso',e.name+': '+e.puesto+' '+money(e.sueldo)+' → '+nx+' '+money(ns)+'. Hoy cobra todavía el sueldo antiguo; el nuevo cuenta desde mañana. Se publicará el contrato nuevo en Discord, sin periodo de prueba.','Ascender'))return;
 e.ascensos=(e.ascensos||[]).concat([{ts:Date.now(),desde:todayNum()+1,de:e.puesto,a:nx,antes:e.sueldo,nuevo:ns}]);
 e.puesto=nx;e.sueldo=ns;e.prueba='';e.sinPrueba=true;e.alta=Date.now();
 saveEmp();renderDir();renderCustomer();renderPayPlate();
 say('¡'+e.name+' asciende a '+nx+'! Nuevo sueldo: '+money(ns));
 sendContract(e,true);
}
async function deleteGasto(id){
 const x=gastos.find(g=>g.id===id); if(!x)return;
 if(!await askConfirm('Eliminar gasto',`«${x.concepto}» (${money(x.cents)}) se borrará del registro.`,'Eliminar'))return;
 gastos=gastos.filter(g=>g.id!==id);saveGastos();cloudDel('gasto:'+id);
 if(x.sueldo){['sueldo-'+x.sueldo.ws+'-'+x.sueldo.emp,'sueldos-resumen-'+x.sueldo.ws].forEach(k=>sbFetch('/rest/v1/datos?clave=eq.'+encodeURIComponent(k),{method:'DELETE'}).catch(()=>{}))}
 renderDir();renderPayPlate();
 say('Gasto eliminado',undefined,async()=>{
  if(x.sueldo){try{if(!await claimRow('sueldo-'+x.sueldo.ws+'-'+x.sueldo.emp,{ts:Date.now(),cents:x.cents}))return say('Ese sueldo ya se ha vuelto a pagar: no se puede deshacer')}catch(e){return say('Sin conexión: no se ha podido deshacer')}}
  gastos.push(x);gastos.sort((a,b)=>String(a.id).localeCompare(String(b.id)));saveGastos();cloudPut('gasto:'+x.id,x);if(!dirModal.hidden)renderDir();renderPayPlate();say('Gasto recuperado');
 });
}
function gastosDoc(){
 const pi=periodInfo('g'), a=accounts(pi.r), line='────────────────────', now=Date.now();
 const o=['HARRINGTON GUNSMITH','REGISTRO DE GASTOS · '+pi.kind,'Saint Denis · 1880','',(pi.sem?'Semana: ':'Día: ')+pi.label,'Generado: '+fmtDate(now)+' '+fmtTime(now),''];
 a.ex.forEach(x=>o.push(`${x.date} ${x.time} · ${CAT_NAMES[x.cat]}`,x.concepto,'Importe: '+money(x.cents),''));
 if(!a.ex.length)o.push('Sin gastos en este periodo.','');
 o.push(line,'Proveedor: '+money(a.byCat.proveedor),'Sueldos: '+money(a.byCat.sueldos),'Otros gastos: '+money(a.byCat.otros),'TOTAL GASTOS: '+money(a.gas),line,'','El precio de un apellido.');
 return o.join('\n');
}
function renderModBalance(){
 const pi=periodInfo('b'), a=accounts(pi.r);
 let days='';
 if(pi.sem){
  days='<div class="dir-sec-title">DESGLOSE POR DÍA</div>';
  for(let d=pi.r.s;d<=pi.r.e;d++){const x=accounts({s:d,e:d});days+=`<div class="dir-log"><b>${DIAS[new Date(d*86400000).getUTCDay()]} ${dayStr(d)}</b><br>Ingresos: ${money(x.ing)} · Gastos: ${money(x.gas)} · <span class="${x.ben<0?'neg':''}">Beneficio: ${sgn(x.ben)}</span></div>`}
 }
 return `${periodBar('b')}<div class="dir-sec-title" style="margin-top:0">BALANCE ${pi.kind}</div>
  <div class="enc-card dir-item"><div class="enc-money"><span>Ingresos (ventas): <b>${money(a.ing)}</b></span><span>${a.ops} ${plural(a.ops,'operación','operaciones')}</span></div>
  <div class="enc-money"><span>Gastos: <b>${money(a.gas)}</b></span></div>
  <div class="enc-money"><span>Proveedor: ${money(a.byCat.proveedor)}</span><span>Sueldos: ${money(a.byCat.sueldos)}</span><span>Otros: ${money(a.byCat.otros)}</span></div>
  <div class="brow due"><span>BENEFICIO</span><span class="${a.ben<0?'neg':''}">${sgn(a.ben)}</span></div></div>${pi.sem?`<div class="dir-sec-title">GRÁFICO DE LA SEMANA</div>${chartSVG(pi.r)}`:''}${days}${topHTML(pi.r)}${repButtons('b')}`;
}
function balanceDoc(){
 const pi=periodInfo('b'), a=accounts(pi.r), line='────────────────────', now=Date.now();
 const o=['HARRINGTON GUNSMITH','BALANCE DE CUENTAS · '+pi.kind,'Saint Denis · 1880','',(pi.sem?'Semana: ':'Día: ')+pi.label,'Generado: '+fmtDate(now)+' '+fmtTime(now),''];
 if(pi.sem){
  for(let d=pi.r.s;d<=pi.r.e;d++){const x=accounts({s:d,e:d});o.push(`${DIAS[new Date(d*86400000).getUTCDay()]} ${dayStr(d)} · Ingresos: ${money(x.ing)} · Gastos: ${money(x.gas)} · Beneficio: ${sgn(x.ben)}`)}
  o.push('');
 }
 o.push(line,`INGRESOS (ventas cobradas): ${money(a.ing)} · ${a.ops} ${plural(a.ops,'operación','operaciones')}`,'','GASTOS','  Proveedor: '+money(a.byCat.proveedor),'  Sueldos: '+money(a.byCat.sueldos),'  Otros gastos: '+money(a.byCat.otros),'  Total gastos: '+money(a.gas),'',`BENEFICIO: ${sgn(a.ben)}`,line,'','El precio de un apellido.');
 return o.join('\n');
}
dirModal.addEventListener('input',e=>{
 const id=e.target.id;
 if(id==='gxConcept')gxDraft.concepto=e.target.value;
 else if(id==='gxAmt'){const v=e.target.value.replace(/[^0-9.,]/g,'');if(v!==e.target.value)e.target.value=v;gxDraft.amt=v}
});
dirModal.addEventListener('change',e=>{
 const id=e.target.id, d=e.target.dataset||{};
 if(d.ser==='a'&&clWork){const i=+d.i,L=clWork.series||(clWork.series=[]);while(L.length<=i)L.push({s:'',a:''});L[i].a=e.target.value}
 if(id==='gxCat')gxDraft.cat=e.target.value;
 else if(id==='cpCat')cpDraft.cat=e.target.value;
 else if(id==='clType'&&clWork)clWork.type=e.target.value;
 else if(id==='bkFile'&&e.target.files[0]){restoreBackup(e.target.files[0]);e.target.value=''}
});
dirModal.addEventListener('input',e=>{
 const t=e.target, id=t.id, d=t.dataset||{};
 if(d.pe!==undefined){const v=t.value.replace(/[^0-9.,]/g,'');t.value=v;priceDraft[d.pe]=v}
 else if(id==='cpName')cpDraft.name=t.value;
 else if(id==='cpPrice'){const v=t.value.replace(/[^0-9.,]/g,'');t.value=v;cpDraft.price=v}
 else if(id==='cpDesc')cpDraft.desc=t.value;
 else if(id==='clName'&&clWork)clWork.name=t.value;
 else if(id==='clTel'&&clWork){const v=sanitizeTelegram(t.value);t.value=v;clWork.telegram=v}
 else if(id==='clIdent'&&clWork)clWork.ident=t.value;
 else if(d.ser&&clWork){
  const i=+d.i, L=clWork.series||(clWork.series=[]);while(L.length<=i)L.push({s:'',a:''});
  if(d.ser==='s'){const v=t.value.toUpperCase().replace(/[^A-Z0-9\-\/.]/g,'').slice(0,20);if(v!==t.value)t.value=v;L[i].s=v}
  const box=document.getElementById('serList'), n=box?box.children.length:0;
  if(box&&i===n-1&&L[i].s&&n<MAX_SERIES){L.push({s:'',a:''});box.insertAdjacentHTML('beforeend',serieRowHTML({s:'',a:''},n))}
  const cnt=document.getElementById('serCount');if(cnt)cnt.textContent=L.filter(r=>r.s).length;
 }
 else if(id==='clPrice'||id==='whUrl'&&false){t.value=t.value.replace(/[^0-9.,]/g,'')}
 else if(d.clq){clQ=t.value;const el=document.getElementById('dirBody');renderDir();const i=el.querySelector('[data-clq]');if(i){i.focus();i.setSelectionRange(clQ.length,clQ.length)}}
 else if(id==='ccCount'){const v=t.value.replace(/[^0-9.,]/g,'');t.value=v;ccCount=v;const tt=todayNum(),a=accounts({s:tt,e:tt}),diff=parseMoney(v)-(a.ing-a.gas),el=document.getElementById('ccDiff');el.textContent=v?sgn(diff):'—';el.className=v&&diff<0?'neg':''}
});
/* ===== Resumen de Dirección, gráfico en tinta sepia, stock mínimo y ranking ===== */
const KEY_STOCKMIN='harrington_stockmin_v1';
let stockMin=loadObj(KEY_STOCKMIN,{});
if(Array.isArray(stockMin))stockMin={};
let minDraft={};
function saveStockMin(){store.set(KEY_STOCKMIN,JSON.stringify(stockMin))}
function dotCls(n){const v=stockMap[n]||0,m=stockMin[n]||0;return v<=0?'r':(m>0&&v<=m?'a':'g')}
function lowStock(){return inputs.map(i=>i.dataset.name).filter(n=>{const m=stockMin[n]||0;return m>0&&(stockMap[n]||0)<=m})}
function rollTo(el,cents,instant){
 if(el._raf)cancelAnimationFrame(el._raf);
 const from=el._cur===undefined?cents:el._cur;
 el._cur=cents;
 if(instant||from===cents||window.matchMedia('(prefers-reduced-motion:reduce)').matches){el.textContent=money(cents);return}
 const t0=performance.now();
 const step=now=>{const k=Math.min(1,(now-t0)/380), e=1-Math.pow(1-k,3);el.textContent=money(Math.round(from+(cents-from)*e));if(k<1)el._raf=requestAnimationFrame(step);else el.textContent=money(cents)};
 el._raf=requestAnimationFrame(step);
}
const orderBar=document.getElementById('orderBar');
let orderVisible=false, lastBar={units:0,products:0,due:0};
function updateOrderBar(units,products,due){
 if(units!==undefined)lastBar={units:units,products:products,due:due};
 const show=lastBar.units>0&&!orderVisible&&window.matchMedia('(max-width:900px)').matches;
 orderBar.hidden=!show;document.body.classList.toggle('has-bar',show);
 document.getElementById('obCount').textContent=summaryText(lastBar.products,lastBar.units);
 rollTo(document.getElementById('obTotal'),lastBar.due,orderBar.hidden);
 updateFinish();
}
function finishMissing(){
 if(!selected().length)return 'Añade productos';
 if(!customerName())return customer.type==='empresa'?'Falta el nombre de la empresa':'Falta el nombre del cliente';
 if(!empName())return 'Falta elegir el empleado';
 if(customer.op==='encargo'&&!loadedEnc){
  if(!/^[A-Z0-9-]{1,10}$/.test(customer.telegram||''))return 'Falta el telegrama';
  if(computeFin().raw<=0)return 'Falta el pago por adelantado';
 }
 if(computeFin().over)return 'Revisa la cantidad abonada';
 return '';
}
function updateFinish(){
 const f=document.getElementById('finish'), go=document.getElementById('obGo'); if(!f)return;
 let miss='';try{miss=finishMissing()}catch(e){}
 const enc=customer.op==='encargo'&&!loadedEnc, ready=enc?'GUARDAR ENCARGO':'FINALIZAR VENTA';
 const t=miss||ready; if(f.textContent!==t)f.textContent=t;
 f.classList.toggle('not-ready',!!miss);
 if(go){go.textContent=miss?'FALTA ALGO':'FINALIZAR';go.classList.toggle('not-ready',!!miss)}
}
function chartSVG(r){
 const days=[];for(let d=r.s;d<=r.e;d++){const a=accounts({s:d,e:d});days.push({d:d,ing:a.ing,gas:a.gas})}
 const max=Math.max(100,...days.flatMap(x=>[x.ing,x.gas])), W=420,H=200,L=10,B=34,T=30, ch=H-B-T, sw=(W-2*L)/days.length, bw=17, ink='#3b2a14', ff='font-family="Georgia,serif"';
 const y=v=>T+ch-(v/max)*ch, lab=v=>v?'$'+Math.round(v/100):'';
 let o=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Ingresos y gastos de la semana" style="display:block;margin:6px 0 12px;border:1px solid #7a5a22;border-radius:4px"><defs><pattern id="hat" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#7a2a14" stroke-width="2"/></pattern></defs><rect width="${W}" height="${H}" fill="#e6d6a8"/>`;
 [.25,.5,.75,1].forEach(f=>{const yy=T+ch-f*ch;o+=`<line x1="${L}" x2="${W-L}" y1="${yy}" y2="${yy}" stroke="#7a5a2233" stroke-dasharray="2 4"/>`});
 days.forEach((x,i)=>{
  const cx=L+sw*i+sw/2;
  o+=`<rect x="${cx-bw-1.5}" y="${y(x.ing)}" width="${bw}" height="${T+ch-y(x.ing)}" fill="#8a6414" stroke="${ink}" stroke-width=".8"/>`;
  o+=`<rect x="${cx+1.5}" y="${y(x.gas)}" width="${bw}" height="${T+ch-y(x.gas)}" fill="url(#hat)" stroke="${ink}" stroke-width=".8"/>`;
  o+=`<text x="${cx-bw/2-1.5}" y="${y(x.ing)-3}" font-size="9" text-anchor="middle" fill="${ink}" ${ff}>${lab(x.ing)}</text><text x="${cx+bw/2+1.5}" y="${y(x.gas)-3}" font-size="9" text-anchor="middle" fill="${ink}" ${ff}>${lab(x.gas)}</text>`;
  o+=`<text x="${cx}" y="${H-B+15}" font-size="11" text-anchor="middle" fill="${ink}" ${ff}>${DIAS[new Date(x.d*86400000).getUTCDay()]}</text>`;
 });
 o+=`<line x1="${L}" x2="${W-L}" y1="${T+ch}" y2="${T+ch}" stroke="${ink}" stroke-width="1.2"/>`;
 o+=`<rect x="${L+4}" y="9" width="10" height="10" fill="#8a6414" stroke="${ink}" stroke-width=".8"/><text x="${L+18}" y="18" font-size="10" fill="${ink}" ${ff}>Ingresos</text><rect x="${L+80}" y="9" width="10" height="10" fill="url(#hat)" stroke="${ink}" stroke-width=".8"/><text x="${L+94}" y="18" font-size="10" fill="${ink}" ${ff}>Gastos</text></svg>`;
 return o;
}
const CATS=[['revolveres','Revólveres'],['pistolas','Pistolas'],['repetidoras','Repetidoras'],['rifles','Rifles'],['escopetas','Escopetas'],['blancas','Armas blancas'],['municion','Munición'],['suministros','Suministros']];
function parsePrice(v){const n=parseFloat(numIn(v));return isFinite(n)&&n>=0?Math.round(n*100)/100:null}
/* --- Productos y precios --- */
let priceDraft={}, cpDraft={name:'',cat:'',price:'',desc:''};
function renderModProductos(){
 const rows=CATS.map(([c,label])=>`<div class="dir-sec-title">${label.toUpperCase()}</div>`+inputs.filter(i=>i.closest('.product').dataset.cat===c).map(i=>{
  const n=i.dataset.name, cust=i.dataset.custom==='1', ch=i.dataset.price!==i.dataset.price0&&!cust, v=priceDraft[n]!==undefined?priceDraft[n]:Number(i.dataset.price).toFixed(2);
  return `<div class="price-row"><span class="nm">${esc(n)}${cust?'<span class="cust-tag">NUEVO</span>':''}${ch?'<span class="cust-tag">EDITADO</span>':''}</span><div style="display:flex;gap:6px;align-items:center"><div class="money"><i>$</i><input data-pe="${esc(n)}" inputmode="decimal" value="${esc(v)}" aria-label="Precio de ${esc(n)}"></div>${cust?`<div class="emp-btns"><button type="button" class="warn" data-dir="cp-del:${encodeURIComponent(n)}" aria-label="Eliminar">🗑</button></div>`:''}</div></div>`;
 }).join('')).join('');
 const form=`<div class="dir-form enc-sec"><div class="dir-sec-title" style="margin-top:0">AÑADIR PRODUCTO NUEVO</div>
  <label>NOMBRE<input id="cpName" type="text" maxlength="40" autocomplete="off" value="${esc(cpDraft.name)}" placeholder="Ej.: Rifle Lancaster"></label>
  <label>CATEGORÍA<select id="cpCat"><option value="">Seleccionar…</option>${CATS.map(([c,l])=>`<option value="${c}"${cpDraft.cat===c?' selected':''}>${l}</option>`).join('')}</select></label>
  <label>PRECIO ($)<div class="money"><i>$</i><input id="cpPrice" inputmode="decimal" placeholder="0.00" value="${esc(cpDraft.price)}"></div></label>
  <label>DESCRIPCIÓN CORTA (OPCIONAL)<input id="cpDesc" type="text" maxlength="160" autocomplete="off" value="${esc(cpDraft.desc)}" placeholder="Para la ficha del producto"></label>
  <div class="pay-err" id="cpErr" hidden></div>
  <div class="enc-actions"><button type="button" class="primary" data-dir="cp-add">AÑADIR PRODUCTO</button></div></div>`;
 return `<p class="bk-note">Los cambios de precio valen para las ventas nuevas. Las ventas y los encargos ya hechos conservan su precio.</p><div class="enc-actions" style="margin-bottom:8px"><button type="button" class="primary" data-dir="price-save">GUARDAR PRECIOS</button></div>${rows}${form}`;
}
function savePrices(){
 const pr=loadObj(KEY_PRICES,{});let n=0,bad=false;
 Object.keys(priceDraft).forEach(name=>{
  const i=inputs.find(x=>x.dataset.name===name); if(!i)return;
  const v=parsePrice(priceDraft[name]); if(v===null){bad=true;return}
  if(i.dataset.custom==='1'){const cp=loadObj(KEY_CUSTPROD,[]);const x=cp.find(c=>c.name===name);if(x){x.price=v;store.set(KEY_CUSTPROD,JSON.stringify(cp))}}
  else if(v===Number(i.dataset.price0))delete pr[name];else pr[name]=v;
  if(Number(i.dataset.price)!==v)n++;
  i.dataset.price=v.toFixed(2);
 });
 store.set(KEY_PRICES,JSON.stringify(pr));
 if(bad)return say('Hay un precio no válido');
 priceDraft={};calc(false);renderDir();say(n?'Precios guardados':'No hay cambios de precio');
}
function addCustomProduct(){
 const err=t=>{const e=document.getElementById('cpErr');e.textContent=t;e.hidden=false}, name=cpDraft.name.trim().replace(/\s+/g,' '), price=parsePrice(cpDraft.price);
 if(!name)return err('Escribe el nombre del producto');
 if(inputs.some(i=>norm(i.dataset.name)===norm(name)))return err('Ya existe un producto con ese nombre');
 if(!cpDraft.cat)return err('Selecciona la categoría');
 if(price===null||price<=0)return err('Introduce un precio mayor que 0');
 const cp=loadObj(KEY_CUSTPROD,[]);cp.push({name:name,cat:cpDraft.cat,price:price,desc:cpDraft.desc.trim(),created:Date.now()});store.set(KEY_CUSTPROD,JSON.stringify(cp));
 cpDraft={name:'',cat:'',price:'',desc:''};say('Producto añadido · recargando…');setTimeout(()=>location.reload(),700);
}
async function delCustomProduct(name){
 if(!await askConfirm('Eliminar producto',`«${name}» desaparecerá del catálogo. Las ventas ya hechas no cambian.`,'Eliminar'))return;
 store.set(KEY_CUSTPROD,JSON.stringify(loadObj(KEY_CUSTPROD,[]).filter(x=>x.name!==name)));
 say('Producto eliminado · recargando…');setTimeout(()=>location.reload(),700);
}
/* --- Clientes guardados --- */
let clEdit=null, clWork=null, clQ='';
const MAX_SERIES=20;
function weaponNames(){return inputs.filter(i=>['municion','suministros'].indexOf(i.closest('.product').dataset.cat)<0).map(i=>i.dataset.name)}
function serieRows(c){const L=(c.series||[]).filter(r=>r&&(r.s||r.a)).map(r=>({s:r.s||'',a:r.a||''}));if(L.length<MAX_SERIES)L.push({s:'',a:''});c.series=L;return L}
function serieRowHTML(r,i){return `<div class="serie-row"><input data-ser="s" data-i="${i}" type="text" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="N.º de serie ${i+1}" value="${esc(r.s)}"><select data-ser="a" data-i="${i}" aria-label="Arma"><option value="">Arma (opcional)</option>${weaponNames().map(n=>`<option value="${esc(n)}"${r.a===n?' selected':''}>${esc(n)}</option>`).join('')}${r.a&&weaponNames().indexOf(r.a)<0?`<option value="${esc(r.a)}" selected>${esc(r.a)}</option>`:''}</select></div>`}
function clientText(c,title){
 const L=[title||'FICHA DE CLIENTE','Nombre: '+c.name,'Tipo: '+(c.type==='empresa'?'Empresa':'Particular'),'Telegrama: '+(c.telegram||'—')];
 if(c.ident)L.push('N.º de identificación: '+c.ident);
 const pk=Object.keys(c.precios||{});
 if(pk.length){L.push('','Precios especiales:');pk.forEach(n=>L.push('  '+n+' · '+money(Math.round(c.precios[n]*100))))}
 const S=(c.series||[]).filter(r=>r.s);
 L.push('','Armas vendidas (n.º de serie): '+S.length);
 S.forEach((r,i)=>L.push('  '+(i+1)+'. '+r.s+(r.a?' · '+r.a:'')));
 L.push('','Actualizado: '+fmtDate(Date.now())+' '+fmtTime(Date.now()));
 return L.join('\n');
}
async function publishClient(id){
 const c=clientes.find(x=>x.id===id); if(!c)return;
 const ref=await discordCard('clientes',clientText(c),c.dc);
 const k=clientes.find(x=>x.id===id);
 if(k&&ref&&(!k.dc||k.dc.id!==ref.id||k.dc.w!==ref.w)){k.dc=ref;saveClientes()}
}
let clView=null;
function cpBtn(v){return `<button type="button" class="cp-btn" data-dir="cl-copy:${encodeURIComponent(v)}" aria-label="Copiar ${esc(v)}" title="Copiar">⧉ COPIAR</button>`}
function clientSales(c){
 const n=norm(String(c.name||'').replace(/\s+/g,' ').trim());if(!n)return [];
 return loadLog(KEY_SALELOG).filter(e=>e.client&&norm(String(e.client).replace(/\s+/g,' ').trim())===n)
  .sort((a,b)=>(saleDay(b)-saleDay(a))||String(b.time||'').localeCompare(String(a.time||''))||String(b.id).localeCompare(String(a.id)));
}
let clHistAll=false;
function clientHistHTML(c){
 const L=clientSales(c), ok=L.filter(x=>!x.voided), tot=ok.reduce((a,x)=>a+collected(x),0);
 const head=`<div class="dir-sec-title">HISTORIAL DE COMPRAS (${ok.length})</div>`;
 if(!L.length)return head+'<div class="enc-empty">Todavía no hay compras a su nombre.<br>Se apuntan solas al cobrar una venta con su nombre de cliente.</div>';
 const last=ok[0], ago=last?todayNum()-saleDay(last):null;
 const agoT=ago===null?'—':ago<=0?'Hoy':ago===1?'Ayer':'Hace '+ago+' días';
 const show=clHistAll?L:L.slice(0,8);
 return head+`<div class="ch-sum"><div><small>TOTAL GASTADO</small><b>${money(tot)}</b></div><div><small>COMPRAS</small><b>${ok.length}</b></div><div><small>ÚLTIMA</small><b>${agoT}</b></div></div>`+
  show.map(x=>`<div class="ch-row${x.voided?' void':''}"><div class="ch-top"><span>${esc(x.date||'')} · ${esc(x.time||'')}${x.op==='encargo'?' · ENCARGO':''}${x.voided?' · ANULADA':''}</span><b>${money(collected(x))}</b></div><small>${(x.items||[]).map(i=>i.qty+' × '+esc(i.name)).join(', ')||'—'}</small><small>Atendió: ${esc(x.employee||'—')}${x.id?' · Ticket '+esc(x.id):''}</small></div>`).join('')+
  (L.length>8?`<div class="enc-actions" style="margin-top:8px"><button type="button" data-dir="cl-hist">${clHistAll?'VER SOLO LAS ÚLTIMAS':'VER LAS '+L.length+' COMPRAS'}</button></div>`:'');
}
function renderClientFicha(c){
 const S=(c.series||[]).filter(r=>r.s), line=(k,v,copy)=>`<div class="cf-line"><div><small>${k}</small><b>${v?esc(v):'—'}</b></div>${v&&copy?cpBtn(v):''}</div>`;
 return `<div class="cf-wrap"><div class="cf-paper cf-folder"><div class="cf-head"><small>HARRINGTON GUNSMITH · REGISTRO DE CLIENTES</small><div class="cf-name">${esc(c.name)}</div><div class="cf-type">${c.type==='empresa'?'Empresa':'Particular'}</div></div>
  <div class="dir-sec-title" style="margin-top:0">FICHA DEL CLIENTE</div>
  ${line('N.º DE IDENTIFICACIÓN',c.ident,1)}${line('TELEGRAMA',c.telegram,1)}
  <div class="dir-sec-title">ARMAS VENDIDAS (${S.length})</div>
  ${S.length?S.map((r,i)=>`<div class="cf-arma"><div class="cf-n">${i+1}</div><div class="cf-col">${line('N.º DE SERIE',r.s,1)}${line('ARMA',r.a,1)}</div></div>`).join(''):'<div class="enc-empty">Sin armas registradas.</div>'}
  ${clientHistHTML(c)}
  ${Object.keys(c.precios||{}).length?`<div class="dir-sec-title">PRECIOS ESPECIALES</div>`+Object.keys(c.precios).map(n=>`<div class="reg-line"><span>${esc(n)}</span><b>${money(Math.round(c.precios[n]*100))}</b></div>`).join(''):''}
  <div class="enc-actions two" style="margin-top:10px"><button type="button" data-dir="cl-close">◂ Volver</button><button type="button" class="primary" data-dir="cl-edit:${esc(c.id)}">✎ EDITAR</button></div></div></div>`;
}
function renderModClientes(){
 if(clView&&!clEdit){const c=clientes.find(x=>x.id===clView);if(c)return renderClientFicha(c);clView=null}
 if(clEdit){
  const c=clWork, pk=Object.keys(c.precios||{});
  return `<div class="dir-form enc-sec"><div class="dir-sec-title" style="margin-top:0">${clEdit==='new'?'NUEVO CLIENTE':'EDITAR CLIENTE'}</div>${pzBox('cl')}
   <label>NOMBRE<input id="clName" type="text" maxlength="40" autocomplete="off" value="${esc(c.name)}"></label>
   <label>TIPO<select id="clType"><option value="particular"${c.type==='particular'?' selected':''}>PARTICULAR</option><option value="empresa"${c.type==='empresa'?' selected':''}>EMPRESA</option></select></label>
   <label>N.º DE IDENTIFICACIÓN (OPCIONAL)<input id="clIdent" type="text" maxlength="30" autocomplete="off" spellcheck="false" placeholder="Ej.: 4821-SD" value="${esc(c.ident||'')}"></label>
   <label>TELEGRAMA<input id="clTel" type="text" maxlength="10" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Ej.: JS-458" value="${esc(c.telegram||'')}"></label>
   <div class="dir-sec-title">ARMAS VENDIDAS · NÚMEROS DE SERIE (<span id="serCount">${serieRows(c).filter(r=>r.s).length}</span>/${MAX_SERIES})</div>
   <p class="bk-note" style="margin:0 0 8px">No es obligatorio. Al escribir un número aparece otro hueco, hasta ${MAX_SERIES}. Al lado puedes indicar qué arma es.</p>
   <div id="serList">${serieRows(c).map((r,i)=>serieRowHTML(r,i)).join('')}</div>
   <div class="dir-sec-title">PRECIOS ESPECIALES (${pk.length})</div>
   ${pk.map(n=>`<div class="price-row"><span class="nm">${esc(n)}</span><div style="display:flex;gap:6px;align-items:center"><b>${money(Math.round(c.precios[n]*100))}</b><div class="emp-btns"><button type="button" class="warn" data-dir="cl-pdel:${encodeURIComponent(n)}">✕</button></div></div></div>`).join('')||'<div class="enc-empty">Sin precios especiales: paga los precios normales.</div>'}
   <label style="margin-top:10px">PRODUCTO<select id="clProd"><option value="">Seleccionar…</option>${inputs.map(i=>`<option value="${esc(i.dataset.name)}">${esc(i.dataset.name)}</option>`).join('')}</select></label>
   <label>PRECIO ESPECIAL ($)<div class="money"><i>$</i><input id="clPrice" inputmode="decimal" placeholder="0.00"></div></label>
   <div class="enc-actions"><button type="button" data-dir="cl-padd">AÑADIR PRECIO ESPECIAL</button></div>
   <div class="pay-err" id="clErr" hidden></div>
   <div class="enc-actions two" style="margin-top:10px"><button type="button" data-dir="cl-cancel">Cancelar</button><button type="button" class="primary" data-dir="cl-save">GUARDAR CLIENTE</button></div></div>`;
 }
 const q=norm(clQ), list=clientes.filter(c=>!q||norm(c.name).includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'es'));
 return `<div class="enc-actions two" style="margin-bottom:8px"><button type="button" class="primary" data-dir="cl-new">AÑADIR CLIENTE</button><button type="button" data-dir="cl-paste">📋 DESDE UN MENSAJE</button></div>
  <input class="dir-search" type="text" data-clq="1" placeholder="⌕  Buscar cliente…" value="${esc(clQ)}" autocomplete="off">`+(list.length?list.map(c=>`<div class="enc-card dir-item"><div class="t">${esc(c.name)}</div><div class="it">${c.type==='empresa'?'EMPRESA':'PARTICULAR'}${c.telegram?' · Telegrama '+esc(c.telegram):''}${Object.keys(c.precios||{}).length?' · '+Object.keys(c.precios).length+' precios especiales':''}${(c.series||[]).length?' · '+c.series.length+' '+((c.series.length===1)?'arma registrada':'armas registradas'):''}</div><div class="enc-actions emp3"><button type="button" class="primary" data-dir="cl-view:${esc(c.id)}">FICHA</button><button type="button" data-dir="cl-edit:${esc(c.id)}">EDITAR</button><button type="button" class="warn" data-dir="cl-del:${esc(c.id)}">ELIMINAR</button></div></div>`).join(''):'<div class="enc-empty">No hay clientes guardados.<br>Se añaden solos al finalizar ventas con un nombre de cliente.</div>');
}
function saveClient(){
 const err=t=>{const e=document.getElementById('clErr');e.textContent=t;e.hidden=false;e.scrollIntoView({block:'nearest'})}, name=clWork.name.trim().replace(/\s+/g,' ');
 if(!name)return err('Escribe el nombre del cliente');
 if(clientes.some(x=>x.id!==clEdit&&norm(x.name)===norm(name)))return err('Ya existe un cliente con ese nombre');
 if(!clWork.telegram)return err('Escribe el telegrama del cliente');
 const S=(clWork.series||[]).map(r=>({s:String(r.s||'').trim(),a:r.a||''}));
 const bad=S.find(r=>!r.s&&r.a); if(bad)return err('Falta el número de serie de «'+bad.a+'»');
 const seen={};for(const r of S.filter(r=>r.s)){if(seen[r.s])return err('El número de serie '+r.s+' está repetido');seen[r.s]=1}
 clWork.name=name;clWork.ident=String(clWork.ident||'').trim();clWork.series=S.filter(r=>r.s).slice(0,MAX_SERIES);
 let id=clEdit;
 if(clEdit==='new'){id='c'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);clientes.push(Object.assign({id:id},clWork))}
 else{const k=clientes.findIndex(x=>x.id===clEdit);if(k>=0)clientes[k]=Object.assign({},clientes[k],clWork)}
 pzMsg=null;pzOpen='';saveClientes();refreshClientList();clEdit=null;if(clView)clView=id;calc(false);renderDir();say('Cliente guardado');
 publishClient(id);
}
async function delClient(id){
 const c=clientes.find(x=>x.id===id); if(!c)return;
 if(!await askConfirm('Eliminar cliente',`«${c.name}» y sus precios especiales se borrarán.`,'Eliminar'))return;
 const pos=clientes.indexOf(c);
 clientes=clientes.filter(x=>x.id!==id);if(clView===id)clView=null;saveClientes();refreshClientList();calc(false);renderDir();
 /* Discord espera a que pase el tiempo de «Deshacer» */
 const tm=c.dc?setTimeout(()=>discordCard('clientes',clientText(c,'CLIENTE ELIMINADO'),c.dc,true),5800):0;
 say('Cliente eliminado',undefined,()=>{clearTimeout(tm);if(!clientes.some(x=>x.id===c.id)){clientes.splice(Math.min(pos,clientes.length),0,c);saveClientes();refreshClientList();calc(false)}if(!dirModal.hidden)renderDir();say('Cliente recuperado')});
}
function addClientPrice(){
 const err=t=>{const e=document.getElementById('clErr');e.textContent=t;e.hidden=false}, prod=document.getElementById('clProd').value, v=parsePrice(document.getElementById('clPrice').value);
 if(!prod)return err('Selecciona el producto');
 if(v===null||v<=0)return err('Introduce un precio mayor que 0');
 clWork.precios=clWork.precios||{};clWork.precios[prod]=v;renderDir();
}
/* --- Cierre de caja --- */
let ccCount='';
function cierreDoc(c){
 const line='────────────────────';
 return ['HARRINGTON GUNSMITH','CIERRE DE CAJA','Saint Denis · 1880','','Día: '+c.date+' · '+c.time,'',line,'Ingresos cobrados: '+money(c.ing),'Gastos: '+money(c.gas),'Esperado en caja: '+sgn(c.exp),'Dinero contado: '+money(c.count),'DIFERENCIA: '+sgn(c.diff)+(c.diff===0?' (cuadra)':c.diff>0?' (sobra)':' (falta)'),line,'','El precio de un apellido.'].join('\n');
}
function renderModCierre(){
 const t=todayNum(), a=accounts({s:t,e:t}), exp=a.ing-a.gas, cnt=parseMoney(ccCount), diff=cnt-exp;
 const cs=loadLog(KEY_CIERRES).slice().reverse().slice(0,15);
 return `<div class="dir-sec-title" style="margin-top:0">CAJA DE HOY · ${dayStr(t)}</div>
  <div class="enc-card dir-item"><div class="enc-money"><span>Ingresos cobrados: <b>${money(a.ing)}</b></span><span>Gastos: <b>${money(a.gas)}</b></span></div><div class="brow due"><span>ESPERADO EN CAJA</span><span class="${exp<0?'neg':''}">${sgn(exp)}</span></div></div>
  <div class="dir-form enc-sec"><label>DINERO CONTADO ($)<div class="money"><i>$</i><input id="ccCount" inputmode="decimal" placeholder="0.00" autocomplete="off" value="${esc(ccCount)}"></div></label>
  <div class="brow due"><span>DIFERENCIA</span><span id="ccDiff" class="${ccCount&&diff<0?'neg':''}">${ccCount?sgn(diff):'—'}</span></div>
  <div class="enc-actions" style="margin-top:8px"><button type="button" class="primary" data-dir="cc-save">GUARDAR CIERRE</button></div></div>
  <div class="dir-sec-title">CIERRES ANTERIORES</div>`+(cs.length?cs.map(c=>`<div class="enc-card dir-item"><div class="t">${esc(c.date)} · ${esc(c.time)}</div><div class="it">Esperado ${sgn(c.exp)} · Contado ${money(c.count)}</div><div class="brow due"><span>DIFERENCIA</span><span class="${c.diff<0?'neg':''}">${sgn(c.diff)}</span></div><div class="enc-actions two"><button type="button" class="primary" data-dir="cc-dl:${esc(c.id)}">DESCARGAR</button><button type="button" data-dir="cc-cp:${esc(c.id)}">COPIAR PARA DISCORD</button></div></div>`).join(''):'<div class="enc-empty">Todavía no hay cierres guardados.</div>');
}
function saveCierre(){
 if(!ccCount)return say('Escribe el dinero contado');
 const t=todayNum(), a=accounts({s:t,e:t}), exp=a.ing-a.gas, cnt=parseMoney(ccCount), now=Date.now();
 const c={id:'k'+now.toString(36),day:t,date:fmtDate(now),time:fmtTime(now),ing:a.ing,gas:a.gas,exp:exp,count:cnt,diff:cnt-exp};
 const arr=loadLog(KEY_CIERRES);arr.push(c);store.set(KEY_CIERRES,JSON.stringify(arr.slice(-400)));cloudPut('cierre:'+c.id,c);
 ccCount='';renderDir();say('Cierre guardado');discordSend('cierres',cierreDoc(c));
}
/* --- Discord --- */
function renderModDiscord(){
 const E=[['ventas','Ventas: ticket al finalizar y registro semanal (solo los jueves a las 22:00, o al pulsar «Enviar a Discord»)'],['encargos','Encargos: creación, entrega y cancelación (con el ticket)'],['fichajes','Fichajes de entrada y salida'],['gastos','Gastos: al guardarlos y registro semanal (solo los jueves a las 22:00, o al pulsar «Enviar a Discord»)'],['balance','Balance de cuentas semanal (solo los jueves a las 22:00, o al pulsar «Enviar a Discord»)'],['pedidos','Pedidos a proveedores: al emitirlos, completarlos o cancelarlos'],['empleados','Empleados: imagen del contrato al incorporar a alguien'],['clientes','Clientes: ficha al crearlo, se actualiza al modificarlo'],['proveedores','Proveedores: ficha y lista de precios, se actualiza al modificarla'],['stock','Stock de productos: un mensaje que se actualiza en tiempo real (ventas, fabricación, anulaciones)'],['materiales','Almacén de materiales: un mensaje que se actualiza en tiempo real (pedidos recibidos y fabricación)'],['resumen','Resumen del día: al fichar la salida el último empleado'],['ausencias','Ausencias: cuando alguien avisa, vuelve o la anula (con el motivo)'],['sueldos','Sueldos: resumen de toda la semana al pagar el último sueldo'],['anulaciones','Anulaciones de ventas'],['cierres','Cierres de caja']];
 return `<p class="bk-note">Cada tipo de aviso puede ir a su <b>propio canal</b>: crea un webhook por canal y pégalo en «canal propio». Los que dejes vacíos usan el <b>canal general</b>. Se configura una vez en cada dispositivo (o importa la «configuración» desde Copia de seguridad).</p>
  <div class="dir-form enc-sec"><label>CANAL GENERAL (POR DEFECTO)<input id="whUrl" type="text" autocomplete="off" spellcheck="false" placeholder="https://discord.com/api/webhooks/..." value="${esc(webhook.url)}"></label>
  ${E.map(([k,l])=>`<div class="wh-row"><label class="chk"><input type="checkbox" data-ev="${k}"${webhook.ev[k]?' checked':''}>${l}</label><input class="wh-own" type="text" data-whu="${k}" autocomplete="off" spellcheck="false" placeholder="Canal propio (opcional): https://discord.com/api/webhooks/..." value="${esc(webhook.urls[k]||'')}"></div>`).join('')}
  <div class="pay-err" id="whErr" hidden></div>
  <div class="enc-actions two" style="margin-top:8px"><button type="button" class="primary" data-dir="wh-save">GUARDAR</button><button type="button" data-dir="wh-test">PROBAR ENVÍO</button></div></div>
  <p class="bk-note">Estado: ${webhook.url||Object.keys(webhook.urls).some(k=>webhook.urls[k])?'configurado':'sin configurar (no se envía nada)'}. «Probar envío» manda un mensaje de prueba a cada canal distinto.</p><p class="bk-note">Los registros semanales de <b>ventas</b>, <b>gastos</b> y el <b>balance</b> (semana de viernes a jueves) se envían <b>solos cada jueves a las 22:00</b> (hora española), cada uno a su canal: los manda el primer móvil que tenga la web abierta o la abra a partir de esa hora, y nunca salen repetidos. Desmarca su casilla si no los quieres.</p>`;
}
function saveWebhookForm(silent){
 const url=document.getElementById('whUrl').value.trim(), err=document.getElementById('whErr'), own={};
 if(url&&!WH_RE.test(url)){err.textContent='El canal general no parece un webhook de Discord';err.hidden=false;return false}
 for(const i of document.querySelectorAll('[data-whu]')){const v=i.value.trim();if(v&&!WH_RE.test(v)){err.textContent='El canal propio de «'+i.dataset.whu+'» no parece un webhook de Discord';err.hidden=false;return false}if(v)own[i.dataset.whu]=v}
 webhook.url=url;webhook.urls=own;document.querySelectorAll('[data-ev]').forEach(c=>{webhook.ev[c.dataset.ev]=c.checked});
 store.set(KEY_WEBHOOK,JSON.stringify(webhook));if(!silent)say(url||Object.keys(own).length?'Discord configurado':'Discord desactivado');return true;
}
function testWebhooks(){
 if(!saveWebhookForm(true))return;
 const NAMES={ventas:'ventas',encargos:'encargos',fichajes:'fichajes',gastos:'gastos',balance:'balance de cuentas',pedidos:'pedidos',empleados:'contratos de empleados',clientes:'clientes',proveedores:'proveedores',stock:'stock',materiales:'materiales',resumen:'resumen del día',ausencias:'ausencias',sueldos:'sueldos',anulaciones:'anulaciones',cierres:'cierres'}, dest={};
 if(webhook.url)dest[webhook.url]=['canal general'];
 Object.keys(webhook.urls).forEach(k=>{(dest[webhook.urls[k]]=dest[webhook.urls[k]]||[]).push(NAMES[k])});
 const urls=Object.keys(dest); if(!urls.length)return say('Pega primero un enlace de webhook');
 urls.forEach(u=>discordSend('ventas','Prueba de conexión desde Harrington Gunsmith ✔\nAvisos de este canal: '+dest[u].join(', '),null,null,true,u));
}
/* --- Resetear datos de operación --- */
const RESET_OPTS=[['ventas','Ventas (registro de ventas, balance y numeración de tickets)',1],['encargos','Encargos (pendientes y entregados)',1],['gastos','Gastos',1],['pedidos','Pedidos a proveedores (pendientes y completados)',1],['cierres','Cierres de caja',1],['fichajes','Fichajes (registros horarios, fichados ahora y ausencias)',1],['movimientos','Historial de movimientos de stock',1],['stock','Existencias de stock de productos (poner todo a 0)',0],['materiales','Almacén de materiales (poner todo a 0)',0]];
function renderModReset(){
 return `<p class="bk-note">Borra para siempre, en <b>todos los dispositivos</b>, los datos de operación que marques. <b>No se toca</b>: empleados, clientes, convenios y ofertas, precios y productos, Discord, mínimos de stock ni las contraseñas. El balance de cuentas queda a cero al borrar las ventas y los gastos.</p>
  <div class="dir-form enc-sec">${RESET_OPTS.map(o=>`<label class="chk"><input type="checkbox" data-rs="${o[0]}"${o[2]?' checked':''}>${o[1]}</label>`).join('')}
  <label class="chk"><input type="checkbox" id="rsBackup" checked>Descargar antes una copia de seguridad de este dispositivo</label>
  <label>ESCRIBE «RESETEAR» PARA CONFIRMAR<input id="rsWord" type="text" autocomplete="off" autocapitalize="characters" placeholder="RESETEAR"></label>
  <div class="enc-actions"><button type="button" class="warn" data-dir="rs-do">RESETEAR DATOS</button></div></div>`;
}
async function doReset(){
 const what=Array.prototype.map.call(dirModal.querySelectorAll('[data-rs]:checked'),c=>c.dataset.rs);
 if(!what.length)return say('Marca qué quieres resetear');
 if((document.getElementById('rsWord').value||'').trim().toUpperCase()!=='RESETEAR')return say('Escribe RESETEAR para confirmar');
 const names=RESET_OPTS.filter(o=>what.indexOf(o[0])>=0).map(o=>o[1].split(' (')[0].toLowerCase());
 if(!await askConfirm('Resetear datos','Se borrarán para siempre en TODOS los dispositivos: '+names.join(', ')+'.','Resetear'))return;
 if(document.getElementById('rsBackup').checked)downloadBackup(false);
 try{
  const prefixes=[];what.forEach(w=>(RESET_TYPES[w]||[]).forEach(x=>prefixes.push(x)));
  for(const pf of prefixes){const r=await sbFetch('/rest/v1/datos?clave=like.'+encodeURIComponent(pf+'*'),{method:'DELETE'});if(!r.ok)throw new Error(r.status)}
  if(what.indexOf('ventas')>=0){const r=await sbFetch('/rest/v1/contador?id=eq.1',{method:'PATCH',body:JSON.stringify({valor:0})});if(!r.ok)throw new Error(r.status)}
  if(what.indexOf('stock')>=0){const r=await sbFetch('/rest/v1/stock?producto=not.like.mat:*',{method:'PATCH',body:JSON.stringify({cantidad:0})});if(!r.ok)throw new Error(r.status)}
  if(what.indexOf('materiales')>=0){const r=await sbFetch('/rest/v1/stock?producto=like.mat:*',{method:'PATCH',body:JSON.stringify({cantidad:0})});if(!r.ok)throw new Error(r.status)}
  const stamp=new Date().toISOString();
  const r=await sbFetch('/rest/v1/datos?on_conflict=clave',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{clave:'reset',valor:{what:what,n:Date.now()},actualizado:stamp},{clave:'rev',valor:{n:Date.now()+'-r'},actualizado:stamp}])});
  if(!r.ok)throw new Error(r.status);
  cloud.resetSeen=Date.parse(stamp);try{localStorage.setItem('harrington_reset_seen',String(cloud.resetSeen))}catch(e){}
 }catch(e){return say('No se pudo completar el reseteo: sin conexión con la nube. Vuelve a intentarlo.')}
 wipeLocal(what);
 if(what.indexOf('stock')>=0||what.indexOf('materiales')>=0){try{await refreshStock()}catch(e){}if(what.indexOf('stock')>=0){invLast.stock='Reseteo';invSchedule('stock')}if(what.indexOf('materiales')>=0){invLast.materiales='Reseteo';invSchedule('materiales')}}
 cloud.since='';try{localStorage.removeItem('harrington_cloud_since')}catch(e){}
 say('Datos reseteados');renderDir();
}
/* --- Nube (Supabase) --- */
const CLOUD_LABELS={empleados:'Empleados',clientes:'Clientes',descuentos:'Convenios y ofertas',precios:'Precios editados',productos:'Productos nuevos',discord:'Discord',stockmin:'Mínimos de stock',proveedores:'Proveedores',recetas:'Recetas de fabricación',jefe:'Contraseña del jefe'};
function renderModNube(){
 const st=cloud.ok===null?'comprobando…':cloud.ok?'conectado':'sin conexión', last=cloud.last?fmtTime(cloud.last):'—';
 const rows=Object.keys(CLOUD_LABELS).map(c=>`<div class="reg-line"><span>${CLOUD_LABELS[c]}</span><b class="${cloud.dirty[c]?'zero':''}">${cloud.dirty[c]?'pendiente de subir':(cloud.stamps[c]?'sincronizado':'solo en este dispositivo')}</b></div>`).join('');
 return `<p class="bk-note">Todo se comparte entre los dispositivos: la configuración (lo de abajo), el stock, las ventas, los encargos, los fichajes, los gastos y los cierres. Lo que cambie un móvil aparece en los demás en pocos segundos.</p>
  <div class="enc-card dir-item"><div class="enc-money"><span>Estado: <b class="${cloud.ok?'':'neg'}">${st}</b></span><span>Última comprobación: ${last}</span></div></div>
  <div class="dir-sec-title">DATOS COMPARTIDOS</div>${rows}
  <div class="enc-actions" style="margin-top:12px"><button type="button" class="primary" data-dir="nb-up">SUBIR MIS DATOS A LA NUBE</button><button type="button" data-dir="nb-sync">SINCRONIZAR AHORA</button><button type="button" class="warn" data-dir="nb-down">BAJAR LA NUBE A ESTE DISPOSITIVO</button></div>
  <p class="bk-note" style="margin-top:10px">«Subir» envía a la nube lo que hay en este dispositivo y sustituye lo que hubiera allí. Hazlo una sola vez desde el dispositivo que tiene los datos buenos. Las ventas, el stock, los encargos, los fichajes, los gastos y los cierres también están en la nube y se comparten solos.</p>`;
}
async function nubeUp(){
 if(!await askConfirm('Subir a la nube','Los datos de este dispositivo sustituirán a la configuración y al stock de la nube, y se añadirán sus ventas, encargos, gastos y fichajes.','Subir'))return;
 say('Subiendo a la nube…');
 cloud.joined=true;try{localStorage.setItem('harrington_cloud_joined','1')}catch(e){}
 try{
  await cloudUploadAll();
  const isoOf=e=>/^\d\d\/\d\d\/\d{4}$/.test(e.date||'')?`${e.date.slice(6)}-${e.date.slice(3,5)}-${e.date.slice(0,2)}T${e.time||'00:00'}:00.000Z`:new Date(0).toISOString();
  const sales=loadLog(KEY_SALELOG).map(e=>Object.assign(e,{ts:e.ts||isoOf(e)}));store.set(KEY_SALELOG,JSON.stringify(sales));sales.forEach(e=>cloudPut('venta:'+e.id,e));
  const tu=loadLog(KEY_SHIFTLOG).map(e=>Object.assign(e,{uid:e.uid||'t'+(e.start||0).toString(36)+'-'+String(e.name||'').slice(0,4)}));store.set(KEY_SHIFTLOG,JSON.stringify(tu));tu.forEach(e=>cloudPut('turno:'+e.uid,e));
  const mv=loadLog(KEY_STOCKLOG).map((e,i)=>Object.assign(e,{uid:e.uid||'m'+(e.ts||0).toString(36)+'-'+i}));store.set(KEY_STOCKLOG,JSON.stringify(mv));mv.forEach(e=>cloudPut('mov:'+e.uid,e));
  loadLog(KEY_CIERRES).forEach(e=>cloudPut('cierre:'+e.id,e));
  gastos.forEach(e=>cloudPut('gasto:'+e.id,e));
  encargos.forEach(e=>{cloud.sig['encargo:'+e.id]=JSON.stringify(e);cloudPut('encargo:'+e.id,e)});
  shifts.forEach(e=>cloudPut('fichaje:'+e.empId,e));
  pedidos.forEach(e=>cloudPut('pedido:'+e.id,e));
  ausencias.forEach(e=>cloudPut('ausencia:'+e.id,e));
  const rows=Object.keys(stockMap).map(k=>({producto:k,cantidad:Math.max(0,stockMap[k]|0)}));
  if(rows.length){const r=await sbFetch('/rest/v1/stock?on_conflict=producto',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});if(!r.ok)throw new Error(r.status)}
  const lc=parseInt(store.get(KEY_COUNTER))||0;
  if(lc>0){const r=await sbFetch('/rest/v1/contador?select=valor&id=eq.1'), cur=r.ok?((await r.json())[0]||{}).valor||0:0;if(lc>cur)await sbFetch('/rest/v1/contador?id=eq.1',{method:'PATCH',body:JSON.stringify({valor:lc})})}
  cloudFlushOutbox();cloudRev();
  say('Datos subidos a la nube');
 }catch(e){say('No se pudo subir: sin conexión')}
 setTimeout(()=>renderDir(),1500);
}
async function nubeDown(){
 if(!await askConfirm('Bajar de la nube','Este dispositivo olvidará sus datos propios y se quedará con los de la nube (configuración, ventas, encargos, stock, fichajes…).','Bajar'))return;
 cloud.dirty={};saveDirty();wipeOps();cloud.joined=true;try{localStorage.setItem('harrington_cloud_joined','1')}catch(e){}
 await cloudPoll(true);renderDir();renderClock();updateEncBtn();say('Datos descargados de la nube');
}
/* --- Copia de seguridad --- */
function renderModCopia(){
 const lb=Number(store.get('harrington_lastbackup_v1')||0);
 return `<p class="bk-note">Los datos viven en este dispositivo. Haz una copia de vez en cuando: si se borran los datos del navegador, se pierden.${lb?`<br>Última copia descargada: ${fmtDate(lb)} ${fmtTime(lb)}.`:'<br>Todavía no has descargado ninguna copia.'}</p>
  <div class="enc-actions"><button type="button" class="primary" data-dir="bk-full">DESCARGAR COPIA COMPLETA</button><button type="button" data-dir="bk-config">DESCARGAR CONFIGURACIÓN (PARA OTROS DISPOSITIVOS)</button><button type="button" class="warn" data-dir="bk-restore">RESTAURAR DESDE UN ARCHIVO</button></div>
  <input type="file" id="bkFile" accept=".json,application/json" hidden>
  <p class="bk-note" style="margin-top:10px">La <b>configuración</b> incluye empleados, convenios, clientes, precios, productos nuevos, mínimos de stock y Discord, pero no ventas, stock ni contraseña. Sirve para dejar otro móvil listo en un momento.</p>`;
}
/* Ranking de productos más vendidos */
function topHTML(r){
 const m={};accounts(r).sales.forEach(x=>{if(x.op!=='encargo'&&x.items)x.items.forEach(i=>{m[i.name]=(m[i.name]||0)+i.qty})});
 const t=Object.keys(m).map(n=>[n,m[n]]).sort((a,b)=>b[1]-a[1]).slice(0,5);
 if(!t.length)return '';
 return `<div class="dir-sec-title">PRODUCTOS MÁS VENDIDOS</div>`+t.map((x,i)=>`<div class="reg-line"><span>${i+1}º ${esc(x[0])}</span><b>${x[1]} uds.</b></div>`).join('');
}
function rankingHTML(list){
 const r=list.map(e=>({n:e.name,c:salesSum(e).cash,o:e.sales.length})).filter(x=>x.o).sort((a,b)=>b.c-a.c).slice(0,3);
 if(!r.length)return '';
 return `<div class="enc-card dir-item"><div class="t">RANKING DE LA SEMANA</div>${r.map((x,i)=>`<div class="reg-line"><span><i class="medal m${i+1}" aria-label="${i+1}º">${i+1}</i>${esc(x.n)}</span><b>${money(x.c)}</b></div>`).join('')}</div>`;
}
const MOD_ICONS={
 objetivo:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/>',
 revision:'<path d="M9 4h6v3H9z"/><path d="M7 5H5v15h14V5h-2"/><path d="M8.5 13l2.5 2.5 4.5-5"/>',
 sueldos:'<rect x="3" y="7" width="18" height="11" rx="1.5"/><circle cx="12" cy="12.5" r="2.5"/><path d="M6 10v5M18 10v5"/>',
 ausencias:'<path d="M7 4h10M7 20h10M8 4c0 5 8 5 8 8s-8 3-8 8M16 4c0 5-8 5-8 8s8 3 8 8"/>',
 fabricacion:'<path d="M4 10h11l3-3h2v6h-3l-2 2H9l-1 5H6l1-5H4z"/><path d="M14 7V4M11 7V5"/>',
 convenios:'<path d="M3 12l9-9h8v8l-9 9z"/><circle cx="16" cy="8" r="1.4"/>',
 empleados:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M16 14.2c3 .2 5 2 5 5.2"/>',
 stock:'<path d="M6 4h12c1.5 3 1.5 13 0 16H6C4.5 17 4.5 7 6 4z"/><path d="M5.5 9h13M5.5 15h13"/>',
 regstock:'<rect x="5" y="4" width="14" height="17" rx="1.5"/><path d="M9 4V3h6v1M8.5 10h7M8.5 14h7M8.5 18h4"/>',
 horarios:'<circle cx="12" cy="13" r="7.5"/><path d="M12 8.5V13l3 2M10 3h4M12 3v2.5"/>',
 ventas:'<path d="M5 10h14l1.5 4h-17z"/><rect x="4" y="14" width="16" height="6" rx="1"/><path d="M8 10V6h8v4M8 17h2M13 17h3"/>',
 semanales:'<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M8 17h2M12 17h2"/>',
 gastos:'<path d="M9 4h6l-1 3c3 1.5 5 4.5 5 8 0 3-2.5 5-7 5s-7-2-7-5c0-3.5 2-6.5 5-8z"/><path d="M12 11v6M10 13c0-1.3 4-1.3 4 0s-4 1.3-4 2.7 4 1.4 4 0"/>',
 clientes:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3.1-6.5 7-6.5s7 2.5 7 6.5M16.5 5.5l1.6 1.6 3-3"/>',
 productos:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>',
 cierre:'<rect x="3" y="6" width="18" height="12" rx="1.5"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9v0M18 15v0"/>',
 discord:'<path d="M21 4L3 11l6 2.5L11 20l3-4 4 3z"/><path d="M9 13.5L21 4"/>',
 reset:'<path d="M20 11a8 8 0 10-2.3 6M20 5v6h-6"/>',
 proveedores:'<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
 nuevopedido:'<path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9"/>',
 regpedidos:'<rect x="5" y="4" width="14" height="17" rx="1.5"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4M9 4V3h6v1"/>',
 nube:'<path d="M7 18h10a4 4 0 000-8 6 6 0 00-11.5-1A4.5 4.5 0 007 18z"/>',
 copia:'<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
 balance:'<path d="M12 4v16M7 20h10M5 8h14"/><path d="M5 8l-3 6c0 1.7 6 1.7 6 0zM19 8l-3 6c0 1.7 6 1.7 6 0z"/>'
};
function avisosHTML(){
 const A=[], hoy=todayISO();
 ausNowList().forEach(a=>A.push(['pend',`<b>${esc(a.name)}</b> está ausente ${esc(ausUntil(a))} (${esc(a.cat||'')}).`]));
 ausencias.filter(a=>ausFuture(a)&&a.start-Date.now()<2*86400000).forEach(a=>A.push(['pend',`<b>${esc(a.name)}</b> estará ausente desde el ${esc(ausWhen(a.start))}.`]));
 (()=>{const s=payState();if(s&&s.st==='due'){const n=suePending(s.ws);A.push(['pend',`Día de pago (semana ${esc(sueLab(s.ws))}): quedan <b>${n.length}</b> ${n.length===1?'sueldo':'sueldos'} por pagar (${n.map(e=>esc(e.name)).join(', ')}). Ve a <b>SUELDOS</b>.`])}})();
 longShifts().forEach(x=>A.push(['bad',`<b>${esc(x.name)}</b> lleva ${fmtDuration(x.start,Date.now())} fichado: ¿se le olvidó fichar la salida? Ciérralo en <b>Registros horarios</b>.`]));
 empleados.forEach(e=>{if(e.prueba&&e.inicio<=hoy&&e.prueba>=hoy){const d=Math.round((Date.parse(e.prueba)-Date.parse(hoy))/86400000);A.push(['pend',`El periodo de prueba de <b>${esc(e.name)}</b> termina ${d===0?'hoy':d===1?'mañana':'el '+fmtISO(e.prueba)}.`])}});
 pendingEncs().filter(x=>x.promise&&x.promise<hoy).forEach(x=>A.push(['bad',`Encargo de <b>${esc(x.client)}</b> vencido desde el ${fmtISO(x.promise)}.`]));
 pendingPed().filter(p=>!p.received&&Date.now()-p.ts>3*86400000).forEach(p=>A.push(['pend',`El pedido ${esc(p.code)} a <b>${esc(p.proveedor)}</b> lleva ${ago(p.ts).replace('hace ','')} sin recibirse.`]));
 lowMats().forEach(n=>A.push(['bad',`Material bajo mínimo: <b>${esc(n)}</b> (quedan ${stockMap[matKey(n)]||0}).`]));
 stockForecast().slice(0,3).forEach(f=>A.push(['pend',`<b>${esc(f.n)}</b> se acaba en unos ${Math.max(1,Math.round(f.days))} días al ritmo de ventas (quedan ${f.q}).`]));
 lowStock().forEach(n=>A.push(['bad',`Stock bajo: <b>${esc(n)}</b> (quedan ${stockMap[n]||0}).`]));
 if(!A.length)return '';
 return `<div class="dir-sec-title">AVISOS (${A.length})</div><div class="avisos">`+A.slice(0,12).map(a=>`<div class="aviso ${a[0]}">${a[1]}</div>`).join('')+(A.length>12?`<div class="aviso">y ${A.length-12} más…</div>`:'')+'</div>';
}
function renderDashboard(){
 const t=todayNum(), a=accounts({s:t,e:t}), pe=pendingEncs(), notify=pe.filter(e=>e.fab==='FABRICADO'&&!e.avisado).length, low=lowStock();
 const card=(k,v,sub,cls)=>`<div class="dash-card"><small>${k}</small><b class="${cls||''}">${v}</b><span>${sub||''}</span></div>`;
 const w=weekStart(0);
 return `<div class="dir-sec-title" style="margin-top:0">RESUMEN DE HOY</div><div class="dash">`+
  card('Ventas de hoy',money(a.ing),`${a.ops} ${plural(a.ops,'operación','operaciones')}`)+
  card('Gastos de hoy',money(a.gas),'')+
  card('Beneficio de hoy',sgn(a.ben),'',a.ben<0?'neg':'')+
  card('Encargos',`${pe.length} ${plural(pe.length,'pendiente','pendientes')}`,notify?`${notify} por avisar`:'')+
  card('Stock bajo',low.length?`${low.length} ${plural(low.length,'producto','productos')}`:'Todo en orden','',low.length?'neg':'')+
  card('Fichado ahora',shifts.length?shifts.map(x=>esc(x.name)).join(', '):'Nadie',shifts.length?'en este dispositivo':'en este dispositivo')+
  card('Pedidos',`${pendingPed().length} ${plural(pendingPed().length,'pendiente','pendientes')}`,pendingPed().filter(p=>!p.received).length?pendingPed().filter(p=>!p.received).length+' por recibir':'')+
  card('Materiales',lowMats().length?`${lowMats().length} bajo mínimo`:`${matNames().length} en almacén`,'',lowMats().length?'neg':'')+
  card('Ausentes ahora',ausNowList().length?ausNowList().map(a=>esc(a.name)).join(', '):'Nadie','',ausNowList().length?'neg':'')+
  card('En prueba',(t=>`${t.length} ${plural(t.length,'empleado','empleados')}`)(empleados.filter(e=>e.prueba&&e.prueba>=todayISO()&&e.inicio<=todayISO())),'')+
  `</div>${avisosHTML()}<div class="dir-sec-title">SEMANA ACTUAL</div>${chartSVG({s:w,e:w+6})}<div class="dir-sec-title">HERRAMIENTAS</div>`;
}
/* ===== Discord (webhook), registro de movimientos de stock, copia de seguridad ===== */
const KEY_WEBHOOK='harrington_webhook_v1', KEY_STOCKLOG='harrington_stocklog_v1', KEY_CIERRES='harrington_cierres_v1', KEY_PRICES='harrington_prices_v1', KEY_CUSTPROD='harrington_custprod_v1';
let webhook=loadObj(KEY_WEBHOOK,{});
var EV_DEF={ventas:true,encargos:true,fichajes:true,gastos:true,anulaciones:true,cierres:true,balance:true,pedidos:true,empleados:true,clientes:true,proveedores:true,stock:true,materiales:true,resumen:true,ausencias:true,sueldos:true};
webhook=Object.assign({url:''},webhook,{ev:Object.assign({},EV_DEF,webhook.ev||{}),urls:Object.assign({},webhook.urls||{})});
const WH_RE=/^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/;
const KIND_COLOR={ventas:0xC9A24A,encargos:0x9A6B1C,fichajes:0x3F7A52,gastos:0xA8321C,balance:0x1B6A3A,pedidos:0x2E7D4F,empleados:0x7A5A22,clientes:0x3A5A8C,proveedores:0x6B5A2A,stock:0x6B8E23,materiales:0x8B5A2B,anulaciones:0x7A1608,cierres:0xB88931,resumen:0xE0B25C,ausencias:0x5A6E8C,sueldos:0x3E8E4E};
function dcEsc(s){return String(s).replace(/([*_~|`])/g,'\\$1')}
const DC_THUMB={ventas:'icono-revolveres.webp',encargos:'vacio-encargos.webp',pedidos:'vacio-pedidos.webp',materiales:'vacio-materiales.png',stock:'icono-municion.webp',gastos:'moneda-oro.webp',sueldos:'moneda-oro.webp',balance:'moneda-oro.webp',resumen:'moneda-oro.webp',cierres:'moneda-oro.webp',fichajes:'reloj-bolsillo.webp',ausencias:'reloj-bolsillo.webp',empleados:'tarjeta-empleado.webp',clientes:'cartel-se-busca.webp',proveedores:'vacio-pedidos.webp',anulaciones:'sello-pagado.png'};
function dcThumb(k){try{return DC_THUMB[k]&&/^https?:/.test(location.protocol)?new URL(DC_THUMB[k],location.href).href:''}catch(e){return ''}}
function dcIcon(){try{return /^https?:/.test(location.protocol)?new URL('emblema-harrington.png',location.href).href:''}catch(e){return ''}}
/* Convierte el texto de siempre en una tarjeta: 1.ª línea = título; «Clave: valor» en negrita */
const DC_SKIP={'HARRINGTON GUNSMITH':1,'Saint Denis · 1880':1,'El precio de un apellido.':1};
function dcEmbed(kind,text,img){
 const L=String(text).split('\n').filter(l=>!DC_SKIP[l.trim()]&&!/^─{4,}$/.test(l.trim()));
 while(L.length&&!L[0].trim())L.shift();
 const title=L.shift()||'Harrington Gunsmith';
 const desc=L.join('\n').replace(/^\n+/,'').replace(/\n{3,}/g,'\n\n').split('\n').map(l=>{const m=/^(\s*)([^:·$]{2,42}):\s(.+)$/.exec(l);return m?m[1]+'**'+dcEsc(m[2])+':** '+dcEsc(m[3]):dcEsc(l)}).join('\n');
 const e={title:title.slice(0,250),description:(desc.length>3900?desc.slice(0,3890)+'…':desc)||'\u200b',color:KIND_COLOR[kind]||0xC9A24A,footer:{text:'Harrington Gunsmith · Saint Denis · 1880'},timestamp:new Date().toISOString()};
 const ic=dcIcon();if(ic)e.footer.icon_url=ic;
 if(img)e.image={url:'attachment://'+img};
 else{const th=dcThumb(kind);if(th)e.thumbnail={url:th}}
 return e;
}
function dcPayload(kind,text,img){const p={username:'Harrington Gunsmith',embeds:[dcEmbed(kind,text,img)]},ic=dcIcon();if(ic)p.avatar_url=ic;return p}
async function discordSend(kind,text,blob,fname,force,urlOverride){
 const url=urlOverride||webhook.urls[kind]||webhook.url;
 if(!url||(!force&&!webhook.ev[kind]))return false;
 try{
  const isImg=!!(blob&&/\.png$/i.test(fname||'')), payload=dcPayload(kind,text,isImg?(fname||'ticket.png'):null);
  let init;
  if(blob){const fd=new FormData();fd.append('payload_json',JSON.stringify(payload));fd.append('files[0]',blob,fname||'ticket.png');init={method:'POST',body:fd}}
  else init={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)};
  const r=await fetch(url,init);
  if(!r.ok)throw new Error(r.status);
  if(force)say('Enviado a Discord');
  return true;
 }catch(e){say('No se pudo enviar a Discord');return false}
}
/* Ficha que se publica una vez y después se EDITA en el mismo mensaje (clientes y proveedores) */
function whKey(u){const m=String(u||'').match(/\/webhooks\/(\d+)\//);return m?m[1]:''}
async function discordCard(kind,text,ref,editOnly){
 const url=webhook.urls[kind]||webhook.url;
 if(!url||!webhook.ev[kind])return ref||null;
 const pl=dcPayload(kind,text,null);
 try{
  if(ref&&ref.id&&ref.w===whKey(url)){
   const u=new URL(url);u.pathname=u.pathname.replace(/\/$/,'')+'/messages/'+ref.id;
   const r=await fetch(u.toString(),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'',embeds:pl.embeds})});
   if(r.ok)return ref;
   if(r.status!==404)throw new Error(r.status);
  }
  if(editOnly)return ref||null;
  const u=new URL(url);u.searchParams.set('wait','true');
  const r=await fetch(u.toString(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pl)});
  if(!r.ok)throw new Error(r.status);
  const j=await r.json();
  return j&&j.id?{id:String(j.id),w:whKey(url)}:(ref||null);
 }catch(e){say('No se pudo publicar en Discord');return ref||null}
}
function logStock(name,delta,why){
 if(!delta)return;
 const a=loadLog(KEY_STOCKLOG), now=Date.now();
 const rec={uid:'m'+now.toString(36)+Math.random().toString(36).slice(2,5),ts:now,name:name,delta:delta,why:why,date:fmtDate(now),time:fmtTime(now)};a.push(rec);
 store.set(KEY_STOCKLOG,JSON.stringify(a.slice(-800)));cloudPut('mov:'+rec.uid,rec);
}
var bossTimer=null;
function bumpBoss(){clearTimeout(bossTimer);if(bossActive&&!(typeof meEmp==='function'&&isJefe(meEmp())))bossTimer=setTimeout(()=>{setBoss(false);closeModal(dirModal);say('Modo Jefe cerrado por inactividad')},300000)}
['click','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{if(bossActive)bumpBoss()},{passive:true}));
function allHKeys(){const k=[];for(let i=0;i<localStorage.length;i++){const n=localStorage.key(i);if(n&&n.indexOf('harrington_')===0&&n!==KEY_BOSS_ACTIVE&&n!=='harrington_cloud_dirty'&&n!=='harrington_cloud_outbox'&&n!=='harrington_cloud_since'&&n!=='harrington_reset_seen'&&n!=='harrington_cloud_joined'&&n!=='harrington_prejoin_backup')k.push(n)}return k}
const CONFIG_KEYS=[KEY_EMP,KEY_DISC,KEY_CUSTPROD,KEY_PRICES,KEY_CLIENTES,KEY_WEBHOOK,KEY_STOCKMIN,'harrington_proveedores_v1','harrington_recetas_v1'];
function downloadBackup(onlyConfig){
 const o={};(onlyConfig?CONFIG_KEYS:allHKeys()).forEach(k=>{const v=store.get(k);if(v!=null)o[k]=v});
 const now=Date.now(), data={app:'harrington',version:1,type:onlyConfig?'config':'completa',date:now,keys:o};
 const blob=new Blob([JSON.stringify(data)],{type:'application/json'}), a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download=`Harrington_${onlyConfig?'configuracion':'copia_completa'}_${fmtDate(now).replace(/\//g,'-')}.json`;
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
 store.set('harrington_lastbackup_v1',String(now));
 say(onlyConfig?'Configuración descargada':'Copia completa descargada');
}
async function restoreBackup(file){
 try{
  const d=JSON.parse(await file.text());
  if(!d||d.app!=='harrington'||!d.keys)throw new Error('formato');
  const n=Object.keys(d.keys).length;
  if(!await askConfirm('Restaurar copia',`Se cargarán ${n} bloques de datos (${d.type==='config'?'solo configuración':'copia completa'}) y se sobrescribirá lo que haya en este dispositivo.`,'Restaurar'))return;
  if(d.type!=='config')allHKeys().forEach(k=>{if(k!==KEY_BOSS_PW&&k!==KEY_BOSS_WORD||d.keys[k]!=null)store.remove(k)});
  Object.keys(d.keys).forEach(k=>{if(k.indexOf('harrington_')===0)store.set(k,d.keys[k])});
  say('Datos restaurados · recargando…');setTimeout(()=>location.reload(),800);
 }catch(e){say('El archivo no es una copia válida')}
}
/* ===== Pedidos a proveedores ===== */
per.p={mode:'dia',off:0};
let pvEdit=null, pvDraft={name:'',tel:'',tipo:'',ubic:'',prods:[]}, npDraft={prov:'',rows:[{m:'',q:'',p:''}],paid:'0',lq:{}};
const MAX_PPROD=40;
const pedBtn=document.getElementById('pedBtn'), pedModal=document.getElementById('pedModal');
let pedView=null, pedDraft=null;
function pendingPed(){return pedidos.filter(x=>!x.completedAt&&!x.cancelled)}
function updatePedBtn(){const n=pendingPed().length;pedBtn.innerHTML=ICO_PED+(n?`PEDIDOS (${n})`:'PEDIDOS')}
const ICO_AUS='<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10M7 20h10M8 4c0 5 8 5 8 8s-8 3-8 8M16 4c0 5-8 5-8 8s8 3 8 8"/></svg>';
function savePed(rec){
 const k=pedidos.findIndex(x=>x.id===rec.id);
 if(k>=0)pedidos[k]=rec;else pedidos.push(rec);
 pedidos.sort((a,b)=>(a.ts||0)-(b.ts||0));
 store.set(KEY_PEDIDOS,JSON.stringify(pedidos));cloudPut('pedido:'+rec.id,rec);updatePedBtn();
}
function pedidoText(r,title){
 const L=[title,'Pedido: '+r.code,'Proveedor: '+r.proveedor+(r.proveedorTipo?' ('+r.proveedorTipo+')':'')];
 if(r.proveedorTel)L.push('Telegrama: '+r.proveedorTel);
 L.push('Fecha: '+r.date+' '+r.time,'','Materiales:');
 r.items.forEach(x=>L.push(`  ${x.qty} × ${x.material} · ${money(x.price)} = ${money(x.qty*x.price)}`));
 L.push('','TOTAL: '+money(r.totalCents),'Pagado: '+(r.paid?'SÍ':'NO')+(r.paidBy?' ('+r.paidBy+')':'')+' · Recibido: '+(r.received?'SÍ':'NO')+(r.receivedBy?' ('+r.receivedBy+')':''));
 return L.join('\n');
}
function pedBadges(x){return `<span class="badge ${x.received?'fab':'pend'}">${x.received?'RECIBIDO':'POR RECIBIR'}</span><span class="badge ${x.paid?'si':'no'}">${x.paid?'PAGADO':'NO PAGADO'}</span>`}
function renderPed(){
 const body=document.getElementById('pedBody'), title=document.getElementById('pedTitle');
 const x=pedView?pendingPed().find(p=>p.id===pedView):null;
 if(!x){
  pedView=null;pedDraft=null;
  const list=pendingPed().slice().reverse();
  title.textContent=`PEDIDOS PENDIENTES (${list.length})`;
  body.innerHTML=list.length?list.map(p=>`<button type="button" class="enc-card" data-popen="${esc(p.id)}"><div class="t">${esc(p.proveedor)}${p.proveedorTipo?' · '+esc(p.proveedorTipo):''}</div><div class="it">${p.items.slice(0,3).map(i=>`${esc(i.material)} ×${i.qty}`).join(', ')}${p.items.length>3?' y '+(p.items.length-3)+' más':''}</div><div class="enc-money"><span>${esc(p.code)}</span><span>Total: ${money(p.totalCents)}</span></div><div class="badges">${pedBadges(p)}<span class="ago">${ago(p.ts)}</span></div></button>`).join(''):'<div class="enc-empty">'+emptyArt('crate')+'No hay pedidos pendientes.<br>Los pedidos a proveedores que emita el jefe aparecen aquí.</div>';
  return;
 }
 title.textContent='PEDIDO A PROVEEDOR';
 if(!pedDraft||pedDraft.id!==x.id)pedDraft={id:x.id,received:!!x.received,paid:!!x.paid,oRec:!!x.received,oPaid:!!x.paid,emp:meEmp()?meEmp().id:empleados.some(e=>e.id===store.get(KEY_EMPLOYEE))?store.get(KEY_EMPLOYEE):''};
 body.innerHTML=`<button type="button" class="enc-back" data-pact="back">◂ Volver a la lista</button>
  <div class="albaran"><div class="alb-h">ALBARÁN DE PEDIDO</div>
  <div class="enc-id">${esc(x.code)} · ${esc(x.date)} ${esc(x.time)} · ${ago(x.ts)}</div>
  <div class="enc-kv"><div class="full"><span>Proveedor</span><b>${esc(x.proveedor)}</b></div><div><span>Se dedica a</span><b>${esc(x.proveedorTipo||'—')}</b></div><div><span>Telegrama</span><b>${esc(x.proveedorTel||'—')}</b></div></div>
  <div class="cartrow carthead"><span>Material</span><span>Cant.</span><span>P. unit.</span><span>Subtotal</span></div>${x.items.map(i=>cartRow({name:i.material,qty:i.qty,cents:i.price})).join('')}
  <div class="brow due" style="margin-top:8px"><span>TOTAL</span><span>${money(x.totalCents)}</span></div>
  <div class="alb-stamps">${x.received?'<span class="alb-st ok">RECIBIDO</span>':''}${x.paid?'<span class="alb-st ok">PAGADO</span>':'<span class="alb-st bad">POR PAGAR</span>'}</div></div>
  <div class="badges" style="margin:8px 0">${pedBadges(x)}</div>
  <div class="enc-sec">
   <label>EMPLEADO QUE LO REGISTRA<select id="pdEmp"${meEmp()?' disabled':''}><option value="">Seleccionar empleado</option>${empleados.map(e=>`<option value="${esc(e.id)}"${pedDraft.emp===e.id?' selected':''}>${esc(e.name)}</option>`).join('')}</select></label>
   <label>¿RECIBIDO?<select id="pdRec"${x.received?' disabled':''}><option value="0"${!pedDraft.received?' selected':''}>NO</option><option value="1"${pedDraft.received?' selected':''}>SÍ</option></select></label>
   ${x.received?'<div class="enc-note">Ya recibido: sus materiales ya están en el almacén.</div>':'<div class="enc-note">Al marcarlo como recibido, sus materiales se suman al almacén de MATERIALES.</div>'}
   <label>¿PAGADO?<select id="pdPaid"${x.paidInitial?' disabled':''}><option value="0"${!pedDraft.paid?' selected':''}>NO</option><option value="1"${pedDraft.paid?' selected':''}>SÍ</option></select></label>
   ${x.paidInitial?'<div class="enc-note">Este pedido ya se dejó pagado: no se puede cambiar.</div>':''}
   <div class="enc-note">Cuando esté recibido y pagado, el pedido sale de la lista y pasa a la contabilidad.</div>
  </div>
  <div class="enc-actions"><button type="button" class="gold" data-pact="save">GUARDAR CAMBIOS</button>${bossActive?'<button type="button" class="warn" data-pact="cancel">CANCELAR PEDIDO</button>':''}</div>`;
}
async function savePedido(){
 const x=pendingPed().find(p=>p.id===pedView); if(!x||!pedDraft)return;
 if(!pedDraft.emp)return say('Selecciona el empleado que lo registra');
 if(pedDraft.received===pedDraft.oRec&&pedDraft.paid===pedDraft.oPaid)return say('No hay cambios que guardar');
 let base=x;
 try{ /* se parte de lo último de la nube para no pisar a otro empleado */
  const r=await sbFetch('/rest/v1/datos?select=valor&clave=eq.'+encodeURIComponent('pedido:'+x.id));
  if(!r.ok)throw new Error(r.status);
  const rows=await r.json();if(rows[0]&&rows[0].valor&&!rows[0].valor.deleted)base=rows[0].valor;
 }catch(e){return say('Sin conexión: no se puede actualizar el pedido ahora')}
 if(base.completedAt||base.cancelled){savePed(base);pedView=null;renderPed();return say('Este pedido ya estaba cerrado')}
 const emp=(empleados.find(e=>e.id===pedDraft.emp)||{}).name||'', now=Date.now(), rec=Object.assign({},base);
 if(!base.received&&pedDraft.received!==pedDraft.oRec&&pedDraft.received!==!!base.received){rec.received=pedDraft.received;rec.receivedBy=pedDraft.received?emp:'';rec.receivedAt=pedDraft.received?now:0}
 if(!base.paidInitial&&pedDraft.paid!==pedDraft.oPaid&&pedDraft.paid!==!!base.paid){rec.paid=pedDraft.paid;rec.paidBy=pedDraft.paid?emp:'';rec.paidAt=pedDraft.paid?now:0}
 let done=false;
 if(rec.received&&!base.received){ /* entra la mercancía: se suma al almacén de materiales */
  let mine=true;
  try{ /* reserva atómica: si dos móviles lo marcan a la vez, solo uno suma los materiales */
   const r=await sbFetch('/rest/v1/datos?on_conflict=clave',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify([{clave:'recibido-'+rec.id,valor:{ts:now,by:emp},actualizado:new Date().toISOString()}])});
   if(!r.ok)throw new Error(r.status);const rows=await r.json();mine=Array.isArray(rows)&&rows.length>0;
  }catch(e){return say('Sin conexión: no se puede registrar la recepción ahora')}
  if(mine){
   const mi={};rec.items.forEach(x=>{const k=matKey(canonMat(x.material));mi[k]=(mi[k]||0)+x.qty});
   const mv=Object.keys(mi).map(k=>({producto:k,delta:mi[k]}));
   try{await moverStock(mv,'Pedido '+rec.code);mv.forEach(x=>logStock(x.producto.slice(4)+' (material)',x.delta,'Pedido '+rec.code))}
   catch(e){sbFetch('/rest/v1/datos?clave=eq.'+encodeURIComponent('recibido-'+rec.id),{method:'DELETE'}).catch(()=>{});return say('Sin conexión: no se puede registrar la recepción ahora')}
   if(!stampImgFx('recibido',2.43))stampFx('RECIBIDO');playChest();
  }
  rec.matIn=true;
 }
 if(rec.received&&rec.paid){rec.completedAt=now;done=true}
 savePed(rec);
 if(done){
  const m=madridParts(now), g={id:'gp'+rec.id,cat:'proveedor',concepto:`Pedido ${rec.code} · ${rec.proveedor}`,cents:rec.totalCents,day:dayNum(+m.year,+m.month,+m.day),date:`${m.day}/${m.month}/${m.year}`,time:`${m.hour}:${m.minute}`,pedido:rec.id};
  if(!gastos.some(y=>y.id===g.id)){gastos.push(g);saveGastos();cloudPut('gasto:'+g.id,g)}
  discordSend('pedidos',pedidoText(rec,'PEDIDO COMPLETADO'));
  pedView=null;say('Pedido completado: pasa a la contabilidad');
 }else say('Pedido actualizado');
 renderPed();
}
async function cancelPedido(id){
 const x=pendingPed().find(p=>p.id===id); if(!x)return;
 if(!await askConfirm('Cancelar pedido','El pedido '+x.code+' a '+x.proveedor+' se cancelará y dejará de estar pendiente.','Cancelar pedido'))return;
 let base=x;
 try{ /* comprobar en la nube que nadie lo ha completado o cancelado ya */
  const r=await sbFetch('/rest/v1/datos?select=valor&clave=eq.'+encodeURIComponent('pedido:'+x.id));
  if(!r.ok)throw new Error(r.status);
  const rows=await r.json();if(rows[0]&&rows[0].valor&&!rows[0].valor.deleted)base=rows[0].valor;
 }catch(e){return say('Sin conexión: no se puede cancelar el pedido ahora')}
 if(base.completedAt||base.cancelled){savePed(base);pedView=null;renderPed();return say('Este pedido ya estaba cerrado')}
 const rec=Object.assign({},base,{cancelled:true,cancelledAt:Date.now()});
 savePed(rec);discordSend('pedidos',pedidoText(rec,'PEDIDO CANCELADO'));
 pedView=null;renderPed();say('Pedido cancelado');
}
pedBtn.onclick=()=>{pedView=null;pedDraft=null;renderPed();openModal(pedModal);pedModal.scrollTop=0};
document.getElementById('pedClose').onclick=()=>closeModal(pedModal);
pedModal.addEventListener('click',e=>{
 if(e.target===pedModal)return closeModal(pedModal);
 const c=e.target.closest('[data-popen]');
 if(c){pedView=c.dataset.popen;pedDraft=null;renderPed();pedModal.scrollTop=0;return}
 const a=e.target.closest('[data-pact]'); if(!a)return;
 if(a.dataset.pact==='back'){pedView=null;pedDraft=null;renderPed()}
 else if(a.dataset.pact==='save')once('ped',savePedido,a);
 else if(a.dataset.pact==='cancel')once('pedc',()=>cancelPedido(pedView),a);
});
pedModal.addEventListener('change',e=>{
 if(!pedDraft)return;
 if(e.target.id==='pdEmp'){pedDraft.emp=e.target.value;if(e.target.value)store.set(KEY_EMPLOYEE,e.target.value)}
 else if(e.target.id==='pdRec')pedDraft.received=e.target.value==='1';
 else if(e.target.id==='pdPaid')pedDraft.paid=e.target.value==='1';
});
updatePedBtn();
/* ===== Ausencias: el empleado avisa de que no podrá entrar; el motivo solo lo ve el jefe ===== */
const ausBtn=document.getElementById('ausBtn'), ausModal=document.getElementById('ausModal');
const AUS_CATS=['Viaje','Trabajo','Estudios','Salud','Asuntos personales','Otro'];
const AUS_UNITS={horas:{t:'Horas',n:12,ms:3600000,s:'hora',p:'horas'},dias:{t:'Días',n:6,ms:86400000,s:'día',p:'días'},semanas:{t:'Semanas',n:4,ms:7*86400000,s:'semana',p:'semanas'},indef:{t:'Sin fecha de vuelta',n:0,ms:0}};
let ausView='list', ausDraft=null;
function ausNew(){return {emp:meEmp()?meEmp().id:empleados.some(e=>e.id===store.get(KEY_EMPLOYEE))?store.get(KEY_EMPLOYEE):'',desde:'ahora',fecha:'',unit:'dias',n:'1',cat:'',motivo:''}}
function madridMidnight(d){let ms=d*86400000;const p=madridParts(ms);return ms-(+p.hour)*3600000-(+p.minute)*60000}
function ausStart(d){const t=todayNum();if(d.desde==='ahora')return Date.now();if(d.desde==='manana')return madridMidnight(t+1);if(d.desde==='pasado')return madridMidnight(t+2);if(d.desde==='fecha'&&/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)){const x=d.fecha.split('-').map(Number);return madridMidnight(dayNum(x[0],x[1],x[2]))}return 0}
function ausEnd(start,unit,n){if(unit==='indef')return 0;return start+(+n||1)*AUS_UNITS[unit].ms}
function ausLen(a){if(a.unit==='indef')return 'sin fecha de vuelta';const u=AUS_UNITS[a.unit];return a.n+' '+(+a.n===1?u.s:u.p)}
function ausWhen(ms){return fmtDate(ms)+' '+fmtTime(ms)}
function ausUntil(a){if(!a.end)return 'sin fecha de vuelta';const t=todayNum(), m=madridParts(a.end), d=dayNum(+m.year,+m.month,+m.day);if(a.unit==='horas'||d===t)return 'hasta las '+fmtTime(a.end)+(d===t?'':' del '+fmtDate(a.end));return 'hasta el '+DIAS_L[new Date(d*86400000).getUTCDay()]+' '+dayStr(d).slice(0,5)}
const DIAS_L=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
function ausActive(a,t){t=t||Date.now();return !a.cancelled&&!a.returned&&a.start<=t&&(!a.end||a.end>t)}
function ausFuture(a){return !a.cancelled&&!a.returned&&a.start>Date.now()}
function ausNowList(){return ausencias.filter(a=>ausActive(a))}
function updateAusBtn(){const n=ausNowList().length;ausBtn.innerHTML=ICO_AUS+(n?`AUSENCIAS (${n})`:'AUSENCIAS')}
function saveAus(rec){const k=ausencias.findIndex(x=>x.id===rec.id);if(k>=0)ausencias[k]=rec;else ausencias.push(rec);ausencias.sort((a,b)=>(a.start||0)-(b.start||0));store.set(KEY_AUS,JSON.stringify(ausencias));cloudPut('ausencia:'+rec.id,rec);updateAusBtn()}
/* Días de ausencia que caen dentro de una semana de las cuentas (viernes a jueves) */
function ausDaysInWeek(name,ws){
 const s=madridMidnight(ws), e=madridMidnight(ws+7);let ms=0;
 ausencias.forEach(a=>{if(a.cancelled||a.name!==name)return;const end=a.returned?(a.returnedAt||a.start):(a.end||Infinity);const o=Math.min(end,e)-Math.max(a.start,s);if(o>0)ms+=o});
 return Math.min(7,Math.round(ms/86400000));
}
/* Horas que se le exigen esa semana: menos de 3 días = todas; 3 o 4 = la mitad; más de 4 = ninguna */
function weekRequired(name,ws){const c=contractH(name);if(!c)return {h:0,d:0};const d=ausDaysInWeek(name,ws);return {h:d>4?0:d>=3?c/2:c,d:d,c:c}}
function renderAus(){
 const body=document.getElementById('ausBody'), title=document.getElementById('ausTitle');
 if(ausView==='form'){
  const d=ausDraft, u=AUS_UNITS[d.unit], st=ausStart(d), en=st?ausEnd(st,d.unit,d.n):0;
  title.textContent='NUEVA AUSENCIA';
  body.innerHTML=`<button type="button" class="enc-back" data-aus="back">◂ Volver</button>
  <div class="dir-form enc-sec">
   <label>EMPLEADO<select id="auEmp"${meEmp()&&!bossActive?' disabled':''}><option value="">Seleccionar empleado</option>${empleados.map(e=>`<option value="${esc(e.id)}"${d.emp===e.id?' selected':''}>${esc(e.name)}</option>`).join('')}</select></label>
   <label>DESDE<select id="auDesde">${[['ahora','Ahora'],['manana','Mañana'],['pasado','Pasado mañana'],['fecha','Otra fecha…']].map(o=>`<option value="${o[0]}"${d.desde===o[0]?' selected':''}>${o[1]}</option>`).join('')}</select></label>
   ${d.desde==='fecha'?`<label>FECHA DE INICIO<input id="auFecha" type="date" value="${esc(d.fecha)}" min="${todayISO()}"></label>`:''}
   <div class="au-two"><label>DURACIÓN<select id="auUnit">${Object.keys(AUS_UNITS).map(k=>`<option value="${k}"${d.unit===k?' selected':''}>${AUS_UNITS[k].t}</option>`).join('')}</select></label>
   ${u.n?`<label>CUÁNTO<select id="auN">${Array.from({length:u.n},(_,i)=>i+1).map(i=>`<option value="${i}"${+d.n===i?' selected':''}>${i} ${i===1?u.s:u.p}</option>`).join('')}</select></label>`:'<div></div>'}</div>
   <label>MOTIVO<select id="auCat"><option value="">Seleccionar…</option>${AUS_CATS.map(c=>`<option${d.cat===c?' selected':''}>${c}</option>`).join('')}</select></label>
   <label>EXPLICA EL MOTIVO<textarea id="auMot" maxlength="300" rows="3" placeholder="Ej.: Me voy de viaje con la familia y no podré conectarme.">${esc(d.motivo)}</textarea></label>
   <div class="enc-note" id="auVuelta">${st?(en?'Vuelve aproximadamente el '+esc(ausWhen(en))+'.':'Sin fecha de vuelta: queda ausente hasta que pulse «He vuelto».'):'Elige la fecha de inicio.'}</div>
   <div class="enc-note">El motivo solo lo ve la dirección. Tus compañeros solo verán que estás ausente y hasta cuándo.</div>
   <div class="pay-err" id="auErr" hidden></div>
   <div class="enc-actions" style="margin-top:8px"><button type="button" class="primary" data-aus="save">CONFIRMAR AUSENCIA</button></div>
  </div>`;
  return;
 }
 const now=ausNowList(), fut=ausencias.filter(ausFuture);
 title.textContent='AUSENCIAS';
 const row=a=>`<div class="enc-card dir-item"><div class="t">${esc(a.name)}</div><div class="it">${ausActive(a)?'Ausente '+esc(ausUntil(a)):'Desde el '+esc(ausWhen(a.start))+' · '+esc(ausLen(a))}</div>${!meEmp()||bossActive||meEmp().id===a.empId?`<div class="enc-actions"><button type="button" data-aus="back-now:${esc(a.id)}">${ausActive(a)?'✓ HE VUELTO':'ANULAR'}</button></div>`:''}</div>`;
 body.innerHTML=`<div class="enc-actions" style="margin-bottom:10px"><button type="button" class="primary" data-aus="new">+ AVISAR DE UNA AUSENCIA</button></div>
  <div class="dir-sec-title" style="margin-top:0">AUSENTES AHORA (${now.length})</div>${now.length?now.map(row).join(''):'<div class="enc-empty">Nadie está ausente ahora.</div>'}
  ${fut.length?`<div class="dir-sec-title">PRÓXIMAS AUSENCIAS (${fut.length})</div>`+fut.map(row).join(''):''}
  <p class="bk-note">Avisa aquí si no vas a poder entrar al servidor durante un tiempo. Si es de 3 o 4 días, esa semana solo te tocan la mitad de tus horas; si es de más de 4 días, quedas exento esa semana.</p>`;
}
function saveAusencia(){
 const d=ausDraft, err=t=>{const e=document.getElementById('auErr');e.textContent=t;e.hidden=false;e.scrollIntoView({block:'nearest'})};
 const emp=empleados.find(e=>e.id===d.emp);
 if(!emp)return err('Selecciona el empleado');
 const st=ausStart(d);if(!st)return err('Elige la fecha de inicio');
 if(!d.cat)return err('Elige el motivo');
 const mot=d.motivo.trim().replace(/\s+/g,' ');if(mot.length<3)return err('Escribe el motivo de la ausencia');
 const en=ausEnd(st,d.unit,d.n);
 if(ausencias.some(a=>a.empId===emp.id&&!a.cancelled&&!a.returned&&a.start<(en||Infinity)&&(a.end||Infinity)>st))return err(emp.name+' ya tiene una ausencia en esas fechas');
 const rec={id:'a'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),empId:emp.id,name:emp.name,start:st,end:en,unit:d.unit,n:d.unit==='indef'?0:+d.n,cat:d.cat,motivo:mot,ts:Date.now(),returned:false,cancelled:false};
 saveAus(rec);store.set(KEY_EMPLOYEE,emp.id);
 discordSend('ausencias',['AUSENCIA · '+emp.name,'Desde: '+ausWhen(st),'Duración: '+ausLen(rec),'Vuelve: '+(en?ausWhen(en):'sin fecha de vuelta'),'Motivo: '+d.cat,'Explicación: '+mot].join('\n'));
 ausView='list';ausDraft=null;renderAus();say('Ausencia avisada: '+emp.name+' '+ausUntil(rec));
}
function ausEndNow(id,silent){
 const a=ausencias.find(x=>x.id===id);if(!a)return;
 const fut=a.start>Date.now(), rec=Object.assign({},a,fut?{cancelled:true,cancelledAt:Date.now()}:{returned:true,returnedAt:Date.now()});
 saveAus(rec);
 const msg=(fut?'AUSENCIA ANULADA · ':'REGRESO · ')+a.name+'\n'+(fut?'Ya no se ausentará desde el '+ausWhen(a.start):'Ha vuelto el '+ausWhen(Date.now())+(a.end&&a.end>Date.now()?' (antes de lo previsto)':''));
 /* el aviso a Discord espera a que pase el tiempo de «Deshacer» */
 const tm=setTimeout(()=>discordSend('ausencias',msg),silent?0:5800);
 if(!silent){renderAus();say(fut?'Ausencia anulada':'¡Bienvenido de vuelta, '+a.name+'!',undefined,()=>{clearTimeout(tm);saveAus(a);if(!ausModal.hidden)renderAus();if(!dirModal.hidden)renderDir();say('Ausencia recuperada')})}
 if(!dirModal.hidden)renderDir();
}
ausBtn.onclick=()=>{ausView='list';ausDraft=null;renderAus();openModal(ausModal);ausModal.scrollTop=0};
document.getElementById('ausClose').onclick=()=>closeModal(ausModal);
ausModal.addEventListener('click',e=>{
 if(e.target===ausModal)return closeModal(ausModal);
 const b=e.target.closest('[data-aus]');if(!b)return;
 const [act,arg]=b.dataset.aus.split(':');
 if(act==='new'){ausDraft=ausNew();ausView='form';renderAus();ausModal.scrollTop=0}
 else if(act==='back'){ausView='list';renderAus()}
 else if(act==='save')once('aus',async()=>saveAusencia(),b);
 else if(act==='back-now'){const a=ausencias.find(x=>x.id===arg);if(!a)return;askConfirm(a.start>Date.now()?'Anular ausencia':'He vuelto',a.start>Date.now()?'Se anulará la ausencia de '+a.name+'.':'Se dará por terminada la ausencia de '+a.name+'.',a.start>Date.now()?'Anular':'He vuelto').then(ok=>{if(ok)ausEndNow(arg)})}
});
function ausInput(t){
 if(!ausDraft)return;const id=t.id;
 if(id==='auEmp')ausDraft.emp=t.value;
 else if(id==='auDesde'){ausDraft.desde=t.value;renderAus();return}
 else if(id==='auFecha')ausDraft.fecha=t.value;
 else if(id==='auUnit'){ausDraft.unit=t.value;ausDraft.n='1';renderAus();return}
 else if(id==='auN')ausDraft.n=t.value;
 else if(id==='auCat')ausDraft.cat=t.value;
 else if(id==='auMot'){ausDraft.motivo=t.value;return}
 else return;
 const st=ausStart(ausDraft), en=st?ausEnd(st,ausDraft.unit,ausDraft.n):0, el=document.getElementById('auVuelta');
 if(el)el.textContent=st?(en?'Vuelve aproximadamente el '+ausWhen(en)+'.':'Sin fecha de vuelta: queda ausente hasta que pulse «He vuelto».'):'Elige la fecha de inicio.';
}
ausModal.addEventListener('change',e=>ausInput(e.target));
ausModal.addEventListener('input',e=>{if(e.target.id==='auMot')ausInput(e.target)});
setInterval(()=>{updateAusBtn();if(!ausModal.hidden&&ausView==='list')renderAus()},60000);
/* Dirección → AUSENCIAS (con el motivo) */
function renderModAusencias(){
 const now=ausNowList(), fut=ausencias.filter(ausFuture), past=ausencias.filter(a=>!ausActive(a)&&!ausFuture(a)).slice().reverse().slice(0,60);
 const card=a=>`<div class="enc-card dir-item"><div class="t">${esc(a.name)}${ausActive(a)?' <span class="badge pend">AUSENTE</span>':a.cancelled?' <span class="badge no">ANULADA</span>':a.returned?' <span class="badge si">VOLVIÓ</span>':''}</div>
  <div class="it">Desde el ${esc(ausWhen(a.start))} · ${esc(ausLen(a))}${a.end?' · vuelve el '+esc(ausWhen(a.end)):''}${a.returned?'<br>Volvió el '+esc(ausWhen(a.returnedAt)):''}</div>
  <div class="au-mot"><b>${esc(a.cat||'—')}</b> · ${esc(a.motivo||'')}</div>
  <div class="enc-actions two">${ausActive(a)||ausFuture(a)?`<button type="button" data-dir="au-end:${esc(a.id)}">${ausActive(a)?'DAR POR VUELTO':'ANULAR'}</button>`:'<span></span>'}<button type="button" class="warn" data-dir="au-del:${esc(a.id)}">🗑 BORRAR</button></div></div>`;
 return `<p class="bk-note">Solo tú ves el motivo. Horas semanales: si la ausencia ocupa 3 o 4 días de una semana de sueldos (lunes a domingo), esa semana se le exige la mitad de sus horas; si ocupa más de 4 días, queda exento esa semana; con menos de 3 días, todas sus horas.</p>
  <div class="dir-sec-title">AUSENTES AHORA (${now.length})</div>${now.length?now.map(card).join(''):'<div class="enc-empty">Nadie está ausente ahora.</div>'}
  ${fut.length?`<div class="dir-sec-title">PRÓXIMAS (${fut.length})</div>`+fut.map(card).join(''):''}
  <div class="dir-sec-title">HISTORIAL (${past.length})</div>${past.length?past.map(card).join(''):'<div class="enc-empty">Todavía no hay ausencias anteriores.</div>'}`;
}
async function delAusencia(id){
 const a=ausencias.find(x=>x.id===id);if(!a)return;
 if(!await askConfirm('Borrar ausencia','La ausencia de '+a.name+' desaparecerá del registro y dejará de contar para sus horas.','Borrar'))return;
 ausencias=ausencias.filter(x=>x.id!==id);store.set(KEY_AUS,JSON.stringify(ausencias));cloudDel('ausencia:'+id);updateAusBtn();renderDir();say('Ausencia borrada',undefined,()=>{saveAus(a);if(!dirModal.hidden)renderDir();say('Ausencia recuperada')});
}
/* ===== PEGAR MENSAJE: rellena la ficha de un cliente o de un proveedor a partir de un texto pegado ===== */
const PZ_NUM='(\\d{1,6}(?:[.,]\\d{1,2})?)';
const PZ_PRICE=new RegExp('(?:\\$\\s*'+PZ_NUM+'|'+PZ_NUM+'\\s*(?:\\$|us\\$|usd\\b|d[oó]lar(?:es)?\\b|dls?\\b|pavos\\b|centavos\\b|cts?\\b|c\\b))','gi');
const PZ_FILL='(?:\\s|[:,=#\\-–—>»]|\\b(?:es|son|el|la|los|las|del|de|mi|su|nuestro|nuestra|n[º°o]|n\\.º|num|n[uú]mero)\\b\\.?)*';
const PZ_STOP=/\s*(?:\n|;|,\s|\.\s|\.$|\(|\||$)/;
function pzClean(t){
 return String(t||'').replace(/\r/g,'').replace(/[\u200b-\u200f\ufeff]/g,'').replace(/\*\*|__|`|~~/g,'').replace(/[“”«»]/g,'"').replace(/[\u2028\u2029]/g,'\n')
  .split('\n').map(l=>l.replace(/^\s*>\s*/,'')).map(l=>/^\s*\|.*\|\s*$/.test(l)?l.trim().slice(1,-1).split('|').map(c=>c.trim()).filter(Boolean).join(' : ').replace(/^[\s:\-]+$/,''):l).map(l=>l.replace(/^[\s>•·▪▫◦‣⁃►▸▹▶✦✧★☆♦◆◇❖➤➢→⇒\-–—*+]+/u,'').replace(/[\p{Extended_Pictographic}\ufe0f\u200d]+/gu,' ').trim().replace(/\s+/g,' ').trim()).join('\n');
}
/* Busca «etiqueta valor» en el texto; quita lo encontrado del texto para que no se use dos veces */
function pzTake(st,labels,mode){
 const re=new RegExp('(?:^|[\\s,.;(\\n])('+labels+')(?=[\\s:,=#\\-–—.]|$)'+PZ_FILL,'imu');
 const m=re.exec(st.t); if(!m)return '';
 const start=m.index+m[0].length, rest=st.t.slice(start);
 let val='', len=0;
 if(mode==='tok'){const k=/^([A-Za-z0-9][A-Za-z0-9\-\/.]*[A-Za-z0-9]|[A-Za-z0-9])/.exec(rest);if(!k)return '';val=k[1];len=k[0].length}
 else{const e=PZ_STOP.exec(rest);len=e?e.index:rest.length;val=rest.slice(0,len)}
 const from=m.index+(m[0].length-m[0].replace(/^[\s,.;(\n]/,'').length);
 st.t=st.t.slice(0,from)+'\n'+st.t.slice(start+len);
 return val.replace(/^["']|["']$/g,'').replace(/[\s:,.\-]+$/,'').trim();
}
function pzTitle(s){s=String(s).replace(/\s+/g,' ').trim();if(s.length>3&&s===s.toUpperCase()&&/\p{L}/u.test(s))s=s.toLowerCase().replace(/(^|\s)(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()).replace(/\s(De|Del|La|Las|El|Los|Y)(?=\s)/g,m=>m.toLowerCase());return s.replace(/^./,c=>c.toUpperCase())}
function pzTelegram(st){return sanitizeTelegram(pzTake(st,'telegrama|telegram|telégrafo|telegrafo|tlg|tg|tel|buzón|buzon|apartado','tok'))}
function pzIdent(st){return pzTake(st,'n\\.?[º°o]?\\.? de identificaci[oó]n|n[uú]mero de identificaci[oó]n|identificaci[oó]n|identidad|documento|dni|pasaporte|c[eé]dula|id','tok')}
const PZ_GREET=/^(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|saludos|estimad[oa]s?|querid[oa]s?|se[ñn]or(es)?|hey|ey|gracias|un saludo|atentamente|firmado)\b[\s,.!:]*$/i;
const PZ_JUNK=/^(hola|buenas|saludos|gracias|un saludo|atentamente|lista de precios|precios?|productos?|materiales|armas?|ficha|datos|cliente|proveedor|nuevo cliente|nuevo proveedor)\b/i;
function pzSegs(t,yy){
 const out=[];
 t.split('\n').forEach(l=>{
  l.split(yy?/;|\s[|\/]\s|,\s+(?=\D)|,(?=[^\d\s])|\.\s+(?=\p{Lu})|\s+(?:y|e)\s+(?=(?:un|una|el|la|otro|otra)?\s*\p{L})/u:/;|\s[|\/]\s|,\s+(?=\D)|,(?=[^\d\s])|\.\s+(?=\p{Lu})/u).forEach(s=>{
   s=s.trim();if(!s)return;
   /* varios precios en un trozo: corta después de cada precio */
   const P=[...s.matchAll(PZ_PRICE)];
   if(P.length>1){let a=0;P.forEach((m,i)=>{const e=m.index+m[0].length;out.push(s.slice(a,e).trim());a=e});const r=s.slice(a).trim();if(r)out.push(r)}
   else out.push(s);
  });
 });
 return out.map(s=>s.replace(/^(?:y|e)\s+/i,'').replace(/[\s.:;,]+$/,'').trim()).filter(Boolean);
}
function pzGuessName(st){
 for(const s of pzSegs(st.t)){
  const x=s.replace(/^(?:soy|me llamo|mi nombre es|somos|les escribe|le escribe|de parte de)\s+/i,'').trim();
  if(PZ_GREET.test(x)||PZ_JUNK.test(x))continue;
  if(/\d|\$|:/.test(x))continue;
  if(x.split(/\s+/).length>6||x.length>40)continue;
  if(!/\p{L}{2}/u.test(x))continue;
  return x.replace(/^(?:hola|buenas)[\s,!]+/i,'');
 }
 return '';
}
function pzName(st,extra){
 let n=pzTake(st,'nombre de la empresa|nombre del negocio|nombre de empresa|nombre de la compa[ñn][ií]a|raz[oó]n social'+(extra||'')+'|nombre completo|nombre y apellidos?|nombre|me llamo|mi nombre es|soy|somos','line');
 if(!n)n=pzGuessName(st);
 return pzTitle(n.replace(/^(?:la|el|los|las)\s+(?=[A-ZÁÉÍÓÚ])/,m=>m)).slice(0,40);
}
/* Arma: busca el nombre de un producto de la armería dentro del trozo */
function pzWeapon(s){
 const W=weaponNames(), ns=' '+norm(s).replace(/[^a-z0-9]+/g,' ')+' ';
 const tok=n=>norm(n).replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(w=>w.length>=3);
 const cnt={};W.forEach(n=>tok(n).forEach(w=>cnt[w]=(cnt[w]||0)+1));
 let best='',bs=0;
 W.forEach(n=>{const T=tok(n);let sc=0,dist=0;T.forEach(w=>{const hit=ns.indexOf(' '+w+' ')>=0||(w.length>=5&&ns.indexOf(' '+w.slice(0,-1))>=0);if(hit){sc+=cnt[w]===1?3:1;if(cnt[w]===1)dist++}});
  if((dist||sc>=T.length)&&sc>bs){bs=sc;best=n}});
 return best;
}
function pzSerial(s){
 const m=/(?:n[uú]mero de serie|n\.?[º°o]?\.? de serie|serie|serial|s\/n|sn|n[º°]|n\.º|#|num\.?|n[uú]mero)\s*[:.\-#]*\s*([A-Za-z0-9][A-Za-z0-9\-\/.]*[A-Za-z0-9])/i.exec(s);
 if(m&&/\d/.test(m[1]))return m[1].toUpperCase().slice(0,20);
 const k=s.match(/\b(?=[A-Za-z0-9\-\/]*\d{3})[A-Za-z0-9][A-Za-z0-9\-\/]{2,19}\b/);
 return k?k[0].toUpperCase().slice(0,20):'';
}
function pzClient(text){
 const st={t:pzClean(text)}, r={};
 r.telegram=pzTelegram(st);
 r.ident=pzIdent(st).toUpperCase().slice(0,30);
 const tipo=/\b(empresa|compa[ñn][ií]a|negocio|sociedad|hermanos)\b/i.test(st.t)?'empresa':'';
 r.name=pzName(st,'|cliente|empresa');
 if(tipo)r.type=tipo;
 /* armas y números de serie */
 const S=[];let pend='';
 pzSegs(st.t,1).forEach(s=>{
  if(norm(s).indexOf(norm(r.name||'\u0000'))===0&&!/\d{3}/.test(s))return;
  const a=pzWeapon(s), sr=pzSerial(s);
  if(sr&&(a||pend||/serie|s\/n|n[º°]|#/i.test(s))){S.push({s:sr,a:a||pend});pend=''}
  else if(a&&!sr)pend=a;
 });
 const seen={};r.series=S.filter(x=>!seen[x.s]&&(seen[x.s]=1)).slice(0,MAX_SERIES);
 return r;
}
const PZ_TIPOS=[[/\bmin(a|as|ero|era|er[ií]a)\b/i,'Mina'],[/\bherrer/i,'Herrería'],[/\baserrader/i,'Aserradero'],[/\b(tala|le[ñn]ador|le[ñn]a)\b/i,'Tala'],[/\bgranja/i,'Granja'],[/\b(ganad|rancho|reses)/i,'Ganadería']];
function pzTipoFix(t){
 t=pzTitle(t).slice(0,30);if(!t)return '';
 const k=provTipos().find(x=>norm(x)===norm(t)||norm(t).indexOf(norm(x))===0);return k||t;
}
function pzProveedor(text){
 const st={t:pzClean(text)}, r={};
 r.tel=pzTelegram(st);
 let tipo=pzTake(st,'tipo de negocio|tipo de empresa|tipo|sector|actividad|se dedica a|nos dedicamos a|dedicad[oa]s? a','line');
 r.name=pzName(st,'|empresa|compa[ñn][ií]a|negocio|proveedor');
 let ubic=pzTake(st,'ubicaci[oó]n|localizaci[oó]n|direcci[oó]n|localidad|ciudad|pueblo|zona|estamos en|situad[oa]s? en|est[aá]n? en','line');
 if(!ubic){for(const sg of pzSegs(st.t)){const m=/^(?:de|en|desde)\s+(\p{Lu}[\p{L}'’ ]{2,28})$/u.exec(sg);if(m){ubic=m[1];st.t=st.t.replace(sg,'\n');break}}}
 if(!ubic){const all=norm(r.name+' '+st.t);ubic=PUEBLOS.find(p=>all.indexOf(norm(p))>=0)||''}
 if(ubic){const k=PUEBLOS.find(p=>norm(p)===norm(ubic.trim()));r.ubic=k||pzTitle(ubic).slice(0,30)}
 if(!tipo){const all=r.name+' '+st.t;for(const [re,v] of PZ_TIPOS)if(re.test(all)){tipo=v;break}}
 r.tipo=pzTipoFix(tipo);
 /* productos con su precio */
 const known={};pedidos.forEach(p=>(p.items||[]).forEach(i=>known[norm(i.material)]=i.material));proveedores.forEach(v=>(v.prods||[]).forEach(x=>known[norm(x.name)]=x.name));
 const P=[], seen={};let noP=false;
 let listCtx=/precio|tarifa|vend|producto|material|cat[aá]logo|ofrec/i.test(st.t);
 pzSegs(st.t).forEach(s=>{
  let m=[...s.matchAll(PZ_PRICE)][0], price='', name=s;
  if(m){price=m[1]||m[2];if(/^c(ts?|entavos)?$/i.test((m[0].match(/[a-z]+$/i)||[''])[0]))price=String((parseFloat(price)||0)/100);name=s.slice(0,m.index)+' '+s.slice(m.index+m[0].length)}
  else{const b=/^(.*?\p{L}.*?)(?:\s*[:=\-–—]\s*|\s+a\s+|\s+)(\d{1,5}(?:[.,]\d{1,2})?)$/u.exec(s);if(b&&listCtx){name=b[1];price=b[2]}}
  const strip=x=>{x=x.replace(/\([^)]*\)/g,' ');for(let i=0;i<4;i++)x=x.trim().replace(/^(?:y|e|a|el|la|los|las|de|del|un|una|tambi[eé]n|adem[aá]s|vendemos|vendo|vende|tenemos|ofrecemos|precios?|lista de precios|productos?|materiales?)\s+/i,'').replace(/(?:\s+|^)(?:a|por|el|la|cada|cada uno|cada una|c\/u|la unidad|por unidad|unidad|\/?ud\.?|\/?uds\.?|\/?u\.?|precio|vale|valen|cuesta|cuestan|son|x|×)$/i,'').replace(/[\s:=\-–—.,\/]+$/,'').replace(/^[\s:=\-–—.,]+/,'');return x.trim()};
  if(name.indexOf(':')>=0){const parts=name.split(':'), a=strip(parts.slice(1).join(':')), b=strip(parts[0]);name=/\p{L}/u.test(a)?a:b}else name=strip(name);
  if(/^(?:productos?|materiales?|vendemos|vende|vendo|tenemos|ofrecemos|lista(?: de precios)?|precios?|cat[aá]logo)\b/i.test(s))noP=true;
  else if(s.split(/\s+/).length>6)noP=false;
  if(/^(?:productos?|materiales?|lista(?: de precios)?|precios?|cat[aá]logo|vendemos|vende|vendo|tenemos|ofrecemos|nuestros productos)$/i.test(name))return;
  if(!price&&!noP)return;
  if(!/\p{L}/u.test(name)||name.length>40||name.split(/\s+/).length>5)return;
  if(PZ_GREET.test(name)||/^(total|telegrama|nombre|tipo|empresa)\b/i.test(name))return;
  const nm=known[norm(name)]||pzTitle(name), k=norm(nm);
  if(seen[k]){if(price)seen[k].p=price;return}
  const row={n:nm,p:price?String(parsePrice(price)||''):''};seen[k]=row;P.push(row);
 });
 r.prods=P.slice(0,MAX_PPROD);
 return r;
}

let pzOpen='', pzText='', pzMsg=null, pzHit=[];
function pzBox(k){
 const msg=pzMsg&&pzMsg.k===k?`<div class="pz-msg${pzMsg.bad?' bad':''}" role="status">${pzMsg.t}</div>`:'';
 if(pzOpen!==k)return msg+`<div class="pz-row enc-actions"><button type="button" class="pz-btn" data-dir="pz-open:${k}">📋 PEGAR MENSAJE</button><small>Opcional: pega el mensaje ${k==='cl'?'del cliente':'del proveedor'} tal cual te llega y la ficha se rellena sola.</small></div>`;
 const ph=k==='cl'?'Ej.: Pascual Martínez, telegrama 4521, identificación 88231. Armas: Lemat n.º 55123, Schofield n.º 77810':'Ej.: Mina Rock Roy, de Annesburg. Telegrama MRR-21. Lista de precios: oro 5$, hierro 1,20$, carbón 0,80$, sal 0,50$, azufre 2$';
 return msg+`<div class="pz-panel"><label for="pzText">PEGA AQUÍ EL MENSAJE</label><textarea id="pzText" rows="6" spellcheck="false" placeholder="${esc(ph)}">${esc(pzText)}</textarea>
  <p class="bk-note">${k==='cl'?'Reconoce el nombre, el telegrama, el número de identificación y los números de serie con su arma.':'Reconoce el nombre de la empresa, el telegrama, el tipo de negocio, la ubicación y cada producto con su precio.'} Después revisas la ficha y la guardas tú.</p>
  <div class="enc-actions two"><button type="button" data-dir="pz-close">Cancelar</button><button type="button" class="primary" data-dir="pz-go:${k}">RELLENAR LA FICHA</button></div></div>`;
}
function pzList(a){return a.length>1?a.slice(0,-1).join(', ')+' y '+a[a.length-1]:a[0]||''}
function pzFillClient(){
 const r=pzClient(pzText), got=[], hit=[];let note='';
 if(!r.name&&!r.telegram&&!r.ident&&!r.series.length){pzMsg={k:'cl',bad:1,t:'No he encontrado datos en ese mensaje. Revisa que tenga el nombre o el telegrama, o rellena la ficha a mano.'};renderDir();return}
 if(clEdit==='new'&&r.name){const ex=clientes.find(x=>norm(x.name)===norm(r.name));if(ex){clEdit=ex.id;clWork=JSON.parse(JSON.stringify(ex));note=' Ya existía la ficha de <b>'+esc(ex.name)+'</b>: se han añadido los datos nuevos a la suya.'}}
 const c=clWork;
 if(r.name&&(clEdit==='new'||!c.name)){c.name=r.name;got.push('nombre');hit.push('clName')}
 if(r.telegram&&r.telegram!==c.telegram){c.telegram=r.telegram;got.push('telegrama');hit.push('clTel')}
 if(r.ident&&r.ident!==c.ident){c.ident=r.ident;got.push('n.º de identificación');hit.push('clIdent')}
 if(r.type==='empresa'&&c.type!=='empresa'){c.type='empresa';got.push('tipo empresa');hit.push('clType')}
 const L=(c.series||[]).filter(x=>x&&(x.s||x.a));let ns=0;
 r.series.forEach(x=>{const o=L.find(y=>y.s===x.s);if(o){if(!o.a&&x.a){o.a=x.a;ns++}}else if(L.length<MAX_SERIES){L.push({s:x.s,a:x.a});ns++}});
 c.series=L;if(ns){got.push(ns+(ns===1?' arma con su número de serie':' armas con su número de serie'));hit.push('serList')}
 pzOpen='';pzText='';pzHit=hit;
 pzMsg={k:'cl',t:(got.length?'✓ Rellenado: '+pzList(got)+'.':'El mensaje no traía nada nuevo para esta ficha.')+note+' Revisa los datos y pulsa <b>GUARDAR CLIENTE</b>.'+(!c.telegram?' <b>Falta el telegrama</b>, que es obligatorio.':'')};
 renderDir();
}
function pzFillProv(){
 const r=pzProveedor(pzText), got=[], hit=[];let note='';
 if(!r.name&&!r.tel&&!r.prods.length){pzMsg={k:'pv',bad:1,t:'No he encontrado datos en ese mensaje. Revisa que tenga el nombre de la empresa, el telegrama o la lista de precios, o rellena la ficha a mano.'};renderDir();return}
 if(!pvEdit&&r.name){const v=proveedores.find(x=>norm(x.name)===norm(r.name));if(v){pvEdit=v.id;pvDraft={name:v.name,tel:v.tel||'',tipo:v.tipo||'',ubic:v.ubic||'',prods:(v.prods||[]).map(x=>({n:x.name,p:(x.price/100).toFixed(2)}))};note=' <b>'+esc(v.name)+'</b> ya estaba en la lista: se ha abierto su ficha para actualizarla.'}}
 const d=pvDraft;
 if(r.name&&(!pvEdit||!d.name)&&r.name!==d.name){d.name=r.name;got.push('nombre de la empresa');hit.push('pvName')}
 if(r.tel&&r.tel!==d.tel){d.tel=r.tel;got.push('telegrama');hit.push('pvTel')}
 if(r.tipo&&!d.tipo){d.tipo=r.tipo;got.push('tipo de negocio ('+esc(r.tipo)+')');hit.push('pvTipo')}
 if(r.ubic&&r.ubic!==d.ubic){d.ubic=r.ubic;got.push('ubicación ('+esc(r.ubic)+')');hit.push('pvUbic')}
 const L=(d.prods||[]).filter(x=>x&&(x.n||x.p));let nn=0,nu=0,sinP=0;
 r.prods.forEach(x=>{const o=L.find(y=>norm(String(y.n).trim())===norm(x.n));if(o){if(x.p&&parsePrice(o.p)!==parsePrice(x.p)){o.p=x.p;nu++}}else if(L.length<MAX_PPROD){L.push({n:x.n,p:x.p});nn++;if(!x.p)sinP++}});
 d.prods=L;
 if(nn)got.push(nn+(nn===1?' producto':' productos'));
 if(nu)got.push(nu+(nu===1?' precio actualizado':' precios actualizados'));
 if(nn||nu)hit.push('pvList');
 pzOpen='';pzText='';pzHit=hit;
 pzMsg={k:'pv',t:(got.length?'✓ Rellenado: '+pzList(got)+'.':'El mensaje no traía nada nuevo para esta ficha.')+note+(sinP?' <b>'+sinP+(sinP===1?' producto no traía precio':' productos no traían precio')+'</b>: escríbelo tú.':'')+' Revisa los datos y pulsa <b>'+(pvEdit?'GUARDAR CAMBIOS':'CREAR NUEVO PROVEEDOR')+'</b>.'};
 renderDir();
}
function pzAfterRender(){
 if(!pzHit.length&&!pzMsg)return;
 const box=document.querySelector('#dirBody .pz-msg');
 pzHit.forEach(id=>{const el=document.getElementById(id);if(el){el.classList.remove('pz-hit');void el.offsetWidth;el.classList.add('pz-hit')}});
 if(pzHit.length&&box)box.scrollIntoView({block:'nearest'});
 pzHit=[];
}
dirModal.addEventListener('click',e=>{
 const b=e.target.closest('[data-dir]'); if(!b)return;
 const [act,arg]=b.dataset.dir.split(':');
 if(act==='pz-open'){pzOpen=arg;pzMsg=null;renderDir();
  const ta=document.getElementById('pzText');if(ta)ta.focus({preventScroll:true});
  if(!pzText&&navigator.clipboard&&navigator.clipboard.readText)navigator.clipboard.readText().then(t=>{t=String(t||'').trim();const x=document.getElementById('pzText');if(t&&t.length<4000&&x&&!x.value){x.value=t;pzText=t}}).catch(()=>{});
  e.stopImmediatePropagation();return}
 if(act==='pz-close'){pzOpen='';pzText='';renderDir();e.stopImmediatePropagation();return}
 if(act==='pz-go'){const ta=document.getElementById('pzText');if(ta)pzText=ta.value;
  if(!pzText.trim()){pzMsg={k:arg,bad:1,t:'Pega primero el mensaje en el recuadro.'};renderDir();e.stopImmediatePropagation();return}
  if(arg==='cl'&&clWork)pzFillClient();else if(arg==='pv')pzFillProv();
  e.stopImmediatePropagation();return}
 if(act==='cl-paste'){clEdit='new';clView=null;clWork={name:'',type:'particular',telegram:'',ident:'',precios:{},series:[]};pzOpen='cl';pzText='';pzMsg=null;renderDir();dirModal.scrollTop=0;
  const ta=document.getElementById('pzText');if(ta)ta.focus({preventScroll:true});
  if(navigator.clipboard&&navigator.clipboard.readText)navigator.clipboard.readText().then(t=>{t=String(t||'').trim();const x=document.getElementById('pzText');if(t&&t.length<4000&&x&&!x.value){x.value=t;pzText=t}}).catch(()=>{});
  e.stopImmediatePropagation();return}
 if(/^(cl-(new|cancel|edit|view|close)|pv-(cancel|edit)|open)$/.test(act)){pzOpen='';pzText='';pzMsg=null}
},true);
dirModal.addEventListener('input',e=>{if(e.target.id==='pzText')pzText=e.target.value});
dirModal.addEventListener('click',e=>{
 const b=e.target.closest('[data-dir]'); if(!b)return;
 const [act,arg]=b.dataset.dir.split(':');
 if(act==='pv-view'){pvView=arg;pvEdit=null;renderDir();dirModal.scrollTop=0;e.stopImmediatePropagation();return}
 if(act==='pv-close'){pvView=null;renderDir();e.stopImmediatePropagation();return}
 if(act==='pv-order'){const v=proveedores.find(x=>x.id===arg);if(v){pvView=null;dirMod='nuevopedido';npDraft.prov=v.id;npDraft.lq={};renderDir();dirModal.scrollTop=0}e.stopImmediatePropagation();return}
 if(act==='pv-edit'||act==='open')pvView=null;
},true);
/* Barra fija de abajo en el móvil: copia el estado de los botones de arriba */
const mnav=document.getElementById('mnav');
function mnVisible(el){return !!el&&!el.hidden&&getComputedStyle(el).display!=='none'}
function mnSync(){
 if(!mnav)return;
 mnav.querySelectorAll('[data-mn]').forEach(b=>{
  const k=b.dataset.mn;
  if(k==='top'||k==='clock')return;
  const o=document.getElementById(k);
  b.hidden=!mnVisible(o);
  if(!o)return;
  const ic=b.querySelector('.mn-i'), sv=o.querySelector('svg');
  if(ic&&sv&&!ic.firstChild)ic.appendChild(sv.cloneNode(true));
  const n=(o.textContent.match(/\((\d+)\)/)||[])[1];
  let t=b.querySelector('.mn-n');
  if(n){if(!t){t=document.createElement('i');t.className='mn-n';b.appendChild(t)}t.textContent=n;b.setAttribute('aria-label',b.querySelector('.mn-l').textContent+' ('+n+')')}
  else if(t){t.remove();b.removeAttribute('aria-label')}
 });
 const out=document.getElementById('clockOutBtn'), cb=mnav.querySelector('[data-mn="clock"]'), on=mnVisible(out);
 cb.classList.toggle('on',on);cb.querySelector('.mn-l').textContent=on?'SALIDA':'FICHAR';
 if(mnav.hidden)mnav.hidden=false;
 document.body.classList.toggle('has-mnav',!mnav.hidden);
}
if(mnav){
 mnav.addEventListener('click',e=>{
  const b=e.target.closest('[data-mn]');if(!b)return;const k=b.dataset.mn;
  if(k==='top'){window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return}
  if(k==='clock'){const o=document.getElementById('clockOutBtn');(mnVisible(o)?o:document.getElementById('clockBtn')).click();return}
  const o=document.getElementById(k);if(o)o.click();
 });
 try{new MutationObserver(()=>{clearTimeout(mnSync.t);mnSync.t=setTimeout(mnSync,60)}).observe(document.querySelector('.clock-actions'),{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class'],characterData:true})}catch(e){}
 try{new MutationObserver(()=>{clearTimeout(mnSync.t);mnSync.t=setTimeout(mnSync,60)}).observe(document.body,{attributes:true,attributeFilter:['class']})}catch(e){}
 setTimeout(mnSync,0);
}
/* Atajos de teclado (ordenador) */
document.addEventListener('keydown',e=>{
 if(e.defaultPrevented||e.altKey||e.metaKey)return;
 const t=e.target, typing=t&&t.matches&&t.matches('input,textarea,select,[contenteditable="true"]');
 const anyModal=[...document.querySelectorAll('.modal-overlay')].some(m=>!m.hidden)||(document.getElementById('gate')&&!document.getElementById('gate').hidden);
 if(e.ctrlKey&&e.key==='Enter'){
  if(anyModal)return;
  const f=document.getElementById('finish');if(f&&mnVisible(f)&&!f.disabled){e.preventDefault();f.click()}
  return;
 }
 if(e.ctrlKey||typing||anyModal)return;
 if(e.key==='/'){const q=document.getElementById('search');if(q){e.preventDefault();q.focus();q.select()}}
 else if(e.key==='?'){e.preventDefault();openTutorial()}
 else if(/^[1-9]$/.test(e.key)){const c=document.querySelectorAll('.cat-nav .cat-btn')[+e.key-1];if(c){e.preventDefault();c.click()}}
});
/* --- Proveedores (jefe) --- */
const TIPOS_PROV=['Herrería','Mina','Tala','Aserradero','Ganadería','Granja','Otro'];
function pvRows(d){const L=(d.prods||[]).filter(r=>r&&(r.n||r.p)).map(r=>({n:r.n||'',p:r.p||''}));if(L.length<MAX_PPROD)L.push({n:'',p:''});d.prods=L;return L}
function pvRowHTML(r,i){return `<div class="pv-prod"><input data-pvp="n" data-i="${i}" type="text" maxlength="40" autocomplete="off" placeholder="Producto ${i+1}" value="${esc(r.n)}"><div class="money"><i>$</i><input data-pvp="p" data-i="${i}" inputmode="decimal" autocomplete="off" placeholder="Precio" value="${esc(r.p)}"></div></div>`}
const PUEBLOS=['Saint Denis','Rhodes','Valentine','Annesburg','Van Horn','Strawberry','Blackwater','Armadillo','Tumbleweed','Emerald Ranch','Lagras','Colter','Wapiti','Butcher Creek',"Thieves' Landing",'Manzanita Post','Riggs Station','Flatneck Station',"MacFarlane's Ranch",'Benedict Point','Brandywine Drop','Bayou Nwa','Heartlands'];
function provUbics(){return Array.from(new Set(PUEBLOS.concat(proveedores.map(v=>v.ubic).filter(Boolean)))).sort((a,b)=>a.localeCompare(b,'es'))}
function provTipos(){return Array.from(new Set(TIPOS_PROV.concat(proveedores.map(v=>v.tipo).filter(Boolean)))).sort((a,b)=>a.localeCompare(b,'es'))}
function provText(v,title){
 const L=[title||'PROVEEDOR','Empresa: '+v.name,'Tipo de negocio: '+(v.tipo||'—'),'Telegrama: '+(v.tel||'—')].concat(v.ubic?['Ubicación: '+v.ubic]:[]).concat(['','LISTA DE PRECIOS ('+(v.prods||[]).length+')']);
 (v.prods||[]).forEach(x=>L.push('  '+x.name+' · '+money(x.price)+' / ud.'));
 if(!(v.prods||[]).length)L.push('  (sin productos todavía)');
 L.push('','Actualizado: '+fmtDate(Date.now())+' '+fmtTime(Date.now()));
 return L.join('\n');
}
async function publishProveedor(id){
 const v=proveedores.find(x=>x.id===id); if(!v)return;
 const ref=await discordCard('proveedores',provText(v),v.dc);
 const k=proveedores.find(x=>x.id===id);
 if(k&&ref&&(!k.dc||k.dc.id!==ref.id||k.dc.w!==ref.w)){k.dc=ref;saveProveedores()}
}
let pvView=null;
function renderProvFicha(v){
 const L=v.prods||[], CM=priceMap(), line=(k,val,copy)=>`<div class="cf-line"><div><small>${k}</small><b>${val?esc(val):'—'}</b></div>${val&&copy?cpBtn(val):''}</div>`;
 return `<div class="pf-wrap"><div class="pf-paper"><div class="pf-name">${esc(v.name)}</div>
  <div class="pf-sub">Contrato de suministro · ${esc(v.tipo||'Proveedor')}${v.ubic?' · '+esc(v.ubic):''}</div>
  ${line('TELEGRAMA',v.tel,1)}${line('UBICACIÓN',v.ubic)}
  <div class="dir-sec-title">LISTA DE PRECIOS (${L.length})</div>
  ${L.length?L.map((x,i)=>`<div class="pf-row"><span class="n">${i+1}</span><span class="nm">${esc(x.name)}${cmpTag(v.id,x.name,CM)}</span><span class="pr">${money(x.price)}<small>por unidad</small></span></div>`).join(''):'<div class="enc-empty">Sin lista de precios todavía.</div>'}
  <div class="enc-actions emp3"><button type="button" data-dir="pv-close">◂ Volver</button><button type="button" data-dir="pv-edit:${esc(v.id)}">✎ EDITAR</button><button type="button" class="primary" data-dir="pv-order:${esc(v.id)}">HACER PEDIDO</button></div></div></div>`;
}
function renderModProveedores(){
 if(pvView&&!pvEdit){const v=proveedores.find(x=>x.id===pvView);if(v)return renderProvFicha(v);pvView=null}
 const list=proveedores.slice().sort((a,b)=>a.name.localeCompare(b.name,'es'));
 return `<div class="dir-form enc-sec"><div class="dir-sec-title" style="margin-top:0">${pvEdit?'EDITAR PROVEEDOR':'NUEVO PROVEEDOR'}</div>${pzBox('pv')}
  <label>NOMBRE DE LA EMPRESA<input id="pvName" type="text" maxlength="40" autocomplete="off" value="${esc(pvDraft.name)}" placeholder="Ej.: Herrería del Valle"></label>
  <label>TIPO DE NEGOCIO<input id="pvTipo" type="text" maxlength="30" list="tipoList" autocomplete="off" value="${esc(pvDraft.tipo)}" placeholder="Herrería, mina, tala… o escribe uno nuevo"><datalist id="tipoList">${provTipos().map(t=>`<option value="${esc(t)}"></option>`).join('')}</datalist></label>
  <label>TELEGRAMA<input id="pvTel" type="text" maxlength="10" autocomplete="off" value="${esc(pvDraft.tel)}" placeholder="Ej.: HV-12"></label>
  <label>UBICACIÓN (OPCIONAL)<input id="pvUbic" type="text" maxlength="30" list="ubicList" autocomplete="off" value="${esc(pvDraft.ubic||'')}" placeholder="Ej.: Annesburg"><datalist id="ubicList">${provUbics().map(t=>`<option value="${esc(t)}"></option>`).join('')}</datalist></label>
  <div class="dir-sec-title">PRODUCTOS Y PRECIOS (<span id="pvCount">${pvRows(pvDraft).filter(r=>r.n).length}</span>)</div>
  <p class="bk-note" style="margin:0 0 8px">Precio por unidad. Al escribir un producto aparece otro hueco. Puedes ampliar o cambiar la lista cuando quieras.</p>
  <div id="pvList">${pvRows(pvDraft).map((r,i)=>pvRowHTML(r,i)).join('')}</div>
  <div class="pay-err" id="pvErr" hidden></div>
  <div class="enc-actions ${pvEdit?'two':''}">${pvEdit?'<button type="button" data-dir="pv-cancel">Cancelar</button>':''}<button type="button" class="primary" data-dir="pv-save">${pvEdit?'GUARDAR CAMBIOS':'CREAR NUEVO PROVEEDOR'}</button></div>
  <p class="bk-note" style="margin:8px 0 0">La ficha con su lista de precios se publica en el canal de Discord «Proveedores» y se actualiza sola cada vez que la cambies.</p></div>
  <div class="dir-sec-title">LISTA DE PROVEEDORES (${list.length})</div>${list.length>3?searchBox('⌕  Buscar proveedor, tipo o producto…'):''}`+(list.length?list.map(v=>`<div class="enc-card dir-item" data-q="${esc(norm(v.name+' '+(v.tipo||'')+' '+(v.prods||[]).map(x=>x.name).join(' ')))}"><div class="t">${esc(v.name)}</div><div class="it">${esc(v.tipo||'—')}${v.ubic?' · '+esc(v.ubic):''}${v.tel?' · Telegrama '+esc(v.tel):''}<br>${(v.prods||[]).length?(v.prods||[]).slice(0,4).map(x=>esc(x.name)+' '+money(x.price)).join(' · ')+((v.prods||[]).length>4?' y '+((v.prods||[]).length-4)+' más':''):'Sin lista de precios'}</div><div class="enc-actions emp3"><button type="button" class="primary" data-dir="pv-view:${esc(v.id)}">FICHA</button><button type="button" data-dir="pv-edit:${esc(v.id)}">EDITAR</button><button type="button" class="warn" data-dir="pv-del:${esc(v.id)}">ELIMINAR</button></div></div>`).join(''):'<div class="enc-empty">Todavía no hay proveedores.<br>Crea el primero para poder hacerle pedidos.</div>')+cmpHTML();
}
function saveProveedor(){
 const err=t=>{const e=document.getElementById('pvErr');e.textContent=t;e.hidden=false;e.scrollIntoView({block:'nearest'})}, name=pvDraft.name.trim().replace(/\s+/g,' ');
 if(!name)return err('Escribe el nombre de la empresa');
 if(proveedores.some(x=>x.id!==pvEdit&&norm(x.name)===norm(name)))return err('Ya existe un proveedor con ese nombre');
 const prods=[], seen={};
 for(const r of (pvDraft.prods||[])){
  const n=String(r.n||'').trim().replace(/\s+/g,' '), p=String(r.p||'').trim();
  if(!n&&!p)continue;
  if(!n)return err('Falta el nombre del producto que vale $'+p);
  const pr=parsePrice(p);
  if(pr===null||pr<=0)return err('El precio de «'+n+'» debe ser mayor que 0');
  if(seen[norm(n)])return err('«'+n+'» está repetido en la lista');
  seen[norm(n)]=1;prods.push({name:n,price:Math.round(pr*100)});
 }
 const data={name:name,tel:pvDraft.tel.trim(),tipo:pvDraft.tipo.trim().replace(/\s+/g,' '),ubic:String(pvDraft.ubic||'').trim().replace(/\s+/g,' '),prods:prods};
 let id=pvEdit;
 if(pvEdit){const k=proveedores.findIndex(x=>x.id===pvEdit);if(k>=0)proveedores[k]=Object.assign({},proveedores[k],data)}
 else{id='v'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);proveedores.push(Object.assign({id:id},data))}
 pzMsg=null;pzOpen='';saveProveedores();pvEdit=null;pvDraft={name:'',tel:'',tipo:'',ubic:'',prods:[]};renderDir();say('Proveedor guardado');
 publishProveedor(id);
}
async function delProveedor(id){
 const v=proveedores.find(x=>x.id===id); if(!v)return;
 if(!await askConfirm('Eliminar proveedor',`«${v.name}» desaparecerá de la lista. Sus pedidos ya hechos no cambian.`,'Eliminar'))return;
 const pos=proveedores.indexOf(v);
 proveedores=proveedores.filter(x=>x.id!==id);saveProveedores();if(npDraft.prov===id){npDraft.prov='';npDraft.lq={}}renderDir();
 const tm=v.dc?setTimeout(()=>discordCard('proveedores',provText(v,'PROVEEDOR ELIMINADO'),v.dc,true),5800):0;
 say('Proveedor eliminado',undefined,()=>{clearTimeout(tm);if(!proveedores.some(x=>x.id===v.id)){proveedores.splice(Math.min(pos,proveedores.length),0,v);saveProveedores()}if(!dirModal.hidden)renderDir();say('Proveedor recuperado')});
}
/* Comparar precios entre proveedores: mismo producto (sin mayúsculas ni tildes) en varios */
function priceMap(){
 const M={};
 proveedores.forEach(v=>(v.prods||[]).forEach(x=>{const k=norm(String(x.name).trim());if(!k||!(x.price>0))return;(M[k]=M[k]||{name:x.name,list:[]}).list.push({id:v.id,prov:v.name,price:x.price})}));
 Object.keys(M).forEach(k=>{M[k].list.sort((a,b)=>a.price-b.price);if(M[k].list.length<2)delete M[k]});
 return M;
}
function cmpTag(provId,name,M){
 const e=(M||priceMap())[norm(String(name).trim())];if(!e)return '';
 const me=e.list.find(x=>x.id===provId);if(!me)return '';
 const best=e.list[0];
 if(me.price<=best.price)return '<i class="cmp-tag best" title="El más barato de '+e.list.length+' proveedores">✓ el más barato</i>';
 return '<i class="cmp-tag alt" title="Más barato en '+esc(best.prov)+'">'+esc(best.prov)+': '+money(best.price)+'</i>';
}
function cmpHTML(){
 const M=priceMap(), K=Object.keys(M).sort((a,b)=>M[a].name.localeCompare(M[b].name,'es'));
 if(!K.length)return '';
 return `<div class="dir-sec-title">COMPARAR PRECIOS (${K.length})</div><p class="bk-note" style="margin:0 0 4px">Productos que venden varios proveedores, del más barato al más caro.</p>`+K.map(k=>`<div class="cmp-card"><div class="t">${esc(M[k].name)}</div>${M[k].list.map((x,i)=>`<div class="cmp-line${i===0||x.price===M[k].list[0].price?' best':''}"><span>${esc(x.prov)}</span><b>${money(x.price)}</b></div>`).join('')}</div>`).join('');
}
/* --- Realizar nuevo pedido (jefe) --- */
function npProv(){return proveedores.find(x=>x.id===npDraft.prov)}
function npListTotal(){const pv=npProv();return pv?(pv.prods||[]).reduce((a,x)=>a+(npDraft.lq[x.name]||0)*x.price,0):0}
function npTotal(){return npListTotal()+npDraft.rows.reduce((a,r)=>{const q=parseInt(r.q)||0,p=Math.round((parsePrice(r.p)||0)*100);return a+q*p},0)}
function npRefresh(i){
 const pv=npProv(), x=pv&&(pv.prods||[])[i];
 if(x){const q=npDraft.lq[x.name]||0, s=document.getElementById('npqSub'+i);if(s)s.textContent=q?' · Subtotal: '+money(q*x.price):'';const row=s&&s.closest('.stock-row');if(row)row.classList.toggle('on',q>0)}
 const tot=document.getElementById('npTotal');if(tot)tot.textContent=money(npTotal());
}
function renderModNuevoPedido(){
 if(!proveedores.length)return '<div class="enc-empty">Primero crea al menos un proveedor en <b>PROVEEDORES</b>.</div>';
 const mats=Array.from(new Set(pedidos.flatMap(p=>p.items.map(i=>i.material)))).sort((a,b)=>a.localeCompare(b,'es'));
 return `<div class="dir-form enc-sec"><div class="dir-sec-title" style="margin-top:0">NUEVO PEDIDO</div>
  <label>PROVEEDOR<select id="npProv"><option value="">Seleccionar proveedor</option>${proveedores.slice().sort((a,b)=>a.name.localeCompare(b.name,'es')).map(v=>`<option value="${esc(v.id)}"${npDraft.prov===v.id?' selected':''}>${esc(v.name)}${v.tipo?' · '+esc(v.tipo):''}</option>`).join('')}</select></label>
  ${(()=>{const pv=npProv();if(!pv||!(pv.prods||[]).length)return pv?'<p class="bk-note" style="margin:6px 0">Este proveedor aún no tiene lista de precios: puedes añadirla en PROVEEDORES o escribir los materiales abajo.</p>':'';const CM=priceMap();return `<div class="dir-sec-title">PRODUCTOS DE ${esc(pv.name.toUpperCase())}</div>`+pv.prods.map((x,i)=>{const q=npDraft.lq[x.name]||0;return `<div class="stock-row np-prod${q?' on':''}"><div><b>${esc(x.name)}</b>${cmpTag(pv.id,x.name,CM)}<small>${money(x.price)} / ud.<span id="npqSub${i}">${q?' · Subtotal: '+money(q*x.price):''}</span></small></div><div class="qty stock-qty"><button type="button" data-dir="npq-minus:${i}" aria-label="Quitar una unidad">−</button><input type="text" inputmode="numeric" data-npq="${i}" value="${q||0}" aria-label="Cantidad de ${esc(x.name)}"><button type="button" data-dir="npq-plus:${i}" aria-label="Añadir una unidad">+</button></div></div>`}).join('')})()}
  <div class="dir-sec-title">${(npProv()&&(npProv().prods||[]).length)?'OTROS MATERIALES (OPCIONAL)':'MATERIALES'}</div><datalist id="matList">${mats.map(m=>`<option value="${esc(m)}"></option>`).join('')}</datalist>
  ${npDraft.rows.map((r,i)=>`<div class="np-row"><input class="np-mat" data-np="m" data-i="${i}" list="matList" type="text" maxlength="40" autocomplete="off" placeholder="Material" value="${esc(r.m)}"><input data-np="q" data-i="${i}" inputmode="numeric" placeholder="Cantidad" value="${esc(r.q)}"><div class="money"><i>$</i><input data-np="p" data-i="${i}" inputmode="decimal" placeholder="Precio" value="${esc(r.p)}"></div><div class="emp-btns"><button type="button" class="warn" data-dir="np-delrow:${i}" aria-label="Quitar">✕</button></div><div class="np-sub" id="npSub${i}">${money((parseInt(r.q)||0)*Math.round((parsePrice(r.p)||0)*100))}</div></div>`).join('')}
  <div class="enc-actions"><button type="button" data-dir="np-addrow">+ AÑADIR MATERIAL</button></div>
  <div class="brow due" style="margin-top:8px"><span>TOTAL DEL PEDIDO</span><span id="npTotal">${money(npTotal())}</span></div>
  <label>¿YA ESTÁ PAGADO?<select id="npPaid"><option value="0"${npDraft.paid==='0'?' selected':''}>NO PAGADO</option><option value="1"${npDraft.paid==='1'?' selected':''}>PAGADO</option></select></label>
  <div class="pay-err" id="npErr" hidden></div>
  <div class="enc-actions"><button type="button" class="primary" data-dir="np-emit">EMITIR PEDIDO</button></div></div>
  <p class="bk-note">Al emitirlo se publica en el canal de Discord «Pedidos» con cada producto, su precio por unidad, el total de cada línea y el total del pedido. Queda pendiente de recibir y aparece en el botón PEDIDOS de todos los empleados. Si lo dejas «no pagado», quien lo reciba lo marcará como pagado.</p>`;
}
function emitPedido(){
 const err=t=>{const e=document.getElementById('npErr');e.textContent=t;e.hidden=false}, prov=proveedores.find(x=>x.id===npDraft.prov);
 if(!prov)return err('Selecciona el proveedor');
 const items=[];
 (prov.prods||[]).forEach(x=>{const q=npDraft.lq[x.name]||0;if(q>0)items.push({material:x.name,qty:q,price:x.price})});
 for(const r of npDraft.rows){
  if(!r.m.trim()&&!r.q&&!r.p)continue;
  const q=Number(r.q), pr=parsePrice(r.p);
  if(!r.m.trim())return err('Cada línea necesita el nombre del material');
  if(!(Number.isInteger(q)&&q>0))return err('La cantidad de «'+r.m.trim()+'» debe ser un número entero mayor que 0');
  if(pr===null||pr<=0)return err('El precio de «'+r.m.trim()+'» debe ser mayor que 0');
  items.push({material:r.m.trim().replace(/\s+/g,' '),qty:q,price:Math.round(pr*100)});
 }
 if(!items.length)return err('Indica la cantidad de al menos un producto');
 const total=items.reduce((a,x)=>a+x.qty*x.price,0), now=Date.now(), m=madridParts(now), paid=npDraft.paid==='1';
 const rec={id:'p'+now.toString(36)+Math.random().toString(36).slice(2,5),code:`PED-${m.day}${m.month}${m.year.slice(-2)}-${m.hour}${m.minute}`,ts:now,date:`${m.day}/${m.month}/${m.year}`,time:`${m.hour}:${m.minute}`,proveedorId:prov.id,proveedor:prov.name,proveedorTel:prov.tel||'',proveedorTipo:prov.tipo||'',items:items,totalCents:total,paid:paid,paidInitial:paid,paidBy:paid?'Jefe':'',paidAt:paid?now:0,received:false,receivedBy:'',receivedAt:0,completedAt:0,cancelled:false};
 savePed(rec);(async()=>{let blob=null;try{blob=await pedidoBlob(rec)}catch(e){}discordSend('pedidos',pedidoText(rec,'NUEVO PEDIDO A PROVEEDOR'),blob,'Pedido_'+rec.code+'.png')})();
 npDraft={prov:'',rows:[{m:'',q:'',p:''}],paid:'0',lq:{}};renderDir();say('Pedido emitido: '+rec.code);
}
/* --- Registro de pedidos completados --- */
function pedidosIn(r){return pedidos.filter(x=>{if(!x.completedAt)return false;const m=madridParts(x.completedAt),d=dayNum(+m.year,+m.month,+m.day);return d>=r.s&&d<=r.e})}
function pedidosDoc(){
 const pi=periodInfo('p'), L=pedidosIn(pi.r), line='────────────────────', now=Date.now();
 const o=['HARRINGTON GUNSMITH','REGISTRO DE PEDIDOS A PROVEEDORES · '+pi.kind,'Saint Denis · 1880','',(pi.sem?'Semana: ':'Día: ')+pi.label,'Generado: '+fmtDate(now)+' '+fmtTime(now),''];
 L.forEach(r=>{
  o.push(`${r.code} · ${r.proveedor}${r.proveedorTipo?' ('+r.proveedorTipo+')':''}`,'Completado: '+fmtDate(r.completedAt)+' '+fmtTime(r.completedAt));
  r.items.forEach(x=>o.push(`  ${x.qty} × ${x.material} · ${money(x.price)} = ${money(x.qty*x.price)}`));
  o.push('Total: '+money(r.totalCents),'Recibido por: '+(r.receivedBy||'—')+' · Pagado por: '+(r.paidBy||'—'),'');
 });
 if(!L.length)o.push('Sin pedidos completados en este periodo.','');
 o.push(line,'Pedidos: '+L.length,'TOTAL EN PEDIDOS: '+money(L.reduce((a,x)=>a+x.totalCents,0)),line,'','El precio de un apellido.');
 return o.join('\n');
}
function renderModRegPedidos(){
 const pi=periodInfo('p'), L=pedidosIn(pi.r), pend=pendingPed();
 return `${periodBar('p')}<div class="dir-sec-title" style="margin-top:0">PEDIDOS COMPLETADOS (${L.length})</div>`+
  (L.length?L.slice().reverse().map(r=>`<div class="enc-card dir-item"><div class="t">${esc(r.proveedor)}</div><div class="it">${esc(r.code)} · completado ${esc(fmtDate(r.completedAt))} ${esc(fmtTime(r.completedAt))}<br>${r.items.map(x=>`${x.qty} × ${esc(x.material)}`).join(', ')}</div><div class="enc-money"><span>Total: <b>${money(r.totalCents)}</b></span><span>Recibido: ${esc(r.receivedBy||'—')}</span><span>Pagado: ${esc(r.paidBy||'—')}</span></div></div>`).join(''):'<div class="enc-empty">No hay pedidos completados en este periodo.</div>')+
  `<div class="brow due"><span>TOTAL EN PEDIDOS</span><span>${money(L.reduce((a,x)=>a+x.totalCents,0))}</span></div>
  <p class="bk-note">Hay ${pend.length} ${pend.length===1?'pedido pendiente':'pedidos pendientes'} de recibir o pagar. Al completarse, cada pedido entra también en el registro y el balance de gastos como «Proveedor».</p>${repButtons('p')}`;
}
dirModal.addEventListener('input',e=>{
 const t=e.target, id=t.id, d=t.dataset||{};
 if(id==='pvName')pvDraft.name=t.value;
 else if(id==='pvTel'){const v=sanitizeTelegram(t.value);t.value=v;pvDraft.tel=v}
 else if(id==='pvTipo')pvDraft.tipo=t.value;
 else if(id==='pvUbic')pvDraft.ubic=t.value;
 else if(d.pvp){
  const i=+d.i, L=pvDraft.prods||(pvDraft.prods=[]);while(L.length<=i)L.push({n:'',p:''});
  if(d.pvp==='n')L[i].n=t.value;else{const v=t.value.replace(/[^0-9.,]/g,'');if(v!==t.value)t.value=v;L[i].p=v}
  const box=document.getElementById('pvList'), n=box?box.children.length:0;
  if(box&&i===n-1&&(L[i].n||L[i].p)&&n<MAX_PPROD){L.push({n:'',p:''});box.insertAdjacentHTML('beforeend',pvRowHTML({n:'',p:''},n))}
  const cnt=document.getElementById('pvCount');if(cnt)cnt.textContent=L.filter(r=>r.n).length;
 }
 else if(d.npq!==undefined){
  const v=t.value.replace(/[^0-9]/g,'').slice(0,6);if(v!==t.value)t.value=v;
  const pv=proveedores.find(x=>x.id===npDraft.prov), pr=pv&&(pv.prods||[])[+d.npq]; if(!pr)return;
  if(+v>0)npDraft.lq[pr.name]=+v;else delete npDraft.lq[pr.name];
  npRefresh(+d.npq);
 }
 else if(d.np){
  const r=npDraft.rows[+d.i]; if(!r)return;
  if(d.np==='m')r.m=t.value;
  else if(d.np==='q'){const v=t.value.replace(/[^0-9]/g,'').slice(0,6);t.value=v;r.q=v}
  else{const v=t.value.replace(/[^0-9.,]/g,'');t.value=v;r.p=v}
  const sub=document.getElementById('npSub'+d.i);if(sub)sub.textContent=money((parseInt(r.q)||0)*Math.round((parsePrice(r.p)||0)*100));
  const tot=document.getElementById('npTotal');if(tot)tot.textContent=money(npTotal());
 }
});
dirModal.addEventListener('change',e=>{if(e.target.id==='npProv'){npDraft.prov=e.target.value;npDraft.lq={};renderDir()}else if(e.target.id==='npPaid')npDraft.paid=e.target.value});
let empErr='', stockCat='todos', stockDraft={};
/* --- Fabricación: recetas de cada producto --- */
let fabEdit=null, fabDraft=[], fabCat='todos', mminDraft={}, fabWant='';
function fabRows(){const L=fabDraft.filter(r=>r.m||r.q);if(L.length<matNames().length)L.push({m:'',q:''});fabDraft=L;return L}
function fabRowHTML(r,i){const ns=matNames();return `<div class="fab-row"><select data-fab="m" data-i="${i}" aria-label="Material"><option value="">Material…</option>${ns.map(n=>`<option value="${esc(n)}"${r.m===n?' selected':''}>${esc(n)}</option>`).join('')}${r.m&&ns.indexOf(r.m)<0?`<option value="${esc(r.m)}" selected>${esc(r.m)}</option>`:''}</select><input data-fab="q" data-i="${i}" inputmode="numeric" maxlength="5" autocomplete="off" placeholder="Unidades" value="${esc(r.q)}"></div>`}
function canMake(name){const r=recipeOf(name);if(!r.length)return null;return Math.min(...r.map(x=>Math.floor((stockMap[matKey(x.m)]||0)/x.q)))}
function renderModFabricacion(){
 const ns=matNames();
 if(fabEdit){
  const i=inputs.find(x=>x.dataset.name===fabEdit);
  return `<div class="dir-form enc-sec"><div class="dir-sec-title" style="margin-top:0">RECETA · ${esc(fabEdit.toUpperCase())}</div>
   ${ns.length?`<p class="bk-note" style="margin:0 0 8px">Elige cada material y cuántas unidades gasta <b>una</b> unidad de este producto. Al elegir un material aparece otro hueco.</p><div id="fabList">${fabRows().map((r,k)=>fabRowHTML(r,k)).join('')}</div>`:'<div class="enc-empty">Todavía no hay materiales en el almacén.<br>Aparecen solos al recibir los pedidos a proveedores.</div>'}
   <div class="pay-err" id="fabErr" hidden></div>
   <div class="enc-actions two" style="margin-top:8px"><button type="button" data-dir="fab-cancel">Cancelar</button><button type="button" class="primary" data-dir="fab-save">ACEPTAR</button></div>
   ${recipeOf(fabEdit).length?'<div class="enc-actions" style="margin-top:8px"><button type="button" class="warn" data-dir="fab-clear">QUITAR RECETA</button></div>':''}</div>
   ${recipeOf(fabEdit).length?`<div class="dir-form enc-sec"><div class="dir-sec-title" style="margin-top:0">¿QUÉ ME FALTA?</div>
   ${costLine(fabEdit)?`<p class="bk-note" style="margin:0 0 8px">${costLine(fabEdit)}</p>`:''}
   <label>QUIERO FABRICAR (UNIDADES)<input id="fabWant" inputmode="numeric" maxlength="5" autocomplete="off" placeholder="Ej.: 10" value="${esc(fabWant)}"></label>
   <div id="fabNeed">${fabNeedHTML()}</div></div>`:''}`;
 }
 const cats=[...document.querySelectorAll('.cat-nav .cat-btn')].map(b=>`<button type="button" class="cat-btn ${b.dataset.cat===fabCat?'active':''}" data-dir="fcat:${b.dataset.cat}"><img src="${esc(b.querySelector('img').getAttribute('src'))}" alt="${esc(b.title)}"></button>`).join('');
 const rows=inputs.map((inp,idx)=>({n:inp.dataset.name,idx:idx,cat:inp.closest('.product').dataset.cat})).filter(x=>fabCat==='todos'||x.cat===fabCat).map(x=>{
  const rc=recipeText(x.n), cm=canMake(x.n), cl=costLine(x.n);
  return `<button type="button" class="enc-card fab-item" data-q="${esc(norm(x.n+' '+rc))}" data-dir="fab-open:${x.idx}"><div class="t">${esc(x.n)}</div><div class="it">${rc?'Receta: '+esc(rc)+`<br>Con el almacén actual: <b>${cm}</b> ${cm===1?'unidad':'unidades'}`+(cl?'<br>'+cl:''):'Sin receta (no gasta materiales)'}</div></button>`;
 }).join('');
 const low=lowMats();
 const mins=ns.length?`<details class="mat-mins"${low.length?' open':''}><summary>ALMACÉN Y MÍNIMOS DE MATERIALES${low.length?` · <span class="neg">${low.length} bajo mínimo</span>`:''}</summary>${ns.map(n=>{const v=stockMap[matKey(n)]||0,mn=stockMin[matKey(n)]||0,c=matCost(n);return `<div class="stock-row"><div><b><span class="dot ${v<=0?'r':(mn>0&&v<=mn?'a':'g')}"></span>${esc(n)}</b><small>Hay ${v} · ${c!==null?money(c)+' / ud.':'sin precio'}</small></div><label class="minlbl">Mínimo <input class="min-in" type="text" inputmode="numeric" data-mmin="${esc(n)}" value="${esc(mminDraft[n]!==undefined?mminDraft[n]:(mn||''))}" placeholder="0" aria-label="Mínimo de ${esc(n)}"></label></div>`}).join('')}<div class="enc-actions" style="margin-top:8px"><button type="button" data-dir="mmin-save">GUARDAR MÍNIMOS</button></div></details>`:'';
 return `<p class="bk-note">Toca un producto para indicar qué materiales gasta al fabricarlo. Cuando sumes unidades en STOCK, se restarán solos del almacén de MATERIALES. Hay ${ns.length} ${ns.length===1?'material':'materiales'} en el almacén.</p>${mins}${searchBox('⌕  Buscar producto…')}<div class="cat-nav stock-cats">${cats}</div>${rows}`;
}
function fabNeedHTML(){
 const n=parseInt(fabWant)||0;if(!fabEdit||n<=0)return '<p class="bk-note" style="margin:0">Escribe cuántas quieres fabricar y te digo qué materiales faltan.</p>';
 const r=recipeOf(fabEdit), miss=[];
 const rows=r.map(x=>{const need=x.q*n, have=stockMap[matKey(x.m)]||0, f=Math.max(0,need-have);if(f)miss.push({m:x.m,q:f});return `<div class="reg-line"><span>${esc(x.m)}</span><b class="${f?'zero':''}">${have} de ${need}${f?' · faltan '+f:' ✓'}</b></div>`}).join('');
 if(!miss.length)return rows+'<p class="bk-note" style="margin:8px 0 0">Hay material suficiente: súmalas en STOCK para fabricarlas.</p>';
 const by={}, none=[];
 miss.forEach(x=>{const v=proveedores.find(p=>(p.prods||[]).some(y=>norm(y.name)===norm(x.m)));if(v)(by[v.id]=by[v.id]||[]).push(x);else none.push(x)});
 return rows+Object.keys(by).map(id=>{const v=proveedores.find(p=>p.id===id);return `<div class="enc-actions" style="margin-top:8px"><button type="button" class="primary" data-dir="fab-order:${esc(id)}">PREPARAR PEDIDO A ${esc(v.name.toUpperCase())} (${by[id].map(x=>x.q+' '+esc(x.m)).join(', ')})</button></div>`}).join('')+
  (none.length?`<p class="bk-note" style="margin:8px 0 0">Ningún proveedor tiene en su lista: ${none.map(x=>esc(x.m)).join(', ')}. Añádelo a la lista de un proveedor o pídelo en «Otros materiales».</p>`:'');
}
function fabOrder(provId){
 const v=proveedores.find(p=>p.id===provId), n=parseInt(fabWant)||0; if(!v||!fabEdit||n<=0)return;
 const lq={};recipeOf(fabEdit).forEach(x=>{const f=Math.max(0,x.q*n-(stockMap[matKey(x.m)]||0));if(!f)return;const pr=(v.prods||[]).find(y=>norm(y.name)===norm(x.m));if(pr)lq[pr.name]=f});
 npDraft={prov:v.id,rows:[{m:'',q:'',p:''}],paid:'0',lq:lq};
 fabEdit=null;fabDraft=[];dirMod='nuevopedido';renderDir();dirModal.scrollTop=0;say('Pedido preparado: revísalo y emítelo');
}
function saveMatMins(){
 let n=0;Object.keys(mminDraft).forEach(m=>{const v=parseInt(mminDraft[m])||0,k=matKey(m);if((stockMin[k]||0)!==v){if(v)stockMin[k]=v;else delete stockMin[k];n++}});
 mminDraft={};saveStockMin();renderDir();say(n?'Mínimos guardados':'No hay cambios');invSchedule('materiales');
}
function saveReceta(){
 const err=t=>{const e=document.getElementById('fabErr');e.textContent=t;e.hidden=false};
 const out=[], seen={};
 for(const r of fabDraft){
  if(!r.m&&!r.q)continue;
  if(!r.m)return err('Elige el material de la línea con '+r.q+' unidades');
  const q=Number(r.q);
  if(!(Number.isInteger(q)&&q>0))return err('Indica cuántas unidades de «'+r.m+'» gasta');
  if(seen[r.m])return err('«'+r.m+'» está repetido');
  seen[r.m]=1;out.push({m:r.m,q:q});
 }
 if(out.length)recetas[fabEdit]=out;else delete recetas[fabEdit];
 saveRecetas();say(out.length?'Receta guardada':'Receta vacía: no gasta materiales');fabEdit=null;fabDraft=[];renderDir();
}
const PUESTOS=['Jefe','Gerente','Armero experto','Armero','Aprendiz de armero'];
function isoToday(){const m=madridParts(Date.now());return `${m.year}-${m.month}-${m.day}`}
function isoAdd(iso,days){const t=String(iso).split('-').map(Number);return new Date(Date.UTC(t[0],t[1]-1,t[2]+days)).toISOString().slice(0,10)}
let empDraft={name:'',puesto:'',sueldo:'',inicio:'',horas:'10'}, eeDraft=null;
function empHasContract(e){return !!(e&&e.puesto&&e.sueldo>0&&e.inicio)}
function empFields(d,p){
 return `<label>NOMBRE DEL EMPLEADO<input id="${p}Name" type="text" maxlength="40" autocomplete="off" placeholder="Nombre y apellido" value="${esc(d.name)}"></label>
  <label>PUESTO<select id="${p}Puesto"><option value="">Seleccionar puesto…</option>${PUESTOS.map(x=>`<option value="${x}"${d.puesto===x?' selected':''}>${x.toUpperCase()}</option>`).join('')}</select></label>
  <label>SUELDO SEMANAL ($)<div class="money"><i>$</i><input id="${p}Sueldo" inputmode="decimal" placeholder="Ej.: 20" autocomplete="off" value="${esc(d.sueldo)}"></div></label>
  <label>HORAS SEMANALES<input id="${p}Horas" inputmode="numeric" maxlength="3" autocomplete="off" placeholder="10" value="${esc(d.horas)}"></label>
  <label>FECHA DE INICIO DEL CONTRATO<input id="${p}Inicio" type="date" value="${esc(d.inicio)}"></label>
  <div class="enc-note" id="${p}Prueba">${pruebaTxt(d.inicio)}</div>`;
}
function pruebaTxt(iso){return /^\d{4}-\d{2}-\d{2}$/.test(iso||'')?`Periodo de prueba: <b>1 semana</b>, del ${fmtISO(iso)} al ${fmtISO(isoAdd(iso,6))}.`:'Periodo de prueba: 1 semana desde la fecha de inicio.'}
function renderModEmpleados(){
 setTimeout(()=>{loadPresence();loadClaves();loadPhotos()},0);
 if(!empDraft.inicio)empDraft.inicio=isoToday();
 const card=e=>{
  if(eeDraft&&eeDraft.id===e.id)return `<div class="dir-form enc-sec"><div class="dir-sec-title" style="margin-top:0">EDITAR EMPLEADO</div>${empFields(eeDraft,'ee')}
   <label class="chk"><input type="checkbox" id="eeSend"${eeDraft.send?' checked':''}>Publicar el contrato actualizado en Discord</label>
   <div class="pay-err" id="eeErr" hidden></div>
   <div class="enc-actions two"><button type="button" data-dir="emp-cancel">Cancelar</button><button type="button" class="primary" data-dir="emp-save:${esc(e.id)}">GUARDAR</button></div></div>`;
  const ok=empHasContract(e);
  return `<div class="enc-card dir-item"><div class="t">${esc(e.name)}</div><div class="it">${ok?`${esc(e.puesto.toUpperCase())} · ${money(e.sueldo)} a la semana · ${e.horas||10} h semanales<br>Inicio: ${fmtISO(e.inicio)} · ${e.sinPrueba?'sin periodo de prueba (ascendido)':'prueba hasta el '+fmtISO(e.prueba||isoAdd(e.inicio,6))}`:'<span class="lowtag">FALTAN LOS DATOS DEL CONTRATO</span> Pulsa EDITAR para completarlos.'}</div>
   <div class="enc-actions emp3"><button type="button" data-dir="emp-edit:${esc(e.id)}">✎ EDITAR</button><button type="button" data-dir="emp-ct:${esc(e.id)}"${ok?'':' disabled'}>📜 CONTRATO</button><button type="button" class="warn" data-dir="emp-del:${esc(e.id)}">🗑 PAPELERA</button></div><div class="enc-actions"><button type="button" data-dir="emp-ficha:${esc(e.id)}">📋 FICHA COMPLETA</button></div>${ok&&ASCENSO[e.puesto]?`<div class="enc-actions"><button type="button" class="gold" data-dir="emp-up:${esc(e.id)}">⬆ ASCENSO A ${esc(ASCENSO[e.puesto].toUpperCase())} · ${money(SUELDO_PUESTO[ASCENSO[e.puesto]])}</button></div>`:''}${empExtra(e)}</div>`;
 };
 return `<div class="dir-form enc-sec"><div class="dir-sec-title" style="margin-top:0">NUEVO EMPLEADO</div>${empFields(empDraft,'emp')}
  <div class="pay-err" id="empErr"${empErr?'':' hidden'}>${esc(empErr)}</div>
  <div class="enc-actions"><button type="button" class="primary" data-dir="emp-add">ACEPTAR Y CREAR CONTRATO</button></div>
  <p class="bk-note" style="margin:8px 0 0">Al aceptar se publica la imagen del contrato en el canal de Discord «Empleados».</p></div>
  <div class="dir-sec-title">EMPLEADOS (${empleados.length})</div>`+(empleados.length?empleados.map(card).join(''):'<div class="enc-empty">No hay empleados.<br>Añade al menos uno para poder finalizar ventas.</div>');
}
function empNameTaken(name,exceptId){return empleados.some(e=>e.id!==exceptId&&norm(e.name)===norm(name))}
function empCheck(d,exceptId){
 const name=String(d.name||'').trim().replace(/\s+/g,' '), sueldo=parseMoney(d.sueldo);
 if(!name)return {err:'Escribe el nombre del empleado'};
 if(empNameTaken(name,exceptId))return {err:'Ya existe un empleado con ese nombre'};
 if(!d.puesto)return {err:'Selecciona el puesto'};
 if(!(sueldo>0))return {err:'Escribe el sueldo semanal'};
 const horas=Number(d.horas);
 if(!(Number.isInteger(horas)&&horas>0&&horas<=168))return {err:'Escribe las horas semanales (un número entero)'};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d.inicio||''))return {err:'Indica la fecha de inicio del contrato'};
 return {name:name,puesto:d.puesto,sueldo:sueldo,horas:horas,inicio:d.inicio,prueba:isoAdd(d.inicio,6)};
}
function empAdd(){
 const c=empCheck(empDraft,null);
 if(c.err){empErr=c.err;return renderDir()}
 const e=Object.assign({id:'e'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),alta:Date.now()},c);
 empleados.push(e);saveEmp();empErr='';empDraft={name:'',puesto:'',sueldo:'',inicio:isoToday(),horas:'10'};renderDir();renderCustomer();
 say('Empleado añadido');sendContract(e);
}
function empSave(id){
 const e=empleados.find(x=>x.id===id); if(!e||!eeDraft)return;
 const c=empCheck(eeDraft,id), errEl=document.getElementById('eeErr');
 if(c.err){errEl.textContent=c.err;errEl.hidden=false;return}
 const send=eeDraft.send;
 Object.assign(e,c);if(!e.alta)e.alta=Date.now();if(e.sinPrueba)e.prueba='';
 saveEmp();eeDraft=null;renderDir();renderCustomer();say('Empleado actualizado');
 if(send)sendContract(e);
}
async function empDelete(id){
 const e=empleados.find(x=>x.id===id); if(!e)return;
 if(!await askConfirm('Eliminar empleado',`«${e.name}» dejará de aparecer para nuevas ventas.`,'Eliminar'))return;
 empleados=empleados.filter(x=>x.id!==id);saveEmp();renderDir();renderCustomer();say('Empleado eliminado');
}
function contractText(e){
 return ['CONTRATO DE TRABAJO · HARRINGTON GUNSMITH','Empleado: '+e.name,'Puesto: '+e.puesto,'Sueldo semanal: '+money(e.sueldo),'Horas semanales: '+(e.horas||10),'Inicio del contrato: '+fmtISO(e.inicio),e.sinPrueba?'Periodo de prueba: no (contrato por ascenso)':'Periodo de prueba: 1 semana (del '+fmtISO(e.inicio)+' al '+fmtISO(e.prueba||isoAdd(e.inicio,6))+')'].join('\n');
}
async function sendContract(e,asc){
 if(!(webhook.urls.empleados||webhook.url)||!webhook.ev.empleados)return;
 let blob=null;try{blob=await contractBlob(e)}catch(x){}
 const up=asc&&e.ascensos&&e.ascensos[e.ascensos.length-1];
 discordSend('empleados',(up?'ASCENSO · '+e.name+': '+up.de+' → '+up.a+'\nNuevo sueldo: '+money(up.nuevo)+' (desde el '+dayStr(up.desde)+')\n\n':'')+contractText(e),blob,'Contrato_'+e.name.replace(/[^A-Za-z0-9áéíóúüñÁÉÍÓÚÜÑ_-]+/g,'_')+'.png',true);
}
async function downloadContract(id){
 const e=empleados.find(x=>x.id===id); if(!e||!empHasContract(e))return;
 const blob=await contractBlob(e); if(!blob)return say('No se pudo crear la imagen');
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Contrato_'+e.name.replace(/[^A-Za-z0-9áéíóúüñÁÉÍÓÚÜÑ_-]+/g,'_')+'.png';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
 say('Contrato descargado');
}
/* Imagen del contrato, en papel con lacre, como el ticket */
async function contractBlob(e){
 try{
  const W=720,P=46,ink='#2a1a0d',sep='#7a5a22',ff="'IM Fell English',Georgia,'Times New Roman',serif",fb="'Cinzel Decorative',Georgia,serif";
  try{await document.fonts.load("bold 30px 'Cinzel Decorative'");await document.fonts.load("20px 'IM Fell English'");await document.fonts.load("italic 20px 'IM Fell English'")}catch(x){}
  const emb=await loadImage('emblema-harrington.png'), H=1280, c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  const grd=g.createLinearGradient(0,0,0,H);grd.addColorStop(0,'#efe0b4');grd.addColorStop(1,'#d8bd84');g.fillStyle=grd;g.fillRect(0,0,W,H);
  const vg=g.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,H*.75);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(90,55,15,.22)');g.fillStyle=vg;g.fillRect(0,0,W,H);wmark(g,W,600);
  let y=P+10;
  const ctr=(t,font,col,dy)=>{g.font=font;g.fillStyle=col;g.textAlign='center';g.fillText(t,W/2,y);y+=dy};
  const wrap=(t,font,col,lh)=>{g.font=font;g.fillStyle=col;g.textAlign='left';const words=String(t).split(' ');let line='';words.forEach(w=>{const tt=line?line+' '+w:w;if(g.measureText(tt).width>W-2*P&&line){g.fillText(line,P,y);y+=lh;line=w}else line=tt});if(line){g.fillText(line,P,y);y+=lh}};
  const hr=(lw)=>{g.strokeStyle=sep;g.lineWidth=lw||1.5;g.beginPath();g.moveTo(P,y);g.lineTo(W-P,y);g.stroke()};
  if(emb){const eh=86,ew=emb.width*eh/emb.height;g.drawImage(emb,(W-ew)/2,y,ew,eh);y+=eh+34}else y+=16;
  ctr('HARRINGTON GUNSMITH','bold 32px '+fb,'#1b3022',30);
  ctr('Saint Denis · 1880','17px '+ff,'#6b4c1d',24);
  ctr('◆ ─── ✦ ─── ◆','16px '+ff,sep,40);
  ctr('CONTRATO DE TRABAJO','bold 26px '+fb,ink,34);
  hr(2);y+=34;
  wrap('Por el presente documento, la casa Harrington Gunsmith, armería establecida en Saint Denis, incorpora a su servicio a:','19px '+ff,ink,27);
  y+=18;ctr(e.name,'bold 34px '+ff,'#1b3022',22);
  g.strokeStyle=sep;g.lineWidth=1;g.beginPath();g.moveTo(W/2-170,y);g.lineTo(W/2+170,y);g.stroke();y+=42;
  const kv=(k,v)=>{g.textAlign='left';g.font='14px '+fb;g.fillStyle='#6b4c1d';g.fillText(k,P,y);g.textAlign='right';g.font='bold 21px '+ff;g.fillStyle=ink;g.fillText(v,W-P,y);y+=12;g.strokeStyle='rgba(122,90,34,.35)';g.lineWidth=1;g.beginPath();g.moveTo(P,y);g.lineTo(W-P,y);g.stroke();y+=30};
  kv('PUESTO',e.puesto);
  kv('SUELDO SEMANAL',money(e.sueldo)+' a la semana');
  kv('HORAS SEMANALES',(e.horas||10)+' horas a la semana');
  kv('INICIO DEL CONTRATO',fmtISO(e.inicio));
  kv('PERIODO DE PRUEBA',e.sinPrueba?'Sin periodo de prueba':'1 semana · hasta el '+fmtISO(e.prueba||isoAdd(e.inicio,6)));
  y+=6;
  wrap('El empleado se compromete a desempeñar su oficio con diligencia, honradez y lealtad a la casa, y a guardar el debido cuidado con las armas, la munición y la caja. La casa abonará el sueldo pactado cada semana.','18px '+ff,ink,26);
  y+=6;
  {const up=e.sinPrueba&&e.ascensos&&e.ascensos[e.ascensos.length-1];wrap(up?'Contrato por ascenso de '+up.de+' a '+up.a+'. Sustituye al anterior y rige desde el '+dayStr(up.desde)+'.':'Durante el periodo de prueba, cualquiera de las partes podrá dar por terminada esta relación sin más aviso.','italic 18px '+ff,'#4a3417',26)}
  y+=18;
  const f=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',day:'numeric',month:'long',year:'numeric'}).format(e.alta||Date.now());
  ctr('En Saint Denis, a '+f+'.','18px '+ff,ink,64);
  const sx=[P+130,W-P-130];
  g.strokeStyle=ink;g.lineWidth=1.2;sx.forEach(x=>{g.beginPath();g.moveTo(x-120,y);g.lineTo(x+120,y);g.stroke()});
  g.textAlign='center';g.font='italic 24px '+ff;g.fillStyle='#24324a';g.fillText(e.name,sx[0],y-10);g.fillText('Harrington',sx[1],y-10);
  y+=24;g.font='14px '+fb;g.fillStyle='#6b4c1d';g.fillText('EL EMPLEADO',sx[0],y);g.fillText('POR LA DIRECCIÓN',sx[1],y);
  y+=70;
  const cx=W/2,cy=y,rg=g.createRadialGradient(cx-10,cy-10,5,cx,cy,42);rg.addColorStop(0,'#c0402a');rg.addColorStop(.65,'#7a1608');rg.addColorStop(1,'#4d0d05');
  g.fillStyle=rg;g.beginPath();g.arc(cx,cy,42,0,Math.PI*2);g.fill();g.strokeStyle='rgba(61,10,4,.8)';g.lineWidth=2;g.beginPath();g.arc(cx,cy,32,0,Math.PI*2);g.stroke();
  g.font='bold 40px Georgia,serif';g.textAlign='center';g.fillStyle='#3d0a04';g.fillText('H',cx+1.5,cy+15);g.fillStyle='#e0705a';g.fillText('H',cx,cy+13.5);
  y+=66;
  const out=document.createElement('canvas');out.width=W;out.height=Math.min(H,Math.round(y));const o=out.getContext('2d');o.drawImage(c,0,0,W,out.height,0,0,W,out.height);
  o.strokeStyle=sep;o.lineWidth=3;o.strokeRect(12,12,W-24,out.height-24);o.lineWidth=1;o.strokeRect(19,19,W-38,out.height-38);
  return await new Promise(res=>out.toBlob(res,'image/png'));
 }catch(x){return null}
}
function renderModStock(){
 const cats=[...document.querySelectorAll('.cat-nav .cat-btn')].map(b=>`<button type="button" class="cat-btn ${b.dataset.cat===stockCat?'active':''}" data-dir="scat:${b.dataset.cat}"><img src="${esc(b.querySelector('img').getAttribute('src'))}" alt="${esc(b.title)}"></button>`).join('');
 const rows=inputs.map((inp,idx)=>({inp:inp,idx:idx,cat:inp.closest('.product').dataset.cat})).filter(x=>stockCat==='todos'||x.cat===stockCat).map(x=>{
  const n=x.inp.dataset.name;
  const rc=recipeText(n);
  return `<div class="stock-row"><div><b><span class="dot ${dotCls(n)}"></span>${esc(n)}</b>${rc?`<small class="rc">Receta: ${esc(rc)}</small>`:''}<small>Stock actual: ${stockMap[n]||0}${(stockMin[n]||0)>0&&(stockMap[n]||0)<=(stockMin[n]||0)?' <span class="lowtag">BAJO</span>':''}</small><label class="minlbl">Mínimo <input class="min-in" type="text" inputmode="numeric" data-min="${esc(n)}" value="${esc(minDraft[n]!==undefined?minDraft[n]:(stockMin[n]||''))}" placeholder="0" aria-label="Stock mínimo"></label></div><div class="qty stock-qty"><button type="button" data-dir="sminus:${x.idx}" aria-label="Quitar una unidad">−</button><input type="text" inputmode="numeric" data-stock="${esc(n)}" value="${esc(stockDraft[n]||'0')}" aria-label="Unidades a añadir"><button type="button" data-dir="splus:${x.idx}" aria-label="Añadir una unidad">+</button></div></div>`;
 }).join('');
 const lf=lastFab();
 return `${lf?`<div class="enc-actions" style="margin-bottom:8px"><button type="button" class="warn" data-dir="fab-undo">↶ DESHACER ÚLTIMA FABRICACIÓN (${esc(lf.items.map(x=>x.delta+' × '+x.producto).join(', '))} · ${ago(lf.ts)})</button></div>`:''}<p class="bk-note">Al sumar unidades de un producto con receta (Dirección → FABRICACIÓN) se gastan sus materiales del almacén. Antes te pide confirmación, y durante ${UNDO_MIN} minutos puedes deshacerlo. Si falta algún material, no se suma nada.</p><div class="cat-nav stock-cats">${cats}</div>${rows}<div class="pay-err" id="stErr" hidden></div><div class="enc-actions" style="margin-top:12px"><button type="button" class="primary" data-dir="stock-save">GUARDAR STOCK</button></div>`;
}
function renderModRegistroStock(){
 const low=lowStock();
 const lowHTML=low.length?`<div class="dir-sec-title" style="margin-top:0">PARA REPONER (${low.length})</div>`+low.map(n=>`<div class="reg-line"><span>${esc(n)}</span><b class="zero">${stockMap[n]||0} · mín. ${stockMin[n]}</b></div>`).join(''):'';
 const sections=[['ARMAS',['revolveres','pistolas','repetidoras','rifles','escopetas','blancas']],['MUNICIONES',['municion']],['SUMINISTROS',['suministros']]];
 const mv=loadLog(KEY_STOCKLOG).slice().reverse().slice(0,40);
 return lowHTML+sections.map(([title,cats])=>`<div class="dir-sec-title">${title}</div>`+inputs.filter(i=>cats.includes(i.closest('.product').dataset.cat)).map(i=>{
  const n=i.dataset.name, v=stockMap[n]||0, isLow=low.includes(n), mx=Math.max(...inputs.map(x=>stockMap[x.dataset.name]||0));
  return `<div class="reg-line lv"><span>${esc(n)}${isLow?' <span class="lowtag">BAJO</span>':''}${lvlBar(v,stockMin[n]||0,mx)}</span><b class="${v?'':'zero'}">${v} ${v===1?'unidad':'unidades'}</b></div>`;
 }).join('')).join('')+`<div class="dir-sec-title">ÚLTIMOS MOVIMIENTOS</div><div class="ledger">`+(mv.length?mv.map(x=>`<div class="dir-log"><b>${x.delta>0?'+':'−'}${Math.abs(x.delta)}</b> ${esc(x.name)}<br>${esc(x.why)} · ${esc(x.date)} ${esc(x.time)}</div>`).join(''):'<div class="enc-empty">Todavía no hay movimientos.</div>')+'</div>';
}
function needMaterials(items){const need={};items.forEach(x=>recipeOf(x.producto).forEach(r=>{need[r.m]=(need[r.m]||0)+r.q*x.delta}));return need}
function missingMaterials(need){return Object.keys(need).filter(k=>(stockMap[matKey(k)]||0)<need[k]).map(k=>`${k}: necesitas ${need[k]} y hay ${stockMap[matKey(k)]||0}`)}
async function saveStockDraft(){
 const items=[];let n=0,m=0;
 const err=t=>{const e=document.getElementById('stErr');if(e){e.innerHTML=t;e.hidden=false;e.scrollIntoView({block:'nearest'})}say('Faltan materiales para fabricar')};
 Object.keys(stockDraft).forEach(name=>{const q=parseInt(stockDraft[name])||0;if(q>0)items.push({producto:name,delta:q})});
 if(items.length){
  try{await refreshStock()}catch(e){}
  const need=needMaterials(items), miss=missingMaterials(need);
  if(miss.length)return err('<b>No hay materiales suficientes.</b> No se ha sumado nada.<br>'+miss.map(esc).join('<br>'));
  if(Object.keys(need).length&&!await askConfirm('Fabricar','Vas a fabricar: '+items.map(x=>x.delta+' × '+x.producto).join(', ')+'. Se gastarán del almacén: '+Object.keys(need).map(k=>need[k]+' '+k).join(', ')+'.','Fabricar'))return;
  const all=items.concat(Object.keys(need).map(k=>({producto:matKey(k),delta:-need[k]})));
  try{await moverStock(all,'Fabricación');items.forEach(x=>logStock(x.producto,x.delta,recipeOf(x.producto).length?'Fabricación':'Entrada de stock'));Object.keys(need).forEach(k=>logStock(k+' (material)',-need[k],'Fabricación'));n=items.length;
   if(Object.keys(need).length){try{localStorage.setItem('harrington_lastfab',JSON.stringify({ts:Date.now(),items:items,need:need}))}catch(x){}stampFx('FABRICADO');playAnvil()}}
  catch(e){
   if(String(e.message).indexOf('STOCK_INSUFICIENTE')>=0){try{await refreshStock()}catch(x){}return err('<b>No hay materiales suficientes</b> (otro dispositivo los acaba de gastar). No se ha sumado nada.<br>'+missingMaterials(needMaterials(items)).map(esc).join('<br>'))}
   return say('Sin conexión: no se puede guardar el stock ahora');
  }
 }
 Object.keys(minDraft).forEach(name=>{const v=parseInt(minDraft[name])||0;if((stockMin[name]||0)!==v){stockMin[name]=v;m++}});
 stockDraft={};minDraft={};saveStockMin();renderDir();calc(false);
 say(n||m?'Stock guardado':'No hay cambios que guardar');
}
const UNDO_MIN=10;
function lastFab(){try{const f=JSON.parse(localStorage.getItem('harrington_lastfab')||'null');return f&&Date.now()-f.ts<UNDO_MIN*60000?f:null}catch(e){return null}}
async function undoFab(){
 const f=lastFab(); if(!f)return say('Ya no se puede deshacer');
 if(!await askConfirm('Deshacer fabricación','Se quitarán del stock '+f.items.map(x=>x.delta+' × '+x.producto).join(', ')+' y se devolverán al almacén '+Object.keys(f.need).map(k=>f.need[k]+' '+k).join(', ')+'.','Deshacer'))return;
 const mv=f.items.map(x=>({producto:x.producto,delta:-x.delta})).concat(Object.keys(f.need).map(k=>({producto:matKey(k),delta:f.need[k]})));
 try{await moverStock(mv,'Fabricación deshecha');mv.forEach(x=>logStock(isMat(x.producto)?x.producto.slice(4)+' (material)':x.producto,x.delta,'Fabricación deshecha'))}
 catch(e){
  if(String(e.message).indexOf('STOCK_INSUFICIENTE')>=0)return say('No se puede deshacer: alguna de esas unidades ya se ha vendido');
  return say('Sin conexión: no se puede deshacer ahora');
 }
 try{localStorage.removeItem('harrington_lastfab')}catch(e){}
 renderDir();calc(false);say('Fabricación deshecha');
}
const DIR_SECCIONES=[['VENTAS Y CAJA',['ventas','semanales','gastos','sueldos','objetivo','balance','cierre']],['CATÁLOGO, PRECIOS Y CONVENIOS',['productos','convenios']],['ALMACÉN Y FABRICACIÓN',['stock','fabricacion','regstock']],['PROVEEDORES',['proveedores','nuevopedido','regpedidos']],['PERSONAL',['empleados','horarios','ausencias']],['CLIENTES',['clientes']],['SISTEMA',['revision','discord','nube','copia','reset']]];
let dirLast=null;
document.getElementById('dirModal').addEventListener('toggle',e=>{const d=e.target;if(!d.matches||!d.matches('details.mod-sec'))return;let st={};try{st=JSON.parse(localStorage.getItem('harrington_dirsec')||'{}')}catch(x){}if(d.open)st[d.dataset.sec]=1;else delete st[d.dataset.sec];try{localStorage.setItem('harrington_dirsec',JSON.stringify(st))}catch(x){}},true);
function renderDir(){
 try{return renderDir0()}finally{try{pzAfterRender()}catch(e){}}
}
function renderDir0(){
 const body=document.getElementById('dirBody'), title=document.getElementById('dirTitle');
 dirModal.querySelector('.enc-panel').classList.toggle('wide',!dirMod);
 if(dirLast!==dirMod){const fw=!!dirMod;body.classList.remove('pg-in','pg-back');void body.offsetWidth;body.classList.add(fw?'pg-in':'pg-back');dirLast=dirMod}
 if(!dirMod){
  title.textContent='CONSOLA DE DIRECCIÓN';
  const card=m=>`<button type="button" class="enc-card mod-card" data-dir="open:${m.id}"><svg class="mod-ico" viewBox="0 0 24 24" aria-hidden="true">${MOD_ICONS[m.id]||''}</svg><div><div class="t">${m.titulo}</div><div class="it">${m.desc}</div></div></button>`;
  let st={};try{st=JSON.parse(localStorage.getItem('harrington_dirsec')||'{}')}catch(e){}
  const used={}, secs=DIR_SECCIONES.map(([t,ids])=>{const L=ids.map(id=>DIRECCION_MODULOS.find(m=>m.id===id)).filter(Boolean);L.forEach(m=>used[m.id]=1);return [t,L]});
  const rest=DIRECCION_MODULOS.filter(m=>!used[m.id]&&!m.hidden);if(rest.length)secs.push(['OTROS',rest]);
  body.innerHTML=dirSearchHTML()+renderDashboard()+secs.filter(s=>s[1].length).map(([t,L])=>`<details class="mod-sec" data-sec="${esc(t)}"${st[t]?' open':''}><summary><span>${t}</span><small>${L.length}</small></summary><div class="mod-grid">${L.map(card).join('')}</div></details>`).join('')+
   '<div class="enc-actions" style="margin-top:6px"><button type="button" class="warn" data-dir="exit-boss">Salir del Modo Jefe</button></div>';
  return;
 }
 const m=DIRECCION_MODULOS.find(x=>x.id===dirMod);
 title.textContent=m.titulo;
 body.innerHTML='<div class="dir-top"><button type="button" class="enc-back" data-dir="back">◂ Consola de Dirección</button><button type="button" class="help-q" data-dir="help:'+m.id+'" aria-label="Ayuda de este apartado" title="Ayuda">? AYUDA</button></div>'+m.render();
}
function saveDiscForm(){
 const conv=dirForm==='convenio', err=t=>{const e=document.getElementById('dfErr');e.textContent=t;e.hidden=false};
 const nombre=document.getElementById('dfName').value.trim().replace(/\s+/g,' ');
 const type=conv?document.getElementById('dfType').value:'';
 const days=parseInt(document.getElementById('dfDays').value);
 const rec={id:'d'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),kind:dirForm,nombre:nombre,clientType:conv?type:''};
 if(!nombre)return err(conv?'Escribe el nombre del convenio':'Escribe el nombre de la oferta');
 if(conv){
  if(!type)return err('Selecciona el tipo de cliente');
  const group=document.getElementById('dfGroup').value, thrRaw=document.getElementById('dfThr').value, thr=Number(thrRaw), benefit=document.getElementById('dfBenefit').value;
  if(!group)return err('Selecciona el grupo al que se aplica');
  if(!(Number.isInteger(thr)&&thr>0))return err('«Por cada» debe ser un número entero mayor que 0');
  if(!benefit)return err('Selecciona el tipo de beneficio');
  if(benefit==='porcentaje'){
   const pct=Number(document.getElementById('dfPctN').value);
   if(!(pct>0&&pct<=100))return err('El descuento debe ser mayor que 0 y como máximo 100 %');
   rec.pct=Math.round(pct*100)/100;rec.freeUnits=0;
  }else{
   const fr=Number(document.getElementById('dfFree').value);
   if(!(Number.isInteger(fr)&&fr>0))return err('Las unidades gratis deben ser un número entero mayor que 0');
   rec.freeUnits=fr;rec.pct=0;
  }
  rec.group=group;rec.threshold=thr;rec.benefit=benefit;
 }else{
  const pct=parseInt(document.getElementById('dfPct').value);
  if(!(pct>=1&&pct<=5))return err('Selecciona el porcentaje de descuento');
  rec.pct=pct;
 }
 if(!(days>=1&&days<=365))return err('La duración debe ser de 1 a 365 días');
 const start=Date.now();
 Object.assign(rec,{days:days,startMs:start,endMs:start+days*86400000});
 descuentos.push(rec);
 saveDisc();dirForm=null;renderDir();renderCustomer();say(conv?'Convenio guardado':'Oferta activada');
}
async function deleteDisc(id){
 const d=descuentos.find(x=>x.id===id); if(!d)return;
 if(!await askConfirm(d.kind==='convenio'?'Eliminar convenio':'Eliminar oferta',`«${d.nombre}» dejará de estar disponible de inmediato.`,'Eliminar'))return;
 descuentos=descuentos.filter(x=>x.id!==id);saveDisc();
 renderDir();tickDiscounts();say('Eliminado');
}
dirModal.addEventListener('input',e=>{if(e.target.id==='dsQ'){dsQ=e.target.value;const r=document.getElementById('dsRes');if(r)r.innerHTML=dsQ.trim().length>=2?dirSearchResults(dsQ):''}});
dirBtn.onclick=()=>{dirMod=null;dirForm=null;renderDir();openModal(dirModal);dirModal.scrollTop=0};
document.getElementById('payPlate').onclick=()=>{if(bossActive){dirMod='sueldos';dirForm=null;sueOff=0;renderDir();openModal(dirModal);dirModal.scrollTop=0}else say('Los sueldos los paga la dirección los domingos')};
document.getElementById('dirClose').onclick=()=>closeModal(dirModal);
dirModal.addEventListener('click',e=>{
 if(e.target===dirModal)return closeModal(dirModal);
 const b=e.target.closest('[data-dir]'); if(!b)return;
 const [act,arg]=b.dataset.dir.split(':');
 if(act==='open'){dirMod=arg;dirForm=null;sueOff=0;wkType=null;wkEmp=null;wkOffset=0;clView=null;clEdit=null;fabEdit=null;renderDir();dirModal.scrollTop=0}
 else if(act==='back'){
  if(dirMod==='fabricacion'&&fabEdit){fabEdit=null;fabDraft=[]}
  else if(dirMod==='clientes'&&(clView||clEdit)){clView=null;clEdit=null}
  else if(dirMod==='semanales'&&(wkEmp!==null||wkType)){if(wkEmp!==null)wkEmp=null;else wkType=null}
  else if(dirForm)dirForm=null;else dirMod=null;
  renderDir();
 }
 else if(act==='form'){dirForm=arg;renderDir();dirModal.scrollTop=0}
 else if(act==='cancel-form'){dirForm=null;renderDir()}
 else if(act==='save-form')saveDiscForm();
 else if(act==='del')deleteDisc(arg);
 else if(act==='void')once('void',()=>voidSale(arg),b);
 else if(act==='price-save')savePrices();
 else if(act==='cp-add')addCustomProduct();
 else if(act==='cp-del')delCustomProduct(decodeURIComponent(arg));
 else if(act==='cl-new'){clEdit='new';clView=null;clWork={name:'',type:'particular',telegram:'',ident:'',precios:{},series:[]};renderDir()}
 else if(act==='cl-edit'){const c=clientes.find(x=>x.id===arg);if(c){clEdit=arg;clWork=JSON.parse(JSON.stringify(c));renderDir()}}
 else if(act==='cl-cancel'){clEdit=null;renderDir()}
 else if(act==='cl-view'){clView=arg;clEdit=null;renderDir();dirModal.scrollTop=0}
 else if(act==='cl-close'){clView=null;clHistAll=false;renderDir()}
 else if(act==='cl-hist'){clHistAll=!clHistAll;renderDir()}
 else if(act==='cl-copy'){const v=decodeURIComponent(arg);copyText(v).then(ok=>{if(ok)say('Copiado: '+v);else prompt('Copia este dato:',v)})}
 else if(act==='cl-save')saveClient();
 else if(act==='cl-del')delClient(arg);
 else if(act==='cl-padd')addClientPrice();
 else if(act==='cl-pdel'){delete clWork.precios[decodeURIComponent(arg)];renderDir()}
 else if(act==='cc-save')saveCierre();
 else if(act==='cc-dl'){const c=loadLog(KEY_CIERRES).find(x=>x.id===arg);if(c)saveTextFile(cierreDoc(c),`Cierre_de_caja_${c.date.replace(/\//g,'-')}.txt`)}
 else if(act==='cc-cp'){const c=loadLog(KEY_CIERRES).find(x=>x.id===arg);if(c)repCopy(cierreDoc(c))}
 else if(act==='wh-save')saveWebhookForm();
 else if(act==='wh-test')testWebhooks()
 else if(act==='rs-do')once('reset',doReset,b);
 else if(act==='au-end')ausEndNow(arg);
 else if(act==='au-del')delAusencia(arg);
 else if(act==='sh-fix'){const i=dirModal.querySelector('[data-shfix="'+arg+'"]');closeShiftAt(arg,i?i.value:'')}
 else if(act==='help')openTutorial(HELP_MAP[arg]||'Modo Jefe');
 else if(act==='pv-save')saveProveedor();
 else if(act==='pv-edit'){const v=proveedores.find(x=>x.id===arg);if(v){pvEdit=arg;pvDraft={name:v.name,tel:v.tel||'',tipo:v.tipo||'',ubic:v.ubic||'',prods:(v.prods||[]).map(x=>({n:x.name,p:(x.price/100).toFixed(2)}))};renderDir();dirModal.scrollTop=0}}
 else if(act==='pv-cancel'){pvEdit=null;pvDraft={name:'',tel:'',tipo:'',ubic:'',prods:[]};renderDir()}
 else if(act==='pv-del')delProveedor(arg);
 else if(act==='np-addrow'){npDraft.rows.push({m:'',q:'',p:''});renderDir()}
 else if(act==='np-delrow'){npDraft.rows.splice(+arg,1);if(!npDraft.rows.length)npDraft.rows.push({m:'',q:'',p:''});renderDir()}
 else if(act==='np-emit')once('emit',async()=>emitPedido(),b);
 else if(act==='npq-plus'||act==='npq-minus'){
  const pv=npProv(), x=pv&&(pv.prods||[])[+arg]; if(x){
   const v=Math.min(999999,Math.max(0,(npDraft.lq[x.name]||0)+(act==='npq-plus'?1:-1)));
   if(v>0)npDraft.lq[x.name]=v;else delete npDraft.lq[x.name];
   const inp=dirModal.querySelector('[data-npq="'+arg+'"]');if(inp)inp.value=String(v);
   npRefresh(+arg);
  }
 }
 else if(act==='nb-up')nubeUp();
 else if(act==='nb-down')nubeDown();
 else if(act==='nb-sync'){cloudPoll(true).then(()=>renderDir());say('Sincronizando…')}
 else if(act==='bk-full')downloadBackup(false);
 else if(act==='bk-config')downloadBackup(true);
 else if(act==='bk-restore')document.getElementById('bkFile').click();
 else if(act==='gxsave')saveGasto();
 else if(act==='su-pay')once('sue-'+arg,()=>paySueldo(arg),b);
 else if(act==='su-prev'){sueOff--;renderDir()}
 else if(act==='su-next'){if(sueWeek()+7<=payMonday(0))sueOff++;renderDir()}
 else if(act==='su-now'){sueOff=0;renderDir()}
 else if(act==='gxdel')deleteGasto(arg);
 else if(act==='pm'){per[arg[0]]={mode:arg.slice(1),off:0};renderDir()}
 else if(act==='pp'){per[arg].off--;renderDir()}
 else if(act==='pn'){if(per[arg].off<0)per[arg].off++;renderDir()}
 else if(act==='pw'){per[arg].off=0;renderDir()}
 else if(act==='rep-dl'){
  const R=REPORTS[arg];
  saveTextFile(R.doc(),`${R.name}_${per[arg].mode==='sem'?'Semanal':'Diario'}_${dayStr(periodRange(arg).s).replace(/\//g,'-')}.txt`);
  say('Documento descargado');
 }
 else if(act==='rep-cp')repCopy(REPORTS[arg].doc());
 else if(act==='rep-dc'){const R=REPORTS[arg];reportSend(R.kind,R.doc(),`${R.name}_${per[arg].mode==='sem'?'Semanal':'Diario'}_${dayStr(periodRange(arg).s).replace(/\//g,'-')}.txt`)}
 else if(act==='wk-dc')sendWeekSales();
 else if(act==='wk-type'){wkType=arg;wkEmp=null;renderDir()}
 else if(act==='wk-prev'){wkOffset--;wkEmp=null;renderDir()}
 else if(act==='wk-next'){if(wkOffset<0)wkOffset++;wkEmp=null;renderDir()}
 else if(act==='wk-now'){wkOffset=0;wkEmp=null;renderDir()}
 else if(act==='wk-emp'){wkEmp=decodeURIComponent(arg);renderDir();dirModal.scrollTop=0}
 else if(act==='wk-dl')downloadWeek(decodeURIComponent(arg));
 else if(act==='wk-dlall')downloadWeek(null);
 else if(act==='emp-add')empAdd();
 else if(act==='emp-edit'){const x=empleados.find(z=>z.id===arg);if(x){eeDraft={id:x.id,name:x.name,puesto:x.puesto||'',sueldo:x.sueldo?(x.sueldo/100).toFixed(2).replace(/\.00$/,''):'',inicio:x.inicio||isoToday(),horas:String(x.horas||10),send:!empHasContract(x)};renderDir()}}
 else if(act==='emp-cancel'){eeDraft=null;renderDir()}
 else if(act==='emp-ct')downloadContract(arg);
 else if(act==='emp-save')empSave(arg);
 else if(act==='emp-del')empDelete(arg);
 else if(act==='emp-up')once('up-'+arg,()=>empAscenso(arg),b);
 else if(act==='emp-kick')once('kick-'+arg,()=>empKick(arg),b);
 else if(act==='ds-open')dsOpen(b.dataset.dir.slice(8));
 else if(act==='emp-ficha'){dirMod='empficha';fichaEmp=arg;renderDir();dirModal.scrollTop=0}
 else if(act==='obj-save')saveObjetivo(false);
 else if(act==='obj-off')saveObjetivo(true);
 else if(act==='emp-reset')once('rst-'+arg,()=>empResetClave(arg),b);
 else if(act==='emp-foto')empPickFoto(arg);
 else if(act==='emp-nofoto')once('nf-'+arg,()=>empNoFoto(arg),b);
 else if(act==='scat'){stockCat=arg;renderDir()}
 else if(act==='splus'||act==='sminus'){
  const n=inputs[+arg].dataset.name, v=Math.min(999999,Math.max(0,(parseInt(stockDraft[n])||0)+(act==='splus'?1:-1)));
  if(v>0)stockDraft[n]=String(v);else delete stockDraft[n];
  const inp=[...dirModal.querySelectorAll('[data-stock]')].find(x=>x.dataset.stock===n);
  if(inp)inp.value=String(v);
 }
 else if(act==='stock-save')once('stock',saveStockDraft,b);
 else if(act==='fcat'){fabCat=arg;renderDir()}
 else if(act==='fab-open'){const n=inputs[+arg]&&inputs[+arg].dataset.name;if(n){fabEdit=n;fabWant='';fabDraft=recipeOf(n).map(r=>({m:r.m,q:String(r.q)}));renderDir();dirModal.scrollTop=0}}
 else if(act==='fab-cancel'){fabEdit=null;fabDraft=[];renderDir()}
 else if(act==='fab-save')saveReceta();
 else if(act==='fab-clear'){fabDraft=[];saveReceta()}
 else if(act==='fab-order')fabOrder(arg);
 else if(act==='mmin-save')saveMatMins();
 else if(act==='fab-undo')undoFab();
 else if(act==='exit-boss'){setBoss(false);closeModal(dirModal);say('Modo Jefe desactivado')}
});
setInterval(tickDiscounts,30000);
dirModal.addEventListener('input',e=>{
 const n=e.target.dataset&&e.target.dataset.stock;
 if(n===undefined)return;
 const v=e.target.value.replace(/[^0-9]/g,'').slice(0,6);
 e.target.value=v;
 if(v)stockDraft[n]=v;else delete stockDraft[n];
});
dirModal.addEventListener('change',e=>{
 if(e.target.id!=='dfBenefit')return;
 document.getElementById('dfPctWrap').hidden=e.target.value!=='porcentaje';
 document.getElementById('dfFreeWrap').hidden=e.target.value!=='gratis';
});
dirModal.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='empName'){e.preventDefault();empAdd()}});
function empInput(t){
 const m=/^(emp|ee)(Name|Puesto|Sueldo|Inicio|Send|Horas)$/.exec(t.id||''); if(!m)return;
 const d=m[1]==='emp'?empDraft:eeDraft; if(!d)return;
 if(m[2]==='Name')d.name=t.value;
 else if(m[2]==='Puesto'){const old=SUELDO_PUESTO[d.puesto], cur=parseMoney(d.sueldo);d.puesto=t.value;if(SUELDO_PUESTO[t.value]&&(!d.sueldo||cur===old)){d.sueldo=String(SUELDO_PUESTO[t.value]/100);const s=document.getElementById(m[1]+'Sueldo');if(s)s.value=d.sueldo}}
 else if(m[2]==='Sueldo'){const v=t.value.replace(/[^0-9.,]/g,'');if(v!==t.value)t.value=v;d.sueldo=v}
 else if(m[2]==='Inicio'){d.inicio=t.value;const el=document.getElementById(m[1]+'Prueba');if(el)el.innerHTML=pruebaTxt(t.value)}
 else if(m[2]==='Send')d.send=t.checked;
 else if(m[2]==='Horas'){const v=t.value.replace(/[^0-9]/g,'').slice(0,3);if(v!==t.value)t.value=v;d.horas=v}
}
dirModal.addEventListener('input',e=>empInput(e.target));
function fabInput(t){
 const d=t.dataset||{};
 if(t.id==='fabWant'){const v=t.value.replace(/[^0-9]/g,'').slice(0,5);if(v!==t.value)t.value=v;if(v===fabWant)return;fabWant=v;const el=document.getElementById('fabNeed');if(el)el.innerHTML=fabNeedHTML();return}
 if(d.mmin!==undefined){const v=t.value.replace(/[^0-9]/g,'').slice(0,6);if(v!==t.value)t.value=v;mminDraft[d.mmin]=v;return}
 if(!d.fab||!fabEdit)return;
 const i=+d.i;while(fabDraft.length<=i)fabDraft.push({m:'',q:''});
 if(d.fab==='q'){const v=t.value.replace(/[^0-9]/g,'').slice(0,5);if(v!==t.value)t.value=v;fabDraft[i].q=v}else fabDraft[i].m=t.value;
 const box=document.getElementById('fabList'), n=box?box.children.length:0;
 if(box&&i===n-1&&fabDraft[i].m&&n<matNames().length){fabDraft.push({m:'',q:''});box.insertAdjacentHTML('beforeend',fabRowHTML({m:'',q:''},n))}
}
dirModal.addEventListener('input',e=>fabInput(e.target));
dirModal.addEventListener('change',e=>fabInput(e.target));
dirModal.addEventListener('change',e=>empInput(e.target));

/* ===== Selector de empleado, aviso "SIN STOCK" y pestañas Venta / Presupuesto ===== */
empSel.onchange=()=>{customer.employee=empSel.value;customerChanged()};
/* Un dibujo de grabado por categoría en cada producto (icono-<categoría>.png). Si falta, se queda el medallón ✦. */
const CAT_IMG={revolveres:'icono-revolveres.webp',pistolas:'icono-pistolas.webp',repetidoras:'icono-repetidoras.webp',rifles:'icono-rifles.webp',escopetas:'icono-escopetas.webp',blancas:'icono-armas-blancas.webp',municion:'icono-municion.webp',suministros:'icono-suministros.webp'};
function iconErr(img){
 if(!img.dataset.r){img.dataset.r='1';img.src=img.getAttribute('src')+'.png';return} /* por si el archivo se subió como .png.png */
 img.onerror=null;
 if(img.parentNode)img.parentNode.textContent='✦';
}
document.querySelectorAll('.product').forEach(pr=>{
 const ic=pr.querySelector('.weapon-icon'), src=CAT_IMG[pr.dataset.cat];
 if(ic&&src)ic.innerHTML=`<img src="${src}" alt="" loading="lazy" decoding="async" onload="this.parentNode.classList.add('has-icon')" onerror="iconErr(this)">`;
});
const DESCRIPCIONES={
'Cattleman Revolver':'Revólver de acción simple y seis disparos, robusto y fiable. El clásico de cualquier vaquero.',
'Doble Action Revolver':'Revólver de doble acción: se dispara sin amartillar a mano, ideal cuando cada segundo cuenta.',
'Schofield Revolver':'Revólver de rotura con extracción automática de casquillos, muy práctico para recargar a caballo.',
'Lemat Revolver':'Rareza de nueve recámaras con un segundo cañón de perdigones bajo el principal.',
'Navy Revolver':'Revólver de cañón largo, preciso y equilibrado, de origen naval.',
'Navy Crossover Revolver':'Una versión del Navy pensada para el camino: ligera, precisa y de acabado cuidado.',
'Semiautomática Pistola':'Pistola semiautomática con cargador de caja: más disparos y recarga rápida.',
'Mauser Pistola':'Pistola de cañón largo con el cargador delante del gatillo, reconocible a simple vista.',
'Volcanic Pistola':'Pistola de repetición de palanca, de las primeras de su clase. Una pieza de coleccionista.',
'M1899 Pistola':'Pistola semiautomática compacta de finales de siglo, ligera y fácil de llevar encima.',
'Carabina Repetición':'Carabina de palanca corta y manejable, perfecta para llevarla al caballo.',
'Evans Repetición':'Repetidora de gran capacidad, con cargador helicoidal en la culata.',
'Henry Repetición':'Repetidora de palanca con cargador tubular, rápida y resistente.',
'Winchester Repetición':'La repetidora más famosa del Oeste: palanca ágil, cañón preciso y mucha cadencia.',
'Varmint':'Rifle ligero pensado para alimañas y caza menor.',
'Springfield Rifle':'Rifle de un solo tiro con cerrojo, preciso a larga distancia y de gran potencia.',
'Cerrojo Rifle':'Rifle de cerrojo para caza mayor: recarga manual segura y un tiro certero.',
'Recortada Escopeta':'Escopeta de cañones recortados: poco alcance, pero demoledora de cerca.',
'Doble Cañón Escopeta':'Escopeta de dos cañones paralelos: dos disparos seguidos de gran dispersión.',
'Escopeta Exótica':'Escopeta de fabricación singular y acabado especial, para quien busca algo distinto.',
'Cuchillo':'Cuchillo de monte resistente para desollar, cortar y salir de apuros.',
'Hacha':'Hacha de mano de acero forjado: útil para la leña y, si hace falta, para defenderse.',
'Machete':'Hoja ancha y pesada para abrirse paso entre la maleza.',
'Arco':'Arco de caza silencioso y fiable, para quien prefiere no hacer ruido.',
'Munición Escopeta':'Cartuchos de perdigones para escopeta. Caja surtida.',
'Munición Pistola':'Cartuchos para pistola. Caja surtida.',
'Munición Repetidora':'Cartuchos para repetidoras de palanca. Caja surtida.',
'Munición Revolver':'Cartuchos para revólver. Caja surtida.',
'Munición Rifle':'Cartuchos de gran calibre para rifle. Caja surtida.',
'Flechas':'Flechas de caza con punta de acero, en haz surtido.',
'Trapo':'Trapo de algodón para limpiar y secar el arma.',
'Pólvora':'Bote de pólvora negra para recargar tus propios cartuchos.',
'Lazo':'Lazo de cuerda trenzada para reses y caballos.',
'Lazo Reforzado':'Lazo trenzado con refuerzo en el nudo, aguanta tirones fuertes.',
'Aceite de Arma':'Aceite fino que protege el metal del óxido y mantiene suave el mecanismo.'};
const prodModal=document.getElementById('prodModal');
document.getElementById('prodClose').onclick=()=>closeModal(prodModal);
prodModal.addEventListener('click',e=>{if(e.target===prodModal)closeModal(prodModal)});
document.getElementById('products').addEventListener('click',e=>{
 const nm=e.target.closest('.pname'); if(!nm)return;
 const row=nm.closest('.product'), inp=row.querySelector('.qty input'), n=inp.dataset.name;
 const cp=loadObj(KEY_CUSTPROD,[]).find(x=>x.name===n), desc=DESCRIPCIONES[n]||(cp&&cp.desc)||'Pieza del catálogo de Harrington Gunsmith.';
 const ic=row.querySelector('.weapon-icon').cloneNode(true), ok=(stockMap[n]||0)>0||(customer.op==='encargo'&&!loadedEnc);
 document.getElementById('prodTitle').textContent=n.toUpperCase();
 const bossInfo=bossActive?prodBossHTML(n):'';
 document.getElementById('prodBody').innerHTML=`<div class="prod-sheet"><div id="prodIcon"></div><div><div class="t" style="font-variant:small-caps;letter-spacing:.08em">${esc(row.querySelector('.pname small').textContent)}</div></div></div><p class="prod-desc">${esc(desc)}</p><div class="prod-meta"><span>Precio: <b>${money(baseCents(inp))}</b></span><span><b class="${ok?'':'neg'}">${ok?'Disponible':'Sin stock'}</b></span></div>${bossInfo}<div class="enc-actions"><button type="button" class="primary" id="prodAdd"${ok&&appMode==='venta'||appMode==='presupuesto'&&ok?'':' disabled'}>AÑADIR AL PEDIDO</button></div>`;
 document.getElementById('prodIcon').replaceWith(ic);
 document.getElementById('prodAdd').onclick=()=>{row.querySelector('.plus').click();closeModal(prodModal)};
 openModal(prodModal);
});
function prodBossHTML(n){
 const ws=weekStart(0);let sold=0;
 loadLog(KEY_SALELOG).forEach(r=>{if(r.voided||r.op==='encargo')return;const d=saleDay(r);if(d<ws||d>ws+6)return;(r.items||[]).forEach(x=>{if(x.name===n)sold+=x.qty})});
 const rc=recipeText(n), cl=costLine(n), mn=stockMin[n]||0;
 return `<div class="prod-boss"><div class="dir-sec-title" style="margin-top:0">SOLO JEFE</div>
  <div class="reg-line"><span>Stock exacto</span><b>${stockMap[n]||0}${mn?' · mínimo '+mn:''}</b></div>
  <div class="reg-line"><span>Vendidas esta semana</span><b>${sold}</b></div>
  <div class="reg-line"><span>Receta</span><b>${rc?esc(rc):'—'}</b></div>
  ${cl?`<div class="reg-line"><span>Coste y margen</span><b>${cl}</b></div>`:''}</div>`;
}
/* Marca de agua de la casa: una «H» de lacre muy tenue en el centro del papel */
function wmark(g,W,cy){try{g.save();g.globalAlpha=.07;g.strokeStyle='#7a1608';g.fillStyle='#7a1608';g.lineWidth=6;g.beginPath();g.arc(W/2,cy,150,0,Math.PI*2);g.stroke();g.lineWidth=2;g.beginPath();g.arc(W/2,cy,132,0,Math.PI*2);g.stroke();g.font='bold 220px Georgia,serif';g.textAlign='center';g.textBaseline='middle';g.fillText('H',W/2,cy+8);g.restore()}catch(e){}}
/* Ticket como imagen (para pegarlo en Discord con su aspecto de papel) */
function loadImage(src){return new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=src})}
async function ticketBlob(s){
 try{
  const W=640,P=34,ink='#2a1a0d',ff="'IM Fell English',Georgia,'Times New Roman',serif",fb="'Cinzel Decorative',Georgia,serif";
  try{await document.fonts.load("bold 30px 'Cinzel Decorative'");await document.fonts.load("20px 'IM Fell English'")}catch(e){}
  const emb=await loadImage('emblema-harrington.png'), big=document.createElement('canvas');
  big.width=W;big.height=3200;const g=big.getContext('2d');
  const grd=g.createLinearGradient(0,0,0,3200);grd.addColorStop(0,'#ecdcae');grd.addColorStop(1,'#d6bb82');g.fillStyle=grd;g.fillRect(0,0,W,3200);wmark(g,W,520);
  let y=P+16;
  const ctr=(t,font,col,dy)=>{g.font=font;g.fillStyle=col;g.textAlign='center';g.fillText(t,W/2,y);y+=dy};
  if(emb){const h=90,w=emb.width*h/emb.height;g.drawImage(emb,(W-w)/2,y,w,h);y+=h+36}else y+=14;
  ctr('HARRINGTON GUNSMITH','bold 30px '+fb,'#1b3022',34);
  ctr('Saint Denis · 1880','17px '+ff,'#6b4c1d',26);
  ctr('El precio de un apellido.','italic 19px '+ff,ink,34);
  ctr(s.op==='encargo'?'REGISTRO DE ENCARGO':'REGISTRO DE VENTA','bold 15px '+fb,ink,30);
  const kv=(k,v)=>{g.textAlign='left';g.font='13px '+ff;g.fillStyle='#6b4c1d';g.fillText(k.toUpperCase(),P,y);y+=19;g.font='bold 20px '+ff;g.fillStyle=ink;let t=String(v);while(g.measureText(t).width>W-2*P&&t.length>4)t=t.slice(0,-2);g.fillText(t===String(v)?t:t+'…',P,y);y+=27};
  kv(s.op==='encargo'?'Encargo N.º':'Venta N.º',s.id);kv('Fecha y hora',s.date+' · '+s.time);
  if(s.employee)kv('Empleado',s.employee);if(s.client)kv('Cliente',s.client);if(s.telegram)kv('Telegrama',s.telegram);
  if(s.convenio)kv(s.convenioKind||'Convenio',s.convenio);if(s.note)kv('Nota',s.note);if(s.promise)kv('Entrega prevista',fmtISO(s.promise));
  const hr=()=>{g.strokeStyle='#7a5a22';g.lineWidth=2;g.beginPath();g.moveTo(P,y);g.lineTo(W-P,y);g.stroke();y+=24};
  y+=4;hr();
  groupItems(s).forEach(gr=>{
   if(gr.title){g.textAlign='left';g.font='bold 14px '+ff;g.fillStyle='#6b4c1d';g.fillText(gr.title,P,y);y+=22}
   gr.items.forEach(x=>{
    g.font='19px '+ff;g.fillStyle=ink;g.textAlign='left';
    let nm=x.name;while(g.measureText(nm).width>W-2*P-130&&nm.length>4)nm=nm.slice(0,-2);if(nm!==x.name)nm+='…';
    g.fillText(nm,P,y);g.textAlign='right';g.fillText(money(x.qty*x.cents),W-P,y);y+=21;
    g.font='15px '+ff;g.fillStyle='#6b4c1d';g.textAlign='left';g.fillText(x.qty+' × '+money(x.cents),P,y);y+=27;
   });
  });
  hr();
  finRows(s).forEach(r=>{g.font='18px '+ff;g.fillStyle=r[2]==='paid'?'#1b3022':ink;g.textAlign='left';g.fillText(r[0],P,y);g.textAlign='right';g.fillText(r[1],W-P,y);y+=26});
  y+=10;g.strokeStyle='#7a5a22';g.lineWidth=3;g.beginPath();g.moveTo(P,y-14);g.lineTo(W-P,y-14);g.stroke();
  g.textAlign='left';g.font='bold 22px '+fb;g.fillStyle='#1b3022';g.fillText(dueLabel(s),P,y+16);g.textAlign='right';g.font='bold 30px '+ff;g.fillText(money(dueCents(s)),W-P,y+16);y+=44;
  g.strokeStyle='#7a5a22';g.beginPath();g.moveTo(P,y);g.lineTo(W-P,y);g.stroke();y+=50;
  g.save();g.translate(W-150,y);g.rotate(-.2);g.strokeStyle='rgba(141,42,22,.85)';g.lineWidth=4;g.strokeRect(-76,-24,152,48);g.lineWidth=1.5;g.strokeRect(-70,-18,140,36);g.fillStyle='rgba(141,42,22,.9)';g.font='bold 22px '+fb;g.textAlign='center';g.fillText(s.op==='encargo'?'ANOTADO':'PAGADO',0,8);g.restore();
  const cx=110,cy=y,rg=g.createRadialGradient(cx-8,cy-8,4,cx,cy,34);rg.addColorStop(0,'#c0402a');rg.addColorStop(.65,'#7a1608');rg.addColorStop(1,'#4d0d05');
  g.fillStyle=rg;g.beginPath();g.arc(cx,cy,34,0,Math.PI*2);g.fill();g.strokeStyle='rgba(61,10,4,.8)';g.lineWidth=2;g.beginPath();g.arc(cx,cy,26,0,Math.PI*2);g.stroke();
  g.font='bold 34px Georgia,serif';g.textAlign='center';g.fillStyle='#3d0a04';g.fillText('H',cx+1.5,cy+12.5);g.fillStyle='#e0705a';g.fillText('H',cx,cy+11);
  y+=70;
  const out=document.createElement('canvas');out.width=W;out.height=Math.round(y);const o=out.getContext('2d');o.drawImage(big,0,0,W,out.height,0,0,W,out.height);
  o.strokeStyle='#7a5a22';o.lineWidth=3;o.strokeRect(10,10,W-20,out.height-20);o.lineWidth=1;o.strokeRect(16,16,W-32,out.height-32);
  return await new Promise(res=>out.toBlob(res,'image/png'));
 }catch(e){return null}
}
async function pedidoBlob(r){
 try{
  const W=640,P=34,ink='#2a1a0d',sep='#7a5a22',ff="'IM Fell English',Georgia,'Times New Roman',serif",fb="'Cinzel Decorative',Georgia,serif";
  try{await document.fonts.load("bold 26px 'Cinzel Decorative'");await document.fonts.load("19px 'IM Fell English'")}catch(e){}
  const H=600+r.items.length*52, c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  const grd=g.createLinearGradient(0,0,0,H);grd.addColorStop(0,'#ecdcae');grd.addColorStop(1,'#d6bb82');g.fillStyle=grd;g.fillRect(0,0,W,H);wmark(g,W,Math.min(H/2,380));
  let y=P+30;
  const ctr=(t,font,col,dy)=>{g.font=font;g.fillStyle=col;g.textAlign='center';g.fillText(t,W/2,y);y+=dy};
  const kv=(k,v)=>{g.textAlign='left';g.font='13px '+ff;g.fillStyle='#6b4c1d';g.fillText(k.toUpperCase(),P,y);y+=20;g.font='bold 20px '+ff;g.fillStyle=ink;g.fillText(String(v),P,y);y+=28};
  const hr=w=>{g.strokeStyle=sep;g.lineWidth=w||2;g.beginPath();g.moveTo(P,y);g.lineTo(W-P,y);g.stroke();y+=26};
  ctr('HARRINGTON GUNSMITH','bold 28px '+fb,'#1b3022',30);
  ctr('Saint Denis · 1880','16px '+ff,'#6b4c1d',30);
  ctr('ALBARÁN DE PEDIDO','bold 18px '+fb,ink,32);
  kv('Pedido N.º',r.code+' · '+r.date+' '+r.time);kv('Proveedor',r.proveedor+(r.proveedorTipo?' · '+r.proveedorTipo:''));if(r.proveedorTel)kv('Telegrama',r.proveedorTel);
  y+=4;hr();
  r.items.forEach(x=>{g.font='19px '+ff;g.fillStyle=ink;g.textAlign='left';let nm=x.material;while(g.measureText(nm).width>W-2*P-130&&nm.length>4)nm=nm.slice(0,-2);g.fillText(nm,P,y);g.textAlign='right';g.fillText(money(x.qty*x.price),W-P,y);y+=21;g.font='15px '+ff;g.fillStyle='#6b4c1d';g.textAlign='left';g.fillText(x.qty+' × '+money(x.price)+' / ud.',P,y);y+=31});
  hr(3);
  g.textAlign='left';g.font='bold 22px '+fb;g.fillStyle='#1b3022';g.fillText('TOTAL',P,y+6);g.textAlign='right';g.font='bold 30px '+ff;g.fillText(money(r.totalCents),W-P,y+6);y+=58;
  g.save();g.translate(W-150,y);g.rotate(-.18);g.strokeStyle=r.paid?'rgba(27,48,34,.85)':'rgba(141,42,22,.85)';g.lineWidth=4;g.strokeRect(-86,-24,172,48);g.fillStyle=g.strokeStyle;g.font='bold 20px '+fb;g.textAlign='center';g.fillText(r.paid?'PAGADO':'POR PAGAR',0,8);g.restore();
  y+=60;
  const out=document.createElement('canvas');out.width=W;out.height=Math.min(H,Math.round(y));const o=out.getContext('2d');o.drawImage(c,0,0,W,out.height,0,0,W,out.height);
  o.strokeStyle=sep;o.lineWidth=3;o.strokeRect(10,10,W-20,out.height-20);o.lineWidth=1;o.strokeRect(16,16,W-32,out.height-32);
  return await new Promise(res=>out.toBlob(res,'image/png'));
 }catch(e){return null}
}
async function ticketImage(copy){
 const s=await ensureSaleCloud(); if(!s)return;
 const blob=await ticketBlob(s); if(!blob)return say('No se pudo crear la imagen');
 if(copy&&navigator.clipboard&&window.ClipboardItem){try{await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);return say('Imagen copiada · pégala en Discord')}catch(e){}}
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Harrington_'+s.id+'.png';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
 say(copy?'No se pudo copiar: se ha descargado la imagen':'Imagen descargada');
}
async function notifySale(s){
 const kind=(s.op==='encargo'||s.fromEncargo)?'encargos':'ventas';
 if(!(webhook.urls[kind]||webhook.url)||!webhook.ev[kind]||s.sentSig===s.sig)return;
 const upd=!!s.sentSig; s.sentSig=s.sig; store.set(KEY_SALE,JSON.stringify(s));
 let blob=null;try{blob=await ticketBlob(s)}catch(e){}
 discordSend(kind,(upd?'ACTUALIZACIÓN\n':'')+receiptText(s),blob,'Harrington_'+s.id+'.png');
}
document.getElementById('rcImgDl').onclick=()=>ticketImage(false);
document.getElementById('rcImgCp').onclick=()=>ticketImage(true);
/* Tamaño de texto A− / A+ */
const FS=[1,1.1,1.2]; let fsI=Number(store.get('harrington_fs_v1')||0); if(!(fsI>=0&&fsI<FS.length))fsI=0;
function applyFs(){document.body.style.zoom=FS[fsI]===1?'':String(FS[fsI])}
document.getElementById('fsUp').onclick=()=>{if(fsI<FS.length-1){fsI++;store.set('harrington_fs_v1',String(fsI));applyFs();say('Texto '+Math.round(FS[fsI]*100)+' %')}else say('Ya está al máximo')};
document.getElementById('fsDown').onclick=()=>{if(fsI>0){fsI--;store.set('harrington_fs_v1',String(fsI));applyFs();say('Texto '+Math.round(FS[fsI]*100)+' %')}else say('Ya está al mínimo')};
applyFs();
{let hc=store.get('harrington_hc_v1')==='1';document.body.classList.toggle('hc',hc);document.getElementById('hcBtn').onclick=()=>{hc=!hc;document.body.classList.toggle('hc',hc);store.set('harrington_hc_v1',hc?'1':'0');say(hc?'Alto contraste activado':'Alto contraste desactivado')}}
/* Pantalla de bienvenida: solo una vez por sesión */

/* Instalar como app (icono en la pantalla de inicio) */
try{const m={name:'Harrington Gunsmith · Saint Denis',short_name:'Harrington',start_url:location.href.split('#')[0],display:'standalone',background_color:'#07140f',theme_color:'#07140f',icons:[{src:new URL('emblema-harrington.png',location.href).href,sizes:'512x512',type:'image/png'}]};
 const l=document.createElement('link');l.rel='manifest';l.href=URL.createObjectURL(new Blob([JSON.stringify(m)],{type:'application/manifest+json'}));document.head.appendChild(l)}catch(e){}
const TUTORIAL=[
['Entrada y usuario',`<p>Al abrir la web aparece la <b>fachada de la tienda</b>. Pulsa <b>ENTRAR</b>: suena la campanilla, se abre la puerta y pasas dentro.</p>
<ul><li>Toca <b>tu tarjeta</b> en «¿Quién entra hoy?» (las estrellas y galones indican el puesto; el sello rojo, que es jefe). La tarjeta se acerca y te pide <b>tu contraseña</b>; al acertarla se da la vuelta y te saluda.</li><li><b>La primera vez</b> que entras, la tarjeta te pide que <b>crees tu contraseña</b> (dos veces, mínimo 4 caracteres). A partir de ahí, solo tú puedes entrar con tu tarjeta. Si la olvidas, pídele a la dirección que te la resetee y la próxima vez crearás una nueva. Si fallas 5 veces seguidas, la tarjeta se bloquea un minuto.</li><li>Los jefes entran con la contraseña de jefe, que es compartida. La web te saluda por tu nombre con un resumen: tus horas de esta semana, si es día de pago, los encargos pendientes y quién está ausente.</li><li><b>Tu foto</b>: toca <b>tu nombre</b> arriba para abrir tu ficha y pulsa <b>📷 SUBIR MI FOTO</b> (por ejemplo, una captura de tu personaje). Saldrá en tu tarjeta de la entrada en tono sepia. Puedes cambiarla o quitarla cuando quieras.</li><li>La entrada dura unos 4 segundos. Si tienes prisa, toca la pantalla y pasas directamente a las tarjetas.</li><li><b>Tu usuario queda fijo</b> hasta que cierres la pestaña o la web. Sale arriba, junto a Dirección. Todo lo que hagas va a tu nombre: ventas, fichajes, ausencias y pedidos recibidos. No se puede cambiar de usuario sin cerrar y volver a abrir. Si recargas la página, sigues siendo tú.</li><li><b>Jefes</b>: las fichas con el puesto «Jefe» piden la <b>contraseña de jefe</b> (la misma para todos los jefes) cada vez que se entra. Con ella, el modo jefe y DIRECCIÓN quedan activados hasta que cierres la web; no se cierran por inactividad.</li><li>Si la dirección te <b>expulsa</b> (por ejemplo, si se te queda la sesión pillada), vuelves a la entrada con un aviso y tienes que elegir tu ficha otra vez. Si estabas fichado, se te ficha la salida en ese momento.</li></ul>`],
['Primeros pasos',`<p>Esta web es la calculadora de ventas, presupuestos y encargos de <b>Harrington Gunsmith</b>. Funciona igual en móvil y en ordenador.</p>
<ul><li><b>FICHAJE</b> (barra de arriba): ▸ Fichar entrada y ◂ Fichar salida.</li><li><b>ENCARGOS</b>: los encargos guardados que aún no se han entregado.</li><li><b>Tu nombre</b> (arriba): el usuario con el que has entrado. Si eres jefe, sale «· JEFE» y el botón <b>DIRECCIÓN</b>.</li><li>La placa <b>DÍA DE PAGO</b> (dorada) sale desde el domingo hasta que se pagan todos los sueldos; luego cambia a <b>SUELDOS PAGADOS</b> (verde) hasta el jueves. Cada uno ve en ella su propio sueldo.</li><li><b>PEDIDOS</b>: los pedidos a proveedores pendientes. La pestaña <b>MATERIALES</b> (junto a Venta y Presupuesto) muestra el almacén de materiales.</li><li><b>⚙</b> abre los ajustes: <b>música de fondo</b> (un piano de saloon, activado de serie; empieza a sonar en cuanto tocas la pantalla y se apaga aquí), <b>ambiente</b> (AUTO cambia solo entre día y noche según la hora española; también puedes dejar ☀ DÍA o ☾ NOCHE fijo), sonido y vibración, tamaño del texto (A− / A+) y alto contraste (◐). Cada móvil recuerda sus ajustes.</li><li>La placa dorada <b>EMPLEADO DE LA SEMANA</b> muestra quién más cobró la semana anterior.</li><li>En el tutorial, <b>▶ VISITA GUIADA</b> hace un recorrido rápido señalando cada botón.</li><li>Junto a FICHAJE ves cada empleado fichado con el tiempo que lleva, y el estado de la nube: «☁ guardando…» mientras se guarda algo y «☁ guardado ✓» cuando ya está.</li><li>Los avisos de error salen en <b>rojo</b> y duran más en pantalla; los normales, en verde.</li><li><b>? TUTORIAL</b> (esquina superior derecha) abre esta guía cuando la necesites.</li><li>El botón <b>↑</b> aparece al bajar mucho y te devuelve arriba.</li></ul>
<p>Si recargas la página o se cierra el navegador, <b>la venta que tenías en curso se conserva</b>. Se borra solo con Vaciar o Nueva venta, y siempre pidiendo confirmación.</p>
<p>Para tenerla como una app: en el menú del navegador, <b>Añadir a pantalla de inicio</b>.</p>`],
['Catálogo y categorías',`<ul><li>Los <b>botones con imagen</b> filtran los productos por categoría y cambian la imagen grande de arriba. «Todos» los muestra todos.</li><li>El <b>buscador</b> encuentra productos por su nombre, sin importar las tildes.</li><li>Cada fila tiene el dibujo de su categoría, el <b>nombre</b> (tócalo para ver su ficha con descripción, precio y si está disponible), el precio, la <b>cantidad</b> y el subtotal.</li><li>Para la cantidad usa <b>−</b> y <b>+</b>, o escribe el número. En la munición hay además <b>+10, +50 y +100</b>.</li><li>Los productos con cantidad se resaltan en dorado.</li><li><b>SIN STOCK</b>: no se puede añadir. Si intentas pasarte de lo que hay, la cantidad se corrige sola y te avisa. <b>Nunca</b> se muestra cuántas unidades quedan.</li><li>Los productos recién añadidos llevan la etiqueta <b>NUEVO</b>.</li></ul>`],
['Hacer una venta',`<ol><li>Elige productos y cantidades.</li><li>En <b>Tipo de operación</b> deja «Venta normal».</li><li><b>Tipo de cliente</b>: particular, empresa o Departamento del Sheriff (este último no pide nombre).</li><li>Escribe el <b>nombre</b>. Si el cliente ya está guardado, sale como sugerencia y se cargan sus datos y sus precios especiales.</li><li>Elige <b>Convenio</b> u <b>Oferta</b> si corresponde. Solo aparecen los vigentes y compatibles con el cliente. No se suman: al elegir uno se quita el otro.</li><li>Elige el <b>Empleado</b> que hace la venta. Es obligatorio.</li><li>Si quieres, añade una <b>Nota</b>: saldrá en el ticket y en el aviso de Discord.</li><li>Revisa el desglose: Subtotal, descuento y Total.</li><li>El botón de abajo <b>te dice qué falta</b> («Falta elegir el empleado», «Falta el telegrama»…). Cuando está todo, se pone verde con <b>FINALIZAR VENTA</b> (o GUARDAR ENCARGO): púlsalo y se abre el ticket y se descuenta el stock. Mientras se guarda, el botón queda bloqueado para que un doble toque no haga dos ventas.</li><li>Si una venta o el día superan el mejor registro de la casa, sale <b>¡RÉCORD DE LA CASA!</b> con campanas.</li><li>Si has vendido <b>armas</b> a un cliente con nombre, se abre una ventana para apuntar sus <b>números de serie</b> (opcional): se guardan en su ficha de cliente y en su mensaje de Discord. «Ahora no» la cierra.</li></ol>
<p><b>Vaciar</b> borra los productos del pedido. <b>Nueva venta</b> lo borra todo para empezar de cero. En el móvil, una <b>barra fija abajo</b> te muestra el total y tiene el botón FINALIZAR.</p>
<p>Si no deja finalizar, el aviso te dice qué falta: nombre, empleado, telegrama, pago adelantado o stock.</p>`],
['Presupuesto',`<p>La pestaña <b>PRESUPUESTO</b> sirve para decirle a un cliente cuánto costaría una compra, sin vender nada.</p>
<ul><li>Usa el mismo catálogo, precios, convenios y ofertas.</li><li>No genera ticket, no se registra, <b>no toca el stock</b> y no limita por existencias.</li><li>Cada pestaña recuerda sus propias cantidades, así que puedes hacer un presupuesto sin estropear una venta a medias.</li><li>Solo tienes que comunicarle el <b>Total</b> al cliente.</li><li>Si el cliente se decide, pulsa <b>PASAR A VENTA ▸</b>: los productos, el cliente y el convenio pasan a la pestaña VENTA para finalizarla sin volver a meterlos.</li></ul>`],
['Encargos',`<p><b>Crear un encargo</b>: en Tipo de operación elige «Encargo».</p>
<ul><li>Rellena cliente, <b>telegrama</b> (letras, números y guiones, máximo 10, se pone en mayúsculas), <b>pago por adelantado</b> (obligatorio y mayor que 0), y si quieres entrega prevista y nota.</li><li><b>FINALIZAR VENTA</b> guarda el encargo (suena un lápiz). No gasta stock.</li></ul>
<p><b>Botón ENCARGOS</b>: lista con total, adelanto, pendiente, estado y fecha (en rojo si está vencido). Tócalo para abrir la ficha.</p>
<ul><li>Estado de fabricación: <b>PENDIENTE / FABRICADO</b>. «¿Cliente avisado?» solo se puede poner en SÍ si está FABRICADO. Si vuelve a PENDIENTE, el aviso vuelve a NO.</li><li><b>GUARDAR CAMBIOS</b> guarda sin cargar ni finalizar.</li><li>Cuando lo marcas <b>FABRICADO</b> y aún no hay stock suficiente, la ficha te recuerda que el jefe tiene que sumar esas unidades en STOCK (así se gastan sus materiales) para poder entregarlo.</li><li>En la lista ves también <b>hace cuánto</b> se hizo cada encargo.</li><li><b>COPIAR AVISO (TELEGRAMA)</b> genera el mensaje para el cliente cuando está fabricado.</li><li><b>CANCELAR ENCARGO</b> pregunta si se devuelve el adelanto.</li></ul>
<p><b>Entregarlo</b>: en la ficha, <b>CARGAR ENCARGO</b>. Se cargan productos, precios, convenio y adelanto. Puedes añadir más cosas. El adelanto se descuenta <b>una sola vez</b> y no es un descuento. Al terminar, <b>FINALIZAR ENCARGO</b>.</p>`],
['Convenios, ofertas y precios especiales',`<ul><li><b>Convenio</b> (lo crea el jefe): para un tipo de cliente y un grupo (suministros, municiones o ambos). Puede dar un <b>porcentaje</b> a partir de X unidades (no se multiplica por bloques) o <b>unidades gratis</b> por cada X (se repiten por bloque completo; son las más baratas de las elegidas, y salen del stock igualmente).</li><li><b>Oferta</b>: un porcentaje del 1 al 5 % sobre toda la compra.</li><li>Caducan solas y en el desplegable ves «caduca en N días».</li><li><b>Precio especial</b> de un cliente: se aplica al elegirlo.</li></ul>`],
['Ticket, copias y Discord',`<p>Al finalizar se abre el <b>ticket</b>: número de venta (HG-fecha-contador), fecha y hora de España, empleado, cliente, productos, desglose y el sello PAGADO (o ANOTADO en un encargo).</p>
<ul><li><b>Copiar para Discord</b>: copia el texto limpio.</li><li><b>Descargar comprobante</b>: archivo de texto.</li><li><b>Descargar imagen / Copiar imagen</b>: el ticket como imagen.</li><li><b>Nueva venta</b> y <b>Cerrar</b>.</li></ul>
<p><b>Discord automático</b> (si el jefe lo configuró en Dirección → Discord, cada tipo a su propio canal). Los mensajes llegan como <b>tarjetas</b> con una franja de color según el tipo (ventas doradas, gastos rojos, pedidos verdes…), el título destacado, los datos ordenados y el emblema de la casa:</p>
<ul><li>Cada <b>venta</b> publica su ticket al finalizar, y cada <b>encargo</b> se publica al crearlo con todos sus datos (telegrama, adelanto, pendiente…).</li><li>Cada <b>gasto</b> se publica al guardarlo. También fichajes, anulaciones, cierres de caja y pedidos a proveedores.</li></ul>
<ul><li>El <b>stock de productos</b> y el <b>almacén de materiales</b>: cada uno es un mensaje en su canal que se actualiza en tiempo real con cada venta, fabricación, pedido recibido o anulación.</li><li>El <b>contrato</b> (imagen) de cada empleado nuevo, la <b>ficha de cada cliente</b> y la <b>ficha de cada proveedor</b> con su lista de precios. Las fichas de clientes y proveedores se publican al crearlas y, cuando las cambias, <b>se actualiza el mismo mensaje</b> en lugar de salir otro (si alguien lo borró en Discord, se publica uno nuevo).</li></ul>
<p><b>Cada jueves a las 22:00 (hora española)</b> se envían solos el <b>registro semanal de ventas</b>, el de <b>gastos</b> y el <b>balance de cuentas</b> de la semana (de viernes a jueves), cada uno a su canal. La web no tiene un servidor propio: los manda el <b>primer móvil que tenga la web abierta o la abra</b> a partir de esa hora, y la nube apunta que ya se enviaron para que nunca salgan repetidos. Si ese jueves nadie entra, salen en cuanto alguien abra la web.</p>
<p>Además, el jefe puede mandarlos cuando quiera con <b>«ENVIAR A DISCORD»</b> en Dirección (y también el registro de pedidos). Se publica un resumen y el documento completo adjunto. Balance de cuentas tiene su propio canal.</p>`],
['Pedidos a proveedores',`<p>El botón <b>PEDIDOS</b> (arriba, junto a Encargos) muestra los <b>pedidos pendientes</b> que el jefe ha hecho a sus proveedores: herrerías, minas, talas…</p>
<ul><li>Cada pedido indica el proveedor, a qué se dedica, su telegrama, los materiales y cantidades que tienen que llegar, el total y si está <b>pagado</b>.</li><li>Elige tu nombre en <b>Empleado que lo registra</b>.</li><li><b>¿Recibido?</b>: márcalo en SÍ cuando llegue la mercancía. En ese momento sus materiales se suman al almacén de <b>MATERIALES</b> (suena un baúl y cae el sello RECIBIDO), y ya no se puede desmarcar. Aunque dos personas lo marquen a la vez, los materiales se suman una sola vez.</li><li>La ficha del pedido se ve como un <b>albarán</b> de papel con sus sellos (RECIBIDO, PAGADO o POR PAGAR), y en la lista ves hace cuánto se pidió.</li><li><b>¿Pagado?</b>: solo se puede cambiar si el pedido <b>no estaba ya pagado</b>. Si el jefe lo dejó pagado al emitirlo, aparece bloqueado. Si estaba «no pagado», quien lo recibe lo paga y lo marca.</li><li>Pulsa <b>GUARDAR CAMBIOS</b>. Cuando el pedido está <b>recibido y pagado</b>, sale de la lista y se guarda en la contabilidad: en el registro de pedidos y en los gastos de la semana (categoría Proveedor), y por tanto en el balance.</li></ul>
<p>Si dos empleados lo tocan a la vez, el sistema parte siempre de lo último guardado, para que no se pisen. Para actualizar un pedido hace falta conexión.</p>`],
['Materiales',`<p>La tercera pestaña, <b>MATERIALES</b> (junto a VENTA y PRESUPUESTO), muestra el <b>almacén de materiales</b>: todo lo que traen los proveedores (palos, fibras, hierro, carbón, sal, piezas…) con las unidades que hay. Es solo de consulta.</p>
<ul><li>Hay <b>dos almacenes separados</b>: el <b>stock de productos</b> (lo que se vende) y el <b>almacén de materiales</b> (con lo que se fabrica). Las ventas solo restan stock de productos; nunca tocan los materiales.</li><li>Los materiales <b>entran solos</b> cuando un pedido a proveedor se marca como <b>RECIBIDO</b> (aunque aún no esté pagado). Si un material es nuevo, se crea en el almacén y ya se puede usar en las recetas.</li><li>Los materiales <b>salen solos al fabricar</b>, según la receta de cada producto.</li><li>No se pueden cambiar a mano.</li><li>Cada material tiene una <b>barra de nivel</b> (verde, ámbar o roja) y la etiqueta <b>BAJO</b> si está por debajo del mínimo que fije el jefe.</li><li>En Discord, el canal «Materiales» tiene un mensaje con el almacén que se actualiza en tiempo real; el canal «Stock» hace lo mismo con el stock de productos.</li></ul>`],
['Fabricación y recetas <span class="tag boss">SOLO JEFE</span>',`<p><b>Dirección → FABRICACIÓN</b>: sale la lista de todos los productos (armas, munición y suministros). Toca uno para crear su <b>receta</b>:</p>
<ul><li>Elige un <b>material</b> en el desplegable y escribe cuántas <b>unidades</b> gasta una unidad del producto. Al elegirlo aparece otro desplegable para el siguiente material.</li><li>Pulsa <b>ACEPTAR</b>. «Quitar receta» la borra.</li><li>En la lista ves la receta de cada producto y cuántas unidades se pueden fabricar con el almacén actual.</li></ul>
<p><b>Fabricar</b> = sumar unidades en <b>Dirección → STOCK</b>: se suman al stock de productos y se restan sus materiales, todo a la vez. Antes te muestra un <b>resumen para confirmar</b> («vas a fabricar 3 Cattleman y se gastarán 12 Hierro…»). Si falta algún material, <b>no se suma nada</b> y te dice qué falta y cuánto. Los productos sin receta se suman sin gastar materiales. Al fabricar suena un yunque y cae el sello FABRICADO.</p>
<ul><li><b>↶ Deshacer última fabricación</b>: durante 10 minutos aparece arriba en STOCK; quita esas unidades y devuelve los materiales (si ya se vendieron, no se puede).</li><li><b>Coste y margen</b>: con los precios de los pedidos recibidos (o de la lista del proveedor), cada producto con receta muestra cuánto cuesta fabricarlo, su precio de venta y el margen.</li><li><b>¿Qué me falta?</b>: dentro de la receta, escribe cuántas quieres fabricar y te dice qué materiales faltan. Con <b>PREPARAR PEDIDO A…</b> te deja el pedido al proveedor que los vende ya rellenado, para revisarlo y emitirlo.</li><li><b>Almacén y mínimos de materiales</b>: arriba en FABRICACIÓN puedes fijar el mínimo de cada material; los que bajen de él salen como avisos.</li><li>El buscador encuentra productos y recetas.</li></ul>`],
['Proveedores y pedidos <span class="tag boss">SOLO JEFE</span>',`<ul><li><b>Dirección → PROVEEDORES</b>: crea cada proveedor con el <b>nombre de la empresa</b>, su <b>tipo de negocio</b> (herrería, mina, tala… elige uno de la lista o escribe uno nuevo y quedará guardado para los siguientes), su <b>telegrama</b> y su <b>lista de productos con el precio por unidad</b>. Al escribir un producto aparece otro hueco. Puedes ampliar o cambiar la lista cuando quieras con EDITAR.</li><li><b>FICHA</b>: cada proveedor tiene su ficha con forma de <b>contrato de suministro</b>: el nombre en la cabecera, su telegrama (con ⧉ COPIAR), la ubicación y la lista de precios. Desde ahí puedes pulsar <b>HACER PEDIDO</b> para ir directamente a pedirle con él ya elegido.</li><li><b>Ubicación</b> (opcional): el pueblo donde está el proveedor (Annesburg, Rhodes…). Elige uno de la lista o escribe otro.</li><li><b>Comparar precios</b>: si dos o más proveedores venden lo mismo (por ejemplo «Hierro»), al final de PROVEEDORES sale <b>COMPARAR PRECIOS</b> con todos ordenados del más barato al más caro. Al hacer un pedido, cada producto lleva una etiqueta: <b>✓ el más barato</b> en verde, o en dorado el proveedor que lo vende más barato y a qué precio. Para que los compare, el producto tiene que llamarse igual en los dos.</li><li><b>📋 PEGAR MENSAJE</b> (opcional): en lo alto de la ficha del proveedor, pega el mensaje que te manda (por ejemplo «Mina Rock Roy, de Annesburg. Telegrama MRR-21. Lista de precios: oro 5$, hierro 1,20$, carbón 0,80$, sal 0,50$, azufre 2$») y pulsa <b>RELLENAR LA FICHA</b>. La web pone sola el nombre de la empresa, el telegrama, el tipo de negocio (mina, herrería, aserradero…) y cada producto con su precio. Si un producto viene sin precio, lo deja para que lo escribas tú. Si el proveedor ya estaba en la lista, abre su ficha y actualiza los precios. Revísalo y pulsa CREAR NUEVO PROVEEDOR o GUARDAR CAMBIOS. La forma de siempre, a mano, sigue igual.</li><li>La ficha del proveedor con su lista de precios se publica en el canal de Discord «Proveedores» y <b>se actualiza en el mismo mensaje</b> cada vez que la cambias.</li><li><b>Dirección → REALIZAR NUEVO PEDIDO</b>: elige el proveedor y te sale <b>su lista de productos y precios</b>. Igual que en la calculadora, usa <b>−</b> y <b>+</b> o escribe la cantidad: el subtotal y el total se calculan solos. Si necesitas algo que no está en su lista, añádelo en «Otros materiales». Indica si ya está <b>pagado</b> y pulsa <b>EMITIR PEDIDO</b>: se publica en el canal «Pedidos» con cada producto, el precio por unidad, el total de cada línea y el total, y aparece a todos los empleados en PEDIDOS.</li><li>Cambiar los precios de un proveedor no cambia los pedidos ya emitidos.</li><li>Al emitir un pedido, en Discord sale también como <b>imagen de albarán</b>.</li><li>Con muchos proveedores aparece un buscador (por nombre, tipo o producto).</li><li><b>Dirección → REGISTRO DE PEDIDOS</b>: pedidos completados, por día o por semana, con descarga y <b>ENVIAR A DISCORD</b>.</li><li>Para <b>cancelar</b> un pedido pendiente, ábrelo en PEDIDOS estando en Modo Jefe y pulsa CANCELAR PEDIDO. Si mientras tanto otro empleado ya lo había completado, no se cancela y se te avisa.</li><li>Al emitir, completar o cancelar un pedido se avisa solo al canal de Discord «Pedidos».</li></ul>`],
['Empleados y contratos <span class="tag boss">SOLO JEFE</span>',`<p><b>Dirección → EMPLEADOS</b>. Para incorporar a alguien rellena todos los datos:</p>
<ul><li><b>Nombre</b> del empleado.</li><li><b>Puesto</b>: Jefe, Gerente, Armero experto, Armero o Aprendiz de armero.</li><li><b>Sueldo semanal</b> en dólares (por ejemplo 20 o 40).</li><li><b>Horas semanales</b>: viene puesto 10; cámbialo si hace falta.</li><li><b>Fecha de inicio</b> del contrato. El <b>periodo de prueba</b> es de una semana desde ese día y se calcula solo.</li></ul>
<p>Al pulsar <b>ACEPTAR Y CREAR CONTRATO</b> el empleado aparece en todas las listas (ventas, fichaje, pedidos…) y se publica en el canal de Discord «Empleados» la <b>imagen del contrato</b> con todos sus datos.</p>
<ul><li><b>✎ EDITAR</b>: cambia sus datos. Marca «Publicar el contrato actualizado» si quieres que salga otra vez en Discord. Los empleados que ya tenías aparecen con «Faltan los datos del contrato» hasta que los completes.</li><li><b>📜 CONTRATO</b>: descarga la imagen del contrato.</li><li><b>🗑 PAPELERA</b>: lo quita de las listas, sin borrar sus ventas ni fichajes.</li><li>Los sueldos se pagan en <b>Dirección → SUELDOS</b> (mira la sección «Sueldos» de este tutorial).</li><li>Cada empleado muestra si está <b>conectado ahora</b> o cuándo se le vio por última vez, y si ya ha creado su contraseña.</li><li><b>🔑 RESET CONTRASEÑA</b>: borra la contraseña del empleado; la próxima vez que entre tendrá que crear una nueva. Nadie puede ver las contraseñas, ni siquiera la dirección.</li><li><b>📷 FOTO</b>: sube una foto del personaje (por ejemplo una captura del juego). Sale en el óvalo de su tarjeta de la entrada, en tono sepia, como un retrato antiguo. Sin foto, salen sus iniciales.</li><li><b>⏏ EXPULSAR</b>: cierra su sesión en todos sus dispositivos (por ejemplo, si se le ha quedado pillada) y, si estaba fichado, le ficha la salida en ese momento (sale en Discord como «fichada por la dirección al expulsarle»). Tendrá que volver a elegir su ficha. Los jefes también se pueden expulsar entre sí; a uno mismo, no.</li><li><b>⬆ ASCENSO</b>: sube al empleado al siguiente puesto con su sueldo: Aprendiz de armero ($20) → Armero ($25) → Armero experto ($30) → Gerente ($40, el tope). Se publica el contrato nuevo en Discord, sin periodo de prueba. El día del ascenso cobra todavía el sueldo antiguo y el nuevo cuenta desde el día siguiente.</li><li>Al crear un empleado, el sueldo se rellena solo según el puesto (Jefe $50, Gerente $40, Armero experto $30, Armero $25, Aprendiz $20). Puedes cambiarlo.</li><li>En <b>Registros semanales → Fichaje</b> ves las horas fichadas frente a las contratadas («8 h de 10 h»).</li><li>En el resumen de Dirección te avisa cuando termina el periodo de prueba de alguien.</li></ul>`],
['Clientes <span class="tag boss">SOLO JEFE</span>',`<p><b>Dirección → CLIENTES → AÑADIR CLIENTE</b>: escribe su <b>nombre</b>, el tipo (particular o empresa) y su <b>telegrama</b> (obligatorio). El <b>número de identificación</b>, los <b>números de serie</b> y el <b>arma</b> son opcionales.</p>
<ul><li><b>Armas vendidas · números de serie</b>: no es obligatorio rellenarlo al crearlo. Al escribir un número aparece otro hueco, hasta <b>20 por cliente</b>. Al lado puedes elegir qué arma es (opcional).</li><li><b>FICHA</b>: se abre como un <b>expediente</b> de archivo con su hoja sujeta por un clip. Además de sus datos, muestra su <b>historial de compras</b>: el total que se ha gastado, cuántas compras lleva, cuándo fue la última y cada compra con la fecha, lo que se llevó, quién le atendió y el ticket. Las anuladas salen tachadas y no cuentan. Se apunta solo al cobrar una venta con su nombre de cliente.</li><li><b>FICHA</b>: muestra todos sus datos. Al lado del número de identificación, del telegrama, de cada número de serie y de cada arma hay un botón <b>⧉ COPIAR</b> que lo copia al portapapeles para pegarlo donde quieras.</li><li>Con <b>EDITAR</b> puedes añadir más números de serie, cambiar datos o ponerle <b>precios especiales</b>.</li><li><b>📋 PEGAR MENSAJE</b> (opcional): dentro de la ficha, o con <b>📋 DESDE UN MENSAJE</b> en la lista, pega el mensaje o telegrama del cliente tal cual te llega (por ejemplo «Pascual Martínez, telegrama 4521, identificación 88231. Armas: Lemat n.º 55123, Schofield n.º 77810») y pulsa <b>RELLENAR LA FICHA</b>. La web pone sola el nombre, el telegrama, el número de identificación y los números de serie con su arma, y te dice qué ha rellenado. Revísalo y pulsa GUARDAR CLIENTE. Si el cliente ya existía, añade lo nuevo a su ficha. Puedes seguir rellenándola a mano como siempre.</li><li>Al crearlo se publica su ficha en el canal de Discord «Clientes» (con identificación, armas y números de serie) y, cada vez que le añades algo, <b>se actualiza ese mismo mensaje</b>.</li><li>Los clientes que se guardan solos al vender aparecen en la lista; su ficha sale en Discord la primera vez que los editas o que se les apunta un número de serie.</li><li>Los números de serie también se pueden apuntar <b>al vender</b>: al finalizar una venta con armas sale una ventana para escribirlos.</li><li>La ficha se ve como una <b>tarjeta de registro</b> de papel.</li></ul>`],
['Sueldos',`<p>Los sueldos van por <b>semanas de lunes a domingo</b> y se pagan <b>el domingo</b>. Están en <b>Dirección → Ventas y caja → SUELDOS</b>.</p>
<ul><li>Cada empleado con contrato sale con las <b>horas que ha echado</b> esa semana y lo que le toca cobrar, calculado sobre el <b>sueldo de su contrato</b>.</li><li>Si ha echado todas sus horas cobra el <b>sueldo íntegro</b>.</li><li>Si le faltan horas se le <b>descuenta lo proporcional</b>: sueldo ÷ horas de contrato × horas que faltan. Ej.: sueldo de $50 por 10 h y ha echado 7 h → $50 ÷ 10 = $5 la hora × 3 h = −$15 → cobra <b>$35</b>. Se cuenta también por minutos.</li><li>Si ha echado <b>de más</b>, cobra su sueldo íntegro y se muestra aparte, por ejemplo «+2 h extra». Las horas extra no se pagan solas: tú decides.</li><li>Las horas cuentan <b>hasta que pulsas PAGAR</b>. Lo que se fiche después ese domingo pasa a la semana siguiente.</li><li><b>Ascenso a mitad de semana</b>: cada día se cobra con el sueldo que tenía ese día. El día del ascenso, el antiguo; desde el día siguiente, el nuevo. Ej.: armero ($25) que asciende el martes a armero experto ($30): lunes y martes 2 × $25 ÷ 7 + de miércoles a domingo 5 × $30 ÷ 7 = <b>$28.57</b>.</li><li>Ausencias: con 3 o 4 días esa semana solo se le exigen la mitad de sus horas; con más de 4 días queda exento y cobra el sueldo íntegro.</li><li>Pulsa <b>PAGAR</b> en cada empleado: se apunta en <b>GASTOS</b> (tipo Sueldos) con la fecha del pago, así que entra en la semana de cuentas (viernes a jueves) en curso, y se sincroniza con todos los dispositivos. Nada se paga solo: siempre tienes que pulsar tú.</li><li>No se puede pagar dos veces el mismo sueldo, ni desde dos dispositivos. Si te equivocas, borra ese gasto en GASTOS y podrás pagarlo de nuevo.</li><li>Con ◂ ▸ ves semanas anteriores y la <b>semana en curso</b> (provisional, todavía no se puede pagar).</li></ul>
<p><b>Placa de la pantalla principal</b> (la ven todos):</p>
<ul><li><b>DÍA DE PAGO</b> en dorado desde el domingo, mientras quede algún sueldo por pagar, con «3 de 5 sueldos pagados». Si no se paga el domingo, sigue saliendo hasta que se pague.</li><li>Al pagar el último, cambia sola a <b>SUELDOS PAGADOS</b> en verde en todos los dispositivos, y se queda hasta el jueves.</li><li>Cada empleado ve también <b>su propio sueldo</b> y si está pagado. El de los demás solo lo ves tú.</li><li>Tócala para ir directamente a SUELDOS.</li></ul>
<p><b>Discord</b>: al pagar el último sueldo de la semana se publica <b>un solo mensaje</b> en el canal «Sueldos» con todos los empleados: horas echadas, sueldo, si es íntegro o cuánto se le ha descontado y lo pagado.</p>`],
['Ausencias',`<p>Si no vas a poder entrar al servidor durante un tiempo, avísalo con el botón <b>AUSENCIAS</b> (arriba, junto a Pedidos):</p>
<ol><li>Pulsa <b>+ AVISAR DE UNA AUSENCIA</b>.</li><li>Elige tu <b>nombre</b>, <b>desde</b> cuándo (ahora, mañana, pasado mañana u otra fecha) y la <b>duración</b>: horas, días, semanas o «sin fecha de vuelta», y cuántas.</li><li>Elige el <b>motivo</b> y explícalo en el recuadro.</li><li>Pulsa <b>CONFIRMAR AUSENCIA</b>. La web te dice cuándo vuelves aproximadamente.</li></ol>
<ul><li>Tus compañeros solo ven que estás ausente y hasta cuándo («Arthur · ausente hasta el lunes»). <b>El motivo solo lo ve la dirección</b>, en Dirección → AUSENCIAS y en el canal de Discord «Ausencias».</li><li>Si vuelves antes, pulsa <b>✓ HE VUELTO</b>. Al fichar la entrada, una ausencia en curso se termina sola.</li><li>Las ausencias futuras se pueden <b>anular</b>.</li><li><b>Horas semanales</b> (semana de sueldos, de lunes a domingo): con menos de 3 días de ausencia esa semana tienes que echar todas tus horas; con 3 o 4 días, la mitad; con más de 4 días, quedas exento esa semana. En SUELDOS se ve así: «de 5 h (ausente 3 días: la mitad)» o «EXENTO».</li></ul>`],
['Fichaje',`<ul><li><b>▸ Fichar entrada</b>: te ficha a ti directamente (el usuario con el que has entrado).</li><li>Arriba se ven todos los compañeros que están fichados ahora.</li><li><b>◂ Fichar salida</b>: ficha tu salida. Se muestra el registro con el tiempo trabajado y puedes copiarlo o descargarlo.</li><li><b>Último registro</b> vuelve a abrir el último fichaje.</li><li>Al fichar la entrada, la web te saluda; al fichar la salida, te dice cuánto has vendido hoy.</li><li>Si alguien lleva <b>más de 8 horas</b> fichado, su placa se pone en rojo («¿olvidó fichar la salida?») y sale un aviso en Dirección. El jefe lo cierra en <b>Dirección → Registros horarios → TURNOS ABIERTOS</b>, poniendo la <b>hora real de salida</b>, para que las horas cuadren.</li><li>Cuando ficha la salida el <b>último empleado</b>, se publica en Discord, en su canal «Resumen del día», un resumen: ventas, gastos, beneficio, encargos nuevos, pedidos recibidos, unidades fabricadas y quién ha trabajado.</li></ul>`],
['Modo Jefe y Dirección <span class="tag boss">SOLO JEFE</span>',`<ul><li>Los jefes entran eligiendo su ficha (puesto «Jefe») y escribiendo la <b>contraseña de jefe</b>, que es la misma para todos. La primera vez se crea la contraseña y una <b>palabra de seguridad</b>. Si olvidas la contraseña, «Cambiar contraseña» pide la palabra y te deja poner otra.</li><li>El modo jefe se queda activado hasta que cierras la web.</li><li>Mientras no haya ningún empleado con el puesto «Jefe», sigue estando el botón <b>JEFE</b> de arriba para entrar con la contraseña (por ejemplo, la primera vez).</li></ul>
<p><b>DIRECCIÓN</b> abre la consola: resumen de hoy (ventas, gastos, beneficio, encargos, stock bajo, pedidos, materiales y empleados en prueba), una lista de <b>AVISOS</b> (pruebas que terminan, encargos vencidos, pedidos que tardan, stock o materiales bajos), el gráfico de la semana y las herramientas, agrupadas en <b>secciones plegables</b> (Ventas y caja, Catálogo, Almacén y fabricación, Proveedores, Personal, Clientes, Sistema). La web recuerda qué secciones dejas abiertas. En el ordenador, el resumen y los apartados se ven en <b>cuadrícula</b>. Dentro de cada apartado, el botón <b>? AYUDA</b> abre directamente su explicación en este tutorial. <b>Las semanas de las cuentas van de viernes a jueves</b>.</p><p>En Modo Jefe, al tocar el nombre de un producto del catálogo, su ficha muestra además el stock exacto, las unidades vendidas esta semana, la receta, el coste y el margen. El ranking semanal lleva medallas y el registro de stock, barras de nivel.</p>
<ul><li><b>Convenios y ofertas</b>: crear, ver y eliminar.</li><li><b>Sueldos</b>: el pago de los domingos (semana de lunes a domingo) según las horas echadas, con el botón PAGAR.</li><li><b>Ausencias</b>: quién está ausente, hasta cuándo y el motivo (solo tú lo ves); puedes darlas por terminadas o borrarlas.</li><li><b>Empleados</b> (puesto, sueldo, contrato) y <b>Clientes</b> (telegrama, números de serie y precios especiales).</li><li><b>Productos y precios</b>: cambiar precios y añadir productos.</li><li><b>Stock</b>: sumar existencias (fabricar) con − / + y fijar el mínimo (el semáforo marca verde, ámbar o rojo). <b>Fabricación</b>: las recetas de materiales. <b>Registro de stock</b>: existencias y movimientos.</li><li><b>Registros horarios, de ventas</b> (buscar y <b>anular</b>) y <b>semanales</b> (con descarga).</li><li><b>Gastos</b>, <b>Balance de cuentas</b> y <b>Cierre de caja</b>, cada uno con descarga y «Enviar a Discord».</li><li><b>Proveedores</b>, <b>Realizar nuevo pedido</b> y <b>Registro de pedidos</b>.</li><li><b>Discord</b>, <b>Nube</b>, <b>Copia de seguridad</b> y <b>Resetear datos</b> (borra ventas, gastos, encargos y demás, sin tocar empleados ni configuración).</li></ul>`],
['Datos y dispositivos',`<p>Todos los datos están en la <b>nube</b> y se comparten entre los móviles en pocos segundos:</p>
<ul><li><b>Configuración</b>: empleados, clientes, proveedores, convenios y ofertas, precios, productos nuevos, Discord, mínimos de stock y la contraseña del jefe.</li><li><b>Operación</b>: stock, ventas, encargos, pedidos a proveedores, fichajes, gastos y cierres. Los números de venta y el stock los controla la nube, así que nunca se repiten ni se vende lo que ya no hay.</li></ul>
<p>Los cambios llegan a los demás móviles <b>al instante</b>: la nube avisa en cuanto algo cambia. Si ese aviso no funcionara, cada móvil sigue comprobando la nube cada pocos segundos. Arriba, junto a FICHAJE, ves «☁ conectado», «☁ guardando…», «☁ guardado ✓» o «☁ sin conexión». <b>Sin conexión</b> puedes mirar el catálogo y hacer presupuestos, pero no finalizar ventas ni cambiar el stock. Los cambios de configuración se suben solos al volver la conexión.</p>
<p>Haz una <b>copia de seguridad</b> de vez en cuando desde Dirección.</p>`],
['Novedades: deshacer, sin conexión y app',`<ul><li><b>Deshacer</b>: al borrar un gasto, un cliente o un proveedor, anular o borrar una ausencia, o empezar una venta nueva con productos puestos, el aviso de abajo lleva un botón <b>DESHACER</b> durante unos segundos. Discord no se entera hasta que pasa ese tiempo.</li><li><b>Barra de abajo (móvil)</b>: siempre a mano, con <b>VENTA</b> (vuelve arriba, al catálogo), <b>ENCARGOS</b>, <b>PEDIDOS</b>, <b>AUSENCIAS</b> y <b>FICHAR</b> / <b>SALIDA</b>. El número rojo indica cuántos hay pendientes. Cuando tienes productos en la venta, la barra del total se coloca justo encima.</li><li><b>Atajos de teclado (ordenador)</b>: <kbd>/</kbd> para buscar un producto, <kbd>1</kbd> a <kbd>9</kbd> para cambiar de categoría, <kbd>Ctrl</kbd>+<kbd>Enter</kbd> para finalizar la venta, <kbd>?</kbd> para abrir este tutorial y <kbd>Esc</kbd> para cerrar ventanas. Los tienes también en ⚙ Ajustes.</li><li><b>Sin conexión</b>: si se cae la conexión sale una franja roja arriba. Puedes seguir trabajando: lo que hagas se guarda y se envía al volver.</li><li><b>Cerrar sesión</b>: al fichar tu salida, la web te pregunta si quieres cerrar tu sesión en ese dispositivo.</li><li><b>👁</b> junto a las contraseñas sirve para ver lo que escribes.</li><li><b>Como una app</b>: la web se guarda en el móvil, así que se abre al instante y aunque no haya conexión. En el móvil puedes añadirla a la pantalla de inicio desde el menú del navegador («Añadir a pantalla de inicio»).</li><li>En el <b>ordenador</b> la web ocupa toda la pantalla: productos en columnas y el pedido siempre a la derecha.</li><li>Con poca batería o con el ahorro de datos activado, se quitan los efectos de lluvia para gastar menos.</li><li><b>ABIERTO / CERRADO</b>: la tienda está abierta cuando hay alguien fichado. En la entrada cuelga el cartel en la puerta con quién atiende, y en la pantalla principal sale junto al fichaje.</li><li>Este tutorial enseña a cada uno lo suyo: los empleados solo ven lo que usan; la dirección ve además su parte al final.</li></ul>`],
['Modo prueba (Arthur Ayudante)',`<ul><li>En la entrada, la última tarjeta es <b>Arthur Ayudante</b>, con el sello «PRUEBA». Sirve para probar las novedades sin miedo.</li><li>La primera vez te pide crear su contraseña; después, siempre la misma (es la única cosa que se guarda de verdad).</li><li>Dentro entras como jefe, con DIRECCIÓN, y ves una copia de los datos reales del momento.</li><li><b>Nada de lo que hagas se guarda</b> en la base de datos ni afecta a la web de verdad, y <b>no se envía nada a Discord</b>. Arriba sale la franja amarilla «MODO PRUEBA».</li><li>El botón <b>DISCORD (n)</b> de la franja enseña los mensajes que se habrían enviado, para comprobar que salen bien.</li><li><b>SALIR</b> (o cerrar la pestaña) borra la prueba y vuelve a la entrada normal.</li><li>Arthur Ayudante no aparece en Empleados, Sueldos ni en ningún listado.</li></ul>`],
['Objetivo, buscador y revisión',`<ul><li><b>Objetivo semanal</b> (Dirección → Ventas y caja → OBJETIVO SEMANAL): pon una meta de ventas para la semana (viernes a jueves). En la pantalla principal sale una barra dorada que se va llenando con lo cobrado; al llegar a la meta se pone verde y salta la celebración.</li><li><b>Buscador</b> (arriba en la consola de Dirección): escribe un cliente, un número de serie, un ticket, un encargo, un pedido o un empleado y pulsa ABRIR para ir a su apartado.</li><li><b>Revisión de datos</b> (Dirección → Sistema): comprueba stock negativo, turnos abiertos de hace mucho, ventas sin empleado, gastos o clientes repetidos, encargos y pedidos atascados y productos que se van a acabar, y te dice cómo arreglarlo. No cambia nada sola.</li><li><b>Productos que se acaban</b>: si al ritmo de ventas de las dos últimas semanas a un producto le quedan 5 días o menos, sale un aviso en Dirección.</li><li><b>Ficha completa</b> (Empleados → 📋 FICHA COMPLETA): ventas, cobrado, horas, sueldos, ausencias y ascensos de cada empleado.</li><li>Detalles nuevos: monedas de oro que caen al total al cobrar, el reloj de bolsillo junto a tu nombre mientras estás fichado, el cartel de «SE BUSCA» del empleado de la semana, los sellos ENTREGADO y RECIBIDO, la tablilla de AGOTADO y los mensajes de Discord con su imagen.</li></ul>`],
['Si algo no funciona',`<ul><li><b>No deja finalizar</b>: lee el aviso; suele faltar cliente, empleado, telegrama, pago adelantado o stock.</li><li><b>Producto SIN STOCK</b>: el jefe debe sumar existencias.</li><li><b>No suena</b>: en ⚙ comprueba que el sonido diga «♪ SÍ» y el volumen del móvil.</li><li><b>Un botón no responde</b>: si muestra ⏳, está guardando; espera a que termine.</li><li><b>No suena la música</b>: los navegadores no dejan sonar nada hasta que tocas la pantalla; toca cualquier sitio. Si sigue sin sonar, en ⚙ comprueba que «Música de fondo» diga «♫ SÍ».</li><li><b>Se lee poco</b>: usa A+ o el alto contraste ◐.</li><li><b>No ves un cambio reciente</b>: abre la web en una pestaña privada.</li></ul>`]];
const tutModal=document.getElementById('tutModal');
const HELP_MAP={objetivo:'Objetivo, buscador y revisión',revision:'Objetivo, buscador y revisión',empficha:'Empleados y contratos',sueldos:'Sueldos',ausencias:'Ausencias',convenios:'Convenios',empleados:'Empleados y contratos',clientes:'Clientes',productos:'Modo Jefe',stock:'Fabricación y recetas',fabricacion:'Fabricación y recetas',regstock:'Modo Jefe',horarios:'Fichaje',ventas:'Modo Jefe',semanales:'Ticket, copias y Discord',gastos:'Empleados y contratos',balance:'Ticket, copias y Discord',cierre:'Modo Jefe',proveedores:'Proveedores y pedidos',nuevopedido:'Proveedores y pedidos',regpedidos:'Proveedores y pedidos',discord:'Ticket, copias y Discord',nube:'Datos y dispositivos',reset:'Datos y dispositivos',copia:'Datos y dispositivos'};
/* El tutorial muestra a cada uno lo suyo: los empleados no ven nada de Dirección ni de jefes */
const TUT_BOSS=['Fabricación y recetas','Proveedores y pedidos','Empleados y contratos','Clientes','Sueldos','Modo Jefe y Dirección','Datos y dispositivos','Modo prueba','Objetivo, buscador y revisión','Convenios, ofertas y precios especiales'];
const TUT_BOSS_RE=/Dirección|DIRECCIÓN|Modo Jefe|MODO JEFE|modo jefe|contraseña de jefe|SOLO JEFE|data-dir=/;
function tutIsBoss(t){return /tag boss/.test(t[0])||TUT_BOSS.some(n=>t[0].indexOf(n)===0)}
function tutClean(html){const d=document.createElement('div');d.innerHTML=html;d.querySelectorAll('li,p').forEach(el=>{if(TUT_BOSS_RE.test(el.innerHTML))el.remove()});d.querySelectorAll('ul,ol').forEach(l=>{if(!l.children.length)l.remove()});return d.innerHTML}
function tutHTML(focus){
 const boss=bossActive||isJefe(meEmp());let n=0;
 const row=(t,body)=>`<details class="tut"${n===0&&!focus?' open':''}><summary><span class="tut-n">${++n}</span>${t}</summary><div class="tut-c">${body}</div></details>`;
 const emp=TUTORIAL.filter(t=>!tutIsBoss(t)).map(t=>{const b=boss?t[1]:tutClean(t[1]);return b.replace(/<[^>]+>/g,'').trim()?row(t[0],b):''}).join('');
 if(!boss)return emp;
 return emp+'<div class="tut-group">PARA LA DIRECCIÓN</div>'+TUTORIAL.filter(tutIsBoss).map(t=>row(t[0],t[1])).join('');
}
function openTutorial(focus){
 if(typeof focus!=='string')focus='';
 document.getElementById('tutBody').innerHTML='<div class="tour-wrap"><button type="button" class="tour-start" id="tourStart">▶ VISITA GUIADA</button><span>Un recorrido rápido que te señala cada botón.</span></div><p class="tut-intro">Toca cada apartado para ver cómo funciona. Puedes abrir esta guía cuando quieras con el botón «? TUTORIAL» de arriba a la derecha.</p>'+tutHTML(focus);
 openModal(tutModal);tutModal.scrollTop=0;
 if(focus){const ds=[...document.querySelectorAll('#tutBody details.tut')], d=ds.find(x=>x.querySelector('summary').textContent.indexOf(focus)>=0);if(d){ds.forEach(x=>x.open=false);d.open=true;setTimeout(()=>d.scrollIntoView({block:'start'}),60)}}
 const tb=document.getElementById('tourStart');if(tb)tb.onclick=()=>{closeModal(tutModal);startTour()};
}
document.getElementById('tutBtn').onclick=()=>openTutorial();
/* Visita guiada: señala cada parte de la pantalla con una explicación corta */
const TOUR=[
 ['#modeTabs','VENTA para vender de verdad, PRESUPUESTO para calcular un precio sin vender nada y MATERIALES para ver el almacén.'],
 ['#search','Busca un producto por su nombre, o usa los botones de categoría de arriba.'],
 ['#products .product .qty','Elige la cantidad con − y +, o escríbela. Lo que no tiene stock sale como SIN STOCK.'],
 ['#opType','Venta normal o Encargo (el encargo pide telegrama y pago por adelantado).'],
 ['#clientName','El nombre del cliente. Si ya es cliente de la casa, aparece como sugerencia.'],
 ['#empSel','Tu nombre: va solo, es el usuario con el que has entrado.'],
 ['#finish','Este botón te dice qué falta. Cuando está todo, se pone verde: púlsalo para finalizar y sale el ticket.'],
 ['#encBtn','Los encargos pendientes de entregar.'],
 ['#pedBtn','Los pedidos a proveedores: márcalos como recibidos cuando llegue la mercancía.'],
 ['#clockBtn','Ficha la entrada al empezar y la salida al terminar.'],
 ['#setBtn','Ajustes: sonido, música, ambiente día/noche, tamaño del texto y contraste.'],
 ['#tutBtn','Y aquí, el tutorial completo, cuando lo necesites.']
];
let tourI=0;
function startTour(){tourI=0;let o=document.getElementById('tourOv');if(!o){o=document.createElement('div');o.id='tourOv';o.innerHTML='<div id="tourHi"></div><div id="tourTip" role="dialog" aria-live="polite"><div id="tourTx"></div><div class="tour-b"><span id="tourN"></span><button type="button" id="tourPrev">◂</button><button type="button" id="tourNext">Siguiente ▸</button><button type="button" id="tourEnd">Salir</button></div></div>';document.body.appendChild(o);
 document.getElementById('tourPrev').onclick=()=>tourGo(-1);document.getElementById('tourNext').onclick=()=>tourGo(1);document.getElementById('tourEnd').onclick=endTour;window.addEventListener('resize',()=>{if(!o.hidden)tourShow()})}
 o.hidden=false;tourShow()}
function tourEl(i){const s=TOUR[i];if(!s)return null;if(!bossActive&&/#dirBtn|#bossBtn|data-dir/.test(s[0]))return null;const e=document.querySelector(s[0]);return e&&e.getClientRects().length?e:null}
function tourGo(d){let i=tourI+d;while(i>=0&&i<TOUR.length&&!tourEl(i))i+=d;if(i<0)return;if(i>=TOUR.length)return endTour();tourI=i;tourShow()}
function tourShow(){
 if(!tourEl(tourI)){tourGo(1);return}
 const e=tourEl(tourI);e.scrollIntoView({block:'center'});
 const r=e.getBoundingClientRect(), hi=document.getElementById('tourHi'), tip=document.getElementById('tourTip'), pad=6;
 Object.assign(hi.style,{left:(r.left-pad)+'px',top:(r.top-pad)+'px',width:(r.width+pad*2)+'px',height:(r.height+pad*2)+'px'});
 document.getElementById('tourTx').textContent=TOUR[tourI][1];document.getElementById('tourN').textContent=(tourI+1)+' / '+TOUR.length;
 document.getElementById('tourNext').textContent=tourI===TOUR.length-1?'Terminar ✓':'Siguiente ▸';
 const w=Math.min(340,innerWidth-24);tip.style.width=w+'px';tip.style.left=Math.max(12,Math.min(r.left,innerWidth-w-12))+'px';
 const below=r.bottom+14+150<innerHeight;tip.style.top=(below?r.bottom+14:Math.max(12,r.top-14-tip.offsetHeight))+'px';
}
function endTour(){const o=document.getElementById('tourOv');if(o)o.hidden=true;say('Visita terminada · puedes repetirla desde el tutorial')}
document.addEventListener('keydown',e=>{const o=document.getElementById('tourOv');if(o&&!o.hidden){if(e.key==='Escape')endTour();else if(e.key==='ArrowRight')tourGo(1);else if(e.key==='ArrowLeft')tourGo(-1)}});
document.getElementById('tutClose').onclick=()=>closeModal(tutModal);
tutModal.addEventListener('click',e=>{if(e.target===tutModal)closeModal(tutModal)});
refreshClientList();
document.getElementById('obSum').onclick=()=>document.querySelector('.order').scrollIntoView({behavior:'smooth',block:'start'});
document.getElementById('obGo').onclick=()=>document.getElementById('finish').click();
if('IntersectionObserver' in window)new IntersectionObserver(es=>{orderVisible=es[0].isIntersecting;updateOrderBar()},{threshold:.25}).observe(document.querySelector('.order'));
window.addEventListener('resize',()=>updateOrderBar());
dirModal.addEventListener('input',e=>{
 const t=e.target, d=t.dataset||{};
 if(d.filter){const q=norm(t.value.trim());dirModal.querySelectorAll('[data-q]').forEach(el=>{el.style.display=el.dataset.q.includes(q)?'':'none'})}
 else if(d.min!==undefined){const v=t.value.replace(/[^0-9]/g,'').slice(0,6);t.value=v;minDraft[d.min]=v}
});
inputs.forEach(i=>i.closest('.product').querySelector('.pname').insertAdjacentHTML('beforeend','<em class="nostock" hidden>SIN STOCK</em>'));
function captureMode(){
 const q={};inputs.forEach(i=>{const n=readQty(i);if(n)q[i.dataset.name]=n});
 return {qty:q,customer:JSON.parse(JSON.stringify(customer)),loadedEnc:loadedEnc};
}
function applyMode(st){
 clearQuantities();
 Object.keys(st.qty).forEach(n=>{const i=inputs.find(x=>x.dataset.name===n);if(i)i.value=st.qty[n]});
 customer=st.customer||defaultCustomer();loadedEnc=st.loadedEnc||null;
}
/* Venta y Presupuesto comparten catálogo, precios y lógica, pero cada modo conserva sus propias cantidades */
function setMode(m){
 if(m===appMode)return;
 modeStash[appMode]=captureMode();
 appMode=m;
 applyMode(modeStash[m]||{qty:{},customer:null,loadedEnc:null});
 document.body.classList.toggle('mode-presupuesto',m==='presupuesto');
 document.querySelectorAll('.mode-tab').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));
 document.getElementById('orderTitle').textContent=m==='presupuesto'?'PRESUPUESTO':'PEDIDO ACTUAL';
 const gr=document.querySelector('.grid');gr.classList.remove('flip');void gr.offsetWidth;gr.classList.add('flip');
 renderCustomer();customerChanged();
}
document.querySelectorAll('.mode-tab[data-mode]').forEach(b=>b.onclick=()=>{if(b.dataset.mode!==appMode)playClick();setMode(b.dataset.mode)});
document.getElementById('toSale').onclick=async()=>{
 if(appMode!=='presupuesto')return;
 const st=captureMode();
 if(!Object.keys(st.qty).length)return say('El presupuesto está vacío');
 const v=modeStash.venta;
 if((v&&Object.keys(v.qty||{}).length)||sale){if(!await askConfirm('Pasar a venta','En VENTA ya hay un pedido a medias. Se sustituirá por este presupuesto.','Sustituir'))return}
 setMode('venta');
 if(sale)resetSale();
 releaseEncargo();
 st.customer.op='venta';
 applyMode({qty:st.qty,customer:st.customer,loadedEnc:null});
 renderCustomer();customerChanged();calc(false);say('Presupuesto pasado a venta: revisa y finaliza');
};
/* Pestaña MATERIALES: el almacén de lo que traen los proveedores (solo consulta) */
const matModal=document.getElementById('matModal');
function renderMat(){
 const ns=matNames(), uses=n=>inputs.map(i=>i.dataset.name).filter(p=>recipeOf(p).some(r=>r.m===n));
 document.getElementById('matTitle').textContent=`ALMACÉN DE MATERIALES (${ns.length})`;
 const mx=Math.max(0,...ns.map(n=>stockMap[matKey(n)]||0)), lm=lowMats();
 document.getElementById('matBody').innerHTML=(ns.length?ns.map(n=>{const v=stockMap[matKey(n)]||0,u=uses(n);return `<div class="mat-line"><div><b>${esc(n)}${lm.indexOf(n)>=0?' <span class="lowtag">BAJO</span>':''}</b>${lvlBar(v,stockMin[matKey(n)]||0,mx)}${u.length?`<small>Se usa en: ${esc(u.slice(0,4).join(', '))}${u.length>4?' y '+(u.length-4)+' más':''}</small>`:''}</div><span class="${v?'':'zero'}">${v} ${v===1?'ud.':'uds.'}</span></div>`}).join(''):'<div class="enc-empty">'+emptyArt('anvil')+'Todavía no hay materiales.<br>Se suman solos cuando se recibe un pedido a un proveedor.</div>')+
  '<p class="bk-note" style="margin-top:10px">Los materiales <b>entran</b> al marcar un pedido como recibido y <b>se gastan</b> al fabricar (cuando el jefe suma stock de un producto con receta). Las ventas no los tocan.</p>';
}
document.getElementById('matTab').onclick=async()=>{playClick();renderMat();openModal(matModal);matModal.scrollTop=0;try{await refreshStock();if(!matModal.hidden)renderMat()}catch(e){}};
document.getElementById('matClose').onclick=()=>closeModal(matModal);
matModal.addEventListener('click',e=>{if(e.target===matModal)closeModal(matModal)});


/* ===== Fichaje de empleados ===== */
const KEY_SHIFT='harrington_shift_v1', KEY_LASTSHIFT='harrington_lastshift_v1', KEY_EMPLOYEE='harrington_employee_v1';
const entryModal=document.getElementById('entryModal'), shiftModal=document.getElementById('shiftModal');
const clockStatus=document.getElementById('clockStatus'), clockBtn=document.getElementById('clockBtn'), clockOutBtn=document.getElementById('clockOutBtn'), lastShiftBtn=document.getElementById('lastShiftBtn');
const employeeInput=document.getElementById('employeeName');
let shifts=[], lastShift=null, entryMode='in';
function loadJSON(k){try{return JSON.parse(store.get(k)||'null')}catch(e){return null}}
function fmtDate(ms){const m=madridParts(ms);return `${m.day}/${m.month}/${m.year}`}
function fmtTime(ms){const m=madridParts(ms);return `${m.hour}:${m.minute}`}
function fmtStamp(ms){return `${fmtDate(ms)} ${fmtTime(ms)}`}
function fmtDuration(a,b){const m=Math.max(0,Math.round((b-a)/60000));return `${Math.floor(m/60)} h ${pad(m%60)} min`}
function renderClock(){
 const el=m=>{const mm=Math.max(0,Math.floor(m/60000));return mm<60?mm+' min':Math.floor(mm/60)+' h '+pad(mm%60)+' min'};
 clockStatus.innerHTML=shifts.length?shifts.map(x=>{const lg=Date.now()-x.start>MAX_SHIFT_H*3600000;return `<span class="shift-chip${lg?' long':''}" title="Entrada: ${esc(fmtTime(x.start))}"><i></i>${lg?'⚠ ':''}${esc(x.name)} · ${el(Date.now()-x.start)}${lg?' · ¿olvidó fichar la salida?':''}</span>`}).join(''):'Sin fichar';
 try{shopState()}catch(e){}
 {const me=meEmp(), mine=me&&shifts.some(x=>x.empId===me.id);clockOutBtn.hidden=me?!mine:!shifts.length;clockBtn.hidden=!!mine;try{paintPocket()}catch(e){}}
 lastShiftBtn.hidden=!lastShift;
}
setInterval(()=>{if(shifts.length)renderClock()},30000);
function renderEmpWeek(){
 const el=document.getElementById('empWeek'); if(!el)return;
 const ws=weekStart(-1), tot={};
 loadLog(KEY_SALELOG).forEach(r=>{if(r.voided||!r.employee)return;const d=saleDay(r);if(d<ws||d>ws+6)return;tot[r.employee]=(tot[r.employee]||0)+collected(r)});
 const top=Object.keys(tot).sort((a,b)=>tot[b]-tot[a])[0];
 if(!top||tot[top]<=0){el.hidden=true;return}
 const emp=empleados.find(x=>x.name===top), ph=emp&&typeof PHOTOS!=='undefined'?PHOTOS[emp.id]:null, wanted=IMG_OK['cartel-se-busca.webp'];
 el.classList.toggle('wanted',!!wanted);
 const html=(wanted?`<span class="ew-poster" aria-hidden="true"><span class="ew-ph">${ph?`<img src="${ph}" alt="">`:esc(top.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase())}</span><span class="ew-nm">${esc(top)}</span><span class="ew-rw">${money(tot[top])}</span></span>`:`<span class="ew-medal" aria-hidden="true">★</span>`)+`<div><small>EMPLEADO DE LA SEMANA</small><b>${esc(top)}</b><span>${money(tot[top])} cobrados · semana ${dayStr(ws).slice(0,5)} – ${dayStr(ws+6).slice(0,5)}</span></div>`;
 if(el.innerHTML!==html)el.innerHTML=html;el.hidden=false;
}
function fillEmployeeSelect(list,last){
 employeeInput.innerHTML='<option value="">Seleccionar empleado</option>'+list.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
 employeeInput.value=list.some(e=>e.id===last)?last:'';
}
function openEntry(){
 const me=meEmp();
 if(me){if(shifts.some(x=>x.empId===me.id))return say('Ya has fichado la entrada');entryMode='in';fillEmployeeSelect([me],me.id);return acceptEntry()}
 const free=empleados.filter(e=>!shifts.some(x=>x.empId===e.id));
 if(!empleados.length)return say('Dirección todavía no ha creado empleados');
 if(!free.length)return say('Todos los empleados ya han fichado la entrada');
 entryMode='in';
 document.getElementById('entryTitle').textContent='Fichar entrada';
 fillEmployeeSelect(free,store.get(KEY_EMPLOYEE));
 openModal(entryModal);setTimeout(()=>employeeInput.focus(),60);
}
function openExit(){
 if(!shifts.length)return;
 {const me=meEmp();if(me){if(shifts.some(x=>x.empId===me.id))return doExit(me.id);return say('No has fichado la entrada')}}
 if(shifts.length===1)return doExit(shifts[0].empId);
 entryMode='out';
 document.getElementById('entryTitle').textContent='Fichar salida';
 fillEmployeeSelect(shifts.map(x=>({id:x.empId,name:x.name})),'');
 openModal(entryModal);setTimeout(()=>employeeInput.focus(),60);
}
function acceptEntry(){
 if(entryMode==='out'){
  const id=employeeInput.value;
  if(!shifts.some(x=>x.empId===id))return say('Selecciona un empleado');
  closeModal(entryModal);return doExit(id);
 }
 const emp=empleados.find(e=>e.id===employeeInput.value);
 if(!emp)return say('Selecciona un empleado');
 const sh={name:emp.name,empId:emp.id,start:Date.now()};
 shifts.push(sh);store.set(KEY_SHIFT,JSON.stringify(shifts));store.set(KEY_EMPLOYEE,emp.id);cloudPut('fichaje:'+emp.id,sh);
 ausencias.filter(a=>a.empId===emp.id&&ausActive(a)).forEach(a=>ausEndNow(a.id,true));
 closeModal(entryModal);renderClock();say(`${saludo()}, ${emp.name}. Entrada a las ${fmtTime(sh.start)}: que sea una jornada próspera.`,'long');
 discordSend('fichajes','ENTRADA · '+emp.name+'\n'+fmtDate(sh.start)+' '+fmtTime(sh.start));
}
function showShift(r){
 const same=fmtDate(r.start)===fmtDate(r.end);
 document.getElementById('shName').textContent=r.name;
 document.getElementById('shIn').textContent=same?fmtTime(r.start):fmtStamp(r.start);
 document.getElementById('shOut').textContent=same?fmtTime(r.end):fmtStamp(r.end);
 document.getElementById('shTime').textContent=(same?fmtDate(r.start)+' · ':'')+fmtDuration(r.start,r.end);
 openModal(shiftModal);shiftModal.scrollTop=0;
}
function doExit(empId){
 const sh=shifts.find(x=>x.empId===empId); if(!sh)return;
 endShift(sh,Date.now(),false);showShift(lastShift);
 const s=todaySalesOf(sh.name);
 say(s.n?`Buen trabajo, ${sh.name}: hoy has vendido ${money(s.c)} en ${s.n} ${plural(s.n,'operación','operaciones')}.`:`Buen trabajo, ${sh.name}. ¡Hasta la próxima jornada!`,'long');
 const me=meEmp();
 if(me&&me.id===empId)setTimeout(async()=>{if(await askConfirm('Cerrar sesión','Has fichado la salida. ¿Quieres cerrar también tu sesión en este dispositivo? Así nadie podrá usar la web a tu nombre.','Cerrar sesión'))logoutToGate('Sesión cerrada. ¡Hasta la próxima jornada, '+me.name.split(' ')[0]+'!')},700);
}
function logoutToGate(msg){
 document.querySelectorAll('.modal-overlay:not([hidden])').forEach(m=>closeModal(m));
 setMe(null);if(bossActive)setBoss(false);
 gateOpen({quick:true,msg:msg||''});
}
const MAX_SHIFT_H=8;
function longShifts(){return shifts.filter(x=>Date.now()-x.start>MAX_SHIFT_H*3600000)}
function saludo(){const h=+madridParts(Date.now()).hour;return h<14?'Buenos días':h<21?'Buenas tardes':'Buenas noches'}
function todaySalesOf(name){const t=todayNum();let n=0,c=0;loadLog(KEY_SALELOG).forEach(r=>{if(r.voided||r.employee!==name||saleDay(r)!==t)return;n++;c+=collected(r)});return {n:n,c:c}}
/* Cierra un turno abierto (fichaje normal o corrección del jefe) */
function endShift(sh,end,fixedBy){
 lastShift={name:sh.name,start:sh.start,end:end};
 store.set(KEY_LASTSHIFT,JSON.stringify(lastShift));logShift(lastShift);
 shifts=shifts.filter(x=>x!==sh);if(shifts.length)store.set(KEY_SHIFT,JSON.stringify(shifts));else store.remove(KEY_SHIFT);cloudDel('fichaje:'+sh.empId);
 renderClock();
 discordSend('fichajes',(fixedBy==='expel'?'SALIDA FICHADA POR LA DIRECCIÓN AL EXPULSARLE\n':fixedBy?'SALIDA CORREGIDA POR LA DIRECCIÓN\n':'')+shiftText(lastShift));
 if(!shifts.length)setTimeout(()=>sendDaySummary(),1500);
}
function closeShiftAt(empId,hhmm){
 const sh=shifts.find(x=>x.empId===empId); if(!sh)return say('Ese turno ya está cerrado');
 const mm=/^(\d{1,2}):(\d{2})$/.exec(hhmm||''); if(!mm)return say('Indica la hora de salida');
 const m=madridParts(sh.start), d=(+mm[1]*60+ +mm[2])-(+m.hour*60+ +m.minute);
 const end=sh.start+((d<=0?d+1440:d)*60000);
 if(end>Date.now())return say('Esa hora todavía no ha llegado: revisa la hora de salida');
 endShift(sh,end,true);say('Turno de '+sh.name+' cerrado a las '+fmtTime(end));renderDir();
}
/* Resumen del día: cuando ficha la salida el último empleado, a su propio canal */
function dayText(){
 const t=todayNum(), a=accounts({s:t,e:t}), L=['RESUMEN DEL DÍA · '+dayStr(t),''];
 L.push('Ventas: '+a.ops+' '+plural(a.ops,'operación','operaciones')+' · cobrado '+money(a.ing),'Gastos: '+money(a.gas),'Beneficio: '+sgn(a.ben));
 const ne=encargos.filter(e=>e.ts&&(()=>{const m=madridParts(e.ts);return dayNum(+m.year,+m.month,+m.day)===t})()).length;
 const pr=pedidos.filter(p=>p.receivedAt&&(()=>{const m=madridParts(p.receivedAt);return dayNum(+m.year,+m.month,+m.day)===t})()).length;
 const fab=loadLog(KEY_STOCKLOG).filter(x=>x.why==='Fabricación'&&x.delta>0&&!/\(material\)$/.test(x.name)&&(()=>{const m=madridParts(x.ts);return dayNum(+m.year,+m.month,+m.day)===t})()).reduce((s,x)=>s+x.delta,0);
 L.push('Encargos nuevos: '+ne,'Pedidos recibidos: '+pr,'Unidades fabricadas: '+fab,'');
 const w={};loadLog(KEY_SHIFTLOG).forEach(r=>{if(shiftDay(r)===t)w[r.name]=(w[r.name]||0)+Math.max(0,r.end-r.start)});
 const ks=Object.keys(w);L.push('Han trabajado: '+(ks.length?'':'nadie ha fichado hoy'));
 ks.forEach(n=>{const s=todaySalesOf(n);L.push('  '+n+' · '+fmtDuration(0,w[n])+(s.n?' · '+s.n+' '+plural(s.n,'venta','ventas')+' ('+money(s.c)+')':''))});
 return L.join('\n');
}
function sendDaySummary(){if(shifts.length)return;discordSend('resumen',dayText())}
function shiftText(r){
 const same=fmtDate(r.start)===fmtDate(r.end), line='────────────────────';
 const out=['HARRINGTON GUNSMITH','REGISTRO DE FICHAJE','Saint Denis · 1880','','Empleado: '+r.name];
 if(same)out.push('Fecha: '+fmtDate(r.start),'Entrada: '+fmtTime(r.start),'Salida: '+fmtTime(r.end));
 else out.push('Entrada: '+fmtStamp(r.start),'Salida: '+fmtStamp(r.end));
 out.push('Tiempo: '+fmtDuration(r.start,r.end),'',line,'El precio de un apellido.');
 return out.join('\n');
}
async function copyShift(){
 if(!lastShift)return;
 const t=shiftText(lastShift);
 if(await copyText(t))say('Fichaje copiado para Discord');else prompt('Copia este texto:',t);
}
function downloadShift(){
 if(!lastShift)return;
 const safe=lastShift.name.replace(/[^A-Za-z0-9áéíóúüñÁÉÍÓÚÜÑ_-]+/g,'_');
 const m=madridParts(lastShift.end), code=m.day+m.month+m.year.slice(-2)+'-'+m.hour+m.minute;
 const blob=new Blob(['\ufeff'+shiftText(lastShift)],{type:'text/plain;charset=utf-8'}), a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download=`Fichaje_${safe}_${code}.txt`;
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(a.href),1500);
 say('Fichaje descargado');
}
clockBtn.onclick=openEntry;
clockOutBtn.onclick=openExit;
lastShiftBtn.onclick=()=>{if(lastShift)showShift(lastShift)};
document.getElementById('entryOk').onclick=acceptEntry;
document.getElementById('entryCancel').onclick=()=>closeModal(entryModal);
employeeInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();acceptEntry()}});
entryModal.addEventListener('click',e=>{if(e.target===entryModal)closeModal(entryModal)});
shiftModal.addEventListener('click',e=>{if(e.target===shiftModal)closeModal(shiftModal)});
document.getElementById('shCopy').onclick=copyShift;
document.getElementById('shDownload').onclick=downloadShift;
document.getElementById('shClose').onclick=()=>closeModal(shiftModal);
{const sv=loadJSON(KEY_SHIFT);shifts=(Array.isArray(sv)?sv:(sv?[sv]:[])).filter(x=>x&&x.name&&x.start).map(x=>Object.assign({empId:x.empId||x.name},x))}
lastShift=loadJSON(KEY_LASTSHIFT);if(lastShift&&!(lastShift.name&&lastShift.start&&lastShift.end))lastShift=null;
renderClock();

/* ===== Imágenes decorativas opcionales: si el archivo existe se usa, si no se mantiene el dibujo en código ===== */
function probeImg(src,ok){const t=new Image();t.onload=()=>ok(t);t.src=src}
probeImg('sello-lacre.webp',()=>document.body.classList.add('has-lacre'));
probeImg('sello-pagado.png',()=>document.body.classList.add('has-pagado'));
probeImg('esquina-ornamento.png',img=>{
 try{
  const n=128, mk=(sx,sy)=>{const c=document.createElement('canvas');c.width=c.height=n;const g=c.getContext('2d');g.translate(sx<0?n:0,sy<0?n:0);g.scale(sx,sy);g.drawImage(img,0,0,n,n);return 'url('+c.toDataURL('image/png')+')'};
  const r=document.documentElement.style;
  r.setProperty('--c-tl',mk(1,1));r.setProperty('--c-tr',mk(-1,1));r.setProperty('--c-bl',mk(1,-1));r.setProperty('--c-br',mk(-1,-1));
  document.body.classList.add('has-corner');
 }catch(e){}
});

/* ===== Nube: sincronización de la configuración compartida con Supabase ===== */
const SB_URL='https://mrlpvjxuifvspeaqtscm.supabase.co', SB_KEY='sb_publishable_OvDXH0UuWJMMBd6fYgOxtg_IsVBZKTz';
function sbFetch(path,opts){
 opts=opts||{};
 const ctl=typeof AbortController!=='undefined'?new AbortController():null, t=ctl?setTimeout(()=>ctl.abort(),9000):null;
 return fetch(SB_URL+path,Object.assign({},opts,{signal:ctl?ctl.signal:undefined,headers:Object.assign({apikey:SB_KEY,'Content-Type':'application/json'},opts.headers||{})})).finally(()=>{if(t)clearTimeout(t)});
}
function saveDirty(){try{localStorage.setItem('harrington_cloud_dirty',JSON.stringify(cloud.dirty))}catch(e){}}
let savingN=0;
function setSaving(on){savingN=Math.max(0,savingN+(on?1:-1));paintCloud()}
function paintCloud(){
 const el=document.getElementById('cloudSt'); if(!el)return;
 let t,c;
 if(cloud.ok===false){t='☁ sin conexión';c='off'}
 else if(savingN>0||cloud.outbox.length||cloud.flushing){t='☁ guardando…';c='saving'}
 else if(cloud.justSaved&&Date.now()-cloud.justSaved<2500){t='☁ guardado ✓';c='ok saved'}
 else if(cloud.ok){t='☁ conectado';c='ok'}else{t='☁ …';c=''}
 if(el.textContent!==t)el.textContent=t;el.className='cloud-st '+c;
}
function setCloudState(ok){cloud.ok=ok;paintCloud();const nb=document.getElementById('netBar');if(!nb)return;
 if(ok){clearTimeout(cloud.netT);cloud.netT=0;nb.hidden=true}else if(!cloud.netT&&nb.hidden)cloud.netT=setTimeout(()=>{cloud.netT=0;if(!cloud.ok)nb.hidden=false},4000)}
function cloudPush(clave){
 cloud.dirty[clave]=true;saveDirty();
 clearTimeout(cloud.timers[clave]);cloud.timers[clave]=setTimeout(()=>cloudFlush(clave),400);
}
async function cloudFlush(clave){
 const key=CLOUD_REV[clave]; let val;
 try{val=JSON.parse(localStorage.getItem(key))}catch(e){return}
 if(val===null||val===undefined){delete cloud.dirty[clave];saveDirty();return}
 try{
  const stamp=new Date().toISOString();
  const r=await sbFetch('/rest/v1/datos?on_conflict=clave',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{clave:clave,valor:val,actualizado:stamp}])});
  if(!r.ok)throw new Error(r.status);
  cloud.stamps[clave]=Date.parse(stamp);delete cloud.dirty[clave];saveDirty();setCloudState(true);
 }catch(e){setCloudState(false)}
}
async function cloudUploadAll(){
 const c=bossCreds();
 if(c&&!c.hashed&&c.word)await saveCreds(store.get(KEY_BOSS_PW),c.word); /* una contraseña antigua se sube cifrada */
 Object.keys(CLOUD_REV).forEach(cl=>{if(localStorage.getItem(CLOUD_REV[cl])!=null)cloud.dirty[cl]=true});
 saveDirty();
 await Promise.all(Object.keys(CLOUD_REV).map(cl=>cloud.dirty[cl]?cloudFlush(cl):null));
}
function applyPrices(pr){inputs.forEach(i=>{const v=pr&&pr[i.dataset.name];i.dataset.price=(v!=null&&Number(v)>=0)?Number(v).toFixed(2):i.dataset.price0});calc(false)}
function cloudReloadSoon(){
 if(cloud.reloading)return;cloud.reloading=true;say('Catálogo actualizado · recargando…');
 const go=()=>{if(document.querySelector('.modal-overlay:not([hidden])'))setTimeout(go,2500);else location.reload()};
 setTimeout(go,1800);
}
function applyRemote(clave,val,t){
 const key=CLOUD_REV[clave];
 let prev=null;try{prev=JSON.stringify(JSON.parse(localStorage.getItem(key)||'null'))}catch(e){}
 cloud.applying=true;
 try{localStorage.setItem(key,JSON.stringify(val))}catch(e){}
 cloud.applying=false;cloud.stamps[clave]=t;
 const same=prev===JSON.stringify(val);
 if(same)return;
 if(clave==='empleados'){empleados=Array.isArray(val)?val:[];renderCustomer();try{applyMe();if(G.open&&gate.dataset.ph==='cards')gateCards();else gateCheck()}catch(e){}}
 else if(clave==='clientes'){clientes=Array.isArray(val)?val:[];refreshClientList()}
 else if(clave==='descuentos'){descuentos=Array.isArray(val)?val:[];renderCustomer()}
 else if(clave==='precios'){applyPrices(val&&typeof val==='object'?val:{})}
 else if(clave==='productos'){cloudReloadSoon()}
 else if(clave==='discord'){webhook=Object.assign({url:''},val,{ev:Object.assign({},EV_DEF,(val&&val.ev)||{}),urls:Object.assign({},(val&&val.urls)||{})})}
 else if(clave==='stockmin'){stockMin=val&&typeof val==='object'&&!Array.isArray(val)?val:{};}
 else if(clave==='proveedores'){proveedores=Array.isArray(val)?val:[]}
 else if(clave==='recetas'){recetas=val&&typeof val==='object'&&!Array.isArray(val)?val:{}}
}
/* --- Datos de operación: ventas, encargos, fichajes, gastos, cierres y stock --- */
function saveOutbox(){try{localStorage.setItem('harrington_cloud_outbox',JSON.stringify(cloud.outbox))}catch(e){}}
function cloudPut(clave,valor){
 cloud.outbox=cloud.outbox.filter(o=>o.clave!==clave);cloud.outbox.push({clave:clave,valor:valor});saveOutbox();
 clearTimeout(cloud.timers.__out);cloud.timers.__out=setTimeout(cloudFlushOutbox,300);paintCloud();
}
function cloudDel(clave){cloudPut(clave,{deleted:true,ts:Date.now()})}
async function cloudFlushOutbox(){
 if(!cloud.outbox.length||cloud.flushing)return;
 cloud.flushing=true;
 const batch=cloud.outbox.slice(0,40), stamp=new Date().toISOString();
 try{
  const rows=batch.map(o=>({clave:o.clave,valor:o.valor,actualizado:stamp}));
  rows.push({clave:'rev',valor:{n:Date.now()+'-'+Math.random().toString(36).slice(2,6)},actualizado:stamp});
  const r=await sbFetch('/rest/v1/datos?on_conflict=clave',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});
  if(!r.ok)throw new Error(r.status);
  cloud.outbox=cloud.outbox.filter(o=>batch.indexOf(o)<0);saveOutbox();cloud.justSaved=Date.now();setCloudState(true);setTimeout(paintCloud,2600);
 }catch(e){setCloudState(false)}
 cloud.flushing=false;
 if(cloud.outbox.length&&cloud.ok)setTimeout(cloudFlushOutbox,200);
}
async function sbRpc(name,body){
 const r=await sbFetch('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(body||{})}), t=await r.text();
 if(!r.ok){const e=new Error(t);e.status=r.status;throw e}
 try{return JSON.parse(t)}catch(e){return t}
}
function cloudRev(){return sbFetch('/rest/v1/datos?on_conflict=clave',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{clave:'rev',valor:{n:Date.now()+'-'+Math.random().toString(36).slice(2,6)},actualizado:new Date().toISOString()}])}).catch(()=>{})}
function applyStockMap(m){stockMap=m&&typeof m==='object'&&!Array.isArray(m)?m:{};saveStock();const mm=document.getElementById('matModal');if(mm&&!mm.hidden&&typeof renderMat==='function')renderMat()}
async function moverStock(items,why){const m=await sbRpc('mover_stock',{p_items:items});applyStockMap(m);cloudRev();invChanged(items,why);return m}
/* --- Almacén de materiales: viven en la misma tabla de stock con el prefijo «mat:» --- */
function matKey(n){return 'mat:'+n}
function isMat(k){return String(k).indexOf('mat:')===0}
function matNames(){return Object.keys(stockMap).filter(isMat).map(k=>k.slice(4)).sort((a,b)=>a.localeCompare(b,'es'))}
function canonMat(n){n=String(n||'').trim().replace(/\s+/g,' ');const f=matNames().find(x=>norm(x)===norm(n));return f||n}
function recipeOf(name){return (recetas[name]||[]).filter(r=>r&&r.m&&r.q>0)}
function recipeText(name){const r=recipeOf(name);return r.length?r.map(x=>x.q+' × '+x.m).join(', '):''}
/* Precio por unidad de cada material: el del último pedido recibido; si no hay, el de la lista del proveedor */
function matCost(n){
 const k=norm(n);let best=null,bt=0;
 pedidos.forEach(p=>{if(!p.received||p.cancelled)return;const t=p.receivedAt||p.ts||0;(p.items||[]).forEach(x=>{if(norm(x.material)===k&&t>=bt){bt=t;best=x.price}})});
 if(best!==null)return best;
 for(const v of proveedores)for(const x of (v.prods||[]))if(norm(x.name)===k)return x.price;
 return null;
}
function productCost(name){const r=recipeOf(name);if(!r.length)return null;let s=0;for(const x of r){const c=matCost(x.m);if(c===null)return undefined;s+=c*x.q}return s}
function productPrice(name){const i=inputs.find(x=>x.dataset.name===name);return i?Math.round(Number(i.dataset.price)*100):0}
function costLine(name){
 const c=productCost(name);if(c===null)return '';
 if(c===undefined)return 'Coste: falta el precio de algún material';
 const p=productPrice(name), mg=p-c;
 return `Coste ${money(c)} · Precio ${money(p)} · <span class="${mg<0?'neg':'okc'}">Margen ${sgn(mg)}</span>`;
}
function lvlBar(v,mn,max){const top=Math.max(1,max,mn*2),p=Math.max(0,Math.min(100,v/top*100)),cls=v<=0?'r':(mn>0&&v<=mn?'a':'g');return `<i class="lvl ${cls}" aria-hidden="true"><b style="width:${p.toFixed(1)}%"></b>${mn>0?`<u style="left:${Math.min(100,mn/top*100).toFixed(1)}%"></u>`:''}</i>`}
function lowMats(){return matNames().filter(n=>{const m=stockMin[matKey(n)]||0;return m>0&&(stockMap[matKey(n)]||0)<=m})}
/* --- Discord: un mensaje de stock y otro de materiales que se editan en tiempo real --- */
let invTimers={}, invLast={};
function invChanged(items,why){
 const fmt=x=>(x.delta>0?'+':'−')+Math.abs(x.delta)+' '+(isMat(x.producto)?x.producto.slice(4):x.producto);
 const P=items.filter(x=>!isMat(x.producto)&&x.delta), M=items.filter(x=>isMat(x.producto)&&x.delta);
 if(P.length){invLast.stock=P.slice(0,4).map(fmt).join(', ')+(P.length>4?'…':'')+(why?' · '+why:'');invSchedule('stock')}
 if(M.length){invLast.materiales=M.slice(0,4).map(fmt).join(', ')+(M.length>4?'…':'')+(why?' · '+why:'');invSchedule('materiales')}
}
function invSchedule(kind){clearTimeout(invTimers[kind]);invTimers[kind]=setTimeout(()=>invPublish(kind),1200)}
function stockText(){
 const L=['STOCK DE PRODUCTOS · HARRINGTON GUNSMITH','Actualizado: '+fmtDate(Date.now())+' '+fmtTime(Date.now())];
 if(invLast.stock)L.push('Último movimiento: '+invLast.stock);
 const low=lowStock();
 CATS.forEach(([c,label])=>{const its=inputs.filter(i=>i.closest('.product').dataset.cat===c);if(!its.length)return;L.push('',label.toUpperCase());its.forEach(i=>{const n=i.dataset.name;L.push('  '+n+' · '+(stockMap[n]||0)+(low.indexOf(n)>=0?' ⚠':''))})});
 if(low.length)L.push('','⚠ = por debajo del mínimo');
 return L.join('\n');
}
function matText(){
 const L=['ALMACÉN DE MATERIALES · HARRINGTON GUNSMITH','Actualizado: '+fmtDate(Date.now())+' '+fmtTime(Date.now())];
 if(invLast.materiales)L.push('Último movimiento: '+invLast.materiales);
 const ns=matNames();L.push('');
 if(!ns.length)L.push('Sin materiales todavía.');
 const lm=lowMats();ns.forEach(n=>L.push('  '+n+' · '+(stockMap[matKey(n)]||0)+(lm.indexOf(n)>=0?' ⚠':'')));
 if(lm.length)L.push('','⚠ = por debajo del mínimo');
 return L.join('\n');
}
async function invPublish(kind){
 if(!(webhook.urls[kind]||webhook.url)||!webhook.ev[kind])return;
 webhook.refs=webhook.refs||{};
 const old=webhook.refs[kind], ref=await discordCard(kind,kind==='stock'?stockText():matText(),old);
 if(ref&&(!old||old.id!==ref.id||old.w!==ref.w)){webhook.refs=Object.assign({},webhook.refs||{},{[kind]:ref});store.set(KEY_WEBHOOK,JSON.stringify(webhook))}
}
async function refreshStock(){
 const r=await sbFetch('/rest/v1/stock?select=producto,cantidad');if(!r.ok)throw new Error(r.status);
 const rows=await r.json();
 if(rows.length){const m={};rows.forEach(x=>{m[x.producto]=x.cantidad});applyStockMap(m)}
}
/* Reserva el stock en la nube de forma atómica: si otro empleado se lo llevó antes, no se vende */
async function stockPrepare(){
 const items=selected();
 if(customer.op==='encargo'&&!loadedEnc)return {ok:true,moved:[]};
 const want={};items.forEach(x=>{const q=x.qty-(x.oq||0);if(q>0)want[x.name]=q});
 const prev=(sale&&sale.stockApplied)||{}, moved=[];
 new Set(Object.keys(want).concat(Object.keys(prev))).forEach(n=>{const d=(want[n]||0)-(prev[n]||0);if(d)moved.push({producto:n,delta:-d})});
 if(!moved.length)return {ok:true,moved:[]};
 try{await moverStock(moved,'Venta');return {ok:true,moved:moved}}
 catch(e){
  if(String(e.message).indexOf('STOCK_INSUFICIENTE')>=0){try{await refreshStock()}catch(x){}calc(false);say('Otro empleado se ha llevado antes ese stock. Revisa las cantidades.')}
  else say('Sin conexión: no se puede finalizar la venta ahora');
  return {ok:false,moved:[]};
 }
}
async function ensureSaleCloud(){
 const items=selected();
 if(!items.length){say('Añade algún producto primero');return null}
 if(!customerOk())return null;
 if(!stockOk(items))return null;
 if(customer.op==='encargo'&&!loadedEnc&&computeFin().raw<=0){say('Para hacer un encargo es obligatorio indicar el pago por adelantado');depositInput.focus();return null}
 const pre=await stockPrepare(); if(!pre.ok)return null;
 if(!sale){
  try{cloud.num=await sbRpc('siguiente_numero')}
  catch(e){if(pre.moved.length){try{await moverStock(pre.moved.map(x=>({producto:x.producto,delta:-x.delta})))}catch(z){}}say('Sin conexión: no se puede finalizar la venta ahora');return null}
 }
 cloud.skipStockOk=true;
 try{return ensureSale()}finally{cloud.skipStockOk=false}
}
const REC_LISTS={
 venta:[()=>KEY_SALELOG,x=>x.id,(a,b)=>String(a.ts||'').localeCompare(String(b.ts||''))],
 turno:[()=>KEY_SHIFTLOG,x=>x.uid,(a,b)=>(a.start||0)-(b.start||0)],
 cierre:[()=>KEY_CIERRES,x=>x.id,(a,b)=>String(a.id).localeCompare(String(b.id))],
 mov:[()=>KEY_STOCKLOG,x=>x.uid,(a,b)=>(a.ts||0)-(b.ts||0)]
};
function upsertList(type,id,val,del){
 const L=REC_LISTS[type], key=L[0](), a=loadLog(key), k=a.findIndex(x=>L[1](x)===id);
 if(del){if(k>=0)a.splice(k,1)}else if(k>=0)a[k]=val;else a.push(val);
 a.sort(L[2]);try{localStorage.setItem(key,JSON.stringify(a.slice(-5000)))}catch(e){}
}
function applyRecord(clave,valor){
 const i=clave.indexOf(':'), type=clave.slice(0,i), id=clave.slice(i+1), del=!!(valor&&valor.deleted);
 if(REC_LISTS[type])upsertList(type,id,valor,del);
 else if(type==='gasto'){
  const k=gastos.findIndex(x=>x.id===id);
  if(del){if(k>=0)gastos.splice(k,1)}else if(k>=0)gastos[k]=valor;else gastos.push(valor);
  gastos.sort((a,b)=>String(a.id).localeCompare(String(b.id)));try{localStorage.setItem(KEY_GASTOS,JSON.stringify(gastos))}catch(e){}
 }else if(type==='encargo'){
  const k=encargos.findIndex(x=>x.id===id);
  if(k>=0){encargos[k]=valor;if(loadedEnc&&loadedEnc.id===id)loadedEnc=valor}else encargos.push(valor);
  encargos.sort((a,b)=>(a.ts||0)-(b.ts||0));cloud.sig[clave]=JSON.stringify(valor);
  try{localStorage.setItem(KEY_ENC,JSON.stringify(encargos))}catch(e){}
  updateEncBtn();
 }else if(type==='ausencia'){
  const k=ausencias.findIndex(x=>x.id===id);
  if(del){if(k>=0)ausencias.splice(k,1)}else if(k>=0)ausencias[k]=valor;else ausencias.push(valor);
  ausencias.sort((a,b)=>(a.start||0)-(b.start||0));
  try{localStorage.setItem(KEY_AUS,JSON.stringify(ausencias))}catch(e){}
  updateAusBtn();if(!ausModal.hidden&&ausView==='list')renderAus();
 }else if(type==='pedido'){
  const k=pedidos.findIndex(x=>x.id===id);
  if(del){if(k>=0)pedidos.splice(k,1)}else if(k>=0)pedidos[k]=valor;else pedidos.push(valor);
  pedidos.sort((a,b)=>(a.ts||0)-(b.ts||0));
  try{localStorage.setItem(KEY_PEDIDOS,JSON.stringify(pedidos))}catch(e){}
  updatePedBtn();
 }else if(type==='cfg'&&id==='objetivo'){
  OBJ=del?{}:(valor||{});try{localStorage.setItem('harrington_objetivo_v1',JSON.stringify(OBJ))}catch(e){}renderGoal();
 }else if(type==='expulsion'){
  onExpulsion(id,valor);
 }else if(type==='fichaje'){
  shifts=shifts.filter(x=>x.empId!==id);if(!del)shifts.push(valor);
  try{localStorage.setItem(KEY_SHIFT,JSON.stringify(shifts))}catch(e){}
  renderClock();
 }
}
async function cloudPullRecords(){
 let since=cloud.since?new Date(Date.parse(cloud.since)-120000).toISOString():'', got=0;
 for(let page=0;page<40;page++){
  const flt=since?'&actualizado=gt.'+encodeURIComponent(since):'';
  const r=await sbFetch('/rest/v1/datos?select=clave,valor,actualizado&clave=like.*:*'+flt+'&order=actualizado.asc&limit=500');
  if(!r.ok)throw new Error(r.status);
  const rows=await r.json();
  rows.forEach(x=>applyRecord(x.clave,x.valor));got+=rows.length;
  if(rows.length){const last=rows[rows.length-1].actualizado;if(!cloud.since||Date.parse(last)>Date.parse(cloud.since))cloud.since=last;since=last}
  if(rows.length<500)break;
 }
 try{localStorage.setItem('harrington_cloud_since',cloud.since)}catch(e){}
 if(got&&document.getElementById('encModal')&&!encModal.hidden&&!encView)renderEnc();
 if(got&&!pedModal.hidden&&!pedView)renderPed();
 if(got&&!dirModal.hidden&&!document.activeElement.matches('input,select,textarea'))renderDir();
 return got;
}
function wipeOps(){
 try{const o={};[KEY_SALELOG,KEY_ENC,KEY_GASTOS,KEY_CIERRES,KEY_SHIFTLOG,KEY_STOCKLOG,KEY_SHIFT].forEach(k=>{const v=localStorage.getItem(k);if(v!=null)o[k]=v});localStorage.setItem('harrington_prejoin_backup',JSON.stringify(o))}catch(e){} /* copia de seguridad interna antes de olvidar */
 [KEY_SALELOG,KEY_ENC,KEY_GASTOS,KEY_CIERRES,KEY_SHIFTLOG,KEY_STOCKLOG,KEY_SHIFT].forEach(k=>store.remove(k));
 encargos=[];gastos=[];shifts=[];loadedEnc=null;store.remove(KEY_LOADED);
 cloud.sig={};cloud.since='';cloud.revSeen=0;cloud.outbox=[];saveOutbox();
 try{localStorage.removeItem('harrington_cloud_since')}catch(e){}
 pedidos=[];store.remove(KEY_PEDIDOS);updatePedBtn();
 ausencias=[];store.remove(KEY_AUS);updateAusBtn();
 updateEncBtn();renderClock();renderCustomer();
}
/* Reseteo: borra en este dispositivo los datos de operación indicados */
const RESET_TYPES={ventas:['venta:'],pedidos:['pedido:'],encargos:['encargo:'],gastos:['gasto:','sueldo-','sueldos-'],cierres:['cierre:'],fichajes:['turno:','fichaje:','ausencia:'],movimientos:['mov:'],stock:[],materiales:[]};
function wipeLocal(what){
 if(what.indexOf('ventas')>=0){store.remove(KEY_SALELOG);store.remove(KEY_COUNTER);sale=null;store.remove(KEY_SALE)}
 if(what.indexOf('encargos')>=0){encargos=[];store.remove(KEY_ENC);loadedEnc=null;store.remove(KEY_LOADED);cloud.sig={};updateEncBtn();renderCustomer()}
 if(what.indexOf('gastos')>=0){gastos=[];store.remove(KEY_GASTOS)}
 if(what.indexOf('pedidos')>=0){pedidos=[];store.remove(KEY_PEDIDOS);updatePedBtn()}
 if(what.indexOf('cierres')>=0)store.remove(KEY_CIERRES);
 if(what.indexOf('fichajes')>=0){store.remove(KEY_SHIFTLOG);store.remove(KEY_LASTSHIFT);shifts=[];lastShift=null;store.remove(KEY_SHIFT);renderClock();ausencias=[];store.remove(KEY_AUS);updateAusBtn()}
 if(what.indexOf('movimientos')>=0)store.remove(KEY_STOCKLOG);
 const pre=[];what.forEach(w=>(RESET_TYPES[w]||[]).forEach(x=>pre.push(x)));
 cloud.outbox=cloud.outbox.filter(o=>!pre.some(x=>o.clave.indexOf(x)===0));saveOutbox();
 calc(false);
 if(!dirModal.hidden)renderDir();
}
async function applyResetRow(){
 const r=await sbFetch('/rest/v1/datos?select=valor,actualizado&clave=eq.reset');if(!r.ok)throw new Error(r.status);
 const rows=await r.json();if(!rows[0])return;
 const t=Date.parse(rows[0].actualizado);if(t<=cloud.resetSeen)return;
 const what=(rows[0].valor&&rows[0].valor.what)||[];
 wipeLocal(what);
 if(what.indexOf('stock')>=0||what.indexOf('materiales')>=0){try{await refreshStock()}catch(e){}}
 cloud.resetSeen=t;try{localStorage.setItem('harrington_reset_seen',String(t))}catch(e){}
 cloud.since='';try{localStorage.removeItem('harrington_cloud_since')}catch(e){}
 say('El jefe ha reseteado datos: '+what.join(', '));
}
async function cloudPoll(force){
 try{
  const cfg=Object.keys(CLOUD_REV).concat(['rev','reset']).join(',');
  const r=await sbFetch('/rest/v1/datos?select=clave,actualizado&clave=in.('+cfg+')');
  if(!r.ok)throw new Error(r.status);
  const rows=await r.json();setCloudState(true);
  /* Un dispositivo que se une por primera vez a una nube con datos de operación olvida los suyos antiguos */
  if(!cloud.joined&&rows.some(x=>x.clave==='rev')){wipeOps();cloud.joined=true;try{localStorage.setItem('harrington_cloud_joined','1')}catch(e){}}
  const need=[];
  rows.forEach(x=>{if(!CLOUD_REV[x.clave]||cloud.dirty[x.clave])return;const t=Date.parse(x.actualizado);if(force||cloud.stamps[x.clave]!==t)need.push(x.clave)});
  Object.keys(cloud.dirty).forEach(cl=>cloudFlush(cl));
  if(need.length){
   const r2=await sbFetch('/rest/v1/datos?select=clave,valor,actualizado&clave=in.('+need.join(',')+')');
   if(!r2.ok)throw new Error(r2.status);
   (await r2.json()).forEach(x=>applyRemote(x.clave,x.valor,Date.parse(x.actualizado)));
  }
  const rs=rows.find(x=>x.clave==='reset');
  if(rs&&Date.parse(rs.actualizado)>cloud.resetSeen)await applyResetRow();
  const rv=rows.find(x=>x.clave==='rev'), rt=rv?Date.parse(rv.actualizado):0;
  if(force||!cloud.revSeen||rt!==cloud.revSeen){
   await cloudPullRecords();
   try{await refreshStock()}catch(e){}
   cloud.revSeen=rt||1;calc(false);
  }
  if(cloud.outbox.length)cloudFlushOutbox();
  cloud.last=Date.now();
  autoWeekly();renderEmpWeek();renderPayPlate();renderGoal();
 }catch(e){setCloudState(false)}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){cloudPoll();rtConnect()}});
setTimeout(()=>{try{updateFinish();renderEmpWeek();updateAusBtn();renderPayPlate();renderGoal()}catch(e){}},400);
/* Aviso instantáneo: Supabase avisa en el momento en que cambia algo y este móvil se actualiza al instante.
   Si ese canal no funciona, se sigue preguntando a la nube cada 6 segundos como siempre. */
const rt={ws:null,ref:0,hb:null,ok:false,got:0,retry:0,timer:null};
function rtConnect(){
 try{
  if(rt.ws||typeof WebSocket==='undefined'||document.visibilityState!=='visible')return;
  const ws=new WebSocket(SB_URL.replace('https://','wss://')+'/realtime/v1/websocket?apikey='+encodeURIComponent(SB_KEY)+'&vsn=1.0.0');rt.ws=ws;
  const send=(topic,event,payload)=>{try{if(ws.readyState===1)ws.send(JSON.stringify({topic:topic,event:event,payload:payload,ref:String(++rt.ref)}))}catch(e){}};
  ws.onopen=()=>{send('realtime:harrington','phx_join',{config:{broadcast:{self:false},presence:{key:''},postgres_changes:[{event:'*',schema:'public',table:'datos'},{event:'*',schema:'public',table:'stock'}]}});clearInterval(rt.hb);rt.hb=setInterval(()=>send('phoenix','heartbeat',{}),25000)};
  ws.onmessage=ev=>{
   let m;try{m=JSON.parse(ev.data)}catch(e){return}
   if(m.topic==='realtime:harrington'&&m.event==='phx_reply'){rt.ok=!!(m.payload&&m.payload.status==='ok');if(rt.ok)rt.retry=0}
   else if(m.event==='postgres_changes'){rt.got=Date.now();clearTimeout(rt.timer);rt.timer=setTimeout(()=>cloudPoll(),250)}
  };
  ws.onclose=()=>{clearInterval(rt.hb);rt.ws=null;rt.ok=false;setTimeout(rtConnect,Math.min(60000,3000*Math.pow(2,rt.retry++)))};
  ws.onerror=()=>{try{ws.close()}catch(e){}};
 }catch(e){rt.ws=null}
}
/* Sondeo de respaldo: cada 6 s; si el aviso instantáneo ya ha demostrado que funciona, cada 20 s */
var LAST_TOUCH=Date.now();['pointerdown','keydown','scroll','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{LAST_TOUCH=Date.now()},{passive:true,capture:true}));
/* sin tocar la web en 3 minutos se pregunta a la nube con menos frecuencia (el aviso instantáneo sigue funcionando) */
setInterval(()=>{if(document.visibilityState!=='visible')return;const idle=Date.now()-LAST_TOUCH>180000, every=idle?45000:(rt.ok&&rt.got)?20000:6000;if(Date.now()-(cloud.last||0)>=every-500)cloudPoll()},3000);
setTimeout(rtConnect,1500);
setTimeout(()=>cloudPoll(),300);

/* ===== Respaldo de imágenes =====
   Si una imagen no carga como "nombre.png", prueba "nombre.png.png"
   (por si el archivo se subió con la extensión duplicada). */
function imgFallback(img){
 if(img.dataset.retried||/\.png\.png$/i.test(img.getAttribute('src')||'')){img.dataset.failed='1';return}
 img.dataset.retried='1';
 img.src=img.getAttribute('src')+'.png';
}
document.querySelectorAll('img').forEach(img=>{
 img.addEventListener('error',()=>imgFallback(img));
 if(img.complete&&img.naturalWidth===0)imgFallback(img);
});

/* ===== Usuario de la sesión: se elige al entrar y no se cambia hasta cerrar la web ===== */
var ME=null;try{ME=JSON.parse(sessionStorage.getItem('harrington_me_v1')||'null')}catch(e){}
const ICO_USER='<svg class="bi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5"/></svg>';
function meEmp(){return ME&&ME.id?empleados.find(e=>e.id===ME.id)||null:null}
function isJefe(e){return !!e&&e.puesto==='Jefe'}
function hasJefes(){return empleados.some(isJefe)}
function setMe(e){ME=e?{id:e.id,at:Date.now()}:null;try{if(ME)sessionStorage.setItem('harrington_me_v1',JSON.stringify(ME));else sessionStorage.removeItem('harrington_me_v1')}catch(x){}applyMe();presencePing(true)}
function applyMe(){
 const me=meEmp(), chip=document.getElementById('meChip');
 document.body.classList.toggle('has-me',!!me);
 if(chip){chip.hidden=!me;if(me)chip.innerHTML=ICO_USER+esc(me.name)+(bossActive?' · JEFE':'')}
 bossBtn.hidden=!!me&&hasJefes();
 refreshEmpSelect();renderClock();renderPayPlate();
}
/* Expulsar: la dirección cierra la sesión de un empleado en todos sus dispositivos y le ficha la salida */
var EXPUL={};
function onExpulsion(id,v){
 EXPUL[id]=v;
 if(ME&&ME.id===id&&v&&!v.deleted&&v.ts>ME.at){
  setMe(null);if(bossActive)setBoss(false);
  document.querySelectorAll('.modal-overlay:not([hidden])').forEach(m=>closeModal(m));
  gateOpen({quick:true,msg:'⏏ La dirección ha cerrado tu sesión'+(v.by?' ('+v.by+')':'')+'. Vuelve a elegir tu ficha.'});
 }
}
async function empKick(id){
 const e=empleados.find(x=>x.id===id);if(!e)return;
 const sh=shifts.find(x=>x.empId===id);
 if(!await askConfirm('Expulsar','Se cerrará la sesión de '+e.name+' en todos sus dispositivos'+(sh?' y se le fichará la salida (lleva '+fmtDuration(sh.start,Date.now())+').':'.')+' Tendrá que volver a elegir su ficha al entrar.','Expulsar'))return;
 if(sh)endShift(sh,Date.now(),'expel');
 cloudPut('expulsion:'+id,{ts:Date.now(),by:meEmp()?meEmp().name:''});
 say(e.name+' ha sido expulsado'+(sh?' y se le ha fichado la salida':''));renderDir();
}
/* Conectados: cada dispositivo avisa a la nube cada 2 minutos de quién lo está usando */
/* una fila por pestaña abierta (se guarda en la pestaña, así sobrevive a recargar la página) */
var DEV_ID='';try{DEV_ID=sessionStorage.getItem('harrington_tab')||'';if(!DEV_ID){DEV_ID='t'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);sessionStorage.setItem('harrington_tab',DEV_ID)}}catch(e){DEV_ID='t'+Math.random().toString(36).slice(2,9)}
var PRES={map:{},at:0,was:''};
function presencePing(force){
 const me=meEmp();if(!me&&!PRES.was)return;
 if(me)PRES.was=me.id;
 sbFetch('/rest/v1/datos?on_conflict=clave',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{clave:'presencia-'+DEV_ID,valor:{emp:me?me.id:'',prev:PRES.was,ts:Date.now()},actualizado:new Date().toISOString()}])}).catch(()=>{});
 if(!me)PRES.was='';
}
setInterval(()=>{if(document.visibilityState==='visible'&&meEmp())presencePing()},120000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&meEmp())presencePing()});
async function loadPresence(force){
 if(!force&&Date.now()-PRES.at<15000)return paintPresence();
 PRES.at=Date.now();
 try{
  const r=await sbFetch('/rest/v1/datos?select=clave,valor&clave=like.presencia-*');if(!r.ok)return;
  const rows=await r.json(), m={};let gc=0;
  rows.forEach(x=>{const v=x.valor||{}, id=v.emp||v.prev;if(Date.now()-(v.ts||0)>14*86400000&&gc++<10){sbFetch('/rest/v1/datos?clave=eq.'+encodeURIComponent(x.clave),{method:'DELETE'}).catch(()=>{});return}if(!id)return;const o=m[id]||(m[id]={last:0,on:false});if(v.ts>o.last)o.last=v.ts;if(v.emp&&Date.now()-v.ts<300000)o.on=true});
  PRES.map=m;paintPresence();
 }catch(e){}
}
function presTxt(id){const o=PRES.map[id];if(!o)return ['','Sin conexión registrada'];if(o.on)return ['on','Conectado ahora'];return ['','Visto por última vez: '+(fmtDate(o.last)===fmtDate(Date.now())?'hoy':fmtDate(o.last))+' a las '+fmtTime(o.last)]}
function paintPresence(){document.querySelectorAll('[data-pres]').forEach(el=>{const t=presTxt(el.dataset.pres);el.className='pres '+t[0];el.textContent=t[1]})}
setInterval(()=>{if(!dirModal.hidden&&dirMod==='empleados')loadPresence()},30000);
function empExtra(e){
 const me=meEmp(), self=me&&me.id===e.id, jf=isJefe(e), ph=PHOTOS[e.id];
 return `<div class="it">${ph?`<img class="emp-ph" src="${ph}" alt="">`:''}<span class="pres" data-pres="${esc(e.id)}">…</span>${jf?'<span class="clv ok">🔑 Entra con la contraseña de jefe</span>':`<span class="clv" data-clave="${esc(e.id)}">🔑 …</span>`}</div>
  <div class="enc-actions two">${jf?'<span></span>':`<button type="button" data-dir="emp-reset:${esc(e.id)}">🔑 RESET CONTRASEÑA</button>`}<button type="button" data-dir="emp-foto:${esc(e.id)}">📷 ${ph?'CAMBIAR FOTO':'FOTO'}</button></div>${ph?`<div class="enc-actions"><button type="button" class="warn" data-dir="emp-nofoto:${esc(e.id)}">QUITAR FOTO</button></div>`:''}`+(self?'':`<div class="enc-actions"><button type="button" class="warn" data-dir="emp-kick:${esc(e.id)}">⏏ EXPULSAR</button></div>`);
}

/* ===== Entrada: fachada, puerta, «¿Quién entra hoy?» y saludo ===== */
const gate=document.getElementById('gate'), gUi=document.getElementById('gUi');
var G={low:false,open:false,pending:null,pendMode:'',timers:[],img:false,fx:null,fails:{},lock:{},big:null,pw:null};
var PHOTOS={};try{PHOTOS=JSON.parse(localStorage.getItem('harrington_fotos_v1')||'{}')||{}}catch(e){PHOTOS={}}
var CLAVES={};try{CLAVES=JSON.parse(localStorage.getItem('harrington_claves_v1')||'{}')||{}}catch(e){CLAVES={}}
function gT(fn,ms){G.timers.push(setTimeout(fn,ms))}
function gClear(){G.timers.forEach(clearTimeout);G.timers=[]}
function gPh(p){gate.dataset.ph=p}
const gReduced=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
/* Ahorro: con poca batería (sin cargar) o con «ahorro de datos» se quitan la lluvia, las polillas y las gotas */
try{if(navigator.connection&&navigator.connection.saveData)G.low=true;if(navigator.getBattery)navigator.getBattery().then(b=>{const f=()=>{G.low=(b.level<.2&&!b.charging)||!!(navigator.connection&&navigator.connection.saveData)};f();b.addEventListener('levelchange',f);b.addEventListener('chargingchange',f)}).catch(()=>{})}catch(e){}
/* Medidas de cada fachada (en % de la imagen): puerta, letrero, farolas, humo, polillas y suelo para la lluvia */
const G_LAYOUT={
 v:{ar:'2/3',door:[38.57,47.33,22.95,26.04],ll:49.36,lx:[38.57,49.9],sign:[29.3,32.25,42,5.1],sf:'2.15cqh',origin:[50,60.35],spill:[30,73.37,40],ground:.74,
  lamps:[[50,39.6,''],[3.2,44.9,''],[96.8,44.9,''],[3,34.8,'sm'],[97,34.8,'sm'],[34.4,45,'sm'],[65.4,45,'sm'],[21.5,52,'win'],[78.5,52,'win']],
  smoke:[[50,37.4,''],[50,37.4,'d2'],[3.2,42.6,''],[96.8,42.6,'d2']],moths:[[.5,.396],[.032,.449],[.968,.449]]},
 w:{ar:'3/2',door:[43.29,43.55,13.09,31.84],ll:50.25,lx:[43.29,49.87],sign:[38.74,26.07,22.6,6.84],sf:'2.5cqh',origin:[49.87,59.5],spill:[40.5,75.4,19],ground:.77,
  lamps:[[50,35.8,''],[41.2,41,'sm'],[58.8,41,'sm'],[21.4,34.1,''],[77.8,34.1,''],[21.4,44.2,'sm'],[78.7,48.8,'sm'],[5.5,45.6,'sm'],[96.2,45.6,'sm'],[34.3,50.8,'win'],[66.4,50.8,'win']],
  smoke:[[50,33.4,''],[50,33.4,'d2'],[21.4,31.6,''],[77.8,31.6,'d2']],moths:[[.5,.358],[.214,.341],[.778,.341]]}
};
function gWide(){return innerWidth>innerHeight*1.15}
function gApplyLayout(k){
 const L=G_LAYOUT[k];G.layout=L;G.lk=k;gate.classList.toggle('lw',k==='w');
 const s=gate.style, set=(n,v)=>s.setProperty(n,v);
 set('--ar',L.ar);set('--dl',L.door[0]+'%');set('--dt',L.door[1]+'%');set('--dw',L.door[2]+'%');set('--dh',L.door[3]+'%');
 set('--ll',L.ll+'%');set('--lx1',L.lx[0]);set('--lx2',L.lx[1]);set('--ly',L.door[1]);
 set('--sl',L.sign[0]+'%');set('--st',L.sign[1]+'%');set('--sw',L.sign[2]+'%');set('--sh',L.sign[3]+'%');set('--sf',L.sf);
 set('--ox',L.origin[0]+'%');set('--oy',L.origin[1]+'%');set('--pl',L.spill[0]+'%');set('--pt',L.spill[1]+'%');set('--pw',L.spill[2]+'%');
 const box=document.getElementById('gLamps');
 if(box)box.innerHTML=L.lamps.map(([x,y,c])=>`<i class="g-lamp ${c}" style="left:${x}%;top:${y}%"></i>`).join('')+L.smoke.map(([x,y,c])=>`<i class="g-smoke ${c}" style="left:${x}%;top:${y}%"></i>`).join('');
}
/* Prueba las imágenes en orden (.jpg comprimida primero, luego .png) y se queda con la primera que cargue */
function gTry(list,ok,ko){const next=i=>{if(i>=list.length)return ko&&ko();const im=new Image();im.onload=()=>ok(list[i]);im.onerror=()=>next(i+1);im.src=list[i]};next(0)}
function gateLoadImg(){
 const wide=gWide(), names=n=>[n+'.webp',n+'.jpg',n+'.png'];
 G.wantWide=wide;
 if(!G.lk||G.lk!==(wide?'w':'v'))gApplyLayout(wide?'w':'v');
 const useV=()=>gTry(names('entrada-fachada'),u=>{gApplyLayout('v');gate.style.setProperty('--gimg','url("'+u+'")');gate.classList.add('img-ok');gate.classList.remove('no-img');G.img=true},()=>{gApplyLayout('v');gate.classList.add('no-img')});
 if(wide)gTry(names('entrada-fachada-ancha'),u=>{gApplyLayout('w');gate.style.setProperty('--gimg','url("'+u+'")');gate.classList.add('img-ok');gate.classList.remove('no-img');G.img=true},useV);
 else useV();
 gTry(['tarjeta-empleado.webp'],()=>gate.classList.add('card-img'),()=>{});
 const intV=()=>gTry(names('entrada-interior'),u=>{gate.style.setProperty('--iimg','url("'+u+'")');gate.classList.add('int-ok')});
 if(wide)gTry(names('entrada-interior-ancha'),u=>{gate.style.setProperty('--iimg','url("'+u+'")');gate.classList.add('int-ok')},intV);
 else intV();
}
window.addEventListener('resize',()=>{clearTimeout(G.rsz);G.rsz=setTimeout(()=>{if(G.open&&gWide()!==G.wantWide)gateLoadImg()},300)});
function gateCheck(){if(window.__HG_NOGATE||SANDBOX||G.open||meEmp())return;if(empleados.length)gateOpen()}
function gateOpen(opt){
 G.msgOk=!!(opt&&opt.msg&&/^Sesión cerrada/.test(opt.msg));
 opt=opt||{};G.open=true;gClear();G.pending=null;G.msg=opt.msg||'';G.big=null;
 document.body.classList.add('gate-open');gate.hidden=false;
 const st=document.getElementById('gSignTxt');st.innerHTML=[...'HARRINGTON GUNSMITH'].map((ch,i)=>`<i style="animation-delay:${(0.9+i*0.07+(i%3)*0.05).toFixed(2)}s">${ch===' '?'&nbsp;':ch}</i>`).join('');
 const full=!opt.quick&&!gReduced();
 G.full=full;gFx(true);loadPhotos();
 if(full){gPh('scene');gUi.innerHTML='<button type="button" class="g-enter" id="gEnter">ENTRAR</button><div class="g-hint">Harrington Gunsmith · Saint Denis</div>';gBoltLoop(3500)}
 else gateCards();
}
/* ---- sonidos de la entrada ---- */
function gBell(){
 if(!soundOn)return;const c=ac();if(!c)return;const t0=c.currentTime+.02;
 [0,.13,.29].forEach((d,k)=>{[[1,1],[2.76,.45],[5.4,.22],[8.93,.1]].forEach(([r,v])=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=1760*r*(1+k*.004);g.gain.setValueAtTime(.0001,t0+d);g.gain.exponentialRampToValueAtTime(.12*v*(1-k*.25),t0+d+.004);g.gain.exponentialRampToValueAtTime(.0001,t0+d+1.6/r+.25);o.connect(g);g.connect(c.destination);o.start(t0+d);o.stop(t0+d+2)})});
}
function gCreak(){
 if(!soundOn)return;const c=ac();if(!c)return;const t0=c.currentTime+.05, d=1.3;
 const o=c.createOscillator(), f=c.createBiquadFilter(), g=c.createGain(), l=c.createOscillator(), lg=c.createGain();
 o.type='sawtooth';o.frequency.setValueAtTime(95,t0);o.frequency.linearRampToValueAtTime(150,t0+d*.45);o.frequency.linearRampToValueAtTime(110,t0+d);
 l.type='square';l.frequency.value=23;lg.gain.value=14;l.connect(lg);lg.connect(o.frequency);
 f.type='bandpass';f.frequency.value=780;f.Q.value=5;
 g.gain.setValueAtTime(.0001,t0);g.gain.exponentialRampToValueAtTime(.05,t0+.08);g.gain.setValueAtTime(.05,t0+d*.7);g.gain.exponentialRampToValueAtTime(.0001,t0+d);
 o.connect(f);f.connect(g);g.connect(c.destination);o.start(t0);l.start(t0);o.stop(t0+d+.05);l.stop(t0+d+.05);
}
function gThunder(){
 if(!soundOn||!(navigator.userActivation&&navigator.userActivation.hasBeenActive))return;const c=ac();if(!c||c.state!=='running')return;
 const len=c.sampleRate*3, buf=c.createBuffer(1,len,c.sampleRate), x=buf.getChannelData(0);let v=0;
 for(let i=0;i<len;i++){v=(v+(Math.random()*2-1)*.06)*.985;x[i]=v}
 const s=c.createBufferSource(), f=c.createBiquadFilter(), g=c.createGain(), t0=c.currentTime+.02;
 s.buffer=buf;f.type='lowpass';f.frequency.value=220;
 g.gain.setValueAtTime(.0001,t0);g.gain.exponentialRampToValueAtTime(.9,t0+.18);g.gain.exponentialRampToValueAtTime(.25,t0+.9);g.gain.exponentialRampToValueAtTime(.0001,t0+2.9);
 s.connect(f);f.connect(g);g.connect(c.destination);s.start(t0);s.stop(t0+3);
}
/* ---- relámpagos lejanos mientras se espera en la puerta ---- */
function gBolt(){gate.classList.remove('bolt');void gate.offsetWidth;gate.classList.add('bolt');setTimeout(()=>gate.classList.remove('bolt'),950);setTimeout(()=>{try{gThunder()}catch(e){}},700+Math.random()*900)}
function gBoltLoop(first){gT(()=>{if(gate.dataset.ph==='scene'&&!gReduced())gBolt();if(gate.dataset.ph==='scene')gBoltLoop()},first||(7000+Math.random()*8000))}
function gateEnter(){
 if(gate.dataset.ph!=='scene')return;
 gClear();
 try{gBell()}catch(e){}
 setTimeout(()=>{try{gCreak()}catch(e){}},260);
 gUi.innerHTML='';gPh('open');
 gT(()=>gPh('zoom'),1300);
 gT(()=>gPh('flash'),3150);
 gT(()=>gateCards(),3900);
}
/* ---- tarjetas ---- */
const G_PRUEBA={id:'prueba',name:'Arthur Ayudante',puesto:'Modo prueba'};
const G_STAR='<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z"/></svg>', G_CHEV='<svg viewBox="0 0 24 24"><path d="M3 15l9-7 9 7-2.4 2.6L12 12.4l-6.6 5.2z"/></svg>';
const G_RANK={'Jefe':'','Gerente':G_STAR+G_STAR,'Armero experto':G_CHEV+G_CHEV+G_CHEV,'Armero':G_CHEV+G_CHEV,'Aprendiz de armero':G_CHEV};
const G_KEY='<svg viewBox="0 0 24 24"><path d="M12 3a4 4 0 0 0-1.5 7.7L9 21h6l-1.5-10.3A4 4 0 0 0 12 3z"/></svg>';
const G_CN='<svg viewBox="0 0 24 24"><path d="M2 22V9Q2 2 9 2h13"/><path d="M5.5 22V11q0-5.5 5.5-5.5H22"/><path d="M9 14q1.5-5 7-5"/><circle cx="9" cy="9" r="1.4"/></svg>';
function cardInner(e,abs){
 const ini=(e.name||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase(), ph=PHOTOS[e.id]||(e.id==='prueba'?'arthur-ayudante.webp':null);
 return `${isJefe(e)?`<span class="gc-wax" title="Pide la contraseña de jefe">${G_KEY}</span>`:''}<i class="gc-cn tl">${G_CN}</i><i class="gc-cn tr">${G_CN}</i><i class="gc-cn bl">${G_CN}</i><i class="gc-cn br">${G_CN}</i><span class="gc-oval${ph?' has-photo':''}">${ph?`<img class="gc-photo" src="${ph}" alt="">`:''}<span class="gc-mono">${esc(ini)}</span></span><span class="gc-name" style="--nl:${Math.max(8,(e.name||'').length)}">${esc(e.name)}</span><span class="gc-role" style="--rl:${Math.max(8,(e.puesto||'Empleado').length)}">${esc(e.puesto||'Empleado')}</span><span class="gc-rank">${G_RANK[e.puesto]||''}</span><span class="gc-studio">Saint Denis, 1880</span>${abs?'<span class="gc-stamp">AUSENTE</span>':''}${e.id==='prueba'?'<span class="gc-stamp prueba">PRUEBA</span>':''}`;
}
function gateCards(){
 gClear();G.big=null;{const ob=document.getElementById('gBig');if(ob)ob.remove()}
 gPh('cards');
 const rank=e=>{const i=PUESTOS.indexOf(e.puesto);return i<0?99:i};
 const L=empleados.slice().sort((a,b)=>rank(a)-rank(b)||a.name.localeCompare(b.name,'es'));
 const abs=new Set(ausNowList().map(a=>a.empId));
 const ROT=[-2.2,1.6,-1.2,2.4,-1.8,1.1,2,-2.6];
 L.push(G_PRUEBA);
 gUi.innerHTML=`<div class="g-panel">${G.msg?`<div class="g-msg${G.msgOk?' ok':''}">${esc(G.msg)}</div>`:''}<h2 class="g-title">¿Quién entra hoy?</h2><p class="g-sub">Toca tu tarjeta. Quedará a tu nombre hasta que cierres la web.</p>
  <div class="g-cards" id="gCards">${L.map((e,i)=>`<button type="button" class="g-card${isJefe(e)?' jefe':''}" data-gcard="${esc(e.id)}" style="--r:${ROT[i%ROT.length]}deg;--dx:${(i%2?1:-1)*24}px;animation-delay:${(0.25+i*0.13).toFixed(2)}s" aria-label="${esc(e.name)}${e.puesto?', '+esc(e.puesto):''}">${cardInner(e,abs.has(e.id))}</button>`).join('')}</div></div>`;
 gUi.scrollTop=0;
}
/* inclinación 3D y brillo dorado al mover el dedo o el ratón por la tarjeta */
gate.addEventListener('pointermove',ev=>{
 const c=ev.target.closest&&ev.target.closest('.g-card:not(.gb-front)');if(!c||gReduced())return;
 const r=c.getBoundingClientRect(), px=(ev.clientX-r.left)/r.width, py=(ev.clientY-r.top)/r.height;
 c.style.setProperty('--ty',((px-.5)*18).toFixed(1)+'deg');c.style.setProperty('--tx',((.5-py)*14).toFixed(1)+'deg');
 c.style.setProperty('--gx',(px*100).toFixed(0)+'%');c.style.setProperty('--gy',(py*100).toFixed(0)+'%');c.classList.add('tilt');
});
gate.addEventListener('pointerout',ev=>{const c=ev.target.closest&&ev.target.closest('.g-card');if(c&&!c.contains(ev.relatedTarget)){['--tx','--ty'].forEach(k=>c.style.removeProperty(k));c.classList.remove('tilt')}});
/* ---- contraseñas personales: se guardan cifradas en la nube, una fila por empleado ---- */
async function fetchClave(id){
 try{
  const ctl=typeof AbortController!=='undefined'?new AbortController():null, to=setTimeout(()=>{try{ctl&&ctl.abort()}catch(e){}},7000);
  const r=await sbFetch('/rest/v1/datos?select=valor&clave=eq.'+encodeURIComponent('clave-'+id),ctl?{signal:ctl.signal}:{});clearTimeout(to);
  if(!r.ok)throw new Error(r.status);
  const rows=await r.json(), hsh=rows[0]&&rows[0].valor&&rows[0].valor.h||null;
  if(hsh)CLAVES[id]=hsh;else delete CLAVES[id];
  try{localStorage.setItem('harrington_claves_v1',JSON.stringify(CLAVES))}catch(e){}
  return {hash:hsh};
 }catch(e){return {err:true,hash:CLAVES[id]||null}}
}
function empHash(id,pw){return hashStr('emp|'+id+'|'+pw)}
var CLAVE_SET=null;
async function loadClaves(){
 try{const r=await sbFetch('/rest/v1/datos?select=clave&clave=like.clave-*');if(!r.ok)return;const rows=await r.json();CLAVE_SET=new Set(rows.map(x=>x.clave.slice(6)));paintClaves()}catch(e){}
}
function paintClaves(){document.querySelectorAll('[data-clave]').forEach(el=>{const ok=CLAVE_SET&&CLAVE_SET.has(el.dataset.clave);el.className='clv'+(ok?' ok':'');el.textContent=CLAVE_SET?(ok?'🔑 Contraseña creada':'🔑 Sin contraseña: la creará la próxima vez que entre'):'🔑 …'})}
async function empResetClave(id){
 const e=empleados.find(x=>x.id===id);if(!e)return;
 if(!await askConfirm('Reset contraseña','Se borrará la contraseña de '+e.name+'. La próxima vez que entre tendrá que crear una nueva.','Resetear'))return;
 try{const r=await sbFetch('/rest/v1/datos?clave=eq.'+encodeURIComponent('clave-'+id),{method:'DELETE'});if(!r.ok)throw new Error(r.status)}
 catch(err){return say('Sin conexión: no se ha reseteado. Inténtalo de nuevo')}
 delete CLAVES[id];try{localStorage.setItem('harrington_claves_v1',JSON.stringify(CLAVES))}catch(x){}
 if(CLAVE_SET)CLAVE_SET.delete(id);paintClaves();say('Contraseña de '+e.name+' reseteada: la creará al entrar');
}
/* ---- fotos de los personajes ---- */
async function loadPhotos(){
 try{
  const r=await sbFetch('/rest/v1/datos?select=clave,valor&clave=like.foto-*');if(!r.ok)return;
  const rows=await r.json(), m={};rows.forEach(x=>{if(x.valor&&x.valor.img)m[x.clave.slice(5)]=x.valor.img});
  const ch=JSON.stringify(m)!==JSON.stringify(PHOTOS);PHOTOS=m;
  try{localStorage.setItem('harrington_fotos_v1',JSON.stringify(m))}catch(e){}
  if(ch){paintPhotos();if(!dirModal.hidden&&dirMod==='empleados'&&!document.activeElement.matches('input,select,textarea'))renderDir()}
 }catch(e){}
}
function paintPhotos(){
 document.querySelectorAll('#gate [data-gcard], #gate .gb-front').forEach(c=>{
  const id=c.dataset.gcard||c.dataset.emp, ov=c.querySelector('.gc-oval');if(!ov)return;const ph=PHOTOS[id]||(id==='prueba'?'arthur-ayudante.webp':null), im=ov.querySelector('.gc-photo');
  if(ph){if(im)im.src=ph;else ov.insertAdjacentHTML('afterbegin',`<img class="gc-photo" src="${ph}" alt="">`);ov.classList.add('has-photo')}else{if(im)im.remove();ov.classList.remove('has-photo')}
 });
}
function empPickFoto(id){
 const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
 inp.onchange=()=>{const f=inp.files&&inp.files[0];if(f)empSaveFoto(id,f)};inp.click();
}
async function empSaveFoto(id,file){
 const e=empleados.find(x=>x.id===id);if(!e)return;
 let url='';
 try{
  const src=URL.createObjectURL(file), im=await new Promise((ok,ko)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=ko;i.src=src});
  const W=240,H=300,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  const s=Math.max(W/im.width,H/im.height), w=im.width*s, hh=im.height*s;g.drawImage(im,(W-w)/2,(H-hh)/2.6,w,hh);
  url=c.toDataURL('image/jpeg',.82);URL.revokeObjectURL(src);
 }catch(err){return say('No se ha podido leer esa imagen')}
 try{
  const r=await sbFetch('/rest/v1/datos?on_conflict=clave',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([{clave:'foto-'+id,valor:{img:url,ts:Date.now()},actualizado:new Date().toISOString()}])});
  if(!r.ok)throw new Error(r.status);
 }catch(err){return say('Sin conexión: la foto no se ha guardado')}
 PHOTOS[id]=url;try{localStorage.setItem('harrington_fotos_v1',JSON.stringify(PHOTOS))}catch(x){}
 renderDir();if(!miModal.hidden)renderMi();say('Foto de '+e.name+' guardada');
}
async function empNoFoto(id){
 const e=empleados.find(x=>x.id===id);if(!e)return;
 if(!await askConfirm('Quitar foto','La tarjeta de '+e.name+' volverá a mostrar sus iniciales.','Quitar'))return;
 try{const r=await sbFetch('/rest/v1/datos?clave=eq.'+encodeURIComponent('foto-'+id),{method:'DELETE'});if(!r.ok)throw new Error(r.status)}catch(err){return say('Sin conexión: no se ha quitado')}
 delete PHOTOS[id];try{localStorage.setItem('harrington_fotos_v1',JSON.stringify(PHOTOS))}catch(x){}
 renderDir();if(!miModal.hidden)renderMi();say('Foto quitada');
}
/* ---- la tarjeta elegida se acerca, pide la contraseña y se da la vuelta ---- */
function gBigOpen(e,src){
 const old=document.getElementById('gBig');if(old)old.remove();
 const wrap=document.createElement('div');wrap.className='g-bigwrap';wrap.id='gBig';
 wrap.innerHTML=`<div class="g-big"><div class="gb-inner"><div class="gb-face g-card gb-front${isJefe(e)?' jefe':''}" data-emp="${esc(e.id)}">${cardInner(e,false)}</div><div class="gb-face gb-back" id="gBack"></div></div></div><div class="g-pw" id="gPw" hidden></div>`;
 gate.appendChild(wrap);G.big=wrap;
 const big=wrap.querySelector('.g-big');
 if(src&&!gReduced()){
  const a=src.getBoundingClientRect(), b=big.getBoundingClientRect();
  if(b.width){big.style.transition='none';big.style.transform=`translate(${a.left+a.width/2-(b.left+b.width/2)}px,${a.top+a.height/2-(b.top+b.height/2)}px) scale(${a.width/b.width})`;void big.offsetWidth;big.style.transition='';big.style.transform=''}
 }
 requestAnimationFrame(()=>wrap.classList.add('on'));
 const cards=document.getElementById('gCards');if(cards)cards.classList.add('chosen');if(src)src.classList.add('picked');
}
function gBigClose(){
 const w=G.big;G.big=null;G.pw=null;G.pending=null;
 const cards=document.getElementById('gCards');if(cards){cards.classList.remove('chosen');cards.querySelectorAll('.picked').forEach(x=>x.classList.remove('picked'))}
 if(w){w.classList.remove('on');setTimeout(()=>w.remove(),350)}
}
function gPwShow(e,mode,extra){
 const p=document.getElementById('gPw');if(!p)return;
 G.pw={e:e,mode:mode,hash:extra||null};p.hidden=false;
 const nm=esc(e.name.split(' ')[0]);
 if(mode==='wait'){p.innerHTML=`<label>Comprobando la tarjeta de ${nm}…</label><div class="gp-btns"><button type="button" class="gp-no" data-gpw="no">Cancelar</button><span></span></div>`;return}
 if(mode==='offline'){p.innerHTML=`<label>Sin conexión con la nube</label><div class="gp-err">No se puede comprobar tu contraseña ahora. Inténtalo en un momento.</div><div class="gp-btns"><button type="button" class="gp-no" data-gpw="no">Volver</button><button type="button" class="gp-ok" data-gpw="retry">REINTENTAR</button></div>`;return}
 const create=mode==='create';
 p.innerHTML=`<label for="gPw1">${create?`Primera vez, ${nm}: crea tu contraseña`:mode==='boss'?'Contraseña de jefe':`Tu contraseña, ${nm}`}</label>
  <input id="gPw1" type="password" autocomplete="off" maxlength="40" placeholder="${create?'Nueva contraseña':'Contraseña'}">
  ${create?'<input id="gPw2" type="password" autocomplete="off" maxlength="40" placeholder="Repítela"><div class="gp-note">Mínimo 4 caracteres. Solo tú la sabrás; si la olvidas, la dirección puede resetearla.</div>':''}
  <div class="gp-err" id="gPwErr"></div>
  <div class="gp-btns"><button type="button" class="gp-no" data-gpw="no" id="gPwCancel">Cancelar</button><button type="button" class="gp-ok" data-gpw="ok" id="gPwOk">ENTRAR</button></div>
  ${mode==='boss'&&bossCreds()&&bossCreds().word?'<button type="button" class="gp-forgot" data-gpw="forgot">¿Has olvidado la contraseña?</button>':''}`;
 pwEyes(p);
 setTimeout(()=>{const i=document.getElementById('gPw1');if(i)try{i.focus({preventScroll:true})}catch(x){}},320);
}
function pwEyes(root){(root||document).querySelectorAll('input[type=password]:not([data-eye])').forEach(i=>{i.dataset.eye='1';const w=document.createElement('span');w.className='pw-box';i.parentNode.insertBefore(w,i);w.appendChild(i);const b=document.createElement('button');b.type='button';b.className='pw-eye';b.setAttribute('aria-label','Ver la contraseña');b.textContent='👁';b.onclick=ev=>{ev.preventDefault();ev.stopPropagation();const on=i.type==='password';i.type=on?'text':'password';b.textContent=on?'🙈':'👁';b.setAttribute('aria-label',on?'Ocultar la contraseña':'Ver la contraseña');i.focus()};w.appendChild(b)})}
function gPwErr(t){const el=document.getElementById('gPwErr');if(el)el.textContent=t}
async function gPwSubmit(){
 const s=G.pw;if(!s||s.busy)return;const e=s.e, v1=(document.getElementById('gPw1')||{}).value||'', v2=(document.getElementById('gPw2')||{}).value||'';
 if(G.lock[e.id]>Date.now())return gPwErr('Demasiados intentos: espera un minuto');
 s.busy=true;
 try{
  if(s.mode==='create'){
   if(v1.length<4)return gPwErr('Mínimo 4 caracteres');
   if(v1!==v2)return gPwErr('Las dos contraseñas no coinciden');
   const hh=await empHash(e.id,v1);
   let ok=false;try{ok=await claimRow('clave-'+e.id,{h:hh,ts:Date.now()})}catch(x){return gPwErr('Sin conexión: no se ha podido guardar. Inténtalo de nuevo')}
   if(!ok){const r=await fetchClave(e.id);gPwShow(e,'login',r.hash);return gPwErr('Esta tarjeta ya tiene contraseña: escríbela')}
   CLAVES[e.id]=hh;try{localStorage.setItem('harrington_claves_v1',JSON.stringify(CLAVES))}catch(x){}
   return gateHello(e);
  }
  if(!v1)return gPwErr('Escribe la contraseña');
  const good=s.mode==='boss'?await checkPw(v1):(await empHash(e.id,v1))===s.hash;
  if(good){G.fails[e.id]=0;if(s.mode==='boss')setBoss(true);return gateHello(e)}
  G.fails[e.id]=(G.fails[e.id]||0)+1;
  const i=document.getElementById('gPw1');if(i){i.value='';i.focus()}
  if(G.fails[e.id]>=5){G.fails[e.id]=0;G.lock[e.id]=Date.now()+60000;gPwErr('Demasiados intentos: la tarjeta queda bloqueada un minuto');setTimeout(gBigClose,1600)}
  else gPwErr('Contraseña incorrecta');
  try{buzz([40,40,40])}catch(x){}
 }finally{s.busy=false}
}
async function gatePick(id){
 if(G.big)return;
 const e=id==='prueba'?G_PRUEBA:empleados.find(x=>x.id===id);if(!e)return;
 if(G.lock[id]>Date.now())return say('Demasiados intentos: espera un minuto para volver a probar con '+e.name);
 try{playClick()}catch(x){}
 gBigOpen(e,gUi.querySelector('[data-gcard="'+id+'"]'));
 if(isJefe(e)){
  if(!bossCreds()){G.pending=e;G.pendMode='setup';setTimeout(()=>openBoss(),300);return}
  return gPwShow(e,'boss');
 }
 gPwShow(e,'wait');
 const r=await fetchClave(id);
 if(!G.big||!G.pw||G.pw.e.id!==id)return;
 if(r.err&&!r.hash)return gPwShow(e,'offline');
 gPwShow(e,r.hash?'login':'create',r.hash);
}
function gateHello(e){
 if(e.id==='prueba'&&!SANDBOX){try{sessionStorage.setItem('harrington_sandbox','1');sessionStorage.setItem('harrington_me_v1',JSON.stringify({id:'prueba',at:Date.now()}));sessionStorage.setItem('harrington_boss_active_v1','1')}catch(x){}gPh('close');setTimeout(()=>location.reload(),300);return}
 gClear();
 setMe(e);if(!isJefe(e)&&bossActive)setBoss(false);
 gPh('hello');
 if(!G.big)gBigOpen(e,null);
 const w=G.big, p=document.getElementById('gPw');if(p){p.hidden=true;p.innerHTML=''}G.pw=null;
 w.classList.add('hello');
 const L=gateLines(e).slice(0,5);
 document.getElementById('gBack').innerHTML=`<div class="g-hseal">H</div><div class="g-hi">${esc(saludo())},</div><div class="g-name">${esc(e.name)}</div><div class="g-role">${esc((e.puesto||'').toUpperCase())}${isJefe(e)?' · MODO JEFE':''}</div>
  <ul class="g-lines">${L.map((t,i)=>`<li style="animation-delay:${(1.1+i*0.15).toFixed(2)}s">${t}</li>`).join('')}</ul><div class="g-go">Toca para entrar a la tienda</div>`;
 gT(()=>w.querySelector('.g-big').classList.add('flipped'),180);
 gT(()=>{try{playThump()}catch(x){}},950);
 gT(gateClose,7000);
}
function gateLines(e){
 const L=[], c=contractH(e.name);
 if(c){const ws=payMonday(0), r=weekRequired(e.name,ws), w=workedMs(e,ws);
  if(r.h===0)L.push('Esta semana estás <b>exento</b> de horas por tu ausencia.');
  else L.push(`Esta semana llevas <b>${esc(hm(w))}</b> de ${r.h} h`+(w>=r.h*3600000?' ✓':` · te faltan ${esc(hm(r.h*3600000-w))}`)+'.')}
 const s=payState();
 if(s){const mine=sueDue(s.ws).some(x=>x.id===e.id)?sueCalc(e,s.ws):null;
  if(s.st==='due')L.push('Hoy es <b>día de pago</b>'+(mine?`: tu sueldo es de <b>${money(mine.pay)}</b> · ${mine.paid?'ya pagado ✓':'pendiente'}`:'')+'.');
  else L.push('Sueldos pagados ✓'+(mine?` · el tuyo: <b>${money(mine.pay)}</b>`:'')+'.')}
 const sh=shifts.find(x=>x.empId===e.id);
 L.push(sh?`Sigues fichado desde las <b>${esc(fmtTime(sh.start))}</b>.`:'No olvides <b>fichar la entrada</b> al empezar.');
 const ne=pendingEncs().length;if(ne)L.push(`Hay <b>${ne}</b> ${ne===1?'encargo pendiente':'encargos pendientes'}.`);
 if(isJefe(e)){const np=pendingPed().length;if(np)L.push(`<b>${np}</b> ${np===1?'pedido a proveedores por recibir':'pedidos a proveedores por recibir'}.`)}
 ausNowList().filter(a=>a.empId!==e.id).slice(0,2).forEach(a=>L.push(`${esc(a.name)} está ausente ${esc(ausUntil(a))}.`));
 return L;
}
function gateClose(){
 if(!G.open||gate.dataset.ph==='close')return;
 gClear();
 gPh('close');
 setTimeout(()=>{glassDrops();gate.hidden=true;G.open=false;G.big=null;gFx(false);document.body.classList.remove('gate-open');gUi.innerHTML='';{const ob=document.getElementById('gBig');if(ob)ob.remove()}gPh('');applyMe();updateAusBtn()},720);
}
gate.addEventListener('click',ev=>{
 const ph=gate.dataset.ph;
 if(ev.target.closest('#gEnter'))return gateEnter();
 const pw=ev.target.closest('[data-gpw]');
 if(pw){const a=pw.dataset.gpw;
  if(a==='ok')return gPwSubmit();
  if(a==='no')return gBigClose();
  if(a==='retry'&&G.pw){const id=G.pw.e.id;gBigClose();return setTimeout(()=>gatePick(id),380)}
  if(a==='forgot'&&G.pw){G.pending=G.pw.e;G.pendMode='forgot';return openBoss('resetword')}
  return;
 }
 if(ev.target.closest('#gPw'))return;
 const c=ev.target.closest('[data-gcard]');if(c)return gatePick(c.dataset.gcard);
 if(ph==='open'||ph==='zoom'||ph==='flash')return gateCards();
 if(ph==='hello')return gateClose();
 if(ph==='cards'&&G.big&&G.pw&&ev.target.closest('.g-bigwrap')&&!ev.target.closest('.g-big'))return gBigClose();
});
gate.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&ev.target.closest&&ev.target.closest('#gPw')&&ev.target.tagName==='INPUT'){ev.preventDefault();gPwSubmit()}});
function glassDrops(){
 if(gReduced()||G.low)return;
 const g=document.createElement('div');g.className='glass';g.setAttribute('aria-hidden','true');
 let s='';for(let i=0;i<30;i++){const sz=4+Math.random()*10, t=2.5+Math.random()*5;s+=`<i style="left:${(Math.random()*100).toFixed(1)}%;top:${(Math.random()*70).toFixed(1)}%;width:${sz.toFixed(1)}px;height:${(sz*1.25).toFixed(1)}px;--dy:${(40+Math.random()*160).toFixed(0)}px;animation-duration:${t.toFixed(1)}s;animation-delay:${(Math.random()*1.2).toFixed(1)}s"></i>`}
 g.innerHTML=s;document.body.appendChild(g);setTimeout(()=>g.remove(),7200);
}
/* ---- efectos: lluvia con salpicaduras, polvo en la luz y polillas en las farolas ---- */
function gFx(on){
 const cv=document.getElementById('gDust');if(!cv)return;
 if(!on||gReduced()){if(G.fx){cancelAnimationFrame(G.fx.raf);G.fx=null}const x=cv.getContext('2d');x&&x.clearRect(0,0,cv.width,cv.height);return}
 if(G.fx)return;
 const x=cv.getContext('2d');if(!x)return;
 const R=[], S=[], D=[], M=[], stage=document.getElementById('gStage');
 for(let i=0;i<46;i++)D.push({x:Math.random(),y:.25+Math.random()*.65,r:.6+Math.random()*1.8,vx:(Math.random()-.5)*.00012,vy:-.00004-Math.random()*.00012,a:.15+Math.random()*.45,p:Math.random()*6.28});
 for(let i=0;i<110;i++)R.push({x:Math.random(),y:Math.random(),l:10+Math.random()*18,v:.012+Math.random()*.01,a:.12+Math.random()*.22,t:.74+Math.random()*.26});
 const LAMPS=(G.layout||G_LAYOUT.v).moths;
 LAMPS.forEach(([lx,ly],k)=>{for(let i=0;i<2+(k===0?1:0);i++)M.push({lx:lx,ly:ly,a:Math.random()*6.28,s:.03+Math.random()*.04,rr:.014+Math.random()*.02,j:Math.random()*6.28})});
 const F=G.fx={raf:0};
 const step=()=>{
  const w=cv.clientWidth, hh=cv.clientHeight;if(cv.width!==w||cv.height!==hh){cv.width=w;cv.height=hh}
  x.clearRect(0,0,w,hh);
  if(document.hidden){F.raf=requestAnimationFrame(step);return}
  const ph=gate.dataset.ph, out=(ph==='scene'||ph==='open'||ph==='zoom')&&!G.low, sr=stage.getBoundingClientRect();
  if(out){
   x.lineCap='round';
   const gl=(G.layout||G_LAYOUT.v).ground;R.forEach(d=>{d.y+=d.v;const gy=gl+(d.t-.74)/.26*(1-gl);
    if(d.y>=gy){S.push({x:d.x*w,y:gy*hh,r:0,a:.45});d.y=-Math.random()*.2;d.x=Math.random()*1.1}
    const px=d.x*w, py=d.y*hh;x.strokeStyle='rgba(205,220,240,'+d.a.toFixed(2)+')';x.lineWidth=1;x.beginPath();x.moveTo(px,py);x.lineTo(px-d.l*.18,py+d.l);x.stroke()});
   for(let i=S.length-1;i>=0;i--){const s=S[i];s.r+=.55;s.a-=.018;if(s.a<=0){S.splice(i,1);continue}x.strokeStyle='rgba(225,210,180,'+s.a.toFixed(2)+')';x.beginPath();x.ellipse(s.x,s.y,s.r,s.r*.28,0,0,6.283);x.stroke()}
   if(ph==='scene'&&sr.width)M.forEach(m=>{m.a+=m.s;m.j+=.3;const cx=sr.left+m.lx*sr.width, cy=sr.top+m.ly*sr.height, rad=m.rr*sr.height;
    const mx=cx+Math.cos(m.a)*rad+Math.sin(m.j)*2, my=cy+Math.sin(m.a*1.3)*rad*.7+Math.cos(m.j*1.7)*2, wg=Math.abs(Math.sin(m.j*3))*2.2+.6;
    x.fillStyle='rgba(255,236,190,.75)';x.beginPath();x.ellipse(mx-wg*.6,my,wg,1.2,.5,0,6.283);x.ellipse(mx+wg*.6,my,wg,1.2,-.5,0,6.283);x.fill()});
  }
  D.forEach(p=>{p.x+=p.vx*16;p.y+=p.vy*16;p.p+=.02;if(p.y<.15){p.y=.92;p.x=Math.random()}if(p.x<0)p.x=1;if(p.x>1)p.x=0;
   const al=p.a*(.6+.4*Math.sin(p.p));x.beginPath();x.fillStyle='rgba(255,214,150,'+al.toFixed(3)+')';x.arc(p.x*w,p.y*hh,p.r,0,6.283);x.fill()});
  F.raf=requestAnimationFrame(step);
 };
 step();
}
gateLoadImg();
try{pwEyes(document.getElementById('bossModal'))}catch(e){}

/* En el ordenador, si existe la cabecera alargada (cabecera-web-ancha), se usa esa */
(function(){const img=document.querySelector('.hero-banner img');if(!img)return;let done=false;
 const tryW=()=>{if(done||innerWidth<1100)return;done=true;gTry(['cabecera-web-ancha.webp','cabecera-web-ancha.webp'],u=>{img.src=u;img.classList.add('ancha')},()=>{})};
 tryW();window.addEventListener('resize',tryW)})();
/* ===== Modo prueba: barra, visor de Discord y entrada automática como Arthur Ayudante ===== */
function sbxPaint(){const b=document.getElementById('sbxDc');if(b)b.textContent='DISCORD ('+SBX.dc.length+')'}
function sbxShow(){
 const body=document.getElementById('sbxBody');
 body.innerHTML=SBX.dc.length?SBX.dc.slice().reverse().map(m=>`<div class="sbx-msg"><small>CANAL: ${esc(String(m.ch).toUpperCase())} · ${esc(fmtTime(m.ts))}${m.edit?' · ACTUALIZACIÓN':''}${m.file?' · CON ARCHIVO':''}</small>${esc(m.text||'(sin texto)')}</div>`).join(''):'<div class="enc-empty">Todavía no se ha intentado enviar nada a Discord.</div>';
 openModal(document.getElementById('sbxModal'));
}
if(SANDBOX){
 document.body.classList.add('sandbox');document.getElementById('sbxBar').hidden=false;
 document.getElementById('sbxDc').onclick=sbxShow;
 document.getElementById('sbxClose').onclick=()=>closeModal(document.getElementById('sbxModal'));
 document.getElementById('sbxOut').onclick=async()=>{if(await askConfirm('Salir del modo prueba','Se borrará todo lo que hayas hecho en la prueba y volverás a la entrada de la web de verdad.','Salir'))SBX.exit()};
 try{ME={id:'prueba',at:Date.now()};if(!bossActive)setBoss(true)}catch(e){}
 setTimeout(()=>{try{applyMe();say('Modo prueba: puedes tocarlo todo, nada se guarda de verdad')}catch(e){}},500);
}
/* ===== Imágenes nuevas (si no cargan, se queda lo de antes) ===== */
probeImg('tablilla-agotado.webp',()=>document.body.classList.add('has-agotado'));
probeImg('tarjeta-reverso.webp',()=>{try{gate.classList.add('back-img')}catch(e){}});
var IMG_OK={};['moneda-oro.webp','reloj-bolsillo.webp','cartel-se-busca.webp','sello-entregado.webp','sello-recibido.webp'].forEach(s=>probeImg(s,()=>{IMG_OK[s]=1;if(s==='cartel-se-busca.webp')renderEmpWeek();if(s==='reloj-bolsillo.webp')paintPocket()}));
/* monedas que caen hacia el total al cobrar */
function coinsFx(){
 if(!IMG_OK['moneda-oro.webp']||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches))return;
 const vis=el=>{if(!el)return null;const r=el.getBoundingClientRect();return r.width&&r.bottom>0&&r.top<innerHeight?r:null};
 const ob=document.getElementById('obTotal'), gr=document.getElementById('grand'), rr=document.getElementById('receiptModal')&&!receiptModal.hidden?vis(document.querySelector('#receiptModal .receipt-paper')):null;
 const g=vis(gr)?gr:vis(ob)?ob:gr;if(!g)return;let r=vis(g)||{left:innerWidth/2-40,top:innerHeight-60,width:80,height:30};if(rr)r={left:rr.left+rr.width/2-40,top:rr.top+60,width:80,height:30};const tx=r.left+r.width/2, ty=r.top+r.height/2;
 for(let i=0;i<18;i++){const c=document.createElement('i');c.className='coin';const sx=tx+(Math.random()-.5)*Math.min(innerWidth,600), sy=-40-Math.random()*120;
  c.style.left=(sx-17)+'px';c.style.top=sy+'px';c.style.setProperty('--dx',(tx-sx)+'px');c.style.setProperty('--dy',(ty-sy-17)+'px');c.style.setProperty('--t',(0.8+Math.random()*.6).toFixed(2)+'s');c.style.setProperty('--ry',(360+Math.round(Math.random()*4)*180)+'deg');c.style.animationDelay=(i*0.05).toFixed(2)+'s';
  document.body.appendChild(c);setTimeout(()=>c.remove(),2200)}
 setTimeout(()=>{g.classList.remove('bump');void g.offsetWidth;g.classList.add('bump');try{playCoins()}catch(e){}},900);
}
function playCoins(){if(!soundOn)return;const c=ac();if(!c)return;const t0=c.currentTime+.02;for(let i=0;i<7;i++){const t=t0+i*.07+Math.random()*.03;[[2800,.06],[4100,.03]].forEach(([f,v])=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=f*(1+Math.random()*.08);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(v,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+.25);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+.3)})}}
/* reloj de bolsillo: aparece mientras tú estás fichado, con la hora de España */
function paintPocket(){
 const el=document.getElementById('pocket');if(!el)return;
 const me=typeof meEmp==='function'?meEmp():null, on=IMG_OK['reloj-bolsillo.webp']&&(me?shifts.some(x=>x.empId===me.id):shifts.length>0);
 el.hidden=!on;if(!on)return;
 const m=madridParts(Date.now()), s=new Date().getSeconds(), mm=+m.minute, hh=(+m.hour)%12;
 el.querySelector('.h').style.rotate=(hh*30+mm/2)+'deg';el.querySelector('.m').style.rotate=(mm*6+s/10)+'deg';el.querySelector('.s').style.rotate=(s*6)+'deg';
 const sh=me&&shifts.find(x=>x.empId===me.id);el.title=sh?'Fichado desde las '+fmtTime(sh.start):'';
}
setInterval(paintPocket,1000);
/* sello grande de imagen (ENTREGADO, RECIBIDO) con su golpe */
function stampImgFx(name,ar){
 const src='sello-'+name+'.webp';if(!IMG_OK[src])return false;
 const el=document.createElement('div');el.className='stamp-fx img';el.style.setProperty('--st','url('+src+')');el.style.setProperty('--ar',ar);el.innerHTML='<span></span>';
 document.body.appendChild(el);setTimeout(()=>el.remove(),1500);try{playThump()}catch(e){}return true;
}
/* ===== Objetivo de ventas de la semana (viernes a jueves) ===== */
var OBJ=loadObj('harrington_objetivo_v1',{});
function goalWeekCash(){const ws=weekStart(0);return loadLog(KEY_SALELOG).reduce((a,r)=>{if(r.voided)return a;const d=saleDay(r);return d>=ws&&d<=ws+6?a+collected(r):a},0)}
function renderGoal(){
 const el=document.getElementById('goalBar');if(!el)return;
 if(!(OBJ.cents>0)){el.hidden=true;return}
 const v=goalWeekCash(), p=Math.min(100,v/OBJ.cents*100), done=v>=OBJ.cents, ws=weekStart(0);
 el.className='goal-bar'+(done?' done':'');
 el.innerHTML=`<div class="gl-t"><small>OBJETIVO DE LA SEMANA · ${esc(dayStr(ws).slice(0,5))} – ${esc(dayStr(ws+6).slice(0,5))}</small><div class="gl-track"><div class="gl-fill" style="width:${p.toFixed(1)}%"></div></div></div><b>${money(v)} / ${money(OBJ.cents)}${done?' ✓':''}</b>`;
 el.hidden=false;
 if(done){let f='';try{f=localStorage.getItem('harrington_goal_done')||''}catch(e){}if(f!==String(ws)){try{localStorage.setItem('harrington_goal_done',String(ws))}catch(e){}if(v>0&&f!=='')recordFx('¡OBJETIVO CONSEGUIDO!','Esta semana: '+money(v)+' de '+money(OBJ.cents));else if(f==='')try{localStorage.setItem('harrington_goal_done',String(ws))}catch(e){}}}
}
document.getElementById('goalBar').onclick=()=>{if(bossActive){dirMod='objetivo';dirForm=null;renderDir();openModal(dirModal);dirModal.scrollTop=0}};
setInterval(renderGoal,60000);
function renderModObjetivo(){
 const v=goalWeekCash();
 return `<div class="dir-form enc-sec"><div class="dir-sec-title" style="margin-top:0">OBJETIVO DE VENTAS DE LA SEMANA</div>
  <label>META SEMANAL ($)<div class="money"><i>$</i><input id="objAmt" inputmode="decimal" placeholder="Ej.: 1500" autocomplete="off" value="${OBJ.cents>0?esc(String(OBJ.cents/100)):''}"></div></label>
  <div class="enc-note">Semana de cuentas (viernes a jueves). Esta semana llevamos <b>${money(v)}</b> cobrados. En la pantalla principal saldrá una barra que se va llenando; al llegar a la meta, todos verán la celebración.</div>
  <div class="enc-actions two" style="margin-top:8px"><button type="button" class="warn" data-dir="obj-off">QUITAR OBJETIVO</button><button type="button" class="primary" data-dir="obj-save">GUARDAR</button></div></div>`;
}
function saveObjetivo(off){
 const c=off?0:parseMoney((document.getElementById('objAmt')||{}).value||'');
 if(!off&&!(c>0))return say('Escribe la meta en dólares');
 OBJ={cents:c,ts:Date.now()};store.set('harrington_objetivo_v1',JSON.stringify(OBJ));cloudPut('cfg:objetivo',OBJ);
 try{localStorage.removeItem('harrington_goal_done')}catch(e){}renderGoal();try{localStorage.setItem('harrington_goal_done',goalWeekCash()>=c&&c>0?String(weekStart(0)):'0')}catch(e){}
 say(off?'Objetivo quitado':'Objetivo guardado: '+money(c));renderDir();
}
/* ===== Productos que se acaban: al ritmo de las dos últimas semanas ===== */
function stockForecast(){
 const t=todayNum(), sold={};
 loadLog(KEY_SALELOG).forEach(r=>{if(r.voided||r.op==='encargo'||!r.items)return;const d=saleDay(r);if(d<t-13||d>t)return;r.items.forEach(x=>{sold[x.name]=(sold[x.name]||0)+(+x.qty||0)})});
 const out=[];Object.keys(sold).forEach(n=>{const q=stockMap[n];if(!(q>0))return;const rate=sold[n]/14, days=q/rate;if(rate>0&&days<=5)out.push({n:n,q:q,days:days})});
 return out.sort((a,b)=>a.days-b.days);
}
/* ===== Buscador de Dirección ===== */
var dsQ='';
function dirSearchHTML(){return `<div class="dir-search"><input id="dsQ" type="search" placeholder="Buscar cliente, nº de serie, ticket, pedido, encargo o empleado…" value="${esc(dsQ)}" autocomplete="off"></div><div class="ds-res" id="dsRes">${dsQ.trim().length>=2?dirSearchResults(dsQ):''}</div>`}
function dirSearchResults(q){
 const n=norm(q.trim()), R=[], has=v=>norm(String(v||'')).indexOf(n)>=0;
 clientes.forEach(c=>{const ser=(c.series||[]).filter(r=>has(r.s)||has(r.a));if(has(c.name)||has(c.telegram)||has(c.ident)||ser.length)R.push(['CLIENTE',c.name,(c.telegram?'Telegrama '+c.telegram:'')+(ser.length?' · Nº de serie: '+ser.map(r=>r.s+(r.a?' ('+r.a+')':'')).join(', '):''),'cl:'+c.id])});
 empleados.forEach(e=>{if(has(e.name)||has(e.puesto))R.push(['EMPLEADO',e.name,(e.puesto||'')+(e.sueldo?' · '+money(e.sueldo)+' a la semana':''),'emp:'+e.id])});
 loadLog(KEY_SALELOG).slice().reverse().forEach(r=>{if(R.length>60)return;if(has(r.id)||has(r.client))R.push(['VENTA',r.id,`${r.date} ${r.time} · ${r.client||'—'} · ${money(collected(r))}${r.voided?' · ANULADA':''}`,'mod:ventas'])});
 encargos.forEach(e=>{if(has(e.id)||has(e.client))R.push(['ENCARGO',e.id,`${e.client||'—'} · ${e.finished?(e.cancelled?'cancelado':'entregado'):'pendiente'}`,'mod:semanales'])});
 pedidos.forEach(p=>{if(has(p.code)||has(p.id)||has(p.proveedor))R.push(['PEDIDO',p.code||p.id,`${p.proveedor||''} · ${p.received?'recibido':'por recibir'} · ${p.paid?'pagado':'sin pagar'}`,'mod:regpedidos'])});
 proveedores.forEach(p=>{if(has(p.name)||has(p.tipo))R.push(['PROVEEDOR',p.name,p.tipo||'','mod:proveedores'])});
 if(!R.length)return '<div class="enc-empty">No hay nada que coincida.</div>';
 return `<div class="dir-sec-title" style="margin-top:0">RESULTADOS (${R.length>60?'60+':R.length})</div>`+R.slice(0,60).map(r=>`<div class="enc-card dir-item"><div class="t">${esc(r[1])}<small>${r[0]}</small></div><div class="it">${esc(r[2])}</div><div class="enc-actions"><button type="button" data-dir="ds-open:${esc(r[3])}">ABRIR</button></div></div>`).join('');
}
function dsOpen(a){
 const i=a.indexOf(':'), k=a.slice(0,i), v=a.slice(i+1);dsQ='';
 if(k==='cl'){dirMod='clientes';clView=v;clEdit=null}
 else if(k==='emp'){dirMod='empficha';fichaEmp=v}
 else dirMod=v;
 dirForm=null;renderDir();dirModal.scrollTop=0;
}
/* ===== Ficha completa de un empleado ===== */
var fichaEmp=null;
function renderModEmpFicha(){
 const e=empleados.find(x=>x.id===fichaEmp);if(!e)return '<div class="enc-empty">Ese empleado ya no existe.</div>';
 const t=todayNum(), sales=loadLog(KEY_SALELOG).filter(r=>!r.voided&&r.employee===e.name), d30=sales.filter(r=>saleDay(r)>t-30);
 const cash30=d30.reduce((a,r)=>a+collected(r),0), cashAll=sales.reduce((a,r)=>a+collected(r),0);
 const wNow=payMonday(0), hNow=workedMs(e,wNow), hPrev=workedMs(e,wNow-7), req=weekRequired(e.name,wNow).h;
 const sue=gastos.filter(g=>g.sueldo&&g.sueldo.emp===e.id).slice().reverse(), aus=ausencias.filter(a=>a.empId===e.id).slice().reverse(), asc=(e.ascensos||[]).slice().reverse();
 const last=sales.slice(-8).reverse();
 const box=(k,v)=>`<div><small>${k}</small><b>${v}</b></div>`;
 return `<div class="enc-card dir-item"><div class="t">${esc(e.name)}</div><div class="it">${esc((e.puesto||'—').toUpperCase())}${e.sueldo?' · '+money(e.sueldo)+' a la semana':''} · ${e.horas||10} h semanales${e.inicio?' · desde el '+esc(fmtISO(e.inicio)):''}</div></div>
  <div class="ficha-grid">${box('VENTAS (30 DÍAS)',d30.length)}${box('COBRADO (30 DÍAS)',money(cash30))}${box('COBRADO EN TOTAL',money(cashAll))}${box('HORAS ESTA SEMANA',esc(hm(hNow))+(req?' / '+req+' h':''))}${box('HORAS SEMANA PASADA',esc(hm(hPrev)))}${box('SUELDOS COBRADOS',money(sue.reduce((a,g)=>a+g.cents,0)))}</div>
  <div class="dir-sec-title">ÚLTIMAS VENTAS</div>${last.length?last.map(r=>`<div class="dir-log"><b>${esc(r.id)}</b> · ${esc(r.date)} ${esc(r.time)} · ${esc(r.client||'—')} · <b>${money(collected(r))}</b></div>`).join(''):'<div class="enc-empty">Sin ventas.</div>'}
  <div class="dir-sec-title">SUELDOS</div>${sue.length?sue.slice(0,12).map(g=>`<div class="dir-log">${esc(g.date)} · <b>${money(g.cents)}</b>${g.sueldo.desc?' · descuento '+money(g.sueldo.desc):''}${g.sueldo.worked!=null?' · '+esc(hm(g.sueldo.worked))+' de '+g.sueldo.req+' h':''}</div>`).join(''):'<div class="enc-empty">Todavía no ha cobrado ningún sueldo.</div>'}
  <div class="dir-sec-title">AUSENCIAS</div>${aus.length?aus.slice(0,12).map(a=>`<div class="dir-log">${esc(ausWhen(a.start))} · ${esc(ausLen(a))} · <b>${esc(a.cat||'')}</b>${a.cancelled?' · anulada':a.returned?' · volvió':''}<br>${esc(a.motivo||'')}</div>`).join(''):'<div class="enc-empty">Sin ausencias.</div>'}
  <div class="dir-sec-title">ASCENSOS</div>${asc.length?asc.map(x=>`<div class="dir-log">${esc(dayStr(x.desde))} · ${esc(x.de)} → <b>${esc(x.a)}</b> · ${money(x.antes)} → ${money(x.nuevo)}</div>`).join(''):'<div class="enc-empty">Sin ascensos.</div>'}`;
}
/* ===== Revisión de datos: comprueba que todo cuadra ===== */
function renderModRevision(){
 const I=[], t=todayNum(), add=(lvl,txt,fix)=>I.push([lvl,txt,fix]);
 Object.keys(stockMap).forEach(k=>{if(stockMap[k]<0)add('bad',`Stock negativo: <b>${esc(k.replace(/^mat:/,''))}</b> (${stockMap[k]}).`,'Corrígelo en STOCK.')});
 shifts.forEach(s=>{if(Date.now()-s.start>12*3600000)add('bad',`<b>${esc(s.name)}</b> lleva fichado desde el ${esc(fmtDate(s.start))} a las ${esc(fmtTime(s.start))}.`,'Ciérralo en REGISTROS HORARIOS con la hora real.')});
 const noEmp=loadLog(KEY_SALELOG).filter(r=>!r.voided&&!r.employee&&saleDay(r)>t-30);if(noEmp.length)add('pend',`${noEmp.length} ${noEmp.length===1?'venta':'ventas'} de los últimos 30 días sin empleado (${noEmp.slice(0,4).map(r=>esc(r.id)).join(', ')}${noEmp.length>4?'…':''}).`,'No cuentan para el empleado de la semana ni para su ficha.');
 const seen={};gastos.forEach(g=>{const k=g.cat+'|'+norm(g.concepto)+'|'+g.cents+'|'+g.day;(seen[k]=seen[k]||[]).push(g)});Object.values(seen).filter(L=>L.length>1).forEach(L=>add('pend',`Gasto repetido ${L.length} veces el ${esc(L[0].date)}: «${esc(L[0].concepto)}» (${money(L[0].cents)}).`,'Si es un error, borra el sobrante en GASTOS.'));
 empleados.filter(e=>!empHasContract(e)).forEach(e=>add('pend',`<b>${esc(e.name)}</b> no tiene los datos del contrato completos.`,'Complétalo en EMPLEADOS (sin contrato no cobra sueldo).'));
 pendingEncs().filter(e=>e.ts&&Date.now()-e.ts>14*86400000).forEach(e=>add('pend',`El encargo ${esc(e.id)} de <b>${esc(e.client||'—')}</b> lleva más de 14 días pendiente.`,'Entrégalo o cancélalo.'));
 pendingPed().filter(p=>!p.received&&Date.now()-p.ts>7*86400000).forEach(p=>add('pend',`El pedido ${esc(p.code)} a <b>${esc(p.proveedor)}</b> lleva más de una semana sin recibirse.`,'Márcalo como recibido o cancélalo.'));
 const cn={};clientes.forEach(c=>{const k=norm(c.name);(cn[k]=cn[k]||[]).push(c)});Object.values(cn).filter(L=>L.length>1).forEach(L=>add('pend',`Cliente repetido: <b>${esc(L[0].name)}</b> (${L.length} fichas).`,'Junta los datos en una ficha y borra las demás en CLIENTES.'));
 stockForecast().forEach(f=>add('pend',`<b>${esc(f.n)}</b> se acaba en unos ${Math.max(1,Math.round(f.days))} ${Math.round(f.days)===1?'día':'días'} al ritmo de ventas (quedan ${f.q}).`,'Haz un pedido o fabrica más.'));
 if(cloud.outbox&&cloud.outbox.length)add('pend',`Hay ${cloud.outbox.length} ${cloud.outbox.length===1?'cambio':'cambios'} de este dispositivo sin subir a la nube.`,'Comprueba la conexión; se suben solos al volver.');
 return `<p class="bk-note">Revisa los datos de la armería y te dice qué no cuadra y cómo arreglarlo. No cambia nada por sí sola.</p>`+
  (I.length?`<div class="dir-sec-title" style="margin-top:0">${I.length} ${I.length===1?'COSA QUE REVISAR':'COSAS QUE REVISAR'}</div><div class="avisos">`+I.map(x=>`<div class="aviso ${x[0]}">${x[1]}<br><small>${esc(x[2])}</small></div>`).join('')+'</div>':'<div class="rev-ok">✓ Todo cuadra: no hay nada que revisar.</div>');
}
/* En el ordenador, las franjas de categoría usan su versión alargada (nombre-ancha.webp) */
function catImg(src){return innerWidth>=1100&&/\.webp$/.test(src)?src.replace(/\.webp$/,'-ancha.webp'):src}
(function(){const im=document.getElementById('categoryImage');if(!im)return;let base=im.getAttribute('src');
 im.addEventListener('error',()=>{const s=im.getAttribute('src');if(/-ancha\.webp$/.test(s))im.src=s.replace('-ancha.webp','.webp')});
 im.src=catImg(base);let wasW=innerWidth>=1100;window.addEventListener('resize',()=>{const w=innerWidth>=1100;if(w!==wasW){wasW=w;const s=im.getAttribute('src').replace('-ancha.webp','.webp');im.src=catImg(s)}})})();
/* ===== Mi ficha: cada empleado puede poner o quitar su propia foto (tocando su nombre arriba) ===== */
const miModal=document.getElementById('miModal');
function renderMi(){
 const e=meEmp();if(!e)return closeModal(miModal);
 const ph=PHOTOS[e.id], ini=(e.name||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
 document.getElementById('miBody').innerHTML=`<div class="mi-photo">${ph?`<img src="${ph}" alt="">`:`<b>${esc(ini)}</b>`}</div><div class="mi-name">${esc(e.name)}</div><div class="mi-role">${esc(e.puesto||'Empleado')}</div>
  <div class="enc-actions"><button type="button" class="primary" id="miFoto">📷 ${ph?'CAMBIAR MI FOTO':'SUBIR MI FOTO'}</button>${ph?'<button type="button" class="warn" id="miNoFoto">QUITAR MI FOTO</button>':''}</div>
  <p class="bk-note" style="margin:4px 0 0">Sale en tu tarjeta de la entrada en tono sepia, como un retrato antiguo. Por ejemplo, una captura de tu personaje.</p>`;
 document.getElementById('miFoto').onclick=()=>empPickFoto(e.id);
 const nf=document.getElementById('miNoFoto');if(nf)nf.onclick=()=>empNoFoto(e.id);
}
function openMi(){if(!meEmp()||meEmp().id==='prueba'&&!SANDBOX)return;loadPhotos().then(()=>{if(!miModal.hidden)renderMi()});renderMi();openModal(miModal)}
document.getElementById('meChip').addEventListener('click',openMi);
document.getElementById('meChip').addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();openMi()}});
document.getElementById('miClose').onclick=()=>closeModal(miModal);
miModal.addEventListener('click',ev=>{if(ev.target===miModal)closeModal(miModal)});
/* ===== Tienda abierta o cerrada según haya alguien fichado ===== */
function shopState(){
 const open=shifts.length>0, names=shifts.map(s=>s.name.split(' ')[0]);
 const g=document.getElementById('gate'), sg=document.getElementById('gsSign'), who=document.getElementById('gsWho');
 if(g)g.classList.toggle('closed',!open);
 const src=open?'cartel-abierto.webp':'cartel-cerrado.webp';
 if(sg&&sg.getAttribute('src')!==src)sg.src=src;
 if(who)who.textContent=open?'Atiende: '+(names.length>2?names.slice(0,2).join(', ')+' y '+(names.length-2)+' más':names.join(' y ')):'';
 const ss=document.getElementById('shopSign');if(ss){if(ss.getAttribute('src')!==src)ss.src=src;ss.alt=open?'Tienda abierta':'Tienda cerrada';ss.title=open?'Abierta · atiende '+names.join(', '):'Cerrada: no hay nadie fichado';ss.hidden=false}
}
/* ===== Limpieza de la nube: borra marcas antiguas que ya no sirven para nada ===== */
async function cloudJanitor(force){
 if(!bossActive)return;
 const day=String(todayNum());try{if(!force&&localStorage.getItem('harrington_janitor')===day)return;localStorage.setItem('harrington_janitor',day)}catch(e){}
 const RULES=[['presencia-',14],['semanal-',35],['recibido-',60],['sueldo-',70],['sueldos-',70]], now=Date.now();let n=0;
 for(const [pre,days] of RULES){
  try{
   const r=await sbFetch('/rest/v1/datos?select=clave,actualizado&clave=like.'+encodeURIComponent(pre+'*'));if(!r.ok)continue;
   const rows=await r.json();
   for(const x of rows){if(n>=40)return n;if(pre==='sueldo-'&&x.clave.indexOf('sueldos-')===0)continue;if(now-Date.parse(x.actualizado)>days*86400000){await sbFetch('/rest/v1/datos?clave=eq.'+encodeURIComponent(x.clave),{method:'DELETE'}).catch(()=>{});n++}}
  }catch(e){}
 }
 return n;
}
setTimeout(()=>{try{cloudJanitor()}catch(e){}},20000);
/* ===== App: guarda la web en el móvil para que abra al instante y sin conexión ===== */
if('serviceWorker' in navigator&&location.protocol==='https:'){window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(()=>{})})}
/* ===== Inicio ===== */
restoreOrder();
restoreSale();
try{applyMe();gateCheck();if(meEmp())presencePing(true)}catch(e){}
calc(false);
filter();
