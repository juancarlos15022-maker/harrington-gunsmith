const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('Recepción suma parciales y pendientes una vez, conserva otros materiales y revierte excesos',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create table datos(clave text primary key,valor jsonb,actualizado timestamptz);create table stock(producto text primary key,cantidad int check(cantidad>=0));create schema hg_sync_private;
 create function hg_permitido() returns boolean language sql as 'select true';create function hg_es_jefe() returns boolean language sql as 'select true';
 create function hg_sync_private.contexto_lectura() returns jsonb language sql as $$select '{"emp":"e1","nombre":"Jefe prueba"}'::jsonb$$;
 create function mover_stock(p_items jsonb) returns jsonb language plpgsql as $$declare it jsonb;begin for it in select * from jsonb_array_elements(p_items) loop insert into stock values(it->>'producto',(it->>'delta')::int) on conflict(producto) do update set cantidad=stock.cantidad+(it->>'delta')::int;end loop;return(select jsonb_object_agg(producto,cantidad) from stock);end$$;
 insert into stock values('mat:Pieza de arma',83),('mat:Cañon de revólver',10),('mat:Culata de revólver',10),('mat:Tela',100);
 insert into datos values('pedido:p1','{"id":"p1","code":"PED-PRUEBA","items":[{"material":"Pieza de arma","qty":67},{"material":"Cañon de revólver","qty":24},{"material":"Culata de revólver","qty":24}]}',now());`);
 const sql=fs.readFileSync('security/recibir-pedido.sql','utf8');await db.exec(sql.slice(sql.indexOf('create or replace function public.hg_material_pedido')));
 const run=async(id,lines)=>(await db.query('select recibir_pedido($1,$2,$3) r',[id,'p1',lines])).rows[0].r;
 const get=async()=>Object.fromEntries((await db.query('select producto,cantidad from stock')).rows.map(x=>[x.producto,x.cantidad]));
 const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 await run(id,[{i:0,qty:20}]);assert.equal((await get())['mat:Pieza de arma'],103);
 assert.equal((await run(id,[{i:0,qty:20}])).replayed,true);assert.equal((await get())['mat:Pieza de arma'],103);
 const before=await get();await assert.rejects(()=>run('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',[{i:0,qty:48}]),/CANTIDAD_EXCEDE/);assert.deepEqual(await get(),before);
 await run('cccccccc-cccc-cccc-cccc-cccccccccccc',null);
 assert.deepEqual(await get(),{'mat:Pieza de arma':150,'mat:Cañon de revólver':34,'mat:Culata de revólver':34,'mat:Tela':100});
 await assert.rejects(()=>run('dddddddd-dddd-dddd-dddd-dddddddddddd',null),/PEDIDO_YA_RECIBIDO/);
 assert.equal((await get())['mat:Pieza de arma'],150);
 }finally{await db.close()}
});
