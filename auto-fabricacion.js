/* Plan de venta sin efectos: el servidor vuelve a calcularlo al confirmar. */
(function(root){
 'use strict';
 function plan(items,stock,recipes,key,reserved){
  const sold={},made={},used={},missing=[];
  for(const x of items){if(!Number.isInteger(x.qty)||x.qty<0)throw Error('Cantidad inválida');sold[x.name]=(sold[x.name]||0)+x.qty}
  const available=n=>Math.max(0,(stock[n]||0)-(reserved[n]||0));
  for(const n of Object.keys(sold)){
   const q=Math.max(0,sold[n]-available(n));if(!q)continue;
   const r=recipes[n];
   if(!Array.isArray(r)||!r.length){missing.push(n+': faltan '+q+' unidades y no hay receta');continue}
   made[n]=q;
   for(const i of r){if(!i.m||!Number.isInteger(i.q)||i.q<=0)throw Error('Receta inválida: '+n);const k=key(i);used[k]=(used[k]||0)+q*i.q}
  }
  for(const k of Object.keys(used)){
   // Los ingredientes deben estar disponibles antes de fabricar; no se encadenan recetas.
   const q=used[k]+(sold[k]||0)-available(k);
   if(q>0)missing.push(k.replace(/^mat:/,'')+': faltan '+q);
  }
  return {ok:!missing.length,sold,made,used,missing};
 }
 const api={plan};if(typeof module==='object'&&module.exports)module.exports=api;else root.HGAutoFabricacion=api;
})(typeof globalThis==='object'?globalThis:this);
