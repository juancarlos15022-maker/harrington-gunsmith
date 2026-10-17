/* Presentación sobre las acciones existentes: no registra ventas ni cambia estados. */
(function(){'use strict';
 function flow(stages,label,mini=false){
  return '<ol class="hg-flow'+(mini?' hg-flow-mini':'')+'" aria-label="'+label+'">'+stages.map(s=>'<li data-state="'+(s.done?'done':s.partial?'partial':'pending')+'"><i aria-hidden="true">'+(s.done?'✓':s.partial?'◐':'○')+'</i><span>'+s.label+'</span><small>'+(s.done?'Completado':s.partial?'En curso':'Pendiente')+'</small></li>').join('')+'</ol>';
 }
 function encFlow(e,mini){return flow([{label:'Encargado',done:true},{label:'Fabricado',done:e.fab==='FABRICADO'},{label:'Avisado',done:!!e.avisado},{label:'Entregado',done:!!e.finished}],'Progreso del encargo',mini);}
 function pedFlow(p,mini){const raw=pedRecv(p),r={q:Math.max(0,Number(raw.q)||0),r:Math.max(0,Number(raw.r)||0)},received=!!p.received||r.q>0&&r.r>=r.q;return flow([{label:'Emitido',done:true},{label:'Recibido'+(!received&&r.r>0?' '+r.r+'/'+r.q:''),done:received,partial:!received&&r.r>0},{label:'Pagado',done:!!p.paid},{label:'Completado',done:received&&!!p.paid}],'Progreso del pedido: recepción y pago independientes',mini);}
 stepsHTML=e=>encFlow(e,false);
 const encRender=renderEnc;renderEnc=function(){const r=encRender.apply(this,arguments);for(const card of document.querySelectorAll('#encBody [data-open]')){const e=pendingEncs().find(x=>x.id===card.dataset.open);if(e&&!card.querySelector('.hg-flow'))card.insertAdjacentHTML('beforeend',encFlow(e,true));}return r;};
 const pedRender=renderPed;renderPed=function(){const r=pedRender.apply(this,arguments);const body=document.getElementById('pedBody');for(const card of body.querySelectorAll('[data-popen]')){const p=pendingPed().find(x=>x.id===card.dataset.popen);if(p&&!card.querySelector('.hg-flow'))card.insertAdjacentHTML('beforeend',pedFlow(p,true));}const p=pedView?pendingPed().find(x=>x.id===pedView):null;if(p&&!body.querySelector('.hg-flow'))body.querySelector('.albaran')?.insertAdjacentHTML('beforebegin',pedFlow(p,false));return r;};
 const motionRow=document.getElementById('fxBtn')?.closest('.set-row');
 if(motionRow&&!document.getElementById('hgMotionBtn')){
  const row=document.createElement('div'),label=document.createElement('span'),button=document.createElement('button');row.className='set-row';label.textContent='Transiciones de ventanas';button.type='button';button.id='hgMotionBtn';button.className='clock-link boss-btn';button.setAttribute('aria-label','Desactivar transiciones de ventanas');let off=false;try{off=localStorage.getItem('harrington_transiciones')==='off';}catch{}
  const paint=()=>{document.documentElement.classList.toggle('hg-no-transitions',off);button.textContent=off?'SIN ANIMACIÓN':'AUTO';button.setAttribute('aria-pressed',String(off));};button.onclick=e=>{e.stopPropagation();off=!off;try{localStorage.setItem('harrington_transiciones',off?'off':'auto');}catch{}paint();};row.append(label,button);motionRow.after(row);paint();
 }
 const products=document.getElementById('products');
 for(const row of products.querySelectorAll('.product')){
  const icon=row.querySelector('.weapon-icon'),name=row.querySelector('.qty input')?.dataset.name;
  if(!icon||!name)continue;icon.tabIndex=0;icon.setAttribute('role','button');icon.setAttribute('aria-label','Ver ficha de '+name);
 }
 function enhance(row){
  const body=document.getElementById('prodBody');if(body.querySelector('.hg-prod-qty'))return;const hero=body.querySelector('.prod-sheet .weapon-icon');if(hero)for(const attr of ['role','tabindex','aria-label'])hero.removeAttribute(attr);
  const actual=row.querySelector('.qty input'),sourcePlus=row.querySelector('.plus'),sourceMinus=row.querySelector('.minus'),name=actual.dataset.name;
  const group=document.createElement('div');group.className='hg-prod-qty';group.setAttribute('role','group');group.setAttribute('aria-label','Cantidad de '+name);
  const title=document.createElement('span');title.className='hg-prod-label';title.textContent='UNIDADES EN EL PEDIDO';
  const minus=document.createElement('button'),plus=document.createElement('button'),quantity=document.createElement('input');minus.type=plus.type='button';minus.textContent='−';plus.textContent='+';minus.setAttribute('aria-label','Restar '+name);plus.setAttribute('aria-label','Sumar '+name);quantity.type='number';quantity.min='0';quantity.max=String(MAX_QTY);quantity.inputMode='numeric';quantity.setAttribute('aria-label','Unidades de '+name);
  const update=()=>{quantity.value=actual.value;quantity.disabled=actual.disabled||!(Number(actual.dataset.price)>0);plus.disabled=sourcePlus.disabled||quantity.disabled;minus.disabled=sourceMinus.disabled||readQty(actual)===0||quantity.disabled;};
  minus.onclick=()=>{if(!sourceMinus.disabled)sourceMinus.click();update();};plus.onclick=()=>{if(!sourcePlus.disabled)sourcePlus.click();update();};quantity.onchange=()=>{if(!actual.disabled){actual.value=quantity.value;actual.dispatchEvent(new Event('input',{bubbles:true}));}update();};
  group.append(title,minus,quantity,plus);const actions=body.querySelector('.enc-actions');actions.before(group);
  const add=document.getElementById('prodAdd');add.textContent='VOLVER AL CATÁLOGO';add.disabled=false;add.onclick=()=>closeModal(prodModal);update();
 }
 products.addEventListener('click',e=>{const icon=e.target.closest('.weapon-icon'),name=e.target.closest('.pname');if(icon){icon.closest('.product').querySelector('.pname').click();return;}if(name&&!prodModal.hidden)enhance(name.closest('.product'));});
 products.addEventListener('keydown',e=>{const icon=e.target.closest('.weapon-icon');if(icon&&(e.key==='Enter'||e.key===' ')){e.preventDefault();icon.click();}});
})();
