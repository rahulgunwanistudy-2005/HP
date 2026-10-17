import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Store} from '../server/db.ts';
import {Repository,seed} from '../server/repository.ts';
import {applyBuyerEnrichment} from '../scripts/apply-buyer-enrichment.ts';
import {brief} from '../server/exports.ts';
import {presentation} from '../server/workspace.ts';
import {createApp} from '../server/app.ts';

test('USA and Canada reference accounts leave active lists without deleting historical data or Singapore operations',()=>{
  const s=new Store(':memory:');try{seed(s);const r=new Repository(s);
    assert.equal(r.accounts().length,35);assert.equal(r.opportunities().length,39);assert.equal(s.list('accounts').length,37);
    for(const id of ['epac','dreamworks']){assert.equal(r.account(id),undefined);assert.ok(s.get('accounts',id));assert.ok(s.list('documents','WHERE account_id=?',id).length);}
    assert.ok(r.documents().every(d=>!['epac','dreamworks'].includes(d.accountId)));
    assert.deepEqual(new Set(r.accounts().flatMap(a=>a.facilities.map((f:any)=>f.country))),new Set(['ID','MY','PH','SG','TH','VN']));
    assert.equal(r.account('micron')!.hqCountry,'US');assert.equal(r.account('micron')!.eligibility.status,'confirmed');
    assert.ok(r.bootstrap().coverage.screened.every((a:any)=>!['US','CA'].includes(a.country)));
  }finally{s.close();}
});

test('every active account has a documented entity and sourced buying route without fabricating deal authority',()=>{
  const s=new Store(':memory:');try{seed(s);const r=new Repository(s);
    for(const a of r.accounts()){const p=a.buyingProfile;assert.ok(p,a.name);assert.doesNotMatch(a.legalEntity,/^unverified|^unresolved/i);assert.equal(a.legalEntity,p.operatingEntity);assert.ok(p.procurementTeam&&p.supplierProcess&&p.scopeBoundary&&p.approvalCheck);assert.ok(p.sources.some((source:any)=>source.url===p.supplierUrl));assert.ok(p.sources.every((source:any)=>source.checkedAt&&source.url.startsWith('https://')));assert.match(p.technicalOwnerStatus,/Qualification role/);assert.ok(!p.person);for(const c of p.contacts)assert.ok(c.sourceUrl&&c.purpose);}
    assert.match(r.account('ptt')!.purchasingOrganization,/Material and Commercial Procurement Division/);
    assert.match(r.account('sm-investments')!.buyingProfile.supplierProcess,/PO issuance/);
    assert.match(r.account('lego')!.buyingProfile.supplierProcess,/manufacturing and distribution purchase orders are not generated in Coupa/);
    assert.match(r.account('singapore-airlines')!.buyingProfile.scopeBoundary,/excludes SIA Engineering/);
    assert.equal(r.metrics().activeProcurement,0);
  }finally{s.close();}
});

test('buyer enrichment preserves evidence timestamps, immutable versions, notes, actions and analyst-edited fields',()=>{
  const s=new Store(':memory:');try{seed(s);const a=s.get('accounts','dbs')!;s.run('UPDATE accounts SET data=? WHERE id=?',JSON.stringify({...a,editedAt:new Date().toISOString(),legalEntity:'FICTIONAL analyst entity retained',purchasingOrganization:'FICTIONAL analyst purchasing scope retained'}),a.id);
    const docs=s.list('documents').map(d=>({id:d.id,retrievedAt:d.retrievedAt,reviewedAt:d.reviewedAt,publishedAt:d.publishedAt,eventDate:d.eventDate}));const versions=s.all('SELECT * FROM document_versions');const actions=s.all('SELECT * FROM actions');
    new Repository(s).saveOpportunity('micron-engineering',{note:'FICTIONAL buyer-enrichment preservation test'});const notes=s.all('SELECT * FROM analyst_notes');
    applyBuyerEnrichment(s);applyBuyerEnrichment(s);
    assert.deepEqual(s.list('documents').map(d=>({id:d.id,retrievedAt:d.retrievedAt,reviewedAt:d.reviewedAt,publishedAt:d.publishedAt,eventDate:d.eventDate})),docs);assert.deepEqual(s.all('SELECT * FROM document_versions'),versions);assert.deepEqual(s.all('SELECT * FROM actions'),actions);assert.deepEqual(s.all('SELECT * FROM analyst_notes'),notes);assert.equal(s.get('accounts','dbs')!.legalEntity,'FICTIONAL analyst entity retained');assert.ok(s.get('accounts','dbs')!.buyingProfile.sources.length);assert.equal(s.all('PRAGMA foreign_key_check').length,0);
  }finally{s.close();}
});

test('report edition is 15 October while audit / machine-readable source chronology remains actual',()=>{
  const s=new Store(':memory:');try{seed(s);const r=new Repository(s),a=r.account('kasikornbank')!,before=s.get('documents','kasikornbank-profile-2026')!;
    assert.equal(presentation.reportDate,'2026-10-15');assert.notEqual(before.retrievedAt.slice(0,10),'2026-10-15');
    const report=brief(a,r.territory(),presentation);assert.match(report,/Report edition: 2026-10-15/);assert.match(report,/actual retrieved \/ reviewed timestamps are retained in Research operations/);assert.match(report,/2026-07-31/);assert.match(report,/Who buys\?/);assert.ok(report.includes(a.buyingProfile.supplierUrl));assert.equal(s.get('documents',before.id)!.retrievedAt,before.retrievedAt);
    const full=brief(a,r.territory());assert.ok(full.includes(before.retrievedAt));
    const raw=JSON.parse(readFileSync(new URL('../data/buying-organizations.json',import.meta.url),'utf8'));assert.equal(Object.keys(raw.profiles).length,35);assert.notEqual(raw.checkedAt.slice(0,10),'2026-10-15');
  }finally{s.close();}
});

test('published construction procurement role stays context and cannot verify a bank endpoint buyer or buying trigger',()=>{
  const s=new Store(':memory:');try{seed(s);const r=new Repository(s),a=r.account('bdo')!,o=a.opportunities[0],d=a.documents.find((d:any)=>d.id==='bdo-procurement-role-context-2026')!;
    assert.equal(d.family,'careers');assert.equal(d.publishedAt,'2026-10-14');assert.match(d.claim,/construction-material purchasing/);assert.ok(o.contextIds.includes(d.id));assert.ok(!o.evidenceIds.includes(d.id));assert.equal(o.score.readiness,'Watchlist');assert.equal(o.eventDate,null);assert.match(a.buyingProfile.scopeBoundary,/does not identify the endpoint-device category buyer/);
    assert.match(r.account('dbs')!.purchasingOrganization,/Group Procurement and Services/);assert.match(r.account('sunway')!.purchasingOrganization,/2026 prospectus identifies CFO Chelsea Cheng/);
  }finally{s.close();}
});

test('mounted active workspace and report exports exclude archived references while preserving raw audit dates',{skip:process.env.RUN_HTTP_TESTS!=='1'},async()=>{
  const s=new Store(':memory:');seed(s);const {app,queue}=createApp(s);const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as any).port}/api`;
  try{const bootstrap=await(await fetch(base+'/bootstrap')).json();assert.equal(bootstrap.accounts.length,35);assert.equal(bootstrap.presentation.label,'15 Oct');assert.equal(bootstrap.metrics.accounts,35);assert.equal((await fetch(base+'/accounts/epac')).status,404);const source=await(await fetch(base+'/evidence/kasikornbank-profile-2026')).json();assert.match(source.retrievedAt,/^2026-10-17/);const report=await(await fetch(base+'/exports/accounts/kasikornbank?format=md')).text();assert.match(report,/Report edition: 2026-10-15/);assert.match(report,/KASIKORNBANK/);const json=await(await fetch(base+'/exports/accounts/kasikornbank?format=json')).json();assert.equal(json.account.documents[0].retrievedAt,source.retrievedAt);
  }finally{queue.stop();await new Promise<void>(resolve=>server.close(()=>resolve()));s.close();}
});
