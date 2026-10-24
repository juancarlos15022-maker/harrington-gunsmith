type Any=any;
export const CARGOS_GOBIERNO=['gobernador','vicegobernador','gobernacion','comercio','festejos'];
export const tieneCargoGobierno=(c:Any,roles:string[])=>CARGOS_GOBIERNO.some(k=>c['rol_'+k]&&roles.includes(c['rol_'+k]));
export const hashAcceso=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export const codigoNormal=(s:unknown)=>String(s||'').replace(/[^a-f0-9]/gi,'').toLowerCase();
export async function aprobarVinculo(ctx:Any,uid:string,codigo:unknown){
 let m;try{m=await ctx.api('GET','/guilds/'+ctx.c.guild_id+'/members/'+uid)}catch{return 'No he podido verificar su pertenencia al Gobierno. Inténtelo de nuevo.'}
 if(!tieneCargoGobierno(ctx.c,m.roles||[]))return 'Acceso denegado: necesita un cargo de Gobernador, Vicegobernador o de una Secretaría. Pertenecer al Consejo o ser administrador de Discord no concede entrada.';
 const code=codigoNormal(codigo);if(!code)return 'Abra el canal de la web, pulse «Vincular mi Discord» y ejecute /acceso codigo: seguido del código que aparece en ese navegador. No se envían enlaces de entrada por otros canales.';
 if(!/^[a-f0-9]{12}$/.test(code))return 'El código de vinculación no es válido. Genere uno nuevo en la web.';
 const r=await ctx.sb.from('gob_vinculos').update({usuario_id:uid,nombre:String(m.nick||m.user?.global_name||m.user?.username||'Gobierno').slice(0,60),aprobado:new Date().toISOString()}).eq('token_hash',await hashAcceso(code)).is('usuario_id',null).gt('expira',new Date().toISOString()).select('token_hash');
 if(r.error)throw Error('No he podido registrar la autorización de entrada.');if(!r.data?.length)return 'Ese código ha caducado o ya fue autorizado. Genere otro en el navegador donde desea entrar.';
 return 'Entrada autorizada para su cuenta de Discord y el navegador que generó el código. Vuelva a esa ventana: el Sr. Whitmore abrirá su despacho.';
}
export async function prepararVinculo(ctx:Any,challenge:unknown){
 if(!/^[a-f0-9]{64}$/.test(String(challenge)))throw Error('La prueba del navegador no es válida.');
 const limite=await ctx.sb.from('gob_vinculos').select('token_hash',{count:'exact',head:true}).gt('expira',new Date().toISOString());if(limite.error||Number(limite.count||0)>=200)throw Error('Hay varias solicitudes de entrada en curso. Inténtelo de nuevo en unos minutos.');
 const code=Array.from(crypto.getRandomValues(new Uint8Array(6))).map(x=>x.toString(16).padStart(2,'0')).join('');const expira=new Date(Date.now()+5*60000).toISOString();
 await ctx.sb.from('gob_vinculos').delete().lt('expira',new Date(Date.now()-3600000).toISOString());
 const r=await ctx.sb.from('gob_vinculos').insert({token_hash:await hashAcceso(code),browser_hash:challenge,expira});if(r.error)throw Error('No he podido preparar la vinculación.');return {codigo:code.toUpperCase().match(/.{4}/g)!.join('-'),expira};
}
export async function consultarVinculo(ctx:Any,b:Any,resolver:Any){
 const code=codigoNormal(b.codigo);if(!/^[a-f0-9]{12}$/.test(code)||!/^[a-f0-9]{64}$/.test(String(b.prueba)))return {error:'VINCULO_INVALIDO'};
 const proof=await hashAcceso(b.prueba),r=await ctx.sb.from('gob_vinculos').select('*').eq('token_hash',await hashAcceso(code)).eq('browser_hash',proof).gt('expira',new Date().toISOString()).maybeSingle();
 if(r.error)throw Error('No he podido consultar la entrada.');const v=r.data;if(!v)return {error:'VINCULO_CADUCADO'};if(!v.usuario_id)return {pendiente:true};
 const m=await resolver(ctx,v.usuario_id);if(!m)return {error:'SIN_ROL'};
 const sesion=await hashAcceso('gobierno-vinculado:'+code+':'+b.prueba+':'+v.usuario_id),tokenHash=await hashAcceso(sesion);
 const saved=await ctx.sb.from('gob_sesiones').upsert({token_hash:tokenHash,usuario_id:v.usuario_id,nombre:m.nombre,avatar:m.avatar,roles:m.roles,browser_hash:proof,expira:new Date(Date.now()+30*86400000).toISOString()},{onConflict:'token_hash',ignoreDuplicates:true});if(saved.error)throw Error('No he podido abrir la sesión vinculada.');
 const old=await ctx.sb.from('gob_sesiones').select('revocado').eq('token_hash',tokenHash).maybeSingle();if(old.error||old.data?.revocado)return {error:'SIN_SESION'};
 return {sesion,yo:{id:v.usuario_id,...m}};
}
