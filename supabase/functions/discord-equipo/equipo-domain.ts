export type Tile = [number, number];
export type Game = { game: string; players: string[]; names: string[]; state: string; turn: number; hands: Tile[][]; pile: Tile[]; chain: Tile[]; passes: number; points: number[]; rolls: number[][]; round: number; winner?: number; result?: string };
export const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function random(n: number) { const a = new Uint32Array(1), max = Math.floor(4294967296 / n) * n; do { crypto.getRandomValues(a); } while (a[0] >= max); return a[0] % n; }
export function shuffled<T>(a: T[], rng = random) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; }
export function newGame(game: string, uid: string, name: string): Game { return {game, players:[uid],names:[name],state:'waiting',turn:0,hands:[],pile:[],chain:[],passes:0,points:[0,0],rolls:[[],[]],round:1}; }
export function joinGame(g: Game, uid: string, name: string, rng = random): Game {
 if(g.state!=='waiting'||g.players.includes(uid))throw Error('Esta mesa ya está ocupada o usted ya está apuntado.');
 g=structuredClone(g);g.players.push(uid);g.names.push(name);g.state='playing';
 if(g.game==='domino'){ const tiles:Tile[]=[];for(let a=0;a<=6;a++)for(let b=a;b<=6;b++)tiles.push([a,b]);const deck=shuffled(tiles,rng);g.hands=[deck.splice(0,7),deck.splice(0,7)];g.pile=deck;g.turn=rng(2); }
 return g;
}
export function legalMoves(g:Game,p:number) { const out:{index:number;side:string;tile:Tile}[]=[];for(const [index,t] of (g.hands[p]||[]).entries()){if(!g.chain.length){out.push({index,side:'R',tile:t});continue;}const l=g.chain[0][0],r=g.chain[g.chain.length-1][1];if(t.includes(l))out.push({index,side:'L',tile:t});if(t.includes(r))out.push({index,side:'R',tile:t});}return out; }
const sum=(a:Tile[])=>a.reduce((s,t)=>s+t[0]+t[1],0);
export function dominoMove(g:Game,uid:string,move:string):Game {
 g=structuredClone(g);const p=g.players.indexOf(uid);if(g.state!=='playing'||p!==g.turn)throw Error('No es su turno.');
 if(move==='draw'){if(legalMoves(g,p).length)throw Error('Tiene una ficha que puede colocar.');if(!g.pile.length)throw Error('El pozo está vacío: debe pasar.');g.hands[p].push(g.pile.pop()!);return g;}
 if(move==='pass'){if(g.pile.length||legalMoves(g,p).length)throw Error('Primero coloque una ficha o robe del pozo.');g.passes++;if(g.passes>=2){const a=sum(g.hands[0]),b=sum(g.hands[1]);g.state='done';g.winner=a===b?undefined:a<b?0:1;g.result=a===b?'Partida cerrada: empate.':'Partida cerrada: gana quien conserva menos puntos.';}else g.turn=1-p;return g;}
 const [ix,side]=move.split('-');const m=legalMoves(g,p).find(x=>x.index===Number(ix)&&x.side===side);if(!m)throw Error('Esa jugada ya no es válida. Abra su mano otra vez.');
 let t:Tile=[...g.hands[p].splice(m.index,1)[0]];
 if(!g.chain.length)g.chain.push(t);else if(side==='L'){if(t[1]!==g.chain[0][0])t=[t[1],t[0]];g.chain.unshift(t);}else {if(t[0]!==g.chain[g.chain.length-1][1])t=[t[1],t[0]];g.chain.push(t);}
 g.passes=0;if(!g.hands[p].length){g.state='done';g.winner=p;g.result='¡Dominó! Se ha quedado sin fichas.';}else g.turn=1-p;return g;
}
export function diceRoll(g:Game,uid:string,rng=random):Game {
 g=structuredClone(g);const p=g.players.indexOf(uid);if(g.state!=='playing'||p<0)throw Error('No participa en esta partida.');if(g.rolls[p].length)throw Error('Ya ha tirado en esta ronda.');g.rolls[p]=[rng(6)+1,rng(6)+1];
 if(g.rolls.every(x=>x.length)){const a=g.rolls[0].reduce((x,y)=>x+y),b=g.rolls[1].reduce((x,y)=>x+y);if(a!==b)g.points[a>b?0:1]++;g.result=g.names[0]+': '+g.rolls[0].join(' + ')+' · '+g.names[1]+': '+g.rolls[1].join(' + ')+(a===b?' · Empate.':'');if(Math.max(...g.points)>=2){g.state='done';g.winner=g.points[0]>g.points[1]?0:1;}else {g.rolls=[[],[]];g.round++;}}
 return g;
}
export function madridParts(ms:number){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).map(p=>[p.type,p.value]));}
export function localToUTC(y:number,m:number,d:number,h:number,min:number){let t=Date.UTC(y,m-1,d,h,min);for(let k=0;k<4;k++){const p=madridParts(t);const delta=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-Date.UTC(y,m-1,d,h,min);if(!delta)return t;t-=delta;}throw Error('Esa hora no existe por el cambio de horario. Elija otra.');}
export function reminderTime(input:string,now=Date.now()):number|null {
 if(!input.trim())return null;const s=norm(input);let x=s.match(/^en (\d+) (minuto|minutos|hora|horas|dia|dias)$/);let t:number;
 if(x){const n=+x[1];t=now+n*(x[2].startsWith('min')?60000:x[2].startsWith('hora')?3600000:86400000);}
 else {const p=madridParts(now);let y=+p.year,m=+p.month,d=+p.day,h=10,mi=0;let match=input.trim().toLowerCase().match(/^(hoy|mañana|manana)(?:\s+(?:a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?)?$/);if(match){if(match[1]!=='hoy'){const next=new Date(Date.UTC(y,m-1,d+1));y=next.getUTCFullYear();m=next.getUTCMonth()+1;d=next.getUTCDate();}h=match[2]?+match[2]:10;mi=+(match[3]||0);}else {match=input.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s+(\d{1,2}):(\d{2})$/);if(!match)throw Error('Use «mañana 10:00», «en 30 minutos» o «20/10/2026 18:00».');d=+match[1];m=+match[2];y=+(match[3]||y);h=+match[4];mi=+match[5];}if(h>23||mi>59||m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate())throw Error('Fecha u hora inválida.');t=localToUTC(y,m,d,h,mi);}
 if(t<=now||t>now+366*86400000)throw Error('El recordatorio debe estar en el futuro y dentro de un año.');return t;
}
export function visible(channel:any,uid:string,roles:string[],guild:string,guildRoles:any[],owner:string){if(uid===owner)return true;const relevant=guildRoles.filter(r=>r.id===guild||roles.includes(r.id));let p=relevant.reduce((n,r)=>n|BigInt(r.permissions||0),0n);if(p&8n)return true;const ow=channel.permission_overwrites||[];const everyone=ow.find((r:any)=>r.type===0&&r.id===guild);if(everyone)p=(p&~BigInt(everyone.deny))|BigInt(everyone.allow);let allow=0n,deny=0n;for(const r of ow)if(r.type===0&&roles.includes(r.id)){allow|=BigInt(r.allow);deny|=BigInt(r.deny);}p=(p&~deny)|allow;const member=ow.find((r:any)=>r.type===1&&r.id===uid);if(member)p=(p&~BigInt(member.deny))|BigInt(member.allow);return (p&1024n)!==0n&&(p&65536n)!==0n;}
