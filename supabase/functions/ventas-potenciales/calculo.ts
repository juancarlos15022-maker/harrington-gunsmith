import solver from 'npm:javascript-lp-solver@1.0.3';
import {BASE} from './catalogo.ts';
type Dic=Record<string,number>;
export function potencial(s:any,timeout=100){
 const warnings:string[]=[],stock:Dic={},reserved=s.reservas||{},npc=s.npc?.asig||{},prices:Dic={...BASE};
 for(const [n,p]of Object.entries(s.precios||{})){if(Number.isFinite(Number(p))&&Number(p)>=0)prices[n]=Math.round(Number(p)*100);}
 for(const p of Array.isArray(s.productos)?s.productos:[]){const n=p.n||p.name;if(n&&!Object.hasOwn(s.precios||{},n)&&Number.isFinite(Number(p.p??p.price)))prices[n]=Math.round(Number(p.p??p.price)*100);}
 for(const [k,v]of Object.entries(s.stock||{})){const q=Number(v)-Number(npc[k]||0)-Number(reserved[k]||0);if(!Number.isSafeInteger(q))throw Error('STOCK_INVALIDO');if(q<0)warnings.push(k+': reservas/NPC superan existencias');stock[k]=Math.max(0,q);}
 const recipes:Record<string,{k:string,q:number}[]>={},depth:Record<string,number>={};
 for(const [n,list]of Object.entries(s.recetas||{})){if(!Array.isArray(list)||!list.length||list.some((x:any)=>!x.m||!Number.isSafeInteger(x.q)||x.q<=0)){warnings.push(n+': receta no válida; fabricación no valorada');continue;}recipes[n]=list.map((x:any)=>({k:x.p?x.m:'mat:'+x.m,q:x.q}));}
 const visiting=new Set<string>();function visit(k:string):number{if(depth[k]!==undefined)return depth[k];if(visiting.has(k))throw Error('RECETA_CICLICA');visiting.add(k);const d=recipes[k]?1+Math.max(0,...recipes[k].map(x=>visit(x.k))):0;visiting.delete(k);return depth[k]=d;}
 Object.keys(recipes).forEach(visit);
 const keys=new Set(Object.keys(stock));Object.entries(recipes).forEach(([n,l])=>{keys.add(n);l.forEach(x=>keys.add(x.k))});Object.keys(prices).forEach(n=>keys.add(n));
 const ks=[...keys],rid=Object.fromEntries(ks.map((k,i)=>[k,'r'+i])),variables:any={},constraints:any={},ints:any={},sales:any={},crafts:any={};
 ks.forEach(k=>constraints[rid[k]]={max:stock[k]||0});
 Object.entries(prices).forEach(([n,p],i)=>{if(p<=0){if((stock[n]||0)>0)warnings.push(n+': sin precio de venta');return;}const id='s'+i;variables[id]={valor:p,[rid[n]]:1};ints[id]=1;sales[id]={n,p};});
 Object.entries(recipes).forEach(([n,l],i)=>{const id='c'+i,v:any={valor:0,[rid[n]]:-1};for(const x of l)v[rid[x.k]]=(v[rid[x.k]]||0)+x.q;variables[id]=v;ints[id]=1;crafts[id]={n,l};});
 const model:any={optimize:'valor',opType:'max',constraints,variables,ints,options:{timeout,tolerance:0}};
 let result:any;try{result=solver.Solve(model)}catch{warnings.push('Se utiliza el plan conservador por límite de cálculo');}
 const valid=(r:any)=>{if(!r?.feasible)return false;for(const id of Object.keys(variables)){const q=Number(r[id]||0);if(!Number.isSafeInteger(q)||q<0)return false;}for(const k of ks){let used=0;for(const [id,v]of Object.entries(variables))used+=Number((v as any)[rid[k]]||0)*Number(r[id]||0);if(used>(stock[k]||0))return false;}return true;};
 if(!valid(result)){result={feasible:true};for(const [id,x]of Object.entries(sales))result[id]=stock[(x as any).n]||0;}
 // El solver puede devolver una relajación fraccionaria al agotar su tiempo.
 // Reconstruimos varios planes enteros ejecutables, sin aceptar piezas fraccionarias.
 const relaxed:any=solver.Solve({...model,ints:{}}),entries=Object.entries(sales) as [string,any][],craftId=Object.fromEntries(Object.entries(crafts).map(([id,x]:any)=>[x.n,id]));
 const value=(r:any)=>entries.reduce((z,[id,x])=>z+(r[id]||0)*x.p,0);
 function heuristic(order:[string,any][],targets:boolean){let pool={...stock},made:Dic={},sold:Dic={};
  function consume(n:string,q:number,b:Dic,c:Dic){const need=Math.max(0,q-(b[n]||0));if(need){if(!recipes[n])throw Error('MATERIAL_INSUFICIENTE');for(const x of recipes[n])consume(x.k,need*x.q,b,c);b[n]=(b[n]||0)+need;c[craftId[n]]=(c[craftId[n]]||0)+need;}b[n]=(b[n]||0)-q;}
  for(const [id,x,limited]of [...order.map(([id,x])=>[id,x,targets] as const),...(targets?order.map(([id,x])=>[id,x,false] as const):[])]){let lo=0,hi=limited?Math.max(0,Math.floor(Number(relaxed[id]||0)+1e-7)):1000000;while(lo<hi){const mid=Math.ceil((lo+hi)/2);try{consume(x.n,mid,{...pool},{...made});lo=mid;}catch{hi=mid-1;}}if(lo){consume(x.n,lo,pool,made);sold[id]=(sold[id]||0)+lo;}}
  return {feasible:true,...made,...sold};
 }
 function scarcity(n:string,path=new Set<string>()):number{if(path.has(n))return Infinity;if(!recipes[n])return 1/((stock[n]||0)+1);const next=new Set(path);next.add(n);return recipes[n].reduce((z,x)=>z+x.q*scarcity(x.k,next),0);}
 const orders=[entries.slice().sort((a,b)=>b[1].p-a[1].p),entries.slice().sort((a,b)=>b[1].p/(scarcity(b[1].n)||1)-a[1].p/(scarcity(a[1].n)||1)),entries.slice().sort((a,b)=>(Number(relaxed[b[0]]||0)*b[1].p)-(Number(relaxed[a[0]]||0)*a[1].p))];
 for(const order of orders)for(const targets of [true,false]){const r=heuristic(order,targets);if(valid(r)&&value(r)>value(result))result=r;}

 const plan=Object.entries(sales).filter(([id])=>result[id]>0).map(([id,x]:any)=>({producto:x.n,cantidad:result[id],cents:x.p*result[id]}));const lower=plan.reduce((a,x)=>a+x.cents,0);
 // Certificado dual en enteros (microcéntimos): cota superior independiente del timeout MIP.
 const dc:any={},dv:any={};for(const [id,v]of Object.entries(variables))dc[id]={min:(v as any).valor};for(const k of ks){const z:any={coste:stock[k]||0};for(const [id,v]of Object.entries(variables))if((v as any)[rid[k]])z[id]=(v as any)[rid[k]];dv[rid[k]]=z;}
 const dual:any=solver.Solve({optimize:'coste',opType:'min',constraints:dc,variables:dv});if(!dual.feasible||!dual.bounded)throw Error('COTA_NO_DISPONIBLE');
 const M=1000000n,y:Record<string,bigint>={};for(const k of ks){const v=Math.max(0,Number(dual[rid[k]]||0));if(!Number.isSafeInteger(Math.ceil(v*1e6)+1))throw Error('COTA_INVALIDA');y[k]=BigInt(Math.ceil(v*1e6)+1);}
 for(const [n,p]of Object.entries(prices))if(p>0)y[n]=y[n]>BigInt(p)*M?y[n]:BigInt(p)*M;
 for(const n of Object.keys(recipes).sort((a,b)=>depth[b]-depth[a])){const l=recipes[n],cost=l.reduce((v,x)=>v+BigInt(x.q)*y[x.k],0n);if(cost<y[n]){const x=l[0],q=BigInt(x.q);y[x.k]+=(y[n]-cost+q-1n)/q;}}
 for(const [id,v]of Object.entries(variables)){const c=ks.reduce((z,k)=>z+BigInt((v as any)[rid[k]]||0)*y[k],0n);if(c<BigInt((v as any).valor)*M)throw Error('CERTIFICADO_INVALIDO');}
 const upper=Number(ks.reduce((z,k)=>z+BigInt(stock[k]||0)*y[k],0n)/M);if(upper<lower)throw Error('COTA_INVALIDA');
 const finished=Object.entries(prices).reduce((z,[n,p])=>z+(stock[n]||0)*p,0);
 return {min:lower,max:upper,exacto:lower===upper,plan,fabricar:Object.entries(crafts).filter(([id])=>result[id]>0).map(([id,x]:any)=>({producto:x.n,cantidad:result[id]})),existenciasATarifa:finished,advertencias:warnings,metodo:'Máximo de ingresos brutos a tarifa; plan entero viable y cota superior certificada. Sin compras nuevas, NPC ni stock reservado. Sin descuentos, demanda garantizada ni beneficio neto.'};
}
export function auditarStock(s:any,p:any){if(!p)return [];const sums:Dic={};for(const m of s.diario||[])sums[m.producto]=(sums[m.producto]||0)+m.delta;const keys=new Set([...Object.keys(p.stock||{}),...Object.keys(s.stock||{}),...Object.keys(sums)]);return [...keys].map(k=>({producto:k,esperado:Number(p.stock?.[k]||0)+(sums[k]||0),registrado:Number(s.stock?.[k]||0)})).filter(x=>x.esperado!==x.registrado);}
export function impactoInventario(s:any,items:any[]){const antes={...s,stock:{...s.stock}};for(const x of items)antes.stock[x.k]=Number(s.stock[x.k]||0)-Number(x.diff||0);const previo=potencial(antes),actual=potencial(s);return {antes:previo,despues:actual,reduccion:{min:previo.min-actual.max,max:previo.max-actual.min},diferencias:items.filter(x=>x.diff!==0)};}
