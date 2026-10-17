export async function validarMensaje(admin:any,kind:string,ref:string,emp:string,nom:string,owner=false){
const row=async(k:string)=>{const {data,error}=await admin.from('datos').select('valor').eq('clave',k).maybeSingle();if(error)throw Error('DATOS');return data?.valor;};
const cash=(n:any)=>'$'+(Number(n||0)/100).toFixed(2),items=(a:any[])=>a.map(x=>x.qty+' × '+x.name+' · '+cash(x.cents)).join('\n');let title='',desc='',record=ref;
if(kind==='ventas'||kind==='encargos'){
 const s=await row('venta:'+ref),e=await row('encargo:'+ref);if(!s&&!e)throw Error('OPERACION_NO_CONFIRMADA');
 const v=s||e;if(v.employee!==nom&&v.empId!==emp&&!(v.npc===true&&v.by===nom)&&!(kind==='encargos'&&e?.cancelled))throw Error('OPERACION_AJENA');
 if(kind==='ventas'&&s?.op!=='venta')throw Error('CANAL_INVALIDO');
 title=e?.cancelled?'ENCARGO CANCELADO · '+ref:(s?.op==='encargo'?'ENCARGO · ':'VENTA · ')+ref;
 desc='Cliente: '+v.client+'\nEmpleado: '+(v.employee||v.by||'NPC')+'\n'+items(v.items||[])+'\nTotal: '+cash(v.totalCents)+'\n'+(s?.op==='encargo'?'Anticipo: '+cash(v.paidCents)+' · Pendiente: '+cash(v.pendingCents):'Cobrado: '+cash(v.dueCents))+(v.fromEncargo?'\nEntrega de encargo: '+v.fromEncargo:'');record=e?.cancelled?'encargo:'+ref+':cancelado':'venta:'+ref;
}else if(kind==='stock'||kind==='materiales'){
 const {data,error}=await admin.from('stock').select('producto,cantidad,minimo').order('producto');if(error)throw Error('DATOS');title=kind==='stock'?'STOCK DE PRODUCTOS':'ALMACÉN DE MATERIALES';desc=(data||[]).filter((x:any)=>kind==='materiales'?x.producto.startsWith('mat:')||x.producto==='Pólvora':!x.producto.startsWith('mat:')&&x.producto!=='Pólvora').map((x:any)=>x.producto.replace(/^mat:/,'')+' · '+x.cantidad+(x.cantidad<=x.minimo?' ⚠':'')).join('\n');record=kind;
}else if(kind==='clientes'||kind==='agenda'){
 const a=await row(kind);const c=Array.isArray(a)?a.find(x=>x.id===ref):null;if(!c)throw Error('FICHA_NO_CONFIRMADA');title=kind==='clientes'?'FICHA DE CLIENTE':'FICHA DE CONTACTO';desc='Nombre: '+c.name+'\nTelegrama: '+(c.telegram||c.tel||'—');if(kind==='clientes')desc+='\nIdentificación: '+(c.ident||'—')+'\nArmas:\n'+(c.series||[]).map((x:any)=>x.s+' · '+(x.a||'')+' · '+(x.ic?'Registrada IC':'Pendiente IC')).join('\n');else desc+='\nQuién es: '+(c.tipo||'—')+'\nObservaciones: '+(c.obs||'—');record=kind+':'+ref;
}else if(kind==='fichajes'){
 let f=await row(ref);if(!f||!(/^(fichaje|turno):/.test(ref))||!owner&&(f.empId&&f.empId!==emp||f.name!==nom))throw Error('FICHAJE_NO_CONFIRMADO');title=ref.startsWith('turno:')?'SALIDA · '+f.name:'ENTRADA · '+f.name;desc='Desde: '+new Date(Number(f.start)).toLocaleString('es-ES',{timeZone:'Europe/Madrid'})+(f.end?'\nHasta: '+new Date(Number(f.end)).toLocaleString('es-ES',{timeZone:'Europe/Madrid'}):'');record=ref+':'+f.start;
}else if(kind==='ausencias'){
 const f=await row('ausencia:'+ref);if(!f||f.empId!==emp)throw Error('AUSENCIA_NO_CONFIRMADA');title='AUSENCIA · '+f.name;desc='Desde: '+new Date(Number(f.start)).toLocaleDateString('es-ES',{timeZone:'Europe/Madrid'})+'\nHasta: '+(f.end?new Date(Number(f.end)).toLocaleDateString('es-ES',{timeZone:'Europe/Madrid'}):'Sin fecha')+'\nMotivo: '+(f.cat||'')+'\nExplicación: '+(f.motivo||'')+'\nEstado: '+(f.cancelled?'Cancelada':f.returned?'Finalizada':'Avisada');record='ausencia:'+ref;
}else if(kind==='fabricacion'){
 const f=await row('fablote:'+ref);if(!f||f.empId!==emp)throw Error('FABRICACION_NO_CONFIRMADA');title='BALANCE DE FABRICACIÓN';desc='Empleado: '+nom;const {data:lotes}=await admin.from('datos').select('valor').like('clave','fablote:%').eq('valor->>empId',emp).eq('valor->>ts',String(f.ts));const grupo=(lotes||[]).map((x:any)=>x.valor).filter((x:any)=>!x.anula&&x.prod);for(const x of grupo.length?grupo:[f]){const {data:c}=await admin.rpc('hg_coste_entrega',{n:x.prod});desc+='\n'+x.q+' × '+x.prod+(c!=null?' · Coste de referencia: '+cash(c*x.q):' · Coste pendiente');}record='fabricacion:'+emp+':'+f.ts;
}else if(kind==='resumen'){
 const now=new Date().toLocaleDateString('es-ES',{timeZone:'Europe/Madrid'});const {data,error}=await admin.from('datos').select('valor').like('clave','venta:%');if(error)throw Error('DATOS');const a=(data||[]).map((x:any)=>x.valor).filter((x:any)=>{const p=String(x.date||'').split('/').map(Number),d=now.split('/').map(Number);return !x.voided&&p[0]===d[0]&&p[1]===d[1]&&p[2]===d[2]});title='RESUMEN DEL DÍA · '+now;desc='Operaciones: '+a.length+'\nIngresos: '+cash(a.reduce((s:number,x:any)=>s+(x.op==='encargo'?x.totalCents-x.dueCents:x.dueCents),0));record='resumen:'+now;
}else throw Error('CANAL_SOLO_PROPIETARIO');
return {title:String(title).slice(0,250),description:String(desc).slice(0,3900)||'Registro confirmado',record};
}
