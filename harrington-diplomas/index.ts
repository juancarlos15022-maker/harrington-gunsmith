import {createClient} from "npm:@supabase/supabase-js@2.118.0";
import {diplomaPNG} from "./diploma-render.ts";
import {enviarDiplomas} from "./diplomas.ts";
const sb=createClient(Deno.env.get("SUPABASE_URL"),Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async req=>{try{if(req.method!=="POST")return Response.json({error:"POST"},{status:405});const b=await req.json();const r=await sb.from("bot_cfg").select("clave,valor");if(r.error)throw Error("CONFIG_NO_DISPONIBLE");const c=Object.fromEntries(r.data.map(x=>[x.clave,x.valor]));if(!c.secreto||b.secreto!==c.secreto)return Response.json({error:"NO"},{status:403});
if(b.preview){const png=await diplomaPNG({name:"Prueba de diploma"},{a:"Armero",nuevo:2500,ts:Date.now()});return Response.json({ok:true,bytes:png.length,png:Array.from(png.slice(0,8))});}
return Response.json({ok:true,diplomas:await enviarDiplomas(sb,c,String(b.empleado||""))});
}catch(e){return Response.json({error:String(e.message).slice(0,300)},{status:500});}});