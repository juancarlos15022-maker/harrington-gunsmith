/* Recuento físico de Dirección: no guarda nada hasta confirmar las diferencias. */
(function(){
 'use strict';
 const button=document.getElementById('hacerInventarioBtn');
 let draft=null,base={},rows=[],review=false,busy=false,conflicts=[],saved=null,query='';
 const allowed=()=>!!ME&&AUTH?.emp===ME.id&&typeof soyJefe==='function'&&soyJefe();
 const draftKey=()=> 'harrington_inventario_jefe_'+meEmp().id;
 const persist=()=>localStorage.setItem(draftKey(),JSON.stringify(draft));
 function paintButton(){button.hidden=!allowed();if(!allowed()&&invView==='jefe'){closeModal(invModal);draft=null}}
 const oldSetBoss=setBoss;setBoss=function(){const r=oldSetBoss.apply(this,arguments);paintButton();return r};
 const oldApplyMe=applyMe;applyMe=function(){const r=oldApplyMe.apply(this,arguments);paintButton();return r};paintButton();
 function list(){
  const names=new Map();
  inputs.forEach(i=>names.set(i.dataset.name,{k:i.dataset.name,name:i.dataset.name,grp:isMatProd(i.dataset.name)?'MATERIALES':'PRODUCTOS'}));
  Object.keys(base).forEach(k=>names.set(k,{k,name:isMat(k)?k.slice(4):k,grp:isMatK(k)?'MATERIALES':'PRODUCTOS'}));
  return Array.from(names.values()).sort((a,b)=>a.grp.localeCompare(b.grp)||a.name.localeCompare(b.name,'es'));
 }
 async function refresh(recount){
  const fresh=await sbRpc('inventario_preparar',{});
  if(!fresh||typeof fresh!=='object'||Array.isArray(fresh))throw Error('Respuesta incompleta');
  if(recount){Object.keys(draft.q).forEach(k=>{const a=draft.base[k]||{q:0,v:null},b=fresh[k]||{q:0,v:null};if(a.q!==b.q||a.v!==b.v||a.npc!==b.npc||a.nv!==b.nv)delete draft.q[k]})}
  base=fresh;draft.base=base;rows=list();conflicts=[];review=false;persist();
 }
 async function open(){
  if(!allowed()||busy)return;busy=true;
  try{
   draft=JSON.parse(localStorage.getItem(draftKey())||'null');
   if(!draft||!draft.q||!draft.base||draft.ubicacion!=='almacen')draft=draft&&draft.pending?draft:{q:{},base:{},ubicacion:'almacen'};
   saved=null;query='';conflicts=[];review=false;
   if(Object.keys(draft.q).length||draft.pending){base=draft.base;rows=list()}else await refresh(false);
   invView='jefe';render();openModal(invModal);invModal.scrollTop=0;
  }catch(e){say('No se pudo cargar el inventario. Es necesario estar conectado con una cuenta de jefe.','err')}
  finally{busy=false}
 }
 function counted(){
  return Object.keys(draft.q).filter(k=>draft.q[k]!=='').map(k=>{
   const value=String(draft.q[k]);if(!/^\d{1,6}$/.test(value))throw Error('Cantidad no válida: '+(rows.find(x=>x.k===k)||{name:k}).name);
   const b=base[k]||{q:0,v:null};return {k,teo:b.q,version:b.v,fis:Number(value)+(b.npc||0),fisAlmacen:Number(value),npcTeo:b.npc||0,npcVersion:b.nv||null,ubicacion:'almacen'};
  });
 }
 function render(){
  if(!allowed())return;document.getElementById('invTitle').textContent='HACER INVENTARIO';
  const body=document.getElementById('invBody');
  if(saved){
   const differences=saved.items.filter(x=>Number(x.diff)!==0);
   body.innerHTML='<div class="enc-note">✓ Inventario guardado. '+saved.items.length+' artículos contados · '+saved.changed+' ajustes. Las casillas vacías han conservado sus existencias.</div>'+
    (differences.length?'<div class="dir-sec-title">DIFERENCIAS DE STOCK ('+differences.length+')</div>'+differences.map(x=>'<div class="reg-line"><span>'+esc(x.name||x.k)+'<br><small>Stock anterior: '+x.teo+' · Stock guardado: '+x.fis+'</small></span><b class="'+(x.diff<0?'neg':'mg-ok')+'">'+(x.diff>0?'+':'')+x.diff+'</b></div>').join(''):'<div class="enc-empty">Todo cuadra: no hay diferencias de stock.</div>')+
    (saved.warnings||[]).map(t=>'<p class="pay-err">'+esc(t)+'</p>').join('')+'<p class="bk-note">Los ajustes ya están guardados y las unidades del NPC se conservan. Puedes revisar este resultado antes de continuar.</p><p class="bk-note">Registro: '+esc(saved.id)+'</p><div class="enc-actions"><button type="button" class="primary" data-ij="continue">CONTINUAR</button></div>';return;
  }
  if(draft.pending){body.innerHTML='<p class="bk-note">Hay un inventario cuya respuesta quedó pendiente. Recupéralo antes de empezar otro para evitar duplicados.</p><button type="button" class="primary" data-ij="retry">RECUPERAR GUARDADO</button>';return}
  if(review){
   const items=counted();body.innerHTML='<p class="bk-note">Revisa las diferencias antes de confirmar. Solo se actualizarán los artículos que has contado.</p>'+items.map(x=>'<div class="reg-line"><span>'+esc((rows.find(r=>r.k===x.k)||{name:x.k}).name)+'<br><small>Registrado '+(x.teo-x.npcTeo)+' → contado '+x.fisAlmacen+' · NPC conservado: '+x.npcTeo+'</small></span><b>'+(x.fis-x.teo>0?'+':'')+(x.fis-x.teo)+'</b></div>').join('')+'<div class="enc-actions"><button type="button" data-ij="back">VOLVER AL RECUENTO</button><button type="button" class="primary" data-ij="save">CONFIRMAR Y GUARDAR</button></div>';return;
  }
  let group='';
  body.innerHTML='<p class="bk-note">Cuenta solo tu almacén, sin incluir lo que tiene el NPC. Las unidades del NPC se conservan y se suman al total del negocio. <b>Vacío = sin revisar; 0 = no hay unidades.</b> Al guardar podrás revisar las diferencias antes de ajustar el stock.</p>'+(conflicts.length?'<p class="pay-err">El stock cambió durante el recuento: '+conflicts.map(esc).join(', ')+'. Actualiza y vuelve a contar los artículos afectados.</p><button type="button" data-ij="refresh">ACTUALIZAR STOCK Y REVISAR</button>':'')+'<input class="dir-search" id="ijSearch" placeholder="Buscar producto o material…" value="'+esc(query)+'">'+rows.filter(x=>!query||norm(x.name).includes(norm(query))).map(x=>{const head=group!==x.grp?'<div class="dir-sec-title">'+x.grp+'</div>':'';group=x.grp;return head+'<div class="pr-row"><div><b>'+esc(x.name)+'</b><small>Registrado: '+Math.max(0,((base[x.k]||{}).q||0)-((base[x.k]||{}).npc||0))+' · NPC: '+((base[x.k]||{}).npc||0)+' · Total: '+((base[x.k]||{}).q||0)+'</small></div><input class="min-in" type="text" inputmode="numeric" data-ijq="'+esc(x.k)+'" placeholder="Sin revisar" value="'+esc(draft.q[x.k]===undefined?'':draft.q[x.k])+'" aria-label="Cantidad contada de '+esc(x.name)+'"></div>'}).join('')+'<div class="enc-actions"><button type="button" class="primary" data-ij="review">GUARDAR CAMBIOS</button></div>';
 }
 async function save(){
  if(!allowed()||busy)return;busy=true;
  try{
   if(!draft.pending){const items=counted();if(!items.length)return say('Introduce al menos una cantidad contada','err');draft.pending={p_peticion:crypto.randomUUID(),p_items:items};persist()}
   const request=draft.pending;
   let result;
   try{result=await sbRpc('inventario_guardar',request)}catch(e){
    const t=String(e.message||'');
    if(/STOCK_CAMBIADO|CANTIDAD_INVALIDA|ARTICULO_DUPLICADO|SOLO_JEFES|RECUENTO_VACIO|NPC_UBICACION_REQUERIDA/.test(t)){
     if(/STOCK_CAMBIADO/.test(t)){try{conflicts=JSON.parse(JSON.parse(t).details).map(k=>isMat(k)?k.slice(4):k)}catch(x){conflicts=['uno o varios artículos']}}
     delete draft.pending;persist();review=false;render();say(/STOCK_CAMBIADO/.test(t)?'El stock ha cambiado. No se ha guardado ningún ajuste.':'No se puede guardar este inventario: revisa la cuenta y las cantidades.','err');
    }else{render();say('No se pudo confirmar la respuesta. Recupera el guardado para evitar duplicados.','err')}
    return;
   }
   if(!result||!result.id||!Array.isArray(result.items))throw Error('Respuesta incompleta');
   applyStockMap(result.stock);applyRecords(result.records||[]);
   saved=result;localStorage.removeItem(draftKey());
   try{calc(false);invChanged(result.moves||[],'Inventario físico '+result.id)}catch(e){}
   if(!result.replayed)try{discordSend('stock',['INVENTARIO FÍSICO · '+result.id,'Jefe: '+meEmp().name,result.items.length+' artículos contados · '+result.changed+' ajustes'].concat(result.items.filter(x=>x.diff).map(x=>x.name+': '+x.teo+' → '+x.fis)).join('\n'))}catch(e){}
   if(!allowed())return;render();openModal(invModal);invModal.scrollTop=0;document.getElementById('invBody').scrollTop=0;say('Inventario guardado y stock actualizado');
  }catch(e){say(e.message||'No se pudo guardar el inventario. Se conserva para reintentarlo.','err')}
  finally{busy=false}
 }
 button.onclick=open;
 invModal.addEventListener('input',e=>{
  if(invView!=='jefe'||!allowed()||!draft)return;
  if(e.target.dataset.ijq!==undefined){draft.q[e.target.dataset.ijq]=e.target.value.trim();try{persist()}catch(x){say('No se pudo conservar el borrador en este dispositivo','err')}}
  if(e.target.id==='ijSearch'){query=e.target.value;render();const i=document.getElementById('ijSearch');i.focus();i.setSelectionRange(query.length,query.length)}
 });
 invModal.addEventListener('click',async e=>{
  const el=e.target.closest('[data-ij]');if(!el||invView!=='jefe'||!allowed()||busy)return;
  try{
   if(el.dataset.ij==='review'){if(!counted().length)return say('Introduce al menos una cantidad contada','err');review=true;render();invModal.scrollTop=0;document.getElementById('invBody').scrollTop=0}
   else if(el.dataset.ij==='continue'){if(saved)closeModal(invModal)}
   else if(el.dataset.ij==='back'){review=false;render()}
   else if(el.dataset.ij==='save'||el.dataset.ij==='retry')await save();
   else if(el.dataset.ij==='refresh'){busy=true;try{await refresh(true);render();say('Stock actualizado. Vuelve a contar las casillas que se han vaciado.')}finally{busy=false}}
  }catch(x){say(x.message||'No se pudo completar la acción','err')}
 });
 const oldRender=renderInv;renderInv=function(){if(invView==='jefe')return render();return oldRender.apply(this,arguments)};
})();
