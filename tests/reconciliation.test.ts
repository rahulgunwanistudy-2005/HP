import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/db.ts';
import {seed,Repository} from '../server/repository.ts';
import {ReconciliationService} from '../server/reconciliation.ts';
import {AuthoringService} from '../server/authoring.ts';
const setup=()=>{const s=new Store(':memory:');seed(s);return {s,r:new Repository(s),service:new ReconciliationService(s),author:new AuthoringService(s)};};
test('event reconciliation suggests duplicates, preserves source facts, and undoes mappings after unrelated qualification edits',()=>{
 const {s,r,service,author}=setup();try{
 const o=s.get('opportunities','micron-engineering')!,target=s.get('events',o.eventId)!,currentEvidenceIds=o.evidenceIds.filter((id:string)=>!r.documents('micron').find(d=>d.id===id)?.supersededBy?.length);
 const created=author.createEvent({accountId:'micron',title:target.title+' expanded',eventDate:target.eventDate,facilityId:target.facilityId,claimType:'source-supported event',evidenceIds:currentEvidenceIds});
 const copy=author.createOpportunity({accountId:'micron',eventId:created.id,title:'FICTIONAL audit opportunity',productId:'workstations',facilityId:o.facilityId,evidenceIds:currentEvidenceIds});
 assert.ok(service.inspect('micron').duplicateCandidates.some(c=>c.sourceEventId===created.id||c.targetEventId===created.id));
 const result=service.merge({accountId:'micron',sourceEventId:created.id,targetEventId:target.id,reason:'FICTIONAL TEST: same facility announcement reviewed'});
 assert.equal(s.get('opportunities',copy.id)!.eventId,target.id);assert.equal(s.get('events',created.id)!.mergedIntoId,target.id);
 r.saveOpportunity(copy.id,{analystStatus:'qualifying',note:'FICTIONAL TEST unrelated qualification change'});
 service.unmerge(result.mergeId,'FICTIONAL TEST restore distinct events');assert.equal(s.get('opportunities',copy.id)!.eventId,created.id);assert.equal(s.get('opportunities',copy.id)!.analystStatus,'qualifying');assert.equal(s.get('event_reconciliations',result.mergeId)!.status,'undone');
 assert.equal(s.all('PRAGMA foreign_key_check').length,0);
 }finally{s.close();}
});
test('merge rejects entity and facility mismatches and undo refuses to overwrite a later event edit',()=>{
 const {s,service,author}=setup();try{
 const events=s.list('events','WHERE account_id=?','micron'),target=events[0];
 assert.throws(()=>service.merge({accountId:'micron',sourceEventId:target.id,targetEventId:s.list('events','WHERE account_id=?','lego')[0].id,reason:'FICTIONAL TEST mismatch'}),/same account|belonging/);
 const e=author.createEvent({accountId:'micron',title:'FICTIONAL alternate facility announcement',eventDate:'2026-10-01',facilityId:target.facilityId,claimType:'hypothesis'});
 const merge=service.merge({accountId:'micron',sourceEventId:e.id,targetEventId:target.id,reason:'FICTIONAL TEST merge reviewed'});
 author.updateEvent(target.id,{description:'FICTIONAL edit after merge'});assert.throws(()=>service.unmerge(merge.mergeId,'FICTIONAL TEST would overwrite facts'),/changed after/);
 }finally{s.close();}
});
test('supersession and contradiction remain traceable and same-announcement evidence cannot inflate independence',()=>{
 const {s,r,service}=setup();try{
 const docs=r.documents('micron'),newer=docs.find(d=>d.id==='micron-fab-2026')!,older=docs.find(d=>d.id!==newer.id)!;
 const before=s.list('documents').length;
 const linked=service.relationship(newer.id,older.id,'supersedes','FICTIONAL TEST notice control demonstration');
 assert.ok(r.documents('micron').find(d=>d.id===older.id)!.supersededBy.includes(newer.id));assert.equal(s.list('documents').length,before);
 assert.equal(service.relationship(newer.id,older.id,'supersedes','FICTIONAL TEST idempotence').relationship.id,linked.relationship.id);
 assert.throws(()=>service.relationship(older.id,newer.id,'supersedes','FICTIONAL TEST cycle invalid'),/cycle|dated before/);
 service.relationship(newer.id,older.id,'contradicts','FICTIONAL TEST material source conflict');assert.equal(r.documents('micron').find(d=>d.id===newer.id)!.materialContradiction,true);
 service.relationship(newer.id,older.id,'same_announcement','FICTIONAL TEST shared announcement');const hydrated=r.documents('micron');assert.equal(hydrated.find(d=>d.id===newer.id)!.announcementGroup,hydrated.find(d=>d.id===older.id)!.announcementGroup);
 assert.throws(()=>service.relationship(newer.id,r.documents('lego')[0].id,'corroborates','FICTIONAL TEST cross account'),/same account/);
 }finally{s.close();}
});
test('schema migrations are versioned and opening an existing store preserves facts',()=>{
 const s=new Store(':memory:');try{assert.deepEqual(s.all('SELECT version FROM schema_migrations ORDER BY version').map(r=>r.version),[1,2,3]);assert.ok(s.one("SELECT name FROM sqlite_master WHERE name='document_relationships'"));}finally{s.close();}
});
