const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync(__dirname+'/supabase/functions/harrington-reposicion/reposicion.ts','utf8'),{mode:'strip'}).replace(/^export /gm,'');
function load(){const c={fetch:()=>{},AbortSignal,Date,Error,JSON,Array,Object,String,Number,Intl,Set,Math};vm.createContext(c);vm.runInContext(source+';this.api={telegramaIC,vistaPrivada,tarjetaEmpresa,nombreIC,runReposicion};',c);return c.api;}
const base={id:'auto-x',code:'PED-201026-1559-AX',proveedor:'Herrería de Saint Denis',ts:Date.parse('2026-10-20T14:00:00Z'),totalCents:2000,paid:false,received:false,cancelled:false,completedAt:0,origen:'reposicion-herreria',
 items:[{material:'Cañon de escopeta',qty:10,price:720},{material:'Pieza de arma especial',qty:1,price:2045},{material:'Tornillo',qty:29,price:23}]};
test('telegrama IC: de Vincent al establecimiento, sin número de pedido, con saludo, encargo, pago, gracias y despedida',()=>{
 const t=load().telegramaIC({...base,aceptadoAt:Date.parse('2026-10-20T16:00:00Z')});
 assert.match(t,/^Herrería de Saint Denis:/);assert.match(t,/Buenas tardes/);assert.match(t,/Vincent Harrington/);
 assert.match(t,/10 cañones de escopeta/);assert.match(t,/1 pieza de arma especial/);assert.match(t,/29 tornillos/);
 assert.match(t,/(reciba|llegue|recepción|traérmelo|recibirlo)/);assert.match(t,/(gracias|agradec|agradez)/i);assert.match(t,/(saludo|atentamente)/i);
 assert.doesNotMatch(t,/PED-|Referencia|\$|recog/);
});
test('privado: la propuesta abierta lleva el botón de aceptar; aceptada, el de ver pedido y albarán; anulada, sin botón',()=>{
 const a=load(),job={pedido_id:'auto-x',token:'f'.repeat(64)};
 const p=a.vistaPrivada({...base,propuesta:true},job);assert.equal(p.components[0].components[0].style,5);assert.match(p.components[0].components[0].url,/aceptar\.html\?t=f{64}$/);assert.equal(p.embeds[0].footer.text,'Reposición auto-x');
 const ac=a.vistaPrivada({...base,propuesta:false,aceptadoAt:Date.now()},job).components;assert.equal(ac.length,1);assert.match(ac[0].components[0].label,/albarán/);assert.match(ac[0].components[0].url,/aceptar\.html\?t=f{64}$/);
 assert.equal(a.vistaPrivada({...base,propuesta:false,cancelled:true,propuestaCerrada:'sin-faltas'},job).components.length,0);
 assert.match(a.vistaPrivada({...base,propuesta:false,cancelled:true,propuestaCerrada:'sin-faltas'},job).content,/Ya no hace falta/);
});
test('tarjeta de la empresa: la propuesta lleva su aviso y NO se puede recibir; aceptada, sí',()=>{
 const a=load(),t=a.tarjetaEmpresa({...base,propuesta:true});assert.match(t.embeds[0].title,/Propuesta/);assert.match(t.embeds[0].description,/aún sin encargar/);assert.equal(t.components.length,0);
 assert.equal(a.tarjetaEmpresa({...base,propuesta:false,aceptadoAt:Date.now()}).components[0].components[0].custom_id,'ped:rec:auto-x');
});
test('revisión: edita el privado y la tarjeta al cambiar la propuesta y manda el telegrama al aceptarla',async()=>{
 const a=load();const job={pedido_id:'auto-x',status:'sent',cerrado:false,version:3,sent_version:2,card_version:2,ic_status:'pending',channel_id:'dm',message_id:'m1',nonce:'rep-x',token:'a'.repeat(64)};
 const order={...base,propuesta:false,aceptadoAt:Date.now()};const calls=[];
 const tables={hg_reposicion_avisos:[job],datos:[{clave:'pedido:auto-x',valor:order}],bot_pedmsg:[{pedido_id:'auto-x',mensaje_id:'card1'}],hg_discord_leases:[]};
 const sb={rpc:async()=>({data:true}),from(table){let f=[],up=null,one=false;const q={select(){return q},eq(k,v){f.push(r=>r[k]===v);return q},lte(){return q},order(){return q},limit(){return q},single(){one=true;return q},maybeSingle(){one=true;return q},update(v){up=v;return q},delete(){return q},then(res){let rows=(tables[table]||[]).filter(r=>f.every(x=>x(r)));if(up)rows.forEach(r=>Object.assign(r,up));return Promise.resolve(res({data:one?rows[0]:rows}));}};return q;}};
 const request=async(url,o)=>{calls.push(o.method+' '+url.replace('https://discord.com/api/v10',''));return new Response(JSON.stringify({id:'nuevo'}));};
 const r=await a.runReposicion(sb,{token:'x',canal_pedidos:'canal'},request,'auto-x');
 assert.equal(r.updated,1);assert.deepEqual(calls,['PATCH /channels/dm/messages/m1','POST /channels/dm/messages','PATCH /channels/canal/messages/card1']);
 assert.equal(job.sent_version,3);assert.equal(job.card_version,3);assert.equal(job.ic_status,'sent');
});
