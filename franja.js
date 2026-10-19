/* HARRINGTON · Portada según la hora de Saint Denis (19/10/2026)
   Se carga al principio de la página, antes que todo lo demás, para que la portada salga ya con la luz que toca
   (mañana, atardecer o noche) sin enseñar antes otra. También decide si sale la pantalla de carga con el sello de lacre:
   solo la primera vez que se abre la web en la pestaña. */
(function(){
 var H=document.documentElement;
 var P={
  manana:{m:'cabecera-web-manana.webp',a:'cabecera-web-ancha-manana.webp'},
  atardecer:{m:'cabecera-web.webp',a:'cabecera-web-ancha.webp'},
  noche:{m:'cabecera-web-noche.webp',a:'cabecera-web-ancha-noche.webp'}
 };
 /* hora de Saint Denis = la hora española del servidor de rol */
 function hora(){try{return +new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',hour:'2-digit',hourCycle:'h23'}).format(new Date())}catch(e){return new Date().getHours()}}
 function franja(){
  var t='auto';try{t=localStorage.getItem('harrington_theme')||'auto'}catch(e){}
  if(t==='dia')return 'manana';if(t==='noche')return 'noche';
  var h=hora();return h>=7&&h<17?'manana':h>=17&&h<21?'atardecer':'noche';
 }
 function ancha(){return (window.innerWidth||0)>=1100}
 window.hgFranja=franja;
 window.hgPortadaSrc=function(w){var f=P[franja()]||P.atardecer;return (w===undefined?ancha():w)?f.a:f.m};
 window.hgPortadas=P;
 H.setAttribute('data-franja',franja());
 /* la pantalla de carga, solo una vez por pestaña (y nunca con «menos animaciones») */
 var vista=false;try{vista=sessionStorage.getItem('harrington_carga_v1')==='1';sessionStorage.setItem('harrington_carga_v1','1')}catch(e){}
 var calma=false;try{calma=localStorage.getItem('harrington_fx')==='lite'||matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){}
 if(vista||calma)H.classList.add('sin-carga');
 /* en cuanto aparezca la portada en la página, se le pone la imagen de su hora */
 function pon(){
  var img=document.querySelector('.hero-banner img');if(!img)return false;
  var src=document.querySelector('.hero-banner picture source');
  if(src)src.setAttribute('srcset',window.hgPortadaSrc(true));
  var u=window.hgPortadaSrc(false);if(img.getAttribute('src')!==u)img.setAttribute('src',u);
  return true;
 }
 if(!pon()&&window.MutationObserver){
  var mo=new MutationObserver(function(){if(pon())mo.disconnect()});
  mo.observe(H,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',function(){pon();mo.disconnect()});
 }
})();
