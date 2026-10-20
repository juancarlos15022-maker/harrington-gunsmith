/* 20/10/2026 · Página del botón «Aceptar propuesta» del privado de Discord: acepta la propuesta de pedido automático
   con su enlace secreto y muestra el telegrama para el proveedor (el mismo que llega al privado). */
(function(){
'use strict';
var URL_='https://mrlpvjxuifvspeaqtscm.supabase.co/functions/v1/harrington-reposicion';
var hoja=document.getElementById('hoja'), carga=document.getElementById('carga');
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function money(c){return '$'+(Number(c||0)/100).toFixed(2)}
function pinta(html){carga.remove();hoja.insertAdjacentHTML('beforeend',html)}
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
  document.getElementById('copiar').onclick=function(){var b=this,txt=j.telegrama;
   (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(function(){b.textContent='✓ COPIADO'},function(){var r=document.createRange();r.selectNodeContents(document.getElementById('tel'));var s=getSelection();s.removeAllRanges();s.addRange(r);b.textContent='SELECCIONADO: COPIA CON CTRL+C'})};
 })
 .catch(function(){pinta('<div class="est mal">Sin conexión. Vuelve a pulsar el botón cuando tengas internet.</div>')});
})();
