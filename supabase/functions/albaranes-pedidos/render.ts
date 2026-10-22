import {Resvg,initWasm} from 'npm:@resvg/resvg-wasm@2.6.2';
import {documento} from './modelo.ts';
import {imagenes} from './imagenes.ts';
const WEB='https://juancarlos15022-maker.github.io/harrington-gunsmith/';let ready:any;
const bytes=async(url:string)=>{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('RECURSO_ALBARAN');return new Uint8Array(await r.arrayBuffer())};
async function setup(){if(!ready)ready=(async()=>{const [wasm,font]=await Promise.all([bytes('https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm'),bytes('https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf')]);await initWasm(wasm);return {font,assets:imagenes}})().catch(e=>{ready=null;throw e});return ready}
export async function pngPedido(p:any){const {font,assets}=await setup(),{svg}=documento(p,assets);const r=new Resvg(svg,{font:{fontBuffers:[font],loadSystemFonts:false,defaultFontFamily:'EB Garamond'}});try{const rendered=r.render();try{return rendered.asPng()}finally{rendered.free()}}finally{r.free()}}
