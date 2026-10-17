import {Store,now,uid,type RecordData} from './db.ts';
import {Repository} from './repository.ts';
import {resolveEntity,eventClusterKey} from './intelligence.ts';

export class ReconciliationError extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
const fail=(message:string,code='RECONCILIATION_CONFLICT',status=409):never=>{throw new ReconciliationError(status,code,message);};
const mappingKeys=['eventId','eventTitle','eventDate','facilityId','facilityCountry'];
const mapping=(o:RecordData)=>Object.fromEntries(mappingKeys.map(k=>[k,o[k]??null]));
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const titleTokens=(title:string)=>new Set(title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').split(' ').filter(w=>w.length>2&&!['the','and','for','new','with','from','its','into'].includes(w)));
export function eventSimilarity(a:RecordData,b:RecordData){
 const x=titleTokens(a.title??''),y=titleTokens(b.title??''),intersection=[...x].filter(w=>y.has(w)).length;
 return intersection/(new Set([...x,...y]).size||1);
}
export class ReconciliationService {
 repo:Repository; constructor(public store:Store){this.repo=new Repository(store);}
 require(table:string,id:string){const r=this.store.get(table,id);if(!r)fail('Record not found','NOT_FOUND',404);return r!;}
 inspect(accountId:string){
  const account=this.require('accounts',accountId),events:RecordData[]=this.store.list('events','WHERE account_id=?',accountId).map(e=>({...e,evidenceIds:this.store.all('SELECT document_id FROM event_evidence WHERE event_id=?',e.id).map(x=>x.document_id)}));
  const live=events.filter(e=>!e.mergedIntoId),duplicateCandidates:RecordData[]=[];
  for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){
   const a=live[i],b=live[j];if(a.facilityId&&b.facilityId&&a.facilityId!==b.facilityId)continue;
   const overlap=a.evidenceIds.some((id:string)=>b.evidenceIds.includes(id)),similarity=eventSimilarity(a,b);
   const delta=Math.abs(Date.parse(a.eventDate)-Date.parse(b.eventDate))/86400000;
   if((similarity>=.42||overlap&&similarity>=.2)&&(!Number.isFinite(delta)||delta<=90))duplicateCandidates.push({sourceEventId:a.id,targetEventId:b.id,sourceTitle:a.title,targetTitle:b.title,similarity:Math.round(similarity*100)/100,reasons:[...(overlap?['Shared source document']:[]),`Title token overlap ${Math.round(similarity*100)}%`,a.eventDate===b.eventDate?'Same event date':'Dates require analyst comparison']});
  }
  const other=this.store.list('accounts').filter(a=>a.id!==accountId);
  const entityCandidates=resolveEntity({domain:account.domain,legalName:account.legalEntity,parentId:account.parentId},other);
  return {events,duplicateCandidates,documentRelations:this.store.list('document_relationships','WHERE account_id=? ORDER BY created_at DESC',accountId),entityCandidates,history:this.store.list('event_reconciliations','WHERE account_id=? ORDER BY created_at DESC',accountId)};
 }
 match(candidate:RecordData){return resolveEntity(candidate,this.store.list('accounts'));}
 merge(input:{accountId:string;sourceEventId:string;targetEventId:string;reason:string}){
  const {accountId,sourceEventId,targetEventId,reason}=input,source=this.require('events',sourceEventId),target=this.require('events',targetEventId);
  if(source.id===target.id||source.accountId!==accountId||target.accountId!==accountId)fail('Choose two distinct events belonging to this account.','ENTITY_MISMATCH',400);
  if(source.mergedIntoId||target.mergedIntoId)fail('An event already participates in a merge. Undo that merge before reconciling it again.');
  if(source.facilityId&&target.facilityId&&source.facilityId!==target.facilityId)fail('Events at different facilities require separate attribution and cannot be merged.','FACILITY_MISMATCH',400);
  const opportunities=this.store.list('opportunities','WHERE event_id=?',source.id);
  const allOpportunities=[...opportunities,...this.store.list('opportunities','WHERE event_id=?',target.id)],siteIds=[...new Set([source.facilityId,target.facilityId,...allOpportunities.map(o=>o.facilityId)].filter(Boolean))];
  if(siteIds.length>1)fail('Opportunity deployment sites conflict with the controlling event; reconcile site attribution before merging.','FACILITY_MISMATCH',400);
  const countries=[...new Set([...allOpportunities.map(o=>o.facilityCountry),...siteIds.map(id=>this.require('facilities',id).country)].filter(Boolean))];if(countries.length>1)fail('Opportunity deployment countries conflict; preserve separate event attribution.','FACILITY_MISMATCH',400);
  const facilityId=siteIds[0]??null,facilityCountry=facilityId?this.require('facilities',facilityId).country:countries[0]??null;
  const before=opportunities.map(o=>({id:o.id,fields:mapping(o)}));
  const targetEvidence=this.store.all('SELECT document_id FROM event_evidence WHERE event_id=?',target.id).map(r=>r.document_id),sourceEvidence=this.store.all('SELECT document_id FROM event_evidence WHERE event_id=?',source.id).map(r=>r.document_id);
  const targetClusterBefore=this.store.one('SELECT cluster_key FROM events WHERE id=?',target.id).cluster_key,targetClusterAfter=eventClusterKey(accountId,target.title,target.eventDate??null,facilityId);
  if(this.store.one('SELECT id FROM events WHERE account_id=? AND cluster_key=? AND id NOT IN (?,?)',accountId,targetClusterAfter,source.id,target.id))fail('Another event already occupies the resulting title, date and facility. Reconcile that event first.');
  const mergeId=uid('merge'),at=now(),newSource={...source,mergedIntoId:target.id,mergeId,editedAt:at},newTarget={...target,facilityId,evidenceIds:[...new Set([...targetEvidence,...sourceEvidence])],editedAt:at};
  const after=opportunities.map(o=>({id:o.id,fields:{...mapping(o),eventId:target.id,eventTitle:target.title,eventDate:target.eventDate??null,facilityId,facilityCountry}}));
  const record={id:mergeId,mergeId,accountId,sourceEventId,targetEventId,reason,createdAt:at,status:'active',sourceBefore:source,sourceAfter:newSource,targetBefore:target,targetAfter:newTarget,targetClusterBefore,targetClusterAfter,targetEvidenceBefore:targetEvidence,opportunitiesBefore:before,opportunitiesAfter:after};
  this.store.transaction(()=>{
   this.store.run('UPDATE events SET data=? WHERE id=?',JSON.stringify(newSource),source.id);this.store.run('UPDATE events SET cluster_key=?,data=? WHERE id=?',targetClusterAfter,JSON.stringify(newTarget),target.id);
   for(const item of after){const o=this.require('opportunities',item.id);this.store.run('UPDATE opportunities SET event_id=?,data=? WHERE id=?',target.id,JSON.stringify({...o,...item.fields,editedAt:at,updatedAt:at}),o.id);}
   for(const id of sourceEvidence)this.store.run('INSERT OR IGNORE INTO event_evidence VALUES (?,?)',target.id,id);
   this.store.run('INSERT INTO event_reconciliations VALUES (?,?,?,?,?,?)',mergeId,accountId,source.id,target.id,at,JSON.stringify(record));this.audit(accountId,null,'event_merge',reason,{mergeId,sourceEventId,targetEventId});
   this.repo.snapshots();
  });
  return {...this.inspect(accountId),mergeId};
 }
 unmerge(mergeId:string,reason:string){
  const record=this.require('event_reconciliations',mergeId),source=this.require('events',record.sourceEventId),target=this.require('events',record.targetEventId);
  if(record.status!=='active')fail('This merge has already been undone.');
  if(source.mergeId!==mergeId||record.sourceAfter&&!same(source,record.sourceAfter)||!same(target,record.targetAfter))fail('Event facts changed after this merge. Review the new facts before undoing.');
  for(const after of record.opportunitiesAfter)if(!same(mapping(this.require('opportunities',after.id)),after.fields))fail('An opportunity event mapping changed after this merge; undo would overwrite a later edit.');
  if(record.targetClusterBefore&&this.store.one('SELECT id FROM events WHERE account_id=? AND cluster_key=? AND id<>?',record.accountId,record.targetClusterBefore,target.id))fail('Another event now occupies the pre-merge event key. Review that duplicate before undoing.');
  this.store.transaction(()=>{
   this.store.run('UPDATE events SET data=? WHERE id=?',JSON.stringify(record.sourceBefore),source.id);this.store.run('UPDATE events SET cluster_key=?,data=? WHERE id=?',record.targetClusterBefore??eventClusterKey(record.accountId,record.targetBefore.title,record.targetBefore.eventDate??null,record.targetBefore.facilityId??null),JSON.stringify(record.targetBefore),target.id);
   for(const before of record.opportunitiesBefore){const o=this.require('opportunities',before.id);this.store.run('UPDATE opportunities SET event_id=?,data=? WHERE id=?',before.fields.eventId,JSON.stringify({...o,...before.fields,editedAt:now(),updatedAt:now()}),o.id);}
   this.store.run('DELETE FROM event_evidence WHERE event_id=?',target.id);for(const id of record.targetEvidenceBefore)this.store.run('INSERT INTO event_evidence VALUES (?,?)',target.id,id);
   record.status='undone';record.undoneAt=now();record.undoReason=reason;this.store.run('UPDATE event_reconciliations SET data=? WHERE id=?',JSON.stringify(record),mergeId);
   this.audit(record.accountId,null,'event_unmerge',reason,{mergeId});this.repo.snapshots();
  });return this.inspect(record.accountId);
 }
 relationship(documentId:string,relatedDocumentId:string,type:string,reason:string){
  const d=this.require('documents',documentId),related=this.require('documents',relatedDocumentId);
  if(d.id===related.id||d.accountId!==related.accountId)fail('Relationships require two distinct documents attributed to the same account.','ENTITY_MISMATCH',400);
  if(d.reviewStatus!=='reviewed'||related.reviewStatus!=='reviewed')fail('Review both sources before establishing a material source relationship.','REVIEW_REQUIRED',400);
  if(type==='supersedes'){
   const links=this.store.list('document_relationships').filter(r=>r.type==='supersedes'&&r.status!=='revoked'),pending=[related.id],visited=new Set<string>();
   while(pending.length){const id=pending.pop()!;if(id===d.id)fail('A supersession cycle would invalidate source chronology.');if(visited.has(id))continue;visited.add(id);for(const r of links.filter(r=>r.documentId===id))pending.push(r.relatedDocumentId);}
   const newer=Date.parse(d.publishedAt??''),older=Date.parse(related.publishedAt??'');
   if(Number.isFinite(newer)&&Number.isFinite(older)&&newer<older)fail('The superseding notice is dated before the notice it would replace. Check the direction.','CHRONOLOGY_CONFLICT',400);
  }
  const existing=this.store.list('document_relationships','WHERE document_id=? AND related_document_id=? AND relation=?',d.id,related.id,type)[0];
  const record=existing?.status==='revoked'?{...existing,status:'active',reason,reactivatedAt:now(),history:[...(existing.history??[]),{status:existing.status,reason:existing.reason,revokedAt:existing.revokedAt}]}:existing??{id:uid('relationship'),accountId:d.accountId,documentId:d.id,relatedDocumentId:related.id,type,reason,status:'active',createdAt:now()};
  const affectedOpportunityIds=[...new Set(this.store.all('SELECT opportunity_id FROM opportunity_evidence WHERE document_id IN (?,?)',d.id,related.id).map(r=>r.opportunity_id))];
  if(!existing||existing.status==='revoked')this.store.transaction(()=>{
   if(existing)this.store.run('UPDATE document_relationships SET data=? WHERE id=?',JSON.stringify(record),record.id);else this.store.run('INSERT INTO document_relationships VALUES (?,?,?,?,?,?,?)',record.id,d.accountId,d.id,related.id,type,record.createdAt,JSON.stringify(record));
   this.audit(d.accountId,null,'source_relationship',reason,{relationshipId:record.id,documentId:d.id,relatedDocumentId:related.id,type,affectedOpportunityIds});this.repo.snapshots();
  });
  return {document:this.repo.documents(d.accountId).find(x=>x.id===d.id),relationship:record,affectedOpportunityIds};
 }
 revoke(relationshipId:string,reason:string){
  const before=this.require('document_relationships',relationshipId);
  const affectedOpportunityIds=[...new Set(this.store.all('SELECT opportunity_id FROM opportunity_evidence WHERE document_id IN (?,?)',before.documentId,before.relatedDocumentId).map(r=>r.opportunity_id))];
  const record={...before,status:'revoked',revokedAt:now(),revokeReason:reason,history:[...(before.history??[]),{status:before.status,reason:before.reason,recordedAt:now()}]};
  if(before.status!=='revoked')this.store.transaction(()=>{this.store.run('UPDATE document_relationships SET data=? WHERE id=?',JSON.stringify(record),before.id);this.audit(before.accountId,null,'source_relationship_revoked',reason,{relationshipId,documentId:before.documentId,relatedDocumentId:before.relatedDocumentId,before,after:record});this.repo.snapshots();});
  return {document:this.repo.documents(before.accountId).find(d=>d.id===before.documentId),relationship:before.status==='revoked'?before:record,affectedOpportunityIds};
 }
 audit(accountId:string,opportunityId:string|null,kind:string,text:string,details:RecordData){const id=uid('note'),at=now();this.store.run('INSERT INTO analyst_notes VALUES (?,?,?,?,?)',id,accountId,opportunityId,at,JSON.stringify({id,kind,text,details,createdAt:at,author:'Local analyst'}));}
}
