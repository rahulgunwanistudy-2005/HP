import {Store} from '../server/db.ts';
import {seed} from '../server/repository.ts';
import {synchronizeReviewedSeed} from './update-reviewed-seed.ts';
import {startServer,serverConfiguration} from '../server/index.ts';
const config=serverConfiguration(),target=new Store(config.databasePath),reviewed=new Store(':memory:');
try{seed(reviewed);synchronizeReviewedSeed(target,reviewed);}finally{reviewed.close();target.close();}
const running=await startServer(config);
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{void running.stop().catch(()=>{process.exitCode=1;});});
