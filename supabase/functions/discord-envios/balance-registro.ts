import './balance-exacto-core.js';
import {BASE} from './catalogo.ts';
// El registro precios contiene solo cambios, no todo el catálogo.
export function preciosCatalogo(data:any){
 const prices:Record<string,number>={...BASE};
 for(const p of Array.isArray(data.productos)?data.productos:[])if(p?.name&&p.price!=null&&Number.isFinite(Number(p.price))&&Number(p.price)>=0)prices[p.name]=Math.round(Number(p.price)*100);
 for(const [name,value] of Object.entries(data.precios||{}))if(value!=null&&Number.isFinite(Number(value))&&Number(value)>=0)prices[name]=Math.round(Number(value)*100);
 return prices;
}
const normal=(n:string)=>String(n||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export function calcularBalance(data:any,ref:any){
 const recipes=data.recetas||{},names=Object.values(recipes).flat().map((x:any)=>x.m);
 const aliases:Record<string,string>={'mena de hierro':'Hierro','menas de hierro':'Hierro','mena de carbon':'Carbón','menas de carbon':'Carbón','tornillos':'Tornillo','canon de reptidora':'Cañón de repetidora','canon de repetidora':'Cañón de repetidora','tablones':'Tabla de madera','tablon':'Tabla de madera','tablas de madera':'Tabla de madera','trozo madera':'Trozo de madera','trozos de madera':'Trozo de madera','pieza de armas':'Pieza de arma','piezas de arma':'Pieza de arma','piezas de armas':'Pieza de arma'};
 const canon=(n:string)=>aliases[normal(n)]||names.find((x:any)=>normal(x)===normal(n))||n;
 const price=(x:any,n:string)=>{const p=(data.pedidos||[]).find((p:any)=>x.why==='Pedido '+p.code);if(p)return (p.items||[]).find((i:any)=>canon(i.material)===n)?.price||0;const c=(data.compras||[]).find((c:any)=>x.why==='Compra '+c.code);return c&&canon(c.material)===n?c.price||0:0;};
 const core=(globalThis as any).HGBalanceExacto,result=core.replay({moves:data.movimientos||[],recipeOf:(n:string)=>recipes[n]||[],canon,priceOfMove:price});
 for(const g of result.groups){if(g.why==='Fabricación deshecha'){const prev=result.groups.slice(0,result.groups.indexOf(g)).reverse().find((p:any)=>p.why==='Fabricación'&&!p.undone&&Object.keys(g.prods).some(n=>p.prods[n]));if(prev)prev.undone=true;}}
 const day=(ts:number)=>{const p=new Date(ts).toLocaleDateString('en-CA',{timeZone:'Europe/Madrid'});return Math.floor(Date.parse(p+'T00:00:00Z')/86400000);};
 let groups=result.groups.filter((g:any)=>g.why==='Fabricación'&&(ref.hist?(!g.undone&&(ref.hist==='todo'||day(g.ts)>=ref.hist.s&&day(g.ts)<=ref.hist.e)):ref.autoVenta?g.ref===ref.autoVenta:ref.enc?g.ref===ref.enc&&Math.abs(g.ts-ref.ts)<2000:Math.abs(g.ts-ref.ts)<2000&&(!ref.emp||g.who===ref.emp))); 
 if(ref.undo){const u=result.groups.find((g:any)=>g.why==='Fabricación deshecha'&&Math.abs(g.ts-ref.ts)<2000&&g.who===ref.emp),prior=u?result.groups.slice(0,result.groups.indexOf(u)).reverse().find((g:any)=>g.why==='Fabricación'&&Object.keys(u.prods).some(n=>g.prods[n])):null;groups=prior?[prior]:[];}
 if(!groups.length||groups.some((g:any)=>g.unassigned.length))throw Error('BALANCE_NO_CONFIRMADO');
 const prices=preciosCatalogo(data),lines=core.lines(groups,(n:string)=>prices[n]??0);if(!lines.length)throw Error('BALANCE_NO_CONFIRMADO');
 return {lines,groups};
}
export function textoBalance(lines:any[],f:any){
 const cash=(n:number)=>'$'+(n/100).toFixed(2),date=new Date(Number(f.ts)).toLocaleString('es-ES',{timeZone:'Europe/Madrid'});
 const out=[...(f.undo?['FABRICACIÓN ANULADA · no cuenta en el balance vigente']:[]),...(f.hist?['Historial de fabricación · '+(f.hist==='todo'?'todo':f.hist.s+' – '+f.hist.e)]:['Por: '+f.emp,'Fecha: '+date]),...(f.autoVenta?['Venta: '+f.autoVenta]:[]),''];
 for(const l of lines){out.push(l.n+' · '+l.q+' unidades');for(const m of l.mats)out.push('  '+m.q+' × '+m.m+': '+cash(m.cost));out.push('  Coste total: '+cash(l.tc),'  Valor de venta: '+cash(l.tp),'  Resultado: '+cash(l.res),'');}
 out.push('BALANCE TOTAL: '+cash(lines.reduce((s:number,l:any)=>s+l.res,0)),'Materiales asignados por receta. La pólvora usada en munición se cuenta una sola vez.');return out.join('\n');
}
export async function balanceRegistro(admin:any,f:any){
 const row=async(k:string)=>{const {data,error}=await admin.from('datos').select('valor').eq('clave',k).maybeSingle();if(error)throw Error('DATOS');return data?.valor;};
 const prefix=async(p:string)=>{const values=[];for(let start=0;start<100000;start+=500){const {data,error}=await admin.from('datos').select('clave,valor').like('clave',p+'%').order('clave').range(start,start+499);if(error||!Array.isArray(data))throw Error('DATOS');values.push(...data.map((x:any)=>x.valor));if(data.length<500)return values;}throw Error('HISTORIAL_INCOMPLETO');};
 const [recetas,precios,productos,movimientos,pedidos,compras]=await Promise.all([row('recetas'),row('precios'),row('productos'),prefix('mov:'),prefix('pedido:'),prefix('compra:')]);
 const {lines}=calcularBalance({recetas,precios,productos,movimientos,pedidos,compras},f);return {title:f.undo?'FABRICACIÓN DESHECHA · BALANCE ANULADO':'BALANCE DE FABRICACIÓN',description:textoBalance(lines,f)};
}
