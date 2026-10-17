export function rutaWebhook(hook:string,metodo:string,ruta:string){
 if(!/^https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d{15,22}\/[\w-]+\/?$/.test(hook))throw Error('WEBHOOK_NO_CONFIGURADO');
 if(metodo==='POST'&&ruta==='/nuevo')return hook.replace(/\/$/,'')+'?wait=true';
 if(!['PATCH','GET','DELETE'].includes(metodo)||!/^\/messages\/\d{15,22}$/.test(ruta))throw Error('RUTA_WEBHOOK_INVALIDA');
 return hook.replace(/\/$/,'')+ruta;
}
export async function destinoFabricacion(sb:any,op:any,metodo:string,ruta:string){
 if(!op.canalWebhook)return null;if(op.canalWebhook!=='fabricacion')throw Error('CANAL_WEBHOOK_INVALIDO');
 const {data,error}=await sb.from('datos').select('valor').eq('clave','discord').single();if(error)throw Error('CONFIGURACION');
 return rutaWebhook(String(data?.valor?.urls?.fabricacion||''),metodo,ruta);
}

