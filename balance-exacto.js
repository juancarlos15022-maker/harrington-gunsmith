/* El balance usa los movimientos del almacén; no modifica inventario ni contabilidad. */
(function(){'use strict';
stockReplay=function(){
 if(LOTC&&Date.now()-LOTT<5000)return LOTC;
 const prices=(x,m)=>{const why=String(x.why||'');if(why.startsWith('Pedido ')){const p=pedidos.find(p=>p.code===why.slice(7).trim());return (p?.items||[]).find(i=>sameMat(i.material,m))?.price||0;}if(why.startsWith('Compra ')){const c=cpList().find(c=>c.code===why.slice(7).trim());return c&&sameMat(c.material,m)?c.price||0:0;}return 0;};
 LOTC=HGBalanceExacto.replay({moves:loadLog(KEY_STOCKLOG),recipeOf,canon:canonMat,materialProduct:isMatProd,priceOfMove:prices});LOTT=Date.now();return LOTC;
};
fbReplay=function(){const all=stockReplay().groups;all.forEach(g=>{delete g.undone});for(const g of all){const entries=Object.entries(g.prods);if(g.why!=='Fabricación deshecha'||!entries.length)continue;const prev=all.slice(0,all.indexOf(g)).reverse().find(p=>p.why==='Fabricación'&&!p.undone&&(!g.ref||p.ref===g.ref)&&entries.every(([n,q])=>(p.prods[n]||0)>=q));if(prev)prev.undone=true;}const F=all.filter(g=>g.why==='Fabricación'&&!g.undone&&Object.keys(g.prods).length);F.all=all;return F;};
fbRealLines=function(groups){return HGBalanceExacto.lines(groups,productPrice);};
const oldText=fbText;fbText=function(){return oldText.apply(this,arguments).replace(/comprado en pedidos/g,'coste registrado')};
LOTC=null;
})();
/* Cada tarjeta se enlaza con sus movimientos, no con el último lote de otra operación. */
(function(){'use strict';let sendingRef='';
const payload=dcPayload;dcPayload=function(kind,text,img){const p=payload.apply(this,arguments);if(kind==='fabricacion'){if(sendingRef)p._hg={kind,ref:sendingRef};else if(String(text).includes('BALANCE DE FABRICACIÓN · ')){const r=fbPeriods()[fbPer]?.[1];p._hg={kind,ref:r?'hist:'+r.s+':'+r.e:'hist:todo'};}}return p;};
fbAuto=function(items,undo){
 const w=whoAmI(),F=fbReplay(),all=F.all||[],wanted=items.filter(x=>x.delta>0&&recipeOf(x.producto).length);
 const eligible=all.filter(g=>g.who===w.name&&Date.now()-g.ts<120000&&(undo?g.why==='Fabricación deshecha':g.why==='Fabricación'&&wanted.every(x=>g.prods[x.producto]===x.delta)));
 const g=eligible.at(-1);if(!g)return;
 const source=loadLog(KEY_STOCKLOG).find(x=>x.uid&&x.who===g.who&&x.why===g.why&&(g.ref?(x.venta||x.encargo)===g.ref:Math.abs(x.ts-g.ts)<2000));if(!source)return;
 const lines=fbRealLines([undo?all.slice().reverse().find(x=>x.why==='Fabricación'&&x.ts<g.ts&&Object.keys(g.prods).every(n=>x.prods[n]))||g:g]);if(!lines.length)return;
 sendingRef='mov:'+source.uid;try{discordSend('fabricacion',fbEmb(undo?'FABRICACIÓN DESHECHA · BALANCE ANULADO':'BALANCE DE FABRICACIÓN',lines,['**Fecha:** '+fmtDate(g.ts)+' · '+fmtTime(g.ts),'**Por:** '+w.name],undo));}finally{sendingRef='';}
};
})();
PARCHES.push({f:'17/10/2026',t:'Balance de fabricación por receta',v:'3.0',i:['Cada producto muestra solo los materiales usados por su receta','La pólvora usada en munición se cuenta una sola vez y conserva su coste FIFO','Cada publicación de Discord se vincula a los movimientos exactos de su operación','El historial excluye de forma estable las fabricaciones deshechas']});
