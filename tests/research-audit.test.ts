import test from 'node:test';
import assert from 'node:assert/strict';
import {Store,hash,type RecordData} from '../server/db.ts';
import {defaultPolicy} from '../server/intelligence.ts';
import {ResearchQueue,type Retriever} from '../server/research.ts';
import {boundedOperation,boundedPassage,decodeSource,parseFeed,parseHtml,parseJson,parsePdf,parseRemoteText,requestRedirects,retryDelay,robotsAllows,type RetrievalResult} from '../server/retrieval.ts';

// Fictional local fixtures only. Public-request functions are injected; these tests never contact the internet.
function source(url:string,text='Fictional factory expansion requires engineering design and document workflows.',patch:Partial<RetrievalResult>={}):RetrievalResult{
  return{url,canonicalUrl:url,title:'Fictional source',text,publishedAt:'2020-01-01',items:[],fingerprint:hash(text),bytes:Buffer.byteLength(text),adapter:'html',contentType:'text/html',status:200,...patch};
}
function fixture(){
  const store=new Store(':memory:');
  store.run('INSERT INTO accounts VALUES (?,?,?,?)','fictional','Fictional Company','fictional.example.org',JSON.stringify({id:'fictional',name:'Fictional Company',domain:'fictional.example.org',facilities:[]}));
  store.run('INSERT INTO territories VALUES (?,?,?)','primary',1,JSON.stringify({id:'primary',verificationStatus:'unverified',countries:[]}));
  store.run('INSERT INTO scoring_policies VALUES (?,?,?)',defaultPolicy.id,new Date().toISOString(),JSON.stringify(defaultPolicy));
  for(const id of ['html','json','feed','pdf'])store.run('INSERT INTO connectors VALUES (?,?,?)',id,1,JSON.stringify({id,enabled:true,status:'planned'}));
  return store;
}
function reviewed(store:Store,doc:RecordData):RecordData{
  const changed={...doc,reviewStatus:'reviewed'};store.run('UPDATE documents SET review_status=?,data=? WHERE id=?','reviewed',JSON.stringify(changed),doc.id);
  for(const claim of store.list('claims','WHERE document_id=?',doc.id))store.run('UPDATE claims SET review_status=?,data=? WHERE id=?','reviewed',JSON.stringify({...claim,reviewStatus:'reviewed'}),claim.id);
  return changed;
}
function complete(queue:ResearchQueue,run:RecordData){queue.save({...run,state:'completed',completedAt:new Date().toISOString()});}
function fixturePdf(pageCount=2){
  const objects:string[]=[];
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4]='<< /Title (Fictional PDF fixture) /CreationDate (D:20200101000000Z) >>';
  const kids:string[]=[];
  for(let i=0;i<pageCount;i++){
    const id=5+i*2,content='BT /F1 12 Tf 40 750 Td (Fictional factory page '+(i+1)+' engineering expansion requires document workflows.) Tj ET';
    kids.push(id+' 0 R');
    objects[id]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(id+1)+' 0 R >>';
    objects[id+1]='<< /Length '+Buffer.byteLength(content)+' >>\nstream\n'+content+'\nendstream';
  }
  objects[2]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+pageCount+' >>';
  let pdf='%PDF-1.4\n',offsets=[0];
  for(let i=1;i<objects.length;i++){offsets[i]=Buffer.byteLength(pdf);pdf+=i+' 0 obj\n'+objects[i]+'\nendobj\n';}
  const xref=Buffer.byteLength(pdf);pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
  for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R /Info 4 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
  return Buffer.from(pdf);
}

test('HTML extraction prefers substantive main content and handles metadata attribute order',()=>{
  const parsed=parseHtml('<html lang="fr"><head><title>Generic website</title><meta content="Fictional expansion" property="og:title"><meta content="2026-10-01T09:00:00+08:00" property="article:published_time"><meta content="Fictional Publisher" property="og:site_name"></head><body><nav>Cookie privacy menu subscribe navigation search contact us</nav><main><p>The fictional factory expansion adds an engineering facility for local design and document workflows.</p></main><footer>All rights reserved</footer></body></html>');
  assert.equal(parsed.title,'Fictional expansion');assert.equal(parsed.publishedAt,'2026-10-01T09:00:00+08:00');
  assert.equal(parsed.sourceMetadata?.language,'fr');assert.equal(parsed.sourceMetadata?.publisher,'Fictional Publisher');
  assert.match(parsed.candidates![0].text,/factory expansion/);assert.ok(!parsed.text.includes('subscribe'));
  assert.ok(boundedPassage(parsed.candidates![0].text).split(/\s+/).length<=20);
});
test('multiple articles do not hide a later amendment and modification is not publication',()=>{
  const parsed=parseHtml('<html><head><meta property="article:modified_time" content="2026-10-16"></head><main><article><p>General fictional corporate overview and history of the business.</p></article><article><p>The fictional tender deadline has been amended and the procurement scope is revised for document printing.</p></article></main></html>');
  assert.equal(parsed.publishedAt,null);assert.equal(parsed.sourceMetadata?.modifiedAt,'2026-10-16');
  assert.ok(parsed.candidates![0].signals.includes('amendment'));assert.match(parsed.text,/amended/);
});
test('publication metadata preserves uncertainty and labelled time elements are supported',()=>{
  assert.equal(parseHtml('<meta content="not-a-date" name="datePublished"><p>Fictional corporate event text for source review.</p>').publishedAt,null);
  assert.equal(parseHtml('<meta name="datePublished" content="10/17">').publishedAt,null);
  assert.equal(parseHtml('<meta name="datePublished" content="2026-02-31">').publishedAt,null);
  const parsed=parseHtml('<time datetime="2026-10-10" itemprop="datePublished"></time><article><p>Fictional engineering facility expansion announced for local design staff.</p></article>');
  assert.equal(parsed.publishedAt,'2026-10-10');
});
test('JSON primitives and null are valid documents and unsupported title types never leak objects',()=>{
  assert.equal(parseJson('null').text,'');assert.equal(parseJson('"Fictional text"').text,'Fictional text');
  const parsed=parseJson(JSON.stringify({title:{unexpected:'nested'},description:'Fictional engineering factory expansion requires workstation assessment.'}));
  assert.equal(typeof parsed.title,'string');assert.ok(!parsed.text.includes('[object Object]'));assert.ok(parsed.candidates!.length>0);
});
test('Atom chooses alternate links and keeps update time distinct from initial publication',()=>{
  const parsed=parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><title>Fictional feed</title><updated>2026-10-16T10:00:00Z</updated><entry><title>Fictional engineering expansion</title><link rel="self" href="https://example.org/feed/item"/><link rel="alternate" href="https://example.org/article"/><published>2020-01-01T10:00:00Z</published><updated>2026-10-16T10:00:00Z</updated><summary type="html">Fictional factory expansion requires engineering document workflows.</summary></entry><entry><title>Undated fictional item</title><updated>2026-10-16T10:00:00Z</updated><summary>Fictional procurement information awaits manual validation.</summary></entry></feed>');
  assert.equal(parsed.items[0].url,'https://example.org/article');assert.equal(parsed.items[0].publishedAt,'2020-01-01T10:00:00Z');
  assert.equal(parsed.items[1].publishedAt,null);assert.equal(parsed.items[1].updatedAt,'2026-10-16T10:00:00Z');assert.equal(parsed.publishedAt,null);
});
test('malformed feed XML fails explicitly and namespaced content is retained as text',()=>{
  assert.throws(()=>parseFeed('<rss><channel><item></channel></rss>'),/Malformed XML/);
  const parsed=parseFeed('<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Fictional feed</title><item><title>Fictional factory</title><content:encoded><![CDATA[<p>Fictional production facility opens for engineering expansion.</p>]]></content:encoded></item></channel></rss>');
  assert.match(parsed.items[0].text,/engineering expansion/);
});
test('source character encoding is explicit rather than silently corrupting non-UTF8 text',()=>{
  assert.equal(decodeSource(Buffer.from([0x63,0x61,0x66,0xe9]),'text/html; charset=windows-1252'),'café');
  assert.throws(()=>decodeSource(Buffer.from([0xff]),'text/html; charset=utf-8'),/encoding/);
});
test('robots wildcard anchors and percent-encoded unreserved characters are enforced',()=>{
  const rules='User-agent: *\nDisallow: /private\nDisallow: /reports/*$\nAllow: /reports/public$\n';
  assert.equal(robotsAllows(rules,'/%70rivate/file'),false);
  assert.equal(robotsAllows(rules,'/reports/secret'),false);assert.equal(robotsAllows(rules,'/reports/public'),true);
  assert.equal(robotsAllows(rules,'/unrelated'),true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /秘密','/%E7%A7%98%E5%AF%86/file'),false);
});
test('redirect targets are access-checked before requesting and private targets are never requested',async()=>{
  const seen:string[]=[];
  const request=async(url:URL)=>{seen.push('fetch:'+url.pathname);return url.pathname==='/start'?{status:302,headers:{location:'/restricted'},buffer:Buffer.alloc(0)}:{status:200,headers:{},buffer:Buffer.from('source')};};
  await assert.rejects(requestRedirects('https://example.org/start',undefined,4,true,request,async url=>{seen.push('access:'+url.pathname);if(url.pathname==='/restricted')throw new Error('Restricted by fictional access policy');}),/Restricted/);
  assert.deepEqual(seen,['access:/start','fetch:/start','access:/restricted']);
  let requests=0;
  await assert.rejects(requestRedirects('https://example.org/start',undefined,4,false,async()=>{requests++;return{status:302,headers:{location:'http://169.254.169.254/latest/meta-data/'},buffer:Buffer.alloc(0)};}),/forbidden/);
  assert.equal(requests,1);
});
test('Retry-After cannot be shortened against the source rate limit',()=>{
  assert.equal(retryDelay('2'),2000);assert.throws(()=>retryDelay('120'),/later retry/);
  assert.throws(()=>retryDelay('Fri, 16 Oct 2026 12:02:00 GMT',Date.parse('2026-10-16T12:00:00Z')),/later retry/);
});
test('pre-aborted parsing and ignored async work are bounded',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(parseRemoteText('Fictional source','html',controller.signal),/Canceled/);
  await assert.rejects(boundedOperation(new Promise(()=>{}),undefined,5,'Fictional operation'),/timed out/);
});
test('PDF physical page references and technical dates survive extraction',async()=>{
  const parsed=await parsePdf(fixturePdf());
  assert.equal(parsed.pageCount,2);assert.deepEqual(parsed.pages!.map(p=>p.page),[1,2]);
  assert.equal(parsed.title,'Fictional PDF fixture');assert.equal(parsed.publishedAt,null);assert.ok(parsed.sourceMetadata?.pdfCreatedAt);
});
test('PDF extraction honestly reports the sixty-page bound',async()=>{
  const parsed=await parsePdf(fixturePdf(61));assert.equal(parsed.pageCount,61);assert.equal(parsed.pages!.length,60);assert.ok(parsed.warnings?.some(w=>w.includes('first 60')));
});
test('queued cancellation accounts for every requested URL without a connector failure',()=>{
  const store=fixture();try{const queue=new ResearchQueue(store),run=queue.enqueue('fictional',['https://example.org/a','https://example.org/b']);const canceled=queue.cancel(run.id)!;
    assert.equal(canceled.skipped,2);assert.equal(canceled.failed,0);assert.equal(canceled.results.length,2);assert.equal(store.get('connectors','html')!.status,'planned');
  }finally{store.close();}
});
test('canceling an extension that ignores its signal releases the worker without storing late success',async()=>{
  const store=fixture();try{
    let started!:()=>void;const ready=new Promise<void>(resolve=>started=resolve);
    const queue=new ResearchQueue(store,async()=>{started();return await new Promise(()=>{});}),run=queue.enqueue('fictional',['https://example.org/a']);
    const executing=queue.execute(run.id);await ready;queue.cancel(run.id);await executing;
    const saved=store.get('research_runs',run.id)!;assert.equal(queue.busy,false);assert.equal(saved.skipped,1);assert.equal(saved.failed,0);
    assert.equal(saved.retrieved,0);assert.equal(store.list('documents').length,0);assert.equal(store.get('connectors','html')!.status,'planned');
  }finally{store.close();}
});
test('job execution timeout bounds an uncooperative retriever and persists failure',async()=>{
  const store=fixture();try{
    const queue=new ResearchQueue(store,async()=>await new Promise(()=>{}),{jobTimeoutMs:10}),run=queue.enqueue('fictional',['https://example.org/a']);
    await queue.execute(run.id);const saved=store.get('research_runs',run.id)!;
    assert.equal(queue.busy,false);assert.equal(saved.state,'failed');assert.equal(saved.failed,1);assert.equal(saved.retrieved,0);
  }finally{store.close();}
});
test('cache reuse exposes source age and pending review, while force refresh actually calls retrieval',async()=>{
  const store=fixture();try{
    let calls=0;const queue=new ResearchQueue(store,async url=>{calls++;return source(url);});
    const first=queue.enqueue('fictional',['https://example.org/a']);await queue.execute(first.id);
    const cached=queue.enqueue('fictional',['https://example.org/a']);await queue.execute(cached.id);
    const saved=store.get('research_runs',cached.id)!;assert.equal(calls,1);assert.equal(saved.results[0].status,'cached');
    assert.equal(saved.manualReviewRequired,true);assert.ok(saved.results[0].cacheAgeMs>=0);assert.equal(saved.results[0].cacheTtlMs,86400000);
    const forced=queue.enqueue('fictional',['https://example.org/a'],'html',{forceRefresh:true});await queue.execute(forced.id);assert.equal(calls,2);assert.equal(store.get('research_runs',forced.id)!.retrieved,1);
  }finally{store.close();}
});
test('future cache timestamps do not suppress a real source recheck',async()=>{
  const store=fixture();try{
    let calls=0;const queue=new ResearchQueue(store,async url=>{calls++;return source(url);}),first=queue.enqueue('fictional',['https://example.org/a']);await queue.execute(first.id);
    const doc=store.list('documents')[0];doc.liveRetrievedAt='2999-01-01';store.run('UPDATE documents SET data=? WHERE id=?',JSON.stringify(doc),doc.id);
    const second=queue.enqueue('fictional',['https://example.org/a']);await queue.execute(second.id);assert.equal(calls,2);
  }finally{store.close();}
});
test('redirect aliases share one document identity and do not duplicate candidate claims',async()=>{
  const store=fixture();try{
    const queue=new ResearchQueue(store,async url=>source(url,undefined,{canonicalUrl:'https://example.org/final'})),run=queue.enqueue('fictional',['https://example.org/alias-a','https://example.org/alias-b']);
    await queue.execute(run.id);assert.equal(store.list('documents').length,1);assert.equal(store.list('claims').length,1);
    const saved=store.get('research_runs',run.id)!;assert.equal(saved.documentsProduced,1);assert.equal(saved.claimsProduced,1);assert.equal(saved.retrieved,2);
    assert.equal(store.list('documents')[0].canonicalUrl,'https://example.org/final');assert.equal(queue.findDocument('fictional','https://example.org/alias-a')?.id,queue.findDocument('fictional','https://example.org/alias-b')?.id);
  }finally{store.close();}
});
test('queue validates account, bounded public URLs and canonical duplicate requests',()=>{
  const store=fixture();try{
    const queue=new ResearchQueue(store);
    assert.throws(()=>queue.enqueue('missing',['https://example.org/a']),/account not found/);
    assert.throws(()=>queue.enqueue('fictional',['http://127.0.0.1']),/forbidden/);
    assert.throws(()=>queue.enqueue('fictional',Array.from({length:6},(_,i)=>'https://example.org/'+i)),/one to five/);
    const run=queue.enqueue('fictional',['https://example.org/a#one','https://example.org/a?utm_source=test']);assert.equal(run.requested,1);assert.equal(run.sourceConfig.submittedUrls,2);
  }finally{store.close();}
});
test('changed metadata and cancellation hints never overwrite reviewed source facts or event dates',()=>{
  const store=fixture();try{
    const queue=new ResearchQueue(store),run=queue.enqueue('fictional',['https://example.org/a']);
    const initial=queue.persistDocument(run,source('https://example.org/a'));let doc=reviewed(store,store.get('documents',initial.id)!);doc.eventDate='2019-01-01';store.run('UPDATE documents SET data=? WHERE id=?',JSON.stringify(doc),doc.id);
    const updated=source('https://example.org/a','Fictional factory expansion was canceled; the procurement deadline and scope are amended.',{title:'Revised fictional source',publishedAt:'2026-10-17'});
    const result=queue.persistDocument(run,updated,doc),saved=store.get('documents',doc.id)!;
    assert.equal(result.needsReview,true);assert.equal(saved.title,'Fictional source');assert.equal(saved.publishedAt,'2020-01-01');assert.equal(saved.eventDate,'2019-01-01');
    assert.equal(saved.liveTitle,'Revised fictional source');assert.equal(saved.livePublishedAt,'2026-10-17');
    assert.ok(saved.candidateSignals.includes('cancellation_or_delay'));assert.ok(saved.sourceChange.possibleAmendmentOrCancellation);
    assert.equal(saved.reviewStatus,'needs_review');assert.equal(store.list('claims')[0].reviewStatus,'needs_review');assert.ok(saved.latestPassage.split(/\s+/).length<=20);
  }finally{store.close();}
});
test('Unicode passage matching cannot treat an empty ASCII normalization as a match',()=>{
  const store=fixture();try{
    const queue=new ResearchQueue(store),run=queue.enqueue('fictional',['https://example.org/a']);
    const first=queue.persistDocument(run,source('https://example.org/a','Fictional factory expansion source text.'));
    const doc=reviewed(store,{...store.get('documents',first.id)!,passage:'旧工厂生产已经取消'});
    queue.persistDocument(run,source('https://example.org/a','新办公大楼已经开放并提供公共交通连接，详细情况仍然需要分析师审核。'),doc);
    assert.equal(store.get('documents',doc.id)!.livePassageMatched,false);
  }finally{store.close();}
});
test('first full-source comparison is a new baseline rather than a false unchanged finding',()=>{
  const store=fixture();try{
    const queue=new ResearchQueue(store),run=queue.enqueue('fictional',['https://example.org/a']),first=queue.persistDocument(run,source('https://example.org/a'));
    const doc=reviewed(store,store.get('documents',first.id)!);delete doc.liveFingerprint;store.run('UPDATE documents SET data=? WHERE id=?',JSON.stringify(doc),doc.id);
    const result=queue.persistDocument(run,source('https://example.org/a'),doc);assert.equal(result.changed,false);assert.equal(result.comparison,'baseline_unavailable');assert.equal(result.needsReview,true);
  }finally{store.close();}
});
test('PDF passage selection retains its page while boilerplate-only documents produce no factual claim',async()=>{
  const store=fixture();try{
    const queue=new ResearchQueue(store),run=queue.enqueue('fictional',['https://example.org/pdf']);
    const result=queue.persistDocument(run,source('https://example.org/pdf','Cover page.\nFictional tender for multifunction printer installation closes next month.',{adapter:'pdf',pages:[{page:1,text:'Cover page.'},{page:2,text:'Fictional organization overview without a current purchasing statement. '.repeat(40)+'\nFictional tender for multifunction printer installation closes next month.'}],pageCount:2}));
    const doc=store.get('documents',result.id)!;assert.equal(doc.latestPage,2);assert.match(doc.section,/PDF page 2/);assert.equal(doc.pageReferences[1].selected,true);
    complete(queue,run);
    const parsed=parseHtml('<html><body><nav>Menu search contact</nav><p>Cookie privacy subscribe newsletter manage consent accept all privacy policy cookie preferences.</p></body></html>');
    const weakQueue=new ResearchQueue(store,async url=>source(url,parsed.text,{...parsed})),weak=weakQueue.enqueue('fictional',['https://example.org/weak']);await weakQueue.execute(weak.id);
    const saved=store.get('research_runs',weak.id)!;assert.equal(saved.documentsProduced,1);assert.equal(saved.claimsProduced,0);assert.equal(saved.results[0].findingStatus,'no_substantive_candidate_identified');
  }finally{store.close();}
});
