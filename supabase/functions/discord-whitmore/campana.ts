import {type Ctx,nuevo,leer,cambiar,publicar,repintar,limpio,fechaTxt,leerFecha,tarjetaReunion} from './gob.ts';
type Any=any;
const ESTADOS:Record<string,string>={borrador:'En preparación',presentada:'Presentada al staff',subsanacion:'Requiere enmiendas',aceptada:'Candidatura admitida',rechazada:'Candidatura no admitida',retirada:'Candidatura retirada'};
const RESULTADOS:Record<string,string>={pendiente:'Pendiente de escrutinio',provisional:'Escrutinio provisional',electos:'Electos · Gobierno oficial de Silver Peak',no_electos:'No electos'};
function tarjeta(r:Any){const d=r.datos;const meta=r.tipo==='campana'?'**Tramitación:** '+ESTADOS[r.estado]+'\n**Resolución:** '+(d.resolucion||'A la espera de correspondencia.')+'\n**Escrutinio:** '+RESULTADOS[d.resultado||'pendiente']+'\n**Votos:** '+(d.votos||'Sin acta recibida.')+'\n**Acta:** '+(d.acta||'Pendiente.'):'**Situación:** '+r.estado+(r.cuando?'\n**Fecha:** '+fechaTxt(new Date(r.cuando).getTime()):'')+(d.seguimiento?'\n'+d.seguimiento:'');return {embeds:[{title:d.titulo,description:d.texto||'Pendiente de redacción.',color:0xc9a24a},{description:meta,color:0xc9a24a,footer:{text:'Sr. Whitmore · Oficina de campaña'}}],components:[{type:1,components:[{type:2,style:5,label:'Abrir la oficina de campaña',url:'https://juancarlos15022-maker.github.io/harrington-gunsmith/gobierno/#campana'}]}]};}
export async function campana(ctx:Ctx,b:Any,y:Any):Promise<Any>{
 const jefe=y.roles.admin||y.roles.gobernador||y.roles.gobernacion;
 const admin=y.roles.admin||y.roles.gobernador;
 const lista=async()=>{const r=await ctx.sb.from('gob_registros').select('*').in('tipo',['campana','idea_campana','hito_electoral','acto']).order('creado',{ascending:false}).limit(250);if(r.error)throw Error('No he podido abrir el archivo de campaña.');return r.data||[];};
 const rows=await lista(), expediente=rows.find((r:Any)=>r.tipo==='campana');
 if(b.accion==='campana')return {registros:rows.map((r:Any)=>({...r,datos:{...r.datos,_discord:undefined}})),puedeEditar:jefe,puedeResolver:admin};
 const base={autor:y.nombre,autor_id:y.id};
 if(b.accion==='campana_expediente'){
  if(!jefe)throw Error('No tiene permiso para modificar la postulación.');
  const estado=String(b.estado||'borrador');if(!ESTADOS[estado])throw Error('Estado de tramitación no válido.');
  const anterior=expediente?.datos||{};
  const resultado=String(b.resultado||anterior.resultado||'pendiente');if(!RESULTADOS[resultado])throw Error('Resultado no válido.');
  if(!admin&&(estado!== (expediente?.estado||'borrador')||resultado!==(anterior.resultado||'pendiente')))throw Error('Solo el Gobernador registra resoluciones y resultados.');
  if(String(b.texto||'').length>3500||['resolucion','votos','acta'].some(k=>String(b[k]||'').length>500))throw Error('El escrito admite 3500 caracteres; cada referencia o acta, 500.');
  const datos={titulo:limpio(b.titulo,150),texto:limpio(b.texto,3500),resolucion:limpio(b.resolucion,500),resultado,votos:limpio(b.votos,500),acta:limpio(b.acta,500)};
  if(!datos.titulo||!datos.texto)throw Error('Escriba el título y el cuerpo de la postulación.');
  if(['aceptada','rechazada','subsanacion'].includes(estado)&&!datos.resolucion)throw Error('Anote la respuesta del staff antes de registrar esa resolución.');
  if(resultado!=='pendiente'&&estado!=='aceptada')throw Error('El escrutinio requiere una candidatura admitida.');
  if(['electos','no_electos'].includes(resultado)&&!datos.acta)throw Error('Anote el acta o la confirmación oficial del resultado.');
  let r;if(expediente){if(String(b.version)!==expediente.actualizado)throw Error('Otro miembro ha actualizado el expediente. Vuelva a abrirlo antes de guardar.');const u=await ctx.sb.from('gob_registros').update({estado,datos,actualizado:new Date().toISOString()}).eq('id',expediente.id).eq('actualizado',b.version).select('*').maybeSingle();if(u.error||!u.data)throw Error('El expediente ha cambiado. Vuelva a abrirlo.');r=u.data;}else r=await nuevo(ctx,'campana',{...base,estado,datos},false);
  await repintar(ctx,r,tarjeta(r));return {registro:r};
 }
 if(b.accion==='campana_anotar'){
  const tipo=String(b.tipo);if(!['idea_campana','hito_electoral','acto'].includes(tipo))throw Error('Clase de escrito no válida.');
  if(tipo!=='idea_campana'&&!jefe)throw Error('Solo la Secretaría o el Gobernador ordenan la agenda.');
  if(tipo==='hito_electoral'&&expediente?.estado!=='aceptada')throw Error('El calendario electoral se abrirá cuando la candidatura esté admitida.');
  const titulo=limpio(b.titulo,150),texto=limpio(b.texto,3000),lugar=limpio(b.lugar,150);if(!titulo)throw Error('Escriba un título.');
  const cuando=tipo==='idea_campana'?null:leerFecha(String(b.fecha||''),String(b.hora||''));if(tipo!=='idea_campana'&&!cuando)throw Error('Indique un día y una hora válidos.');if(tipo==='acto'&&!lugar)throw Error('Indique el lugar del mitin.');
  const r=await nuevo(ctx,tipo,{...base,estado:tipo==='idea_campana'?'propuesta':'previsto',cuando:cuando?new Date(cuando).toISOString():null,datos:{titulo,texto,lugar,notas:texto,clase:tipo==='hito_electoral'&&b.clase==='votacion'?'votacion':'plazo'}},false);
  if(tipo==='hito_electoral'&&b.clase==='votacion'){const u=await ctx.sb.from('whitmore_cfg').upsert({clave:'elecciones',valor:String(cuando),actualizado:new Date().toISOString()});if(u.error)throw Error('No he podido asentar la jornada electoral.');}
  await publicar(ctx,r,ctx.c.canal_campana,tipo==='acto'?await tarjetaReunion(ctx,r):tarjeta(r));return {registro:r};
 }
 if(b.accion==='campana_estado'){
  const r=await leer(ctx,Number(b.id));if(!r||!['idea_campana','hito_electoral','acto'].includes(r.tipo))throw Error('No encuentro ese asiento.');if(!jefe)throw Error('Solo la Secretaría o el Gobernador pueden cerrar ese asiento.');
  const permitidos=r.tipo==='idea_campana'?['propuesta','incorporada','descartada']:r.tipo==='acto'?['previsto','cerrada','cancelada']:['previsto','cumplido','cancelado'];if(!permitidos.includes(b.estado))throw Error('Situación no válida.');
  const u=await cambiar(ctx,r.id,{estado:b.estado,datos:{...r.datos,seguimiento:limpio(b.notas,2000)}});if(!u)throw Error('No he podido guardar el seguimiento.');await repintar(ctx,u,r.tipo==='acto'?await tarjetaReunion(ctx,u):tarjeta(u));return {registro:u};
 }
 throw Error('Orden de campaña desconocida.');
}
