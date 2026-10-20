const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(__dirname+'/reposicion-herreria.sql','utf8');
async function setup(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create table datos(clave text primary key,valor jsonb,actualizado timestamptz default now());create table stock(producto text primary key,cantidad int default 0,minimo int default 0);create table hg_discord_bindings(emp_id text primary key,discord_id text);create function hg_servidor() returns boolean language sql as $$select true$$;`);await db.exec(sql);
 const mins={'mat:Cañon de rifle':10,'mat:Pieza de arma':60,'mat:Tornillo':400};
 const cfg={enabled:true,proveedorId:'herreria',ownerEmp:'owner',recipientId:'123456',minimos:mins};
 const supplier=[{id:'herreria',name:'Herrería de Saint Denis',tel:'SD3214',tipo:'Herrería',prods:[{name:'Cañón de rifle',price:720},{name:'Pieza de arma',price:252},{name:'Tornillos',price:23}]}];
 await db.query('insert into datos(clave,valor) values ($1,$2),($3,$4),($5,$6)',['cfg:reposicion-herreria',JSON.stringify(cfg),'proveedores',JSON.stringify(supplier),'stockmin',JSON.stringify(mins)]);await db.exec("insert into hg_discord_bindings values('owner','123456');insert into stock values('mat:Cañon de rifle',9,10),('mat:Pieza de arma',60,60),('mat:Tornillo',390,400)");return db;
}
test('reposición: cantidades exactas hasta mínimo, pedido impagado y sin recibir; segunda revisión no duplica',async()=>{
 const db=await setup();try{const p=(await db.query('select hg_reponer_herreria() as r')).rows[0].r.pedido;assert.deepEqual(p.items,[{material:'Cañon de rifle',qty:1,price:720},{material:'Tornillo',qty:10,price:23}]);assert.equal(p.totalCents,950);assert.equal(p.paid,false);assert.equal(p.received,false);assert.equal(p.completedAt,0);assert.equal((await db.query('select hg_reponer_herreria() as r')).rows[0].r.created,false);assert.equal((await db.query('select count(*)::int as n from hg_reposicion_avisos')).rows[0].n,1);assert.equal((await db.query('select cantidad from stock where producto=$1',['mat:Tornillo'])).rows[0].cantidad,390);}finally{await db.close();}
});
test('recepción parcial, pedidos pagados en camino y variantes con tilde descuentan lo pendiente',async()=>{
 const db=await setup();try{await db.query('insert into datos(clave,valor) values($1,$2)',['pedido:manual',JSON.stringify({paid:true,received:false,items:[{material:'Cañón de rifle',qty:3,rq:1},{material:'Tornillos',qty:10,rq:5}]})]);const p=(await db.query('select hg_reponer_herreria() as r')).rows[0].r.pedido;assert.deepEqual(p.items,[{material:'Tornillo',qty:5,price:23}]);}finally{await db.close();}
});
test('stock en mínimo no genera pedido; los cancelados no cuentan y falta de precio revierte todo',async()=>{
 const db=await setup();try{await db.exec('update stock set cantidad=minimo');assert.equal((await db.query('select hg_reponer_herreria() as r')).rows[0].r.created,false);await db.exec("update stock set cantidad=8 where producto='mat:Cañon de rifle'");await db.query('insert into datos(clave,valor) values($1,$2)',['pedido:cancelado',JSON.stringify({cancelled:true,items:[{material:'Cañón de rifle',qty:10}]})]);await db.exec(`update datos set valor=jsonb_set(valor,'{0,prods}','[]') where clave='proveedores'`);await assert.rejects(db.query('select hg_reponer_herreria()'),/PRECIO_REPOSICION/);assert.equal((await db.query("select count(*)::int as n from datos where clave like 'pedido:auto-%'")).rows[0].n,0);assert.equal((await db.query('select count(*)::int as n from hg_reposicion_avisos')).rows[0].n,0);}finally{await db.close();}
});
test('servidor normaliza todas las familias; una cuenta sin verificar bloquea la creación',async()=>{
 const db=await setup();try{for(const n of ['rifle','pistola','repetidora','escopeta','revólver'])for(const prefix of ['Cañón','Cañon','cañón','canon'])assert.equal((await db.query('select hg_venta_material($1) as k',[prefix+' de '+n])).rows[0].k,'mat:Cañon de '+n);await db.exec('delete from hg_discord_bindings');await assert.rejects(db.query('select hg_reponer_herreria()'),/DESTINATARIO/);}finally{await db.close();}
});
