/* La cantidad elegida es producto terminado: el aceite se elabora en lotes de diez. */
(function(){'use strict';const oil='Aceite de Arma',round=q=>Math.ceil(q/10)*10;
 const lote=fabLote;fabLote=function(n){return n===oil?10:lote.apply(this,arguments);};
 const text=recipeText;recipeText=function(n){const r=text.apply(this,arguments);return n===oil&&r?r+' · produce 10 unidades por elaboración':r;};
 const need=needMaterials;needMaterials=function(items){
  for(const x of items)if(x.producto===oil&&x.delta>0)x.delta=round(x.delta);
  return need(items.map(x=>x.producto===oil?{...x,delta:x.delta/10}:x));
 };
 const list=fqItems;fqItems=function(){return list.apply(this,arguments).map(x=>x.producto===oil?{...x,delta:round(x.delta)}:x);};
 const make=canMake;canMake=function(n){if(n!==oil)return make.apply(this,arguments);if(!recipeOf(n).length)return null;let lo=0,hi=999;const reserved={};for(const [k,L]of Object.entries(reservas('')))reserved[k]=L.reduce((s,x)=>s+x.qty,0);while(lo<hi){const b=Math.ceil((lo+hi)/2);if(HGAutoFabricacion.fabrication([{producto:n,delta:b*10}],stockMap,recetas,r=>r.p&&!isMatProd(r.m)?r.m:ingKey(r.m),reserved).ok)lo=b;else hi=b-1;}return lo*10;};
 const cost=productCost;productCost=function(n){const c=cost.apply(this,arguments);return n===oil&&typeof c==='number'?c/10:c;};
 const base=productCostBase;productCostBase=function(n){const c=base.apply(this,arguments);return n===oil&&typeof c==='number'?c/10:c;};
 const cheap=productCheapCost;productCheapCost=function(n){const c=cheap.apply(this,arguments);return n===oil&&c&&typeof c.c==='number'?{...c,c:c.c/10}:c;};
 const mats=fbMats;fbMats=function(n){const r=mats.apply(this,arguments);return n===oil?r.map(x=>({...x,q:x.q/10})):r;};
 const render=renderModFabricar;renderModFabricar=function(){return '<p class="bk-note"><b>Aceite para armas:</b> cada elaboración produce 10 unidades con 3 de grasa animal, 1 botella vacía y 1 de pólvora. Las cantidades se completan por lotes de 10.</p>'+render.apply(this,arguments);};
})();
