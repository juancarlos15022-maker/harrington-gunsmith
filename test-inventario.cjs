const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {JSDOM}=require('jsdom');
const sql=fs.readFileSync(__dirname+'/inventario-jefes.sql','utf8');
async function setup(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;
 create table datos(clave text primary key,valor jsonb,actualizado timestamptz);
 create table stock(producto text primary key,cantidad int not null check(cantidad>=0));
 create function hg_claims() returns jsonb language sql as $$select jsonb_build_object('app_metadata',jsonb_build_object('emp_id',current_setting('test.emp',true)))$$;
 create function hg_permitido() returns boolean language sql as 'select true';
 create function hg_reservadas(n text,e text) returns integer language sql as $$select case when n='Cattleman' then 2 else 0 end$$;
 insert into datos values('empleados','[{"id":"j","name":"Jefe","puesto":"Jefe"},{"id":"e","name":"Empleado","puesto":"Armero"}]',now());
 insert into stock values('mat:Tornillo',10),('Cattleman',3),('Pólvora',5);
 select set_config('test.emp','j',false);`);await db.exec(sql);return db;
}
async function base(db){return (await db.query('select inventario_preparar() r')).rows[0].r}
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function item(b,k,fis){return {k,teo:b[k]?.q||0,version:b[k]?.v||null,fis}}
async function save(db,items,req=id){return (await db.query('select inventario_guardar($1,$2) r',[req,items])).rows[0].r}
async function state(db){return (await db.query("select (select jsonb_object_agg(producto,cantidad) from stock) stock,(select count(*)::int from datos) registros")).rows[0]}
test('inventario SQL: solo jefe; preparar es lectura y conserva versiones',async()=>{
 const db=await setup();try{const s=await state(db);const b=await base(db);assert.equal(b['mat:Tornillo'].q,10);assert.ok(b.Cattleman.v);assert.deepEqual(await state(db),s);await db.exec("select set_config('test.emp','e',false)");await assert.rejects(base(db),/SOLO_JEFES/);await assert.rejects(save(db,[item(b,'Cattleman',1)]),/SOLO_JEFES/);assert.deepEqual(await state(db),s)}finally{await db.close()}
});
test('inventario SQL: cero explícito, vacíos omitidos, trazabilidad y ninguna venta ficticia',async()=>{
 const db=await setup();try{const b=await base(db);const r=await save(db,[item(b,'mat:Tornillo',0),item(b,'Cattleman',4)]);assert.equal(r.stock['mat:Tornillo'],0);assert.equal(r.stock.Cattleman,4);assert.equal(r.stock['Pólvora'],5);assert.equal(r.changed,2);assert.equal(r.records.filter(x=>x.clave.startsWith('mov:')).length,2);assert.ok(r.records.find(x=>x.clave.startsWith('recu:')).valor.ajustado);assert.equal(r.records.some(x=>/^(venta|gasto|pedido):/.test(x.clave)),false)}finally{await db.close()}
});
test('inventario SQL: detecta stock cambiado y revierte todos los ajustes',async()=>{
 const db=await setup();try{const b=await base(db);await db.exec("update stock set cantidad=9 where producto='mat:Tornillo'");const s=await state(db);await assert.rejects(save(db,[item(b,'Cattleman',0),item(b,'mat:Tornillo',8)]),/STOCK_CAMBIADO/);assert.deepEqual(await state(db),s)}finally{await db.close()}
});
test('inventario SQL: detecta movimiento aunque la cantidad vuelva a ser la misma',async()=>{
 const db=await setup();try{const b=await base(db);await db.exec("update stock set cantidad=9 where producto='mat:Tornillo'");await db.exec("update stock set cantidad=10 where producto='mat:Tornillo'");await assert.rejects(save(db,[item(b,'mat:Tornillo',8)]),/STOCK_CAMBIADO/)}finally{await db.close()}
});
test('inventario SQL: reintento idempotente no vuelve a ajustar ni duplica registros',async()=>{
 const db=await setup();try{const b=await base(db),items=[item(b,'mat:Tornillo',8)];const r=await save(db,items);const s=await state(db);const again=await save(db,items);assert.equal(again.replayed,true);assert.equal(again.id,r.id);assert.deepEqual(await state(db),s);await db.exec("update stock set cantidad=7 where producto='mat:Tornillo'");assert.equal((await save(db,items)).stock['mat:Tornillo'],7);await assert.rejects(save(db,[item(b,'mat:Tornillo',9)]),/PETICION_REUTILIZADA/)}finally{await db.close()}
});
test('inventario SQL: cantidades inválidas, vacíos y duplicados se rechazan íntegramente',async()=>{
 const db=await setup();try{const b=await base(db),s=await state(db);for(const v of [-1,'',1.5,'abc'])await assert.rejects(save(db,[item(b,'mat:Tornillo',v)]),/CANTIDAD_INVALIDA/);await assert.rejects(save(db,[]),/RECUENTO_VACIO/);await assert.rejects(save(db,[item(b,'mat:Tornillo',1),item(b,'mat:Tornillo',2)]),/ARTICULO_DUPLICADO/);assert.deepEqual(await state(db),s)}finally{await db.close()}
});
test('inventario SQL: fallo del registro revierte stock; no altera contabilidad',async()=>{
 const db=await setup();try{const b=await base(db);await db.exec(`create function fallo() returns trigger language plpgsql as $$begin if new.clave like 'recu:%' then raise exception 'FALLO_AISLADO';end if;return new;end$$;create trigger fallo before insert on datos for each row execute function fallo();`);const s=await state(db);await assert.rejects(save(db,[item(b,'mat:Tornillo',1)]),/FALLO_AISLADO/);assert.deepEqual(await state(db),s)}finally{await db.close()}
});
test('inventario SQL: impide descontar el NPC por contar solo el almacén en una página antigua',async()=>{
 const db=await setup();try{await db.query("insert into datos values('npc:estado',$1,now())",[{asig:{Cattleman:3}}]);const b=await base(db);await assert.rejects(save(db,[item(b,'Cattleman',1)]),/NPC_UBICACION_REQUERIDA/);assert.equal((await state(db)).stock.Cattleman,3)}finally{await db.close()}
});
test('inventario SQL: RLS, SECURITY INVOKER y denegación a anónimos',async()=>{
 const db=await setup();try{await db.exec(`grant usage on schema public to authenticated;grant select,insert,update on datos,stock to authenticated;alter table stock enable row level security;create policy acceso on stock for all to authenticated using(hg_permitido()) with check(hg_permitido());alter table datos enable row level security;create policy acceso on datos for all to authenticated using(hg_permitido()) with check(hg_permitido());set role authenticated;`);const b=await base(db);await save(db,[item(b,'mat:Tornillo',8)]);await db.exec('reset role');const f=await db.query("select prosecdef,has_function_privilege('anon',oid,'execute') anon from pg_proc where proname in ('inventario_guardar','inventario_preparar')");assert.ok(f.rows.every(x=>!x.prosecdef&&!x.anon))}finally{await db.close()}
});
function mount(chief,sandbox=false){
 const dom=new JSDOM(fs.readFileSync(__dirname+'/index.html','utf8'),{url:'https://prueba.invalid/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 w.matchMedia=()=>({matches:true,addEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.setTimeout=()=>0;w.setInterval=()=>0;w.requestAnimationFrame=()=>0;w.fetch=async()=>{throw Error('RED BLOQUEADA')};w.WebSocket=undefined;w.TextEncoder=TextEncoder;
 w.localStorage.setItem('harrington_empleados_v1',JSON.stringify([{id:'emuzvkc99z8q',name:'Prueba',puesto:chief?'Jefe':'Armero'}]));w.sessionStorage.setItem('harrington_me_v1',JSON.stringify({id:'emuzvkc99z8q'}));
 if(sandbox){w.sessionStorage.setItem('harrington_sandbox','1');w.Response=Response;w.fetch=async u=>new Response(JSON.stringify(String(u).includes('/stock?')?[{producto:'mat:Tornillo',cantidad:10}]:String(u).includes('/contador?')?[{valor:0}]:[{clave:'empleados',valor:[{id:'emuzvkc99z8q',name:'Prueba',puesto:'Jefe'}]}]),{status:200,headers:{'Content-Type':'application/json'}})}
 w.eval(fs.readFileSync(__dirname+'/auto-fabricacion.js','utf8'));w.eval(fs.readFileSync(__dirname+'/app.js','utf8')+'\n'+fs.readFileSync(__dirname+'/inventario-jefes.js','utf8'));w.setBoss(chief);return {dom,w};
}
test('inventario DOM: botón solo visible para jefe',()=>{for(const chief of [false,true]){const {dom,w}=mount(chief);try{assert.equal(w.document.getElementById('hacerInventarioBtn').hidden,!chief)}finally{dom.window.close()}}});
test('inventario DOM: lista material y producto, omite vacíos y revisa antes de guardar',async()=>{
 const {dom,w}=mount(true);try{let calls=[];w.sbRpc=async(n,p)=>{calls.push({n,p});return {'mat:Tornillo':{q:10,v:'1'},'Cattleman Revolver':{q:1,v:'2'},'Pólvora':{q:5,v:'3'}}};
 await w.document.getElementById('hacerInventarioBtn').onclick();const input=w.document.querySelector('[data-ijq="mat:Tornillo"]');assert.ok(input);assert.ok(w.document.querySelector('[data-ijq="Pólvora"]'));input.value='0';input.dispatchEvent(new w.Event('input',{bubbles:true}));w.document.querySelector('[data-ij="review"]').click();assert.match(w.document.getElementById('invBody').textContent,/Registrado 10 → contado 0/);assert.ok(w.document.querySelector('[data-ij="save"]'));assert.equal(calls.length,1);
 w.sbRpc=async(n,p)=>{calls.push({n,p});return {id:'ij-prueba',items:[{k:'mat:Tornillo',fis:0}],changed:1,stock:{'mat:Tornillo':0},records:[],moves:[],replayed:true}};
 w.document.querySelector('[data-ij="save"]').click();await new Promise(r=>setImmediate(r));assert.equal(calls[1].p.p_items.length,1);assert.equal(calls[1].p.p_items[0].fis,0);assert.match(w.document.getElementById('invBody').textContent,/Inventario guardado/);
 }finally{dom.window.close()}
});
test('inventario DOM: respuesta perdida conserva y recupera la misma petición',async()=>{
 const {dom,w}=mount(true);try{
 let requests=[];w.sbRpc=async()=>({'mat:Tornillo':{q:10,v:'1'}});await w.document.getElementById('hacerInventarioBtn').onclick();
 const input=w.document.querySelector('[data-ijq="mat:Tornillo"]');input.value='8';input.dispatchEvent(new w.Event('input',{bubbles:true}));w.document.querySelector('[data-ij="review"]').click();
 w.sbRpc=async(n,p)=>{requests.push(p);throw Error('RESPUESTA_PERDIDA')};w.document.querySelector('[data-ij="save"]').click();await new Promise(r=>setImmediate(r));assert.ok(w.document.querySelector('[data-ij="retry"]'));
 w.sbRpc=async(n,p)=>{requests.push(p);return {id:'ij-recuperado',items:[{k:'mat:Tornillo',fis:8}],changed:1,stock:{'mat:Tornillo':8},records:[],moves:[],replayed:true}};
 w.document.querySelector('[data-ij="retry"]').click();await new Promise(r=>setImmediate(r));assert.equal(requests[0].p_peticion,requests[1].p_peticion);assert.match(w.document.getElementById('invBody').textContent,/Inventario guardado/);
 }finally{dom.window.close()}
});
test('inventario DOM: conflicto conserva borrador y obliga a recontar artículos cambiados',async()=>{
 const {dom,w}=mount(true);try{
 w.sbRpc=async()=>({'mat:Tornillo':{q:10,v:'1'}});await w.document.getElementById('hacerInventarioBtn').onclick();
 const input=w.document.querySelector('[data-ijq="mat:Tornillo"]');input.value='8';input.dispatchEvent(new w.Event('input',{bubbles:true}));w.document.querySelector('[data-ij="review"]').click();
 w.sbRpc=async()=>{throw Error(JSON.stringify({message:'STOCK_CAMBIADO',details:'["mat:Tornillo"]'}))};w.document.querySelector('[data-ij="save"]').click();await new Promise(r=>setImmediate(r));assert.ok(w.document.querySelector('[data-ij="refresh"]'));assert.equal(w.document.querySelector('[data-ijq="mat:Tornillo"]').value,'8');
 w.sbRpc=async()=>({'mat:Tornillo':{q:9,v:'2'}});w.document.querySelector('[data-ij="refresh"]').click();await new Promise(r=>setImmediate(r));assert.equal(w.document.querySelector('[data-ijq="mat:Tornillo"]').value,'');assert.match(w.document.getElementById('invBody').textContent,/Registrado: 9/);
 }finally{dom.window.close()}
});
test('inventario sandbox: simula ajustes y reintentos sin acceso de escritura a la nube',async()=>{
 const {dom,w}=mount(true,true);try{
 const b=await w.sbRpc('inventario_preparar',{});assert.equal(b['mat:Tornillo'].q,10);
 const p={p_peticion:id,p_items:[{k:'mat:Tornillo',teo:10,version:b['mat:Tornillo'].v,fis:8}]};
 const r=await w.sbRpc('inventario_guardar',p);assert.equal(r.stock['mat:Tornillo'],8);assert.equal((await w.sbRpc('inventario_guardar',p)).replayed,true);
 await assert.rejects(w.sbRpc('inventario_guardar',{...p,p_peticion:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}),/STOCK_CAMBIADO/);
 }finally{dom.window.close()}
});
