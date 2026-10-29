/* Centrar la puerta solo al abrir o cambiar el encuadre; sin un bucle permanente. */
(function(){
 const gate=document.getElementById('gate');if(!gate)return;
 let frame=0,desplazamiento=0;
 function centrar(){frame=0;if(document.hidden||gate.hidden||gate.dataset.ph!=='scene')return;
  const boton=document.getElementById('gEnter'),puerta=gate.querySelector('.g-doorwrap'),escena=gate.querySelector('.g-stage'),ui=document.getElementById('gUi');
  if(!boton||!puerta||!escena||!ui)return;const r=puerta.getBoundingClientRect(),u=ui.getBoundingClientRect();
  if(!r.width||!u.width)return;const delta=u.left+u.width/2-r.left-r.width/2;
  if(Math.abs(delta)<.5)return;desplazamiento+=delta;escena.style.left='calc(50% + '+desplazamiento+'px)';ui.style.setProperty('--entrada-desplazamiento','0px');
 }
 function pedir(){if(!frame&&!document.hidden&&!gate.hidden&&gate.dataset.ph==='scene')frame=requestAnimationFrame(centrar);}
 new MutationObserver(pedir).observe(gate,{attributes:true,attributeFilter:['hidden','data-ph'],childList:true,subtree:true});
 addEventListener('resize',pedir,{passive:true});addEventListener('orientationchange',pedir,{passive:true});
 gate.addEventListener('transitionend',pedir);gate.addEventListener('load',pedir,true);document.addEventListener('visibilitychange',pedir);
 if(document.fonts?.ready)document.fonts.ready.then(pedir);pedir();
})();
