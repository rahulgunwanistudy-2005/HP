import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import express from 'express';
import {Store,hash,now} from '../server/db.ts';
import {seed,Repository} from '../server/repository.ts';
import {AuthoringService,registerAuthoring,AuthoringError} from '../server/authoring.ts';

function fixture(path=':memory:'){const store=new Store(path);seed(store);return{store,service:new AuthoringService(store),repo:new Repository(store)};}
const rejects=(fn:()=>unknown,code:string)=>assert.throws(fn,(error:unknown)=>error instanceof AuthoringError&&error.code===code);
function addEvidence(store:Store,accountId:string,id:string,fields:Record<string,unknown>={}){
  const source=store.list('sources')[0];const document={id,accountId,url:`https://fictional.example/${id}`,canonicalUrl:`https://fictional.example/${id}`,title:'FICTIONAL TEST SOURCE',origin:'Fictional test source',family:'procurement',reviewStatus:'reviewed',publishedAt:'2026-01-01',retrievedAt:now(),passage:'Fictional source names Casey Sample as the published procurement lead for this fixture.',claim:'Fictional fixture only. Named procurement lead Casey Sample; no real organization or person.',fingerprint:hash(id),...fields};
  store.run('INSERT INTO documents VALUES (?,?,?,?,?,?,?)',id,accountId,source.id,document.canonicalUrl,document.fingerprint,document.reviewStatus,JSON.stringify(document));return document;
}
function newAccount(service:AuthoringService){return service.createAccount({name:'FICTIONAL AUTHORING FIXTURE',domain:'fictional.example',industry:'Fictional test sector',summary:'Fictional fixture. No real company, purchasing claim, contact or budget.'});}
function newOpportunity(service:AuthoringService,accountId:string,evidenceIds:string[]=[]){const event=service.createEvent({accountId,title:'FICTIONAL fixture event',eventDate:'2026-01-01',evidenceIds,claimType:evidenceIds.length?'source-supported event':'hypothesis'});return service.createOpportunity({accountId,eventId:event.id,title:'FICTIONAL opportunity hypothesis',productId:'workstations',evidenceIds});}

test('authoring creates accounts, facilities, factual/hypothetical events and opportunities without changing seed files',()=>{
  const {store,service,repo}=fixture();try{const initial=repo.metrics(),a=newAccount(service);assert.equal(a.reviewStatus,'needs_review');assert.match(a.id,/^account-/);assert.equal(repo.metrics().accounts,initial.accounts+1);assert.equal(a.opportunities.length,0);
    const facility=service.createFacility({accountId:a.id,name:'Fictional operating site',country:'SG'});assert.equal(facility.reviewStatus,'needs_review');
    const o=newOpportunity(service,a.id);assert.equal(o.productFamily,'workstations');assert.equal(o.requirement,'Potential requirement to qualify');assert.notEqual(o.score.readiness,'Active procurement');assert.equal(o.buyers.length,0);assert.equal(o.procurement.explicit,false);assert.equal(o.commercialValue,'Value unquantified');assert.equal(store.all('PRAGMA foreign_key_check').length,0);
    rejects(()=>newAccount(service),'DUPLICATE_ACCOUNT');rejects(()=>service.createAccount({name:'invalid',domain:'https://fictional.example/path',industry:'x',summary:'fixture'}),'VALIDATION_ERROR');rejects(()=>service.createFacility({accountId:a.id,name:'Unknown region',country:'ZZ'}),'VALIDATION_ERROR');
    rejects(()=>service.createFacility({accountId:a.id,name:'Unreviewed site',country:'SG',reviewStatus:'reviewed'}),'REVIEW_REQUIRED');rejects(()=>service.createEvent({accountId:a.id,title:'Unsupported fact',claimType:'source-supported event'}),'REVIEW_REQUIRED');assert.equal(store.list('analyst_notes').filter(n=>n.kind==='authoring-audit').length,4);
  }finally{store.close();}
});

test('authoring rejects cross-account relationships, unsupported products and fabricated values; permits explicit scope exclusions',()=>{
  const {store,service}=fixture();try{const a=newAccount(service),o=newOpportunity(service,a.id),event=store.get('events',o.eventId)!;
    rejects(()=>service.createOpportunity({accountId:'micron',eventId:event.id,title:'Cross account',productId:'workstations'}),'ENTITY_MISMATCH');rejects(()=>service.updateOpportunity(o.id,{evidenceIds:['micron-fab-2026']}),'ENTITY_MISMATCH');rejects(()=>service.updateOpportunity(o.id,{productId:'hpe-servers'}),'UNKNOWN_PRODUCT');rejects(()=>service.updateOpportunity(o.id,{commercialValue:'$1 million estimated from factory headcount'}),'VALUE_EVIDENCE_REQUIRED');
    const outside=service.updateOpportunity(o.id,{productId:null,productFamily:'HPE servers (outside scope)',outOfScope:true,dimensions:{fit:4}});assert.equal(outside.productFamily,'HPE servers (outside scope)');assert.equal(outside.dimensions.fit,0);assert.equal(outside.score.readiness,'Blocked or excluded');
    const otherFacility=store.list('facilities','WHERE account_id=?','micron')[0];rejects(()=>service.updateOpportunity(o.id,{facilityId:otherFacility.id}),'ENTITY_MISMATCH');
    const d=addEvidence(store,a.id,'authoring-support');service.updateOpportunity(o.id,{outOfScope:false,productId:'workstations',evidenceIds:[d.id],reviewStatus:'reviewed',commercialValue:'Fictional quoted fixture value; not a real quote',valueBasisEvidenceIds:[d.id]});
    rejects(()=>service.updateOpportunity(o.id,{evidenceIds:[d.id],contradictionIds:[d.id]}),'EVIDENCE_CONFLICT');assert.equal(store.all('PRAGMA foreign_key_check').length,0);
  }finally{store.close();}
});

test('reviewed facility and event edits preserve stable ids and synchronize opportunity context',()=>{
  const {store,service}=fixture();try{const a=newAccount(service),d=addEvidence(store,a.id,'authoring-site'),f=service.createFacility({accountId:a.id,name:'Fictional facility',country:'SG',reviewStatus:'reviewed',evidenceIds:[d.id]}),event=service.createEvent({accountId:a.id,title:'FICTIONAL expansion event',eventDate:'2026-02-01',facilityId:f.id,claimType:'source-supported event',evidenceIds:[d.id]}),o=service.createOpportunity({accountId:a.id,eventId:event.id,title:'Fictional expansion hypothesis',productId:'workstations',facilityId:f.id,evidenceIds:[d.id]});
    const changed=service.updateEvent(event.id,{title:'FICTIONAL revised event',eventDate:'2026-03-01'});assert.equal(changed.id,event.id);assert.equal(service.repo.opportunity(o.id)!.eventTitle,'FICTIONAL revised event');assert.equal(service.repo.opportunity(o.id)!.eventDate,'2026-03-01');
    service.updateFacility(f.id,{country:'MY',name:'Fictional renamed facility'});assert.equal(service.repo.opportunity(o.id)!.facilityCountry,'MY');assert.equal(service.repo.opportunity(o.id)!.facilityId,f.id);assert.equal(service.events(a.id).length,1);assert.equal(service.events('micron').some(e=>e.id===event.id),false);
    rejects(()=>service.createEvent({accountId:a.id,title:changed.title,eventDate:changed.eventDate,facilityId:f.id}),'DUPLICATE_EVENT');
  }finally{store.close();}
});

test('buyer role and action content are persisted with stable ids; source-backed named buyers require explicit support',()=>{
  const {store,service}=fixture();try{const a=newAccount(service),o=newOpportunity(service,a.id),b=service.createBuyer(o.id,{role:'Fictional category buyer'});assert.equal(b.status,'unresolved');assert.equal(b.person,null);
    rejects(()=>service.updateBuyer(b.id,{person:'Invented Person',status:'verified'}),'BUYER_SOURCE_REQUIRED');const d=addEvidence(store,a.id,'authoring-named-buyer');rejects(()=>service.updateBuyer(b.id,{person:'Invented Person',status:'verified',evidenceIds:[d.id]}),'BUYER_NAME_UNSUPPORTED');rejects(()=>service.updateBuyer(b.id,{status:'verified',evidenceIds:[d.id]}),'BUYER_NAME_REQUIRED');
    const named=service.updateBuyer(b.id,{person:'Casey Sample',status:'verified',evidenceIds:[d.id]});assert.equal(named.id,b.id);assert.equal(named.sourceUrl,d.url);assert.equal(named.status,'verified');assert.match(named.authority,/unresolved/);assert.equal(service.repo.opportunity(o.id)!.buyers[0].person,'Casey Sample');
    const action=service.createAction(o.id,{title:'Fictional qualification',phase:'0–15',role:'Procurement',outcome:'A documented finding',question:'Which sourcing stage is documented?',progressCondition:'An owner verifies requirements',stopCondition:'No relevant scope'});const changed=service.updateAction(action.id,{title:'Fictional revised action',status:'done',question:'What changed in the notice?',stopCondition:'Scope already contracted'});assert.equal(changed.id,action.id);assert.equal(store.one('SELECT status FROM actions WHERE id=?',action.id).status,'done');assert.equal(service.repo.opportunity(o.id)!.actions[0].question,'What changed in the notice?');
    rejects(()=>service.updateAction(action.id,{unexpected:'unsafe'}),'VALIDATION_ERROR');assert.equal(store.all('PRAGMA foreign_key_check').length,0);
  }finally{store.close();}
});

test('procurement extension requires reviewed source and amendment, and expired status cannot become active',()=>{
  const {store,service}=fixture();try{const a=newAccount(service),o=newOpportunity(service,a.id),d=addEvidence(store,a.id,'authoring-notice'),future=new Date(Date.now()+30*86400000).toISOString(),later=new Date(Date.now()+45*86400000).toISOString();
    const input={explicit:true,status:'open',deadline:future,verifiedAt:now(),noticeId:'FICTIONAL-NOTICE-001',evidenceIds:[d.id],verificationBasis:'FICTIONAL fixture only: this tests a reviewed notice record.'};
    const first=service.updateProcurement(o.id,input);assert.equal(first.procurement.deadline,future);assert.ok(first.evidenceIds.includes(d.id));assert.equal(first.procurement.status,'open');assert.equal(first.procurement.history.length,1);
    rejects(()=>service.updateProcurement(o.id,{...input,deadline:later}),'AMENDMENT_REQUIRED');const extended=service.updateProcurement(o.id,{...input,deadline:later,amendment:'Fictional reviewed extension of the public notice deadline'});assert.equal(extended.procurement.deadline,later);assert.equal(extended.procurement.history.length,2);
    const expired=new Date(Date.now()-86400000).toISOString();rejects(()=>service.updateProcurement(o.id,{...input,deadline:expired,amendment:'Fictional historical test'}),'EXPIRED_NOTICE');rejects(()=>service.updateProcurement(o.id,{...input,verifiedAt:future}),'FUTURE_VERIFICATION');rejects(()=>service.updateProcurement(o.id,{...input,evidenceIds:['micron-fab-2026']}),'ENTITY_MISMATCH');
    const news=addEvidence(store,a.id,'authoring-news',{family:'company_newsroom'});rejects(()=>service.updateProcurement(o.id,{...input,evidenceIds:[news.id]}),'PROCUREMENT_SOURCE_REQUIRED');rejects(()=>service.updateProcurement(o.id,{...input,status:'superseded',deadline:later}),'SUPERSEDING_NOTICE_REQUIRED');
    service.updateOpportunity(o.id,{title:'Fictional title update preserves notice support'});assert.ok(service.repo.opportunity(o.id)!.evidenceIds.includes(d.id));
    const replacement=addEvidence(store,a.id,'authoring-replacement');const superseded=service.updateProcurement(o.id,{...input,status:'superseded',deadline:later,amendment:'Fictional replacement notice controls',supersedingEvidenceId:replacement.id});assert.equal(superseded.procurement.supersedingEvidenceId,replacement.id);assert.notEqual(superseded.score.readiness,'Active procurement');
  }finally{store.close();}
});

test('authoring preserves runtime context links and rejects superseded procurement and buyer sources',()=>{
  const {store,service}=fixture();try{const a=newAccount(service),o=newOpportunity(service,a.id),old=addEvidence(store,a.id,'authoring-old-source'),current=addEvidence(store,a.id,'authoring-current-source');
    store.run('INSERT INTO opportunity_evidence VALUES (?,?,?)',o.id,old.id,'context');service.updateOpportunity(o.id,{title:'Fictional title edit preserves runtime context'});assert.equal(store.one('SELECT relationship FROM opportunity_evidence WHERE opportunity_id=? AND document_id=?',o.id,old.id).relationship,'context');
    const relationship={id:'authoring-supersession',accountId:a.id,documentId:current.id,relatedDocumentId:old.id,type:'supersedes',status:'active',createdAt:now()};store.run('INSERT INTO document_relationships VALUES (?,?,?,?,?,?,?)',relationship.id,a.id,current.id,old.id,'supersedes',relationship.createdAt,JSON.stringify(relationship));
    rejects(()=>service.updateOpportunity(o.id,{evidenceIds:[old.id],contextIds:[]}),'SUPERSEDED_SOURCE');rejects(()=>service.createBuyer(o.id,{role:'Fictional source-backed buyer',person:'Casey Sample',status:'verified',evidenceIds:[old.id]}),'SUPERSEDED_SOURCE');
    const procurement={explicit:true,status:'open',deadline:new Date(Date.now()+30*86400000).toISOString(),verifiedAt:now(),noticeId:'FICTIONAL-CONTROLLING-NOTICE',evidenceIds:[old.id],verificationBasis:'Fictional supersession test'};rejects(()=>service.updateProcurement(o.id,procurement),'SUPERSEDED_SOURCE');assert.equal(service.updateProcurement(o.id,{...procurement,evidenceIds:[current.id]}).procurement.status,'open');
    rejects(()=>service.updateProcurement(o.id,{...procurement,evidenceIds:[current.id],verifiedAt:'2026-02-31T00:00:00Z'}),'VALIDATION_ERROR');
  }finally{store.close();}
});

test('invalid mutations leave no partial records or score snapshots and authored content survives reopen',()=>{
  const folder=mkdtempSync(join(tmpdir(),'hp-authoring-'));const path=join(folder,'fixture.sqlite');let {store,service}=fixture(path);try{const a=newAccount(service),o=newOpportunity(service,a.id),before=store.list('score_snapshots').length,notes=store.list('analyst_notes').length;
    rejects(()=>service.updateOpportunity(o.id,{eventId:'does-not-exist',title:'Must not partially save'}),'NOT_FOUND');assert.equal(store.list('score_snapshots').length,before);assert.equal(store.list('analyst_notes').length,notes);assert.equal(service.repo.opportunity(o.id)!.title,o.title);
    service.updateAccount(a.id,{name:'FICTIONAL persisted account',purchasingCountry:'SG',hqCountry:null,discovery:'Fictional manual discovery',rationale:'Fixture for persisted authored workflow'});const b=service.createBuyer(o.id,{role:'Unresolved purchasing role'}),action=service.createAction(o.id,{title:'Fictional persistent action'});service.updateAction(action.id,{outcome:'Persisted content',status:'in_progress'});store.close();store=new Store(path);service=new AuthoringService(store);seed(store);
    assert.equal(service.repo.account(a.id)!.name,'FICTIONAL persisted account');assert.equal(service.repo.account(a.id)!.purchasingCountry,'SG');assert.equal(service.repo.opportunity(o.id)!.buyers[0].id,b.id);assert.equal(service.repo.opportunity(o.id)!.actions[0].outcome,'Persisted content');assert.ok(service.repo.opportunity(o.id)!.notes.some((n:Record<string,any>)=>n.before&&n.after));assert.equal(store.all('PRAGMA foreign_key_check').length,0);
  }finally{store.close();rmSync(folder,{recursive:true,force:true});}
});

test('authoring HTTP routes provide consistent validation errors and persist all record types',{skip:process.env.RUN_HTTP_TESTS!=='1'},async()=>{
  const {store}=fixture(),app=express();app.use(express.json());registerAuthoring(app,store);app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status??500).json({error:{code:error.code,message:error.message,details:error.details}}));const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address() as any,base=`http://127.0.0.1:${address.port}/api/authoring`;const request=async(path:string,method='GET',body?:unknown)=>{const response=await fetch(base+path,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()};};
  try{assert.equal((await request('/accounts','POST',{})).status,400);const account=await request('/accounts','POST',{name:'FICTIONAL HTTP ACCOUNT',domain:'fixture.example',industry:'Fixture',summary:'Fictional HTTP fixture only'});assert.equal(account.status,201);const event=await request('/events','POST',{accountId:account.body.id,title:'Fictional HTTP event'});assert.equal(event.status,201);const opportunity=await request('/opportunities','POST',{accountId:account.body.id,eventId:event.body.id,title:'Fictional HTTP opportunity',productId:'workstations'});assert.equal(opportunity.status,201);assert.equal((await request('/events?accountId='+account.body.id)).body.items.length,1);assert.equal((await request('/opportunities/'+opportunity.body.id,'PATCH',{title:'Revised fictional HTTP opportunity'})).body.title,'Revised fictional HTTP opportunity');assert.equal((await request('/opportunities/'+opportunity.body.id+'/buyers','POST',{role:'Unresolved fixture role'})).status,201);const action=await request('/opportunities/'+opportunity.body.id+'/actions','POST',{title:'Fictional HTTP action'});assert.equal(action.status,201);assert.equal((await request('/actions/'+action.body.id,'PATCH',{question:'Persisted fictional HTTP question'})).body.question,'Persisted fictional HTTP question');assert.equal((await request('/facilities','POST',{accountId:account.body.id,name:'Fictional HTTP site',country:'SG'})).status,201);assert.equal((await request('/events/not-found','PATCH',{title:'x'})).status,404);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}
});
