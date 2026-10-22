import {type Ctx,tarjetaDecreto,fechaTxt,dolar} from './gob.ts';
type Any=any;
const BASE='https://juancarlos15022-maker.github.io/harrington-gunsmith/';
const LOGO=BASE+'gobierno/img/escudo-republicano.webp';
const EST:Record<string,string>={asentado:'Asentado',borrador:'Pendiente de firma',firmado:'Firmado y registrado',descartado:'Descartado',en_tramite:'En tramitación',pendiente_firma:'Elevado para firma',autorizado:'Autorizado',devuelto:'Devuelto para enmienda',ejecutado:'Ejecutado',concluido:'Concluido',archivado:'Archivado'};
export function enlaceRegistro(r:Any){return BASE+'gobierno/#'+(['peticion','oficio_presidencia','relevo'].includes(r.tipo)?'oficina/'+(r.tipo==='peticion'?'peticiones/'+r.id:r.tipo==='relevo'?'relevo':'correspondencia'):r.tipo==='decreto'?'documentos/'+r.id:r.tipo==='secretaria'?'secretarias/'+r.datos.area+'/'+r.id:r.tipo==='telegrama'?'telegramas/'+r.id:['acta','organizacion'].includes(r.tipo)?'archivo':r.tipo==='movimiento'||r.tipo.startsWith('hci_')?'hacienda/movimientos':r.tipo==='tarea'?'despacho':['campana','idea_campana','hito_electoral','acto'].includes(r.tipo)?'campana':'agenda');}
export function tarjetaDifusion(job:Any){
 const r=job.registro,d=r.datos||{},url=enlaceRegistro(r),estado=EST[r.estado]||r.estado;
 if(r.tipo==='decreto'&&job.destino!=='seguimiento'){
  const p:any=tarjetaDecreto(r);p.allowed_mentions={parse:[]};p.embeds[0].thumbnail={url:LOGO};p.embeds[0].url=url;
  if(r.estado==='firmado'&&String(d.firmadoPor||String(d.firma||'').split('\n')[0]).trim().toLowerCase()==='vincent harrington')p.embeds[0].image={url:BASE+'firma-vincent.webp'};
  p.components=[{type:1,components:[{type:2,style:5,label:'Consultar documento',url}]}];return p;
 }
 const title=r.tipo==='organizacion'?'Organización de los libros del Consejo':r.tipo==='secretaria'?(d.area_nombre||d.area)+' · Expediente n.º '+r.numero:r.tipo==='acta'?'Acta n.º '+r.numero:'Registro '+r.id+' · '+r.tipo;
 const asunto=d.titulo||d.concepto||d.texto||d.con||d.quien||'Asiento del Consejo';
 const ultimo=(d.historial||[]).at(-1)||{};const actor=ultimo.por||d.firmadoPor||d.editadoPor||d.autorizadoPor||r.autor||'Consejo de Gobierno';
 let contenido=job.destino==='seguimiento'?`**${String(asunto).slice(0,180)}**\nEstado: **${estado}**\n${d.area_nombre?'Área: '+d.area_nombre+'\n':''}Responsable que consta en el registro: ${actor}\nFecha del asiento: ${fechaTxt(new Date(r.actualizado||r.creado).getTime())}`:
  r.tipo==='acta'?`**${d.titulo||'Reunión del Consejo'}**\nAsistentes: ${d.asistentes||'No detallados'}\n\n${d.acuerdos||d.texto||''}`:
  `**${d.titulo||'Expediente'}**\nEstado: **${estado}**\nResponsable: ${d.responsable||r.autor}\n${d.interesado?'Interesado: '+d.interesado+'\n':''}${d.localidad?'Localidad: '+d.localidad+'\n':''}\n${d.texto||''}`;
 if(ultimo.acto)contenido+='\n\nÚltima actuación: '+String(ultimo.acto).slice(0,150)+(ultimo.nota?'\n'+String(ultimo.nota).slice(0,600):'');
 if(d.importeCents)contenido+='\n\nImporte: '+dolar(d.importeCents);
 if(d.doc_id)contenido+='\n[Escrito elevado para firma]('+BASE+'gobierno/#documentos/'+d.doc_id+')';
 return {allowed_mentions:{parse:[]},embeds:[{title:String(title).slice(0,240),url,color:job.destino==='seguimiento'?0x586878:r.estado==='firmado'||r.estado==='autorizado'?0xc9a24a:0x29495d,thumbnail:{url:LOGO},description:contenido.slice(0,3800),footer:{text:'Partido Republicano · Silver Peak · Constancia '+job.id+' · '+(EST[r.estado]||r.estado)}}],components:[{type:1,components:[{type:2,style:5,label:'Abrir en la web',url}]}]};
}
// Stable nonces and a lease prevent duplicate delivery by concurrent web/cron workers.
export async function difundir(ctx:Ctx,limite=8){
 let enviados=0;
 const ahora=new Date().toISOString();
 const {data:jobs,error}=await ctx.sb.from('gob_difusion').select('*').is('enviado',null).lte('proximo_intento',ahora).or('bloqueado_hasta.is.null,bloqueado_hasta.lt.'+ahora).order('id').limit(limite);
 if(error)throw Error('No he podido consultar la bandeja de publicaciones.');
 for(const job of jobs||[]){
  const canal=ctx.c['canal_'+job.destino];if(!canal)continue;
  const lease=new Date(Date.now()+60000).toISOString();
  const {data:tomado,error:le}=await ctx.sb.from('gob_difusion').update({bloqueado_hasta:lease,intentos:job.intentos+1}).eq('id',job.id).is('enviado',null).or('bloqueado_hasta.is.null,bloqueado_hasta.lt.'+ahora).select('id');
  if(le||!tomado?.length)continue;
  try{
   const payload=tarjetaDifusion(job),m=await ctx.api('POST',`/channels/${canal}/messages`,{...payload,nonce:'gob-dif-'+job.id,enforce_nonce:true});
   const r=await ctx.sb.from('gob_difusion').update({enviado:new Date().toISOString(),canal_id:canal,mensaje_id:m.id,error:null,bloqueado_hasta:null}).eq('id',job.id).eq('bloqueado_hasta',lease);if(r.error)throw Error('No he podido confirmar la publicación.');enviados++;
  }catch(e){await ctx.sb.from('gob_difusion').update({error:String((e as Error).message||e).slice(0,300),bloqueado_hasta:null,proximo_intento:new Date(Date.now()+Math.min(300000,15000*2**Math.min(job.intentos,4))).toISOString()}).eq('id',job.id).eq('bloqueado_hasta',lease);}
 }
 return enviados;
}
export function difundirEnSegundoPlano(ctx:Ctx){const p=difundir(ctx).catch(()=>{});const runtime=(globalThis as Any).EdgeRuntime;if(runtime?.waitUntil)runtime.waitUntil(p);return p;}
