/* HARRINGTON · Vistoso, cuarta tanda (v3.0 · 20/10/2026)
   El tutorial pasa página como un libro, el «Cargando…» se escribe en papel, el ticket se arranca al cerrarlo
   y la luz del quinqué sigue al ratón por el catálogo. Solo aspecto: no cambia ningún dato ni ningún texto. */
(function(){
'use strict';
var D=document;
function calm(){try{return calmFx()}catch(e){return false}}
function ok(f){return function(){try{return f.apply(this,arguments)}catch(e){try{console.warn('[vistoso4]',e)}catch(x){}}}}

/* 1) Tutorial: al abrir un capítulo, su página se pasa como la de un libro */
var tut=D.getElementById('tutModal');
if(tut)tut.addEventListener('toggle',ok(function(e){
 var d=e.target;if(!d||!d.matches||!d.matches('details.tut')||!d.open||calm())return;
 var c=d.querySelector('.tut-c');if(!c)return;
 c.classList.remove('hg-pagina');void c.offsetWidth;c.classList.add('hg-pagina');
 setTimeout(function(){c.classList.remove('hg-pagina')},800);
}),true);

/* 2) «Cargando…»: renglones de papel que se van escribiendo mientras llegan los datos */
var papel=ok(function(root){
 (root||D).querySelectorAll('.enc-empty:not(.hg-cargando)').forEach(function(el){
  if(!/^\s*Cargando/.test(el.textContent))return;
  el.classList.add('hg-cargando');
  var t=el.textContent.trim();el.innerHTML='<span class="hg-cg-t">'+t.replace(/[<&]/g,'')+'</span><i></i><i></i><i></i><i></i>';
 });
});
new MutationObserver(function(m){for(var i=0;i<m.length;i++)if(m[i].addedNodes.length){papel();break}}).observe(D.body,{childList:true,subtree:true});
papel();

/* 3) El ticket se arranca por la línea de puntos al cerrarlo */
var rm=D.getElementById('receiptModal');
if(rm&&typeof window.closeModal==='function'){
 var orig=window.closeModal;
 window.closeModal=function(el){
  try{
   if(el===rm&&!rm.hidden&&!calm()){
    var p=rm.querySelector('.receipt-paper');
    if(p){var r=p.getBoundingClientRect();
     if(r.width>40&&r.height>40&&r.bottom>0&&r.top<innerHeight){
      var c=p.cloneNode(true);c.removeAttribute('id');c.querySelectorAll('[id]').forEach(function(x){x.removeAttribute('id')});
      var w=D.createElement('div');w.className='hg-ticket-fuera';w.setAttribute('aria-hidden','true');
      w.style.left=r.left+'px';w.style.top=r.top+'px';w.style.width=r.width+'px';w.style.height=r.height+'px';
      c.style.margin='0';c.style.width='100%';
      /* sin las animaciones de impresión: el papel sale tal cual se ve */
      [c].concat([].slice.call(c.querySelectorAll('*'))).forEach(function(x){x.style.animation='none';x.style.transition='none';x.style.opacity='';});c.style.clipPath='none';c.style.transform='none';w.appendChild(c);D.body.appendChild(w);
      try{if(typeof playPrint==='function')playPrint()}catch(x){}
      setTimeout(function(){w.remove()},950);
     }}
   }
  }catch(e){}
  return orig.apply(this,arguments);
 };
}

/* 4) La luz del quinqué sigue al ratón por las filas del catálogo */
var prods=D.getElementById('products');
if(prods&&window.matchMedia&&matchMedia('(pointer:fine)').matches){
 var raf=0,last=null,ev=null;
 prods.addEventListener('pointermove',function(e){ev=e;if(raf)return;raf=requestAnimationFrame(function(){raf=0;
  var row=ev.target.closest&&ev.target.closest('.product');if(last&&last!==row)last.classList.remove('hg-luz');
  if(!row||calm()){last=null;return}
  var b=row.getBoundingClientRect();row.style.setProperty('--lx',((ev.clientX-b.left)/b.width*100).toFixed(1)+'%');row.style.setProperty('--ly',((ev.clientY-b.top)/b.height*100).toFixed(1)+'%');
  row.classList.add('hg-luz');last=row;
 })},{passive:true});
 prods.addEventListener('pointerleave',function(){if(last)last.classList.remove('hg-luz');last=null});
}
/* en el móvil, al tocar un producto */
if(prods)prods.addEventListener('pointerdown',function(e){if(e.pointerType==='mouse'||calm())return;var row=e.target.closest&&e.target.closest('.product');if(!row)return;
 var b=row.getBoundingClientRect();row.style.setProperty('--lx',((e.clientX-b.left)/b.width*100).toFixed(1)+'%');row.style.setProperty('--ly',((e.clientY-b.top)/b.height*100).toFixed(1)+'%');
 row.classList.add('hg-luz');setTimeout(function(){row.classList.remove('hg-luz')},650)},{passive:true});

window.hgVistoso4={papel:papel};
})();
