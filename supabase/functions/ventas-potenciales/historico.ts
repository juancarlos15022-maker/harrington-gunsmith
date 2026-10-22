import {BASE} from './catalogo.ts';
type Dic=Record<string,number>;
export function historico(s:any){
 const h=s.historial||{},fabricacion=h.fabricacion||[],ventas=h.ventas||[],precios:Dic={...BASE};for(const [n,p]of Object.entries(s.precios||{}))if(Number(p)>=0)precios[n]=Math.round(Number(p)*100);
 const cobrados:Dic={};for(const x of ventas)if(Number(x.precio_medio)>0)cobrados[x.producto]=Number(x.precio_medio);
 const receta=s.recetas||{},stock:Dic={};for(const [k,v]of Object.entries(s.stock||{}))stock[k]=Math.max(0,Number(v)-Number(s.npc?.asig?.[k]||0)-Number(s.reservas?.[k]||0));
 const intermedios=new Set(Object.values(receta).flatMap((r:any)=>Array.isArray(r)?r.filter((x:any)=>x.p).map((x:any)=>x.m):[])),vendidos=new Set(ventas.filter((x:any)=>x.unidades>0).map((x:any)=>x.producto));
 const finales=fabricacion.filter((x:any)=>!intermedios.has(x.producto)||vendidos.has(x.producto));
 const fuentes=finales.some((x:any)=>x.unidades>0)?finales:ventas,origen=fuentes===finales?'fabricación':'ventas';
 const simular=(reciente:boolean)=>{const peso=fuentes.filter((x:any)=>Number(reciente?x.recientes:x.unidades)>0&&precios[x.producto]>0).map((x:any)=>({n:x.producto,p:Number(reciente?x.recientes:x.unidades)}));if(!peso.length)return null;
  let pool={...stock},made:Dic={},sold:Dic={},unidades=0,limite=false;const activos=[...peso];
  function consumir(n:string,q:number,b:Dic,c:Dic,path=new Set<string>()){if(path.has(n))throw Error('CICLO');const falta=Math.max(0,q-(b[n]||0));if(falta){const r=receta[n];if(!Array.isArray(r)||!r.length||r.some((x:any)=>!Number.isSafeInteger(x.q)||x.q<=0))throw Error('SIN_RECURSOS');const p=new Set(path);p.add(n);for(const x of r)consumir(x.p?x.m:'mat:'+x.m,falta*x.q,b,c,p);b[n]=(b[n]||0)+falta;c[n]=(c[n]||0)+falta;}b[n]=(b[n]||0)-q;}
  while(activos.length&&unidades<10000){activos.sort((a,b)=>b.p/((sold[b.n]||0)+1)-a.p/((sold[a.n]||0)+1)||a.n.localeCompare(b.n));const x=activos[0],b={...pool},c={...made};try{consumir(x.n,1,b,c);pool=b;made=c;sold[x.n]=(sold[x.n]||0)+1;unidades++;}catch{activos.shift();}}
  if(unidades===10000)limite=true;
  // Se valoran una sola vez los terminados sobrantes; no se fuerza fabricar productos ajenos al patrón.
  for(const [n,q]of Object.entries(pool))if(!n.startsWith('mat:')&&q>0&&precios[n]>0&&(!intermedios.has(n)||vendidos.has(n))){sold[n]=(sold[n]||0)+q;pool[n]=0;}
  const plan=Object.entries(sold).map(([producto,cantidad])=>({producto,cantidad,cents:Math.round(cantidad*precios[producto])}));return {estimado:plan.reduce((a,x)=>a+x.cents,0),cobroHabitual:Math.round(plan.reduce((a,x)=>a+x.cantidad*(cobrados[x.producto]??precios[x.producto]),0)),plan,fabricar:made,sobrantes:pool,limite,ventana:reciente?7:30};
 };
 const mes=simular(false),semana=simular(true);
 // Trazabilidad exacta del lote; no se atribuyen a una persona faltantes deducidos de una previsión.
 const destinos:Record<string,any>={};for(const l of h.lotes||[])for(const m of l.materiales||[]){const key=m.material+'|'+(l.productos||[]).map((p:any)=>p.producto).sort().join(', ');if(!destinos[key])destinos[key]={material:m.material,productos:(l.productos||[]).map((p:any)=>p.producto),cantidad:0,lotes:0};destinos[key].cantidad+=m.cantidad;destinos[key].lotes++;}
 return {mes,semana,origen,desde:h.desde,hasta:h.hasta,fabricacion,ventas,consumos:h.consumos||[],destinos:Object.values(destinos),lotesSinAlta:(h.lotes||[]).filter((l:any)=>l.materiales?.length&&!l.productos?.length).map((l:any)=>({lote:l.lote,autor:l.autor,momento:l.momento,materiales:l.materiales})),cobertura:h.cobertura||'Sin histórico registrado suficiente.',nota:'Escenario orientativo según la mezcla histórica, limitado por las existencias y las recetas actuales. No es una cifra exigible a los empleados ni un intervalo de confianza. El material sobrante no se da por vendido.'};
}
