import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store,now,uid,type RecordData} from '../server/db.ts';
import {seed,Repository} from '../server/repository.ts';
import {synchronizeReviewedSeed} from './update-reviewed-seed.ts';

/** Apply this reviewed research once, preserving originals in the qualification audit. */
export function applyQualificationResearch(store:Store){
 const research=JSON.parse(readFileSync(new URL('../data/qualification-research.json',import.meta.url),'utf8'));
 if(store.meta('qualificationResearchVersion')===research.version)return{alreadyApplied:true};
 const reviewed=new Store(':memory:');seed(reviewed);
 try{
  const beforeSync=new Map(store.list('opportunities').map(o=>[o.id,o]));
  const linksBeforeSync=store.all('SELECT * FROM opportunity_evidence');
  const sync=synchronizeReviewedSeed(store,reviewed),at=now(),report={at,sync,reviewedOpportunities:0,publicAccessAssessed:0,sourceRelationshipsReviewed:[] as string[]};
  store.transaction(()=>{
   for(const current of store.list('opportunities')){
    const desired=reviewed.get('opportunities',current.id);if(!desired)continue;
    const patch=research.opportunityUpdates[current.id],isNew=Object.values(research.newOpportunities).flat().some((o:any)=>o.id===current.id);
    const after:RecordData={...current};
    if(patch){
     for(const [key,value]of Object.entries(patch))if(!['eventEvidenceIds','dimensions'].includes(key))after[key]=value;
     after.dimensions={...current.dimensions,...patch.dimensions};
     after.eventId=desired.eventId;
     // Only explicitly researched relationships change; both source versions and prior links remain in the audit.
     const previousLinks=linksBeforeSync.filter(link=>link.opportunity_id===current.id);
     store.run('DELETE FROM opportunity_evidence WHERE opportunity_id=?',current.id);
     for(const [key,relation]of [['evidenceIds','supports'],['contextIds','context'],['contradictionIds','contradicts']])for(const id of after[key]??[])store.run('INSERT OR IGNORE INTO opportunity_evidence VALUES (?,?,?)',current.id,id,relation);
     const event=store.get('events',after.eventId)!;
     const eventIds=patch.eventEvidenceIds??desired.eventEvidenceIds??desired.evidenceIds;
     store.run('DELETE FROM event_evidence WHERE event_id=?',after.eventId);
     for(const id of eventIds)store.run('INSERT OR IGNORE INTO event_evidence VALUES (?,?)',after.eventId,id);
     store.run('UPDATE events SET data=? WHERE id=?',JSON.stringify({...event,evidenceIds:eventIds,qualificationReviewedAt:at}),after.eventId);
     after.qualificationRelationshipReview={at,previousLinks,reason:patch.qualificationNote};
     report.sourceRelationshipsReviewed.push(current.id);report.reviewedOpportunities++;
    }
    if(desired.publicAccessAssessment?.status==='published_process'){
     after.publicAccessAssessment=desired.publicAccessAssessment;
     if(after.dimensions?.access==null)after.dimensions={...after.dimensions,access:2};
     if(beforeSync.get(current.id)?.dimensions?.access==null&&after.dimensions?.access===2)report.publicAccessAssessed++;
    }
    if(patch||isNew||JSON.stringify(beforeSync.get(current.id))!==JSON.stringify(after)){
     after.qualificationReviewedAt=at;
     store.run('UPDATE opportunities SET event_id=?,data=? WHERE id=?',after.eventId,JSON.stringify(after),after.id);
     store.run('INSERT INTO analyst_notes VALUES (?,?,?,?,?)',uid('qualification'),after.accountId,after.id,at,JSON.stringify({kind:'qualification-research-audit',author:'Public-source research review',createdAt:at,text:patch?.qualificationNote??'Published company supplier process assessed separately from HP eligibility and financial approval. No equipment demand, quantities or budget inferred.',before:beforeSync.get(current.id)??null,after,sourceUrls:(after.buyingContext??store.get('accounts',after.accountId)?.buyingProfile)?.sources?.map((s:any)=>s.url)??[]}));
    }
   }
   const thk=store.list('competitive_constraints','WHERE opportunity_id=?','thk-print-procurement');
   for(const b of thk)if(b.description==='Territory remains unverified.')store.run('UPDATE competitive_constraints SET data=? WHERE id=?',JSON.stringify({...b,description:'ASEAN-6 operating territory is configured; HP account ownership and seller authorization remain separate checks.',qualificationReviewedAt:at,previousDescription:b.description}),b.id);
   store.meta('qualificationResearchVersion',research.version);store.meta('qualificationResearchReport',report);new Repository(store).snapshots();
  });return report;
 }finally{reviewed.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const store=new Store();try{console.log(JSON.stringify(applyQualificationResearch(store),null,2));}finally{store.close();}}
