import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {runReposicion} from './reposicion.ts';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const json=(o:unknown,status=200)=>new Response(JSON.stringify(o),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return json({error:'SOLO_POST'},405);
 let body:any;try{body=await req.json();}catch{return json({error:'JSON'},400);}
 const {data,error}=await sb.from('bot_cfg').select('clave,valor').in('clave',['secreto','token']);if(error)return json({error:'CONFIGURACION'},503);
 const c=Object.fromEntries((data||[]).map((x:any)=>[x.clave,x.valor]));
 if(!c.secreto||c.secreto.length<20||body?.secreto!==c.secreto)return json({error:'NO'},403);
 if(body.preview)return json({ok:true,ready:!!c.token});
 try{return json({ok:true,...await runReposicion(sb,c)});}catch{return json({error:'REPOSICION_PENDIENTE'},503);}
});
