const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');
const {plan}=require('./auto-fabricacion');
const sql=fs.readFileSync(__dirname+'/venta-fabricacion.sql','utf8');
const recipes={Cattleman:[{m:'Tornillos',q:5},{m:'Pieza de armas',q:1}],Doble:[{m:'Tornillo',q:8},{m:'Pieza de arma',q:1}],Municion:[{m:'Pólvora',p:true,q:1},{m:'Hierro',q:1}],Arco:[{m:'Fibra',q:3}],Mejorado:[{m:'Arco',p:true,q:1}]};
const key=r=>r.p?r.m:'mat:'+({'Tornillos':'Tornillo','Pieza de armas':'Pieza de arma'}[r.m]||r.m);
function sale(items,emp='e1'){return {op:'venta',fromEncargo:'',empId:emp,employee:'Empleado',items:items.map(([name,qty])=>({name,qty,cents:100})),sig:JSON.stringify(items),totalCents:100,dueCents:100,client:'PRUEBA AISLADA',kind:''}}
async function setup(stock){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table datos(clave text primary key,valor jsonb,actualizado timestamptz);
 create table stock(producto text primary key,cantidad int not null check(cantidad>=0));
 create table contador(valor int); insert into contador values(0);
 create function hg_permitido() returns boolean language sql as 'select true';
 create function hg_claims() returns jsonb language sql as 'select null::jsonb';
 create table reserva(producto text,cantidad int);
 create function hg_reservadas(p text,e text) returns int language sql as 'select coalesce(sum(cantidad),0)::int from reserva where producto=p';
 create function siguiente_numero() returns bigint language plpgsql as $$declare n bigint;begin update contador set valor=valor+1 returning valor into n;return n;end$$;
 create function mover_stock(p_items jsonb) returns jsonb language plpgsql as $$declare it jsonb;begin for it in select * from jsonb_array_elements(p_items) loop insert into stock values(it->>'producto',(it->>'delta')::int) on conflict(producto) do update set cantidad=stock.cantidad+(it->>'delta')::int;end loop;return (select jsonb_object_agg(producto,cantidad) from stock);end$$;`);
 // Use UPDATE first, like production: negative deltas must not hit INSERT's CHECK before conflict handling.
 await db.exec(`create or replace function mover_stock(p_items jsonb) returns jsonb language plpgsql as $$declare it jsonb;begin for it in select * from jsonb_array_elements(p_items) loop update stock set cantidad=cantidad+(it->>'delta')::int where producto=it->>'producto';if not found then insert into stock values(it->>'producto',(it->>'delta')::int);end if;end loop;return (select jsonb_object_agg(producto,cantidad) from stock);end$$;`);
 await db.query('insert into datos values($1,$2,now()),($3,$4,now())',['recetas',recipes,'empleados',[{id:'e1',name:'Trabajador'},{id:'e2',name:'Jefe'}]]);
 for(const [n,q] of Object.entries(stock))await db.query('insert into stock values($1,$2)',[n,q]);
 await db.exec(sql);return db;
}
async function run(db,items,id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',emp){return (await db.query('select vender_fabricando($1,$2) as r',[id,sale(items,emp)])).rows[0].r}
async function state(db){return (await db.query("select (select jsonb_object_agg(producto,cantidad) from stock) stock,(select valor from contador) contador,(select count(*)::int from datos) registros")).rows[0]}
test('plan: materiales compartidos, reservas y receta ausente',()=>{
 const s={'mat:Tornillo':10,'mat:Pieza de arma':3};
 assert.equal(plan([{name:'Cattleman',qty:1},{name:'Doble',qty:1}],s,recipes,key,{}).ok,false);
 assert.equal(plan([{name:'Cattleman',qty:1}],s,recipes,key,{}).ok,true);
 assert.equal(plan([{name:'X',qty:1}],{},recipes,key,{}).ok,false);
 assert.equal(plan([{name:'Arco',qty:1}],{Arco:1},recipes,key,{Arco:1}).ok,false);
});
test('SQL: fabrica, consume, vende y registra todo; reintento idéntico no duplica',async()=>{
 const db=await setup({'mat:Tornillo':10,'mat:Pieza de arma':2,Cattleman:0});try{
 const a=await run(db,[['Cattleman',1]]);assert.equal(a.stock.Cattleman,0);assert.equal(a.stock['mat:Tornillo'],5);assert.equal(a.made.Cattleman,1);
 assert.equal(a.records.filter(r=>r.clave.startsWith('fablote:')).length,1);
 assert.equal(a.records.filter(r=>r.clave.startsWith('venta:')).length,1);
 const before=await state(db);const b=await run(db,[['Cattleman',1]]);assert.equal(b.replayed,true);assert.equal(b.sale.id,a.sale.id);assert.deepEqual(await state(db),before);
 await assert.rejects(run(db,[['Cattleman',2]]),/PETICION_REUTILIZADA/);assert.deepEqual(await state(db),before);
 }finally{await db.close()}
});
test('SQL: usa stock antes de fabricar y fabrica solo el déficit; jefe y trabajador',async()=>{
 const db=await setup({'mat:Tornillo':10,'mat:Pieza de arma':2,Cattleman:1});try{
 const a=await run(db,[['Cattleman',2]],undefined,'e2');assert.equal(a.made.Cattleman,1);assert.equal(a.sale.employee,'Jefe');assert.equal(a.stock.Cattleman,0);
 }finally{await db.close()}
});
test('SQL: venta sin fabricación no consume materiales',async()=>{
 const db=await setup({Cattleman:1});try{const a=await run(db,[['Cattleman',1]]);assert.deepEqual(a.made,{});assert.deepEqual(a.used,{});assert.equal(a.stock.Cattleman,0)}finally{await db.close()}
});
test('SQL: materiales compartidos insuficientes revierte stock, contador e historial',async()=>{
 const db=await setup({'mat:Tornillo':10,'mat:Pieza de arma':2});try{const before=await state(db);await assert.rejects(run(db,[['Cattleman',1],['Doble',1]]),/FALTAN_MATERIALES/);assert.deepEqual(await state(db),before)}finally{await db.close()}
});
test('SQL: reserva de producto se conserva fabricando una unidad adicional',async()=>{
 const db=await setup({Cattleman:1,'mat:Tornillo':5,'mat:Pieza de arma':1});try{await db.exec("insert into reserva values('Cattleman',1)");const a=await run(db,[['Cattleman',1]]);assert.equal(a.stock.Cattleman,1);assert.equal(a.made.Cattleman,1)}finally{await db.close()}
});
test('SQL: ingrediente vendido y consumido se cuenta una sola vez; reservas de ingrediente',async()=>{
 const db=await setup({Arco:1,'mat:Fibra':0});try{const before=await state(db);await assert.rejects(run(db,[['Arco',1],['Mejorado',1]]),/FALTAN_MATERIALES/);assert.deepEqual(await state(db),before);await db.exec("insert into reserva values('Arco',1)");await assert.rejects(run(db,[['Mejorado',1]]),/FALTAN_MATERIALES/)}finally{await db.close()}
});
test('SQL: pólvora usa clave de producto, no duplica material; alias canónicos',async()=>{
 const db=await setup({'Pólvora':2,'mat:Hierro':2});try{const a=await run(db,[['Municion',2]]);assert.equal(a.stock['Pólvora'],0);assert.equal(a.stock['mat:Pólvora'],undefined);for(const n of ['Tornillos','Pieza de armas','Cañones de revolver','Culatas de revólver']){const a=(await db.query('select hg_venta_material($1,false) k',[n])).rows[0].k;assert.ok(['mat:Tornillo','mat:Pieza de arma','mat:Cañón de revólver','mat:Culata de revólver'].includes(a))}}finally{await db.close()}
});
test('SQL: no permite venta sin receta ni cantidades negativas; no sobrevende al repetirse con otra petición',async()=>{
 const db=await setup({Cattleman:1});try{
 await assert.rejects(run(db,[['X',1]]),/FALTAN_MATERIALES/);
 await assert.rejects(run(db,[['Cattleman',-1]]),/CANTIDAD_INVALIDA/);
 await run(db,[['Cattleman',1]]);const before=await state(db);
 await assert.rejects(run(db,[['Cattleman',1]],'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),/FALTAN_MATERIALES/);assert.deepEqual(await state(db),before);
 }finally{await db.close()}
});
test('SQL: autorización y empleado se verifican antes de escribir',async()=>{
 const db=await setup({Cattleman:1});try{const before=await state(db);await assert.rejects(run(db,[['Cattleman',1]],undefined,'desconocido'),/EMPLEADO_INVALIDO/);await db.exec("create or replace function hg_permitido() returns boolean language sql as 'select false'");await assert.rejects(run(db,[['Cattleman',1]]),/SIN_CUENTA/);assert.deepEqual(await state(db),before)}finally{await db.close()}
});
test('SQL: fallo al guardar la venta revierte fabricación, movimientos y contador',async()=>{
 const db=await setup({'mat:Tornillo':10,'mat:Pieza de arma':2});try{
 await db.exec(`create function fallo_prueba() returns trigger language plpgsql as $$begin if new.clave like 'venta:%' then raise exception 'FALLO_SIMULADO';end if;return new;end$$;create trigger fallo before insert on datos for each row execute function fallo_prueba();`);
 const before=await state(db);await assert.rejects(run(db,[['Cattleman',1]]),/FALLO_SIMULADO/);assert.deepEqual(await state(db),before);
 }finally{await db.close()}
});
test('SQL: SECURITY INVOKER respeta RLS para trabajador autenticado',async()=>{
 const db=await setup({'mat:Tornillo':5,'mat:Pieza de arma':1});try{
 await db.exec(`grant usage on schema public to authenticated;grant select,insert,update on datos,stock,contador to authenticated;grant select on reserva to authenticated;
 alter table datos enable row level security;create policy permitido on datos for all to authenticated using(hg_permitido()) with check(hg_permitido());
 alter table stock enable row level security;create policy permitido on stock for all to authenticated using(hg_permitido()) with check(hg_permitido());set role authenticated;`);
 const a=await run(db,[['Cattleman',1]]);assert.equal(a.stock['mat:Tornillo'],0);
 await db.exec('reset role');const f=(await db.query("select prosecdef from pg_proc where proname='vender_fabricando'")).rows[0];assert.equal(f.prosecdef,false);
 }finally{await db.close()}
});
