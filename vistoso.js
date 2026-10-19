/* HARRINGTON · Vistoso (v3.0 · 19/10/2026)
   La parte que se mueve de las mejoras visuales (los estilos están en vistoso.css):
   portada según la hora con lámparas y polvo, fundido al cambiar de hora, pantalla de carga, ventanas que se abren
   como cajón o pergamino, ticket que se imprime y monedas al sellar PAGADO, cartel que gira, contadores de latón,
   gráfica a tinta, retratos sepia y siluetas, dibujos en las pantallas vacías y cabecera de la Dirección.
   Nada de esto cambia datos ni textos: si algo falla, la web sigue exactamente igual. */
(function(){
'use strict';
var D=document, H=D.documentElement;
function calm(){try{return calmFx()}catch(e){try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(x){return false}}}
function ok(f){return function(){try{return f.apply(this,arguments)}catch(e){try{console.warn('[vistoso]',e)}catch(x){}}}}
function el(tag,cls){var e=D.createElement(tag);if(cls)e.className=cls;return e}

/* ===================== 1) Portada según la hora ===================== */
var hero=D.querySelector('.hero-banner'), himg=hero&&hero.querySelector('img'), fx=null;
/* dónde están las lámparas en cada portada (en % de la imagen) y lo grandes que son */
var LUCES={
 ancha:[[49.6,10.5,1.4],[45,16,.8],[54.2,16,.8],[46.5,19.5,.6],[52.8,19,.6],[12,31,.9],[14.5,57,1.15],[22.7,48,.75],[34.5,33,.6],[76.5,35,.95],[77.5,56,.8],[83.5,64,.75],[83.5,45,.55],[92,46,.55],[97,33,.7]],
 movil:[[2.7,60,1.1],[13.8,50,.75],[29.2,26,.7],[45.5,3,.9],[54,3,.9],[70.5,35,.85],[83,25,.95],[91,47,.6],[91.5,77,.95]]
};
function franja(){try{return window.hgFranja?hgFranja():'atardecer'}catch(e){return 'atardecer'}}
function esAncha(){return !!(himg&&(himg.classList.contains('ancha')||/ancha/.test(himg.currentSrc||himg.src||'')))}
function caja(){
 /* el rectángulo que ocupa de verdad la imagen dentro de la portada (con object-fit) */
 var cs=getComputedStyle(himg), bw=himg.clientWidth, bh=himg.clientHeight, nw=himg.naturalWidth, nh=himg.naturalHeight;
 if(!nw||!nh||!bw||!bh)return null;
 var fit=cs.objectFit, s=fit==='contain'?Math.min(bw/nw,bh/nh):fit==='cover'?Math.max(bw/nw,bh/nh):null;
 var pos=(cs.objectPosition||'50% 50%').split(/\s+/), px=parseFloat(pos[0]), py=parseFloat(pos[1]);px=isNaN(px)?.5:px/100;py=isNaN(py)?.5:py/100;
 var sx=s||bw/nw, sy=s||bh/nh, ox=(bw-nw*sx)*px, oy=(bh-nh*sy)*py;
 return {l:himg.offsetLeft+himg.clientLeft,t:himg.offsetTop+himg.clientTop,w:bw,h:bh,sx:sx,sy:sy,ox:ox,oy:oy,nw:nw,nh:nh};
}
var pintar=ok(function(){
 if(!hero||!himg)return;
 var f=franja(), c=caja();
 if(fx){fx.remove();fx=null}
 if(!c)return;
 fx=el('div','hero-fx');fx.setAttribute('aria-hidden','true');
 fx.style.cssText='left:'+c.l+'px;top:'+c.t+'px;width:'+c.w+'px;height:'+c.h+'px';
 var quieto=calm(), frag=D.createDocumentFragment();
 if(f!=='manana'){
  var L=LUCES[esAncha()?'ancha':'movil'], fuerza=f==='noche'?1:.62;
  L.forEach(function(p,i){
   var x=c.ox+p[0]/100*c.nw*c.sx, y=c.oy+p[1]/100*c.nh*c.sy;if(x<-20||y<-20||x>c.w+20||y>c.h+20)return;
   var r=Math.max(26,c.nw*c.sx*.055*p[2]), s=el('i','luz');
   s.style.cssText='left:'+x.toFixed(1)+'px;top:'+y.toFixed(1)+'px;--r:'+r.toFixed(0)+'px;--o:'+(fuerza*(.55+.1*(i%3))).toFixed(2)+';--d:'+(2.6+((i*37)%17)/10).toFixed(2)+'s;--dl:-'+((i*53)%29/10).toFixed(1)+'s';
   frag.appendChild(s);
  });
 }
 if(!quieto){
  if(f==='manana')frag.appendChild(el('i','rayo'));
  var n=f==='manana'?26:f==='atardecer'?14:9;
  for(var k=0;k<n;k++){
   var m=el('i','mota'), zx=f==='manana'?55+((k*61)%45):((k*67)%100), zy=(k*41)%92;
   m.style.cssText='left:'+zx+'%;top:'+zy+'%;--s:'+(2+(k%3))+'px;--d:'+(9+(k*7)%9)+'s;--dl:-'+((k*13)%11)+'s;--dx:'+(((k*29)%40)-14)+'px;--dy:'+(-10-((k*17)%26))+'px;--o:'+(.45+((k*11)%5)/10).toFixed(2);
   frag.appendChild(m);
  }
 }
 fx.appendChild(frag);hero.appendChild(fx);
 /* el fondo desenfocado de los lados (pantallas medianas), con la misma luz */
 var bg=hero.querySelector('.hero-bg');if(bg&&window.hgPortadas){var P=hgPortadas[f]||hgPortadas.atardecer;bg.style.backgroundImage='url('+P.m+')'}
});
var ultimaFranja=franja();
var cambiar=ok(function(){
 if(!himg||!window.hgPortadaSrc)return;
 var f=franja();H.setAttribute('data-franja',f);
 var want=hgPortadaSrc(esAncha()), cur=himg.getAttribute('src')||'';
 var src=hero.querySelector('picture source');if(src)src.setAttribute('srcset',hgPortadaSrc(true));
 if(cur.indexOf(want)===0&&f===ultimaFranja)return;
 ultimaFranja=f;
 var pre=new Image();pre.onload=ok(function(){
  /* fundido: la imagen vieja encima se desvanece mientras debajo ya está la nueva */
  var c=caja(), old=himg.currentSrc||himg.src;
  if(c&&old&&!calm()){
   var o=el('img','hero-fundido');o.alt='';o.src=old;var cs=getComputedStyle(himg);
   o.style.cssText='left:'+c.l+'px;top:'+c.t+'px;width:'+c.w+'px;height:'+c.h+'px;object-fit:'+cs.objectFit+';object-position:'+cs.objectPosition+';border-radius:'+cs.borderRadius;
   hero.appendChild(o);requestAnimationFrame(function(){requestAnimationFrame(function(){o.style.opacity='0'})});setTimeout(function(){o.remove()},1900);
  }
  himg.src=want;
 });pre.src=want;
});
if(himg){
 himg.addEventListener('load',function(){pintar()});
 if(himg.complete&&himg.naturalWidth)pintar();
 var rt=0;window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(function(){cambiar();pintar()},200)});
 setInterval(function(){if(!D.hidden)cambiar()},60000);
 D.addEventListener('visibilitychange',function(){if(!D.hidden)cambiar()});
 /* al cambiar el ambiente en ⚙ (día / noche / automático), la portada cambia también */
 var tb=D.getElementById('themeBtn');if(tb)tb.addEventListener('click',function(){setTimeout(function(){cambiar();pintar()},30)});
 var fb=D.getElementById('fxBtn');if(fb)fb.addEventListener('click',function(){setTimeout(pintar,60)});
}

/* ===================== 2) Pantalla de carga ===================== */
(function(){var c=D.getElementById('cargaLacre');if(!c)return;
 if(H.classList.contains('sin-carga')||H.classList.contains('lite')){c.remove();return}
 setTimeout(function(){c.remove()},2600);
})();

/* ===================== 3) Ventanas que se abren como cajón o pergamino ===================== */
var PERGAMINO={libroModal:1,encModal:1,ausModal:1,evModal:1};
var abrir=ok(function(ov){
 var p=ov.firstElementChild;if(!p||ov.classList.contains('confirm')||ov.id==='receiptModal'||ov.id==='aiModal')return;
 var r=p.getBoundingClientRect(), perg=PERGAMINO[ov.id]&&r.height<innerHeight*1.15&&!calm();
 p.classList.remove('abre-cajon','abre-pergamino');void p.offsetWidth;p.classList.add(perg?'abre-pergamino':'abre-cajon');
 setTimeout(function(){p.classList.remove('abre-cajon','abre-pergamino')},800);
 if(!perg||!p.animate)return;
 /* los dos rodillos salen del centro y se separan mientras se desenrolla */
 var top=Math.max(r.top,4), bot=Math.min(r.bottom,innerHeight-4), mid=(top+bot)/2, w=Math.min(innerWidth-8,r.width+36), l=Math.max(4,r.left+r.width/2-w/2);
 [[top-17,0],[bot-17,1]].forEach(function(q){
  var ro=el('div','rodillo');ro.setAttribute('aria-hidden','true');ro.style.cssText='left:'+l+'px;width:'+w+'px;top:0';D.body.appendChild(ro);
  var a=ro.animate([{transform:'translateY('+(mid-17)+'px)',opacity:1},{transform:'translateY('+q[0]+'px)',opacity:1,offset:.82},{transform:'translateY('+q[0]+'px)',opacity:0}],{duration:900,easing:'cubic-bezier(.35,0,.2,1)',fill:'forwards'});
  a.onfinish=function(){ro.remove()};setTimeout(function(){ro.remove()},1400);
 });
});
var vigila=ok(function(ov){
 var antes=ov.hidden;
 new MutationObserver(function(){var ahora=ov.hidden;if(antes&&!ahora){abrir(ov);if(ov.id==='receiptModal')ticket()}antes=ahora}).observe(ov,{attributes:true,attributeFilter:['hidden']});
});
Array.prototype.forEach.call(D.querySelectorAll('.modal-overlay'),vigila);

/* ===================== 4) Ticket que se imprime y monedas al sellar ===================== */
var ticket=ok(function(){
 var pap=D.querySelector('#receiptModal .receipt-paper');if(!pap||calm())return;
 var fr=pap.querySelector('.receipt-frame');
 if(fr)Array.prototype.forEach.call(fr.children,function(c,i){c.style.setProperty('--i',i)});
 Array.prototype.forEach.call(D.querySelectorAll('#rcRows>*,#rcFin>*'),function(c,i){c.style.setProperty('--j',i)});
 pap.classList.remove('imprime');void pap.offsetWidth;pap.classList.add('imprime');
 setTimeout(function(){pap.classList.remove('imprime')},3200);
 var st=D.getElementById('paidStamp');if(!st)return;
 var espera=(parseFloat(st.style.animationDelay)||.6)*1000+380;
 setTimeout(ok(function(){
  if(D.getElementById('receiptModal').hidden)return;
  if(fr){fr.classList.remove('golpe');void fr.offsetWidth;fr.classList.add('golpe')}
  if(st.textContent!=='PAGADO'||!D.body.animate)return;
  var r=st.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;if(!r.width)return;
  for(var k=0;k<9;k++){
   var m=el('i','moneda-salto');m.style.left=cx+'px';m.style.top=cy+'px';D.body.appendChild(m);
   var ang=(-160+k*40+(k%2?12:-8))*Math.PI/180, dist=70+(k*23)%60;
   var an=m.animate([{transform:'translate(0,0) scale(.4) rotateY(0)',opacity:0},{opacity:1,offset:.15},{transform:'translate('+(Math.cos(ang)*dist).toFixed(0)+'px,'+(Math.sin(ang)*dist-30).toFixed(0)+'px) scale(1) rotateY(540deg)',opacity:1,offset:.6},{transform:'translate('+(Math.cos(ang)*dist*1.15).toFixed(0)+'px,'+(Math.sin(ang)*dist+60).toFixed(0)+'px) scale(.8) rotateY(900deg)',opacity:0}],{duration:1100+k*30,easing:'cubic-bezier(.2,.7,.4,1)',fill:'forwards'});
   (function(mm){an.onfinish=function(){mm.remove()};setTimeout(function(){mm.remove()},1800)})(m);
  }
 }),espera);
});

/* ===================== 5) Cartel ABIERTO / CERRADO que gira al cambiar ===================== */
(function(){var s=D.getElementById('shopSign');if(!s)return;var antes=s.getAttribute('src');
 new MutationObserver(ok(function(){var a=s.getAttribute('src');if(antes&&a&&a!==antes&&!calm()){s.classList.remove('gira');void s.offsetWidth;s.classList.add('gira');setTimeout(function(){s.classList.remove('gira')},1400)}antes=a})).observe(s,{attributes:true,attributeFilter:['src']});
})();

/* ===================== 6) Contadores de latón en el resumen de la Dirección ===================== */
var VALORES={};
var contadores=ok(function(root){
 Array.prototype.forEach.call(root.querySelectorAll('.dash-card b:not([data-odo])'),function(b){
  b.setAttribute('data-odo','1');
  var txt=b.textContent, card=b.closest('.dash-card'), k=card&&card.querySelector('small')?card.querySelector('small').textContent:'', cambia=VALORES[k]!==txt;VALORES[k]=txt;
  if(!/\d/.test(txt)||txt.length>40)return;
  /* solo se envuelven las cifras: el texto de la tarjeta sigue siendo exactamente el mismo */
  var n=0, nodos=[];(function rec(x){Array.prototype.forEach.call(x.childNodes,function(c){if(c.nodeType===3)nodos.push(c);else rec(c)})})(b);
  nodos.forEach(function(t){
   var f=D.createDocumentFragment(), s=t.nodeValue, buf='';
   for(var i=0;i<s.length;i++){var ch=s[i];if(/\d/.test(ch)){if(buf){f.appendChild(D.createTextNode(buf));buf=''}var o=el("hg-odo","odo"+(cambia&&!calm()?" rueda":"")), d=el("hg-d");d.textContent=ch;o.style.setProperty('--k',n++);o.appendChild(d);f.appendChild(o)}else buf+=ch}
   if(buf)f.appendChild(D.createTextNode(buf));t.parentNode.replaceChild(f,t);
  });
 });
});

/* ===================== 7) Gráfica de la semana a tinta ===================== */
if(typeof chartSVG==='function'&&typeof accounts==='function'){
 var viejaGrafica=chartSVG;
 window.chartSVG=function(r){try{return graficaTinta(r)}catch(e){return viejaGrafica(r)}};
}
var NG=0;
function graficaTinta(r){
 var days=[];for(var d=r.s;d<=r.e;d++){var a=accounts({s:d,e:d});days.push({d:d,ing:a.ing,gas:a.gas})}
 var max=Math.max(100,Math.max.apply(null,days.map(function(x){return Math.max(x.ing,x.gas)}))), W=420,Hh=230,L=34,R=12,B=34,T=36,ch=Hh-B-T,sw=(W-L-R)/days.length,bw=Math.min(17,sw*.32);
 var ink='#2b1d0e', roja='#7a2412', ff='font-family="IM Fell English,Georgia,serif"', id='hgT'+(++NG);
 var y=function(v){return T+ch-(v/max)*ch}, lab=function(v){return v?'$'+Math.round(v/100):''};
 /* un trazo de pluma: rectángulo con los lados un poco temblorosos */
 var pluma=function(x,y0,w,h,k){var j=function(n){return ((((k*31+n*17)%7)-3)/7).toFixed(2)};return 'M'+(x+ +j(1))+','+(y0+h)+' L'+(x+ +j(2))+','+y0+' L'+(x+w+ +j(3))+','+(y0+ +j(4))+' L'+(x+w+ +j(5))+','+(y0+h)};
 var o='<svg class="grafica-tinta" viewBox="0 0 '+W+' '+Hh+'" width="100%" role="img" aria-label="Ingresos y gastos de la semana">';
 o+='<defs><filter id="'+id+'f"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="4"/><feDisplacementMap in="SourceGraphic" scale="1.3"/></filter>'+
  '<pattern id="'+id+'i" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="4" stroke="'+ink+'" stroke-width=".9" opacity=".55"/></pattern>'+
  '<pattern id="'+id+'g" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)"><line x1="0" y1="0" x2="0" y2="5" stroke="'+roja+'" stroke-width="1.2" opacity=".7"/></pattern></defs>';
 o+='<image href="libro-cuentas.webp" x="0" y="0" width="'+W+'" height="'+Hh+'" preserveAspectRatio="xMidYMid slice"/>';
 o+='<text x="'+W/2+'" y="20" font-size="13" text-anchor="middle" fill="'+ink+'" '+ff+' font-style="italic">Libro de cuentas · semana</text>';
 if(max>100)[.5,1].forEach(function(f){var yy=T+ch-f*ch;o+='<text x="'+(L-4)+'" y="'+(yy+3)+'" font-size="8" text-anchor="end" fill="'+ink+'" opacity=".7" '+ff+'>$'+Math.round(max*f/100)+'</text>'});
 else o+='<text x="'+((W+L)/2)+'" y="'+(T+ch/2)+'" font-size="12" text-anchor="middle" fill="'+ink+'" opacity=".6" '+ff+' font-style="italic">Todavía no hay apuntes esta semana</text>';
 o+='<g filter="url(#'+id+'f)">';var dias='';
 days.forEach(function(x,i){
  var cx=L+sw*i+sw/2, hi=T+ch-y(x.ing), hg=T+ch-y(x.gas);
  if(hi>0.5){o+='<rect class="relleno" style="--k:'+i+'" x="'+(cx-bw-1.5)+'" y="'+y(x.ing)+'" width="'+bw+'" height="'+hi+'" fill="url(#'+id+'i)"/>';
   o+='<path class="trazo" style="--k:'+i+'" pathLength="1" d="'+pluma(cx-bw-1.5,y(x.ing),bw,hi,i)+'" fill="none" stroke="'+ink+'" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'}
  if(hg>0.5){o+='<rect class="relleno" style="--k:'+i+'" x="'+(cx+1.5)+'" y="'+y(x.gas)+'" width="'+bw+'" height="'+hg+'" fill="url(#'+id+'g)"/>';
   o+='<path class="trazo" style="--k:'+i+'" pathLength="1" d="'+pluma(cx+1.5,y(x.gas),bw,hg,i+7)+'" fill="none" stroke="'+roja+'" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'}
  o+='<text class="cifra" style="--k:'+i+'" x="'+(cx-bw/2-1.5)+'" y="'+(y(x.ing)-4)+'" font-size="9" text-anchor="middle" fill="'+ink+'" '+ff+'>'+lab(x.ing)+'</text><text class="cifra" style="--k:'+i+'" x="'+(cx+bw/2+1.5)+'" y="'+(y(x.gas)-4)+'" font-size="9" text-anchor="middle" fill="'+roja+'" '+ff+'>'+lab(x.gas)+'</text>';
  dias+='<text x="'+cx+'" y="'+(Hh-B+16)+'" font-size="12" text-anchor="middle" fill="'+ink+'" '+ff+'>'+(typeof DIAS!=='undefined'?DIAS[new Date(x.d*86400000).getUTCDay()]:'')+'</text>';
 });
 o+='<path class="trazo" pathLength="1" d="M'+L+','+(T+ch)+' Q'+(W/2)+','+(T+ch+1.4)+' '+(W-R)+','+(T+ch-.6)+'" fill="none" stroke="'+ink+'" stroke-width="1.5"/></g>'+dias;
 o+='<rect x="'+(L+2)+'" y="'+(Hh-14)+'" width="10" height="8" fill="url(#'+id+'i)" stroke="'+ink+'" stroke-width=".8"/><text x="'+(L+16)+'" y="'+(Hh-7)+'" font-size="10" fill="'+ink+'" '+ff+'>Ingresos</text>'+
  '<rect x="'+(L+74)+'" y="'+(Hh-14)+'" width="10" height="8" fill="url(#'+id+'g)" stroke="'+roja+'" stroke-width=".8"/><text x="'+(L+88)+'" y="'+(Hh-7)+'" font-size="10" fill="'+roja+'" '+ff+'>Gastos</text></svg>';
 return o;
}

/* ===================== 8) Retratos: foto en sepia con marco ovalado, o silueta ===================== */
function sil(id){try{return 'silueta-'+siluetaDe(id)+'.webp'}catch(e){return 'silueta-hombre.webp'}}
function foto(id){try{return (typeof PHOTOS!=='undefined'&&PHOTOS[id])||(id==='prueba'?'arthur-ayudante.webp':'')}catch(e){return ''}}
var retratos=ok(function(root){
 /* tarjetas de la entrada: silueta dentro del óvalo si no hay foto */
 Array.prototype.forEach.call(root.querySelectorAll('.gc-oval'),function(ov){
  var c=ov.closest('[data-gcard],.gb-front'), id=c&&(c.dataset.gcard||c.dataset.emp);if(!id)return;
  var s=ov.querySelector('.gc-sil'), tiene=ov.classList.contains('has-photo');
  if(tiene){if(s)s.remove();ov.classList.remove('has-sil');return}
  var u=sil(id);if(!s){s=el('img','gc-sil');s.alt='';s.decoding='async';ov.insertBefore(s,ov.firstChild)}
  if(s.getAttribute('src')!==u)s.setAttribute('src',u);ov.classList.add('has-sil');
 });
 /* Mi ficha */
 Array.prototype.forEach.call(root.querySelectorAll('.mi-photo:not(.retrato)'),function(m){
  var e=null;try{e=meEmp()}catch(x){}if(!e)return;
  m.classList.add('retrato');var f=el('span','ret-foto'), i=el('img');i.alt='';i.src=foto(e.id)||sil(e.id);f.appendChild(i);m.appendChild(f);
 });
 /* lista de empleados de la Dirección */
 Array.prototype.forEach.call(root.querySelectorAll('.it>[data-pres]'),function(p){
  var it=p.parentNode;if(it.querySelector('.retrato-mini'))return;
  var id=p.getAttribute('data-pres'), ph=it.querySelector('.emp-ph'), w=el('span','retrato retrato-mini'), f=el('span','ret-foto');w.setAttribute('aria-hidden','true');
  if(ph){f.appendChild(ph)}else{var i=el('img','emp-ph');i.alt='';i.src=sil(id);f.appendChild(i)}
  w.appendChild(f);it.insertBefore(w,it.firstChild);
 });
});

/* ===================== 9) Dibujos en las pantallas vacías ===================== */
var VACIOS=[
 [/venta|vendid|compras?\b|cobrad|ingres|operaci|cierres? guardad/i,'vacio-ventas.webp'],
 [/coincid|resultado|con ese filtro|con esos filtros|con eso\b|encontr/i,'vacio-busqueda.webp'],
 [/stock|inventario|existencia|productos? con receta|recetas|armas registradas/i,'vacio-inventario.webp'],
 [/aviso|telegram|notifica|mensaje|discord|incidencia|nada pendiente|notas pendientes/i,'vacio-avisos.webp'],
 [/emplead|ausen|fichaj|ascenso|personal|sueldo/i,'vacio-empleados.webp'],
 [/encargo/i,'vacio-encargos.webp'],[/pedido|proveedor/i,'vacio-pedidos.webp'],[/material|almac|fabricad/i,'vacio-materiales.png']
];
var vacios=ok(function(root){
 Array.prototype.forEach.call(root.querySelectorAll('.enc-empty:not([data-vac])'),function(v){
  v.setAttribute('data-vac','1');if(v.querySelector('.empty-art'))return;
  var t=v.textContent||'';if(/cargando|^\s*$/i.test(t))return;
  for(var i=0;i<VACIOS.length;i++)if(VACIOS[i][0].test(t)){var s=el('span','empty-art mini'), im=el('img');im.src=VACIOS[i][1];im.alt='';im.loading='lazy';im.decoding='async';s.appendChild(im);v.insertBefore(s,v.firstChild);return}
 });
});

/* ===================== 10) Cabecera del despacho de la Dirección ===================== */
var cabecera=ok(function(){
 var b=D.getElementById('dirBody');if(!b)return;
 var home=false;try{home=!dirMod}catch(e){}
 var c=b.querySelector(':scope>.dir-cab');
 if(home&&!c){c=el('div','dir-cab');c.setAttribute('aria-hidden','true');b.insertBefore(c,b.firstChild)}
 else if(!home&&c)c.remove();
});

/* ===================== Un solo vigilante para todo lo que se pinta de nuevo ===================== */
var pend=null;
function repasar(){pend=null;var r=D.body;cabecera();contadores(D.getElementById('dirBody')||r);retratos(r);vacios(r)}
new MutationObserver(function(){if(!pend)pend=(window.requestAnimationFrame||setTimeout)(repasar)}).observe(D.body,{childList:true,subtree:true});
repasar();
/* cuando llegan fotos nuevas de la nube, se repintan los retratos */
if(typeof paintPhotos==='function'){var vp=paintPhotos;window.paintPhotos=function(){var r=vp.apply(this,arguments);try{retratos(D.body)}catch(e){}return r}}
})();
