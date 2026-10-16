/* Sincronización con conflictos explícitos. No descarta ni vuelve a crear operaciones comerciales. */
(function(){'use strict';if(SANDBOX)return;
const sessions=new Map(),flights=new Map();let queueFlight=null;
const ownKey='hg_sync_propietarios_v1';let owners={};try{owners=JSON.parse(store.get(ownKey)||'{}')}catch{}
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
function conflict(){const e=Error('Hay cambios simultáneos en el mismo dato. Revisa los pendientes.');e.status=409;e.code='CONFLICTO_CONFIG';return e;}
function indexed(a){return Array.isArray(a)&&a.every(x=>object(x)&&typeof x.id==='string'&&x.id)&&new Set(a.map(x=>x.id)).size===a.length;}
function merge(base,local,remote){
 if(same(local,base))return clone(remote);if(same(remote,base)||same(local,remote))return clone(local);
 if(object(base)&&object(local)&&object(remote)){const out={};for(const k of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){const v=merge(base[k],local[k],remote[k]);if(v!==undefined)out[k]=v;}return out;}
 if(indexed(base)&&indexed(local)&&indexed(remote)){const B=new Map(base.map(x=>[x.id,x])),L=new Map(local.map(x=>[x.id,x])),R=new Map(remote.map(x=>[x.id,x])),out=[];for(const id of new Set([...R.keys(),...L.keys(),...B.keys()])){const v=merge(B.get(id),L.get(id),R.get(id));if(v!==undefined)out.push(v);}return out;}
 throw conflict();
}
function state(){const id=ME?.id||'';if(!sessions.has(id)){let saved={};try{saved=JSON.parse(store.get('hg_sync_estado_'+id)||'{}')}catch{}const s={id,base:saved.base||{},pending:saved.pending||{},blocked:saved.blocked||{},backoff:{},issues:{},events:[]};for(const [k,key] of Object.entries(CLOUD_REV))if(!cloud.dirty[k]&&s.base[k]===undefined){try{s.base[k]=JSON.parse(store.get(key)||'null')}catch{}}for(const k of Object.keys(s.pending))cloud.dirty[k]=true;sessions.set(id,s);}return sessions.get(id);}
function persist(s){try{const base={};for(const k of Object.keys(s.pending))base[k]=s.base[k];const key='hg_sync_estado_'+s.id,encoded=JSON.stringify({base,pending:s.pending,blocked:s.blocked}),who=JSON.stringify(owners);if(store.get(key)!==encoded)localStorage.setItem(key,encoded);if(store.get(ownKey)!==who)localStorage.setItem(ownKey,who);return true;}catch{return false;}}
function identity(id){return !!id&&ME?.id===id&&AUTH?.emp===id&&!!AUTH.at;}
function type(e){if(e?.code==='ALMACENAMIENTO_LOCAL')return 'almacenamiento';const st=Number(e?.status||0);if(st===401)return 'sesion';if(st===403)return 'permiso';if(st===409||e?.code==='CONFLICTO_CONFIG')return 'conflicto';if(st>=400&&st<500&&![408,429].includes(st))return 'datos';return 'red';}
function report(e,scope,s=state()){
 const kind=type(e),st=Number(e?.status||0),code=/^[A-Z0-9_]{1,40}$/.test(e?.code||'')?e.code:'';
 const issue={tipo:kind,estado:st,codigo:code,ambito:scope,fecha:Date.now()};s.issues[scope]=issue;s.events.push(issue);s.events=s.events.slice(-30);
 if(kind==='red'){const old=s.backoff[scope]||{n:0};old.n++;old.until=Date.now()+Math.min(60000,2000*2**Math.min(5,old.n-1))*(.85+Math.random()*.3);s.backoff[scope]=old;setCloudState(false);}else{setCloudState(true);}
 paint();return kind;
}
function success(scope,s=state()){delete s.issues[scope];delete s.backoff[scope];paint();}
window.hgSyncReportError=(e,scope)=>report(e,scope);
window.hgSyncReportSuccess=scope=>success(scope);
function paint(){const s=state(),issues=Object.values(s.issues),blocked=Object.keys(s.blocked).length;const el=document.getElementById('cloudSt');if(el&&cloud.ok!==false&&(issues.length||blocked)){el.textContent=issues.some(x=>x.tipo==='sesion')?'☁ revisa tu sesión':blocked?'☁ pendientes de revisión':'☁ sincronización pendiente';el.className='cloud-st saving';}
 let b=document.getElementById('hgSyncEstadoBtn');if(!ME||(!issues.length&&!blocked)){if(b)b.remove();return;}if(!b){b=document.createElement('button');b.id='hgSyncEstadoBtn';b.className='clock-link';b.textContent='REVISAR SINCRONIZACIÓN';b.onclick=dialog;document.querySelector('.clock-actions')?.appendChild(b);}}
function dialog(){document.getElementById('hgSyncEstado')?.remove();const s=state(),d=document.createElement('dialog');d.id='hgSyncEstado';d.style.cssText='max-width:750px;width:92%;background:#102219;color:#e3cf9a;border:1px solid #a99054;padding:24px';const h=document.createElement('h2');h.textContent='Estado de sincronización';const p=document.createElement('p');p.textContent='Los cambios pendientes se conservan. Un rechazo de permisos o un conflicto no significa que se haya perdido Internet. Los conflictos del mismo campo necesitan revisión; este botón no fuerza su sobrescritura.';const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;max-height:45vh;overflow:auto';pre.textContent=JSON.stringify({avisos:s.events,bloqueados:s.blocked,heredadasSinAutor:cloud.outbox.filter(x=>!x._emp).map(x=>x.clave),configuracionPendiente:Object.keys(cloud.dirty).filter(k=>owners[k]===s.id),operacionesPendientes:cloud.outbox.filter(x=>x._emp===s.id).map(x=>x.clave)},null,2);const retry=document.createElement('button');retry.textContent='REINTENTAR MIS PENDIENTES';retry.onclick=()=>{s.blocked={};s.backoff={};s.issues={};persist(s);d.close();d.remove();Object.keys(cloud.dirty).filter(k=>owners[k]===s.id).forEach(k=>cloudFlush(k));cloudFlushOutbox();cloudPoll(true);paint();};const enter=document.createElement('button');enter.textContent='VOLVER A ENTRAR';enter.onclick=()=>{d.close();d.remove();logoutToGate('Vuelve a entrar con tu propia cuenta. Los pendientes se conservan.');};const close=document.createElement('button');close.textContent='CERRAR';close.onclick=()=>{d.close();d.remove()};d.append(h,p,pre,retry,enter,close);document.body.appendChild(d);d.showModal();}
const oldPaint=paintCloud;paintCloud=function(){const r=oldPaint.apply(this,arguments);paint();return r;};
const oldMe=applyMe;applyMe=function(){const r=oldMe.apply(this,arguments);paint();return r;};
const oldRemote=applyRemote;applyRemote=function(k,val,t){const r=oldRemote.apply(this,arguments);if(!cloud.dirty[k]){const s=state();s.base[k]=clone(val);persist(s);}return r;};
function readOwners(){try{const latest=JSON.parse(store.get(ownKey)||'{}');Object.keys(owners).forEach(k=>delete owners[k]);Object.assign(owners,latest);}catch{}}
const oldSet=store.set;store.set=function(key,value){readOwners();const k=CLOUD_MAP[key],s=state();if(k&&!cloud.applying&&s.id){if(!cloud.dirty[k]){try{s.base[k]=JSON.parse(store.get(key)||'null')}catch{}}try{s.pending[k]=JSON.parse(value)}catch{}owners[k]=s.id;delete s.blocked['config:'+k];if(!persist(s)){const e=Error('No se pudo conservar el borrador. No se ha enviado: libera espacio antes de continuar.');e.status=507;e.code='ALMACENAMIENTO_LOCAL';report(e,'almacenamiento',s);if(typeof say==='function')say(e.message,'err');throw e;}}return oldSet.apply(this,arguments);};
const saveQueue=saveOutbox;
saveOutbox=function(){const id=ME?.id||'';if(id){try{localStorage.setItem('hg_sync_cola_'+id,JSON.stringify(cloud.outbox.filter(x=>x._emp===id)));}catch{}}return saveQueue.apply(this,arguments);};
function restoreQueue(){const id=ME?.id;if(!id)return;try{const own=JSON.parse(store.get('hg_sync_cola_'+id)||'null');if(Array.isArray(own))cloud.outbox=cloud.outbox.filter(x=>x._emp!==id).concat(own.filter(x=>x._emp===id));}catch{}}
if(typeof cloudUploadAll==='function'){const upload=cloudUploadAll;cloudUploadAll=function(){for(const key of Object.values(CLOUD_REV)){const raw=store.get(key);if(raw!==null)store.set(key,raw);}return upload.apply(this,arguments);};}
const put=cloudPut;cloudPut=function(k,v){const prev=cloud.outbox.find(x=>x.clave===k),r=put.apply(this,arguments),next=cloud.outbox.find(x=>x.clave===k);if(next&&next!==prev){next._emp=ME?.id||'';saveOutbox();}return r;};
async function httpError(r){const e=Error('HTTP '+r.status);e.status=r.status;try{const j=await r.clone().json();e.code=j.code||'';}catch{}return e;}
function runnable(s,scope){return !s.blocked[scope]&&Date.now()>=(s.backoff[scope]?.until||0);}
cloudFlush=function(k){readOwners();const s=state(),scope='config:'+k,flight=s.id+':'+scope;if(flights.has(flight))return flights.get(flight);if(!identity(s.id)||(owners[k]!==s.id&&!Object.hasOwn(s.pending,k))||!runnable(s,scope))return Promise.resolve();
 const run=async()=>{const key=CLOUD_REV[k],raw=Object.hasOwn(s.pending,k)?JSON.stringify(s.pending[k]):store.get(key);let follow=false;try{if(!key||raw===null)return;const local=JSON.parse(raw),base=s.base[k];if(base===undefined)throw conflict();
  for(let attempt=0;attempt<3;attempt++){
   const response=await sbFetch('/rest/v1/datos?select=clave,valor,actualizado&clave=eq.'+encodeURIComponent(k));if(!response.ok)throw await httpError(response);const rows=await response.json();if(!Array.isArray(rows)||rows.length>1)throw Error('Respuesta de configuración inválida');if(!identity(s.id))return;
   const remote=rows[0],combined=merge(base,local,remote?remote.valor:null);let result=remote;
   if(!remote||!same(combined,remote.valor)){try{result=await sbRpc('hg_config_guardar',{p_clave:k,p_valor:combined,p_version:remote?.actualizado||null});}catch(e){if(e.code==='40001'&&attempt<2)continue;throw e;}}
   if(!identity(s.id))return;if(!result||result.clave!==k||!result.actualizado)throw Error('Respuesta de guardado inválida');
   const now=Object.hasOwn(s.pending,k)?s.pending[k]:JSON.parse(store.get(key)||'null'),next=merge(local,now,result.valor);s.base[k]=clone(result.valor);cloud.stamps[k]=result.actualizado;
   readOwners();if(owners[k]===s.id&&!same(JSON.parse(store.get(key)||'null'),next))oldRemote(k,next,result.actualizado);
   if(same(next,result.valor)){delete cloud.dirty[k];delete s.pending[k];if(owners[k]===s.id)delete owners[k];}else{s.pending[k]=clone(next);follow=true;}
   saveDirty();delete s.blocked[scope];persist(s);success(scope,s);setCloudState(true);return;
  }
 }catch(e){if(!identity(s.id))return;const kind=report(e,scope,s);if(kind!=='red'){s.blocked[scope]={tipo:kind,estado:Number(e.status||0),codigo:e.code||'',fecha:Date.now()};persist(s);paint();}}
 finally{flights.delete(flight);if(follow&&identity(s.id))setTimeout(()=>cloudFlush(k),200);}};
 const p=Promise.resolve().then(run);flights.set(flight,p);return p;
};
cloudFlushOutbox=function(){if(queueFlight)return queueFlight;const s=state(),scope='cola';if(!identity(s.id)||!runnable(s,scope))return Promise.resolve();
 const run=async()=>{cloud.flushing=true;try{
  const batch=cloud.outbox.filter(x=>x._emp===s.id).slice(0,40);if(!batch.length)return;
  const stamp=new Date().toISOString(),rows=batch.map(x=>({clave:x.clave,valor:x.valor,actualizado:stamp}));rows.push({clave:'rev',valor:{n:crypto.randomUUID()},actualizado:stamp});
  const r=await sbFetch('/rest/v1/datos?on_conflict=clave',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});if(!r.ok)throw await httpError(r);if(!identity(s.id))return;
  cloud.outbox=cloud.outbox.filter(x=>!batch.includes(x));saveOutbox();cloud.justSaved=Date.now();success(scope,s);setCloudState(true);
 }catch(e){if(identity(s.id)){const kind=report(e,scope,s);if(kind!=='red'){s.blocked[scope]={tipo:kind,estado:Number(e.status||0),codigo:e.code||'',fecha:Date.now()};persist(s);paint();}}}
 finally{cloud.flushing=false;queueFlight=null;paintCloud();if(identity(s.id)&&runnable(s,scope)&&cloud.outbox.some(x=>x._emp===s.id))setTimeout(cloudFlushOutbox,200);}};
 const p=Promise.resolve().then(run);queueFlight=p;return p;
};
// Las colas anteriores sin autor se conservan para revisión, nunca se atribuyen a otro usuario.
const initial=state();if(cloud.outbox.some(x=>!x._emp)||Object.keys(cloud.dirty).some(k=>!owners[k])){initial.issues.heredados={tipo:'revision',estado:0,codigo:'PENDIENTES_SIN_AUTOR',ambito:'heredados',fecha:Date.now()};}
window.addEventListener('online',()=>{const s=state();s.backoff={};cloudPoll(true);cloudFlushOutbox();});
// La renovación de una misma cuenta se coordina entre pestañas; otras cuentas usan otro bloqueo.
const refreshOriginal=authRefresh,refreshFlights=new Map();
authRefresh=function(){const id=AUTH?.emp;if(!id||!navigator.locks?.request)return refreshOriginal();if(refreshFlights.has(id))return refreshFlights.get(id);const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),18000);const p=navigator.locks.request('harrington-renovar-'+id,{signal:ctl.signal},()=>AUTH?.emp===id?refreshOriginal():null).catch(()=>null).finally(()=>{clearTimeout(timer);refreshFlights.delete(id)});refreshFlights.set(id,p);return p;};
const meCurrent=applyMe;applyMe=function(){const r=meCurrent.apply(this,arguments);restoreQueue();if(rt.ws&&(!ME||AUTH?.emp!==ME.id)){try{rt.ws.close()}catch{}}return r;};
restoreQueue();paint();
if(window.__hgSyncTest)Object.assign(window.__hgSyncTest,{merge,state,report,success,owners});
})();
