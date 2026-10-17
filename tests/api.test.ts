import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store,hash} from '../server/db.ts';
import {seed,Repository} from '../server/repository.ts';
import {createApp} from '../server/app.ts';
import {ResearchQueue,type Retriever} from '../server/research.ts';
import {brief,printBrief,opportunitiesCsv} from '../server/exports.ts';
import {isPublicAddress,parseRemoteText} from '../server/retrieval.ts';

test('well-known NAT64 supports public targets while private embedded destinations remain blocked',()=>{
 assert.equal(isPublicAddress('64:ff9b::808:808'),true);
 for(const address of ['64:ff9b::7f00:1','64:ff9b::a00:1','64:ff9b::a9fe:a9fe','64:ff9b:1::808:808'])assert.equal(isPublicAddress(address),false);
});
test('all text adapters parse in bounded child processes and discard executable HTML',async()=>{
 const html=await parseRemoteText('<title>Fictional fixture</title><script>steal()</script><p>Public fixture passage</p>','html');assert.equal(html.title,'Fictional fixture');assert.ok(!html.text.includes('steal'));assert.match(html.text,/Public fixture/);
 assert.match((await parseRemoteText('{"title":"Fictional JSON","count":2}','json')).text,/Fictional JSON/);
 assert.match((await parseRemoteText('<rss><channel><title>Fictional feed</title><item><title>Fictional event</title></item></channel></rss>','feed')).text,/Fictional event/);
 await assert.rejects(parseRemoteText('<!DOCTYPE fake><rss/>','feed'),/DTD|entities/);
});

test('reviewed corpus preserves evidence relationships, real event clusters, unknown authorities and scope exclusion',()=>{
 const store=new Store(':memory:');seed(store);const repo=new Repository(store),m=repo.metrics();
 assert.equal(m.deepAccounts,5);assert.equal(m.screenedAccounts,50);assert.equal(m.opportunities,39);assert.equal(m.activeProcurement,0);assert.equal(m.sourceFamilies,9);assert.equal(m.uniqueEvents,38);
 const ops=repo.opportunities();assert.equal(ops.find(o=>o.id==='changi-afisms-excluded')?.score.readiness,'Blocked or excluded');
 assert.equal(ops.find(o=>o.id==='thk-print-procurement')?.dimensions.scale,null);
 for(const o of ops){for(const d of o.documents)assert.equal(d.accountId,o.accountId);for(const b of o.buyers){if(b.person){assert.equal(b.status,'verified');assert.ok(b.sourceUrl&&b.evidenceIds.length);assert.ok(o.documents.some((d:any)=>b.evidenceIds.includes(d.id)&&d.reviewStatus==='reviewed'&&d.claim.includes(b.person)));assert.match(b.authority,/not established/);}else assert.equal(b.status,'unresolved');}}
 assert.equal(store.all('PRAGMA foreign_key_check').length,0);store.close();
});

test('analyst notes, action progress and score snapshots survive a new database connection',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hp-persistence-'));const path=join(dir,'db.sqlite');let store=new Store(path);seed(store);let repo=new Repository(store);const id=repo.opportunities()[0].id;
 repo.saveOpportunity(id,{note:'FICTIONAL TEST NOTE — persistence only',analystStatus:'qualifying'});const a=repo.opportunity(id)!.actions[0];store.run('UPDATE actions SET status=?,data=? WHERE id=?','done',JSON.stringify({...a,status:'done'}),a.id);const count=store.list('score_snapshots').length;store.close();store=new Store(path);repo=new Repository(store);
 assert.equal(repo.opportunity(id)!.analystStatus,'qualifying');assert.match(repo.opportunity(id)!.notes[0].text,/FICTIONAL TEST NOTE/);assert.equal(repo.opportunity(id)!.actions[0].status,'done');assert.equal(store.list('score_snapshots').length,count);seed(store);assert.equal(repo.opportunity(id)!.notes.length,1);store.close();rmSync(dir,{recursive:true});
});

test('account exports retain hypotheses, scope, source chronology, limitations and action stop conditions',()=>{
 const s=new Store(':memory:');seed(s);const r=new Repository(s);for(const a of r.accounts()){const md=brief(a,r.territory());assert.match(md,/hypothes/i);assert.match(md,/Territory:/);assert.match(md,/Value|value|quantit/);assert.ok(md.includes(a.documents[0].url));assert.match(md,/retrieved/);assert.match(md,/Stop if:/);assert.match(md,/not complete archived/);assert.match(printBrief({...a,name:'<script>alert(1)</script>'},r.territory()),/&lt;script&gt;/);}const text=opportunitiesCsv(r.opportunities());assert.ok(text.startsWith('\uFEFF'));assert.match(text,/source_dates/);assert.match(text,/score_version/);s.close();
});

// HTTP integration is opt-in because some sandbox profiles prohibit listening on loopback.
// RUN_HTTP_TESTS=1 npm test exercises actual validated Express routes against deterministic local data.
test('API end-to-end: validation, territory recomputation, persistence, review, jobs, cancellation and exports',{skip:process.env.RUN_HTTP_TESTS!=='1'},async()=>{
 const s=new Store(':memory:');seed(s);const fixture:Retriever=async(url)=>({title:'FICTIONAL HTTP TEST',text:'Fictional fixture supporting text only.',publishedAt:null,items:[],url,canonicalUrl:url,fingerprint:hash(url),bytes:20,adapter:'html',contentType:'text/html',status:200});const queue=new ResearchQueue(s,fixture);const {app,repo}=createApp(s,queue);const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address() as any;const base=`http://127.0.0.1:${address.port}/api`;const request=async(path:string,method='GET',body?:any,origin?:string)=>{const response=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});const type=response.headers.get('content-type')??'';return{status:response.status,body:type.includes('json')?await response.json():await response.text()};};
 try{
 assert.equal((await request('/bootstrap')).status,200);assert.equal((await request('/territory','PUT',{name:'bad'})).status,400);assert.equal((await request('/research-runs','POST',{accountId:'micron',urls:['http://127.0.0.1/secret']})).status,400);
 assert.equal((await request('/opportunities/micron-engineering','PATCH',{note:'fictional'},'https://evil.example')).status,403);
 assert.equal((await request('/opportunities/micron-engineering','PATCH',{routeAssessment:{status:'eligible',basis:'Fictional test basis'}})).status,400);
 const t:Record<string,any>={...repo.territory(),name:'Fictional test boundary',verificationStatus:'verified',countries:['SG']};for(const key of ['id','version','updatedAt','verificationBasis','membershipSource','scopeConfirmedAt','configuredBy'])delete t[key];assert.equal((await request('/territory','PUT',t)).status,200);
 assert.equal(repo.opportunity('micron-engineering')!.eligibility.status,'confirmed');assert.equal(repo.opportunity('dreamworks-workstation-review'),undefined);assert.ok(s.get('opportunities','dreamworks-workstation-review'));assert.equal(repo.opportunity('thk-print-procurement')!.score.readiness,'Triggered qualification');
 assert.equal((await request('/opportunities/thk-print-procurement','PATCH',{routeAssessment:{status:'ineligible',basis:'FICTIONAL TEST: incompatible route'},note:'FICTIONAL TEST: this is not a real eligibility finding.'})).status,200);assert.equal(repo.opportunity('thk-print-procurement')!.score.readiness,'Blocked or excluded');
 const previous=s.get('documents','micron-fab-2026')!.claim;assert.equal((await request('/opportunities/micron-engineering','PATCH',{analystStatus:'qualifying',note:'FICTIONAL API TEST NOTE'})).status,200);assert.equal((await request('/opportunities/micron-engineering')).body.notes[0].text,'FICTIONAL API TEST NOTE');assert.equal(s.get('documents','micron-fab-2026')!.claim,previous);
 assert.equal((await request('/opportunities?pageSize=2')).body.items.length,2);assert.equal((await request('/opportunities?page=-1')).status,400);assert.equal((await request('/opportunities?search=zzzz-no-match')).body.total,0);
 const graph=(await request('/graph/micron')).body;assert.ok(graph.nodes.length>5);assert.ok(graph.edges.some((e:any)=>e.label==='supports'));
 const run=await request('/research-runs','POST',{accountId:'micron',urls:['https://fictional.example.org/fixture']});assert.equal(run.status,202);assert.equal((await request('/research-runs','POST',{accountId:'micron',urls:['https://fictional.example.org/another']})).status,409);await queue.execute(run.body.id);assert.equal((await request('/research-runs/'+run.body.id)).body.state,'completed');
 const candidate=s.get('research_runs',run.body.id)!.results[0].documentId;assert.equal((await request('/evidence/'+candidate+'/review','POST',{status:'reviewed'})).status,400);assert.equal((await request('/evidence/'+candidate+'/review','POST',{status:'reviewed',claim:'Fictional fixture supporting text only.',family:'company_newsroom',publishedAt:'2026-10-16',eventDate:null})).status,200);assert.equal((await request('/opportunities/micron-engineering/evidence','POST',{documentId:candidate,relationship:'context'})).status,200);assert.equal((await request('/opportunities/thk-print-procurement/evidence','POST',{documentId:candidate,relationship:'supports'})).status,400);
 const canceled=(await request('/research-runs','POST',{accountId:'micron',urls:['https://fictional.example.org/cancel']})).body;assert.equal((await request('/research-runs/'+canceled.id+'/cancel','POST',{})).body.state,'partial');
 assert.equal((await request('/scores/recompute','POST',{weights:{evidence:100,fit:100,timing:100,scale:100,access:100,feasibility:100}})).status,400);assert.equal((await request('/scores/recompute','POST',{weights:{evidence:30,fit:20,timing:15,scale:15,access:10,feasibility:10}})).status,200);assert.equal(repo.policy().version,'provisional-v2');
 for(const documentId of repo.opportunity('micron-engineering')!.evidenceIds)assert.equal((await request('/evidence/'+documentId+'/review','POST',{status:'rejected',note:'FICTIONAL TEST rejection'})).status,200);assert.equal(repo.opportunity('micron-engineering')!.score.readiness,'Watchlist');
 const exported=await request('/exports/accounts/thk?format=md');assert.equal(exported.status,200);assert.match(exported.body,/THK\/CS\/16\/T\/FY26/);assert.equal((await request('/exports/opportunities?format=csv')).status,200);assert.equal((await request('/not-a-real-route')).status,404);
 }finally{queue.stop();await new Promise<void>(resolve=>server.close(()=>resolve()));s.close();}
});
