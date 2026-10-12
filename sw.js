/* HARRINGTON GUNSMITH · sw.js
   Guarda la web en el móvil para que se abra al instante y aunque no haya conexión.
   Va en la misma carpeta que index.html. No hace falta tocarlo nunca. */
const CACHE = 'harrington-v2';

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function fromNet(req) {
  return fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
    return res;
  });
}

/* al llegar una versión nueva de app.js o estilos.css, se borran las versiones viejas guardadas */
function prune(url) {
  caches.open(CACHE).then(c => c.keys().then(keys => keys.forEach(k => {
    const u = new URL(k.url);
    if (u.origin === url.origin && u.pathname === url.pathname && u.search !== url.search) c.delete(k);
  }))).catch(() => {});
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  /* la nube (Supabase) y Discord siempre van por internet, nunca se guardan */
  if (url.origin !== self.location.origin && !fonts) return;

  /* la página: primero internet (para tener siempre la última versión); si internet tarda más de 1,5 s o no hay, la guardada (y se pone al día sola después) */
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
    e.respondWith(new Promise(resolve => {
      let done = false;
      const t = setTimeout(() => { caches.match(req, { ignoreSearch: true }).then(r => { if (r && !done) { done = true; resolve(r); } }); }, 1500);
      fromNet(req).then(r => { if (!done) { done = true; clearTimeout(t); resolve(r); } })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(r => { if (!done) { done = true; clearTimeout(t); resolve(r || Response.error()); } }));
    }));
    return;
  }

  /* app.js y estilos.css llevan versión (?v=…): si ya está guardada esa versión, se usa al instante */
  if (url.search.indexOf('v=') >= 0 || fonts) {
    e.respondWith(caches.match(req).then(r => r || fromNet(req).then(res => { if (!fonts) prune(url); return res; })));
    return;
  }

  /* imágenes y lo demás: se muestra la guardada al momento y se actualiza por detrás */
  e.respondWith(caches.match(req).then(r => {
    const net = fromNet(req).catch(() => r);
    return r || net;
  }));
});

/* V2 · Avisos en el móvil aunque la aplicación esté cerrada */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Harrington Gunsmith', {
    body: d.body || '', icon: 'icono-app-192.png', badge: 'icono-app-192.png',
    tag: d.tag || 'harrington', renotify: true, data: { url: d.url || './' }
  }));
});
/* al tocar el aviso se abre la aplicación (o se trae al frente si ya estaba abierta) */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
