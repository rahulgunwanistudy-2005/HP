import {Store} from '../server/db.ts';
import {seed,Repository} from '../server/repository.ts';
const store=new Store();seed(store);console.log(JSON.stringify(new Repository(store).metrics(),null,2));store.close();
