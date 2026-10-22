/* Enlaces privados: se construyen únicamente tras autorización del servidor. */
(function(){
 'use strict';
 const nav=document.createElement('nav');nav.className='hg-admin-web';nav.hidden=true;nav.setAttribute('aria-label','Administración web privada');
 const mode=document.body.dataset.adminWeb||'armeria';nav.dataset.theme=mode==='gobierno'?'gobierno':mode==='armeria'?'armeria':'pedidos';
 const anchor=mode==='gobierno'?document.querySelector('.rep-membrete'):mode==='armeria'?document.querySelector('.hero-banner'):document.querySelector('main');
 if(anchor)anchor.insertAdjacentElement((mode==='pedidos'||mode==='detalle')?'beforebegin':'afterend',nav);else document.body.prepend(nav);
 let adapter=null,identity='',pending=0,last=0,authorized=false;
 function clear(){pending++;identity='';last=0;authorized=false;document.body.classList.remove('hg-admin-web-present');nav.hidden=true;nav.replaceChildren();adapter?.onDenied?.();}
 function render(data){if(data?.rol!=='administrador_web'||!Array.isArray(data.enlaces))throw Error('SIN_PERMISO');const label=document.createElement('span');label.className='hg-admin-web-label';label.textContent='Administración web';const group=document.createElement('div');group.className='hg-admin-web-links';
 for(const link of data.enlaces){const u=new URL(link.url);if(u.origin!==location.origin||!u.pathname.startsWith('/harrington-gunsmith/')||u.search||u.hash)throw Error('ENLACE_INVALIDO');const a=document.createElement('a');a.href=u.href;a.textContent=link.nombre;if(link.id===(mode==='detalle'?'pedidos':mode))a.setAttribute('aria-current','page');group.append(a)}nav.replaceChildren(label,group);nav.hidden=false;authorized=true;document.body.classList.add('hg-admin-web-present');}
 async function refresh(force=false){if(!adapter)return;const id=adapter.identity();if(!id){clear();return}if(id===identity&&!force&&Date.now()-last<60000)return;const changed=id!==identity;identity=id;if(changed){nav.hidden=true;nav.replaceChildren();authorized=false;document.body.classList.remove('hg-admin-web-present');adapter.onDenied?.()}const n=++pending;last=Date.now();try{const d=await adapter.load();if(n!==pending||adapter.identity()!==id)return;render(d);adapter.onAuthorized?.(d)}catch{if(n===pending){nav.hidden=true;nav.replaceChildren();authorized=false;document.body.classList.remove('hg-admin-web-present');adapter.onDenied?.()}}}
 window.HGAdminWeb={setAdapter(a){clear();adapter=a;refresh()},refresh,clear,get visible(){return authorized}};
 window.addEventListener('focus',()=>refresh(true));document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true)});window.addEventListener('storage',()=>refresh(true));
})();
