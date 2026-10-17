/* Nómina del negocio: hasta cinco horas extra pagadas por persona y semana. */
(function(root){'use strict';
const MAX_EXTRA_MS=5*3600000;
function limitar(k){
 if(k.paid)return k;
 const extraReal=Math.max(0,Number(k.extraReal??k.extra)||0),extra=Math.min(extraReal,MAX_EXTRA_MS);
 const ext=Math.round(Number(k.base)*extra/(Number(k.c)*3600000));
 return {...k,extraReal,extra,extraNoPagada:extraReal-extra,ext,pay:k.base-k.desc+ext};
}
root.HGNominas={limitar,MAX_EXTRA_MS};
if(typeof module==='object'&&module.exports){module.exports=root.HGNominas;return;}
if(typeof sueCalc!=='function')return;
const calcular=sueCalc;sueCalc=function(){return limitar(calcular.apply(this,arguments));};
const render=renderModSueldos;renderModSueldos=function(){return render.apply(this,arguments).replace('Las horas de más se muestran, pero no se pagan.','Se pagan como máximo 5 horas extra por empleado y semana, a su tarifa habitual. El exceso queda registrado, pero no se paga.');};
})(globalThis);
