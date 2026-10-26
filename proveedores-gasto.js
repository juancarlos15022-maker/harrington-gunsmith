/* Pagos acumulados por proveedor; pedido y gasto nunca se suman dos veces. */
(function(root){'use strict';
const amount=x=>Number.isFinite(Number(x))?Math.max(0,Math.round(Number(x))):0;
const norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('es');
function totals(providers,orders,expenses){
 const rows=new Map(),ids=new Map(),names=new Map();
 for(const v of providers||[]){if(!v||v.deleted)continue;const r={id:v.id,name:v.name||'Proveedor sin nombre',cents:0};rows.set('id:'+v.id,r);ids.set(v.id,r);const n=norm(v.name);names.set(n,names.has(n)?null:r);}
 function supplier(id,name){if(ids.has(id))return ids.get(id);if(names.get(norm(name)))return names.get(norm(name));const k=id?'historico:'+id:'nombre:'+norm(name);if(!rows.has(k))rows.set(k,{id:null,name:name||'Proveedor sin identificar',cents:0});return rows.get(k);}
 const ledger=new Map(),seen=new Set();
 for(const g of expenses||[]){if(!g||g.deleted||g.anulado||g.cancelled||g.cat!=='proveedor'||g.compra)continue;if(g.id&&seen.has(g.id))continue;if(g.id)seen.add(g.id);
 if(g.pedido)ledger.set(g.pedido,Math.max(ledger.get(g.pedido)||0,amount(g.cents)));
 else if(g.proveedorId||g.proveedor)supplier(g.proveedorId,g.proveedor).cents+=amount(g.cents);}
 const handled=new Set();
 for(const p of orders||[]){if(!p||!p.id||handled.has(p.id))continue;handled.add(p.id);let paid=0;
 if(!p.propuesta&&!p.deleted)paid=p.liquidacion&&p.liquidacion.paidCents!=null?amount(p.liquidacion.paidCents):p.paid?amount(p.totalCents):amount(p.abonoCents)||(p.paidInitial?amount(p.totalCents):0);
 paid=Math.max(paid,ledger.get(p.id)||0);ledger.delete(p.id);if(paid)supplier(p.proveedorId,p.proveedor).cents+=paid;}
 for(const [id,cents]of ledger){const g=(expenses||[]).find(x=>x.pedido===id&&!x.deleted);supplier(g?.proveedorId,g?.proveedor||'Proveedor sin identificar').cents+=cents;}
 return [...rows.values()].sort((a,b)=>b.cents-a.cents||a.name.localeCompare(b.name,'es'));
}
root.HGProveedorGasto={totals};if(typeof module==='object'&&module.exports)module.exports={totals};if(typeof document==='undefined')return;
const style=document.createElement('style');style.textContent='.hg-prov-gasto{margin:0 0 22px;padding:20px;border:1px solid #b49a61;border-radius:8px;background:linear-gradient(135deg,#f4ecd8,#e9dcc0);color:#263f32}.hg-prov-gasto h3{margin:0 0 6px;font:700 20px Georgia,serif}.hg-prov-total{font:700 30px Georgia,serif;color:#234b39}.hg-prov-caption{margin:4px 0 18px;font-size:12px;line-height:1.5;color:#5a5949}.hg-prov-bars{display:grid;gap:14px}.hg-prov-bar-head{display:flex;gap:12px;align-items:baseline;justify-content:space-between;font-size:14px;margin-bottom:5px}.hg-prov-bar-head span{overflow-wrap:anywhere}.hg-prov-bar-head b{white-space:nowrap;font-variant-numeric:tabular-nums}.hg-prov-track{height:13px;border:1px solid #c9b98e;border-radius:3px;background:#d9ccb0;overflow:hidden}.hg-prov-fill{height:100%;background:linear-gradient(90deg,#214b38,#64805b)}.hg-prov-zero{font-size:11px;color:#726955}.hg-prov-foot{font-size:11px;line-height:1.5;margin:17px 0 0;color:#675e4b}@media(max-width:480px){.hg-prov-gasto{padding:15px}.hg-prov-total{font-size:26px}.hg-prov-bar-head{font-size:13px}}';document.head.append(style);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function data(){return totals(proveedores,pedidos,gastos);}
function html(rows){const total=rows.reduce((s,x)=>s+x.cents,0),max=Math.max(1,...rows.map(x=>x.cents));return '<section class="hg-prov-gasto" id="hgProveedorGasto" aria-label="Dinero pagado a cada proveedor"><h3>Gasto por proveedor</h3><div class="hg-prov-total">'+money(total)+'</div><p class="hg-prov-caption">Total pagado acumulado · Actualización automática</p><div class="hg-prov-bars" role="list">'+(rows.length?rows.map(x=>'<div role="listitem"><div class="hg-prov-bar-head"><span>'+escape(x.name)+'</span><b>'+money(x.cents)+'</b></div><div class="hg-prov-track" aria-hidden="true"><div class="hg-prov-fill" style="width:'+(100*x.cents/max).toFixed(3)+'%"></div></div>'+(x.cents?'':'<span class="hg-prov-zero">Sin pagos registrados</span>')+'</div>').join(''):'<p>Todavía no hay proveedores ni pagos registrados.</p>')+'</div><p class="hg-prov-foot">Incluye anticipos y pedidos pagados aunque sigan por recibir. Excluye pedidos pendientes de pago y compras a particulares. Los pagos cancelados pendientes de devolución siguen contando como dinero desembolsado.</p></section>';}
let signature='';const original=renderModProveedores;
renderModProveedores=function(){const result=original.apply(this,arguments);if(pvView||pvEdit)return result;const rows=data();signature=JSON.stringify(rows);return html(rows)+result;};
function update(){if(typeof dirMod==='undefined'||dirMod!=='proveedores'||pvView||pvEdit||dirModal.hidden)return;const el=document.getElementById('hgProveedorGasto');if(!el)return;const rows=data(),next=JSON.stringify(rows);if(next!==signature){signature=next;el.outerHTML=html(rows);}}
const records=applyRecords;applyRecords=function(){const r=records.apply(this,arguments);update();return r;};
setInterval(update,2500);
})(typeof window!=='undefined'?window:globalThis);
