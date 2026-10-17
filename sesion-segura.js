/* Una tarjeta visible no garantiza que la sesión del servidor siga activa. */
(function(){'use strict';if(SANDBOX)return;
const original=authToken;let checked='',until=0,flight=null;
async function comprobar(token,emp){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),7000);
 try{
  const r=await fetch(SB_URL+'/rest/v1/rpc/hg_permitido',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',signal:ctl.signal});
  if(!r.ok)return r.status===401?false:null;
  const allowed=await r.json();return typeof allowed==='boolean'?allowed:null;
 }catch{return null;}finally{clearTimeout(timer);}
}
authToken=async function(){
 const token=await original.apply(this,arguments),emp=ME?.id;
 if(!token||!emp)return token;
 if(checked===token&&Date.now()<until)return token;
 if(!flight||flight.token!==token){const current={token,promise:comprobar(token,emp)};flight=current;current.promise.finally(()=>{if(flight===current)flight=null;});}
 const valid=await flight.promise;
 if(AUTH?.at!==token||ME?.id!==emp)return null;
 if(valid===false){checked='';until=0;authClear();setTimeout(()=>{if(!AUTH&&ME?.id===emp)logoutToGate('Tu sesión ha dejado de ser válida. Vuelve a entrar con tu tarjeta; los cambios pendientes se conservan.');},0);return null;}
 if(valid===true){checked=token;until=Date.now()+30000;}
 return token;
};
})();
