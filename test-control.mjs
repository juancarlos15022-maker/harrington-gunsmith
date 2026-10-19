import assert from 'node:assert/strict';
import {maintainControl,prepareStyles,applyStyles,handleControlPanel,isConfigChannel,safeBinding,avatarData} from './supabase/functions/discord-bot/module-control.ts';
import {configureModule,readConfig} from './supabase/functions/discord-bot/module-runtime.ts';
import {defaults} from './supabase/functions/discord-bot/module-catalog.ts';
const c={guild_id:'1520875506214371439',app_id:'1559241466654761132',rol_jefe:'1520884742512447590',rol_armero:'1520885100219203807',canal_configuracion_bot:'1561742079477026946',token:'test'};
const tables={bot_equipo:[{id:'modules:config:'+c.guild_id,data:{modules:defaults(),activationLocked:true}}],hg_discord_leases:[],bot_cfg:[]};
const sb={rpc:async()=>({data:true}),from(t){let single=false,filters=[];const q={select(){return q},eq(k,v){filters.push(x=>x[k]===v);return q},maybeSingle(){single=true;return q},upsert(x){const key=t==='bot_cfg'?'clave':'id',i=tables[t].findIndex(y=>y[key]===x[key]);if(i<0)tables[t].push(structuredClone(x));else tables[t][i]=structuredClone(x);return q},delete(){return q},then(resolve,reject){const found=tables[t].filter(x=>filters.every(f=>f(x)));return Promise.resolve({data:single?found[0]||null:found}).then(resolve,reject)}};return q}};
let top=11,posts=0,patches=[],messages={},replies=[],deferred=[];
const roles=[{id:c.guild_id,position:0,permissions:'0',name:'everyone'},{id:'bot-role',position:11,managed:true,name:'bot'},{id:c.rol_jefe,position:12,name:'JEFE',color:0},{id:c.rol_armero,position:8,name:'Armero',color:0}];
const channel={id:c.canal_configuracion_bot,type:0,name:'⚙️・configuración-bot',permission_overwrites:[]};
const oldFetch=globalThis.fetch;globalThis.EdgeRuntime={waitUntil(p){deferred.push(p)}};
globalThis.fetch=async(url,options={})=>{const path=new URL(url).pathname.replace('/api/v10',''),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;let result={};
 if(path.startsWith('/webhooks/')){replies.push(body);return Response.json({});}
 if(path==='/users/@me/guilds')result=[{id:c.guild_id}];
 else if(path==='/guilds/'+c.guild_id+'/channels')result=[channel];
 else if(path==='/guilds/'+c.guild_id+'/roles')result=roles;
 else if(path==='/guilds/'+c.guild_id+'/members/'+c.app_id){roles[1].position=top;result={roles:['bot-role']};}
 else if(path==='/guilds/'+c.guild_id)result={id:c.guild_id,features:[]};
 else if(method==='PATCH'&&path.startsWith('/guilds/'+c.guild_id+'/roles/')){const id=path.split('/').at(-1);assert.notEqual(id,c.guild_id);assert.ok(!('permissions' in body));patches.push(id);Object.assign(roles.find(r=>r.id===id),body);}
 else if(path==='/channels/'+channel.id&&method==='PATCH')Object.assign(channel,body);
 else if(path==='/channels/'+channel.id+'/messages'&&method==='POST'){posts++;result={id:'message-'+posts};messages[result.id]=body;}
 else if(path.startsWith('/channels/'+channel.id+'/messages/')){const id=path.split('/').at(-1);if(!messages[id])return Response.json({},{status:404});if(method==='PATCH')messages[id]=body;result={id};}
 else throw Error('Unexpected '+method+' '+path);
 return Response.json(structuredClone(result));};
try{
 assert.ok(isConfigChannel('⚙️・Configuración Bot'));assert.ok(!isConfigChannel('Configuración'));assert.ok(!safeBinding('token'));assert.ok(!safeBinding('canal_configuracion_bot'));
 await avatarData('https://127.0.0.1/secret').then(()=>assert.fail(),e=>assert.match(e.message,/Discord/));
 let styles=await prepareStyles(sb,c);assert.equal(styles[c.rol_jefe].status,'pending');assert.equal(styles[c.rol_armero].status,'applied');assert.deepEqual(patches,[c.rol_armero]);
 await maintainControl(sb,c,true);assert.equal(posts,1);assert.equal((await readConfig(sb,c.guild_id)).activationLocked,false);assert.ok(Object.values((await readConfig(sb,c.guild_id)).modules).every(m=>!m.enabled));assert.equal(channel.permission_overwrites.find(x=>x.id===c.guild_id).deny,'1024');
 await maintainControl(sb,c,true);assert.equal(posts,1);assert.deepEqual(patches,[c.rol_armero]);
 const chief={uid:'chief',chief:true};await configureModule(sb,c,'tickets',{enabled:true},chief);await configureModule(sb,c,'responsables',{enabled:true},chief);await assert.rejects(configureModule(sb,c,'tickets',{enabled:false},chief),/Desactiva primero/);
 await configureModule(sb,c,'responsables',{enabled:false},chief);await configureModule(sb,c,'tickets',{enabled:false},chief);
 const i={guild_id:c.guild_id,channel_id:channel.id,application_id:c.app_id,token:'interaction',member:{user:{id:'chief'},roles:[c.rol_jefe]},data:{custom_id:'ctl:appearance'}};
 assert.equal((await (await handleControlPanel(i,c,sb)).json()).type,9);
 assert.equal((await (await handleControlPanel({...i,member:{user:{id:'visitor'},roles:[]}},c,sb)).json()).type,4);
 const toggle={...i,data:{custom_id:'ctl:toggle:tickets:1'}};assert.equal((await (await handleControlPanel(toggle,c,sb)).json()).type,5);await Promise.all(deferred);assert.equal((await readConfig(sb,c.guild_id)).modules.tickets.enabled,true);await configureModule(sb,c,'tickets',{enabled:false},chief);
 top=13;roles[1].position=13;styles=await applyStyles(sb,c);assert.equal(styles[c.rol_jefe].status,'applied');assert.equal(patches.filter(id=>id===c.rol_jefe).length,1);await applyStyles(sb,c);assert.equal(patches.filter(id=>id===c.rol_jefe).length,1);
 console.log('OK: detección y privacidad, panel sin duplicados, 43 módulos apagados, controles reales, dependencias, perfil por servidor, JEFE pendiente y reintento al elevar jerarquía, colores sin alterar permisos.');
}finally{globalThis.fetch=oldFetch;delete globalThis.EdgeRuntime;}
