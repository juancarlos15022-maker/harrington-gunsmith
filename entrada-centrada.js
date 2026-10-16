/* Centrado de la entrada por cambios de tamaño; sin un bucle permanente. */
(function(){'use strict';let frame=0,offset=0;
function measure(){frame=0;const gate=document.getElementById('gate'),door=document.querySelector('.g-doorwrap'),stage=document.querySelector('.g-stage'),ui=document.getElementById('gUi');
 if(!gate||gate.hidden||document.hidden||!door||!stage||!ui||!['scene','open'].includes(gate.dataset.ph))return;
 const r=door.getBoundingClientRect(),u=ui.getBoundingClientRect();if(!r.width||!u.width)return;
 const delta=u.left+u.width/2-r.left-r.width/2;if(Math.abs(delta)<.5)return;
 offset+=delta;stage.style.left='calc(50% + '+offset+'px)';ui.style.setProperty('--entrada-desplazamiento','0px');
}
function schedule(){if(!frame&&!document.hidden)frame=requestAnimationFrame(measure)}
window.addEventListener('resize',schedule,{passive:true});document.addEventListener('visibilitychange',schedule);
const gate=document.getElementById('gate'),ui=document.getElementById('gUi'),door=document.querySelector('.g-doorwrap');
if(gate){gate.addEventListener('load',schedule,true);gate.addEventListener('animationend',schedule);if(typeof MutationObserver!=='undefined')new MutationObserver(schedule).observe(gate,{attributes:true,attributeFilter:['class','hidden','data-ph']});}
if(typeof ResizeObserver!=='undefined'){const ro=new ResizeObserver(schedule);if(ui)ro.observe(ui);if(door)ro.observe(door);}
schedule();})();
