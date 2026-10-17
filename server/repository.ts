import {readFileSync,existsSync} from 'node:fs';
import {Store,hash,canonical,now,uid,type RecordData} from './db.ts';
import {accountIsVisible,presentation} from './workspace.ts';
import {reviewedDataset} from './reviewed-data.ts';
import {qualificationFindings} from './qualification.ts';
import {defaultPolicy,eligibility,scoreOpportunity,rank,eventClusterKey,weights,freshness,familyMap} from './intelligence.ts';

export const listify=(x:any):any[]=>x==null?[]:Array.isArray(x)?x:[x];

export class Repository {
  constructor(public store:Store){}
  territory(){return this.store.get('territories','primary')!;}
  policy(){return this.store.list('scoring_policies','ORDER BY created_at DESC, rowid DESC LIMIT 1')[0]??defaultPolicy;}
  documents(accountId?:string):RecordData[]{
    const rows=this.store.list('documents',accountId?'WHERE account_id=?':'',...(accountId?[accountId]:[])),allRelations=this.store.list('document_relationships'),relations=allRelations.filter(r=>r.status!=='revoked'),all=this.store.list('documents');
    const groups=new Map<string,string>();const root=(id:string):string=>{const parent=groups.get(id);return parent&&parent!==id?root(parent):id;};
    for(const d of all){const key=String(d.independenceGroup??d.origin??d.id);if(!groups.has(key))groups.set(key,key);groups.set(d.id,key);}
    for(const r of relations.filter(r=>r.type==='same_announcement')){const a=root(r.documentId),b=root(r.relatedDocumentId);if(a!==b)groups.set(a,b);}
    return rows.filter(d=>accountId||accountIsVisible(this.store.get('accounts',d.accountId)??{})).map(d=>({...d,freshness:freshness(d,this.policy() as typeof defaultPolicy),relationships:allRelations.filter(r=>r.documentId===d.id||r.relatedDocumentId===d.id),supersededBy:[...new Set([...listify(d.supersededBy).filter(id=>!allRelations.some(r=>r.type==='supersedes'&&r.documentId===id&&r.relatedDocumentId===d.id)),...relations.filter(r=>r.type==='supersedes'&&r.relatedDocumentId===d.id).map(r=>r.documentId)])].filter(id=>id!==d.id),materialContradiction:relations.some(r=>r.type==='contradicts'&&(r.relatedDocumentId===d.id||r.documentId===d.id)),announcementGroup:root(d.id)}));
  }
  opportunity(id:string):RecordData|undefined{return this.opportunities().find(o=>o.id===id);}
  opportunities():RecordData[]{const territory=this.territory(),policy=this.policy();return this.store.list('opportunities').filter(o=>accountIsVisible(this.store.get('accounts',o.accountId)??{})).map(o=>{
    const a=this.accountBase(o.accountId)!;
    const links=this.store.all('SELECT * FROM opportunity_evidence WHERE opportunity_id=?',o.id);
    const documents=this.documents(o.accountId);
    const docs=documents.filter(d=>links.some(l=>l.document_id===d.id)).map(d=>({...d,relationship:links.some(l=>l.document_id===d.id&&l.relationship==='contradicts')?'contradicts':links.some(l=>l.document_id===d.id&&l.relationship==='supports')?'supports':'context'}));
    const event=this.store.get('events',o.eventId),eventSourceIds=event?this.store.all('SELECT document_id FROM event_evidence WHERE event_id=?',event.id).map(r=>r.document_id):[],eventDocuments=documents.filter(d=>eventSourceIds.includes(d.id));
    const eventNeedsReview=Boolean(event&&event.claimType!=='hypothesis'&&(!eventDocuments.length||eventDocuments.some(d=>d.reviewStatus!=='reviewed'||d.supersededBy?.length||d.materialContradiction)));
    const eventAssessment={status:event?.claimType==='hypothesis'?'hypothesis':eventNeedsReview?'needs_review':'reviewed',sourceIds:eventSourceIds,reason:event?.claimType==='hypothesis'?'The event is an analyst hypothesis; a dated business fact is not established.':eventNeedsReview?'Event support is missing, changed, rejected, superseded or conflicting. Review the event before advancing dependent opportunities.':'The event has reviewed supporting source records.'};
    const full={...o,accountName:a.name,event,eventAssessment,eventDocuments,eventRequiresReview:eventNeedsReview,documents:docs,evidenceIds:links.filter(l=>l.relationship==='supports').map(l=>l.document_id),contradictionIds:links.filter(l=>l.relationship==='contradicts').map(l=>l.document_id),contextIds:links.filter(l=>l.relationship==='context').map(l=>l.document_id),buyers:this.store.list('buyer_roles','WHERE opportunity_id=?',o.id),actions:this.store.list('actions','WHERE opportunity_id=? ORDER BY id',o.id),barriers:this.store.list('competitive_constraints','WHERE opportunity_id=?',o.id).map(b=>b.description),notes:this.store.list('analyst_notes','WHERE opportunity_id=? ORDER BY created_at DESC',o.id),eligibility:eligibility(a,territory,o)};
    const scored={...full,score:scoreOpportunity(full,a,territory,policy)};
    return{...scored,qualification:qualificationFindings(scored,a)};
  }).sort(rank);}
  accountBase(id:string):RecordData|undefined{const a=this.store.get('accounts',id);return a?{...a,facilities:this.store.list('facilities','WHERE account_id=?',id),relationships:this.store.list('account_relationships','WHERE account_id=?',id)}:undefined;}
  accounts():RecordData[]{const opps=this.opportunities();return this.store.list('accounts').filter(accountIsVisible).map(a=>{const account=this.accountBase(a.id)!;return{...account,documents:this.documents(a.id),opportunities:opps.filter(o=>o.accountId===a.id),eligibility:eligibility(account,this.territory())};});}
  account(id:string):RecordData|undefined{return this.accounts().find(a=>a.id===id);}
  runs():RecordData[]{return this.store.list('research_runs','ORDER BY created_at DESC').map(r=>({...r,accountName:this.store.get('accounts',r.accountId)?.name}));}
  metrics(){const ops=this.opportunities(),docs=this.documents(),acc=this.store.list('accounts').filter(accountIsVisible);return{accounts:acc.length,territoryProspects:acc.filter(a=>['confirmed','potential'].includes(eligibility(this.accountBase(a.id)!,this.territory()).status)).length,screenedProspects:acc.filter(a=>a.researchDepth==='screened').length,deepAccounts:acc.filter(a=>(a.researchDepth==='deep'||a.screeningStatus==='deep-demo')&&docs.filter(d=>d.accountId===a.id&&d.reviewStatus==='reviewed').length>=2&&ops.some(o=>o.accountId===a.id&&o.reviewStatus==='reviewed')).length,screenedAccounts:listify(this.store.meta('screened')).length,reviewedOpportunities:ops.filter(o=>o.reviewStatus==='reviewed').length,opportunities:ops.length,uniqueEvents:new Set(ops.map(o=>o.eventId).filter(Boolean)).size,sourceFamilies:new Set(docs.filter(d=>d.reviewStatus==='reviewed'&&d.family!=='unclassified_public_document').map((d:RecordData)=>d.family)).size,publisherOrigins:new Set(docs.map(d=>d.origin)).size,independentOrigins:new Set(docs.filter(d=>d.reviewStatus==='reviewed').map(d=>d.announcementGroup??d.independenceGroup??d.origin)).size,staleFindings:docs.filter(d=>d.freshness.status==='stale').length,unresolvedBuyers:ops.flatMap(o=>o.buyers).filter(b=>b.status!=='verified').length,failedRuns:this.runs().filter(r=>['failed','partial'].includes(r.state)).length,activeProcurement:ops.filter(o=>o.score.readiness==='Active procurement').length};}
  bootstrap(){return{presentation,territory:this.territory(),metrics:this.metrics(),accounts:this.accounts(),opportunities:this.opportunities(),products:this.store.list('products'),coverage:{...(this.store.meta('coverage')??{}),screened:this.store.meta('screened')??[],families:[...new Set(this.documents().map((d:RecordData)=>d.family))],complete:false},connectors:this.store.list('connectors'),policy:this.policy(),limitations:[
    'The directory combines five deep research demonstrations and source-supported ASEAN screening prospects. Territory follows saved operating-location rules; HP account ownership and buying intent remain separately unverified.',
    'Public announcements do not establish open sourcing, equipment budgets, installed fleet, purchasing authority, or HP eligibility.',
    'Reviewed seed evidence and live retrieval output are separate. Live extraction is deterministic and requires analyst review; no-key mode is not AI research.',
    'Procurement readiness depends on current notice status, deadlines, accepted evidence and recent verification. HP bid eligibility and full specifications require qualification; no revenue or win probability is estimated.',
    'Coverage is a purposive research sample, not an exhaustive enterprise market map.'
  ]};}
  snapshots(){for(const o of this.opportunities())this.store.run('INSERT INTO score_snapshots VALUES (?,?,?,?,?)',uid('score'),o.id,this.policy().id,now(),JSON.stringify(o.score));}
  saveOpportunity(id:string,patch:RecordData){const o=this.store.get('opportunities',id);if(!o)return;
    const updated:RecordData={...o,...patch,updatedAt:now(),editedAt:now()};delete updated.note;
    this.store.run('UPDATE opportunities SET analyst_status=?,data=? WHERE id=?',updated.analystStatus,JSON.stringify(updated),id);
    if(patch.note)this.store.run('INSERT INTO analyst_notes VALUES (?,?,?,?,?)',uid('note'),o.accountId,id,now(),JSON.stringify({text:patch.note,createdAt:now(),author:'Local analyst',kind:'qualification'}));
    this.snapshots();return this.opportunity(id);
  }
  validation(){const docs=this.documents(),ops=this.opportunities();const reviewed=docs.filter(d=>d.reviewStatus==='reviewed');return{methodology:'Source-supported business facts are separated from analyst hypotheses. Readiness gates precede scores. No measured sales outcomes or accuracy percentage.',asOf:now(),metrics:this.metrics(),reviewedDocuments:reviewed.length,unreviewedDocuments:docs.filter(d=>d.reviewStatus==='needs_review').length,rejectedDocuments:docs.filter(d=>d.reviewStatus==='rejected').length,sourceFamilies:[...new Set(reviewed.filter(d=>d.family!=='unclassified_public_document').map((d:RecordData)=>d.family))],origins:[...new Set(reviewed.map(d=>d.origin))],baselineComparison:this.accounts().map(a=>({account:a.name,newsOnly:a.documents.filter((d:RecordData)=>d.reviewStatus==='reviewed'&&d.family==='company_newsroom').map((d:RecordData)=>d.claim),additionalFamilies:[...new Set(a.documents.filter((d:RecordData)=>d.reviewStatus==='reviewed'&&d.family!=='company_newsroom').map((d:RecordData)=>d.family))],combinedFindings:ops.filter(o=>o.accountId===a.id).map(o=>({title:o.title,barriers:o.barriers,action:o.actions[0]?.title}))})),limitations:this.bootstrap().limitations,testsReference:'docs/deep-audit.md and docs/validation.md; execute npm test for current measured results',evaluation:'Manual support checks across all curated demonstration documents and opportunities; no independently measured real-world prediction accuracy.'};}
  graph(id:string){const a=this.account(id);if(!a)return;const nodes:RecordData[]=[{id:a.id,type:'account',label:a.name}];const edges:RecordData[]=[];
    for(const f of a.facilities){nodes.push({id:f.id,type:'facility',label:f.name});edges.push({source:a.id,target:f.id,label:'operating site'});}
    for(const [i,r] of a.relationships.entries()){const rid=r.relatedAccountId??`${id}-context-${i}`;if(!nodes.some(n=>n.id===rid))nodes.push({id:rid,type:'account',label:this.store.get('accounts',rid)?.name??r.name??r.entity??r.description??r.relation??'Related entity context'});edges.push({source:a.id,target:rid,label:r.relation??'related entity; attribution unverified'});}
    for(const e of this.store.list('events','WHERE account_id=?',id).filter(e=>!e.mergedIntoId)){nodes.push({id:e.id,type:'event',label:e.title});edges.push({source:a.id,target:e.id,label:e.claimType==='hypothesis'?'event hypothesis':'announced event'});if(e.facilityId&&nodes.some(n=>n.id===e.facilityId))edges.push({source:e.id,target:e.facilityId,label:'attributed site'});}
    for(const o of a.opportunities){nodes.push({id:o.id,type:'opportunity',label:o.title});edges.push({source:o.eventId??a.id,target:o.id,label:'supports hypothesis'});for(const d of o.documents){if(!nodes.some(n=>n.id===d.id))nodes.push({id:d.id,type:'document',label:d.title,url:d.url});edges.push({source:d.id,target:o.id,label:d.relationship??(o.contradictionIds.includes(d.id)?'contradicts':'supports')});}if(o.productId&&this.store.get('products',o.productId)){const product=this.store.get('products',o.productId)!;if(!nodes.some(n=>n.id===product.id))nodes.push({id:product.id,type:'product',label:product.name??product.title??product.id});edges.push({source:o.id,target:product.id,label:'product fit hypothesis'});}for(const action of o.actions){nodes.push({id:action.id,type:'action',label:action.title});edges.push({source:o.id,target:action.id,label:'qualify through'});}}
    return{nodes,edges};}
}

export function seed(store:Store){
  if(store.meta('seedVersion'))return;
  const accountPath=new URL('../data/research-accounts.json',import.meta.url),productPath=new URL('../data/products.json',import.meta.url);
  if(!existsSync(accountPath)||!existsSync(productPath))throw new Error('Reviewed data is missing. data/research-accounts.json and data/products.json are required.');
  const research=reviewedDataset(),productData=JSON.parse(readFileSync(productPath,'utf8'));
  const products=Array.isArray(productData)?productData:productData.products??productData.families??[];
  store.transaction(()=>{
    const territory={...JSON.parse(readFileSync(new URL('../data/territory.json',import.meta.url),'utf8')),id:'primary',version:1,updatedAt:now()};
    store.run('INSERT OR IGNORE INTO territories VALUES (?,?,?)','primary',1,JSON.stringify(territory));
    store.run('INSERT OR IGNORE INTO scoring_policies VALUES (?,?,?)',defaultPolicy.id,now(),JSON.stringify(defaultPolicy));
    const connectors=[
      {id:'html',name:'Public HTML retrieval',status:'planned',description:'Bounded, DNS-pinned HTTP retrieval, robots check, redirect validation, supporting-text extraction. Status changes only after a real run.',enabled:true},
      {id:'json',name:'Structured JSON API',status:'planned',description:'Bounded public JSON retrieval and scalar extraction. Source-specific semantics require review.',enabled:true},
      {id:'feed',name:'RSS / Atom feeds',status:'planned',description:'RSS and Atom parser with title, link and publication extraction. No recurring refresh enabled.',enabled:true},
      {id:'pdf',name:'Public PDF extraction',status:'planned',description:'Size-bounded PDF parser in a time-bounded child process; page references retained when available.',enabled:true},
      {id:'reviewed-import',name:'Reviewed evidence import',status:'manually imported',description:'Public pages reviewed during project research. Retained short passages and original links, not a live crawl.',enabled:true},
      {id:'procurement',name:'Country procurement discovery',status:'planned',description:'ASEAN-6 scope is configured. Country-specific automatic portal discovery remains planned; manually reviewed notices and four native retrieval adapters remain available.',enabled:false},
      {id:'ats',name:'Greenhouse / SmartRecruiters discovery',status:'planned',description:'Public API candidates only; no account-specific feed integrated or claimed as tested.',enabled:false},
      {id:'firecrawl',name:'Research-assistant Firecrawl',status:'manually imported',description:'Preparation research had mixed outcomes: successful searches and product-page scrapes plus transport failures. Reviewed extracts imported; no runtime Firecrawl connector or subscription required. See source manifest and product research report.',enabled:false}
    ];
    for(const c of connectors)store.run('INSERT OR IGNORE INTO connectors VALUES (?,?,?)',c.id,+c.enabled,JSON.stringify(c));
    for(const [i,p] of products.entries()){p.id??=`family-${i+1}`;store.run('INSERT OR IGNORE INTO products VALUES (?,?)',p.id,JSON.stringify(p));}
    for(const raw of research.accounts??[]){
      const {documents=[],opportunities=[],facilities=[],relationships=[],...account}=raw;
      account.demonstration??=true;account.legalEntity??='Unverified contracting entity';account.purchasingOrganization??='Unresolved; confirm global, regional and local authority';account.reviewStatus='reviewed';
      store.run('INSERT OR IGNORE INTO accounts VALUES (?,?,?,?)',account.id,account.name,account.domain,JSON.stringify(account));
      for(const [i,f] of facilities.entries()){f.id??=`${account.id}-site-${i+1}`;store.run('INSERT OR IGNORE INTO facilities VALUES (?,?,?,?)',f.id,account.id,f.country??null,JSON.stringify({...f,accountId:account.id}));}
      for(const [i,r] of relationships.entries())store.run('INSERT OR IGNORE INTO account_relationships VALUES (?,?,?,?,?)',`${account.id}-relationship-${i}`,account.id,r.relatedAccountId??null,r.relation??'parent_context',JSON.stringify(r));
      for(const d of documents){
        d.sourceFamilyLabel=d.family;d.family=familyMap[d.family]??d.family;
        const grouping:Record<string,string>={micron:'Micron Technology',sunway:'Sunway corporate group',changi:'Changi Airport Group',dreamworks:'Lenovo',lego:'The LEGO Group',thk:'Thye Hua Kwan Moral Charities'};
        const doc={...d,accountId:account.id,independenceGroup:grouping[account.id]??d.independenceGroup??d.origin,independenceAssessment:grouping[account.id]?'Conservative grouping: same corporate group, buyer notice platform or shared project announcement does not create independent corroboration.':d.independence??'Distinct publisher origin; document relevance still assessed separately.',canonicalUrl:canonical(d.url),originalReviewStatus:d.reviewStatus,reviewStatus:['rejected','needs_review'].includes(d.reviewStatus)?d.reviewStatus:'reviewed',extractionMethod:'manual public-source review',retrievalStatus:d.retrievalStatus??'manually imported',language:d.language??'en',translationStatus:d.translationStatus??'original',fingerprint:hash(d.passage??d.claim),fingerprintScope:'supporting_extract',reviewedAt:d.reviewedAt??d.retrievedAt,claimType:'source-supported factual claim',limitations:d.limitations??'Public source supports stated fact only; purchasing intent is not established.'};
        const sourceId=`source-${hash(`${d.origin}|${d.family}`).slice(0,16)}`;
        store.run('INSERT OR IGNORE INTO sources VALUES (?,?,?,?,?)',sourceId,d.origin,d.family,'reviewed-import',JSON.stringify({id:sourceId,origin:d.origin,family:d.family,connectorId:'reviewed-import'}));
        store.run('INSERT OR IGNORE INTO documents VALUES (?,?,?,?,?,?,?)',doc.id,account.id,sourceId,doc.canonicalUrl,doc.fingerprint,doc.reviewStatus,JSON.stringify(doc));
        store.run('INSERT OR IGNORE INTO document_versions VALUES (?,?,?,?,?,?)',`${doc.id}-v1`,doc.id,doc.fingerprint,doc.retrievedAt??now(),null,JSON.stringify(doc));
        store.run('INSERT OR IGNORE INTO claims VALUES (?,?,?,?,?)',`${doc.id}-claim`,account.id,doc.id,doc.reviewStatus,JSON.stringify({id:`${doc.id}-claim`,wording:doc.claim,passage:doc.passage,entity:account.name,location:doc.location??'See source; do not infer regional attribution',temporalScope:doc.eventDate??doc.publishedAt,extractionMethod:doc.extractionMethod,reviewStatus:doc.reviewStatus,documentId:doc.id,claimType:'fact',strength:'primary-source support; narrow claim only'}));
      }
      for(const rawOp of opportunities){
        const {actions=[],buyers=[],barriers=[],...o}=rawOp;
        o.accountId=account.id;o.analystStatus??='unreviewed';o.reviewStatus='reviewed';o.type??='acquisition hypothesis';
        for(const key of ['unknowns','confirm','weaken','disprove','evidenceIds','contradictionIds'])o[key]=listify(o[key]);
        const cluster=eventClusterKey(account.id,o.eventKey??o.eventTitle??o.title,o.eventDate??null,o.facilityId??o.facilityCountry??null),eventId=`event-${cluster}`;
        o.eventId=eventId;
        store.run('INSERT OR IGNORE INTO events VALUES (?,?,?,?)',eventId,account.id,cluster,JSON.stringify({id:eventId,title:o.eventTitle??o.title,eventDate:o.eventDate,accountId:account.id,facilityId:o.facilityId??null,claimType:o.eventClaimType??'source-supported event',evidenceIds:o.evidenceIds,clusterPolicy:'Account + normalized event label + actual event date + explicit facility; no fuzzy auto-merge'}));
        const product=products.find((p:RecordData)=>p.id===o.productFamily||p.name===o.productFamily||p.label===o.productFamily||p.title===o.productFamily);
        o.productId=product?.id??null;
        store.run('INSERT OR IGNORE INTO opportunities VALUES (?,?,?,?,?,?)',o.id,account.id,eventId,product?.id??null,o.analystStatus,JSON.stringify(o));
        for(const d of o.evidenceIds){if(!store.get('documents',d))throw new Error(`Missing supporting document ${d} for ${o.id}`);store.run('INSERT OR IGNORE INTO opportunity_evidence VALUES (?,?,?)',o.id,d,'supports');}
        for(const d of listify(o.eventEvidenceIds??o.evidenceIds))store.run('INSERT OR IGNORE INTO event_evidence VALUES (?,?)',eventId,d);
        for(const d of listify(o.contextIds)){if(!store.get('documents',d))throw new Error(`Missing context document ${d}`);store.run('INSERT OR IGNORE INTO opportunity_evidence VALUES (?,?,?)',o.id,d,'context');}
        for(const d of o.contradictionIds){if(!store.get('documents',d))throw new Error(`Missing contradiction ${d}`);store.run('INSERT OR IGNORE INTO opportunity_evidence VALUES (?,?,?)',o.id,d,'contradicts');}
        for(const [i,b] of buyers.entries())store.run('INSERT OR IGNORE INTO buyer_roles VALUES (?,?,?)',`${o.id}-buyer-${i}`,o.id,JSON.stringify({...b,status:b.status??'unresolved',authority:b.authority??'Job role is a qualification target; purchasing authority unverified',verificationAction:b.verificationAction??'Verify purchasing authority and entity through published supplier process.'}));
        for(const [i,b] of barriers.entries())store.run('INSERT OR IGNORE INTO competitive_constraints VALUES (?,?,?)',`${o.id}-barrier-${i}`,o.id,JSON.stringify({description:typeof b==='string'?b:b.description??JSON.stringify(b),kind:'qualification barrier',evidenceIds:o.contradictionIds}));
        for(const [i,a] of actions.entries()){a.id??=`${o.id}-action-${i+1}`;a.status??='pending';store.run('INSERT OR IGNORE INTO actions VALUES (?,?,?,?)',a.id,o.id,a.status,JSON.stringify(a));}
      }
    }
    store.db.exec(readFileSync(new URL('./migrations/003-legacy-source-relationships.sql',import.meta.url),'utf8'));
    store.meta('coverage',research.coverage??{});store.meta('screened',research.screened??[]);store.meta('seedVersion','reviewed-2026-10-16-v1');store.meta('productResearch',productData.metadata??{});
  });
  new Repository(store).snapshots();
}

export function sensitivity(repo:Repository){const base=repo.opportunities();return [{label:'Evidence +5 / timing −5',delta:{evidence:5,timing:-5}},{label:'Scale +5 / fit −5',delta:{scale:5,fit:-5}},{label:'Access +5 / evidence −5',delta:{access:5,evidence:-5}},{label:'Timing +10 / scale −10',delta:{timing:10,scale:-10}}].map(s=>{
  const p=repo.policy(),w={...p.weights};for(const [k,v]of Object.entries(s.delta))w[k]+=v;
  const ranked:RecordData[]=base.map(o=>({...o,score:scoreOpportunity(o,repo.accountBase(o.accountId)!,repo.territory(),{...p,weights:w})})).sort(rank);
  return{label:s.label,weights:w,leader:ranked[0]?.title,leaderAccount:ranked[0]?.accountName,leadingIds:ranked.slice(0,3).map(o=>o.id),changed:ranked[0]?.id!==base[0]?.id,explanation:'Eligibility and readiness gates remain unchanged. Sample comparison only; weights have not been empirically calibrated.'};
});}
