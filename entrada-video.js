/* HARRINGTON · Entrada en vídeo (v3.0 · 20/10/2026)
   Al pulsar ENTRAR, en vez de la animación de las dos hojas recortadas, se reproduce un vídeo de la puerta abriéndose
   y la cámara entrando hasta el tapete verde; su último fotograma es el mismo interior que hay detrás de las tarjetas,
   así que las tarjetas aparecen con un fundido. El vídeo está recortado al encuadre exacto de la fachada.
   Si el vídeo no está listo, falla, hay «Animaciones: LIGERAS», ahorro de datos o batería baja, sale la animación de siempre.
   Ahora mismo hay vídeo para la entrada vertical (móvil); la apaisada (ordenador) sigue con la animación hasta tener el suyo. */
(function(){
'use strict';
var D=document, gate=D.getElementById('gate'), stage=D.getElementById('gStage');
if(!gate||!stage||typeof window.gateEnter!=='function')return;
var SRC={v:['entrada-video.webm','entrada-video.mp4']};   // [webm, mp4]   // w: pendiente del vídeo apaisado
var VER='1';
var vid=null, listo=false, lk='';
function calm(){try{return calmFx()}catch(e){return false}}
function bajo(){try{return !!G.low}catch(e){return false}}
function capa(){try{return G.lk||''}catch(e){return ''}}
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
 gate.classList.add('g-envideo');gPh('video');
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
new MutationObserver(preparar).observe(gate,{attributes:true,attributeFilter:['hidden','data-ph','class']});
preparar();
window.hgEntradaVideo={preparar:preparar,listo:function(){return listo}};
})();
