/* Gobierno de Silver Peak · web del despacho (22/10/2026).
   Entrada con el enlace de /acceso del Sr. Whitmore. Los datos son los mismos que maneja Whitmore en Discord:
   lo que se hace aquí se publica también en los canales de gobierno. */
(function(){
'use strict';
var API='https://mrlpvjxuifvspeaqtscm.supabase.co/functions/v1/discord-whitmore', KS='gob_sesion';
var D=document, $=function(s,r){return (r||D).querySelector(s)}, $$=function(s,r){return [].slice.call((r||D).querySelectorAll(s))};
var vista=$('#vista'), YO=null, cache={};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function store(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){return null}}
var MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],DIAS=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
function fechaMadrid(ms){return new Date(new Date(ms).toLocaleString('en-US',{timeZone:'Europe/Madrid'}))}
function hm(ms){var d=fechaMadrid(ms);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function diaLargo(ms){var d=fechaMadrid(ms);return DIAS[d.getDay()]+' '+d.getDate()+' de '+MESES[d.getMonth()]}
function fechaCorta(ms){var d=fechaMadrid(ms);return d.getDate()+'/'+(d.getMonth()+1)}
function dolar(c){c=Number(c||0);return (c<0?'−':'')+'$'+(Math.abs(c)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function inicioDia(ms){var d=new Date(ms==null?Date.now():ms);d.setHours(0,0,0,0);return d.getTime()}
function aviso(t,mal){var e=$('#toast');e.textContent=t;e.className='toast'+(mal?' mal':'');e.hidden=false;clearTimeout(aviso.t);aviso.t=setTimeout(function(){e.hidden=true},mal?6000:3500)}
var ERR={FECHA:'No entiendo la fecha o la hora.',FALTAN_DATOS:'Faltan datos por rellenar.',FALTA_CON:'Escriba con quién es la cita.',SIN_PERMISO:'Eso solo lo puede hacer el Gobernador.',YA_FIRMADO:'Ese documento ya estaba firmado.',YA_CONTESTADA:'Esa audiencia ya estaba contestada.',NO_EXISTE:'Ya no existe.',ERROR:'Ha habido un problema. Inténtelo de nuevo.',RED:'Sin conexión. Inténtelo de nuevo.'};

/* ---------- conexión ---------- */
function api(accion,datos){
 var cuerpo=Object.assign({web:true,accion:accion,sesion:store(KS)||''},datos||{});
 return fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cuerpo)})
  .then(function(r){return r.json().catch(function(){return {ok:false,error:'ERROR'}}).then(function(j){
   if(j&&(j.error==='SIN_SESION'||j.error==='SIN_ROL')){store(KS,null);mostrarEntrada(j.error==='SIN_ROL'?'Su rol del Consejo de Gobierno ya no está en Discord, así que se ha cerrado la sesión.':'Su sesión ha caducado. Escriba /acceso en Discord para volver a entrar.');throw j}
   if(!j.ok)throw j;if(j.yo){YO=j.yo;pintarYo()}if(j.avisos)setTimeout(function(){aviso(j.avisos.join(' '),true)},100);return j})},function(){throw {error:'RED'}});
}
function fallo(e){if(e&&(e.error==='SIN_SESION'||e.error==='SIN_ROL'))return;aviso(e&&e.detalle||ERR[e&&e.error]||ERR.ERROR,true)}

/* ---------- entrada ---------- */
function mostrarEntrada(msg){$('#app').hidden=true;$('#entrada').hidden=false;var m=$('#entradaMsg');m.hidden=!msg;m.className='aviso';if(msg)m.textContent=msg}
function arrancar(){
 var t=(new URLSearchParams(location.search).get('t')||'').toLowerCase();
 if(t){try{history.replaceState(null,'',location.pathname+location.hash)}catch(e){}
  fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({web:true,accion:'entrar',t:t})})
   .then(function(r){return r.json()}).then(function(j){
    if(!j.ok)return mostrarEntrada(j.error==='ENLACE_CADUCADO'?'Ese enlace ya se usó o ha caducado (dura 10 minutos). Escriba /acceso en Discord para pedir otro.':j.error==='SIN_ROL'?'Su usuario de Discord no tiene ningún rol del Consejo de Gobierno.':'Ese enlace no es válido. Escriba /acceso en Discord para pedir otro.');
    store(KS,j.sesion);YO=j.yo;abrirApp();
   }).catch(function(){mostrarEntrada('Sin conexión. Vuelva a pulsar el botón de Discord cuando tenga internet.')});
  return;
 }
 if(!store(KS))return mostrarEntrada();
 abrirApp();
}
function abrirApp(){api('yo').then(function(){ $('#entrada').hidden=true;$('#app').hidden=false;if(!location.hash)location.hash='#despacho';else ruta();pintarYo()}).catch(fallo)}
function pintarYo(){if(!YO)return;$('#yo').innerHTML=(YO.avatar?'<img src="'+esc(YO.avatar)+'" alt="">':'')+'<div>'+esc(YO.nombre)+'<small>'+esc(YO.cargo)+'</small></div>'}
$('#salir').onclick=function(){api('salir').catch(function(){}).then(function(){store(KS,null);YO=null;mostrarEntrada('Ha cerrado la sesión.');$('#entradaMsg').className='aviso bien'})};
var esGob=function(){return YO&&(YO.roles.gobernador||YO.roles.admin)};

/* ---------- rutas ---------- */
var VISTAS={despacho:vDespacho,agenda:vAgenda,documentos:vDocumentos,telegramas:vTelegramas,campana:vCampana};
function ruta(){
 var v=(location.hash||'#despacho').slice(1).split('/')[0];if(!VISTAS[v])v='despacho';
 $$('.menu a').forEach(function(a){a.classList.toggle('on',a.dataset.v===v)});
 vista.innerHTML='<p class="cargando">Cargando…</p>';VISTAS[v]();try{vista.focus({preventScroll:true})}catch(e){}
}
window.addEventListener('hashchange',ruta);
function cab(pre,titulo,lado){var e=(location.hash||'#despacho').slice(1).split('/')[0];return '<div class="cab" data-e="'+esc(VISTAS[e]?e:'despacho')+'"><div><div class="pre">'+pre+'</div><h1>'+titulo+'</h1><img class="sep" src="img/separador.webp" alt="" width="230" height="39"></div>'+(lado?'<div class="lado">'+lado+'</div>':'')+'</div>'}
function vacioImg(img,txt){return '<div class="vacio-img"><img src="img/'+img+'" alt="" width="110" height="74">'+txt+'</div>'}
function plural(n,uno,varios){return n+' '+(n===1?uno:varios)}
function saludo(){var h=new Date().getHours();return h>=6&&h<14?'Buenos días':h>=14&&h<21?'Buenas tardes':'Buenas noches'}
var COL={cita:'var(--cita)',reunion:'var(--reunion)',acto:'var(--acto)'};
function evTitulo(e){return e.tipo==='cita'?e.datos.con:e.tipo==='reunion'?'Reunión: '+e.datos.titulo:'Campaña: '+e.datos.titulo}
function evSub(e){return [e.datos.lugar,e.tipo==='cita'?e.datos.motivo:'',e.tipo==='reunion'&&e.datos.orden?'Orden del día: '+e.datos.orden.split(';').map(function(s){return s.trim()}).filter(Boolean).join(', '):''].filter(Boolean).join(' · ')}

/* ---------- despacho ---------- */
function vDespacho(){
 api('despacho').then(function(j){
  YO=j.yo;pintarYo();cache.despacho=j;
  var faltan=j.elecciones>Date.now()?Math.ceil((j.elecciones-Date.now())/86400000):null;
  var h='';
  h+=cab('DESPACHO DEL '+(YO.roles.gobernador?'GOBERNADOR':'GOBIERNO'),saludo()+', '+esc(YO.nombre.split(' ')[0]),esc(diaLargo(Date.now())));
  h+='<div class="cifras">'+
   '<div class="tarjeta cifra"><img src="img/i-reloj.webp" alt="" width="40" height="62"><div class="et">Elecciones</div><div class="num oro">'+(faltan!=null?faltan+(faltan===1?' día':' días'):'—')+'</div><div class="et">'+(faltan!=null?esc(diaLargo(j.elecciones)):'Sin fecha: /elecciones fijar')+'</div></div>'+
   '<div class="tarjeta cifra"><img src="img/i-pluma.webp" alt="" width="62" height="62"><div class="et">Por firmar</div><div class="num">'+j.borradores.length+'</div><div class="et">documentos</div></div>'+
   '<div class="tarjeta cifra"><img src="img/i-llave.webp" alt="" width="62" height="62"><div class="et">Audiencias</div><div class="num">'+j.audiencias.length+'</div><div class="et">por contestar</div></div>'+
   (j.saldo!=null?'<div class="tarjeta cifra"><img src="img/i-moneda.webp" alt="" width="62" height="62"><div class="et">Saldo</div><div class="num">'+dolar(j.saldo)+'</div><div class="et">cuentas del gobierno</div></div>':'<div class="tarjeta cifra"><img src="img/i-calendario.webp" alt="" width="62" height="62"><div class="et">Tareas</div><div class="num">'+j.tareas.length+'</div><div class="et">pendientes</div></div>')+
   '</div>';
  h+=notaWhitmore(j);
  // agenda de los próximos días
  var porDia={},orden=[];j.agenda.forEach(function(e){var k=inicioDia(e.cuando);if(!porDia[k]){porDia[k]=[];orden.push(k)}porDia[k].push(e)});
  var ag=orden.length?orden.map(function(k){return '<div class="dia-t">'+(k===inicioDia()?'HOY':esc(diaLargo(k)).toUpperCase())+'</div>'+porDia[k].map(function(e){return '<div class="ev"><span class="marca-t" style="background:'+COL[e.tipo]+'"></span><div class="hora">'+hm(e.cuando)+'</div><div><div class="t">'+esc(evTitulo(e))+'</div><div class="s">'+esc(evSub(e))+'</div></div></div>'}).join('')}).join(''):vacioImg('v-pergamino.webp','Nada en la agenda de los próximos 7 días.');
  var esp='';
  j.borradores.forEach(function(d){esp+='<div class="item"><div class="cuerpo"><img class="ico" src="img/i-pluma.webp" alt="" width="40" height="40"><div><div class="t">'+esc(cap(d.datos.clase))+': '+esc(d.datos.titulo)+'</div><div class="s">Redactado por '+esc(d.autor)+'</div></div></div><a class="btn oro" href="#documentos/'+d.id+'">'+(esGob()?'Revisar y firmar':'Ver')+'</a></div>'});
  j.audiencias.forEach(function(a){esp+='<div class="item" data-aud="'+a.id+'"><div class="cuerpo" style="align-items:flex-start"><img class="ico" src="img/i-llave.webp" alt="" width="40" height="40"><div style="min-width:0;flex:1"><div class="t">Audiencia: '+esc(a.datos.quien)+'</div><div class="s">'+esc(a.datos.motivo)+(a.datos.cuando?' · le vendría bien: '+esc(a.datos.cuando):'')+'</div><div class="aud-form"></div></div></div>'+(esGob()?'<div class="acciones"><button type="button" class="btn verde" data-aud-ok="'+a.id+'">Aceptar</button><button type="button" class="btn rojo" data-aud-no="'+a.id+'">Rechazar</button></div>':'<span class="etq">Espera al Gobernador</span>')+'</div>'});
  j.propuestas.forEach(function(p){var mio=p.si.indexOf(YO.nombre)>=0?'si':p.no.indexOf(YO.nombre)>=0?'no':'';esp+='<div class="item"><div class="cuerpo"><img class="ico" src="img/i-pergamino.webp" alt="" width="40" height="40"><div style="min-width:0"><div class="t">Propuesta: '+esc(p.datos.titulo)+'</div><div class="s">'+p.si.length+' a favor · '+p.no.length+' en contra</div></div></div><div class="acciones"><button type="button" class="btn'+(mio==='si'?' verde':'')+'" data-vota="'+p.id+':si">A favor</button><button type="button" class="btn'+(mio==='no'?' rojo':'')+'" data-vota="'+p.id+':no">En contra</button>'+(esGob()?'<button type="button" class="btn" data-cierra="'+p.id+'">Cerrar votación</button>':'')+'</div></div>'});
  if(!esp)esp=vacioImg('v-pergamino.webp','Nada pendiente. Todo al día.');
  var tar=j.tareas.length?j.tareas.map(function(t){return '<div class="item"><div><div class="t" style="font-weight:400">'+esc(t.datos.texto)+'</div><div class="s">'+esc(t.datos.paraNombre||'')+(t.cuando?' · plazo '+esc(fechaCorta(t.cuando)):'')+'</div></div></div>'}).join(''):'<p class="vacio">No hay tareas pendientes. Se encargan con /tarea nueva.</p>';
  var tel=j.telegramas.length?j.telegramas.map(function(t){var e=t.datos.sentido==='entrada';return '<div class="item"><div class="cuerpo"><img class="ico" src="img/'+(e?(t.datos.respondido?'i-sobre-abierto':'i-sobre'):'i-telegrafo')+'.webp" alt="" width="40" height="40"><div style="min-width:0"><div class="t" style="font-weight:400">'+(e?'De <b>'+esc(t.datos.de)+'</b>':'Para <b>'+esc(t.datos.para)+'</b>')+'</div><div class="s">'+esc(fechaCorta(t.creado))+(e?(t.datos.respondido?' · respondido':' · sin responder'):' · enviado')+'</div></div></div>'+(e&&!t.datos.respondido?'<a class="btn" href="#telegramas/'+t.id+'">Responder</a>':'')+'</div>'}).join(''):vacioImg('v-telegrafo.webp','Todavía no hay telegramas.');
  h+='<div class="fila"><section class="tarjeta"><div class="tit"><h2>Próximos días</h2><a href="#agenda">Ver agenda</a></div>'+ag+'</section><section class="tarjeta"><h2>Esperan una decisión</h2>'+esp+'</section></div>';
  h+='<div class="fila"><section class="tarjeta"><h2>Tareas del equipo</h2>'+tar+'</section><section class="tarjeta"><div class="tit"><h2>Últimos telegramas</h2><a href="#telegramas">Ver todos</a></div>'+tel+'</section></div>';
  vista.innerHTML=h;
 }).catch(fallo);
}
function notaWhitmore(j){
 var hoy=j.agenda.filter(function(e){return inicioDia(e.cuando)===inicioDia()}),fr=[];
 if(hoy.length)fr.push('Hoy tiene <b>'+plural(hoy.length,'compromiso','compromisos')+'</b> en la agenda; el primero, '+esc(evTitulo(hoy[0]))+' a las '+hm(hoy[0].cuando)+'.');
 else fr.push('Hoy no hay nada apuntado en la agenda.');
 var pend=[];if(j.borradores.length)pend.push(plural(j.borradores.length,'documento por firmar','documentos por firmar'));if(j.audiencias.length)pend.push(plural(j.audiencias.length,'audiencia por contestar','audiencias por contestar'));if(j.propuestas.length)pend.push(plural(j.propuestas.length,'propuesta en votación','propuestas en votación'));
 fr.push(pend.length?'Le esperan <b>'+pend.join(', ').replace(/, ([^,]*)$/,' y $1')+'</b>.':'No hay nada esperando su decisión.');
 var sin=j.telegramas.filter(function(t){return t.datos.sentido==='entrada'&&!t.datos.respondido}).length;if(sin)fr.push('Hay '+plural(sin,'telegrama sin responder','telegramas sin responder')+'.');
 if(j.elecciones>Date.now()){var d=Math.ceil((j.elecciones-Date.now())/86400000);fr.push('Quedan '+plural(d,'día','días')+' para las elecciones.')}
 return '<section class="tarjeta whitmore"><div class="retrato gr"><img class="cara" src="img/whitmore.webp" alt="Sr. Whitmore" width="74" height="104"><img class="marco" src="img/marco-ovalado.webp" alt="" width="112" height="148"></div><div class="nota-p">'+fr.join(' ')+'<span class="firma-w">Whitmore</span></div></section>';
}
function cap(s){s=String(s||'');return s.charAt(0).toUpperCase()+s.slice(1)}
vista.addEventListener('click',function(e){
 var b=e.target.closest('button');if(!b)return;
 if(b.dataset.audOk||b.dataset.audNo){
  var id=b.dataset.audOk||b.dataset.audNo,ok=!!b.dataset.audOk,box=$('[data-aud="'+id+'"] .aud-form');
  box.innerHTML=ok?'<div class="mini-form"><div class="dos"><label class="campo">Día<input type="text" name="f" placeholder="25/10" inputmode="numeric"></label><label class="campo">Hora<input type="time" name="h" value="18:00"></label></div><label class="campo">Lugar<input name="l" maxlength="100" placeholder="Despacho, Ayuntamiento…"></label><div class="acciones"><button type="button" class="btn verde" data-aud-si="'+id+'">Aceptar y apuntar</button></div></div>'
   :'<div class="mini-form"><label class="campo">Motivo (opcional)<input name="r" maxlength="400"></label><div class="acciones"><button type="button" class="btn rojo" data-aud-rechaza="'+id+'">Rechazar audiencia</button></div></div>';
  return;
 }
 if(b.dataset.audSi){var f=b.closest('.mini-form'),fe=$('[name=f]',f).value,ho=$('[name=h]',f).value;if(!fe||!ho)return aviso('Ponga el día y la hora.',true);var p=fe.split('-');b.disabled=true;
  api('audiencia_decidir',{id:Number(b.dataset.audSi),aceptar:true,fecha:fe.indexOf('-')>=0?p[2]+'/'+p[1]+'/'+p[0]:fe,hora:ho,lugar:$('[name=l]',f).value}).then(function(j){mostrarTelegrama('Audiencia aceptada y apuntada en la agenda. Telegrama para avisarle:',j.telegrama)}).catch(function(x){b.disabled=false;fallo(x)});return}
 if(b.dataset.audRechaza){b.disabled=true;api('audiencia_decidir',{id:Number(b.dataset.audRechaza),aceptar:false,razon:$('[name=r]',b.closest('.mini-form')).value}).then(function(){aviso('Audiencia rechazada.');vDespacho()}).catch(function(x){b.disabled=false;fallo(x)});return}
 if(b.dataset.vota){var v=b.dataset.vota.split(':');b.disabled=true;api('propuesta_votar',{id:Number(v[0]),voto:v[1]}).then(function(){aviso('Voto apuntado.');vDespacho()}).catch(function(x){b.disabled=false;fallo(x)});return}
 if(b.dataset.cierra){b.disabled=true;api('propuesta_cerrar',{id:Number(b.dataset.cierra)}).then(function(j){aviso(j.estado==='aprobada'?'Propuesta aprobada: pasa al programa.':'Propuesta rechazada.');vDespacho()}).catch(function(x){b.disabled=false;fallo(x)});return}
});
function mostrarTelegrama(titulo,texto){
 vista.insertAdjacentHTML('afterbegin','<section class="tarjeta" id="telListo"><h2>'+esc(titulo)+'</h2><div class="telegrama"><div class="te"><span class="izq"><img src="img/i-telegrafo.webp" alt="" width="46" height="30">TELEGRAMA</span><small>Gobierno de Silver Peak</small></div><pre>'+esc(texto)+'</pre></div><div class="acciones"><button type="button" class="btn oro" id="copTel">Copiar telegrama</button><button type="button" class="btn" id="cerTel">Cerrar</button></div></section>');
 $('#copTel').onclick=function(){copiar(texto,this)};$('#cerTel').onclick=function(){vDespacho()};window.scrollTo({top:0,behavior:'smooth'});
}
function copiar(t,b){(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){if(b)b.textContent='Copiado';aviso('Copiado.')},function(){aviso('No se ha podido copiar: selecciónelo a mano.',true)})}

/* ---------- agenda ---------- */
var semana=0;
function lunes(off){var d=new Date();d.setHours(0,0,0,0);var w=(d.getDay()+6)%7;d.setDate(d.getDate()-w+off*7);return d.getTime()}
function vAgenda(){
 var l=lunes(semana),fin=l+7*86400000;
 api('agenda',{desde:l,hasta:fin}).then(function(j){
  var d0=new Date(l),d6=new Date(fin-86400000);
  var h=cab('AGENDA DEL GOBERNADOR','Semana del '+d0.getDate()+(d0.getMonth()!==d6.getMonth()?' de '+MESES[d0.getMonth()]:'')+' al '+d6.getDate()+' de '+MESES[d6.getMonth()],'<div class="acciones"><button type="button" class="btn" id="semAnt" aria-label="Semana anterior">‹</button><button type="button" class="btn" id="semHoy">Hoy</button><button type="button" class="btn" id="semSig" aria-label="Semana siguiente">›</button></div>');
  var cols='';for(var i=0;i<7;i++){var k=l+i*86400000,dd=new Date(k),evs=j.agenda.filter(function(e){return inicioDia(e.cuando)===inicioDia(k)});
   cols+='<div class="col'+(inicioDia()===inicioDia(k)?' hoy':'')+'"><div class="cab-d'+(inicioDia()===inicioDia(k)?' laton':'')+'">'+DIAS[dd.getDay()].slice(0,3).toUpperCase()+'<b>'+dd.getDate()+'</b></div>'+evs.map(function(e){return '<button type="button" class="evb '+e.tipo+(e.estado==='cancelada'?' cancelada':'')+'" data-ev="'+e.id+'"><b>'+hm(e.cuando)+'</b> '+esc(evTitulo(e))+'</button>'}).join('')+'</div>'}
  h+='<div class="fila"><div style="flex:999 1 560px;min-width:0;display:flex;flex-direction:column;gap:12px"><div class="semana-caja"><div class="semana">'+cols+'</div></div><div class="leyenda"><span><i style="background:var(--cita-t)"></i>Citas</span><span><i style="background:var(--reunion-t)"></i>Reuniones (/reunion nueva)</span><span><i style="background:var(--acto-t)"></i>Campaña (/acto nuevo)</span></div><section class="tarjeta" id="evDet" hidden></section></div>';
  h+='<aside class="tarjeta" style="flex:1 1 300px"><div class="pestanas"><button type="button" class="btn on" data-pest="cita">Nueva cita</button><button type="button" class="btn" data-pest="aud">Audiencia</button></div>'+
   '<form id="fCita" class="mini-form" style="background:transparent;border:0;padding:0" novalidate><label class="campo">Con quién<input name="con" maxlength="100" required placeholder="Nombre o cargo"></label><div class="dos"><label class="campo">Día<input type="text" name="f" placeholder="25/10" inputmode="numeric" required></label><label class="campo">Hora<input type="time" name="h" value="18:00" required></label></div><label class="campo">Lugar<input name="lugar" maxlength="100" placeholder="Despacho, Ayuntamiento…"></label><label class="campo">Motivo<textarea name="motivo" rows="3" maxlength="300"></textarea></label><button type="submit" class="btn oro">Apuntar en la agenda</button><p class="nota" style="margin:0;font-size:15px">Se publica también en #agenda-y-reuniones y el Sr. Whitmore avisa una hora antes.</p></form>'+
   '<form id="fAud" class="mini-form" style="background:transparent;border:0;padding:0" hidden novalidate><label class="campo">Quién la pide<input name="quien" maxlength="100" required></label><label class="campo">Para qué<textarea name="motivo" rows="3" maxlength="400" required></textarea></label><div class="dos"><label class="campo">Su telegrama<input name="telegrama" maxlength="20"></label><label class="campo">Le vendría bien<input name="cuando" maxlength="60" placeholder="p. ej. el viernes"></label></div><button type="submit" class="btn oro">Apuntar la solicitud</button><p class="nota" style="margin:0;font-size:15px">El Gobernador la acepta o la rechaza en el Despacho o en Discord.</p></form></aside></div>';
  vista.innerHTML=h;cache.agenda=j.agenda;
  $('#semAnt').onclick=function(){semana--;vAgenda()};$('#semSig').onclick=function(){semana++;vAgenda()};$('#semHoy').onclick=function(){semana=0;vAgenda()};
  $$('[data-pest]').forEach(function(b){b.onclick=function(){$$('[data-pest]').forEach(function(x){x.classList.toggle('on',x===b)});$('#fCita').hidden=b.dataset.pest!=='cita';$('#fAud').hidden=b.dataset.pest!=='aud'}});
  $('#fCita').onsubmit=function(ev){ev.preventDefault();var f=this,fe=f.f.value;if(!f.con.value.trim()||!fe||!f.h.value)return aviso('Rellene con quién, el día y la hora.',true);var p=fe.split('-'),b=$('button[type=submit]',f);b.disabled=true;
   api('cita_crear',{con:f.con.value,fecha:fe.indexOf('-')>=0?p[2]+'/'+p[1]+'/'+p[0]:fe,hora:f.h.value,lugar:f.lugar.value,motivo:f.motivo.value}).then(function(r){aviso('Cita apuntada: '+r.texto+'.');vAgenda()}).catch(function(x){b.disabled=false;fallo(x)})};
  $('#fAud').onsubmit=function(ev){ev.preventDefault();var f=this;if(!f.quien.value.trim()||!f.motivo.value.trim())return aviso('Ponga quién la pide y para qué.',true);var b=$('button[type=submit]',f);b.disabled=true;
   api('audiencia_crear',{quien:f.quien.value,motivo:f.motivo.value,telegrama:f.telegrama.value,cuando:f.cuando.value}).then(function(){aviso('Solicitud apuntada. El Gobernador la verá en el Despacho.');f.reset();b.disabled=false}).catch(function(x){b.disabled=false;fallo(x)})};
  $$('[data-ev]').forEach(function(b){b.onclick=function(){var e=j.agenda.find(function(x){return x.id===Number(b.dataset.ev)}),box=$('#evDet');box.hidden=false;
   box.innerHTML='<div class="tit"><h2>'+esc(evTitulo(e))+'</h2><span class="etq'+(e.estado==='cancelada'?'':' oro')+'">'+(e.estado==='cancelada'?'Cancelada':e.tipo==='cita'?'Cita n.º '+e.numero:e.tipo==='reunion'?'Reunión n.º '+e.numero:'Acto de campaña')+'</span></div><div>'+esc(cap(diaLargo(e.cuando)))+' a las '+hm(e.cuando)+'</div>'+(evSub(e)?'<div style="color:var(--suave)">'+esc(evSub(e))+'</div>':'')+'<div style="color:var(--tenue);font-size:15px">Apuntado por '+esc(e.autor||'—')+'</div>'+(e.tipo==='cita'&&e.estado!=='cancelada'?'<div class="acciones"><button type="button" class="btn rojo" id="cancCita">Cancelar cita</button></div>':'');
   var cc=$('#cancCita');if(cc)cc.onclick=function(){cc.disabled=true;api('cita_cancelar',{id:e.id}).then(function(){aviso('Cita cancelada.');vAgenda()}).catch(function(x){cc.disabled=false;fallo(x)})};
  }});
 }).catch(fallo);
}

/* ---------- documentos ---------- */
var docSel=null;
function vDocumentos(){
 var pre=(location.hash.split('/')[1]||'');
 api('docs').then(function(j){
  cache.docs=j;var docs=j.docs;
  if(pre&&docs.some(function(d){return String(d.id)===pre}))docSel=Number(pre);
  var h=cab('DOCUMENTOS','Redactar y firmar','<button type="button" class="btn oro" id="docNuevo">Nuevo documento</button>');
  var lis=docs.length?docs.map(function(d){return '<button type="button" class="doc-it'+(d.id===docSel?' on':'')+'" data-doc="'+d.id+'">'+(d.estado==='firmado'?'<span class="lacre-mini" aria-hidden="true"></span>':'<img src="img/i-pluma.webp" alt="" width="34" height="34">')+'<span class="tx"><span>'+esc(cap(d.datos.clase))+(d.datos.numDoc?' n.º '+d.datos.numDoc:'')+' · '+esc(d.datos.titulo)+'</span><span class="s">'+(d.estado==='firmado'?'Firmado':'Borrador · '+esc(d.autor))+'</span></span></button>'}).join(''):vacioImg('v-pergamino.webp','Todavía no hay documentos.');
  h+='<div class="fila"><section class="tarjeta doc-lista"><h2>Archivo</h2>'+lis+'</section><section class="tarjeta" style="flex:1 1 340px" id="docEd"></section><div style="flex:1 1 460px;min-width:0" id="docPrev"></div></div>';
  vista.innerHTML=h;
  $('#docNuevo').onclick=function(){docSel=null;history.replaceState(null,'','#documentos');editor(null)};
  $$('[data-doc]').forEach(function(b){b.onclick=function(){docSel=Number(b.dataset.doc);$$('.doc-it').forEach(function(x){x.classList.toggle('on',x===b)});editor(docs.find(function(d){return d.id===docSel}))}});
  editor(docSel?docs.find(function(d){return d.id===docSel}):null);
 }).catch(fallo);
}
function editor(d){
 var j=cache.docs,firm=d&&d.estado==='firmado',ed=$('#docEd');
 var clase=d?d.datos.clase:'comunicado',titulo=d?d.datos.titulo:'',texto=d?d.datos.texto:'';
 if(firm){ed.innerHTML='<h2>'+esc(cap(clase))+' n.º '+d.datos.numDoc+'</h2><p style="margin:0;color:var(--suave)">Firmado por '+esc(d.datos.firmadoPor||'')+' el '+esc(diaLargo(d.datos.firmadoMs))+'. Ya no se puede cambiar.</p><div class="acciones"><button type="button" class="btn oro" id="docImg">Descargar imagen</button><button type="button" class="btn" id="docCop">Copiar texto</button></div>'}
 else ed.innerHTML='<h2>'+(d?'Borrador':'Nuevo documento')+'</h2><label class="campo">Tipo<select id="dClase"><option value="comunicado">Comunicado</option><option value="decreto">Decreto</option><option value="carta">Carta</option></select></label><label class="campo">Título<input id="dTit" maxlength="100"></label><label class="campo">Texto<textarea id="dTxt" rows="11" maxlength="3000"></textarea></label><div class="acciones"><button type="button" class="btn" id="docGuardar">Guardar borrador</button>'+(d&&esGob()?'<button type="button" class="btn oro" id="docFirmar">Firmar</button><button type="button" class="btn rojo" id="docDesc">Descartar</button>':'')+'<button type="button" class="btn" id="docImg">Descargar imagen</button></div><p class="nota" style="margin:0;font-size:15px">'+(esGob()?'Al firmar se numera y se archiva; el Sr. Whitmore lo actualiza en #documentos.':'Al guardarlo, el Gobernador recibe aviso en #documentos para firmarlo.')+'</p>';
 if(!firm){$('#dClase').value=clase;$('#dTit').value=titulo;$('#dTxt').value=texto;
  ['#dClase','#dTit','#dTxt'].forEach(function(s){$(s).addEventListener('input',function(){prev(borrador())})});
  $('#docGuardar').onclick=function(){var b=this,x=borrador();if(!x.datos.titulo.trim()||!x.datos.texto.trim())return aviso('Escriba el título y el texto.',true);b.disabled=true;
   api('doc_guardar',{id:d?d.id:null,clase:x.datos.clase,titulo:x.datos.titulo,texto:x.datos.texto}).then(function(r){docSel=r.doc.id;aviso(d?'Borrador actualizado.':'Borrador guardado. El Gobernador tiene aviso para firmarlo.');vDocumentos()}).catch(function(e){b.disabled=false;fallo(e)})};
  var fb=$('#docFirmar');if(fb)fb.onclick=function(){var x=borrador();fb.disabled=true;
   var guardar=(x.datos.titulo!==d.datos.titulo||x.datos.texto!==d.datos.texto||x.datos.clase!==d.datos.clase)?api('doc_guardar',{id:d.id,clase:x.datos.clase,titulo:x.datos.titulo,texto:x.datos.texto}):Promise.resolve();
   guardar.then(function(){return api('doc_firmar',{id:d.id})}).then(function(r){aviso('Documento firmado: '+cap(r.doc.datos.clase)+' n.º '+r.doc.datos.numDoc+'.');docSel=r.doc.id;vDocumentos()}).catch(function(e){fb.disabled=false;fallo(e)})};
  var db=$('#docDesc');if(db)db.onclick=function(){if(!confirmar(db,'¿Seguro? Pulse otra vez para descartar'))return;db.disabled=true;api('doc_descartar',{id:d.id}).then(function(){aviso('Documento descartado.');docSel=null;vDocumentos()}).catch(function(e){db.disabled=false;fallo(e)})};
 }
 var ib=$('#docImg');if(ib)ib.onclick=function(){imagenDoc(firm?d:borrador())};
 var cb=$('#docCop');if(cb)cb.onclick=function(){copiar(d.texto||'',cb)};
 prev(firm?d:(d?Object.assign({},d,{datos:Object.assign({},d.datos)}):borrador()));
 function borrador(){return {estado:'borrador',datos:{clase:$('#dClase').value,titulo:$('#dTit').value,texto:$('#dTxt').value}}}
}
function confirmar(b,txt){if(b.dataset.seguro){return true}b.dataset.seguro='1';var o=b.textContent;b.textContent=txt;setTimeout(function(){delete b.dataset.seguro;b.textContent=o},3500);return false}
var TIPO={decreto:'DECRETO',comunicado:'COMUNICADO',carta:'CARTA'};
function firmaPartes(d){var f=cache.docs&&cache.docs.firma||{};if(d.datos.firma){var p=d.datos.firma.split('\n');return {nombre:p[0],cargo:(p[1]||'').replace(/ · Silver Peak$/,'')}}return {nombre:f.nombre||(esGob()?YO.nombre:'[Nombre del Gobernador]'),cargo:f.cargo||'Gobernador'}}
function prev(d){
 var x=d.datos,firm=d.estado==='firmado',fp=firmaPartes(d),fecha=fechaMadrid(x.firmadoMs||Date.now());
 $('#docPrev').innerHTML='<article class="papel" aria-label="Vista previa del documento"><div class="enc"><img src="escudo.svg" alt="" width="72" height="72" style="filter:sepia(1) saturate(.6) brightness(.7)"><span>GOBIERNO DE SILVER PEAK</span><img class="sep" src="img/separador.webp" alt="" width="260" height="45"></div><div class="cl">'+(TIPO[x.clase]||'DOCUMENTO')+(x.numDoc?' N.º '+x.numDoc:firm?'':' (borrador)')+'</div><div class="ti">'+esc(x.titulo||'Título')+'</div><div class="cu">'+esc(x.texto||'Texto del documento…')+'</div><div style="font-size:18px">Dado en Silver Peak, a '+fecha.getDate()+' de '+MESES[fecha.getMonth()]+' de '+1880+'.</div><div class="pie"><div>'+(firm?'<div class="rubrica">'+esc(fp.nombre)+'</div>':'<div class="pend">Pendiente de firma</div>')+'<div style="font-size:17px">'+esc(fp.nombre)+'</div><div style="font-size:16px;font-style:italic">'+esc(fp.cargo)+' de Silver Peak</div></div>'+(firm?'<svg class="lacre" width="96" height="96" viewBox="0 0 120 120" role="img" aria-label="Sello de lacre"><defs><radialGradient id="lg" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#c6493b"/><stop offset=".55" stop-color="#8b2e25"/><stop offset="1" stop-color="#561a14"/></radialGradient></defs><path d="M60 4 C74 6 80 2 90 10 C100 18 110 20 112 34 C116 46 120 54 114 66 C110 78 116 88 104 98 C94 108 86 116 72 114 C60 118 50 120 38 112 C26 106 14 104 10 90 C4 78 2 70 6 58 C8 46 2 36 12 26 C22 14 30 10 42 8 C50 4 54 4 60 4Z" fill="url(#lg)"/><circle cx="60" cy="60" r="46" fill="url(#lg)" stroke="#5e1c16" stroke-opacity=".35"/><circle cx="60" cy="60" r="42" fill="none" stroke="#c45a4a" stroke-width="2"/><path d="M30 78 L48 52 L56 62 L66 46 L90 78 Z" fill="none" stroke="#e9b3a6" stroke-width="3" stroke-linejoin="round"/><path d="M60 26 l2.4 5.6 6 .5 -4.6 3.9 1.4 5.8 -5.2-3.2 -5.2 3.2 1.4-5.8 -4.6-3.9 6-.5z" fill="#e9b3a6"/></svg>':'')+'</div></article>';
}
/* imagen del documento (papel, escudo, firma y sello) */
function cargaImg(src){return new Promise(function(ok){var i=new Image();i.onload=function(){ok(i)};i.onerror=function(){ok(null)};i.src=src})}
function imagenDoc(d){
 var x=d.datos,firm=d.estado==='firmado',fp=firmaPartes(d),fecha=fechaMadrid(x.firmadoMs||Date.now()),IM={};
 var fuentes=['700 30px Cinzel','24px "IM Fell English"','italic 24px "IM Fell English"','56px "Pinyon Script"'].map(function(f){return D.fonts&&D.fonts.load?D.fonts.load(f).catch(function(){}):0});
 var imgs=['pergamino','esq-si','esq-sd','esq-ii','esq-id','separador'].map(function(n){return cargaImg('img/'+n+'.webp').then(function(i){IM[n]=i})});
 Promise.all(fuentes.concat(imgs)).then(function(){
  var W=1000,c=D.createElement('canvas'),g=c.getContext('2d'),lin=[];
  g.font='24px "IM Fell English", Georgia, serif';
  String(x.texto||'').split('\n').forEach(function(p){if(!p.trim()){lin.push('');return}var w=p.split(' '),l='';w.forEach(function(t){var z=l?l+' '+t:t;if(g.measureText(z).width>W-160){lin.push(l);l=t}else l=z});lin.push(l)});
  var H=Math.max(1100,520+lin.length*36+260);c.width=W;c.height=H;
  var gr=g.createLinearGradient(0,0,W,H);gr.addColorStop(0,'#f3e9cf');gr.addColorStop(1,'#e6d6b0');g.fillStyle=gr;g.fillRect(0,0,W,H);
  if(IM.pergamino)g.drawImage(IM.pergamino,0,0,W,H);
  var vg=g.createRadialGradient(W/2,H/2,Math.min(W,H)*.35,W/2,H/2,Math.max(W,H)*.75);vg.addColorStop(0,'rgba(120,80,20,0)');vg.addColorStop(1,'rgba(120,80,20,.28)');g.fillStyle=vg;g.fillRect(0,0,W,H);
  g.strokeStyle='#8a6a2e';g.lineWidth=3;g.strokeRect(24,24,W-48,H-48);g.lineWidth=1;g.strokeRect(34,34,W-68,H-68);
  var E=96;if(IM['esq-si'])g.drawImage(IM['esq-si'],14,14,E,E);if(IM['esq-sd'])g.drawImage(IM['esq-sd'],W-14-E,14,E,E);if(IM['esq-ii'])g.drawImage(IM['esq-ii'],14,H-14-E,E,E);if(IM['esq-id'])g.drawImage(IM['esq-id'],W-14-E,H-14-E,E,E);
  // escudo
  g.save();g.translate(W/2-55,60);g.scale(110/120,110/120);g.strokeStyle='#6b5222';g.lineWidth=3;g.fillStyle='#6b5222';
  g.beginPath();g.arc(60,60,56,0,Math.PI*2);g.stroke();g.stroke(new Path2D('M22 82 L46 46 L56 60 L68 38 L98 82 Z'));g.fill(new Path2D('M60 18 l3 7 7.5 .6 -5.7 4.9 1.8 7.3 -6.6-4 -6.6 4 1.8-7.3 -5.7-4.9 7.5-.6z'));g.restore();
  g.textAlign='center';g.fillStyle='#6b5222';g.font='500 18px Cinzel, Georgia, serif';g.fillText('G O B I E R N O   D E   S I L V E R   P E A K',W/2,205);
  if(IM.separador){g.save();g.filter='sepia(.6) brightness(.7)';g.drawImage(IM.separador,W/2-130,212,260,45);g.restore()}else{g.strokeStyle='#8a6a2e';g.lineWidth=2;g.beginPath();g.moveTo(80,228);g.lineTo(W-80,228);g.stroke()}
  g.fillStyle='#2a2116';g.font='700 30px Cinzel, Georgia, serif';g.fillText((TIPO[x.clase]||'DOCUMENTO')+(x.numDoc?' N.º '+x.numDoc:firm?'':' (BORRADOR)'),W/2,285);
  g.font='italic 26px "IM Fell English", Georgia, serif';g.fillText(String(x.titulo||''),W/2,330);
  g.textAlign='left';g.font='24px "IM Fell English", Georgia, serif';var y=390;lin.forEach(function(l){g.fillText(l,80,y);y+=36});
  y+=20;g.fillText('Dado en Silver Peak, a '+fecha.getDate()+' de '+MESES[fecha.getMonth()]+' de '+1880+'.',80,y);
  y+=110;
  if(firm){g.fillStyle='#1f2a44';g.font='56px "Pinyon Script", cursive';g.fillText(fp.nombre,80,y)}else{g.fillStyle='#7a6a4a';g.font='italic 22px "IM Fell English", Georgia, serif';g.fillText('Pendiente de firma',80,y)}
  g.fillStyle='#2a2116';g.font='22px "IM Fell English", Georgia, serif';g.fillText(fp.nombre,80,y+40);g.font='italic 21px "IM Fell English", Georgia, serif';g.fillText(fp.cargo+' de Silver Peak',80,y+70);
  if(firm){g.save();g.translate(W-230,y-70);g.fillStyle='#8b2e25';g.beginPath();g.arc(70,70,66,0,Math.PI*2);g.fill();g.strokeStyle='#c45a4a';g.lineWidth=2;g.beginPath();g.arc(70,70,54,0,Math.PI*2);g.stroke();
   g.translate(10,8);g.strokeStyle='#e9b3a6';g.fillStyle='#e9b3a6';g.lineWidth=3;g.stroke(new Path2D('M30 78 L48 52 L56 62 L66 46 L90 78 Z'));g.fill(new Path2D('M60 26 l2.4 5.6 6 .5 -4.6 3.9 1.4 5.8 -5.2-3.2 -5.2 3.2 1.4-5.8 -4.6-3.9 6-.5z'));g.restore()}
  c.toBlob(function(bl){var a=D.createElement('a');a.href=URL.createObjectURL(bl);a.download=(TIPO[x.clase]||'Documento').toLowerCase()+(x.numDoc?'-'+x.numDoc:'-borrador')+'.png';D.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},2000)},'image/png');
 });
}

/* ---------- telegramas ---------- */
var telPest='entrada',telSel=null,telT=null;
function vTelegramas(){
 var pre=(location.hash.split('/')[1]||'');
 api('tels').then(function(j){
  var tels=j.tels;cache.tels=tels;
  if(pre){var t0=tels.find(function(t){return String(t.id)===pre});if(t0){telSel=t0.id;telPest=t0.datos.sentido}}
  var h=cab('OFICINA DE TELÉGRAFOS','Telegramas');
  var lis=tels.filter(function(t){return t.datos.sentido===telPest});
  h+='<div class="fila"><section class="tarjeta" style="flex:1 1 300px"><div class="pestanas"><button type="button" class="btn'+(telPest==='entrada'?' on':'')+'" data-tp="entrada">Recibidos</button><button type="button" class="btn'+(telPest==='salida'?' on':'')+'" data-tp="salida">Enviados</button></div>'+
   (lis.length?lis.map(function(t){var e=t.datos.sentido==='entrada';return '<button type="button" class="tel-it'+(t.id===telSel?' on':'')+'" data-tel="'+t.id+'"><img src="img/'+(e?(t.datos.respondido?'i-sobre-abierto':'i-sobre'):'i-telegrafo')+'.webp" alt="" width="34" height="34"><span class="tx"><span style="display:flex;justify-content:space-between;gap:8px"><b>'+esc(e?t.datos.de:t.datos.para)+'</b><span class="etq'+(e?(t.datos.respondido?' ok':' oro'):'')+'">'+(e?(t.datos.respondido?'Respondido':'Sin responder'):esc(fechaCorta(t.creado)))+'</span></span><span class="s">'+esc(e?t.datos.texto:t.datos.texto.split('\n').slice(2).join(' '))+'</span></span></button>'}).join(''):vacioImg('v-telegrafo.webp',telPest==='entrada'?'No hay telegramas recibidos.':'Todavía no se ha enviado ninguno.'))+
   '<button type="button" class="btn" id="telReg">Registrar uno recibido</button><button type="button" class="btn oro" id="telNuevo">Redactar uno nuevo</button></section><section style="flex:2 1 460px;min-width:0;display:flex;flex-direction:column;gap:14px" id="telPanel"></section></div>';
  vista.innerHTML=h;
  $$('[data-tp]').forEach(function(b){b.onclick=function(){telPest=b.dataset.tp;telSel=null;history.replaceState(null,'','#telegramas');vTelegramas()}});
  $$('[data-tel]').forEach(function(b){b.onclick=function(){telSel=Number(b.dataset.tel);$$('.tel-it').forEach(function(x){x.classList.toggle('on',x===b)});panelTel(tels.find(function(t){return t.id===telSel}))}});
  $('#telNuevo').onclick=function(){telSel=null;$$('.tel-it').forEach(function(x){x.classList.remove('on')});componer(null)};
  $('#telReg').onclick=registrar;
  var s=telSel&&tels.find(function(t){return t.id===telSel});if(s)panelTel(s);else componer(null);
 }).catch(fallo);
}
function panelTel(t){
 if(t.datos.sentido==='salida'){$('#telPanel').innerHTML='<div class="telegrama"><div class="te"><span class="izq"><img src="img/i-telegrafo.webp" alt="" width="46" height="30">TELEGRAMA</span><small>Enviado el '+esc(fechaCorta(t.creado))+(t.datos.telegrama?' · '+esc(t.datos.telegrama):'')+'</small></div><pre>'+esc(t.datos.texto)+'</pre></div><div class="acciones"><button type="button" class="btn oro" id="telCop">Copiar telegrama</button></div>';$('#telCop').onclick=function(){copiar(t.datos.texto,this)};return}
 $('#telPanel').innerHTML='<section class="tarjeta"><div class="tit"><h2>De '+esc(t.datos.de)+'</h2><span class="etq">'+esc(fechaCorta(t.creado))+(t.datos.telegrama?' · '+esc(t.datos.telegrama):'')+'</span></div><div class="recibido">'+esc(t.datos.texto)+'</div>'+(t.datos.respondido?'<div class="etq ok" style="align-self:flex-start">Respondido por '+esc(t.datos.respondido)+'</div>':'')+'</section><div id="telComp"></div>';
 componer(t,$('#telComp'));
}
function componer(resp,dest){
 dest=dest||$('#telPanel');
 dest.innerHTML='<section class="tarjeta"><h2>'+(resp?'Responder':'Nuevo telegrama')+'</h2>'+(resp?'':'<div class="dos"><label class="campo">Para<input id="tPara" maxlength="100"></label><label class="campo">Su telegrama<input id="tNum" maxlength="20"></label></div>')+'<label class="campo">Lo que quiere decir (yo pongo el saludo, la despedida y la firma)<textarea id="tTxt" rows="4" maxlength="1500"></textarea></label></section><div class="telegrama"><div class="te"><span class="izq"><img src="img/i-telegrafo.webp" alt="" width="46" height="30">TELEGRAMA</span><small>Gobierno de Silver Peak</small></div><pre id="tPrev">…</pre></div><div class="acciones"><button type="button" class="btn oro" id="tEnviar">Guardar y copiar</button></div><p class="nota" style="margin:0;font-size:15px">Queda guardado en Enviados y en #telegramas de Discord. Después péguelo en el telégrafo IC.</p>';
 function para(){return resp?resp.datos.de:$('#tPara').value}
 function refrescar(){clearTimeout(telT);telT=setTimeout(function(){api('tel_borrador',{para:para(),texto:$('#tTxt').value}).then(function(r){var p=$('#tPrev');if(p)p.textContent=r.texto}).catch(function(){})},350)}
 $$('#tTxt,#tPara').forEach(function(e){e.addEventListener('input',refrescar)});refrescar();
 $('#tEnviar').onclick=function(){var b=this;if(!para().trim()||!$('#tTxt').value.trim())return aviso('Escriba para quién es y lo que quiere decir.',true);b.disabled=true;
  api('tel_enviar',{para:para(),texto:$('#tTxt').value,telegrama:resp?'':$('#tNum').value,respondeA:resp?resp.id:null}).then(function(r){copiar(r.texto);telPest='salida';telSel=r.tel.id;vTelegramas()}).catch(function(e){b.disabled=false;fallo(e)})};
}
function registrar(){
 telSel=null;$$('.tel-it').forEach(function(x){x.classList.remove('on')});
 $('#telPanel').innerHTML='<section class="tarjeta"><h2>Registrar un telegrama recibido</h2><div class="dos"><label class="campo">De quién<input id="rDe" maxlength="100"></label><label class="campo">Su telegrama<input id="rNum" maxlength="20"></label></div><label class="campo">Lo que dice<textarea id="rTxt" rows="6" maxlength="1500"></textarea></label><div class="acciones"><button type="button" class="btn oro" id="rOk">Registrar</button></div></section>';
 $('#rOk').onclick=function(){var b=this;if(!$('#rDe').value.trim()||!$('#rTxt').value.trim())return aviso('Ponga de quién es y lo que dice.',true);b.disabled=true;
  api('tel_recibido',{de:$('#rDe').value,texto:$('#rTxt').value,telegrama:$('#rNum').value}).then(function(r){aviso('Telegrama registrado.');telPest='entrada';telSel=r.tel.id;vTelegramas()}).catch(function(e){b.disabled=false;fallo(e)})};
}

/* Oficina de campaña: los asientos se conservan y su copia se remite al canal privado. */
function vCampana(){api('campana').then(function(j){
 var rows=j.registros,exp=rows.find(function(r){return r.tipo==='campana'}),d=exp?exp.datos:{},ed=j.puedeEditar,res=j.puedeResolver;
 var estados={borrador:'En preparación',presentada:'Presentada al staff',subsanacion:'Requiere enmiendas',aceptada:'Candidatura admitida',rechazada:'Candidatura no admitida',retirada:'Candidatura retirada'},resultados={pendiente:'Pendiente de escrutinio',provisional:'Escrutinio provisional',electos:'Electos · Gobierno oficial de Silver Peak',no_electos:'No electos'};
 function opciones(obj,sel){return Object.keys(obj).map(function(k){return '<option value="'+k+'"'+(k===sel?' selected':'')+'>'+obj[k]+'</option>'}).join('')}
 function campo(nombre,label,valor,multi){return '<label class="campo">'+label+(multi?'<textarea rows="7" name="'+nombre+'" maxlength="'+(['resolucion','votos','acta'].indexOf(nombre)>=0?500:3500)+'">'+esc(valor||'')+'</textarea>':'<input name="'+nombre+'" value="'+esc(valor||'')+'" maxlength="2000">')+'</label>'}
 var h=cab('OFICINA DE CAMPAÑA','Camino a la Gobernación','<span class="etq oro">'+esc(estados[exp?exp.estado:'borrador'])+'</span>');
 h+='<section class="tarjeta camp-exp"><div class="tit"><h2>Expediente de postulación</h2><span class="etq">'+esc(resultados[d.resultado||'pendiente'])+'</span></div><p class="nota">Aquí se prepara la postulación y se conserva la respuesta del staff. Registrar una resolución deja constancia de lo comunicado; la admisión la decide el staff.</p>';
 if(ed){h+='<form id="campExp">'+campo('titulo','Encabezamiento',d.titulo||'Postulación a Gobernador de Silver Peak')+campo('texto','Escrito de postulación',d.texto,true)+'<div class="dos"><label class="campo">Tramitación<select name="estado"'+(!res?' disabled':'')+'>'+opciones(estados,exp?exp.estado:'borrador')+'</select></label><label class="campo">Acta del escrutinio<select name="resultado"'+(!res?' disabled':'')+'>'+opciones(resultados,d.resultado||'pendiente')+'</select></label></div>'+campo('resolucion','Correspondencia del staff: respuesta y referencia',d.resolucion,true)+campo('votos','Recuento de votos: candidatos y cifras',d.votos,true)+campo('acta','Acta o confirmación oficial del resultado',d.acta,true)+'<button class="btn oro" type="submit">Asentar en el expediente</button></form>';}else h+='<article class="recibido">'+esc(d.texto||'La postulación aún está pendiente de redacción.')+'</article><p>'+esc(d.resolucion||'No se ha recibido resolución.')+'</p><p>'+esc(d.votos||'Sin escrutinio registrado.')+'</p><p>'+esc(d.acta||'')+'</p>';
 h+='</section><div class="fila">';
 [['idea_campana','Cuaderno de ideas','Una idea puede incorporarse al escrito cuando el Consejo la haya revisado.'],['hito_electoral','Calendario electoral',exp&&exp.estado==='aceptada'?'Asiente aquí los plazos oficiales que se comuniquen.':'El calendario oficial quedará pendiente hasta la admisión de la candidatura.'],['acto','Libro de mítines','Fechas, lugares y seguimiento de los encuentros de campaña.']].forEach(function(def){var tipo=def[0];h+='<section class="tarjeta camp-libro"><h2>'+def[1]+'</h2><p class="nota">'+def[2]+'</p>';
 var lis=rows.filter(function(r){return r.tipo===tipo});h+=lis.length?lis.map(function(r){var labels={propuesta:'Por estudiar',incorporada:'Incorporada al escrito',descartada:'Archivada',previsto:'Previsto',cerrada:'Celebrado',cancelada:'Cancelado',cumplido:'Cumplido',cancelado:'Cancelado'};return '<article class="camp-asiento"><div class="tit"><h3>'+esc(r.datos.titulo)+'</h3><span class="etq">'+esc(labels[r.estado]||r.estado)+'</span></div>'+(r.cuando?'<p>'+esc(diaLargo(new Date(r.cuando).getTime()))+' de 1880 · '+hm(new Date(r.cuando).getTime())+'</p>':'')+'<p>'+esc(r.datos.lugar||'')+'</p><div class="recibido">'+esc(r.datos.texto||r.datos.notas||'')+'</div><p>'+esc(r.datos.seguimiento||'')+'</p>'+(ed?'<label class="campo">Anotación de seguimiento<textarea rows="2" maxlength="2000" data-camp-nota="'+r.id+'">'+esc(r.datos.seguimiento||'')+'</textarea></label><div class="acciones">'+(tipo==='idea_campana'?[['incorporada','Incorporada'],['descartada','Archivar']]:tipo==='acto'?[['cerrada','Celebrado'],['cancelada','Cancelar']]:[['cumplido','Cumplido'],['cancelado','Cancelar']]).map(function(x){return '<button class="btn" data-camp-id="'+r.id+'" data-camp-est="'+x[0]+'">'+x[1]+'</button>'}).join('')+'</div>':'')+'</article>';}).join(''):'<p class="vacio">El libro todavía no tiene asientos.</p>';
 if(tipo==='idea_campana'||ed&&(tipo!=='hito_electoral'||exp&&exp.estado==='aceptada'))h+='<form class="campAnotar" data-tipo="'+tipo+'"><h3>Nuevo asiento</h3>'+campo('titulo',tipo==='acto'?'Nombre del mitin':'Título','')+(tipo!=='idea_campana'?'<div class="dos">'+campo('fecha','Día y mes · ejemplo 25/10','')+'<label class="campo">Hora<input name="hora" type="time" required></label></div>':'')+(tipo==='acto'?campo('lugar','Lugar del encuentro',''):'')+(tipo==='hito_electoral'?'<label class="campo">Clase de asiento<select name="clase"><option value="plazo">Plazo del calendario</option><option value="votacion">Jornada de votación · cuenta atrás del Despacho</option></select></label>':'')+campo('texto','Notas para el Consejo','',true)+'<button class="btn oro" type="submit">Anotar en el libro</button></form>';
 h+='</section>';});h+='</div>';vista.innerHTML=h;
 var f=$('#campExp');if(f)f.onsubmit=function(e){e.preventDefault();var b=$('button[type=submit]',f),obj={version:exp?exp.actualizado:''};['titulo','texto','estado','resultado','resolucion','votos','acta'].forEach(function(k){obj[k]=f.elements[k].value});b.disabled=true;api('campana_expediente',obj).then(function(){aviso('Expediente asentado.');vCampana()}).catch(function(e){b.disabled=false;fallo(e)})};
 $$('.campAnotar').forEach(function(f){f.onsubmit=function(e){e.preventDefault();var b=$('button[type=submit]',f),obj={tipo:f.dataset.tipo};new FormData(f).forEach(function(v,k){obj[k]=v});b.disabled=true;api('campana_anotar',obj).then(function(){aviso('Asiento registrado.');vCampana()}).catch(function(e){b.disabled=false;fallo(e)})}});
 $$('[data-camp-id]').forEach(function(b){b.onclick=function(){if(!confirmar(b,'Confirmar este asiento'))return;var notas=$('[data-camp-nota="'+b.dataset.campId+'"]').value;b.disabled=true;api('campana_estado',{id:Number(b.dataset.campId),estado:b.dataset.campEst,notas:notas}).then(function(){aviso('Libro actualizado.');vCampana()}).catch(function(e){b.disabled=false;fallo(e)})}});
 }).catch(fallo)}

arrancar();
})();
