/* HARRINGTON · Entrada en vídeo (v3.0 · 20/10/2026)
   Al pulsar ENTRAR, en vez de la animación de las dos hojas recortadas, se reproduce un vídeo de la puerta abriéndose
   y la cámara entrando hasta el tapete verde; su último fotograma es el mismo interior que hay detrás de las tarjetas,
   así que las tarjetas aparecen con un fundido. El vídeo está recortado al encuadre exacto de la fachada.
   Si el vídeo no está listo, falla, hay «Animaciones: LIGERAS», ahorro de datos o batería baja, sale la animación de siempre.
   Hay vídeo para la entrada vertical (móvil) y, desde el 21/10/2026, para la apaisada (ordenador: entrada-video-ancho). */
(function(){
'use strict';
var D=document, gate=D.getElementById('gate'), stage=D.getElementById('gStage');
if(!gate||!stage||typeof window.gateEnter!=='function')return;
var SRC={v:['entrada-video.webm','entrada-video.mp4'],w:['entrada-video-ancho.webm','entrada-video-ancho.mp4']};   // [webm, mp4]
var VER='2';
var vid=null, listo=false, lk='';
/* solo se quita si eliges LIGERAS a mano o el sistema pide menos movimiento: la medición automática de fluidez no cuenta,
   porque el vídeo lo decodifica el chip del móvil y pesa menos que la animación de repuesto */
function calm(){try{return (typeof FX!=='undefined'&&FX.mode==='lite')||gReduced()}catch(e){return false}}
function bajo(){try{return !!G.low}catch(e){return false}}
function capa(){try{return G.lk||''}catch(e){return ''}}
/* el vídeo se coloca donde está la fachada (en el ordenador la escena se desplaza para centrar la puerta) y con su mismo zoom lento */
function encajar(v){try{v.style.left=stage.style.left||'';var sc=getComputedStyle(stage).scale;v.style.transition='none';v.style.scale=(sc&&sc!=='none')?sc:'';
 requestAnimationFrame(function(){v.style.transition='opacity .35s ease, scale 1.2s ease';v.style.scale='1'})}catch(e){}}
function quitar(){if(vid){try{vid.pause()}catch(e){}vid.remove();vid=null}listo=false;lk=''}
function preparar(){
 var k=capa();
 if(gate.hidden||!SRC[k]||calm()||bajo()){if(vid&&lk!==k)quitar();return}
 if(vid&&lk===k)return;
 quitar();lk=k;
 vid=D.createElement('video');vid.className='g-video';vid.muted=true;vid.defaultMuted=true;vid.playsInline=true;
 ['muted','playsinline','webkit-playsinline','disablepictureinpicture','disableremoteplayback'].forEach(function(a){vid.setAttribute(a,'')});
 vid.setAttribute('aria-hidden','true');vid.preload='auto';
 /* primero MP4 (H.264: lo decodifica el chip en casi todos los móviles, iPhone incluido); WebM si el navegador no lo tiene */
 var mp4=false;try{mp4=vid.canPlayType('video/mp4; codecs="avc1.640028"')==='probably'||!!vid.canPlayType('video/mp4; codecs="avc1.640028"')}catch(e){}
 vid.src=SRC[k][mp4?1:0]+'?v='+VER;
 vid.addEventListener('canplaythrough',function(){listo=true},{once:true});
 vid.addEventListener('loadeddata',function(){if(vid&&vid.readyState>=3)listo=true});
 vid.addEventListener('error',function(){listo=false});
 stage.insertAdjacentElement('afterend',vid);
 try{vid.load()}catch(e){}
}
var orig=window.gateEnter;
window.gateEnter=function(){
 if(gate.dataset.ph!=='scene')return;
 if(!vid||!listo||calm()||bajo()||lk!==capa())return orig.apply(this,arguments);
 var v=vid, fin=false;
 try{gClear()}catch(e){}
 try{gBell()}catch(e){}
 try{gUi.innerHTML=''}catch(e){}
 encajar(v);gate.classList.add('g-envideo');gPh('video');
 try{v.currentTime=0}catch(e){}
 function acabar(){
  if(fin)return;fin=true;
  try{gateCards()}catch(e){}
  setTimeout(function(){gate.classList.remove('g-envideo','g-vplay');try{v.pause();v.currentTime=0}catch(e){}},1100);
 }
 v.onplaying=function(){gate.classList.add('g-vplay');setTimeout(function(){try{gCreak()}catch(e){}},700)};
 v.ontimeupdate=function(){if(v.duration&&v.currentTime>=v.duration-.3)acabar()};
 v.onended=acabar;
 var p;try{p=v.play()}catch(e){p=null}
 if(p&&p.catch)p.catch(function(){if(fin)return;fin=true;gate.classList.remove('g-envideo','g-vplay');gPh('scene');orig.apply(window,[])});
 setTimeout(acabar,8000);   // por si el vídeo se queda parado
};
/* Al cerrar la sesión, el mismo vídeo al revés: sales de la tienda y las puertas se cierran detrás de ti.
   Termina en la fachada con ENTRAR (la portada de siempre). Solo donde hay vídeo y sin «Animaciones: LIGERAS». */
var SAL={v:['salida-video.webm','salida-video.mp4'],w:['salida-video-ancho.webm','salida-video-ancho.mp4']}, sal=null, salK='';
function prepSalida(){
 var k=capa();if(!SAL[k]||calm()||bajo())return;
 if(sal&&salK===k)return;
 if(sal)sal.remove();salK=k;
 sal=D.createElement('video');sal.className='g-video g-video-salida';sal.muted=true;sal.defaultMuted=true;sal.playsInline=true;
 ['muted','playsinline','webkit-playsinline','disablepictureinpicture','disableremoteplayback'].forEach(function(a){sal.setAttribute(a,'')});
 sal.setAttribute('aria-hidden','true');sal.preload='auto';sal._listo=false;
 var mp4=false;try{mp4=!!sal.canPlayType('video/mp4; codecs="avc1.640028"')}catch(e){}
 sal.src=SAL[k][mp4?1:0]+'?v='+VER;
 sal.addEventListener('canplaythrough',function(){sal._listo=true},{once:true});
 sal.addEventListener('loadeddata',function(){if(sal&&sal.readyState>=3)sal._listo=true});
}
/* se descarga con calma cuando ya estás dentro de la web */
setTimeout(function(){try{if(gate.hidden)prepSalida()}catch(e){}},9000);
if(typeof window.logoutToGate==='function'){
 var origOut=window.logoutToGate;
 window.logoutToGate=function(msg){
  try{prepSalida()}catch(e){}
  var v=sal, rq=false;try{rq=gReduced()}catch(e){}
  if(!v||!v._listo||calm()||bajo()||rq||salK!==capa()){return origOut.apply(this,arguments)}
  var r=origOut.apply(this,arguments);        // cierra la sesión como siempre (queda en las tarjetas)
  var fin=false;
  gate.classList.add('g-salida');
  stage.insertAdjacentElement('afterend',v);try{v.style.left=stage.style.left||''}catch(e){}
  try{v.currentTime=0}catch(e){}
  function acabar(){
   if(fin)return;fin=true;
   try{gateOpen({msg:msg||''})}catch(e){}  // la portada con ENTRAR
   setTimeout(function(){gate.classList.add('g-sfin')},1600);
   setTimeout(function(){gate.classList.remove('g-salida','g-sfin');try{v.pause();v.currentTime=0}catch(e){}v.remove()},2700);
  }
  v.onended=acabar;v.ontimeupdate=function(){if(v.duration&&v.currentTime>=v.duration-.08)acabar()};
  /* crujido al salir y golpe de las puertas al cerrarse */
  v.onplaying=function(){try{gCreak()}catch(e){}setTimeout(function(){try{playThump()}catch(e){}},Math.max(800,((v.duration||5)-1.1)*1000))};
  var p;try{p=v.play()}catch(e){p=null}
  if(p&&p.catch)p.catch(function(){if(!fin){fin=true;gate.classList.remove('g-salida');v.remove()}});
  setTimeout(acabar,8000);
  return r;
 };
}
new MutationObserver(preparar).observe(gate,{attributes:true,attributeFilter:['hidden','data-ph','class']});
preparar();
window.hgEntradaVideo={preparar:preparar,listo:function(){return listo},prepSalida:prepSalida,salidaLista:function(){return !!(sal&&sal._listo)}};
})();
