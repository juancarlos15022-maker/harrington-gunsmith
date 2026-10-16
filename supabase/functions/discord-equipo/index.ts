import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {reminderCron} from './equipo.ts';
import {startVoice} from './voz.ts';
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async req=>{
 if(req.method!=='POST')return Response.json({error:'solo POST'},{status:405});
 const {data,error}=await sb.from('bot_cfg').select('clave,valor');if(error)return Response.json({error:'configuración'},{status:503});const c=Object.fromEntries((data||[]).map(r=>[r.clave,r.valor]));
 let b:any;try{b=await req.json();}catch{return Response.json({error:'JSON'},{status:400});}
 if(!c.secreto||c.secreto.length<20||b.secreto!==c.secreto)return Response.json({error:'NO'},{status:403});
 try{await sb.from('bot_equipo').update({status:'pending'}).eq('kind','voice_watch').eq('status','sending').lt('updated_at',new Date(Date.now()-120000).toISOString());
 return Response.json({ok:true,...await reminderCron(c),...await startVoice(c)});
 }catch(e){return Response.json({error:String(e).slice(0,200)},{status:500});}
});
