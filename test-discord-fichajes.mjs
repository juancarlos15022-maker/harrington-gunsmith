import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarMensaje} from './supabase/functions/discord-envios/discord-validar.ts';
const turno={name:'Elías Riquelme',start:1792177985675,end:1792207505675};
function admin(f=turno){return {from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:f?{valor:f}:null})})})})};}
test('Dirección publica cierre de otro empleado con su nombre y registro correctos',async()=>{const r=await validarMensaje(admin(),'fichajes','turno:elia','jefe','Vincent Harrington',true);assert.equal(r.title,'SALIDA · Elías Riquelme');assert.equal(r.record,'turno:elia:'+turno.start);assert.match(r.description,/Hasta:/);});
test('empleado publica su propio cierre',async()=>{assert.equal((await validarMensaje(admin(),'fichajes','turno:elia','elia','Elías Riquelme')).title,'SALIDA · Elías Riquelme');});
test('empleado no puede publicar cierres de otra persona ni con identificador ajeno',async()=>{await assert.rejects(validarMensaje(admin(),'fichajes','turno:elia','otro','Otra persona'),/FICHAJE_NO_CONFIRMADO/);await assert.rejects(validarMensaje(admin({...turno,empId:'elia'}),'fichajes','turno:elia','otro','Elías Riquelme'),/FICHAJE_NO_CONFIRMADO/);});
test('Dirección tampoco publica referencias inexistentes o de otro tipo',async()=>{await assert.rejects(validarMensaje(admin(null),'fichajes','turno:nulo','jefe','Vincent',true),/FICHAJE_NO_CONFIRMADO/);await assert.rejects(validarMensaje(admin(),'fichajes','venta:elia','jefe','Vincent',true),/FICHAJE_NO_CONFIRMADO/);});
