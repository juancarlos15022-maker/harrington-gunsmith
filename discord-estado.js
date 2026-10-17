/* Una confirmación posterior del servidor también resuelve el aviso local. */
(function(){'use strict';if(SANDBOX)return;
const apply=applyRecord;applyRecord=function(key,value){
 const result=apply.apply(this,arguments);
 if(key.startsWith('dcerr:')&&value?.deleted){const kind=key.slice(6),h=DCH[kind];if(h&&Number(value.ts)>=Number(h.ts)){delete DCH[kind];saveDCH();}}
 return result;
};
// Agrupar cambios mientras viaja la edición anterior; enviar después el último estado.
const publish=invPublish,flights=new Map(),again=new Set();
invPublish=function(kind){
 if(flights.has(kind)){again.add(kind);return flights.get(kind);}
 const p=Promise.resolve().then(async()=>{do{again.delete(kind);await publish(kind);}while(again.has(kind));}).finally(()=>flights.delete(kind));
 flights.set(kind,p);return p;
};
})();
