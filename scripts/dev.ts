import {spawn,type ChildProcess} from 'node:child_process';
import {existsSync,watch,type FSWatcher} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {serverConfiguration} from '../server/index.ts';

/** Vite handles UI HMR; this supervisor restarts backend code and propagates every startup failure. */
export function startDevelopment(){
  serverConfiguration(); // Fail before either long-lived child starts when configuration is invalid.
  const children=new Set<ChildProcess>(),expectedExits=new Set<ChildProcess>(),watchers:FSWatcher[]=[];let closing=false,backend:ChildProcess|undefined,restartPending=false,restartTimer:ReturnType<typeof setTimeout>|undefined,changeTimer:ReturnType<typeof setTimeout>|undefined;
  const close=(code=0)=>{
    if(closing)return;closing=true;process.exitCode=code;for(const watcher of watchers)watcher.close();if(changeTimer)clearTimeout(changeTimer);if(restartTimer)clearTimeout(restartTimer);
    for(const child of children)child.kill('SIGTERM');
    const force=setTimeout(()=>{for(const child of children)child.kill('SIGKILL');},2500);force.unref();
  };
  const launch=(name:string,args:string[])=>{
    const child=spawn(process.execPath,args,{stdio:'inherit'});children.add(child);
    child.once('error',error=>{console.error(`${name} could not start: ${error.message}`);children.delete(child);close(1);});
    child.once('exit',(code,signal)=>{
      children.delete(child);
      if(expectedExits.delete(child)){if(restartTimer)clearTimeout(restartTimer);restartTimer=undefined;if(!closing){restartPending=false;backend=launchBackend();}return;}
      if(!closing){console.error(`${name} exited unexpectedly (${signal??code??'unknown status'}). Development server stopped.`);close(typeof code==='number'&&code>0?code:1);}
    });return child;
  };
  const launchBackend=()=>launch('HP API',['--import','tsx','server/index.ts']);
  const restart=()=>{
    if(closing||restartPending)return;
    if(!backend||backend.exitCode!==null||backend.signalCode!==null){backend=launchBackend();return;}
    restartPending=true;const previous=backend;expectedExits.add(previous);console.log('Backend code changed; restarting HP API.');previous.kill('SIGTERM');restartTimer=setTimeout(()=>previous.kill('SIGKILL'),2200);restartTimer.unref();
  };
  const watcher=watch(resolve('server'),{recursive:true},(_event,filename)=>{
    if(filename&&!/\.(?:ts|mjs|js|json|sql)$/.test(String(filename)))return;if(changeTimer)clearTimeout(changeTimer);changeTimer=setTimeout(restart,150);
  });watcher.on('error',error=>{console.error(`Backend file watcher failed: ${error.message}`);close(1);});watchers.push(watcher);
  backend=launchBackend();launch('Vite',['node_modules/vite/bin/vite.js','--host','127.0.0.1']);
  process.on('SIGINT',()=>close(0));process.on('SIGTERM',()=>close(0));
  return{close};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(existsSync('.env'))process.loadEnvFile('.env');startDevelopment();}catch(error){console.error(`Development server failed to start: ${(error as Error).message}`);process.exitCode=1;}
}
