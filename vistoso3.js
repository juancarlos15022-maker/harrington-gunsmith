/* HARRINGTON · Vistoso, tercera tanda (v3.0 · 20/10/2026)
   Retrato del Señor Harrington en su ventana, cartel de CERRADO POR INVENTARIO en el recuento de los jefes
   y las puertas del despacho al entrar en Dirección. Solo aspecto: no cambia ningún dato ni ningún texto. */
(function(){
'use strict';
var D=document;
function calm(){try{return calmFx()}catch(e){return false}}
function ok(f){return function(){try{return f.apply(this,arguments)}catch(e){try{console.warn('[vistoso3]',e)}catch(x){}}}}

/* 1) Retrato en la cabecera de la ventana de Harrington */
ok(function(){
 var t=D.getElementById('aiTitle');if(!t||t.previousElementSibling&&t.previousElementSibling.classList.contains('hg-retrato-cab'))return;
 var r=D.createElement('span');r.className='hg-retrato-cab';r.setAttribute('aria-hidden','true');t.parentNode.insertBefore(r,t);
 var h=t.parentNode;if(h&&h.classList.contains('enc-head')){var w=D.createElement('span');w.style.display='flex';w.style.alignItems='center';h.insertBefore(w,r);w.appendChild(r);w.appendChild(t)}
})();

/* 2) Cartel de CERRADO POR INVENTARIO cuando un jefe hace el inventario físico */
var inv=D.getElementById('invModal');
var cartel=ok(function(){
 if(!inv)return;var jefe=false;try{jefe=invView==='jefe'}catch(e){}
 var c=inv.querySelector('.cartel-inv'), head=inv.querySelector('.enc-head');
 if(!jefe||inv.hidden){if(c)c.remove();return}
 if(c||!head)return;
 c=D.createElement('div');c.className='cartel-inv';c.setAttribute('role','img');c.setAttribute('aria-label','Cerrado por inventario');
 c.innerHTML='<span>CERRADO POR INVENTARIO<small>Se ruega disculpen las molestias</small></span>';
 head.insertAdjacentElement('afterend',c);
});
if(inv){new MutationObserver(cartel).observe(inv,{attributes:true,attributeFilter:['hidden'],childList:true,subtree:true});cartel()}

/* 3) Las puertas del despacho se abren al entrar en Dirección */
var dir=D.getElementById('dirModal'), abierta=false;
var puertas=ok(function(){
 if(!dir)return;var vis=!dir.hidden;
 if(vis&&!abierta&&!calm()){var p=D.createElement('div');p.className='hg-puertas';p.setAttribute('aria-hidden','true');p.innerHTML='<i></i><i></i>';D.body.appendChild(p);setTimeout(function(){p.remove()},1250)}
 abierta=vis;
});
if(dir){abierta=!dir.hidden;new MutationObserver(puertas).observe(dir,{attributes:true,attributeFilter:['hidden']})}

window.hgVistoso3={cartel:cartel,puertas:puertas};
})();
