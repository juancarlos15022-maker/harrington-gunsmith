export function tipoSemanal(kind:string,payload:any,filenames:string[]=[]){
 if(['ventas_semanales','gastos_semanales'].includes(kind))return kind;
 const head=(payload?.embeds||[]).map((e:any)=>String(e.title||'')+'\n'+String(e.description||'')).join('\n').slice(0,900).replace(/\*\*/g,'');
 if(kind==='ventas'&&(/REGISTRO SEMANAL DE VENTAS/i.test(head)||filenames.some(n=>/_Ventas_TODOS\.txt$/i.test(n))))return 'ventas_semanales';
 if(kind==='gastos'&&(/REGISTRO DE GASTOS\s*·\s*SEMANAL/i.test(head)||filenames.some(n=>/^Gastos_Semanal_/i.test(n))))return 'gastos_semanales';
 return null;
}
