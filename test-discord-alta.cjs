const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const app=fs.readFileSync(__dirname+'/app.js','utf8');const fn=app.match(/async function gatePickSrv\(e\)\{[\s\S]*?\n\}\nasync function gPwSrv/)[0].replace(/\nasync function gPwSrv$/,'');
async function mode(puesto,tiene){const e={id:'chester',puesto};const ctx={G:{big:true},CLAVES:{},isJefe:x=>x.puesto==='Jefe',authApi:async()=>({ok:true,j:{tiene,jefe:false}}),gPwShow:(e,mode)=>{ctx.G.pw={e,mode}},bossCreds:()=>null};vm.createContext(ctx);vm.runInContext(fn,ctx);await ctx.gatePickSrv(e);return ctx.G.pw;}
test('jefe sin contraseña personal abre creación, no contraseña compartida',async()=>{const r=await mode('Jefe',false);assert.equal(r.mode,'create');assert.equal(r.srv,true);});
test('jefe con contraseña conserva su acceso existente',async()=>assert.equal((await mode('Jefe',true)).mode,'boss'));
test('empleado nuevo crea contraseña y empleado existente inicia sesión',async()=>{assert.equal((await mode('Armero',false)).mode,'create');assert.equal((await mode('Armero',true)).mode,'login');});
