import {stripTypeScriptTypes} from 'node:module';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'secretarias-'));
for(const n of ['enlaces','acceso','competencias','oficina','gob','campana','secretarias','hacienda','cuentas','web'])fs.writeFileSync(path.join(dir,n+'.mjs'),stripTypeScriptTypes(fs.readFileSync(new URL('../../supabase/functions/discord-whitmore/'+n+'.ts',import.meta.url),'utf8'),{mode:'transform'}).replaceAll('.ts"','.mjs"').replaceAll(".ts'",".mjs'"));
process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));export const cargar=n=>import(pathToFileURL(path.join(dir,n+'.mjs')));
