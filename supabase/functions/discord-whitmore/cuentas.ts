import {type Ctx,publicar,dolar,fechaTxt,nuevo} from './gob.ts';
type Any=any;
const WEB='https://juancarlos15022-maker.github.io/harrington-gunsmith/gobierno/#hacienda/movimientos';
function asiento(r:Any){const d=r.datos;return r.tipo==='hci_arqueo'?`Arqueo n.º ${r.numero}: ${dolar(d.importeCents)}${d.diferencia?` · diferencia por justificar ${dolar(d.diferencia)}`:''}`:`Asiento n.º ${r.numero}: ${dolar(d.cents)} · ${String(d.concepto||'').slice(0,80)}\n${String(d.origen||'Procedencia no detallada').slice(0,100)} → ${String(d.destino||'Destino no detallado').slice(0,100)}`;}
// Los registros son la bandeja de salida. El cron reintenta y además reconstruye el panel desde los datos actuales.
export async function actualizarCuentas(ctx:Ctx,diario=false){
 const canal=ctx.c.canal_cuentas;if(!canal)return;
 try{
  if(diario){const cerrado=await ctx.sb.rpc('gob_hacienda_cerrar_dias');if(cerrado.error)throw Error('No he podido cerrar las cuentas diarias.');}
  const p=await ctx.sb.rpc('gob_hacienda_parte');if(p.error)throw Error('No he podido consultar las cuentas.');const j=p.data,t=j.tesoreria;
  const {data:panel,error:panelError}=await ctx.sb.rpc('gob_hacienda_panel');if(panelError)throw Error('No he podido preparar el panel de cuentas.');
  const payload={embeds:[{title:'Libro de cuentas · Tesorería de Silver Peak',color:0xc9a24a,description:`**Fondos de referencia:** ${t.conocido?dolar(t.fondos):'Pendiente del primer arqueo'}\n**Autorizado por pagar:** ${dolar(t.pendientePago||0)}\n**Sin comprometer:** ${t.conocido?dolar(t.fondos-(t.pendientePago||0)):'—'}\n\n**Últimas constancias**\n${j.movimientos.map(asiento).join('\n\n')||'Todavía no hay movimientos.'}\n\n[Consultar el libro completo](${WEB})`,footer:{text:'Consejo de Gobierno · Saldo según los movimientos anotados; comprobación manual con el juego.'}}]};
  // El panel se vuelve a pintar desde la base de datos en cada revisión: una petición antigua no deja una copia obsoleta permanente.
  const r=panel;const huella=JSON.stringify(payload);if(r.datos.huella!==huella||!r.mensaje_id){const saved=await ctx.sb.from('gob_registros').update({datos:{...r.datos,huella}}).eq('id',r.id);if(saved.error)throw Error('No he podido guardar el estado de cuentas.');await publicar(ctx,r,canal,payload);}
  const {data:pendientes,error}=await ctx.sb.from('gob_registros').select('*').in('tipo',['movimiento','hci_arqueo','hci_cierre']).is('mensaje_id',null).order('id').limit(10);if(error)throw Error('No he podido abrir la bandeja de cuentas.');
  for(const r of pendientes||[]){const d=r.datos;let titulo=r.tipo==='hci_cierre'?'Cierre de cuentas · '+d.dia.slice(8,10)+'/'+d.dia.slice(5,7)+'/1880':r.tipo==='hci_arqueo'?'Arqueo de Tesorería n.º '+r.numero:'Movimiento de Tesorería n.º '+r.numero;
   const descripcion=r.tipo==='hci_cierre'?`Ingresos asentados: ${dolar(d.ingresos)}\nSalidas efectuadas: ${dolar(d.salidas)}\nDiferencias de arqueo: ${dolar(d.ajustes)}\nFondos al cierre: ${d.fondos===null?'Sin arqueo':dolar(d.fondos)}`:asiento(r)+`\n\n**Fecha:** ${fechaTxt(new Date(r.creado).getTime())}\n**Registrado por:** ${r.autor}`+(r.tipo==='movimiento'?`\n**Autorizado por:** ${d.autorizadoPor||'Consta en la resolución'}\n**Antes:** ${d.saldoAnterior==null?'No consta (asiento anterior al libro)':dolar(d.saldoAnterior)} · **Después:** ${d.saldoPosterior==null?'No consta':dolar(d.saldoPosterior)}\n**Constancia:** ${String(d.justificante||'—').slice(0,500)}\n**Resolución:** ${d.documento_id?'n.º de registro '+d.documento_id:'Consultar historial'}`:`\n**Diferencia:** ${d.diferencia==null?'Primer arqueo':dolar(d.diferencia)}\n${String(d.nota||'Sin observaciones; las diferencias quedan pendientes de justificar.').slice(0,500)}`);
   await publicar(ctx,r,canal,{embeds:[{title:titulo,description:descripcion.slice(0,3900)+`\n\n[Libro de cuentas](${WEB})`,color:0xc9a24a,footer:{text:'Sr. Whitmore · Consejo de Gobierno · 1880'}}]});
  }
 }catch(e){(ctx.avisos||=[]).push('La contabilidad está guardada. La copia de cuentas en Discord se actualizará en la próxima revisión.');}
}
