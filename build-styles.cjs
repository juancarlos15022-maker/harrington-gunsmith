const fs=require('node:fs'),path=require('node:path');
const sources=['estilos.css','barra-gestion.css','acceso-discord.css','coherencia-visual.css','acabado-armeria.css','botones-artesanos.css','pulido-harrington.css','controles-visibles.css','claridad-gestion.css','fichas-progreso.css','texturas-harrington.css','vistoso.css'];
const target=path.join(__dirname,'estilos-unificados.css');
const output=sources.map(file=>'/* Fuente: '+file+' */\n'+fs.readFileSync(path.join(__dirname,file),'utf8')).join('\n\n')+'\n';
if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output){console.error('Regenera los estilos con npm run build:styles');process.exitCode=1;}}else fs.writeFileSync(target,output);
