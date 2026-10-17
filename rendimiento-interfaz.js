/* Optimizaciones sin cambiar precios, operaciones ni apariencia. */
(function(){'use strict';
 // Un mismo estado de almacén/recetas/reservas produce los mismos límites.
 const stockLimits=applyStockLimits,limit=limitFor,reservations=saleReservations;
 let context=null,last='',limits=new Map();
 saleReservations=function(){return context&&context.reserved!==undefined?context.reserved:reservations.apply(this,arguments);};
 limitFor=function(name){if(!context)return limit.apply(this,arguments);if(limits.has(name))return limits.get(name);const n=limit.apply(this,arguments);limits.set(name,n);return n;};
 applyStockLimits=function(){
  const reserved=autoVentaOn()?reservations():undefined;
  const signature=JSON.stringify([appMode,customer.op,!!sale,!!loadedEnc,stockMap,recetas,reserved,sale?.stockApplied||null,loadedEnc?.items||null]);
  if(signature!==last){last=signature;limits.clear();}
  const previous=context;context={reserved};try{return stockLimits.apply(this,arguments);}finally{context=previous;}
 };
 // El desglose del ticket no sustituye sus nodos si los importes siguen iguales.
 renderFin=function(f){
  const sale=finToSale(f),html=finRows(sale).map(r=>'<div class="brow '+(r[2]||'')+'"><span>'+esc(r[0])+'</span><span>'+r[1]+'</span></div>').join('');
  if(breakdownEl.innerHTML!==html)breakdownEl.innerHTML=html;
  const label=dueLabel(sale);if(totalLabel.textContent!==label)totalLabel.textContent=label;
  const error=document.getElementById('depositErr'),show=!!(f.over&&f.kind==='senal');if(error.hidden===show)error.hidden=!show;
  if(show){const text='El pago por adelantado no puede superar el precio final ('+money(f.final)+').';if(error.textContent!==text)error.textContent=text;}
 };
 // El buscador reutiliza nombres normalizados y no vuelve a escribir estilos iguales.
 const search=document.getElementById('search'),indexed=new WeakMap();let queued=false,frame=0,generation=0;
 filter=function(){
  queued=false;generation++;if(frame)cancelAnimationFrame(frame);frame=0;
  const query=norm(search.value.trim());let count=0;
  for(const row of document.querySelectorAll('#products .product')){
   let entry=indexed.get(row);if(!entry||entry.raw!==row.dataset.name){entry={raw:row.dataset.name,name:norm(row.dataset.name)};indexed.set(row,entry);}
   const visible=(cat==='todos'||row.dataset.cat===cat)&&entry.name.includes(query),display=visible?'grid':'none';
   if(row.style.display!==display)row.style.display=display;if(visible)count++;
  }
  const empty=document.getElementById('noResults');if(empty.hidden!==(count>0))empty.hidden=count>0;
 };
 search.oninput=e=>{if(e?.isComposing||queued)return;queued=true;const own=++generation;frame=requestAnimationFrame(()=>{if(queued&&own===generation)filter();});};
 search.addEventListener('compositionend',()=>filter());search.addEventListener('keydown',e=>{if(e.key==='Enter')filter();});
 // La búsqueda del historial sigue incluyendo registros de todas las páginas.
 let dirQueued=false,dirFrame=0,dirGeneration=0,dirField=null;
 function filterHistory(field){
  dirQueued=false;dirGeneration++;if(dirFrame)cancelAnimationFrame(dirFrame);dirFrame=0;
  if(!field?.isConnected||dirModal.hidden)return;
  const query=norm(field.value.trim());
  if(query){for(const row of dirModal.querySelectorAll('.pg-x'))row.classList.remove('pg-x');for(const more of dirModal.querySelectorAll('.pg-more'))more.remove();}
  for(const row of dirModal.querySelectorAll('[data-q]')){const display=row.dataset.q.includes(query)?'':'none';if(row.style.display!==display)row.style.display=display;}
  if(!query)pgApply();
 }
 dirModal.addEventListener('input',e=>{if(!e.target.dataset.filter)return;e.stopImmediatePropagation();if(e.isComposing)return;dirField=e.target;if(dirQueued)return;dirQueued=true;const own=++dirGeneration;dirFrame=requestAnimationFrame(()=>{if(dirQueued&&own===dirGeneration)filterHistory(dirField);});},true);
 dirModal.addEventListener('compositionend',e=>{if(e.target.dataset.filter)filterHistory(e.target);},true);
 dirModal.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.filter)filterHistory(e.target);},true);
 // Ver más solo revela las filas existentes: no reconstruye miles de registros.
 dirModal.addEventListener('click',e=>{const button=e.target.closest('[data-pgm]');if(!button)return;e.preventDefault();e.stopImmediatePropagation();const key=button.dataset.pgm,scroll=dirModal.scrollTop,focused=document.activeElement===button;PGL[key]=(PGL[key]||50)+50;pgApply();if(focused){const next=[...dirModal.querySelectorAll('[data-pgm]')].find(b=>b.dataset.pgm===key);next?.focus({preventScroll:true});}dirModal.scrollTop=scroll;},true);
 // Conserva foco/cursor solo cuando se sigue en la misma ficha y el valor no ha cambiado.
 const signature=el=>[el.id,el.name,el.type,...[...el.attributes].filter(a=>a.name.startsWith('data-')).map(a=>a.name+'='+a.value).sort()].join('|');
 function stable(name,root,body,view){const render=window[name];if(typeof render!=='function'||!root||!body)return;let rendered=view();window[name]=function(){
  const sameView=view(),wasSameView=rendered===sameView,visible=!root.hidden,scroll=root.scrollTop,inner=body.scrollTop,active=document.activeElement;
  const editing=body.contains(active)&&active.matches('input:not([type=file]):not([type=password]),select,textarea');
  const saved=editing?{key:signature(active),value:active.value,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection}:null;
  const result=render.apply(this,arguments);
  const currentView=view();rendered=currentView;
  if(visible&&!root.hidden&&wasSameView&&sameView===currentView){
   if(saved&&!active.isConnected&&(document.activeElement===document.body||document.activeElement===root)){
    const replacement=[...body.querySelectorAll('input,select,textarea')].find(el=>signature(el)===saved.key);
    if(replacement&&!replacement.disabled&&replacement.value===saved.value){replacement.focus({preventScroll:true});try{if(saved.start!==null)replacement.setSelectionRange(saved.start,saved.end,saved.direction);}catch{}}
   }
   root.scrollTop=scroll;body.scrollTop=inner;
  }
  return result;
 };}
 stable('renderDir',dirModal,document.getElementById('dirBody'),()=>dirMod);
 stable('renderEnc',encModal,document.getElementById('encBody'),()=>encView);
 stable('renderPed',pedModal,document.getElementById('pedBody'),()=>pedView);
 stable('renderInv',invModal,document.getElementById('invBody'),()=>invView);
 // La protección existente también cubre la activación por teclado durante un guardado.
 document.addEventListener('click',e=>{const b=e.target.closest('button[aria-busy="true"]');if(b){e.preventDefault();e.stopImmediatePropagation();}},true);
})();

/* Reutilizar lecturas inmutables y cálculos: no cambia la frecuencia de sincronización. */
(function(){'use strict';
 // workedMs solo lee los turnos. Las lecturas públicas siguen devolviendo copias nuevas.
 const load=loadLog,worked=workedMs;let reading=0,shiftRaw=null,shiftRows=[];
 loadLog=function(key){
  if(!reading||key!==KEY_SHIFTLOG)return load.apply(this,arguments);
  const raw=store.get(key)||'[]';
  if(raw!==shiftRaw){let rows=[];try{const parsed=JSON.parse(raw);if(Array.isArray(parsed))rows=parsed;}catch{}shiftRows=rows;shiftRaw=raw;}
  return shiftRows;
 };
 workedMs=function(){reading++;try{return worked.apply(this,arguments);}finally{reading--;}};
 // El objetivo usa importes guardados en las ventas, no precios actuales del catálogo.
 const cash=goalWeekCash;let salesRaw=null,salesWeek=null,salesCash=0;
 goalWeekCash=function(){
  const raw=store.get(KEY_SALELOG)||'[]',week=weekStart(0);
  if(raw===salesRaw&&week===salesWeek)return salesCash;
  const value=cash.apply(this,arguments);salesRaw=raw;salesWeek=week;salesCash=value;return value;
 };
 const board=renderEmpWeek;let previous=null;
 renderEmpWeek=function(){
  const el=document.getElementById('empWeek');if(!el)return board.apply(this,arguments);
  const state=[store.get(KEY_SALELOG),weekStart(-1),JSON.stringify(empleados),JSON.stringify(PHOTOS),!!IMG_OK['cartel-se-busca.webp']];
  if(previous&&previous.el===el&&state.every((x,i)=>x===previous.state[i])&&el.innerHTML===previous.html&&el.hidden===previous.hidden&&el.className===previous.classes)return;
  const result=board.apply(this,arguments);previous={el,state,html:el.innerHTML,hidden:el.hidden,classes:el.className};return result;
 };
 // Una apertura y un refresco simultáneos comparten la consulta de presencia.
 const presence=loadPresence;let flight=null;
 loadPresence=function(){
  const owner=String(ME?.id||'')+'|'+String(AUTH?.emp||'');if(flight?.owner===owner)return flight.promise;
  if(!arguments[0]&&Date.now()-PRES.at<15000)return Promise.resolve(paintPresence());
  const args=arguments,entry={owner,promise:null};
  entry.promise=Promise.resolve().then(()=>presence.apply(this,args));flight=entry;
  const clear=()=>{if(flight===entry)flight=null;};entry.promise.then(clear,clear);return entry.promise;
 };
})();
