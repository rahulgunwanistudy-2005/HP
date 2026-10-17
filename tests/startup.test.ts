import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {serverConfiguration} from '../server/index.ts';

const directory=resolve(new URL('..',import.meta.url).pathname);
function child(entry:string,env:NodeJS.ProcessEnv){const processChild=spawn(process.execPath,['--import','tsx',entry],{cwd:directory,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';processChild.stdout!.on('data',chunk=>stdout+=chunk);processChild.stderr!.on('data',chunk=>stderr+=chunk);const exited=new Promise<{code:number|null;signal:string|null;stdout:string;stderr:string}>((resolveExit,reject)=>{const deadline=setTimeout(()=>{processChild.kill('SIGKILL');reject(new Error('Startup test child did not terminate within 8 seconds'));},8000);processChild.once('error',error=>{clearTimeout(deadline);reject(error);});processChild.once('exit',(code,signal)=>{clearTimeout(deadline);resolveExit({code,signal,stdout,stderr});});});return{process:processChild,exited,output:()=>({stdout,stderr})};}
async function freePort(){const server=createServer();await new Promise<void>((resolveReady,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolveReady);});return{server,port:(server.address() as any).port as number};}
async function ready(processChild:ChildProcess,output:()=>{stdout:string;stderr:string}){const deadline=Date.now()+6000;while(Date.now()<deadline){const value=output();if(value.stdout.includes('HP Account Intelligence →'))return;if(processChild.exitCode!==null||processChild.signalCode!==null)throw new Error(`Server exited before ready: ${value.stderr}`);await new Promise(resolveWait=>setTimeout(resolveWait,20));}throw new Error('Server never reported successful startup');}

test('server configuration validates port, host, public token and durable database settings without starting anything',()=>{
  assert.deepEqual(serverConfiguration({}),{host:'127.0.0.1',port:3001,databasePath:'storage/intelligence.sqlite'});assert.equal(serverConfiguration({PORT:'3012',HOST:'::1',DATABASE_PATH:':memory:'}).port,3012);assert.equal(serverConfiguration({PORT:' 3012 ',HOST:' LOCALHOST '}).host,'localhost');
  for(const port of ['','0','-1','65536','NaN','3001.5','3e3','Infinity','127.0.0.1:3001'])assert.throws(()=>serverConfiguration({PORT:port}),/PORT/,port);
  for(const host of ['','http://127.0.0.1','localhost:3001','host/path','bad host','-invalid','[::1]'])assert.throws(()=>serverConfiguration({HOST:host}),/HOST/,host);
  assert.throws(()=>serverConfiguration({HOST:'0.0.0.0'}),/API_TOKEN/);assert.equal(serverConfiguration({HOST:'0.0.0.0',API_TOKEN:'fictional-test-token-at-least-thirty-two-characters'}).host,'0.0.0.0');assert.throws(()=>serverConfiguration({DATABASE_PATH:''}),/DATABASE_PATH/);
});

test('invalid server and development configuration exits nonzero before claiming readiness',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'hp-startup-invalid-'));try{for(const entry of ['server/index.ts','scripts/dev.ts']){const run=child(entry,{HOST:'127.0.0.1',PORT:'invalid',DATABASE_PATH:join(folder,'test.sqlite')});const result=await run.exited;assert.equal(result.code,1,entry);assert.match(result.stderr,/PORT must be/);assert.doesNotMatch(result.stdout,/HP Account Intelligence →/);}}finally{rmSync(folder,{recursive:true,force:true});}
});

test('occupied API port fails startup and dev supervision nonzero with no false ready message',{skip:process.env.RUN_HTTP_TESTS!=='1'},async()=>{
  const occupied=await freePort(),folder=mkdtempSync(join(tmpdir(),'hp-startup-conflict-'));try{for(const entry of ['server/index.ts','scripts/dev.ts']){const run=child(entry,{HOST:'127.0.0.1',PORT:String(occupied.port),DATABASE_PATH:join(folder,entry.startsWith('server')?'api.sqlite':'dev.sqlite'),API_TOKEN:''});const result=await run.exited;assert.equal(result.code,1,entry);assert.match(result.stderr,/EADDRINUSE|address already in use/);assert.doesNotMatch(result.stdout,/HP Account Intelligence →/);if(entry==='scripts/dev.ts')assert.match(result.stderr,/Development server stopped/);}}finally{await new Promise<void>(resolveClosed=>occupied.server.close(()=>resolveClosed()));rmSync(folder,{recursive:true,force:true});}
});

test('successful startup reports only the actual listener, serves health and gracefully releases its port',{skip:process.env.RUN_HTTP_TESTS!=='1'},async()=>{
  const reservation=await freePort(),port=reservation.port;await new Promise<void>(resolveClosed=>reservation.server.close(()=>resolveClosed()));const folder=mkdtempSync(join(tmpdir(),'hp-startup-success-')),run=child('server/index.ts',{HOST:'127.0.0.1',PORT:String(port),DATABASE_PATH:join(folder,'fixture.sqlite'),API_TOKEN:''});try{await ready(run.process,run.output);assert.match(run.output().stdout,new RegExp(`http://127\\.0\\.0\\.1:${port}`));const response=await fetch(`http://127.0.0.1:${port}/api/health`);assert.equal(response.status,200);assert.equal((await response.json()).status,'ok');run.process.kill('SIGTERM');const result=await run.exited;assert.equal(result.code,0);const released=createServer();await new Promise<void>((resolveReady,reject)=>{released.once('error',reject);released.listen(port,'127.0.0.1',resolveReady);});await new Promise<void>(resolveClosed=>released.close(()=>resolveClosed()));}finally{if(run.process.exitCode===null&&run.process.signalCode===null)run.process.kill('SIGKILL');rmSync(folder,{recursive:true,force:true});}
});
