/* Reconstrucción de fabricación: FIFO y reparto por ingrediente de cada receta. */
(function(root){'use strict';
function replay({moves,recipeOf,canon=x=>x,materialProduct=x=>x==='Pólvora',priceOfMove=()=>0}){
 const lots={},groups=[],lastUnit={};let group=null;
 const clean=x=>String(x||'').replace(/ \(material\)$/,'');
 const name=x=>/ \(material\)$/.test(x)?canon(clean(x)):String(x);
 const list=n=>lots[n]||(lots[n]=[]);
 const take=(n,q)=>{const total=q;let cost=0,qp=0,internal={};const a=list(n);while(q>0&&a.length){const l=a[0],u=Math.min(q,l.q);cost+=u*l.c;if(l.c>0)qp+=u;if(l.batch)internal[l.batch]=(internal[l.batch]||0)+u;l.q-=u;q-=u;if(l.q<1e-9)a.shift();}if(total)lastUnit[n]=cost/total;return {cost,qp,internal};};
 function close(){if(!group)return;const g=group;group=null;const made=g.prods,consumed={},alloc={},state={},lineBy={},newUsed={},inputs=g.inputs;
  // Solo las recetas que usan un ingrediente reciben su cantidad y su coste.
  for(const [m,total] of Object.entries(inputs)){
   const needs={};for(const [n,q] of Object.entries(made))for(const r of recipeOf(n)||[]){const k=r.p||materialProduct(r.m)?r.m:canon(r.m);if(k===m)needs[n]=(needs[n]||0)+Number(r.q)*q;}
   const expected=Object.values(needs).reduce((a,b)=>a+b,0);alloc[m]={};
   if(expected>0)for(const [n,q]of Object.entries(needs))alloc[m][n]=total*q/expected;
   else{g.unassigned.push({m,q:total});}
   if(Math.abs(expected-total)>1e-8)g.estimated=true;
  }
  function used(m){if(consumed[m])return consumed[m];if(made[m])produce(m);const c=take(m,inputs[m]||0);for(const [batch,q]of Object.entries(c.internal))if(batch===g.id)newUsed[m]=(newUsed[m]||0)+q;return consumed[m]=c;}
  function produce(n){if(state[n]===2)return;if(state[n]===1)throw Error('RECETA_CICLICA: '+n);state[n]=1;const mats=[];let cost=0;
   for(const [m,total]of Object.entries(inputs)){const q=alloc[m]?.[n]||0;if(!q)continue;const c=used(m),ratio=q/total;const entry={m,q,qp:c.qp*ratio,cost:c.cost*ratio};mats.push(entry);cost+=entry.cost;}
   const q=made[n];lineBy[n]={n,q,tc:cost,mats};list(n).push({q,c:q?cost/q:0,why:'Fabricación',ts:g.ts,date:g.date,batch:g.id});state[n]=2;
  }
  if(g.why==='Fabricación'){
   Object.keys(made).forEach(produce);Object.keys(inputs).forEach(used);
   g.lines=Object.values(lineBy).map(l=>{const remaining=Math.max(0,l.q-(newUsed[l.n]||0)),ratio=l.q?remaining/l.q:0;return {...l,q:remaining,tc:l.tc*ratio,mats:l.mats.map(m=>({...m,q:m.q*ratio,qp:m.qp*ratio,cost:m.cost*ratio}))};}).filter(l=>l.q>1e-8);
   g.cost=g.lines.reduce((a,l)=>a+l.tc,0);
  }else{
   for(const [n,q]of Object.entries(inputs))take(n,q);
   for(const e of g.returns)list(e.m).push({q:e.q,c:e.c||lastUnit[e.m]||0,why:g.why,ts:g.ts,date:g.date});
   g.lines=[];g.cost=0;
  }
  g.closed=true;groups.push(g);
 }
 const phase=x=>x.why==='Fabricación'||x.why==='Fabricación deshecha'?0:1;
 const ordered=moves.map((x,i)=>({...x,_i:i})).sort((a,b)=>(a.ts||0)-(b.ts||0)||String(a.venta||a.encargo||'').localeCompare(String(b.venta||b.encargo||''))||phase(a)-phase(b)||a._i-b._i);
 for(const x of ordered){const why=String(x.why||''),fab=why==='Fabricación',undo=why==='Fabricación deshecha',n=name(x.name),q=Number(x.delta)||0;
  if(fab||undo){const ref=x.venta||x.encargo||'';if(group&&(group.why!==why||group.ref!==ref||group.who!==(x.who||'')||ref&&group.ts!==x.ts||!ref&&Math.abs((x.ts||0)-group.ts)>2000))close();
   if(!group)group={id:'g'+groups.length+'-'+(x.ts||0),ts:x.ts||0,date:x.date,time:x.time,why,ref,who:x.who||'',prods:{},inputs:{},mats:{},returns:[],unassigned:[],estimated:false,lines:[]};
   const isMaterial=/ \(material\)$/.test(x.name)||materialProduct(n);
   if(fab&&q>0){group.prods[n]=(group.prods[n]||0)+q;}
   else if(q<0){group.inputs[n]=(group.inputs[n]||0)-q;if(undo&&(recipeOf(n)||[]).length)group.prods[n]=(group.prods[n]||0)-q;}
   else if(undo&&q>0)group.returns.push({m:n,q,c:0});
  }else{close();if(q>0){const c=Number(priceOfMove(x,n))||0;list(n).push({q,c,why,ts:x.ts||0,date:x.date});}else if(q<0)take(n,-q);}
 }
 close();return {groups,lots};
}
function lines(groups,price){const by={};for(const g of groups)for(const l of g.lines||[]){const o=by[l.n]||(by[l.n]={n:l.n,q:0,tc:0,mats:{}});o.q+=l.q;o.tc+=l.tc;for(const m of l.mats){const z=o.mats[m.m]||(o.mats[m.m]={m:m.m,q:0,qp:0,cost:0});for(const k of ['q','qp','cost'])z[k]+=m[k];}}
 return Object.values(by).filter(l=>price(l.n)>0).map(l=>{const tc=Math.round(l.tc),p=price(l.n),c=l.q?Math.round(tc/l.q):0;return {...l,tc,p,c,d:p-c,tp:p*l.q,res:p*l.q-tc,real:true,mats:Object.values(l.mats).map(m=>({...m,q:Math.round(m.q*1e8)/1e8,qp:Math.round(m.qp*1e8)/1e8,cost:Math.round(m.cost)}))};}).sort((a,b)=>a.res-b.res);
}
root.HGBalanceExacto={replay,lines};
})(globalThis);
