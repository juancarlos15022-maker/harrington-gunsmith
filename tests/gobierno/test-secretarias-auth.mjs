import assert from 'node:assert/strict';import {cargar} from './runtime.mjs';const {secretarias,estadoExp}=await cargar('secretarias');
function context(config={},r=null){const writes=[];return {writes,c:{rol_economia:'role-economy',guild_id:'guild'},api:async()=>{throw Error('No disponible')},sb:{from(table){const q={select(){return q},like(){return Promise.resolve({data:Object.entries(config).map(([id,v])=>({clave:'competencia_'+id,valor:JSON.stringify(v)}))})},eq(){return q},maybeSingle:async()=>({data:r}),upsert(v){writes.push(v);return Promise.resolve({data:v})},insert(v){writes.push(v);return Promise.resolve({data:v})}};return q},rpc:async(n,args)=>{writes.push(args);return {data:{registro:{id:1,datos:{area:args.p_datos.area}},documento:null}}}}}}
const gov={id:'1',nombre:'Gobernador',roles:{gobernador:true}},eco={id:'2',nombre:'Economía',roles:{economia:true}},con={id:'3',nombre:'Consejero',roles:{consejo:true}};
const ficha=area=>({accion:'secretarias_guardar',area,clase:'informe',titulo:'Informe',texto:'Antecedentes'});
await assert.rejects(secretarias(context(),ficha('justicia'),eco),/corresponde/);
await assert.rejects(secretarias(context(),ficha('economia'),con),/corresponde/);
for(const area of ['economia','comercio']){const ctx=context();await secretarias(ctx,ficha(area),eco);assert.equal(ctx.writes[0].p_datos.area,area)}
for(const area of ['economia','comercio','justicia','seguridad'])await secretarias(context(),ficha(area),gov);
const cfg={economia:{modo:'delegada',titulares:[{id:'3',nombre:'Consejero'}]}};await secretarias(context(cfg),ficha('economia'),con);await assert.rejects(secretarias(context(cfg),ficha('economia'),eco),/corresponde/);
await assert.rejects(secretarias(context({}, {id:77,tipo:'secretaria',datos:{area:'seguridad'}}),{...ficha('economia'),id:77},eco),/corresponde/);
await assert.rejects(secretarias(context(),{accion:'secretarias_competencia',area:'economia',modo:'gobernador'},eco),/Solo el Gobernador/);
const ctx=context();await secretarias(ctx,{accion:'secretarias_competencia',area:'economia',modo:'gobernador'},gov);assert.equal(JSON.parse(ctx.writes[0].valor).modo,'gobernador');
await assert.rejects(secretarias(context(),{...ficha('economia'),clase:'gasto',importe:'-20'},gov),/positivo/);
const gasto=context();await secretarias(gasto,{...ficha('economia'),clase:'gasto',importe:'12,35',requiereFirma:false},eco);assert.equal(gasto.writes[0].p_datos.requiereFirma,true);assert.equal(gasto.writes[0].p_datos.importeCents,1235);
assert.equal(estadoExp({estado:'pendiente_firma',datos:{doc_id:1}},[{id:1,estado:'firmado'}]),'autorizado');assert.equal(estadoExp({estado:'pendiente_firma',datos:{doc_id:1}},[{id:1,estado:'descartado'}]),'devuelto');
console.log('OK · competencias múltiples, supervisión, revocación, importe y firma obligatoria en el servidor');
const cultura={id:'4',nombre:'Festejos',roles:{consejo:true,festejos:true}};
const fiesta=context();await secretarias(fiesta,{...ficha('festejos'),clase:'evento',fecha:'25/10',hora:'18:30',requiereFirma:false},cultura);assert.equal(fiesta.writes[0].p_datos.requiereFirma,true);assert.equal(fiesta.writes[0].p_datos.area,'festejos');assert.ok(fiesta.writes[0].p_datos.plazo);
await assert.rejects(secretarias(context(),ficha('festejos'),eco),/corresponde/);
await assert.rejects(secretarias(context(),ficha('economia'),cultura),/corresponde/);
await assert.rejects(secretarias(context({}, {id:77,tipo:'secretaria',datos:{area:'festejos',clase:'evento'}}),{accion:'secretarias_remitir',id:77,escrito:'Anunciar una feria'},cultura),/Presidencia/);
console.log('OK · Festejos: rol propio, presupuesto aislado, fechas provisionales y Presidencia obligatoria.');
