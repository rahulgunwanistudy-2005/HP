import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,hash,type RecordData} from '../server/db.ts';
import {defaultPolicy,eventClusterKey,resolveEntity} from '../server/intelligence.ts';
import {Repository} from '../server/repository.ts';
import {AuthoringService} from '../server/authoring.ts';
import {ReconciliationService} from '../server/reconciliation.ts';

// Explicitly fictional, isolated records. No demonstration database or external source is changed.
function setup(){
  const s=new Store(':memory:');
  const a={id:'fictional',name:'Fictional Audit Enterprise',domain:'fictional.example.org',hqCountry:'US',reviewStatus:'reviewed'};
  s.run('INSERT INTO accounts VALUES (?,?,?,?)',a.id,a.name,a.domain,JSON.stringify(a));
  s.run('INSERT INTO territories VALUES (?,?,?)','primary',1,JSON.stringify({id:'primary',verificationStatus:'verified',countries:['SG','MY'],eligibilityBasis:'operating_location',exclusions:[]}));
  s.run('INSERT INTO scoring_policies VALUES (?,?,?)',defaultPolicy.id,new Date().toISOString(),JSON.stringify(defaultPolicy));
  s.run('INSERT INTO products VALUES (?,?)','workstations',JSON.stringify({id:'workstations',name:'Fictional test catalog placeholder'}));
  s.run('INSERT INTO connectors VALUES (?,?,?)','reviewed-import',1,JSON.stringify({id:'reviewed-import',enabled:true}));
  for(const [id,country]of [['sg-site','SG'],['my-site','MY']])s.run('INSERT INTO facilities VALUES (?,?,?,?)',id,a.id,country,JSON.stringify({id,accountId:a.id,name:'Fictional '+country+' facility',country,reviewStatus:'reviewed'}));
  for(const [i,origin]of ['fictional-publisher-a','fictional-publisher-b'].entries()){
    const id='doc-'+i,source='source-'+i,doc:RecordData={id,accountId:a.id,url:'https://example.org/'+id,canonicalUrl:'https://example.org/'+id,title:'Fictional source '+i,origin,independenceGroup:origin,publisher:origin,family:'company_newsroom',publishedAt:i?'2026-10-11':'2026-10-10',eventDate:'2026-10-01',retrievedAt:'2026-10-16',reviewStatus:'reviewed',passage:'Fictional engineering expansion requires a workload assessment.',claim:'Fictional event used only in a local regression fixture.',fingerprint:hash(id)};
    s.run('INSERT INTO sources VALUES (?,?,?,?,?)',source,origin,doc.family,'reviewed-import',JSON.stringify({id:source,origin,family:doc.family}));
    s.run('INSERT INTO documents VALUES (?,?,?,?,?,?,?)',id,a.id,source,doc.canonicalUrl,doc.fingerprint,doc.reviewStatus,JSON.stringify(doc));
  }
  return{s,r:new Repository(s),author:new AuthoringService(s),reconcile:new ReconciliationService(s)};
}
test('unrelated non-Latin legal names cannot collapse to a false exact entity match',()=>{
  assert.equal(resolveEntity({legalName:'新加坡医院集团'},[{id:'unrelated',name:'印尼制造公司',legalEntity:'印尼制造公司',domain:'unrelated.example.org'}]).status,'unresolved');
  assert.equal(resolveEntity({legalName:'新加坡医院集团'},[{id:'correct',name:'新加坡医院集团',legalEntity:'新加坡医院集团',domain:'correct.example.org'}]).id,'correct');
});
test('different non-Latin events at the same site and date retain distinct event identities',()=>{
  assert.notEqual(eventClusterKey('fictional','新工厂开幕','2026-10-01','sg-site'),eventClusterKey('fictional','医院扩建计划','2026-10-01','sg-site'));
});
test('merging an unbound event cannot silently move an existing country-bound opportunity to another site',()=>{
  const {s,author,reconcile}=setup();try{
    const source=author.createEvent({accountId:'fictional',title:'FICTIONAL global engineering expansion',claimType:'hypothesis'});
    const target=author.createEvent({accountId:'fictional',title:'FICTIONAL Singapore engineering expansion',facilityId:'sg-site',claimType:'hypothesis'});
    const o=author.createOpportunity({accountId:'fictional',eventId:source.id,title:'FICTIONAL Malaysia compute hypothesis',productId:'workstations',facilityCountry:'MY',evidenceIds:['doc-0']});
    assert.throws(()=>reconcile.merge({accountId:'fictional',sourceEventId:source.id,targetEventId:target.id,reason:'FICTIONAL regression: attribution still requires separate review'}),/facility|site|location|attribut/i);
    assert.equal(s.get('opportunities',o.id)!.eventId,source.id);
    assert.equal(s.get('opportunities',o.id)!.facilityCountry,'MY');
  }finally{s.close();}
});
test('supersession chronology does not compare a publication date with a future business milestone',()=>{
  const {s,reconcile,r}=setup();try{
    const older=s.get('documents','doc-0')!;older.publishedAt=null;older.eventDate='2028-01-01';s.run('UPDATE documents SET data=? WHERE id=?',JSON.stringify(older),older.id);
    assert.doesNotThrow(()=>reconcile.relationship('doc-1','doc-0','supersedes','FICTIONAL regression: published update replaces an undated earlier document; milestone is not issuance date'));
    assert.ok(r.documents('fictional').find(d=>d.id==='doc-0')!.supersededBy.includes('doc-1'));
  }finally{s.close();}
});
test('same-announcement relationships also update the independence-group metric',()=>{
  const {s,reconcile,r}=setup();try{
    assert.equal(r.metrics().independentOrigins,2);
    reconcile.relationship('doc-1','doc-0','same_announcement','FICTIONAL regression: same underlying announcement republished by another source');
    assert.equal(new Set(r.documents('fictional').map(d=>d.announcementGroup)).size,1);
    assert.equal(r.metrics().independentOrigins,1);
  }finally{s.close();}
});
test('source relationship revocation and reviewed reactivation preserve source facts and history',()=>{
  const {s,reconcile,r}=setup();try{
    const before=JSON.stringify(s.get('documents','doc-0'));
    const linked=reconcile.relationship('doc-1','doc-0','supersedes','FICTIONAL reviewed replacement notice');
    assert.ok(r.documents('fictional').find(d=>d.id==='doc-0')!.supersededBy.includes('doc-1'));
    reconcile.revoke(linked.relationship.id,'FICTIONAL analyst rejects the claimed replacement relationship');
    assert.deepEqual(r.documents('fictional').find(d=>d.id==='doc-0')!.supersededBy,[]);
    assert.equal(JSON.stringify(s.get('documents','doc-0')),before);
    assert.equal(s.get('document_relationships',linked.relationship.id)!.status,'revoked');
    const d=s.get('documents','doc-1')!;d.reviewStatus='needs_review';s.run('UPDATE documents SET review_status=?,data=? WHERE id=?','needs_review',JSON.stringify(d),d.id);
    assert.throws(()=>reconcile.relationship('doc-1','doc-0','supersedes','FICTIONAL source still needs review'),/Review both/);
    d.reviewStatus='reviewed';s.run('UPDATE documents SET review_status=?,data=? WHERE id=?','reviewed',JSON.stringify(d),d.id);
    const reactivated=reconcile.relationship('doc-1','doc-0','supersedes','FICTIONAL updated source relation accepted after review');
    assert.equal(reactivated.relationship.id,linked.relationship.id);assert.equal(reactivated.relationship.status,'active');
    assert.ok(reactivated.relationship.history.length>0);
  }finally{s.close();}
});
test('merge site attribution keeps the persisted event duplicate key synchronized',()=>{
  const {s,author,reconcile}=setup();try{
    const source=author.createEvent({accountId:'fictional',title:'FICTIONAL related engineering expansion source',eventDate:'2026-10-01',facilityId:'sg-site',claimType:'hypothesis'});
    const target=author.createEvent({accountId:'fictional',title:'FICTIONAL related engineering expansion target',eventDate:'2026-10-01',claimType:'hypothesis'});
    reconcile.merge({accountId:'fictional',sourceEventId:source.id,targetEventId:target.id,reason:'FICTIONAL duplicate event has the reviewed Singapore attribution'});
    const controlling=s.get('events',target.id)!;assert.equal(controlling.facilityId,'sg-site');
    assert.throws(()=>author.createEvent({accountId:'fictional',title:controlling.title,eventDate:controlling.eventDate,facilityId:'sg-site',claimType:'hypothesis'}),/already has an event|duplicate/i);
  }finally{s.close();}
});
test('undo never erases a later source-event fact edit',()=>{
  const {s,author,reconcile}=setup();try{
    const source=author.createEvent({accountId:'fictional',title:'FICTIONAL source event',claimType:'hypothesis'});
    const target=author.createEvent({accountId:'fictional',title:'FICTIONAL target event',claimType:'hypothesis'});
    const merged=reconcile.merge({accountId:'fictional',sourceEventId:source.id,targetEventId:target.id,reason:'FICTIONAL analyst reviewed duplicate event mapping'});
    const changed={...s.get('events',source.id)!,description:'FICTIONAL later source fact edit retained for conflict testing'};
    s.run('UPDATE events SET data=? WHERE id=?',JSON.stringify(changed),source.id);
    assert.throws(()=>reconcile.unmerge(merged.mergeId,'FICTIONAL conflicting undo'),/facts changed|changed after/i);
    assert.equal(s.get('events',source.id)!.description,changed.description);
  }finally{s.close();}
});
test('review invalidation propagates through a factual event to its dependent opportunity',()=>{
  const {s,author,r}=setup();try{
    const event=author.createEvent({accountId:'fictional',title:'FICTIONAL source-supported factory expansion',eventDate:'2026-10-01',facilityId:'sg-site',claimType:'source-supported event',evidenceIds:['doc-0']});
    const o=author.createOpportunity({accountId:'fictional',eventId:event.id,title:'FICTIONAL related engineering workload hypothesis',productId:'workstations',facilityId:'sg-site',evidenceIds:['doc-1'],reviewStatus:'reviewed',dimensions:{evidence:2,fit:3,timing:3,scale:null,access:null,feasibility:null}});
    assert.equal(r.opportunity(o.id)!.score.readiness,'Triggered qualification');
    const changed=s.get('documents','doc-0')!;changed.reviewStatus='needs_review';s.run('UPDATE documents SET review_status=?,data=? WHERE id=?','needs_review',JSON.stringify(changed),changed.id);
    assert.equal(r.opportunity(o.id)!.score.readiness,'Watchlist');
    assert.equal(s.get('opportunities',o.id)!.eventId,event.id);
  }finally{s.close();}
});
