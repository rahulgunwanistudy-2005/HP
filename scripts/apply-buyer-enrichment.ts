import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store,now} from '../server/db.ts';
import {workspaceConfig} from '../server/workspace.ts';

/** Attach new source-supported buyer context without overwriting analyst edits or source chronology. */
export function applyBuyerEnrichment(store:Store){
  const profiles=JSON.parse(readFileSync(new URL('../data/buying-organizations.json',import.meta.url),'utf8')).profiles;
  const report={enriched:0,archived:0,preservedFields:0,at:now()};
  store.transaction(()=>{
    for(const account of store.list('accounts')){
      if(workspaceConfig.archivedReferenceAccountIds.includes(account.id)){
        if(!account.archived){account.archived=true;account.archivedAt=now();account.archiveReason='User removed USA and Canada reference cases from the prospect workspace.';report.archived++;}
      }else if(profiles[account.id]&&profiles[account.id].domain===account.domain){
        const profile=profiles[account.id];account.buyingProfile=profile;
        for(const [field,value] of [['legalEntity',profile.operatingEntity],['purchasingOrganization',profile.procurementTeam]]){
          if(!account.editedAt||!account[field]||/^(Unverified|Unresolved|Purchasing authority unresolved)/i.test(account[field]))account[field]=value;else report.preservedFields++;
        }
        report.enriched++;
      }
      store.run('UPDATE accounts SET data=? WHERE id=?',JSON.stringify(account),account.id);
    }
    const coverage=store.meta('coverage')??{};coverage.geography={...(coverage.geography??{}),countriesWithReviewedOperatingEvidence:['ID','MY','PH','SG','TH','VN'],limitation:'ASEAN-6 operating-country scope. USA and Canada reference cases are archived outside the active prospect workspace.'};coverage.deepAccounts=5;
    store.meta('coverage',coverage);store.meta('screened',(store.meta('screened')??[]).filter((a:any)=>!['US','CA'].includes(a.country)&&!['ePac Flexible Packaging','DreamWorks Animation'].includes(a.name)));
    store.meta('buyerEnrichment',report);store.meta('presentation',workspaceConfig);
  });
  return report;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const store=new Store();try{console.log(JSON.stringify(applyBuyerEnrichment(store),null,2));}finally{store.close();}
}
