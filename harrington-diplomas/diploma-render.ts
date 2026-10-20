import {background,font,seal} from "./diploma-assets.ts";
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export async function diplomaPNG(e,a){
 const {Image}=await import('https://deno.land/x/imagescript@1.3.0/mod.ts');
 const image=await Image.decode(bytes(background)),ttf=bytes(font);
 const text=async(t,y,size,max=790)=>{let label=await Image.renderText(ttf,size,String(t),0x3c2918ff);while(label.width>max&&size>12)label=await Image.renderText(ttf,--size,String(t),0x3c2918ff);image.composite(label,Math.round((image.width-label.width)/2),y);};
 await text("LA CASA HARRINGTON",205,25);
 await text("certifica el ascenso de",247,20);
 await text(String(e.name).slice(0,100),282,40);
 await text("al puesto de",337,19);
 await text(String(a.a).slice(0,80),371,31);
 await text("con un sueldo de $"+(Number(a.nuevo)/100).toFixed(2)+" a la semana",419,20);
 const date=new Date(Number(a.ts)).toLocaleDateString('es-ES',{timeZone:'Europe/Madrid',day:'numeric',month:'long'});
 await text("Saint Denis, a "+date,456,17);
 const s=await Image.decode(bytes(seal));image.composite(s,Math.round((image.width-s.width)/2),525);
 return image.encode(1);
}
