/* Caché acotada al sitio. Datos autenticados y servicios externos siempre por red. */
const PREFIX='harrington-static:'+new URL(self.registration.scope).pathname+':';
const CACHE=PREFIX+'20261018-reset-jefes1';
const LEGACY=new Set(['harrington-acceso-discord-20261015-2']);
self.addEventListener('install',e=>{e.waitUntil(self.skipWaiting())});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{
 const scope=new URL(self.registration.scope);
 for(const k of await caches.keys()){
  if(k!==CACHE&&k.startsWith(PREFIX))await caches.delete(k);
  else if(LEGACY.has(k)){const c=await caches.open(k);for(const r of await c.keys()){const u=new URL(r.url);if(u.origin===scope.origin&&u.pathname.startsWith(scope.pathname))await c.delete(r);}if(!(await c.keys()).length)await caches.delete(k);}
 }
 await self.clients.claim();
})())});
async function fromNet(req,key){
 const res=await fetch(req);
 if(res&&(res.ok||res.type==='opaque')&&!/no-store|private/i.test(res.headers.get('cache-control')||'')){
  try{const c=await caches.open(CACHE);await c.put(key||req,res.clone());}catch{}
 }
 return res;
}
async function prune(url){
 try{const c=await caches.open(CACHE),keys=(await c.keys()).filter(k=>{const u=new URL(k.url);return u.origin===url.origin&&u.pathname===url.pathname});await Promise.all(keys.slice(0,Math.max(0,keys.length-2)).map(k=>c.delete(k)));}catch{}
}
self.addEventListener('fetch',e=>{
 const req=e.request,url=new URL(req.url),scope=new URL(self.registration.scope);
 if(req.method!=='GET'||req.headers.has('authorization'))return;
 const fonts=/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
 if(!fonts&&(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname)))return;
 const nav=req.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('.html');
 if(!nav&&!fonts&&!/\.(js|css|webmanifest|png|jpe?g|webp|svg|ico|woff2?|ttf|mp3|wav|ogg)$/i.test(url.pathname))return;
 const cached=async key=>(await caches.open(CACHE)).match(key);
 if(nav){
  const key=new Request(url.origin+url.pathname),net=fromNet(new Request(req,{cache:'no-store'}),key);
  e.waitUntil(net.catch(()=>{}));
  e.respondWith((async()=>{const r=await cached(key);if(!r)return net.catch(()=>Response.error());let timer;
   try{return await Promise.race([net.catch(()=>r),new Promise(resolve=>{timer=setTimeout(()=>resolve(r),1500)})]);}finally{if(timer)clearTimeout(timer)}
  })());return;
 }
 if(url.searchParams.has('v')||fonts){
  const task=cached(req).then(r=>r||fromNet(req).then(async res=>{if(!fonts)await prune(url);return res}));e.respondWith(task);e.waitUntil(task.then(()=>{},()=>{}));return;
 }
 // Imágenes y sonidos inmutables: no descargarlos otra vez en cada visita.
 if(/\.(png|jpe?g|webp|svg|ico|woff2?|ttf|mp3|wav|ogg)$/i.test(url.pathname)){e.respondWith(cached(req).then(r=>r||fromNet(req).catch(()=>Response.error())));return;}
 const net=fromNet(req);e.waitUntil(net.catch(()=>{}));e.respondWith(net.catch(()=>cached(req).then(r=>r||Response.error())));
});
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch{d={body:e.data?e.data.text():''}}e.waitUntil(self.registration.showNotification(d.title||'Harrington Gunsmith',{body:d.body||'',icon:'icono-app-192.png',badge:'icono-app-192.png',tag:d.tag||'harrington',renotify:true,data:{url:d.url||'./'}}))});
self.addEventListener('notificationclick',e=>{
 e.notification.close();let destino;try{destino=new URL(e.notification.data?.url||'./',self.registration.scope)}catch{destino=new URL(self.registration.scope)}
 const scope=new URL(self.registration.scope),url=destino.origin===scope.origin&&destino.pathname.startsWith(scope.pathname)?destino.href:scope.href;
 e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{const own=list.filter(x=>x.url.startsWith(scope.href)&&'focus' in x),exact=own.find(x=>x.url===url);if(exact)return exact.focus();const c=own.find(x=>'navigate' in x);return c?c.navigate(url).then(v=>(v||c).focus()).catch(()=>self.clients.openWindow(url)):self.clients.openWindow(url)}));
});
