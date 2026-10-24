import assert from 'node:assert/strict';import {cargar} from './runtime.mjs';const {secretarias,estadoExp}=await cargar('secretarias');const {perfil,puedeFirmar,puedeVer}=await cargar('competencias');
function context(r=null,delegada=false){
 const writes=[];
 return {writes,c:{delegacion_economia_vice:String(delegada)},sb:{
  from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:r})}},
  rpc:async(n,args)=>{writes.push(args);return {data:{registro:{id:1,datos:{area:args.p_datos.area}},documento:null}}}
 }};
}

const gov={id:'1',nombre:'Gobernador',roles:{gobernador:true}},vice={id:'2',nombre:'Vice',roles:{vicegobernador:true}},trade={id:'3',roles:{comercio:true}},fest={id:'4',roles:{festejos:true}},old={id:'5',roles:{economia:true}};
const ficha=area=>({accion:'secretarias_guardar',area,clase:'informe',titulo:'Informe',texto:'Antecedentes'});
for(const area of ['economia','comercio','justicia','seguridad','festejos'])await secretarias(context(),ficha(area),gov);
for(const area of ['justicia','seguridad'])await secretarias(context(),ficha(area),vice);
await assert.rejects(secretarias(context(),ficha('economia'),vice),/corresponde/);await secretarias(context(null,true),ficha('economia'),vice);
await secretarias(context(),ficha('comercio'),trade);await assert.rejects(secretarias(context(),ficha('festejos'),trade),/corresponde/);await assert.rejects(secretarias(context(),ficha('economia'),old),/corresponde/);
await assert.rejects(secretarias(context({id:7,tipo:'secretaria',datos:{area:'economia'}}),{...ficha('comercio'),id:7},trade),/corresponde/);
const c=context();await secretarias(c,{...ficha('comercio'),clase:'ambulante',licenciaTipo:'ambulante',tasa:'12.35',vence:'25/10'},trade);assert.equal(c.writes[0].p_datos.requiereFirma,true);assert.equal(c.writes[0].p_datos.importeCents,1235);assert.ok(c.writes[0].p_datos.vence);
await assert.rejects(secretarias(context(),{...ficha('comercio'),clase:'revocacion'},trade),/Vincule/);
await secretarias(context(),ficha('festejos'),fest);await assert.rejects(secretarias(context({id:7,tipo:'secretaria',datos:{area:'festejos',clase:'evento'}}),{accion:'secretarias_remitir',id:7},fest),/Presidencia/);
const financial={tipo:'decreto',datos:{area:'comercio',importeCents:200}};assert.equal(puedeFirmar(vice,financial,{}),false);assert.equal(puedeFirmar(vice,financial,{delegacion_economia_vice:'true'}),true);assert.equal(puedeFirmar(vice,{datos:{area:'justicia'}},{}),true);assert.equal(puedeFirmar(trade,financial,{}),false);assert.equal(puedeVer(trade,{datos:{area:'economia'}},{}),false);assert.equal(perfil(trade,{}).inicio,'#secretarias/comercio');assert.equal(perfil(fest,{}).areas.length,1);
assert.equal(estadoExp({estado:'pendiente_firma',datos:{doc_id:1}},[{id:1,estado:'firmado'}]),'autorizado');console.log('OK: reparto por roles, aislamiento, vice conjunto, delegación revocable, firmas económicas y licencias.');
