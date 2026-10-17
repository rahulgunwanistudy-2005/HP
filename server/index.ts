import {existsSync} from 'node:fs';
import {isIP} from 'node:net';
import type {Server} from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store,databaseSettings} from './db.ts';
import {seed} from './repository.ts';
import {createApp} from './app.ts';

export type ServerConfiguration={host:string;port:number;databasePath:string};
export function serverConfiguration(env:NodeJS.ProcessEnv=process.env):ServerConfiguration {
  databaseSettings(env);
  const host=env.HOST?.trim().toLowerCase()??'127.0.0.1',rawPort=env.PORT?.trim()??'3001',databasePath=env.DATABASE_PATH??'storage/intelligence.sqlite';
  if(!host||!(isIP(host)||/^(?=.{1,253}$)[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)*$/i.test(host)))throw new Error('HOST must be a valid IP address or hostname without a scheme, path or port.');
  if(!/^\d+$/.test(rawPort)||!Number.isSafeInteger(Number(rawPort))||Number(rawPort)<1||Number(rawPort)>65535)throw new Error('PORT must be an integer from 1 to 65535.');
  if(!databasePath.trim()||databasePath.includes('\0'))throw new Error('DATABASE_PATH must be a nonempty SQLite file path (or :memory: for isolated tests).');
  if(!['127.0.0.1','localhost','::1'].includes(host)&&(env.API_TOKEN?.length??0)<32)throw new Error('Non-loopback deployment requires API_TOKEN of at least 32 characters and HTTPS for workspace sign-in. See docs/deployment.md.');
  return{host,port:Number(rawPort),databasePath};
}

export async function startServer(config=serverConfiguration()){
  const store=new Store(config.databasePath);let listener:Server|undefined,queue:ReturnType<typeof createApp>['queue']|undefined;
  try{
    seed(store);const application=createApp(store);queue=application.queue;
    listener=application.app.listen(config.port,config.host);
    // Express 5 also invokes its listen callback on errors. Only the listening event proves readiness.
    await new Promise<void>((resolveReady,reject)=>{
      const failed=(error:Error)=>{listener!.off('listening',ready);reject(error);};
      const ready=()=>{listener!.off('error',failed);resolveReady();};
      listener!.once('error',failed);listener!.once('listening',ready);
    });
    queue.start();
    const address=listener.address(),actualPort=address&&typeof address==='object'?address.port:config.port,urlHost=config.host.includes(':')?`[${config.host}]`:config.host;
    console.log(`HP Account Intelligence → http://${urlHost}:${actualPort}`);
    const activeServer=listener,activeQueue=queue;let stopping:Promise<void>|undefined;
    const stop=()=>stopping??=(async()=>{
      activeQueue.stop();
      await new Promise<void>(resolveClosed=>{
        const force=setTimeout(()=>{activeServer.closeAllConnections();resolveClosed();},2000);force.unref();
        activeServer.close(()=>{clearTimeout(force);resolveClosed();});
      });
      const queueDeadline=Date.now()+2000;while(activeQueue.busy&&Date.now()<queueDeadline)await new Promise(resolveIdle=>setTimeout(resolveIdle,20));
      store.close();
    })();
    activeServer.on('error',error=>{console.error(`HP Account Intelligence server error: ${error.message}`);process.exitCode=1;void stop();});
    return{...application,server:activeServer,stop,config:{...config,port:actualPort}};
  }catch(error){queue?.stop();if(listener?.listening)listener.close();store.close();throw error;}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(existsSync('.env'))process.loadEnvFile('.env');
    const running=await startServer();
    const shutdown=()=>{void running.stop().catch(error=>{console.error(`HP Account Intelligence shutdown failed: ${(error as Error).message}`);process.exitCode=1;});};
    process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
  }catch(error){console.error(`HP Account Intelligence failed to start: ${(error as Error).message}`);process.exitCode=1;}
}
