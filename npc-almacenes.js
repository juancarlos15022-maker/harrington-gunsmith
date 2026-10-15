/* Dos ubicaciones, un único stock total. Toda operación real la confirma Supabase. */
(function(){
 'use strict';
 const titles={entregar:'ENTREGAR PRODUCTOS AL NPC',recuperar:'RECUPERAR DEL NPC AL ALMACÉN',consumir:'RETIRAR DEL NPC PARA CONSUMO',revision:'REVISAR VENTAS DEL NPC',inventario:'HACER INVENTARIO DEL NPC',precios:'PRECIOS DEL NPC'};
 let snapshot=null,mode='',values={},preview=false,busy=false,last=null;
 const key=()=> 'harrington_npc_operacion_'+(meEmp()?meEmp().id:'');
 const count=n=>Math.max(0,Number(npc.asig[n])||0);
 function location(n){const total=stockMap[n]||0,npcq=count(n);return {total,npc:npcq,almacen:Math.max(0,total-npcq)}}
 async function fresh(){
  const s=await rpc('npc_snapshot',{});if(!s||!s.npc||!s.stock)throw Error('No se pudo leer el NPC');
  applyNpc(s.npc);const m={};Object.keys(s.stock).forEach(n=>m[n]=s.stock[n].q);applyStockMap(m);return s;
 }
 // El modo Arthur no sale de la simulación ya existente.
 async function rpc(name,p){
  if(!SANDBOX)return sbRpc(name,p);
  if(name==='npc_snapshot'){await refreshStock();const stock={};Object.keys(stockMap).forEach(n=>stock[n]={q:stockMap[n],v:String(stockMap[n])});return {npc:JSON.parse(JSON.stringify(npc)),version:JSON.stringify(npc),stock}}
  const prior=loadLog('harrington_npc_sbx_ops').find(x=>x.id===p.p_peticion);if(prior)return Object.assign({},prior,{replayed:true});
  const current=await rpc('npc_snapshot',{});if(p.p_modo!=='avisar'&&p.p_base.version!==current.version)throw Error('NPC_CAMBIADO');
  const cfg=JSON.parse(JSON.stringify(npc)),moves=[],filas=[],records=[];let importe=0;
  for(const x of p.p_items){const a=cfg.asig[x.n]||0,t=stockMap[x.n]||0;let b=a,d=0;
   if(p.p_modo==='entregar'){b=a+x.q;if(b>t)throw Error('ALMACEN_INSUFICIENTE')}
   else if(p.p_modo==='recuperar'||p.p_modo==='consumir'){b=a-x.q;if(b<0)throw Error('NPC_INSUFICIENTE');if(p.p_modo==='consumir')d=-x.q}
   else if(p.p_modo==='inventario'){b=x.q;d=b-a}
   else if(p.p_modo==='revision'){b=x.q;if(b>a)throw Error('NPC_SOBRANTE');d=b-a;importe+=(a-b)*(cfg.precios[x.n]||x.cents)}
   else if(p.p_modo==='precios')cfg.precios[x.n]=x.q;
   cfg.asig[x.n]=b;if(d)moves.push({producto:x.n,delta:d});filas.push({n:x.n,esperado:a,encontrado:b,deltaTotal:d,vendido:p.p_modo==='revision'?a-b:0});
  }
  if(p.p_modo==='avisar')cfg.rev=Object.assign({},cfg.rev,{pending:true});
  if(moves.length)await sbRpc('mover_stock',{p_items:moves});await refreshStock();applyNpc(cfg);cloudPut('npc:estado',cfg);
  const result={id:p.p_peticion,npc:cfg,stock:Object.assign({},stockMap),records,moves,filas,importe,venta:p.p_modo==='revision'&&importe?'NPC-PRUEBA':'',replayed:false};const a=loadLog('harrington_npc_sbx_ops');a.push(result);store.set('harrington_npc_sbx_ops',JSON.stringify(a));return result;
 }
 renderModNpc=function(){
  const L=inputs.map(i=>i.dataset.name).filter(n=>productPrice(n)>0||count(n));
  return '<p class="bk-note">El total del negocio es <b>almacén propio + NPC</b>. Entregar o recuperar productos no cambia ese total. Al vender se usa primero el almacén, luego el NPC y solo después se fabrica.</p><div class="enc-actions"><button type="button" class="primary" data-npc2="revision">REVISAR VENTAS DEL NPC</button><button type="button" data-npc2="inventario">HACER INVENTARIO DEL NPC</button></div><div class="enc-actions"><button type="button" data-npc2="entregar">ENTREGAR AL NPC</button><button type="button" data-npc2="recuperar">RECUPERAR AL ALMACÉN</button><button type="button" data-npc2="consumir">RETIRAR PARA CONSUMO</button><button type="button" data-npc2="precios">PRECIOS DEL NPC</button></div><div class="dir-sec-title">EXISTENCIAS POR UBICACIÓN</div>'+L.map(n=>{const s=location(n);return '<div class="reg-line"><span>'+esc(n)+'<br><small>Almacén: '+s.almacen+' · NPC: '+s.npc+'</small></span><b>Total '+s.total+'</b></div>'}).join('');
 };
 async function open(m){
  if(!meEmp()||busy)return;if(m!=='revision'&&!isJefe(meEmp()))return say('Solo los jefes pueden usar esta opción','err');
  busy=true;try{snapshot=await fresh();mode=m;values={};preview=false;last=null;invView='npc2';closeModal(dirModal);render();openModal(invModal)}catch(e){say('No se pudo abrir el NPC. Comprueba tu conexión y tu cuenta.','err')}finally{busy=false}
 }
 function items(){
  const L=Object.keys(values).filter(n=>String(values[n]).trim()!=='').map(n=>{const raw=String(values[n]).trim(),q=mode==='precios'?parseMoney(raw):/^\d{1,6}$/.test(raw)?Number(raw):NaN;if(!Number.isInteger(q)||q<0||q>999999)throw Error('Cantidad no válida: '+n);return {n,q,cents:npcPrice(n)}});
  if(!L.length)throw Error('Introduce alguna cantidad');
  if(mode==='revision')Object.keys(snapshot.npc.asig).filter(n=>snapshot.npc.asig[n]>0).forEach(n=>{if(!L.some(x=>x.n===n))throw Error('Falta contar lo que queda de '+n)});
  return L;
 }
 function render(){
  document.getElementById('invTitle').textContent=titles[mode]||'NPC';const body=document.getElementById('invBody');
  if(last){body.innerHTML='<div class="enc-note">✓ Operación guardada: '+esc(titles[mode])+'</div>'+(last.venta?'<p>Venta del NPC: '+esc(last.venta)+' · '+money(last.importe)+'</p>':'<p>No se han creado ventas ni ingresos.</p>')+'<button type="button" data-inv="cerrar">CERRAR</button>';return}
  if(localStorage.getItem(key())){body.innerHTML='<p class="bk-note">Hay una operación pendiente de recuperar. No la repitas como una operación nueva.</p><button type="button" data-npcsave="retry">RECUPERAR OPERACIÓN</button>';return}
  if(preview){const L=items();body.innerHTML='<p class="bk-note">'+(mode==='revision'?'Solo se registrarán como ventas las unidades que falten respecto a lo esperado.':'Esta opción no registra ventas ni ingresos.')+'</p>'+L.map(x=>{const a=snapshot.npc.asig[x.n]||0,b=mode==='entregar'?a+x.q:mode==='recuperar'||mode==='consumir'?a-x.q:mode==='precios'?a:x.q;return '<div class="reg-line"><span>'+esc(x.n)+'</span><b>'+(mode==='precios'?money(x.q):'NPC '+a+' → '+b)+'</b></div>'}).join('')+'<div class="enc-actions"><button type="button" data-npcsave="back">VOLVER</button><button type="button" class="primary" data-npcsave="save">CONFIRMAR Y GUARDAR</button></div>';return}
  const L=inputs.map(i=>i.dataset.name).filter(n=>productPrice(n)>0||snapshot.npc.asig[n]);
  const help=mode==='revision'?'Cuenta lo que queda realmente en el NPC. Las ventas manuales y los traslados registrados ya están descontados de lo esperado. La diferencia se registra como venta e ingreso del NPC.':mode==='inventario'?'Introduce las existencias reales del NPC. Las diferencias ajustan su inventario y el total del negocio, sin ventas ni ingresos. Tu almacén propio se conserva. Vacío = sin revisar; 0 = no queda ninguna unidad.':mode==='entregar'?'Introduce las unidades que llevas de tu almacén al NPC. El total del negocio se conserva.':mode==='recuperar'?'Introduce las unidades que recuperas del NPC y guardas en tu almacén. El total del negocio se conserva.':mode==='consumir'?'Introduce las unidades que retiras del NPC para consumirlas. Descuenta existencias sin registrar una venta.':'Introduce los precios por unidad del NPC, en dólares.';
  body.innerHTML='<p class="bk-note">'+help+'</p>'+L.filter(n=>mode!=='revision'||(snapshot.npc.asig[n]||0)>0).map(n=>{const a=snapshot.npc.asig[n]||0,t=(snapshot.stock[n]||{}).q||0;return '<div class="pr-row"><div><b>'+esc(n)+'</b><small>Almacén: '+Math.max(0,t-a)+' · NPC esperado: '+a+' · Total: '+t+'</small></div><input class="min-in" type="text" inputmode="'+(mode==='precios'?'decimal':'numeric')+'" data-npcqty="'+esc(n)+'" placeholder="'+(mode==='precios'?(npcPrice(n)/100).toFixed(2):'Sin revisar')+'" value="'+esc(values[n]||'')+'" aria-label="'+esc(titles[mode]+' · '+n)+'"></div>'}).join('')+'<div class="enc-actions"><button type="button" class="primary" data-npcsave="review">REVISAR CAMBIOS</button></div>';
 }
 async function save(){
  if(busy)return;busy=true;
  try{
   let pending=JSON.parse(localStorage.getItem(key())||'null');
   if(!pending){pending={p_peticion:crypto.randomUUID(),p_modo:mode,p_items:items(),p_base:snapshot};localStorage.setItem(key(),JSON.stringify(pending))}
   let result;try{result=await rpc('npc_operar',pending)}catch(e){
    const t=String(e.message||'');if(/NPC_CAMBIADO|STOCK_CAMBIADO|NPC_INSUFICIENTE|ALMACEN_INSUFICIENTE|NPC_SOBRANTE|CANTIDAD_INVALIDA|SOLO_JEFES|RECUENTO_INCOMPLETO|PRECIO_NPC_INVALIDO|SIN_CUENTA|NPC_DESCUADRADO/.test(t)){
     localStorage.removeItem(key());snapshot=await fresh();values={};preview=false;render();say('No se ha guardado ningún cambio. Revisa y vuelve a contar: '+t,'err');
    }else{render();say('Respuesta pendiente. Usa RECUPERAR OPERACIÓN para evitar duplicados.','err')}return;
   }
   if(!result||!result.id||!result.npc||!result.stock)throw Error('Respuesta incompleta');
   (result.records||[]).forEach(r=>applyRecord(r.clave,r.valor));applyNpc(result.npc);applyStockMap(result.stock);localStorage.removeItem(key());mode=pending.p_modo;last=result;
   try{invChanged(result.moves||[],titles[mode]);calc(false)}catch(e){}
   if(!result.replayed)try{const txt=[titles[mode],meEmp().name,result.filas.map(x=>x.n+': '+x.esperado+' → '+x.encontrado).join('\n'),result.venta?'Venta '+result.venta+' · '+money(result.importe):'Sin ventas ni ingresos'].join('\n');discordSend(result.venta?'ventas':'stock',txt)}catch(e){}
   render();say('Operación del NPC guardada');
  }catch(e){say(e.message||'No se pudo guardar la operación','err')}finally{busy=false}
 }
 dirModal.addEventListener('click',e=>{const b=e.target.closest('[data-npc2]');if(b)open(b.dataset.npc2)});
 invModal.addEventListener('input',e=>{if(invView==='npc2'&&e.target.dataset.npcqty!==undefined)values[e.target.dataset.npcqty]=e.target.value});
 invModal.addEventListener('click',e=>{const b=e.target.closest('[data-npcsave]');if(!b||invView!=='npc2'||busy)return;try{if(b.dataset.npcsave==='review'){items();preview=true;render()}else if(b.dataset.npcsave==='back'){preview=false;render()}else save()}catch(x){say(x.message,'err')}});
 const oldRender=renderInv;renderInv=function(){if(invView==='npc2')return render();return oldRender.apply(this,arguments)};
 openNpcRev=()=>open('revision');
 // No quedan escrituras ciegas de asig: la revisión automática solo modifica su aviso en el servidor.
 npcClamp=function(){};
 npcClampSafe=async function(){try{await fresh()}catch(e){}};
 npcSave=function(){if(!npc.rev||!npc.rev.pending)return;const p={p_peticion:crypto.randomUUID(),p_modo:'avisar',p_items:[],p_base:{}};rpc('npc_operar',p).then(r=>{if(r.npc)applyNpc(r.npc)}).catch(()=>{})};
 npcPaint=function(){const el=document.getElementById('npcPlate');if(el)el.hidden=true;try{bellPaint()}catch(e){}};npcPaint();
 const oldCart=cartHTML;cartHTML=function(L){let h=oldCart.apply(this,arguments);if(appMode==='venta'&&customer.op!=='encargo'&&!loadedEnc&&!sale){const from=L.map(x=>{const s=location(x.name),q=Math.min(s.npc,Math.max(0,x.qty-s.almacen));return q?q+' × '+x.name:''}).filter(Boolean);if(from.length)h+='<p class="bk-note"><b>Se tomarán del NPC:</b> '+esc(from.join(', '))+'. No se fabricarán estas unidades.</p>'}return h};
 function sandboxConsumption(before){
  if(!SANDBOX)return;const cfg=JSON.parse(JSON.stringify(npc));let changed=false;
  Object.keys(cfg.asig).forEach(n=>{const a=cfg.asig[n]||0,d=(before[n]||0)-(stockMap[n]||0),taken=Math.min(a,Math.max(0,d-Math.max(0,(before[n]||0)-a)));if(taken){cfg.asig[n]=a-taken;changed=true}});
  if(changed){applyNpc(cfg);cloudPut('npc:estado',cfg)}
 }
 const oldMove=moverStock;moverStock=async function(){const before=Object.assign({},stockMap),r=await oldMove.apply(this,arguments);sandboxConsumption(before);return r};
 const oldSale=autoVentaConfirmar;autoVentaConfirmar=async function(){const before=Object.assign({},stockMap),s=await oldSale.apply(this,arguments);if(s){sandboxConsumption(before);try{await fresh()}catch(e){}}return s};
 const oldStockText=stockText;stockText=function(){return oldStockText.apply(this,arguments)+'\n\nUBICACIONES (incluidas en el total)\n'+Object.keys(npc.asig).filter(n=>count(n)>0).map(n=>{const s=location(n);return n+' · almacén '+s.almacen+' · NPC '+s.npc+' · total '+s.total}).join('\n')};
 const oldRecount=ajustarRecuento;ajustarRecuento=function(){if(npcTotal()>0)return say('Usa HACER INVENTARIO para contar tu almacén sin incluir el NPC.','err');return oldRecount.apply(this,arguments)};
})();
