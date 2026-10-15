import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.118.0";
const URL_=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(URL_,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const CORS={'Access-Control-Allow-Origin':'https://juancarlos15022-maker.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const out=(o:unknown,st=200)=>new Response(JSON.stringify(o),{status:st,headers:{...CORS,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{
if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});if(req.method!=='POST')return out({error:'METODO'},405);
try{
const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return out({error:'SIN_CUENTA'},401);
const caller=createClient(URL_,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
const {data:permitido,error:ae}=await caller.rpc('hg_permitido');if(ae||!permitido)return out({error:'SIN_CUENTA'},401);
const {data:u}=await caller.auth.getUser();if(!u.user)return out({error:'SIN_CUENTA'},401);
const {data:owner}=await caller.rpc('hg_es_jefe');
if(Number(req.headers.get('content-length')||0)>8000000)return out({error:'TAMANO'},413);
let b:any,files:File[]=[];
if((req.headers.get('content-type')||'').includes('multipart/form-data')){const fd=await req.formData();b=JSON.parse(String(fd.get('peticion')||'{}'));for(const [k,v]of fd.entries())if(k.startsWith('files[')&&v instanceof File)files.push(v);}
else b=await req.json();
if(files.length>2||files.reduce((a,x)=>a+x.size,0)>7500000)return out({error:'TAMANO'},413);
const metodo=String(b.metodo||'POST');if(!['POST','PATCH','DELETE'].includes(metodo))return out({error:'METODO'},400);if(metodo==='DELETE'&&!owner)return out({error:'SOLO_PROPIETARIO'},403);
const {data:limite}=await admin.rpc('hg_login_attempt',{p_key:'discord:'+u.user.id+':'+Math.floor(Date.now()/60000)});if(!limite)return out({error:'LIMITE'},429);
const {data:cfg}=await admin.from('datos').select('valor').eq('clave','discord').single();const urls=[cfg?.valor?.url,...Object.values(cfg?.valor?.urls||{})].filter(x=>typeof x==='string');
const hook=urls.find((x:any)=>new URL(x).pathname.split('/')[3]===String(b.webhook));if(!hook)return out({error:'CANAL_NO_CONFIGURADO'},403);
const url=new URL(String(hook));if(url.hostname!=='discord.com'&&url.hostname!=='discordapp.com')return out({error:'DESTINO'},400);
if(!/^\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname))return out({error:'DESTINO'},400);
url.search='';if(b.mensaje){if(!/^\d{15,22}$/.test(String(b.mensaje)))return out({error:'MENSAJE'},400);url.pathname=url.pathname.replace(/\/$/,'')+'/messages/'+b.mensaje;}else if(metodo!=='POST')return out({error:'MENSAJE'},400);
if(b.wait)url.searchParams.set('wait','true');
const payload=b.payload||{};payload.allowed_mentions={parse:[]};if(JSON.stringify(payload).length>30000)return out({error:'TAMANO'},413);
let body:BodyInit|undefined;const headers:Record<string,string>={};
if(metodo!=='DELETE'){if(files.length){const fd=new FormData();fd.append('payload_json',JSON.stringify(payload));files.forEach((f,i)=>fd.append('files['+i+']',f,f.name));body=fd;}else{headers['Content-Type']='application/json';body=JSON.stringify(payload);}}
const r=await fetch(url,{method:metodo,headers,body});const text=await r.text();return new Response(text||null,{status:r.status,headers:{...CORS,'Content-Type':'application/json'}});
}catch{return out({error:'ENVIO_NO_DISPONIBLE'},500);}
});
