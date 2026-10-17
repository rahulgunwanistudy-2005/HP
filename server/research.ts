import {Store,now,uid,hash,canonical,type RecordData} from './db.ts';
import {Repository} from './repository.ts';
import {retrieve,validatePublicUrl,boundedOperation,boundedPassage,selectCandidates,type PassageCandidate} from './retrieval.ts';

export type Retriever=typeof retrieve;
export type ResearchOptions={forceRefresh?:boolean};
const normalize=(text:string)=>String(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const sameUrl=(a:unknown,b:string)=>{try{return typeof a==='string'&&canonical(a)===canonical(b);}catch{return false;}};
function candidatePassages(r:Awaited<ReturnType<Retriever>>):PassageCandidate[]{
  if(r.candidates?.length)return r.candidates;
  const pages=r.pages??r.items.filter((item:any)=>Number.isInteger(item.page)&&typeof item.text==='string');
  if(pages.length)return selectCandidates(pages.flatMap((p:any)=>p.text.split(/\n+|(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean).map((text:string)=>({text,section:'PDF page '+p.page,page:p.page}))),r.title);
  const paragraphs=r.text.split(/\n+|(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
  return selectCandidates(paragraphs.map(text=>({text,section:r.adapter==='pdf'?'Extracted PDF text; page unverified':'Extracted source text'})),r.title);
}

export class ResearchQueue {
  timer:ReturnType<typeof setInterval>|undefined;busy=false;controllers=new Map<string,AbortController>();
  constructor(public store:Store,public fetcher:Retriever=retrieve,public executionOptions:{jobTimeoutMs?:number}={}){
    for(const run of store.list('research_runs',"WHERE state='running'")){
      run.state='partial';run.completedAt=now();run.errors??=[];run.errors.push('Application restarted during retrieval; outcome preserved, remaining URLs require another run.');this.save(run);
    }
  }
  start(){if(this.timer)return;this.timer=setInterval(()=>{void this.tick().catch(error=>console.error('Research worker could not persist an outcome:',error));},400);this.timer.unref();}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=undefined;for(const c of this.controllers.values())c.abort();}
  save(run:RecordData){
    const existing=this.store.get('research_runs',run.id);run.cancelRequested ||= existing?.cancelRequested??false;
    this.store.run('UPDATE research_runs SET state=?,data=? WHERE id=?',run.state,JSON.stringify(run),run.id);
  }
  enqueue(accountId:string,urls:string[],adapter='html',options:ResearchOptions={}){
    if(!this.store.get('accounts',accountId))throw new Error('Research account not found');
    if(!['html','json','feed','pdf'].includes(adapter))throw new Error('Unsupported retrieval adapter');
    if(!Array.isArray(urls)||!urls.length||urls.length>5)throw new Error('Each research run requires one to five public URLs');
    const unique=new Map<string,string>();
    for(const input of urls){if(typeof input!=='string'||input.length>3000)throw new Error('Invalid public source URL');const u=validatePublicUrl(input);if(!unique.has(canonical(u.href)))unique.set(canonical(u.href),u.href);}
    if(this.store.list('research_runs',"WHERE account_id=? AND state IN ('queued','running')",accountId).length)throw new Error('This account already has a queued or running research job');
    const run={id:uid('run'),accountId,state:'queued',scope:'Analyst-initiated public-document retrieval; candidate passages require review, no automatic purchase-intent inference',sourceConfig:{urls:[...unique.values()],adapter,forceRefresh:options.forceRefresh===true,submittedUrls:urls.length,maxUrls:5,concurrency:2,requestTimeoutMs:10000,retries:1,maxBytes:5242880,jobTimeoutMs:this.executionOptions.jobTimeoutMs??90000,cache:'24h; procurement 1h; force-refresh bypass available',queries:[]},createdAt:now(),startedAt:null,completedAt:null,requested:unique.size,retrieved:0,skipped:0,failed:0,documentsProduced:0,claimsProduced:0,eventsProduced:0,findings:{new:0,changed:0,unchanged:0,baseline:0,superseded:0},manualReviewRequired:false,cancelRequested:false,results:[],errors:[],usage:{provider:'native public HTTP',bytes:0,paidApiCalls:0,cost:null,costNote:'No paid provider invoked; hosting/network cost not measured'}};
    this.store.run('INSERT INTO research_runs VALUES (?,?,?,?,?)',run.id,accountId,run.state,run.createdAt,JSON.stringify(run));return run;
  }
  cancel(id:string){
    const run=this.store.get('research_runs',id);if(!run)return;
    if(!['queued','running'].includes(run.state))return run;
    run.cancelRequested=true;this.controllers.get(id)?.abort();
    if(run.state==='queued'){
      run.state='partial';run.completedAt=now();run.skipped=run.requested;
      run.results=run.sourceConfig.urls.map((url:string)=>({url,status:'skipped',error:'Canceled before retrieval'}));
      run.errors.push('Canceled before retrieval; no success claimed.');
    }
    this.save(run);return run;
  }
  async tick(){if(this.busy)return;const run=this.store.list('research_runs',"WHERE state='queued' ORDER BY created_at LIMIT 1")[0];if(run)await this.execute(run.id);}
  findDocument(accountId:string,url:string){
    return this.store.list('documents','WHERE account_id=?',accountId).find(doc=>[doc.canonicalUrl,doc.url,doc.resolvedUrl,...(doc.urlAliases??[])].some(value=>sameUrl(value,url)));
  }
  async execute(id:string){
    if(this.busy)return;const run=this.store.get('research_runs',id);if(!run||run.state!=='queued')return;
    this.busy=true;const controller=new AbortController();this.controllers.set(id,controller);
    const timeout=setTimeout(()=>controller.abort(new Error('Job execution time limit reached')),run.sourceConfig.jobTimeoutMs??90000);
    run.state='running';run.startedAt=now();run.errors??=[];run.results??=[];run.findings.baseline??=0;
    let cursor=0;
    const work=async()=>{
      while(cursor<run.sourceConfig.urls.length){
        const url=run.sourceConfig.urls[cursor++],current=this.store.get('research_runs',id)!;
        if(current.cancelRequested||controller.signal.aborted){
          run.cancelRequested ||= current.cancelRequested;run.skipped++;run.results.push({url,status:'skipped',error:run.cancelRequested?'Canceled':'Job time limit'});this.save(run);continue;
        }
        try{
          const connector=this.store.get('connectors',run.sourceConfig.adapter);if(!connector?.enabled)throw new Error('Requested retrieval adapter is disabled');
          let existing=this.findDocument(run.accountId,url);
          const family=existing?.family,ttl=family==='procurement'||family==='Procurement notices'?3600000:86400000;
          const cachedAt=Date.parse(existing?.liveRetrievedAt??''),cacheAge=Date.now()-cachedAt;
          if(!run.sourceConfig.forceRefresh&&existing&&Number.isFinite(cachedAt)&&cacheAge>=0&&cacheAge<ttl){
            run.skipped++;run.results.push({url,status:'cached',documentId:existing.id,changed:false,cachedAt:existing.liveRetrievedAt,cacheAgeMs:cacheAge,cacheTtlMs:ttl,reviewStatus:existing.reviewStatus,adapter:existing.liveAdapter??run.sourceConfig.adapter});
            run.manualReviewRequired ||= existing.reviewStatus==='needs_review';run.findings.unchanged++;this.save(run);continue;
          }
          // Also enforce cancellation when an injected/extension retriever ignores its signal.
          const result=await boundedOperation(this.fetcher(url,run.sourceConfig.adapter,controller.signal),controller.signal,run.sourceConfig.jobTimeoutMs??90000,'Research retrieval');
          if(controller.signal.aborted||this.store.get('research_runs',id)?.cancelRequested)throw new Error('Canceled before storing retrieval');
          const resolved=this.findDocument(run.accountId,result.canonicalUrl);
          if(existing&&resolved&&existing.id!==resolved.id)throw new Error('Redirect collides with a different stored source; analyst identity review required');
          existing??=resolved;
          const stored=this.persistDocument(run,result,existing);
          run.retrieved++;run.usage.bytes+=result.bytes;run.documentsProduced+=stored.created?1:0;run.claimsProduced+=stored.claimsCreated;
          run.findings[stored.created?'new':stored.changed?'changed':stored.comparison==='baseline_unavailable'?'baseline':'unchanged']++;
          run.manualReviewRequired ||= stored.needsReview;
          run.results.push({url,status:stored.created?'new':stored.changed?'changed':'retrieved',documentId:stored.id,changed:stored.changed,comparison:stored.comparison,bytes:result.bytes,adapter:result.adapter,candidateSignals:stored.signals,findingStatus:stored.claimsCreated||!stored.created?'review_required_or_existing':'no_substantive_candidate_identified'});
          const c=this.store.get('connectors',result.adapter);
          if(c){c.status='live and tested';c.lastTestedAt=now();c.lastSuccessAt=now();c.lastOutcome='Successful real public-document retrieval';c.lastError=null;this.store.run('UPDATE connectors SET data=? WHERE id=?',JSON.stringify(c),c.id);}
        }catch(error){
          const current=this.store.get('research_runs',id);run.cancelRequested ||= current?.cancelRequested??false;
          const message=error instanceof Error?error.message:String(error);
          if(run.cancelRequested){run.skipped++;run.results.push({url,status:'skipped',error:'Canceled during retrieval; no source success or failure inferred'});}
          else{
            run.failed++;run.results.push({url,status:'failed',error:message,errorCode:(error as any)?.code??null});run.errors.push(url+': '+message);
            const c=this.store.get('connectors',run.sourceConfig.adapter);
            if(c){if(c.status==='planned')c.status='failed';c.lastError=message;c.lastAttemptAt=now();c.lastOutcome='Most recent source attempt failed; adapter history retained';this.store.run('UPDATE connectors SET data=? WHERE id=?',JSON.stringify(c),c.id);}
          }
        }
        this.save(run);
      }
    };
    try{
      this.save(run);await Promise.all([work(),work()]);
      run.cancelRequested ||= this.store.get('research_runs',id)?.cancelRequested??false;
      run.state=run.failed||run.cancelRequested||controller.signal.aborted?(run.retrieved||run.skipped?'partial':'failed'):'completed';
      if(controller.signal.aborted&&!run.cancelRequested)run.errors.push('Job execution time limit reached; unfinished URLs were not reported as successes.');
      if(run.cancelRequested)run.errors.push('Canceled by analyst; completed results were preserved.');
      run.completedAt=now();this.save(run);
      try{new Repository(this.store).snapshots();}catch(error){run.errors.push('Score snapshot recomputation failed: '+(error as Error).message);run.state='partial';this.save(run);}
    }catch(error){
      run.state=run.retrieved?'partial':'failed';run.completedAt=now();run.errors.push('Worker error: '+(error as Error).message);this.save(run);
    }finally{clearTimeout(timeout);this.controllers.delete(id);this.busy=false;}
  }
  persistDocument(run:RecordData,r:Awaited<ReturnType<Retriever>>,existing?:RecordData){
    validatePublicUrl(r.url);validatePublicUrl(r.canonicalUrl);
    const created=!existing,changed=!!existing?.liveFingerprint&&existing.liveFingerprint!==r.fingerprint;
    const comparison=created?'new':existing?.liveFingerprint?(changed?'changed':'unchanged'):'baseline_unavailable';
    const normalizedPassage=normalize(existing?.passage??''),passageStillPresent=existing?.passage?!!normalizedPassage&&normalize(r.text).includes(normalizedPassage):null;
    const candidates=candidatePassages(r),candidate=candidates[0],latestPassage=boundedPassage(candidate?.text??r.text);
    const signals=[...new Set(candidates.flatMap(c=>c.signals))];
    const metadataChanged=!!existing&&((existing.liveTitle??existing.title)!==r.title||!!r.publishedAt&&(existing.livePublishedAt??existing.publishedAt)!==r.publishedAt);
    const requiresFactReview=(created||changed||comparison==='baseline_unavailable'||metadataChanged)&&(signals.includes('amendment')||signals.includes('cancellation_or_delay'));
    const needsReview=created||changed||comparison==='baseline_unavailable'||!passageStillPresent||metadataChanged||requiresFactReview||existing?.reviewStatus==='needs_review';
    const domain=this.store.get('accounts',run.accountId)?.domain?.replace(/^www\./,''),ownHost=new URL(r.canonicalUrl).hostname;
    const sameOrganization=domain&&(ownHost===domain||ownHost.endsWith('.'+domain));
    const sameOriginDocument=sameOrganization?this.store.list('documents','WHERE account_id=?',run.accountId).find(doc=>{try{const host=new URL(doc.canonicalUrl).hostname;return host===domain||host.endsWith('.'+domain);}catch{return false;}}):undefined;
    const sourceId=existing?this.store.one('SELECT source_id FROM documents WHERE id=?',existing.id).source_id:'source-'+hash(ownHost+'|live').slice(0,16);
    const retrievedAt=now(),pages=r.pages??r.items.filter((item:any)=>Number.isInteger(item.page));
    const section=candidate?.page?'PDF page '+candidate.page+'; extracted text, verify original':candidate?.section??(r.adapter==='pdf'?'Extracted PDF text; page unverified':'Extracted source text');
    const doc={...(existing??{}),id:existing?.id??uid('doc'),accountId:run.accountId,url:existing?.url??r.url,canonicalUrl:existing?.canonicalUrl??canonical(r.canonicalUrl),resolvedUrl:r.canonicalUrl,retrievalUrl:r.url,urlAliases:[...new Set([...(existing?.urlAliases??[]),r.url,r.canonicalUrl])].slice(-32),title:existing?.title??r.title,publisher:existing?.publisher||r.sourceMetadata?.publisher||ownHost,family:existing?.family??'unclassified_public_document',origin:existing?.origin??ownHost,independenceGroup:existing?.independenceGroup??sameOriginDocument?.independenceGroup??ownHost,publishedAt:existing?existing.publishedAt??null:r.publishedAt,eventDate:existing?.eventDate??null,retrievedAt,liveRetrievedAt:retrievedAt,liveAdapter:r.adapter,fingerprint:r.fingerprint,liveFingerprint:r.fingerprint,fingerprintScope:'bounded_extracted_text',passage:existing?.passage??latestPassage,claim:existing?.claim??'Unreviewed candidate extract. Analyst must establish entity, date, relevance and factual claim before use.',section:existing?.section??section,reviewStatus:needsReview?'needs_review':existing?.reviewStatus??'needs_review',extractionMethod:created?'deterministic '+r.adapter+' passage ranking':(existing?.extractionMethod??'manual source review')+'; live '+r.adapter+' recheck',retrievalStatus:'retrieved',language:existing?.language&&existing.language!=='und'?existing.language:r.sourceMetadata?.language??'und',translationStatus:existing?.translationStatus??'not translated',limitations:existing?.limitations??'Unreviewed candidate passage; no automatic purchasing intent, event, entity or facility validation. Metadata is publisher-supplied and unverified.',livePassageMatched:passageStillPresent,liveTitle:r.title,livePublishedAt:r.publishedAt,latestPassage,latestSection:section,latestPage:candidate?.page??null,pageCount:r.adapter==='pdf'?r.pageCount??pages.length:null,pageReferences:pages.map((p:any)=>({page:p.page,textAvailable:typeof p.text==='string'&&!!p.text.trim(),selected:p.page===candidate?.page})),sourceMetadata:r.sourceMetadata??{},extractionWarnings:r.warnings??[],candidateStatus:candidate?'unreviewed_candidate':'no_substantive_candidate_identified',candidateSignals:signals,extractionCandidates:candidates.map(c=>({section:c.section,page:c.page??null,signals:c.signals,rankingPoints:c.score,reviewStatus:'unreviewed candidate'})),sourceChange:{comparison,priorFingerprint:existing?.liveFingerprint??null,priorPublicationDate:existing?.publishedAt??null,latestPublicationDate:r.publishedAt,metadataChanged,retainedPassageMatched:passageStillPresent,possibleAmendmentOrCancellation:requiresFactReview,reviewStatus:needsReview?'needs_review':'unchanged reviewed passage'},runId:run.id};
    this.store.transaction(()=>{
      this.store.run('INSERT OR IGNORE INTO sources VALUES (?,?,?,?,?)',sourceId,doc.origin,doc.family,r.adapter,JSON.stringify({id:sourceId,origin:doc.origin,family:doc.family,connectorId:r.adapter,reviewStatus:'unclassified until analyst review'}));
      this.store.run('INSERT INTO documents VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET fingerprint=excluded.fingerprint,review_status=excluded.review_status,data=excluded.data',doc.id,doc.accountId,sourceId,doc.canonicalUrl,doc.fingerprint,doc.reviewStatus,JSON.stringify(doc));
      this.store.run('INSERT INTO document_versions VALUES (?,?,?,?,?,?)',uid('version'),doc.id,doc.fingerprint,retrievedAt,run.id,JSON.stringify({...doc,feedItems:r.items.filter((item:any)=>!item.page).slice(0,20).map((item:any)=>({title:item.title,url:item.url,publishedAt:item.publishedAt,updatedAt:item.updatedAt,guid:item.guid}))}));
      if(created&&candidate)this.store.run('INSERT INTO claims VALUES (?,?,?,?,?)',uid('claim'),doc.accountId,doc.id,'needs_review',JSON.stringify({wording:doc.claim,passage:doc.passage,claimType:'unreviewed extract',documentId:doc.id,entity:'Unverified; requested account context only',location:'Unverified',temporalScope:'Event date unverified',extractionMethod:doc.extractionMethod,reviewStatus:'needs_review',candidateSignals:signals,section:doc.section,page:doc.latestPage}));
      else if(needsReview)for(const claim of this.store.list('claims','WHERE document_id=?',doc.id)){claim.reviewStatus='needs_review';this.store.run("UPDATE claims SET review_status='needs_review',data=? WHERE id=?",JSON.stringify(claim),claim.id);}
    });
    return{id:doc.id,created,changed,needsReview,comparison,signals,claimsCreated:created&&candidate?1:0};
  }
}
