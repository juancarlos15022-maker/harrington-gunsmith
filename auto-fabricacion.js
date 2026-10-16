/* Plan sin efectos: pólvora disponible primero y solo se fabrica la que falte. */
(function(root){'use strict';
function finish(made,used,sold,stock,recipes,key,reserved,explicit){
 const missing=[],available=n=>Math.max(0,(stock[n]||0)-(reserved[n]||0));
 const deficit=Math.max(0,(used['Pólvora']||0)+(sold['Pólvora']||0)-available('Pólvora')-(made['Pólvora']||0));
 let autoPowder=0;if(deficit){const r=recipes['Pólvora'];if(!Array.isArray(r)||!r.length)missing.push('Pólvora: faltan '+deficit+' y no hay receta');else{for(const i of r){if(!i.m||!Number.isInteger(i.q)||i.q<=0||key(i)==='Pólvora')throw Error('Receta inválida: Pólvora');}autoPowder=deficit;made['Pólvora']=(made['Pólvora']||0)+deficit;for(const i of r){const k=key(i);used[k]=(used[k]||0)+deficit*i.q;}}}
 for(const k of Object.keys(used)){const q=used[k]+(sold[k]||0)-available(k)-(k==='Pólvora'||explicit?(made[k]||0):0);if(q>0)missing.push(k.replace(/^mat:/,'')+': faltan '+q);}
 return {ok:!missing.length,sold,made,used,missing,autoPowder};
}
function plan(items,stock,recipes,key,reserved={}){const sold={},made={},used={},missing=[];
 for(const x of items){if(!Number.isInteger(x.qty)||x.qty<0)throw Error('Cantidad inválida');sold[x.name]=(sold[x.name]||0)+x.qty;}
 for(const n of Object.keys(sold)){const q=Math.max(0,sold[n]-Math.max(0,(stock[n]||0)-(reserved[n]||0)));if(!q)continue;const r=recipes[n];if(!Array.isArray(r)||!r.length){missing.push(n+': faltan '+q+' unidades y no hay receta');continue;}made[n]=q;for(const i of r){if(!i.m||!Number.isInteger(i.q)||i.q<=0)throw Error('Receta inválida: '+n);const k=key(i);used[k]=(used[k]||0)+q*i.q;}}
 const p=finish(made,used,sold,stock,recipes,key,reserved,false);p.missing.unshift(...missing);p.ok=!p.missing.length;return p;}
function fabrication(items,stock,recipes,key,reserved={}){const made={},used={};for(const x of items){const n=x.producto,q=x.delta;if(!Number.isInteger(q)||q<=0||q>9999)throw Error('Cantidad inválida');if(made[n])throw Error('Producto duplicado');const r=recipes[n];if(!Array.isArray(r)||!r.length)throw Error('Receta inválida: '+n);made[n]=q;for(const i of r){if(!i.m||!Number.isInteger(i.q)||i.q<=0)throw Error('Receta inválida: '+n);const k=key(i);used[k]=(used[k]||0)+q*i.q;}}return finish(made,used,{},stock,recipes,key,reserved,true);}
const api={plan,fabrication};if(typeof module==='object'&&module.exports)module.exports=api;else root.HGAutoFabricacion=api;
})(typeof globalThis==='object'?globalThis:this);
