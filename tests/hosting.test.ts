import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/db.ts';
import {seed} from '../server/repository.ts';
import {createApp} from '../server/app.ts';
import {sessionValue,validSession,LoginAttempts} from '../server/auth.ts';
import relay from '../api/[...path].ts';

const key='fictional-hosting-test-key-at-least-32-characters';
test('workspace sessions expire, reject tampering and rotate with the owner key',()=>{
 const at=Date.now(),value=sessionValue(key,at);
 assert.equal(validSession(value,key,at),true);
 assert.equal(validSession(value,key,at+8*60*60*1000),false);
 assert.equal(validSession(value+'tampered',key,at),false);
 assert.equal(validSession(value,'different-key',at),false);
 assert.equal(validSession('malformed',key,at),false);
 const attempts=new LoginAttempts();for(let i=0;i<8;i++)attempts.failed('fixture',at);
 assert.equal(attempts.blocked('fixture',at),true);
 assert.equal(attempts.blocked('fixture',at+15*60*1000),false);
 attempts.failed('fixture',at+15*60*1000);assert.equal(attempts.blocked('fixture',at+15*60*1000),false);
});

test('hosted sign-in protects data, exports and writes while allowing a minimal health probe',{skip:process.env.RUN_HTTP_TESTS!=='1'},async()=>{
 const names=['API_TOKEN','NODE_ENV','CLIENT_ORIGINS','RENDER'] as const,saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 process.env.API_TOKEN=key;process.env.NODE_ENV='production';process.env.CLIENT_ORIGINS='https://workspace.example';process.env.RENDER='true';
 const store=new Store(':memory:');seed(store);const {app}=createApp(store),server=app.listen(0,'127.0.0.1');
 await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 const address=server.address() as {port:number},base=`http://127.0.0.1:${address.port}`;
 const login=(accessKey:string,origin='https://workspace.example')=>fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({key:accessKey})});
 try{
  const health=await fetch(base+'/healthz');assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ok'});
  for(const path of ['/api/bootstrap','/api/accounts','/api/exports/opportunities?format=csv'])assert.equal((await fetch(base+path)).status,401,path);
  assert.equal((await login(key,'https://hostile.example')).status,403);
  assert.equal((await login('wrong')).status,401);
  const signed=await login(key);assert.equal(signed.status,200);const setCookie=signed.headers.get('set-cookie')!;
  assert.match(setCookie,/HttpOnly/i);assert.match(setCookie,/Secure/i);assert.match(setCookie,/SameSite=Lax/i);assert.doesNotMatch(setCookie,new RegExp(key));
  const cookie=setCookie.split(';')[0],headers={Cookie:cookie};
  const bootstrap=await fetch(base+'/api/bootstrap',{headers});assert.equal(bootstrap.status,200);assert.equal((await bootstrap.json()).authenticationRequired,true);
  const exportResult=await fetch(base+'/api/exports/opportunities?format=csv',{headers});assert.equal(exportResult.status,200);assert.match(await exportResult.text(),/source_dates/);
  const write=await fetch(base+'/api/accounts/micron',{method:'PATCH',headers:{...headers,'Content-Type':'application/json',Origin:'https://workspace.example'},body:JSON.stringify({legalEntity:'FICTIONAL temporary test entity'})});assert.equal(write.status,200);
  const rejected=await fetch(base+'/api/accounts/micron',{method:'PATCH',headers:{...headers,'Content-Type':'application/json',Origin:'https://hostile.example'},body:JSON.stringify({legalEntity:'FICTIONAL forbidden change'})});assert.equal(rejected.status,403);
  assert.equal((await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie+'invalid'}})).status,401);
  assert.equal((await fetch(base+'/api/bootstrap',{headers:{Authorization:'Bearer '+key}})).status,200);
  const logout=await fetch(base+'/api/auth/logout',{method:'POST',headers:{...headers,Origin:'https://workspace.example'}});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie')!,/Expires=Thu, 01 Jan 1970/);
  for(let i=0;i<8;i++)assert.equal((await login('wrong')).status,401);
  assert.equal((await login(key)).status,429);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}}
});

test('Vercel relay preserves authentication and export headers without exposing a server access key',async()=>{
 const savedOrigin=process.env.RENDER_API_URL,originalFetch=globalThis.fetch;
 try{
  delete process.env.RENDER_API_URL;assert.equal((await relay.fetch(new Request('https://workspace.example/api/bootstrap'))).status,503);
  process.env.RENDER_API_URL='http://untrusted.example';assert.equal((await relay.fetch(new Request('https://workspace.example/api/bootstrap'))).status,503);
  process.env.RENDER_API_URL='https://fixture.onrender.com';
  let calls=0;
  globalThis.fetch=async(input,init)=>{
   calls++;assert.equal(String(input),'https://fixture.onrender.com/api/auth/login?check=1');assert.equal(init?.method,'POST');
   const headers=new Headers(init?.headers);assert.equal(headers.get('origin'),'https://workspace.example');assert.equal(headers.get('cookie'),'hp_workspace_session=fixture');assert.equal(headers.get('x-untrusted'),null);
   assert.equal(Buffer.from(init?.body as ArrayBuffer).toString(),'{"key":"fixture"}');
   return new Response('fixture export',{headers:{'Set-Cookie':'hp_workspace_session=signed; HttpOnly; Secure; SameSite=Lax','Content-Disposition':'attachment; filename="fixture.csv"','Content-Encoding':'gzip','Content-Length':'999'}});
  };
  const result=await relay.fetch(new Request('https://workspace.example/api/auth/login?check=1',{method:'POST',headers:{Origin:'https://workspace.example',Cookie:'hp_workspace_session=fixture','Content-Type':'application/json','X-Untrusted':'ignore'},body:'{"key":"fixture"}'}));
  assert.equal(result.status,200);assert.equal(await result.text(),'fixture export');assert.match(result.headers.get('set-cookie')!,/HttpOnly/);assert.match(result.headers.get('content-disposition')!,/fixture.csv/);assert.equal(result.headers.get('content-encoding'),null);assert.equal(result.headers.get('content-length'),null);assert.equal(result.headers.get('cache-control'),'no-store');
  assert.equal((await relay.fetch(new Request('https://workspace.example/elsewhere'))).status,404);assert.equal(calls,1);
  globalThis.fetch=async()=>{throw new Error('private backend diagnostic');};const unavailable=await relay.fetch(new Request('https://workspace.example/api/bootstrap'));assert.equal(unavailable.status,503);assert.doesNotMatch(await unavailable.text(),/private backend diagnostic/);
 }finally{globalThis.fetch=originalFetch;if(savedOrigin===undefined)delete process.env.RENDER_API_URL;else process.env.RENDER_API_URL=savedOrigin;}
});
