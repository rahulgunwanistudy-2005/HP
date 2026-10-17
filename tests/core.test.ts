import test from 'node:test';
import assert from 'node:assert/strict';
import {Store, hash, type RecordData} from '../server/db.ts';
import {defaultPolicy, eligibility, eventClusterKey, freshness, rank, resolveEntity, scoreOpportunity} from '../server/intelligence.ts';
import {csv, csvCell, escapeHtml} from '../server/exports.ts';
import {isPublicAddress, parseFeed, parseHtml, parseJson, resolvePublic, stripHtml, validatePublicUrl} from '../server/retrieval.ts';
import {ResearchQueue, type Retriever} from '../server/research.ts';

// All entities, sources, dates and purchasing notices in this file are fictional
// deterministic test fixtures. No external endpoint is contacted by these tests.
const AS_OF = new Date('2026-10-16T12:00:00Z');
const territory = (): RecordData => ({id:'primary',verificationStatus:'verified',countries:['SG'],exclusions:[],eligibilityBasis:'operating_location'});
const account = (): RecordData => ({id:'fictional-parent',name:'Fictional Test Enterprise',domain:'fictional.example.org',hqCountry:'US',facilities:[{id:'sg-site',country:'SG'},{id:'us-site',country:'US'}]});
const document = (patch: RecordData = {}): RecordData => ({id:'source-a',origin:'fictional-primary',family:'company_newsroom',publishedAt:'2026-10-10',eventDate:'2026-10-09',retrievedAt:'2026-10-16T00:00:00Z',reviewStatus:'reviewed',...patch});
function opportunity(patch: RecordData = {}): RecordData {
  return {id:'fictional-op',facilityId:'sg-site',eventTitle:'Fictional engineering facility',eventDate:'2026-10-09',dimensions:{evidence:4,fit:4,timing:4,scale:4,access:4,feasibility:4},scale:'Four disclosed fictional equipment units',evidenceIds:['source-a'],contradictionIds:[],documents:[document()],routeAssessed:true,procurement:{explicit:true,status:'open',verifiedAt:'2026-10-15T12:00:00Z',deadline:'2026-11-01T12:00:00Z'},...patch};
}
const score = (o: RecordData, a=account(), t=territory()) => scoreOpportunity(o,a,t,defaultPolicy,AS_OF);
const component = (result: RecordData, key: string) => result.components.find((c: RecordData)=>c.key===key);

test('an unverified territory cannot turn perfect fit and an open notice into pursuit eligibility',()=>{
  const result=score(opportunity(),account(),{...territory(),verificationStatus:'unverified',countries:[]});
  assert.equal(result.eligibility.status,'unresolved');
  assert.equal(result.readiness,'Watchlist');
  assert.notEqual(result.gates.find((g:RecordData)=>g.label==='Territory eligibility').status,'pass');
});

test('operating-location eligibility follows the opportunity facility, independently of parent HQ',()=>{
  assert.equal(eligibility(account(),territory(),{facilityId:'sg-site'}).status,'confirmed');
  assert.notEqual(eligibility(account(),territory(),{facilityId:'us-site'}).status,'confirmed');
  assert.equal(eligibility(account(),territory(),{facilityId:'nonexistent'}).status,'unresolved');
});

test('an unbound global initiative does not inherit a matching subsidiary facility',()=>{
  const global=opportunity({facilityId:null,facilityCountry:null,geographicScope:'global'});
  assert.notEqual(eligibility(account(),territory(),global).status,'confirmed');
  assert.notEqual(score(global).readiness,'Active procurement');
});

test('purchasing location remains unknown until evidenced, while an explicit HQ rule is separate',()=>{
  assert.equal(eligibility(account(),{...territory(),eligibilityBasis:'purchasing_location'}).status,'unresolved');
  assert.equal(eligibility({...account(),purchasingCountry:'SG'},{...territory(),eligibilityBasis:'purchasing_location'}).status,'confirmed');
  assert.equal(eligibility(account(),{...territory(),eligibilityBasis:'headquarters',countries:['US']}).status,'confirmed');
});

test('explicit country exclusions also apply to the deployment facility',()=>{
  assert.equal(eligibility(account(),{...territory(),exclusions:['SG']},{facilityId:'sg-site'}).status,'excluded');
});

test('unknown score dimensions receive zero without redistributing their weights',()=>{
  const result=score(opportunity({dimensions:{evidence:4,fit:4,timing:null,scale:null,access:null,feasibility:null},scale:'Value unquantified'}));
  assert.equal(result.total,45);
  for(const key of ['timing','scale','access','feasibility'])assert.equal(component(result,key).points,0);
  assert.equal(result.components.reduce((n:number,c:RecordData)=>n+c.weight,0),100);
});

test('a claimed quantity cannot be scored when scope is explicitly unknown',()=>{
  const result=score(opportunity({scale:'Quantities unknown; value unquantified'}));
  assert.equal(component(result,'scale').points,0);
  assert.equal(component(result,'scale').value,null);
});

test('score recomputation is reproducible and does not mutate the opportunity',()=>{
  const o=opportunity(),before=structuredClone(o);
  assert.deepEqual(score(o),score(o));
  assert.deepEqual(o,before);
  assert.equal(score(o).total,100);
  assert.match(score(o).explanation,/prioritization/);
});

test('a new retrieval does not refresh an old event, and unknown dates remain unknown',()=>{
  const old=document({eventDate:'2020-01-01',publishedAt:'2026-10-15',retrievedAt:AS_OF.toISOString()});
  assert.equal(freshness(old,defaultPolicy,AS_OF).status,'stale');
  assert.ok(freshness(old,defaultPolicy,AS_OF).ageDays>2000);
  assert.equal(freshness({...old,eventDate:null,publishedAt:null},defaultPolicy,AS_OF).status,'unknown');
  const result=score(opportunity({documents:[old],procurement:{explicit:false,status:'unknown'}}));
  assert.equal(result.readiness,'Watchlist');
  assert.ok(component(result,'timing').value<=1);
});

test('display source-family labels retain category-specific freshness policies',()=>{
  const procurement=document({family:'Procurement notices',eventDate:'2026-10-01'});
  const filing=document({family:'Regulatory and exchange filings',eventDate:'2026-01-01'});
  assert.equal(freshness(procurement,defaultPolicy,AS_OF).thresholdDays,7);
  assert.equal(freshness(procurement,defaultPolicy,AS_OF).status,'stale');
  assert.equal(freshness(filing,defaultPolicy,AS_OF).thresholdDays,400);
  assert.equal(freshness(filing,defaultPolicy,AS_OF).status,'current');
});

test('expired and already awarded notices cannot be promoted by high numeric scores',()=>{
  for(const procurement of [
    {explicit:true,status:'open',verifiedAt:'2026-10-15',deadline:'2026-10-01'},
    {explicit:true,status:'awarded',verifiedAt:'2026-10-15'},
    {explicit:true,status:'superseded',verifiedAt:'2026-10-15'}
  ]){
    const result=score(opportunity({procurement}));
    assert.equal(result.readiness,'Watchlist');
    assert.equal(result.gates.find((g:RecordData)=>g.label==='Procurement status').status,'blocked');
  }
});

test('active procurement needs recent explicit verification and an assessed route',()=>{
  assert.equal(score(opportunity()).readiness,'Active procurement');
  assert.notEqual(score(opportunity({routeAssessed:false})).readiness,'Active procurement');
  assert.notEqual(score(opportunity({procurement:{explicit:true,status:'open',verifiedAt:'2026-10-01',deadline:'2026-11-01'}})).readiness,'Active procurement');
  assert.notEqual(score(opportunity({procurement:{explicit:true,status:'open',verifiedAt:'2026-11-01',deadline:'2026-11-15'}})).readiness,'Active procurement');
  assert.notEqual(score(opportunity({procurement:{explicit:false,status:'open',verifiedAt:'2026-10-15',deadline:'2026-11-01'}})).readiness,'Active procurement');
});

test('a material reviewed contradiction caps evidence and suspends active classification for review',()=>{
  const result=score(opportunity({documents:[document(),document({id:'source-b',origin:'fictional-regulator'})],contradictionIds:['source-b']}));
  assert.ok(component(result,'evidence').value<=2);
  assert.notEqual(result.readiness,'Active procurement');
  assert.equal(result.confidence,'Low');
  assert.notEqual(result.gates.find((g:RecordData)=>g.label==='Evidence review').status,'pass');
});

test('a changed source requires review before it can support active purchasing',()=>{
  const result=score(opportunity({documents:[document(),document({id:'changed-source',reviewStatus:'needs_review'})]}));
  assert.equal(result.readiness,'Watchlist');
  assert.ok(component(result,'evidence').value<=2);
});

test('a duplicate from the same origin does not manufacture independent corroboration',()=>{
  const base=opportunity({procurement:{explicit:false,status:'unknown'},dimensions:{evidence:2,fit:3,timing:2,scale:1,access:null,feasibility:null}});
  const duplicate={...base,evidenceIds:['source-a','duplicate'],documents:[document(),document({id:'duplicate'})]};
  assert.equal(score(duplicate).confidence,score(base).confidence);
  assert.equal(score(duplicate).total,score(base).total);
  const shared={...base,evidenceIds:['source-a','agency-repost'],documents:[document({independenceGroup:'same-announcement'}),document({id:'agency-repost',origin:'fictional-investment-agency',independenceGroup:'same-announcement'})]};
  assert.equal(score(shared).confidence,score(base).confidence);
});

test('readiness tiers rank before scores, with deterministic ties',()=>{
  const rows=[{id:'z',score:{readiness:'Watchlist',total:100}},{id:'b',score:{readiness:'Triggered qualification',total:1}},{id:'a',score:{readiness:'Triggered qualification',total:1}}];
  assert.deepEqual(rows.sort(rank).map(r=>r.id),['a','b','z']);
});

test('entity resolution preserves subsidiary and duplicate-domain uncertainty',()=>{
  const accounts=[{id:'parent',domain:'www.fictional.example.org',legalEntity:'Fictional Holdings plc'}];
  assert.equal(resolveEntity({domain:'fictional.example.org'},accounts).id,'parent');
  assert.equal(resolveEntity({domain:'fictional.example.org',subsidiary:true,legalName:'Fictional Subsidiary'},accounts).status,'needs_review');
  assert.equal(resolveEntity({domain:'fictional.example.org'},[...accounts,{...accounts[0],id:'another-entity'}]).status,'ambiguous');
  assert.equal(resolveEntity({legalName:'Unrelated Fictional Enterprise'},accounts).status,'unresolved');
});

test('duplicate event labels cluster while distinct accounts, dates and facilities stay separate',()=>{
  const key=eventClusterKey('fictional','Engineering Facility: Expansion!','2026-10-01','sg-site');
  assert.equal(key,eventClusterKey('fictional','engineering facility expansion','2026-10-01','sg-site'));
  for(const [a,d,f] of [['another','2026-10-01','sg-site'],['fictional','2026-10-02','sg-site'],['fictional','2026-10-01','us-site']])assert.notEqual(key,eventClusterKey(a,'engineering facility expansion',d,f));
});

test('CSV formula protection handles formula markers hidden behind whitespace',()=>{
  for(const payload of ['=1+1','+SUM(A1:A2)','-cmd','@SUM(A1:A2)',' \t\r\n=HYPERLINK("https://example.org")','\tcommand','\rcommand'])assert.ok(csvCell(payload).startsWith('"\''),payload);
  assert.equal(csvCell('Ordinary, "quoted" text'),'"Ordinary, ""quoted"" text"');
  assert.equal(csvCell(null),'""');
  const exported=csv(['title'],[['Line one\nLine two']]);
  assert.ok(exported.startsWith('\uFEFF"title"\r\n'));
  assert.ok(exported.includes('"Line one\nLine two"'));
});

test('source HTML cannot carry executable markup into text or printable HTML',()=>{
  const malicious='<title>Fictional &amp; Co</title><script>alert("stolen")</script><style>body{display:none}</style><main><h1>Facility opened</h1><img src=x onerror=alert(1)><p>Public claim</p></main>';
  const parsed=parseHtml(malicious);
  assert.equal(parsed.title,'Fictional & Co');
  assert.ok(parsed.text.includes('Facility opened'));
  assert.ok(!parsed.text.includes('stolen'));
  assert.ok(!parsed.text.includes('<img'));
  assert.ok(!parsed.text.includes('display:none'));
  assert.equal(escapeHtml('<img src=x onerror="x">'), '&lt;img src=x onerror=&quot;x&quot;&gt;');
  assert.ok(!escapeHtml(stripHtml('&lt;script&gt;alert(1)&lt;/script&gt;')).includes('<script>'));
});

test('SSRF protection rejects private, reserved and mapped address literals',()=>{
  for(const url of ['http://127.0.0.1','http://127.1','http://2130706433','http://0x7f000001','http://10.0.0.8','http://172.16.0.1','http://192.168.1.1','http://169.254.169.254/latest/meta-data/','http://0.0.0.0','http://[::1]','http://[fe80::1]','http://[fc00::1]','http://[::ffff:127.0.0.1]','http://[::ffff:10.0.0.1]','http://[2001:db8::1]'])assert.throws(()=>validatePublicUrl(url),url);
  assert.equal(isPublicAddress('::ffff:192.168.1.3'),false);
});

test('public URL validation rejects credentials, unsupported ports, schemes and internal names',()=>{
  for(const url of ['file:///etc/passwd','ftp://example.org/file','https://user:secret@example.org','http://example.org:8080','http://localhost','http://service.localhost','http://worker.internal','http://printer.local','http://singlelabel'])assert.throws(()=>validatePublicUrl(url),url);
  assert.equal(validatePublicUrl('https://example.org/document#passage').href,'https://example.org/document');
  assert.equal(isPublicAddress('8.8.8.8'),true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
});

test('DNS checks reject empty and mixed public/private results without using the network',async()=>{
  const mixed=(async()=>[{address:'8.8.8.8',family:4},{address:'192.168.1.10',family:4}]) as any;
  const mapped=(async()=>[{address:'8.8.8.8',family:4},{address:'::ffff:127.0.0.1',family:6}]) as any;
  await assert.rejects(resolvePublic('fictional.example.org',mixed),/forbidden|private/i);
  await assert.rejects(resolvePublic('fictional.example.org',mapped),/forbidden|private/i);
  await assert.rejects(resolvePublic('fictional.example.org',(async()=>[]) as any),/forbidden|private/i);
  const answers=[{address:'8.8.8.8',family:4},{address:'2606:4700:4700::1111',family:6}];
  assert.deepEqual(await resolvePublic('fictional.example.org',(async()=>answers) as any),answers);
});

test('feed parsing rejects DTD and entity declarations before expansion',()=>{
  assert.throws(()=>parseFeed('<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss><channel><title>&xxe;</title></channel></rss>'),/entities|DTD/i);
  assert.throws(()=>parseFeed('<!ENTITY boom "expanded"><rss><channel/></rss>'),/entities|DTD/i);
  assert.throws(()=>parseFeed('<html><body>not a feed</body></html>'),/not a supported/i);
});

test('RSS item dates remain distinct from feed updates and descriptions are plain text',()=>{
  const parsed=parseFeed('<rss version="2.0"><channel><title>Fictional feed</title><pubDate>Fri, 16 Oct 2026 10:00:00 GMT</pubDate><item><title>Historical event</title><link>https://example.org/a</link><pubDate>Wed, 01 Jan 2020 10:00:00 GMT</pubDate><description><![CDATA[<b>Retained claim</b><script>bad()</script>]]></description></item></channel></rss>');
  assert.equal(parsed.publishedAt,null);
  assert.equal(parsed.items.length,1);
  assert.equal(parsed.items[0].publishedAt,'Wed, 01 Jan 2020 10:00:00 GMT');
  assert.equal(parsed.items[0].text,'Retained claim');
});

test('malformed JSON fails explicitly and extraction is bounded',()=>{
  assert.throws(()=>parseJson('{"broken":'),SyntaxError);
  const large=parseJson(JSON.stringify({title:'Fictional JSON',records:Array.from({length:1000},(_,i)=>'entry-'+i)}));
  assert.ok(large.text.includes('entry-0'));
  assert.ok(!large.text.includes('entry-999'));
  assert.ok(large.text.length<=500000);
});

function fixtureStore(){
  const store=new Store(':memory:');
  store.run('INSERT INTO accounts VALUES (?,?,?,?)','fictional-parent','Fictional Test Enterprise','fictional.example.org',JSON.stringify(account()));
  store.run('INSERT INTO territories VALUES (?,?,?)','primary',1,JSON.stringify(territory()));
  store.run('INSERT INTO scoring_policies VALUES (?,?,?)',defaultPolicy.id,AS_OF.toISOString(),JSON.stringify(defaultPolicy));
  for(const id of ['html','feed','json','pdf'])store.run('INSERT INTO connectors VALUES (?,?,?)',id,1,JSON.stringify({id,enabled:true,status:'planned'}));
  return store;
}
function extracted(url:string,text='Fictional public source passage.'):Awaited<ReturnType<Retriever>>{
  return {url,canonicalUrl:url,title:'Fictional test source',publishedAt:'2020-01-01',text,items:[],fingerprint:hash(text),bytes:Buffer.byteLength(text),adapter:'html',contentType:'text/html',status:200};
}

test('a partially failed research run persists honest counts and unreviewed candidate claims',async()=>{
  const store=fixtureStore();
  try{
    const fake:Retriever=async url=>{if(url.endsWith('/fail'))throw new Error('Fictional restricted source');return extracted(url);};
    const queue=new ResearchQueue(store,fake),run=queue.enqueue('fictional-parent',['https://example.org/good','https://example.org/fail']);
    await queue.execute(run.id);
    const saved=store.get('research_runs',run.id)!;
    assert.equal(saved.state,'partial');assert.equal(saved.retrieved,1);assert.equal(saved.failed,1);
    assert.equal(saved.eventsProduced,0);assert.equal(saved.documentsProduced,1);assert.equal(saved.claimsProduced,1);
    assert.equal(store.list('claims')[0].reviewStatus,'needs_review');
    assert.equal(store.list('documents')[0].eventDate,null);
    assert.equal(store.get('connectors','html')?.status,'live and tested');
  }finally{store.close();}
});

test('cancellation during retrieval cannot store a success or a generated claim',async()=>{
  const store=fixtureStore();
  try{
    let started!:()=>void;const ready=new Promise<void>(resolve=>started=resolve);
    const fake:Retriever=async(_url,_adapter,signal)=>{started();return await new Promise((_resolve,reject)=>{signal!.addEventListener('abort',()=>reject(new Error('Fictional canceled retrieval')),{once:true});});};
    const queue=new ResearchQueue(store,fake),run=queue.enqueue('fictional-parent',['https://example.org/slow']);
    const execution=queue.execute(run.id);await ready;queue.cancel(run.id);await execution;
    const saved=store.get('research_runs',run.id)!;
    assert.equal(saved.cancelRequested,true);assert.notEqual(saved.state,'completed');
    assert.equal(saved.retrieved,0);assert.equal(store.list('documents').length,0);assert.equal(store.list('claims').length,0);
  }finally{store.close();}
});

test('source changes preserve event age, append provenance and force document and claim review',async()=>{
  const store=fixtureStore();
  try{
    const queue=new ResearchQueue(store),run=queue.enqueue('fictional-parent',['https://example.org/change']);
    const first=queue.persistDocument(run,extracted('https://example.org/change','Fictional facility approved in 2020.'));
    const doc=store.get('documents',first.id)!;
    const reviewed={...doc,eventDate:'2020-01-01',reviewStatus:'reviewed'};
    store.run('UPDATE documents SET review_status=?,data=? WHERE id=?','reviewed',JSON.stringify(reviewed),doc.id);
    const claim=store.list('claims')[0];
    store.run('UPDATE claims SET review_status=?,data=? WHERE id=?','reviewed',JSON.stringify({...claim,reviewStatus:'reviewed'}),claim.id);
    const result=queue.persistDocument(run,extracted('https://example.org/change','Fictional facility canceled in 2026.'),reviewed);
    const changed=store.get('documents',doc.id)!;
    assert.equal(result.changed,true);assert.equal(result.needsReview,true);
    assert.equal(changed.reviewStatus,'needs_review');assert.equal(changed.eventDate,'2020-01-01');
    assert.equal(freshness(changed,defaultPolicy,AS_OF).status,'stale');
    assert.equal(store.list('document_versions').length,2);
    assert.equal(store.list('claims')[0].reviewStatus,'needs_review');
  }finally{store.close();}
});

test('interrupted running jobs are recovered as partial without inventing new results',()=>{
  const store=fixtureStore();
  try{
    const queue=new ResearchQueue(store),run=queue.enqueue('fictional-parent',['https://example.org/restart']);
    run.state='running';queue.save(run);
    new ResearchQueue(store);
    const recovered=store.get('research_runs',run.id)!;
    assert.equal(recovered.state,'partial');assert.equal(recovered.retrieved,0);
    assert.equal(recovered.results.length,0);assert.match(recovered.errors.join(' '),/restarted/i);
  }finally{store.close();}
});
