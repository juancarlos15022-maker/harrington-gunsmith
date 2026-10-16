/* Proyección privada de plantilla y ausencias; nunca altera la paginación REST. */
(function(){'use strict';if(SANDBOX)return;
let flight=null,identity=ME?.id||'';const originalPull=cloudPullRecords;
cloudPullRecords=function(){
 if(flight)return flight;
 const run=async()=>{const id=ME?.id||'';if(id!==identity){identity=id;cloud.seenA={};cloud.since='';}
  const got=await originalPull();if(!AUTH?.at||!id)return got;
  const rows=await sbRpc('hg_ausencias_publicas',{});
  if((ME?.id||'')!==id)throw Error('SESION_CAMBIADA');
  if(!Array.isArray(rows))throw Error('Respuesta de ausencias inválida');
  const seen=cloud.seenA||(cloud.seenA={}),changed=rows.filter(x=>seen[x.clave]!==x.actualizado);applyRecords(changed);changed.forEach(x=>seen[x.clave]=x.actualizado);return got+changed.length;
 };
 const p=run();flight=p;const clear=()=>{if(flight===p)flight=null};p.then(clear,clear);return p;
};
const aplicar=applyMe;applyMe=function(){const r=aplicar.apply(this,arguments);if(ME&&ME.id!=='emuzvkc99z8q'){gastos=[];try{localStorage.removeItem(KEY_GASTOS);localStorage.removeItem(KEY_CIERRES);const a=JSON.parse(localStorage.getItem(KEY_AUS)||'[]').map(x=>{if(x.empId!==ME.id){delete x.motivo;delete x.cat;delete x.nota;}return x});ausencias=a;localStorage.setItem(KEY_AUS,JSON.stringify(a));}catch{}}return r};
})();
