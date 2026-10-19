export function canView(guild:string,roles:any[],member:any,channel:any){
 if(String(member.user?.id)===String(member.guild_owner))return true;
 let p=BigInt(roles.find(r=>r.id===guild)?.permissions||0);for(const r of roles)if((member.roles||[]).includes(r.id))p|=BigInt(r.permissions||0);if(p&8n)return true;
 const overwrites=channel.permission_overwrites||[],everyone=overwrites.find((r:any)=>r.id===guild);if(everyone)p=(p&~BigInt(everyone.deny||0))|BigInt(everyone.allow||0);
 let allow=0n,deny=0n;for(const o of overwrites)if(o.type===0&&(member.roles||[]).includes(o.id)){allow|=BigInt(o.allow||0);deny|=BigInt(o.deny||0);}p=(p&~deny)|allow;
 const personal=overwrites.find((r:any)=>r.type===1&&r.id===member.user?.id);if(personal)p=(p&~BigInt(personal.deny||0))|BigInt(personal.allow||0);return !!(p&1024n);
}
