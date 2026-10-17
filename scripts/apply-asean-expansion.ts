import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store,now} from '../server/db.ts';
import {Repository,seed} from '../server/repository.ts';
import {synchronizeReviewedSeed} from './update-reviewed-seed.ts';

/** Apply this user's explicit scope clarification once; later analyst changes take precedence. */
export function configureAseanTerritory(store:Store){
  if(store.meta('aseanTerritoryApplied'))return false;
  const preset=JSON.parse(readFileSync(new URL('../data/territory.json',import.meta.url),'utf8'));
  store.transaction(()=>{
    const old=store.get('territories','primary');
    const territory={...preset,id:'primary',version:(old?.version??0)+1,updatedAt:now()};
    store.meta('territoryHistory',[...(store.meta('territoryHistory')??[]),{territory:old,changedAt:now(),basis:'User clarified major ASEAN economies on 17 October 2026'}]);
    store.run('UPDATE territories SET version=?,data=? WHERE id=?',territory.version,JSON.stringify(territory),'primary');
    store.meta('aseanTerritoryApplied',{at:now(),countries:preset.countries,authorization:preset.verificationBasis});
    new Repository(store).snapshots();
  });
  return true;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const target=new Store(),reviewed=new Store(':memory:');
  try{seed(reviewed);const report=synchronizeReviewedSeed(target,reviewed);const territoryUpdated=configureAseanTerritory(target);console.log(JSON.stringify({report,territoryUpdated,metrics:new Repository(target).metrics(),foreignKeyViolations:target.all('PRAGMA foreign_key_check')},null,2));}finally{target.close();reviewed.close();}
}
