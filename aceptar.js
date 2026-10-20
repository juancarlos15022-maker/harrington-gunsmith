/* 20/10/2026 · Página del botón «Aceptar propuesta» del privado de Discord: acepta la propuesta de pedido automático
   con su enlace secreto y muestra el telegrama para el proveedor (el mismo que llega al privado). */
(function(){
'use strict';
var URL_='https://mrlpvjxuifvspeaqtscm.supabase.co/functions/v1/harrington-reposicion';
var hoja=document.getElementById('hoja'), carga=document.getElementById('carga');
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function money(c){return '$'+(Number(c||0)/100).toFixed(2)}
function pinta(html){carga.remove();hoja.insertAdjacentHTML('beforeend',html)}
/* imagen del albarán (se manda al privado junto al telegrama) */
function cargaImg(src){return new Promise(function(ok){var i=new Image();i.onload=function(){ok(i)};i.onerror=function(){ok(null)};i.src=src})}
function albaran(j){
 var items=j.itemsPrecio&&j.itemsPrecio.length?j.itemsPrecio:(j.items||[]), W=900, H=540+items.length*44;
 return Promise.all([document.fonts?document.fonts.ready:Promise.resolve(),cargaImg('sello-harrington.webp'),cargaImg('firma-vincent.webp')]).then(function(r){
  var sello=r[1],firma=r[2],cv=document.createElement('canvas');cv.width=W;cv.height=H;var x=cv.getContext('2d');
  var g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'#f4e9cc');g.addColorStop(1,'#e6d3a6');x.fillStyle=g;x.fillRect(0,0,W,H);
  var rg=x.createRadialGradient(W/2,H/2,H*.2,W/2,H/2,H*.9);rg.addColorStop(0,'rgba(0,0,0,0)');rg.addColorStop(1,'rgba(110,80,30,.28)');x.fillStyle=rg;x.fillRect(0,0,W,H);
  x.strokeStyle='#8b6a2e';x.lineWidth=3;x.strokeRect(18,18,W-36,H-36);x.lineWidth=1;x.strokeRect(26,26,W-52,H-52);
  x.textAlign='center';x.fillStyle='#5a1d10';x.font='40px Rye, Georgia, serif';x.fillText('HARRINGTON GUNSMITH',W/2,86);
  x.fillStyle='#4a3216';x.font='italic 20px "IM Fell English", Georgia, serif';x.fillText('Saint Denis · 1880 · El precio de un apellido',W/2,116);
  x.font='bold 22px Georgia, serif';x.fillStyle='#2a1a0d';x.fillText('ALBARÁN DE PEDIDO',W/2,158);
  x.textAlign='left';x.font='18px Georgia, serif';x.fillStyle='#3a2610';
  x.fillText('Proveedor: '+(j.proveedor||'')+(j.proveedorTel?' · Telegrama '+j.proveedorTel:''),60,196);
  x.fillText((j.code?j.code+' · ':'')+(j.fecha||''),60,222);
  var y=262;x.font='bold 16px Georgia, serif';x.fillText('MATERIAL',60,y);x.textAlign='right';x.fillText('CANT.',560,y);x.fillText('P. UNIT.',700,y);x.fillText('SUBTOTAL',840,y);
  x.strokeStyle='#8b6a2e';x.beginPath();x.moveTo(56,y+10);x.lineTo(W-56,y+10);x.stroke();
  x.font='19px "IM Fell English", Georgia, serif';var tot=0;
  items.forEach(function(i){y+=44;var pr=Number(i.price||0),q=Number(i.qty||0);tot+=pr*q;x.textAlign='left';x.fillText(String(i.material),60,y);x.textAlign='right';x.fillText(String(q),560,y);
   if(pr){x.fillText(money(pr),700,y);x.fillText(money(pr*q),840,y)}
   x.strokeStyle='rgba(139,106,46,.35)';x.beginPath();x.moveTo(56,y+14);x.lineTo(W-56,y+14);x.stroke()});
  y+=54;x.strokeStyle='#8b6a2e';x.lineWidth=2;x.beginPath();x.moveTo(520,y-30);x.lineTo(W-56,y-30);x.stroke();
  x.font='bold 24px Georgia, serif';x.textAlign='left';x.fillText('TOTAL',520,y);x.textAlign='right';x.fillText(money(j.totalCents||tot),840,y);
  x.textAlign='left';x.font='italic 17px "IM Fell English", Georgia, serif';x.fillText('Se paga al recibir la mercancía en la armería.',60,y+44);
  x.fillText('Aceptado por '+(j.aceptadoPor||'Vincent Harrington')+'.',60,y+70);
  if(firma)x.drawImage(firma,480,y+40,220,220*firma.height/firma.width);
  if(sello){x.globalAlpha=.85;x.drawImage(sello,W-190,H-185,135,135);x.globalAlpha=1}
  return cv.toDataURL('image/png');
 });
}
var t=(new URLSearchParams(location.search).get('t')||'').toLowerCase();
try{history.replaceState(null,'',location.pathname)}catch(e){}
if(!/^[0-9a-f]{64}$/.test(t)){pinta('<div class="est mal">Este enlace no es válido. Ábrelo desde el botón <b>Aceptar propuesta</b> de tu privado de Discord.</div>');return}
fetch(URL_,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'aceptar',token:t})})
 .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
 .then(function(x){
  var j=x.j||{};
  if(!x.ok){pinta('<div class="est mal">'+(j.error==='PROPUESTA_NO_EXISTE'?'Esta propuesta ya no existe.':j.error==='DEMASIADOS_INTENTOS'?'Demasiados intentos seguidos. Espera un minuto y vuelve a pulsar el botón.':'No se ha podido aceptar ahora. Vuelve a pulsar el botón en un momento.')+'</div>');return}
  var lista='<ul>'+(j.items||[]).map(function(i){return '<li>'+esc(i.qty)+' × '+esc(i.material)+'</li>'}).join('')+'</ul>';
  if(j.cerrado&&!j.telegrama){pinta('<p class="sub">'+esc(j.proveedor)+'</p><div class="est mal">'+(j.motivo==='sin-faltas'?'Esta propuesta se anuló sola: el almacén volvió a estar por encima de los mínimos.':'Este pedido ya está cerrado (recibido o cancelado).')+'</div>'+lista);return}
  if(!j.telegrama){pinta('<p class="sub">'+esc(j.proveedor)+'</p><div class="est mal">Este pedido ya se pagó o se recibió en parte desde la web: ya no es una propuesta.</div>'+lista);return}
  pinta('<p class="sub">'+esc(j.proveedor)+' · '+money(j.totalCents)+'</p><div class="est">'+(j.ya?'Esta propuesta ya estaba aceptada.':'<b>Propuesta aceptada.</b> El pedido queda cerrado: ya no se le suman más materiales.')+' El telegrama también está en tu privado de Discord.</div>'+lista+
   '<b>Telegrama para el proveedor</b><pre id="tel">'+esc(j.telegrama)+'</pre><button type="button" id="copiar">COPIAR TELEGRAMA</button><p class="pie">Harrington Gunsmith · Saint Denis · 1880</p>');
  // el albarán se ve también aquí (y se puede descargar); al privado solo se manda la primera vez
  Promise.resolve().then(function(){return albaran(j)}).then(function(png){
   hoja.insertAdjacentHTML('beforeend','<b>Albarán</b><img id="alb" alt="Albarán del pedido" style="display:block;width:100%;height:auto;margin:8px 0;border:1px solid #8a6a2e"><a id="bajar" download="Albaran_'+esc(j.code||'pedido')+'.png" style="display:inline-block;margin:4px 0 10px;color:#5a2a0e;font-weight:bold">⬇ DESCARGAR ALBARÁN</a>');
   document.getElementById('alb').src=png;document.getElementById('bajar').href=png;
   if(j.imagen)return null;
   return fetch(URL_,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'imagen',token:t,png:png})});
  }).then(function(r){if(r&&r.ok)hoja.insertAdjacentHTML('beforeend','<p class="pie">🧾 La imagen del albarán ya está en tu privado.</p>')}).catch(function(){});
  document.getElementById('copiar').onclick=function(){var b=this,txt=j.telegrama;
   (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(function(){b.textContent='✓ COPIADO'},function(){var r=document.createRange();r.selectNodeContents(document.getElementById('tel'));var s=getSelection();s.removeAllRanges();s.addRange(r);b.textContent='SELECCIONADO: COPIA CON CTRL+C'})};
 })
 .catch(function(){pinta('<div class="est mal">Sin conexión. Vuelve a pulsar el botón cuando tengas internet.</div>')});
})();
