/* Destinos propios para informes; los movimientos individuales conservan su canal. */
(function(root){'use strict';
function tipo(kind,text,filename=''){
 if(['ventas_semanales','gastos_semanales'].includes(kind))return kind;
 const head=String(text||'').slice(0,700).replace(/\*\*/g,'');
 if(kind==='ventas'&&(/REGISTRO SEMANAL DE VENTAS/i.test(head)||/_Ventas_TODOS\.txt$/i.test(filename)))return 'ventas_semanales';
 if(kind==='gastos'&&(/REGISTRO DE GASTOS\s*·\s*SEMANAL/i.test(head)||/^Gastos_Semanal_/i.test(filename)))return 'gastos_semanales';
 return kind;
}
root.HGSemanales={tipo};if(typeof module==='object'&&module.exports){module.exports=root.HGSemanales;return;}
if(typeof discordSend!=='function')return;
Object.assign(DC_LABELS,{ventas_semanales:'Ventas semanales',gastos_semanales:'Gastos semanales'});
Object.assign(KIND_COLOR,{ventas_semanales:KIND_COLOR.ventas,gastos_semanales:KIND_COLOR.gastos});
const send=discordSend;discordSend=function(kind,text,blob,fname){const target=tipo(kind,text,fname);if(target!==kind||target.endsWith('_semanales')){if(!webhook.urls[target]){dcFail(target,Error('404'),text);say('Falta configurar el canal de '+DC_LABELS[target]);return Promise.resolve(false);}}const args=Array.from(arguments);args[0]=target;return send.apply(this,args);};
const render=renderModDiscord;renderModDiscord=function(){
 let html=render.apply(this,arguments).replace('Ventas: ticket al finalizar y registro semanal (solo los jueves a las 22:00, o al pulsar «Enviar a Discord»)','Ventas individuales: ticket al finalizar').replace('Gastos: al guardarlos y registro semanal (solo los jueves a las 22:00, o al pulsar «Enviar a Discord»)','Gastos individuales: al guardarlos');
 const rows=['ventas_semanales','gastos_semanales'].map(k=>`<div class="wh-row"><label class="chk"><input type="checkbox" data-ev="${k}"${webhook.ev[k]?' checked':''}>${DC_LABELS[k]}: informes automáticos y manuales</label><input class="wh-own" type="text" data-whu="${k}" autocomplete="off" spellcheck="false" placeholder="Webhook del canal semanal (obligatorio)" value="${esc(webhook.urls[k]||'')}"></div>`).join('');
 return html.replace('<div class="pay-err" id="whErr"',rows+'<div class="pay-err" id="whErr"');
};
// Los informes de dirección no deben reservarse desde la sesión de un empleado.
const auto=autoWeekly;autoWeekly=function(){if(ME?.id!=='emuzvkc99z8q')return Promise.resolve();return auto.apply(this,arguments);};
})(globalThis);
