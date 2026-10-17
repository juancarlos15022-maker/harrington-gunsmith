const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
function mount(){
 const dom=new JSDOM(fs.readFileSync(__dirname+'/index.html','utf8'),{url:'https://prueba.invalid/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,requests=[];
 w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.fetch=async(u,init)=>{requests.push({u,init});throw Error('RED BLOQUEADA EN PRUEBA')};
 w.WebSocket=undefined;w.setTimeout=()=>0;w.setInterval=()=>0;w.requestAnimationFrame=()=>0;
 w.Response=Response;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
 w.localStorage.setItem('harrington_empleados_v1',JSON.stringify([{id:'e1',name:'Empleado',puesto:'Armero'}]));
 w.sessionStorage.setItem('harrington_me_v1',JSON.stringify({id:'e1',name:'Empleado'}));
 w.localStorage.setItem('harrington_stock_v1',JSON.stringify({'Cattleman Revolver':0,'Doble Action Revolver':0,'mat:Tornillo':10,'mat:Pieza de arma':2}));
 w.localStorage.setItem('harrington_recetas_v1',JSON.stringify({'Cattleman Revolver':[{m:'Tornillo',q:5},{m:'Pieza de arma',q:1}],'Doble Action Revolver':[{m:'Tornillo',q:8},{m:'Pieza de arma',q:1}]}));
 w.eval(fs.readFileSync(__dirname+'/auto-fabricacion.js','utf8'));
 w.eval(fs.readFileSync(__dirname+'/app.js','utf8')+'\nwindow.__testMode=(m,op)=>{appMode=m;if(op)customer.op=op};');
 return {dom,w,requests};
}
test('DOM: aplicación inicia; permite seleccionar producto fabricable y muestra aviso',()=>{
 const {dom,w}=mount();try{
 assert.equal(w.limitFor('Cattleman Revolver'),2);
 const i=w.document.querySelector('[data-name="Cattleman Revolver"]');assert.ok(i);i.value='1';w.calc(false);
 assert.equal(i.value,'1');assert.equal(i.disabled,false);
 assert.match(w.document.querySelector('#cart').textContent,/Se fabricará al confirmar la venta/);
 assert.equal(w.limitFor('Sin receta'),0);
 }finally{dom.window.close()}
});
test('DOM: confirmación conjunta rechaza materiales compartidos insuficientes',()=>{
 const {dom,w}=mount();try{assert.equal(w.stockOk([{name:'Cattleman Revolver',qty:1},{name:'Doble Action Revolver',qty:1}]),false)}finally{dom.window.close()}
});
test('DOM: presupuesto y encargo no consumen ni aplican fabricación automática',()=>{
 const {dom,w}=mount();try{
 w.__testMode('presupuesto');assert.equal(w.autoVentaOn(),false);assert.equal(w.limitFor('Cattleman Revolver'),Infinity);
 w.__testMode('venta','encargo');assert.equal(w.autoVentaOn(),false);assert.equal(w.limitFor('Cattleman Revolver'),Infinity);
 }finally{dom.window.close()}
});
test('DOM: respuesta perdida conserva petición; reintento recupera venta sin segunda fabricación',async()=>{
 const {dom,w}=mount();try{
 w.eval(`cloudPullRecords=async()=>{};refreshStock=async()=>{};offlineBlock=()=>false;customerOk=()=>true;rememberClient=()=>{};invChanged=()=>{};fbAuto=()=>{};`);
 w.document.querySelector('[data-name="Cattleman Revolver"]').value='1';
 const calls=[];
 w.sbRpc=async(name,p)=>{calls.push({name,p});if(calls.length===1)throw Error('Respuesta perdida');return {sale:{...p.p_venta,id:'HG-PRUEBA',stockApplied:{'Cattleman Revolver':1}},stock:{'mat:Tornillo':5},records:[],made:{'Cattleman Revolver':1},replayed:true}};
 assert.equal(await w.autoVentaConfirmar(),null);
 const pending=w.localStorage.getItem('harrington_autoventa_pendiente_v1');assert.ok(pending);
 const s=await w.autoVentaConfirmar();assert.equal(s.id,'HG-PRUEBA');assert.equal(calls[0].p.p_peticion,calls[1].p.p_peticion);assert.equal(w.localStorage.getItem('harrington_autoventa_pendiente_v1'),null);
 }finally{dom.window.close()}
});
test('DOM: cambios de precio durante la sincronización requieren revisar antes de cobrar',async()=>{
 const {dom,w}=mount();try{
 w.eval(`offlineBlock=()=>false;customerOk=()=>true;refreshStock=async()=>{};`);
 const input=w.document.querySelector('[data-name="Cattleman Revolver"]');input.value='1';
 w.cloudPullRecords=async()=>{input.value='2'};let calls=0;w.sbRpc=async()=>{calls++;throw Error('No debe llamar')};
 assert.equal(await w.autoVentaConfirmar(),null);assert.equal(calls,0);assert.equal(w.localStorage.getItem('harrington_autoventa_pendiente_v1'),null);
 }finally{dom.window.close()}
});

test('todos los productos conservan controles + y − operativos y accesos rápidos de munición',()=>{
 const {dom,w}=mount();try{
 w.__testMode('presupuesto');w.calc(false);
 const rows=[...w.document.querySelectorAll('#products .product')];assert.equal(rows.length,43);
 for(const row of rows){const name=row.querySelector('.qty input').dataset.name,plus=row.querySelector('.qty > .plus'),minus=row.querySelector('.qty > .minus'),i=row.querySelector('.qty input');assert.ok(plus,name);assert.ok(minus,name);if(!plus.disabled){i.value='0';plus.click();assert.equal(i.value,Number(i.dataset.price)>0?'1':'0',name+' suma respeta precio');minus.click();assert.equal(i.value,'0',name+' resta');}}
 for(const row of rows.filter(x=>x.dataset.cat==='municion'))assert.equal(row.querySelectorAll('.quick button').length,3);
 assert.equal(w.document.querySelector('#finishEnc').hidden,true);
 }finally{dom.window.close();}
});
