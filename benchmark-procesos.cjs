const fs=require('node:fs'),{performance}=require('node:perf_hooks'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync(__dirname+'/index.html','utf8'),{url:'https://prueba.invalid/',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.fetch=async()=>{throw Error('offline')};w.WebSocket=undefined;w.setTimeout=()=>0;w.setInterval=()=>0;w.requestAnimationFrame=()=>0;w.Response=Response;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
const scenario=process.env.HG_BENCH_SCENARIO||'vacio';
let setup='';if(scenario==='cliente')setup=`customer.name='Cliente 199';clientes=Array.from({length:200},(_,i)=>({name:'Cliente '+i,precios:{}}));clientes[199].precios={'Cattleman Revolver':12.34};inputs.slice(0,8).forEach((i,n)=>i.value=String(n%3+1));`;
w.localStorage.setItem('harrington_empleados_v1',JSON.stringify([{id:'e1',name:'Empleado',puesto:'Armero'}]));w.sessionStorage.setItem('harrington_me_v1',JSON.stringify({id:'e1',name:'Empleado'}));w.eval(fs.readFileSync(__dirname+'/auto-fabricacion.js','utf8'));w.eval(fs.readFileSync(require('node:path').resolve(__dirname,process.env.HG_CALC_SOURCE||'app.js'),'utf8')+'\nappMode="presupuesto";\n'+fs.readFileSync(__dirname+'/rendimiento-interfaz.js','utf8')+'\n'+setup);

const results={};
for(const name of ['calc','selected','computeFin']){
 const run=()=>name==='calc'?w.calc(false):w[name]();for(let i=0;i<15;i++)run();const samples=[];
 for(let batch=0;batch<5;batch++){const start=performance.now();for(let i=0;i<80;i++)run();samples.push((performance.now()-start)/80);}samples.sort((a,b)=>a-b);results[name]={medianMs:samples[2],samples};
}
console.log(JSON.stringify({scenario,results}));w.close();
