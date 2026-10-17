import {createHmac,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import type {Request,Response} from 'express';

const cookieName='hp_workspace_session';
const sessionLifetime=8*60*60;
export function matchesAccessKey(candidate:string,key:string){
 const digest=(value:string)=>createHash('sha256').update(value).digest();
 return timingSafeEqual(digest(candidate),digest(key));
}
export function sessionValue(key:string,at=Date.now()){
 const payload=Buffer.from(JSON.stringify({expires:Math.floor(at/1000)+sessionLifetime,nonce:randomBytes(18).toString('base64url')})).toString('base64url');
 return `${payload}.${createHmac('sha256',key).update(payload).digest('base64url')}`;
}
export function validSession(value:string|undefined,key:string,at=Date.now()){
 if(!value||value.length>400)return false;
 const [payload,signature,extra]=value.split('.');if(!payload||!signature||extra)return false;
 const expected=createHmac('sha256',key).update(payload).digest('base64url');
 if(!matchesAccessKey(signature,expected))return false;
 try{const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return Number.isInteger(data.expires)&&data.expires>Math.floor(at/1000)&&data.expires<=Math.floor(at/1000)+sessionLifetime&&typeof data.nonce==='string';}catch{return false;}
}
export function hasSession(req:Request,key:string){
 const value=req.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 return validSession(value,key);
}
export function writeSession(res:Response,key:string,secure:boolean){res.cookie(cookieName,sessionValue(key),{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:sessionLifetime*1000});}
export function clearSession(res:Response,secure:boolean){res.clearCookie(cookieName,{httpOnly:true,secure,sameSite:'lax',path:'/'});}

export class LoginAttempts {
 private attempts=new Map<string,{count:number;until:number}>();
 blocked(ip:string,at=Date.now()){const entry=this.attempts.get(ip);return Boolean(entry&&entry.until>at&&entry.count>=8);}
 failed(ip:string,at=Date.now()){
  for(const [id,entry]of this.attempts)if(entry.until<=at)this.attempts.delete(id);
  if(this.attempts.size>=1000&&!this.attempts.has(ip))this.attempts.delete(this.attempts.keys().next().value!);
  const previous=this.attempts.get(ip);this.attempts.set(ip,{count:(previous?.count??0)+1,until:previous?.until??at+15*60*1000});
 }
 reset(ip:string){this.attempts.delete(ip);}
}
