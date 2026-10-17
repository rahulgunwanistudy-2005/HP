import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../server/db.ts';
import {seed,Repository} from '../server/repository.ts';
import {applyQualificationResearch} from '../scripts/apply-qualification-research.ts';
import {qualificationFindings} from '../server/qualification.ts';
import {brief} from '../server/exports.ts';

test('current TNB Research notice establishes one unit and real contacts without inventing budget or bidder eligibility',()=>{
 const s=new Store(':memory:');try{seed(s);const r=new Repository(s),o=r.opportunity('tnbr-workstation-q26a')!;
 assert.equal(o.score.readiness,'Triggered qualification');assert.equal(o.score.researchReadiness,'Active procurement');assert.equal(o.routeAssessed,false);assert.equal(o.qualification.quantity.amount,1);assert.equal(o.qualification.value.amount,null);assert.equal(o.procurement.noticeId,'RFx4000054529 / TNBR Q26A 2026');assert.equal(o.procurement.deadline,'2026-10-21T15:00:00+08:00');assert.equal(o.buyingContext.operatingEntity,'TNB Research Sdn. Bhd.');assert.equal(o.documents.find((d:any)=>d.id==='tnbr-workstation-q26a-2026').announcementGroup,r.account('tenaga')!.documents.find((d:any)=>d.id==='tenaga-profile-2026').announcementGroup);assert.equal(o.buyers.filter((b:any)=>b.person).length,2);
 for(const b of o.buyers.filter((b:any)=>b.person)){assert.match(b.authority,/not established/);assert.ok(o.documents.some((d:any)=>b.evidenceIds.includes(d.id)&&d.claim.includes(b.person)));}
 assert.match(o.qualification.value.basis,/Free refers to the tender fee/);assert.equal(o.contextIds.includes('tnbr-workstation-q26-historical'),true);assert.equal(r.opportunity('tenaga-workplace-fit')!.procurement.explicit,false);assert.notEqual(o.eventId,r.opportunity('tenaga-workplace-fit')!.eventId);assert.equal(r.metrics().activeProcurement,0);
 const md=brief(r.account('tenaga')!,r.territory());assert.match(md,/Opportunity-specific buyer/);assert.match(md,/tnbrprocurement@tnb.com.my/);assert.match(md,/1 professional workstation/);
 }finally{s.close();}
});

test('reconciliation advances current Micron and Sunway facts while keeping long-horizon Changi and undated profiles conservative',()=>{
 const s=new Store(':memory:');try{seed(s);const r=new Repository(s);
 assert.equal(r.opportunity('micron-engineering')!.score.readiness,'Triggered qualification');assert.equal(r.opportunity('micron-collaboration')!.score.readiness,'Strategic fit');assert.ok(!r.opportunity('micron-engineering')!.eventAssessment.sourceIds.includes('micron-hbm-2025'));assert.ok(r.opportunity('micron-engineering')!.contextIds.includes('micron-hbm-2025'));
 const sun=r.opportunity('sunway-endpoints')!;assert.equal(sun.score.readiness,'Triggered qualification');assert.equal(sun.eventDate,'2026-09-18');assert.match(sun.scale,/2030|hospital development/);assert.match(sun.scale,/not disclosed/);assert.equal(sun.contradictionIds.length,0);assert.ok(sun.contextIds.includes('sunway-investor-2025'));assert.match(r.account('sunway')!.facilities[2].kind,/2030/);
 assert.equal(r.opportunity('changi-construction-print')!.score.readiness,'Watchlist');assert.equal(r.opportunity('changi-afisms-excluded')!.score.readiness,'Blocked or excluded');assert.equal(r.opportunity('dbs-workplace-fit')!.score.readiness,'Watchlist');assert.equal(r.opportunity('bdo-workplace-fit')!.dimensions.access,null);
 const dbs=r.opportunity('dbs-workplace-fit')!;assert.equal(dbs.dimensions.access,2);assert.equal(dbs.publicAccessAssessment.status,'published_process');assert.equal(dbs.procurement.explicit,false);assert.match(dbs.qualification.readinessReason,/standing company/);assert.ok(dbs.qualification.remaining.some((f:any)=>f.field==='Equipment budget'));
 }finally{s.close();}
});

test('quantity and budget facts withdraw when controlling evidence is rejected or superseded',()=>{
 const s=new Store(':memory:');try{seed(s);const r=new Repository(s),o=r.opportunity('tnbr-workstation-q26a')!,a=r.account('tenaga')!;
 for(const flag of [{reviewStatus:'rejected'},{supersededBy:['replacement']},{materialContradiction:true}]){const changed={...o,documents:o.documents.map((d:any)=>d.id==='tnbr-workstation-q26a-2026'?{...d,...flag}:d)};const q=qualificationFindings(changed,a);assert.equal(q.quantity,null);assert.equal(q.value,null);assert.ok(!q.resolved.some((f:any)=>f.field==='Equipment quantity'));}
 }finally{s.close();}
});

test('reviewed updates are idempotent and retain authored notes, completed actions and immutable evidence versions',()=>{
 const s=new Store(':memory:');try{seed(s);const r=new Repository(s);r.saveOpportunity('micron-engineering',{note:'FICTIONAL retained qualification note',analystStatus:'qualifying'});const action=s.list('actions')[0];s.run('UPDATE actions SET status=?,data=? WHERE id=?','done',JSON.stringify({...action,status:'done'}),action.id);const versions=s.all('SELECT * FROM document_versions');applyQualificationResearch(s);const notes=s.all('SELECT * FROM analyst_notes');assert.deepEqual(applyQualificationResearch(s),{alreadyApplied:true});assert.deepEqual(s.all('SELECT * FROM analyst_notes'),notes);for(const v of versions)assert.deepEqual(s.one('SELECT * FROM document_versions WHERE id=?',v.id),v);assert.equal(s.get('actions',action.id)!.status,'done');assert.ok(r.opportunity('micron-engineering')!.notes.some((n:any)=>n.text==='FICTIONAL retained qualification note'));assert.equal(r.opportunity('micron-engineering')!.analystStatus,'qualifying');assert.equal(s.all('PRAGMA foreign_key_check').length,0);
 }finally{s.close();}
});

test('PTT monetary evidence stays a committed-package budget and cannot become a fresh order or a zero-value award',()=>{
 const s=new Store(':memory:');try{seed(s);const r=new Repository(s),o=r.opportunity('ptt-notebook-lease-committed')!,poly=r.opportunity('ptt-workplace-fit')!;
 assert.equal(o.procurement.status,'awarded');assert.equal(o.score.readiness,'Watchlist');assert.equal(o.qualification.quantity.amount,450);assert.equal(o.qualification.value.amount,24610000);assert.equal(o.qualification.value.currency,'THB');assert.equal(o.qualification.value.periodMonths,36);assert.equal(o.qualification.value.referencePrice,23000000);assert.equal(o.qualification.value.contractAmount,null);assert.equal(o.qualification.value.contractAmountUnresolved,true);assert.match(o.qualification.readinessReason,/already committed or closed/);assert.ok(o.qualification.resolved.some((f:any)=>f.field==='Published package budget'));assert.ok(o.qualification.remaining.some((f:any)=>f.field==='Awarded contract amount'));assert.match(o.qualification.headline,/THB 24,610,000 published package budget/);assert.equal(poly.procurement.explicit,false);assert.equal(poly.dimensions.scale,null);assert.equal(poly.eventDate,null);assert.ok(poly.contextIds.includes('ptt-notebook-contract-69069404739'));assert.equal(poly.qualification.quantity,null);assert.equal(poly.qualification.value,null);assert.equal(r.metrics().activeProcurement,0);
 }finally{s.close();}
});
