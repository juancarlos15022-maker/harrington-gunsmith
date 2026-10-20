/* HARRINGTON · Vistoso, segunda tanda (v3.0 · 20/10/2026)
   Fichaje con tarjeta en el reloj de fichar, chispas y humo al fabricar, cajas que se abren al recibir un pedido,
   sobre de paga al pagar un sueldo, diploma al ascender, medallas, tablón de corcho, calendario de ausencias,
   mapa de proveedores, escenas del taller y del muelle, poste roto sin conexión, firma y sello, lluvia de noche,
   profundidad en la portada, lluvia de monedas con el objetivo, pasar página y el AGOTADO que cae.
   Todo es visual: reacciona a lo que la web ya hace y ya dice, sin cambiar ningún dato ni ningún texto. */
(function(){
'use strict';
var D=document, H=D.documentElement;
function calm(){try{return calmFx()}catch(e){return false}}
function ok(f){return function(){try{return f.apply(this,arguments)}catch(e){try{console.warn('[vistoso2]',e)}catch(x){}}}}
function el(tag,cls,html){var e=D.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e}
function E(s){try{return esc(s)}catch(e){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}}
function ahora(){try{return fmtTime(Date.now())}catch(e){var d=new Date();return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)}}
function hoy(){try{return fmtDate(Date.now()).slice(0,5)}catch(e){return ''}}
/* firma del jefe que hace la gestión: Vincent o Chester; los demás, solo el sello de la casa */
function firmaDe(n){n=String(n||'');return /vincent/i.test(n)?'firma-vincent.webp':/chester/i.test(n)?'firma-chester.webp':''}
function yo(){try{var e=meEmp();return e?e.name:''}catch(x){return ''}}
window.hgFirmaDe=firmaDe;

/* ---------- una capa que aparece unos segundos encima de todo ---------- */
function capa(cls,html,ms,cierra){
 var o=el('div','hg-capa '+cls,html);o.setAttribute('aria-hidden','true');
 if(cierra){o.style.pointerEvents='auto';o.addEventListener('click',function(){fuera()})}
 D.body.appendChild(o);
 var t=setTimeout(fuera,ms);
 function fuera(){clearTimeout(t);o.classList.add('fuera');setTimeout(function(){o.remove()},450)}
 return o;
}

/* ===================== 1) Fichaje: la tarjeta entra en el reloj y sale sellada ===================== */
var fichar=ok(function(entra,nombre,hora){
 if(calm())return;
 var o=capa('hg-fichar','<div class="hf-reloj"><img src="reloj-fichar.webp" alt=""><div class="hf-ranura"><div class="hf-tarjeta"><img src="tarjeta-fichaje.webp" alt="">'+
  '<b class="hf-nom">'+E(nombre)+'</b><i class="hf-sello '+(entra?'in':'out')+'">'+(entra?'ENTRADA':'SALIDA')+'</i><span class="hf-hora">'+E(hoy())+' · '+E(hora||ahora())+'</span></div></div></div>',3300);
 setTimeout(function(){try{if(typeof playThump==='function')playThump()}catch(e){}},900);
 return o;
});

/* ===================== 2) Chispas de la forja y humo de pólvora ===================== */
var chispas=ok(function(humo){
 if(calm()||!D.body.animate)return;
 var cx=innerWidth/2, cy=innerHeight*.62, n=humo?18:30;
 var fl=el('div','hg-fogonazo');D.body.appendChild(fl);setTimeout(function(){fl.remove()},900);
 for(var i=0;i<n;i++){
  var s=el('i','hg-chispa');s.style.left=cx+'px';s.style.top=cy+'px';D.body.appendChild(s);
  var a=(-160+Math.random()*140)*Math.PI/180, v=90+Math.random()*190, dx=Math.cos(a)*v, dy=Math.sin(a)*v;
  var an=s.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:'translate('+(dx*.7).toFixed(0)+'px,'+(dy*.7).toFixed(0)+'px) scale(.8)',opacity:1,offset:.55},{transform:'translate('+dx.toFixed(0)+'px,'+(dy+120).toFixed(0)+'px) scale(.2)',opacity:0}],{duration:700+Math.random()*600,easing:'cubic-bezier(.15,.7,.4,1)',fill:'forwards'});
  (function(x){an.onfinish=function(){x.remove()};setTimeout(function(){x.remove()},1600)})(s);
 }
 if(!humo)return;
 for(var k=0;k<9;k++){
  var h=el('i','hg-humo');h.style.left=(cx-60+Math.random()*120)+'px';h.style.top=(cy-10)+'px';D.body.appendChild(h);
  var hn=h.animate([{transform:'translate(-50%,-50%) scale(.3)',opacity:0},{opacity:.75,offset:.2},{transform:'translate(calc(-50% + '+(Math.random()*80-40).toFixed(0)+'px),calc(-50% - '+(140+Math.random()*120).toFixed(0)+'px)) scale(2.4)',opacity:0}],{duration:1800+Math.random()*900,delay:k*60,easing:'ease-out',fill:'forwards'});
  (function(x){hn.onfinish=function(){x.remove()};setTimeout(function(){x.remove()},3200)})(h);
 }
});

/* ===================== 3) La caja del pedido se abre al recibirlo ===================== */
var caja=ok(function(){
 if(calm())return;
 capa('hg-caja','<div class="hc-in"><img class="cerrada" src="caja-cerrada.webp" alt=""><img class="abierta" src="caja-abierta.webp" alt=""></div>',2600);
});

/* ===================== 4) Sobre de paga ===================== */
var sobre=ok(function(nombre,importe){
 if(calm())return;
 var f=firmaDe(yo());
 capa('hg-sobre','<div class="hs-in"><img class="abierto" src="sobre-abierto.webp" alt=""><div class="cerrado"><img src="sobre-cerrado.webp" alt=""><b>'+E(nombre)+'</b><span>Paga de la semana · '+E(importe)+'</span>'+(f?'<img class="hs-firma" src="'+f+'" alt="">':'')+'</div></div>',3400);
});

/* ===================== 5) Diploma de ascenso ===================== */
var diploma=ok(function(nombre,puesto,sueldo){
 var f=firmaDe(yo()), fecha='';try{var m=madridParts(Date.now());fecha=+m.day+' de '+['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][+m.month-1]}catch(e){}
 capa('hg-diploma'+(calm()?' quieto':''),'<div class="hd-in"><img src="diploma.webp" alt=""><div class="hd-txt"><small>LA CASA HARRINGTON</small><em>certifica el ascenso de</em><b>'+E(nombre)+'</b><em>al puesto de</em><strong>'+E(puesto)+'</strong><span>con un sueldo de '+E(sueldo)+' a la semana</span><i>Saint Denis, a '+E(fecha)+'</i></div>'+
  '<img class="hd-sello" src="sello-harrington.webp" alt="">'+(f?'<img class="hd-firma" src="'+f+'" alt="">':'')+'<p class="hd-cerrar">Toca para cerrar</p></div>',9000,true);
});

/* ===================== 6) Lluvia de monedas con el objetivo de la semana ===================== */
var monedas=ok(function(){
 if(calm()||!D.body.animate)return;
 for(var i=0;i<34;i++){
  var m=el('i','hg-moneda');m.style.left=(Math.random()*100)+'vw';D.body.appendChild(m);
  var an=m.animate([{transform:'translateY(-60px) rotateY(0)',opacity:1},{transform:'translateY('+(innerHeight+60)+'px) rotateY('+(720+Math.random()*720).toFixed(0)+'deg)',opacity:1}],{duration:1600+Math.random()*1400,delay:Math.random()*900,easing:'cubic-bezier(.4,0,.8,.6)',fill:'forwards'});
  (function(x){an.onfinish=function(){x.remove()};setTimeout(function(){x.remove()},4200)})(m);
 }
});
if(typeof recordFx==='function'){var vr=recordFx;window.recordFx=function(t,sub){var r=vr.apply(this,arguments);try{if(/OBJETIVO/i.test(t))monedas()}catch(e){}return r}}

/* ===================== Escucha lo que la web ya cuenta en sus avisos ===================== */
var SAL=/^(?:Buenos días|Buenas tardes|Buenas noches), (.+?)\. Entrada a las (\d{1,2}:\d{2})/;
var reaccion=ok(function(t){
 var m;
 if((m=SAL.exec(t)))return fichar(true,m[1],m[2]);
 if((m=/^Buen trabajo, ([^.:]+?)(?:[.:]| ¡)/.exec(t)))return fichar(false,m[1],ahora());
 if(/^Fabricado: |^Encargo fabricado/.test(t))return chispas(/Munici|P[óo]lvora/i.test(t));
 if(/^Entrega final|^Entrega parcial registrada/.test(t))return caja();
 if((m=/^Sueldo pagado: (.+?) · (\$[\d.,]+)/.exec(t)))return sobre(m[1],m[2]);
 if((m=/^¡(.+) asciende a (.+)! Nuevo sueldo: (\$[\d.,]+)/.exec(t)))return diploma(m[1],m[2],m[3]);
});
if(typeof say==='function'){var vs=say;window.say=function(t){var r=vs.apply(this,arguments);try{reaccion(String(t))}catch(e){}return r}}
window.hgVistoso2={fichar:fichar,chispas:chispas,caja:caja,sobre:sobre,diploma:diploma,monedas:monedas};

/* ===================== 7) Medallas ===================== */
var MED=[
 {i:1,t:'Mejor vendedor de la semana'},
 {i:2,t:'Fabricante de la semana'},
 {i:3,t:'Veterano de la casa: más de 30 días'},
 {i:4,t:'Maestro armero: Armero experto o superior'},
 {i:5,t:'Puntual: cumplió sus horas la semana pasada'}];
var medCache={t:0,m:{}};
function medallasDe(id){
 if(Date.now()-medCache.t>15000){
  var m={}, add=function(k,i){(m[k]=m[k]||[]).push(i)};
  try{
   var ws=weekStart(0), L=loadLog(KEY_SALELOG), by={};
   L.forEach(function(r){if(r.voided||saleDay(r)<ws)return;by[r.employee]=(by[r.employee]||0)+collected(r)});
   var best=Object.keys(by).sort(function(a,b){return by[b]-by[a]})[0];
   if(best&&by[best]>0){var e=empleados.find(function(x){return x.name===best});if(e)add(e.id,1)}
  }catch(x){}
  try{
   var ws2=weekStart(0), f={};
   fabLotes().forEach(function(l){var p=madridParts(l.ts);if(dayNum(+p.year,+p.month,+p.day)>=ws2)f[l.empId]=(f[l.empId]||0)+(+l.q||0)});
   var bf=Object.keys(f).sort(function(a,b){return f[b]-f[a]})[0];if(bf&&f[bf]>0)add(bf,2);
  }catch(x){}
  try{
   var lim=new Date(Date.now()-30*86400000).toISOString().slice(0,10), pw=weekStart(-1);
   empleados.forEach(function(e){
    if(e.inicio&&e.inicio<=lim)add(e.id,3);
    if(['Armero experto','Gerente','Jefe'].indexOf(e.puesto)>=0)add(e.id,4);
    try{var k=sueCalc(e,pw);if(k.req>0&&k.worked>=k.req*3600000)add(e.id,5)}catch(x){}
   });
  }catch(x){}
  medCache={t:Date.now(),m:m};
 }
 return (medCache.m[id]||[]).slice().sort();
}
function medHTML(id,cls){var L=medallasDe(id);if(!L.length)return '';return '<span class="'+cls+'">'+L.map(function(i){var d=MED[i-1];return '<img src="medalla-'+i+'.webp" alt="'+E(d.t)+'" title="'+E(d.t)+'" loading="lazy">'}).join('')+'</span>'}
var medallas=ok(function(root){
 Array.prototype.forEach.call(root.querySelectorAll('.g-card[data-gcard]'),function(c){
  var id=c.dataset.gcard, h=medHTML(id,'gc-med'), v=c.querySelector('.gc-med');
  if(v&&v.outerHTML===h)return;if(v)v.remove();if(h)c.insertAdjacentHTML('beforeend',h);
 });
 var mp=root.querySelector('#miBody .mi-photo');
 if(mp&&!mp.parentNode.querySelector('.mi-med')){var e=null;try{e=meEmp()}catch(x){}if(e){var h=medHTML(e.id,'mi-med');if(h){mp.insertAdjacentHTML('afterend',h);var me=mp.parentNode.querySelector('.mi-med');me.insertAdjacentHTML('beforeend','<small>'+medallasDe(e.id).map(function(i){return E(MED[i-1].t)}).join(' · ')+'</small>')}}}
 Array.prototype.forEach.call(root.querySelectorAll('#dirBody .it>[data-pres]'),function(p){
  var it=p.parentNode;if(it.querySelector('.med-fila'))return;var h=medHTML(p.getAttribute('data-pres'),'med-fila');if(h)p.insertAdjacentHTML('beforebegin',h);
 });
});

/* ===================== 8) Escenas: taller y muelle ===================== */
function escena(tipo,titulo){return '<div class="escena escena-'+tipo+'" aria-hidden="true"><b>'+E(titulo)+'</b></div>'}
(function(){
 [['matModal','taller','El taller'],['pedModal','muelle','El muelle de carga']].forEach(function(x){
  var m=D.getElementById(x[0]);if(!m)return;var h=m.querySelector('.enc-head');if(h&&!m.querySelector('.escena'))h.insertAdjacentHTML('afterend',escena(x[1],x[2]));
 });
})();
var DIR_ESC={fabricar:['taller','El taller'],fabricacion:['taller','El taller'],balfab:['taller','El taller'],regpedidos:['muelle','El muelle de carga']};
var escenasDir=ok(function(){
 var b=D.getElementById('dirBody');if(!b)return;var mod=null;try{mod=dirMod}catch(e){}
 var want=DIR_ESC[mod], cur=b.querySelector(':scope>.escena');
 if(!want){if(cur)cur.remove();return}
 if(cur&&cur.classList.contains('escena-'+want[0]))return;if(cur)cur.remove();
 var first=b.firstElementChild;if(first)first.insertAdjacentHTML('afterend',escena(want[0],want[1]));
});

/* ===================== 9) Tablón de corcho en ENCARGOS ===================== */
var corcho=ok(function(){
 var b=D.getElementById('encBody');if(!b)return;var p=b.closest('.enc-panel');
 var lista=!!b.querySelector(':scope>.enc-card[data-open]')||!!b.querySelector(':scope>.enc-empty');
 p.classList.toggle('corcho',lista);b.classList.toggle('corcho-notas',!!b.querySelector(':scope>.enc-card[data-open]'));
});

/* ===================== 10) Calendario de ausencias (las próximas 4 semanas) ===================== */
var LETRAS=['L','M','X','J','V','S','D'];
function calendarioHTML(){
 var t=0;try{t=todayNum()}catch(e){return ''}
 var dow=new Date(t*86400000).getUTCDay(), lunes=t-((dow+6)%7), A=[];try{A=ausencias||[]}catch(e){}
 var celdas='';
 for(var i=0;i<28;i++){
  var d=lunes+i, ini=(d*86400000)-7200000, fin=ini+86400000;
  var quien=A.filter(function(a){return a&&!a.cancelled&&a.start<fin&&(!a.end||a.end>ini)&&!(a.returned&&d>t)}).map(function(a){return a.name});
  var dia=new Date(d*86400000).getUTCDate();
  celdas+='<span class="cd'+(d===t?' hoy':'')+(d<t?' pasado':'')+(quien.length?' aus':'')+'"'+(quien.length?' title="Ausente: '+E(quien.join(', '))+'"':'')+'>'+(i<7?'<small>'+LETRAS[i]+'</small>':'')+'<b>'+dia+'</b>'+(quien.length?'<i>'+quien.length+'</i>':'')+'</span>';
 }
 return '<div class="calendario" aria-label="Calendario de ausencias de las próximas cuatro semanas"><div class="cd-hoja"><img src="calendario-pared.webp" alt=""><div class="cd-rej">'+celdas+'</div></div><p>Próximas 4 semanas · en rojo, los días con alguien ausente</p></div>';
}
var calendario=ok(function(){
 var targets=[];
 var ab=D.getElementById('ausBody'), at=D.getElementById('ausTitle');
 if(ab&&at&&at.textContent==='AUSENCIAS')targets.push(ab);
 var db=D.getElementById('dirBody');try{if(db&&dirMod==='ausencias')targets.push(db)}catch(e){}
 targets.forEach(function(b){
  var h=calendarioHTML(), c=b.querySelector('.calendario');
  if(c){if(c.dataset.h===h)return;c.remove()}
  var first=b===db?b.firstElementChild:null;
  if(first)first.insertAdjacentHTML('afterend',h);else b.insertAdjacentHTML('afterbegin',h);
  b.querySelector('.calendario').dataset.h=h;
 });
});

/* ===================== 11) Mapa de los proveedores ===================== */
var SITIOS=[
 [/saint ?denis|puerto|ciudad|muelle/i,57,64],[/annesburg/i,7,15],[/strawberry/i,42,18],[/rhodes|granja|agricult|plantaci|cultivo/i,68,24],
 [/valentine|rancho|ganad|establo|caball/i,62,37],[/lagras|bayou|pantano|ciénaga|cienaga/i,8,64],[/blackwater|armadillo|tumbleweed|emerald|estaci|tren|ferrocarril/i,91,33],
 [/van horn|faro|costa|mar\b/i,90,71],[/braithwaite|caliga|mansi[oó]n/i,86,46]];
var POR_TIPO=[[/mina|carb[oó]n|hierro/i,7,15],[/tala|madera|serrer|aserr|bosque/i,15,28],[/herrer|forja|fundici/i,32,42],[/granja|agric/i,68,24]];
var LIBRES=[[30,30],[48,40],[77,26],[20,45],[70,52],[40,52],[83,60],[24,22]];
function hashS(s){var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h}
function sitio(v){
 var u=(v.ubic||'')+' '+(v.name||''), t=v.tipo||'', i;
 if(/annesburg/i.test(u)&&/tala|madera/i.test(t))return [15,28];
 for(i=0;i<SITIOS.length;i++)if(SITIOS[i][0].test(u))return [SITIOS[i][1],SITIOS[i][2]];
 for(i=0;i<POR_TIPO.length;i++)if(POR_TIPO[i][0].test(t))return [POR_TIPO[i][1],POR_TIPO[i][2]];
 var l=LIBRES[hashS(v.id||v.name||'')%LIBRES.length];return [l[0],l[1]];
}
function mapaHTML(){
 var L=[];try{L=proveedores.filter(function(v){return v&&v.name&&!/particular/i.test(v.tipo||'')})}catch(e){}
 if(!L.length)return '';
 var usados={};
 var pins=L.map(function(v){var s=sitio(v), k=s.join(','), n=usados[k]=(usados[k]||0)+1, x=s[0], y=s[1];
  if(n>1){var a=(n-1)*2.1;x+=Math.cos(a)*4.5;y+=Math.sin(a)*6}
  x=Math.max(4,Math.min(96,x));y=Math.max(6,Math.min(94,y));
  return '<button type="button" class="pin" data-dir="pv-view:'+E(v.id)+'" style="left:'+x.toFixed(1)+'%;top:'+y.toFixed(1)+'%" title="'+E(v.name+(v.tipo?' · '+v.tipo:'')+(v.ubic?' · '+v.ubic:''))+'"><i></i><span>'+E(v.name)+'</span></button>'}).join('');
 return '<div class="mapa-prov"><img src="mapa-region.webp" alt="Mapa de la región con los proveedores">'+pins+'</div><p class="bk-note mapa-nota">Toca una chincheta para abrir la ficha del proveedor. Se colocan según su ubicación o su tipo de negocio.</p>';
}
var mapa=ok(function(){
 var b=D.getElementById('dirBody');if(!b)return;
 var on=false;try{on=dirMod==='proveedores'&&!pvView&&!pvEdit}catch(e){}
 var c=b.querySelector('.mapa-prov');
 if(!on){if(c){var n=b.querySelector('.mapa-nota');c.remove();if(n)n.remove()}return}
 var h=mapaHTML();if(!h)return;if(c&&c.dataset.h===h)return;
 if(c){var n2=b.querySelector('.mapa-nota');c.remove();if(n2)n2.remove()}
 var t=Array.prototype.find.call(b.querySelectorAll('.dir-sec-title'),function(x){return /LISTA DE PROVEEDORES/.test(x.textContent)});
 if(!t)return;t.insertAdjacentHTML('afterend',h);b.querySelector('.mapa-prov').dataset.h=h;
});

/* ===================== 12) Firma y sello en el ticket y en el albarán ===================== */
var firmaTicket=ok(function(){
 var fr=D.querySelector('#receiptModal .receipt-frame');if(!fr)return;
 var emp=(D.getElementById('rcEmp')||{}).textContent||'', f=firmaDe(emp), v=fr.querySelector('.rc-firma');
 var h='<div class="rc-firma">'+(f?'<img class="fi" src="'+f+'" alt="Firma de '+E(emp)+'">':'')+'<img class="se" src="sello-harrington.webp" alt="Sello de la Casa Harrington"></div>';
 if(v){if(v.outerHTML===h)return;v.remove()}
 var w=fr.querySelector('.wax');if(w)w.insertAdjacentHTML('beforebegin',h);else fr.insertAdjacentHTML('beforeend',h);
});
var firmaAlbaran=ok(function(){
 var a=D.querySelector('#pedBody .albaran');if(!a||a.querySelector('.rc-firma'))return;
 var x=null;try{x=pendingPed().find(function(p){return p.id===pedView})}catch(e){}
 var f=x&&firmaDe(x.by);
 a.insertAdjacentHTML('beforeend','<div class="rc-firma alb">'+(f?'<img class="fi" src="'+f+'" alt="">':'')+'<img class="se" src="sello-harrington.webp" alt=""></div>');
});

/* ===================== 13) Poste roto cuando se va la conexión ===================== */
(function(){var nb=D.getElementById('netBar');if(nb&&!nb.querySelector('.poste'))nb.insertAdjacentHTML('afterbegin','<span class="poste" aria-hidden="true"></span>')})();

/* ===================== 14) Lluvia en los ventanales de noche y profundidad en la portada ===================== */
var hero=D.querySelector('.hero-banner'), himg=hero&&hero.querySelector('img'), lluv=null;
function cajaImg(){
 var cs=getComputedStyle(himg), bw=himg.clientWidth, bh=himg.clientHeight, nw=himg.naturalWidth, nh=himg.naturalHeight;if(!nw||!bw)return null;
 var fit=cs.objectFit, s=fit==='contain'?Math.min(bw/nw,bh/nh):fit==='cover'?Math.max(bw/nw,bh/nh):null;
 var pos=(cs.objectPosition||'50% 50%').split(/\s+/), px=(parseFloat(pos[0])||50)/100, py=(parseFloat(pos[1])||50)/100;
 var sx=s||bw/nw, sy=s||bh/nh;return {l:himg.offsetLeft+himg.clientLeft,t:himg.offsetTop+himg.clientTop,w:bw,h:bh,ox:(bw-nw*sx)*px,oy:(bh-nh*sy)*py,iw:nw*sx,ih:nh*sy};
}
function diaDeLluvia(){var t=0;try{t=todayNum()}catch(e){t=Math.floor(Date.now()/864e5)}if(H.dataset.lluvia==='si')return true;if(H.dataset.lluvia==='no')return false;return ((t*7919)%10)<4}
var VENT={ancha:[82,4,18,58],movil:[89,10,11,55]};
var lluvia=ok(function(){
 if(lluv){lluv.remove();lluv=null}
 if(!hero||!himg)return;var f='atardecer';try{f=hgFranja()}catch(e){}
 if(f!=='noche'||!diaDeLluvia()||calm())return;
 var c=cajaImg();if(!c)return;var v=VENT[/ancha/.test(himg.currentSrc||himg.src)?'ancha':'movil'];
 var x=c.ox+v[0]/100*c.iw, y=c.oy+v[1]/100*c.ih, w=v[2]/100*c.iw, h=v[3]/100*c.ih;
 x=Math.max(0,x);w=Math.min(w,c.w-x);if(w<8)return;
 lluv=el('div','hero-lluvia','<i class="gotas"></i><i class="gotas g2"></i><i class="rayo-l"></i>');lluv.setAttribute('aria-hidden','true');
 lluv.style.cssText='left:'+(c.l+x)+'px;top:'+(c.t+Math.max(0,y))+'px;width:'+w+'px;height:'+h+'px';
 hero.appendChild(lluv);
});
if(himg){
 himg.addEventListener('load',function(){setTimeout(lluvia,50)});if(himg.complete)setTimeout(lluvia,50);
 var rl=0;addEventListener('resize',function(){clearTimeout(rl);rl=setTimeout(lluvia,250)});
 setInterval(function(){if(!D.hidden)lluvia()},300000);
 var tb=D.getElementById('themeBtn');if(tb)tb.addEventListener('click',function(){setTimeout(lluvia,2200)});
 /* profundidad: la luz y el polvo se mueven un poco con el ratón o al inclinar el móvil */
 var mueve=function(nx,ny){if(calm())return;hero.style.setProperty('--hx',Math.max(-1,Math.min(1,nx)).toFixed(3));hero.style.setProperty('--hy',Math.max(-1,Math.min(1,ny)).toFixed(3))};
 hero.addEventListener('pointermove',function(ev){var r=hero.getBoundingClientRect();mueve((ev.clientX-r.left)/r.width*2-1,(ev.clientY-r.top)/r.height*2-1)});
 hero.addEventListener('pointerleave',function(){mueve(0,0)});
 addEventListener('deviceorientation',function(ev){if(ev.gamma==null)return;mueve(ev.gamma/30,(ev.beta-45)/30)},{passive:true});
}
window.hgLluvia=function(si){H.dataset.lluvia=si?'si':'no';lluvia();return !!lluv};

/* ===================== 15) Cambiar de categoría como quien pasa una página ===================== */
(function(){var im=D.getElementById('categoryImage');if(!im)return;var antes=im.getAttribute('src');
 new MutationObserver(ok(function(){var a=im.getAttribute('src');if(a&&antes&&a!==antes&&!calm()){var p=im.closest('.category-visual');p.classList.remove('pasa');void p.offsetWidth;p.classList.add('pasa');setTimeout(function(){p.classList.remove('pasa')},800)}antes=a})).observe(im,{attributes:true,attributeFilter:['src']});
})();

/* ===================== 16) El cartel de AGOTADO cae de golpe ===================== */
(function(){var listo=false;setTimeout(function(){listo=true},6000);
 new MutationObserver(ok(function(ms){
  if(!listo||calm())return;
  var nuevos=ms.filter(function(m){return m.target.classList&&m.target.classList.contains('nostock')&&m.oldValue!==null&&!m.target.hidden});
  if(!nuevos.length||nuevos.length>3)return;
  nuevos.forEach(function(m){var n=m.target;n.classList.remove('cae');void n.offsetWidth;n.classList.add('cae');setTimeout(function(){n.classList.remove('cae')},1200)});
 })).observe(D.body,{subtree:true,attributes:true,attributeFilter:['hidden'],attributeOldValue:true});
})();

/* ===================== Un solo vigilante para lo que se pinta de nuevo ===================== */
var pend=null;
function repasar(){pend=null;escenasDir();corcho();calendario();mapa();medallas(D.body);firmaAlbaran()}
new MutationObserver(function(){if(!pend)pend=(window.requestAnimationFrame||setTimeout)(repasar)}).observe(D.body,{childList:true,subtree:true});
repasar();
(function(){var rm=D.getElementById('receiptModal');if(!rm)return;var antes=rm.hidden;new MutationObserver(function(){if(antes&&!rm.hidden)setTimeout(firmaTicket,0);antes=rm.hidden}).observe(rm,{attributes:true,attributeFilter:['hidden']});
 var e=D.getElementById('rcEmp');if(e)new MutationObserver(function(){firmaTicket()}).observe(e,{childList:true,characterData:true,subtree:true})})();
})();
