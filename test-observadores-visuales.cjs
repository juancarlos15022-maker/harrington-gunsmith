const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
async function measure(before){const dom=new JSDOM(fs.readFileSync(__dirname+'/index.html','utf8'),{url:'https://prueba.invalid/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,frames=new Map(),observers=[];let seq=0;const MO=w.MutationObserver;
 w.MutationObserver=class extends MO{constructor(f){super(f);observers.push(this)}};w.matchMedia=()=>({matches:true,addEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.setTimeout=()=>0;w.setInterval=()=>0;w.requestAnimationFrame=f=>{frames.set(++seq,f);return seq};w.cancelAnimationFrame=n=>frames.delete(n);w.fetch=async()=>{throw Error('RED BLOQUEADA')};w.WebSocket=undefined;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.Response=Response;
 const visual=['vistoso.js','vistoso2.js','vistoso4.js'];w.eval(fs.readFileSync(__dirname+'/auto-fabricacion.js','utf8')+'\n'+fs.readFileSync(__dirname+'/app.js','utf8')+'\n'+visual.map(f=>fs.readFileSync(__dirname+'/'+(before?'before-':'')+f,'utf8')).join('\n'));
 async function flush(){for(let k=0;k<15;k++){await Promise.resolve();if(!frames.size)return;const work=[...frames.values()];frames.clear();for(const f of work)f(1000+k*16);}throw Error('Decoración no se estabiliza');}
 await flush();let queries=0;for(const method of ['querySelector','querySelectorAll']){const original=w.document.body[method];w.document.body[method]=function(){queries++;return original.apply(this,arguments)}}
 for(let i=0;i<20;i++){const span=w.document.createElement('span');span.textContent='Cambio de cantidad '+i;w.document.getElementById('cart').replaceChildren(span);await flush();}
 observers.forEach(o=>o.disconnect());w.close();return queries;
}
(async()=>{const after=await measure(false);assert.equal(after,0);const before=process.env.HG_MEASURE_BEFORE?await measure(true):null;if(before!==null)assert(before>after);console.log(JSON.stringify({bodyQueriesBefore:before,bodyQueriesAfter:after,cartUpdates:20}));})().catch(e=>{console.error(e);process.exitCode=1});

