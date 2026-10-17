/* Una lectura anterior a un movimiento nunca sustituye al stock recién confirmado. */
(function(){'use strict';
 let revision=0,flight=null;
 const apply=applyStockMap;
 applyStockMap=function(){const previous=stockMap,r=apply.apply(this,arguments);if(previous!==stockMap)revision++;return r;};
 const identity=()=>String(ME?.id||'')+'|'+String(AUTH?.emp||'');
 refreshStock=function(){
  const owner=identity();if(flight&&flight.owner===owner)return flight.promise;
  const current={owner,promise:null};
  current.promise=Promise.resolve().then(async()=>{
   for(let attempt=0;attempt<3;attempt++){
    const version=revision;
    const r=await sbFetch('/rest/v1/stock?select=producto,cantidad');
    if(!r.ok)throw await cloudResponseError(r);
    const rows=await r.json();
    if(identity()!==owner)throw new Error('La cuenta ha cambiado durante la lectura del almacén');
    if(!Array.isArray(rows)||rows.some(x=>!x||typeof x.producto!=='string'||!Number.isFinite(x.cantidad)||x.cantidad<0))throw new Error('Respuesta de almacén inválida');
    if(version!==revision)continue;
    const m={};for(const x of rows)Object.defineProperty(m,x.producto,{value:x.cantidad,enumerable:true,writable:true,configurable:true});
    applyStockMap(m);return;
   }
   throw new Error('El almacén sigue cambiando. Vuelve a comprobar las cantidades.');
  });
  flight=current;
  const clear=()=>{if(flight===current)flight=null;};current.promise.then(clear,clear);
  return current.promise;
 };
})();
