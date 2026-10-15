/* Permisos de servidor y contraseñas personales. No almacena contraseñas en el navegador. */
(function(){
'use strict';if(typeof SANDBOX!=='undefined'&&SANDBOX)return;
document.addEventListener('load',e=>{if(e.target?.tagName==='IMG'&&e.target.parentNode?.classList.contains('weapon-icon'))e.target.parentNode.classList.add('has-icon')},true);
document.addEventListener('error',e=>{if(e.target?.tagName==='IMG'){e.target.parentNode?.classList.add('nofile');if(e.target.parentNode?.classList.contains('weapon-icon')&&typeof iconErr==='function')iconErr(e.target)}},true);
const OWNER='emuzvkc99z8q';let estado=null,espera=null,puertaCache=null,puertaT=0,puertaToken='';
let invitacion={};try{const q=new URLSearchParams(location.hash.slice(1));if(q.get('alta')&&q.get('empleado')){invitacion={codigo:q.get('alta'),emp:q.get('empleado')};sessionStorage.setItem('hg_alta',JSON.stringify(invitacion));history.replaceState(null,'',location.pathname+location.search);}else invitacion=JSON.parse(sessionStorage.getItem('hg_alta')||'{}');}catch{}
const fetchReal=window.fetch.bind(window);
window.fetch=async function(input,init){
const url=typeof input==='string'?input:input instanceof URL?input.href:input?.url||'';
const m=/^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/(\d+)\/[^/?]+(?:\/messages\/(\d+))?/.exec(url);
if(!m)return fetchReal(input,init);
const tk=await authToken();if(!tk)return new Response('{"error":"SIN_CUENTA"}',{status:401});
const opts=init||{},b={webhook:m[1],mensaje:m[2]||'',metodo:opts.method||'POST',wait:new URL(url).searchParams.get('wait')==='true'};
let body,headers={apikey:SB_KEY,Authorization:'Bearer '+tk};
if(opts.body instanceof FormData){const fd=new FormData();try{b.payload=JSON.parse(opts.body.get('payload_json')||'{}');}catch{return new Response(null,{status:400})}fd.set('peticion',JSON.stringify(b));for(const [k,v]of opts.body.entries())if(k.startsWith('files['))fd.append(k,v);body=fd;}
else{try{b.payload=JSON.parse(opts.body||'{}')}catch{b.payload={}}body=JSON.stringify(b);headers['Content-Type']='application/json';}
return fetchReal(SB_URL+'/functions/v1/discord-envios',{method:'POST',headers,body});
};
const authOriginal=authApi;
authApi=async function(body){const tk=AUTH?.at;const r=await fetchReal(AUTH_URL,{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json',...(tk?{Authorization:'Bearer '+tk}:{})},body:JSON.stringify({...body,...(body.accion==='crear'&&invitacion.emp===body.empId?{invitacion:invitacion.codigo}:{})})}).catch(()=>null);if(!r)return{ok:false,st:0,j:{}};return{ok:r.ok,st:r.status,j:await r.json().catch(()=>({}))};};
const sbOriginal=sbFetch;
function coincide(k,f){if(!f)return true;if(f.startsWith('eq.'))return k===f.slice(3);if(f.startsWith('in.('))return f.slice(4,-1).split(',').includes(k);if(f.startsWith('like.')){const p=f.slice(5);return new RegExp('^'+p.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$').test(k)}return false;}
sbFetch=async function(path,opts){const r=await sbOriginal(path,opts);if((opts?.method||'GET')!=='GET'||!path.startsWith('/rest/v1/datos?')||!r.ok)return r;
const q=new URLSearchParams(path.split('?')[1]),f=q.get('clave');if(f&&!['empleados','discord','acceso'].some(k=>coincide(k,f)))return r;
let rows=await r.clone().json().catch(()=>null);if(!Array.isArray(rows))return r;
const tk=await authToken();if(!puertaCache||Date.now()-puertaT>3000||puertaToken!==(tk||'')){const p=await fetchReal(SB_URL+'/rest/v1/rpc/hg_puerta',{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json',...(tk?{Authorization:'Bearer '+tk}:{})},body:'{}'});if(!p.ok)return r;puertaCache=await p.json();puertaT=Date.now();puertaToken=tk||'';}
for(const x of puertaCache)if(coincide(x.clave,f)){rows=rows.filter(y=>y.clave!==x.clave);rows.push(x);}
return new Response(JSON.stringify(rows),{status:200,headers:{'Content-Type':'application/json'}});
};
gPwSrv=async function(s,e,pw){
if(s.mode==='create'&&pw.length<12)return gPwErr('Mínimo 12 caracteres');
const r=await authApi({accion:s.mode==='create'?'crear':'entrar',empId:e.id,pw});
if(r.ok&&r.j.access_token){invitacion={};try{sessionStorage.removeItem('hg_alta')}catch{}G.fails[e.id]=0;authSave(authFromResp(r.j,e.id));setBoss(!!r.j.jefe);gateHello(e);try{rtToken()}catch{}return;}
if(r.st===401)return 'mal';
if(r.st===429)return gPwErr('Demasiados intentos. Espera 15 minutos.');
if(r.j.error==='INVITACION_NECESARIA')return gPwErr('Abre el enlace privado que recibiste al aceptar tu solicitud o al resetear tu contraseña.');
if(r.j.error==='CONFIGURA_CLAVE_PERSONAL_DESDE_TU_SESION')return gPwErr('Crea tu contraseña personal desde la sesión de Vincent que tienes abierta.');
return gPwErr(r.st===0?'Sin conexión: no se puede verificar tu cuenta.':r.j.error||'No se pudo iniciar sesión.');
};
const gPick=gatePickSrv;gatePickSrv=async function(e){await gPick(e);if(!G.pw)return;if(invitacion.emp===e.id){const estadoAlta=await authApi({accion:'estado',empId:e.id});if(estadoAlta.ok&&!estadoAlta.j.tiene){gPwShow(e,'create');G.pw.srv=true;G.pw.srvTry=true;}else if(estadoAlta.ok){invitacion={};try{sessionStorage.removeItem('hg_alta')}catch{}}}};
const restringidas=new Set(['empleados','descuentos','precios','productos','discord','stockmin','proveedores','recetas','jefe','sebusca']);
const pushOriginal=cloudPush,flushOriginal=cloudFlush;
cloudPush=function(k){if(ME?.id!==OWNER&&restringidas.has(k)){delete cloud.dirty[k];saveDirty();return;}return pushOriginal(k);};
cloudFlush=async function(k){if(ME?.id!==OWNER&&restringidas.has(k)){delete cloud.dirty[k];saveDirty();return;}return flushOriginal(k);};
try{CLAVES={};localStorage.removeItem('harrington_claves_v1');localStorage.removeItem('harrington_boss_cred_v1');localStorage.removeItem('harrington_boss_pw_v1');localStorage.removeItem('harrington_boss_word_v1');}catch{}
const bossOriginal=setBoss;setBoss=function(v){return bossOriginal(!!v&&ME?.id===OWNER);};
const abrirJefeAnterior=openBoss;openBoss=function(){if(ME?.id===OWNER&&AUTH?.emp===OWNER){if(estado&&!estado.personal)return abrirPersonal();return setBoss(true);}say('La administración está reservada al propietario.','err');};
function abrirPersonal(){if(document.getElementById('hgClavePersonal'))return;const dialog=document.createElement('dialog');dialog.id='hgClavePersonal';dialog.style.cssText='max-width:440px;width:90%;background:#102219;color:#e3cf9a;border:1px solid #a99054;padding:26px;border-radius:8px';dialog.innerHTML='<form><h2>Tu contraseña personal</h2><p>Solo tu cuenta administra Harrington. Crea una contraseña de al menos 12 caracteres.</p><label>Nueva contraseña<input id="hgPwNueva" type="password" autocomplete="new-password" minlength="12" maxlength="80" required style="display:block;width:100%;margin:8px 0 16px"></label><label>Repetir contraseña<input id="hgPwRepetir" type="password" autocomplete="new-password" maxlength="80" required style="display:block;width:100%;margin:8px 0 16px"></label><p id="hgPwEstado" role="status"></p><button type="submit" class="primary">GUARDAR MI CONTRASEÑA</button></form>';document.body.appendChild(dialog);dialog.addEventListener('cancel',e=>e.preventDefault());dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const p=dialog.querySelector('#hgPwNueva'),r=dialog.querySelector('#hgPwRepetir'),s=dialog.querySelector('#hgPwEstado'),b=dialog.querySelector('button');if(p.value!==r.value){s.textContent='Las contraseñas no coinciden';return;}if(p.value.length<12){s.textContent='Mínimo 12 caracteres';return;}b.disabled=true;s.textContent='Guardando…';try{const a=await authApi({accion:'personalizar',pw:p.value});if(!a.ok){s.textContent=a.j.error||'No se pudo guardar';return;}p.value='';r.value='';estado.personal=true;dialog.close();dialog.remove();say('Contraseña personal guardada. Solo tú la conoces.');}finally{b.disabled=false;}};dialog.showModal();}
empResetClave=async function(id){if(id===OWNER)return say('Tu contraseña se cambia en Seguridad de mi cuenta.');const e=empleados.find(x=>x.id===id);if(!e)return;if(!await askConfirm('Resetear contraseña','Se cerrarán las sesiones de '+e.name+' y recibirá acceso para crear una contraseña nueva.','RESETEAR'))return;const r=await authApi({accion:'resetear',empId:id});if(!r.ok)return say('No se pudo resetear: '+(r.j.error||r.st),'err');delete CLAVES[id];if(CLAVE_SET)CLAVE_SET.delete(id);paintClaves();const d=document.createElement('dialog');d.style.cssText='max-width:500px;background:#102219;color:#e3cf9a;padding:24px';const p=document.createElement('p');p.textContent='Contraseña reseteada. Comparte este enlace privado únicamente con '+e.name+'. Caduca en 24 horas.';const a=document.createElement('textarea');a.value=r.j.enlace;a.readOnly=true;a.style.width='100%';const b=document.createElement('button');b.textContent='CERRAR';b.onclick=()=>{d.close();d.remove()};d.append(p,a,b);document.body.appendChild(d);d.showModal();};
async function revisar(){if(espera||!AUTH?.at||!ME)return;espera=true;try{const r=await authApi({accion:'seguridad_estado'});if(!r.ok)return;estado=r.j;if(!estado.propietario){setBoss(false);bossBtn.hidden=true;return;}let b=document.getElementById('hgSeguridadBtn');if(!b){b=document.createElement('button');b.id='hgSeguridadBtn';b.className='clock-link';b.textContent='SEGURIDAD DE MI CUENTA';b.onclick=abrirPersonal;document.querySelector('.clock-actions')?.appendChild(b);}if(!estado.personal)abrirPersonal();}finally{espera=false;}}
setTimeout(revisar,1500);setInterval(revisar,30000);
})();
