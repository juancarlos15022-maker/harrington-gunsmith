import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.118.0";
const URL_=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(URL_,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const CORS={'Access-Control-Allow-Origin':'https://juancarlos15022-maker.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(o:unknown,st=200)=>new Response(JSON.stringify(o),{status:st,headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}});
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
const sha=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
const legacy=async(s:string)=>sha('harrington|'+s);
const derivar=async(pw:string,salt:string,iterations=310000)=>{const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations,hash:'SHA-256'},k,256));};
const igual=(a:string,b:string)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
const fila=async(k:string)=>{const {data,error}=await admin.from('datos').select('valor').eq('clave',k).maybeSingle();if(error)throw Error('CONFIGURACION');return data?.valor;};
const emailDe=(id:string)=>`emp-${id.toLowerCase().replace(/[^a-z0-9]/g,'')}@empleados.harrington-gunsmith.invalid`;
async function guardarClave(id:string,pw:string){const salt=crypto.randomUUID()+crypto.randomUUID();const hash=await derivar(pw,salt);const {error}=await admin.from('hg_security_credentials').upsert({emp_id:id,hash,salt,iterations:310000,changed_at:new Date().toISOString()});if(error)throw Error('CLAVE_NO_GUARDADA');}
async function abrirSesion(emp:any,owner:any){
 const jefe=emp.id===owner.owner_emp;const meta={emp_id:emp.id,jefe,modo:'personal'};const password=crypto.randomUUID()+crypto.randomUUID();
 const {data:c}=await admin.from('cuentas').select('uid').eq('emp_id',emp.id).maybeSingle();let uid=c?.uid;
 if(uid){const {error}=await admin.auth.admin.updateUserById(uid,{password,app_metadata:meta,user_metadata:{nombre:emp.name||''}});if(error)throw Error('CUENTA_NO_DISPONIBLE');}
 else{const {data,error}=await admin.auth.admin.createUser({email:emailDe(emp.id),password,email_confirm:true,app_metadata:meta,user_metadata:{nombre:emp.name||''}});if(error)throw Error('CUENTA_NO_DISPONIBLE');uid=data.user!.id;}
 if(jefe&&uid!==owner.owner_uid)throw Error('IDENTIDAD_PROPIETARIO');
 const {error}=await admin.from('cuentas').upsert({emp_id:emp.id,uid,ultima:new Date().toISOString()});if(error)throw Error('CUENTA_NO_GUARDADA');
 const pub=createClient(URL_,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:s,error:e}=await pub.auth.signInWithPassword({email:emailDe(emp.id),password});if(e||!s.session)throw Error('SESION');
 return {access_token:s.session.access_token,refresh_token:s.session.refresh_token,expires_at:s.session.expires_at,uid,jefe};
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});if(req.method!=='POST')return json({error:'METODO'},405);
 if(Number(req.headers.get('content-length')||0)>4096)return json({error:'TAMANO'},413);
 try{
 const b=await req.json();const acc=String(b.accion||'');const id=String(b.empId||'').slice(0,40);
 const {data:owner}=await admin.from('hg_security_config').select('owner_uid,owner_emp').eq('id',1).single();if(!owner)return json({error:'NO_CONFIGURADO'},503);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 const {data:u}=token?await admin.auth.getUser(token):{data:null};
 const emps=await fila('empleados');const emp=Array.isArray(emps)?emps.find((e:any)=>e.id===id):null;
 const actual=Array.isArray(emps)?emps.find((e:any)=>e.id===u?.user?.app_metadata?.emp_id):null;
 const cliente=token?createClient(URL_,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}}):null;
 const {data:permitido}=cliente?await cliente.rpc('hg_permitido'):{data:false};
 const propietario=!!permitido&&!!actual&&u?.user?.id===owner.owner_uid&&actual.id===owner.owner_emp;
 if(acc==='seguridad_estado'){
  if(!actual)return json({error:'SIN_CUENTA'},401);
  const {data}=await admin.from('hg_security_credentials').select('emp_id').eq('emp_id',actual.id).maybeSingle();
  return json({propietario,personal:!!data,nombre:actual.name});
 }
 if(acc==='resumen'){
  if(!propietario)return json({error:'SOLO_PROPIETARIO'},403);
  const {data}=await admin.from('cuentas').select('emp_id,ultima');return json({cuentas:data||[]});
 }
 if(acc==='personalizar'){
  if(!actual||!propietario)return json({error:'SOLO_PROPIETARIO'},403);
  const pw=String(b.pw||'');if(pw.length<12||pw.length>80)return json({error:'MINIMO_12_CARACTERES'},400);
  await guardarClave(actual.id,pw);
  const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  if(payload.session_id)await admin.rpc('hg_cerrar_otras_sesiones',{p_uid:u!.user!.id,p_session:payload.session_id});
  return json({ok:true});
 }
 if(acc==='resetear'){
  if(!propietario)return json({error:'SOLO_PROPIETARIO'},403);if(!emp||id===owner.owner_emp)return json({error:'EMPLEADO'},400);
  const {error}=await admin.rpc('hg_resetear_clave',{p_emp:id});if(error)throw Error('RESET_NO_REALIZADO');
  const codigo=crypto.randomUUID()+crypto.randomUUID();const {error:ie}=await admin.from('hg_security_invitations').upsert({emp_id:id,hash:await sha(codigo),expires_at:new Date(Date.now()+86400000).toISOString()});if(ie)throw Error('INVITACION');
  return json({ok:true,enlace:'https://juancarlos15022-maker.github.io/harrington-gunsmith/#alta='+encodeURIComponent(codigo)+'&empleado='+encodeURIComponent(id)});
 }
 if(acc==='invitar'){
  if(!propietario)return json({error:'SOLO_PROPIETARIO'},403);if(!emp||id===owner.owner_emp)return json({error:'EMPLEADO'},400);
  const codigo=crypto.randomUUID()+crypto.randomUUID();const {error}=await admin.from('hg_security_invitations').upsert({emp_id:id,hash:await sha(codigo),expires_at:new Date(Date.now()+86400000).toISOString()});
  if(error)throw Error('INVITACION');return json({ok:true,codigo,caduca:'24 horas'});
 }
 if(!emp||id==='prueba')return json({error:'EMPLEADO'},404);
 const {data:cred}=await admin.from('hg_security_credentials').select('hash,salt,iterations').eq('emp_id',id).maybeSingle();
 if(acc==='estado')return json({tiene:!!cred||(emp.puesto!=='Jefe'&&!!(await fila('clave-'+id))?.h),jefe:id===owner.owner_emp,personal:!!cred,requiereInvitacion:!cred&&id!==owner.owner_emp,requierePersonal:!cred&&id===owner.owner_emp});
 const ip=(req.headers.get('x-forwarded-for')||'sin-ip').split(',')[0].trim();
 for(const clave of ['ip:'+await sha(ip),'empleado:'+id]){const {data,error}=await admin.rpc('hg_login_attempt',{p_key:clave});if(error||data!==true)return json({error:'BLOQUEADA'},429);}
 const pw=String(b.pw||'');if(!pw||pw.length>80)return json({error:'CONTRASENA'},400);
 if(acc==='nueva_jefe')return json({error:'RECUPERACION_COMPARTIDA_DESACTIVADA'},403);
 if(acc==='crear'){
  if(cred)return json({error:'YA_TIENE'},409);
  if(pw.length<12)return json({error:'MINIMO_12_CARACTERES'},400);
  const {data:inv}=await admin.from('hg_security_invitations').select('hash,expires_at').eq('emp_id',id).maybeSingle();
  if(!inv||Date.parse(inv.expires_at)<=Date.now()||!igual(await sha(String(b.invitacion||'')),inv.hash))return json({error:'INVITACION_NECESARIA'},403);
  // Consumir de forma condicional: no puede reutilizarse ni canjearse simultáneamente.
  const {data:used,error}=await admin.from('hg_security_invitations').delete().eq('emp_id',id).eq('hash',inv.hash).select('emp_id');if(error||!used?.length)return json({error:'INVITACION_USADA'},409);
  await guardarClave(id,pw);return json({ok:true,...await abrirSesion(emp,owner)});
 }
 if(acc==='entrar'){
  let ok=false;
  if(cred)ok=igual(await derivar(pw,cred.salt,cred.iterations),cred.hash);
  else if(emp.puesto!=='Jefe'){const c=await fila('clave-'+id);ok=!!c?.h&&igual(await legacy('emp|'+id+'|'+pw),c.h);if(ok)await guardarClave(id,pw);}
  else return json({error:id===owner.owner_emp?'CONFIGURA_CLAVE_PERSONAL_DESDE_TU_SESION':'INVITACION_NECESARIA'},403);
  if(!ok)return json({error:'MAL'},401);return json({ok:true,...await abrirSesion(emp,owner)});
 }
 return json({error:'ACCION'},400);
 }catch(e){console.error('Cuentas seguras',e instanceof Error?e.message:'error');return json({error:'NO_DISPONIBLE'},500);}
});
