// Restauración no destructiva: conserva la correspondencia de IDs en la misma operación.
export async function restoreStructure(api:any,c:any,backup:any){
 const guild=c.guild_id,roles=await api(c,'GET','/guilds/'+guild+'/roles'),channels=await api(c,'GET','/guilds/'+guild+'/channels'),member=await api(c,'GET','/guilds/'+guild+'/members/'+c.app_id);
 const top=Math.max(0,...roles.filter((r:any)=>member.roles.includes(r.id)).map((r:any)=>r.position));
 const map:Record<string,string>={[backup.guild]:guild};
 for(const old of [...backup.roles].sort((a,b)=>a.position-b.position)){
  const current=roles.find((r:any)=>r.id===old.id);if(old.id===backup.guild){map[old.id]=guild;continue;}
  const body={name:old.name,permissions:old.permissions,colors:old.colors||{primary_color:old.color||0,secondary_color:null,tertiary_color:null}};
  if(current){map[old.id]=current.id;if(!current.managed&&current.position<top)await api(c,'PATCH','/guilds/'+guild+'/roles/'+current.id,body);}
  else{const r=await api(c,'POST','/guilds/'+guild+'/roles',body);map[old.id]=r.id;}
 }
 const ordered=[...backup.channels].sort((a,b)=>(a.type===4?0:1)-(b.type===4?0:1)||a.position-b.position);
 for(const old of ordered){
  if(![0,2,4,5,13,15,16].includes(old.type))continue;
  const overwrite=(old.permission_overwrites||[]).map((p:any)=>({...p,id:p.type===0?(map[p.id]||p.id):p.id}));
  const parent=old.parent_id?(map[old.parent_id]||old.parent_id):null;
  const body:any={name:old.name,permission_overwrites:overwrite};if(old.type!==4)body.parent_id=parent;if([0,5,15,16].includes(old.type))body.topic=old.topic||null;
  const current=channels.find((ch:any)=>ch.id===old.id);
  if(current){map[old.id]=current.id;await api(c,'PATCH','/channels/'+current.id,body);}else{const ch=await api(c,'POST','/guilds/'+guild+'/channels',{...body,type:old.type});map[old.id]=ch.id;}
 }
 return {restoredRoles:backup.roles.length,restoredChannels:backup.channels.length,mapping:map};
}
