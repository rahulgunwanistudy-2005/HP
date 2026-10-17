import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Store} from '../server/db.ts';
import {Repository,seed} from '../server/repository.ts';
import {configureAseanTerritory} from '../scripts/apply-asean-expansion.ts';
import {synchronizeReviewedSeed} from '../scripts/update-reviewed-seed.ts';

test('expanded directory has thirty sourced new prospects, balanced across six operating markets',()=>{
  const s=new Store(':memory:');try{seed(s);const r=new Repository(s),a=r.accounts(),cohort=a.filter(x=>x.cohort==='asean-2026-10-17');
    assert.equal(cohort.length,30);assert.equal(new Set(cohort.map(a=>a.domain)).size,30);
    for(const country of ['ID','MY','PH','SG','TH','VN'])assert.equal(cohort.filter(a=>a.facilities.some((f:any)=>f.country===country)).length,5);
    assert.equal(a.filter(a=>a.eligibility.status==='confirmed').length,35);assert.equal(r.metrics().deepAccounts,5);
    for(const a of cohort){assert.equal(a.researchDepth,'screened');assert.equal(a.eligibility.status,'confirmed');assert.ok(a.documents.length);for(const f of a.facilities)for(const id of f.evidenceIds)assert.ok(a.documents.some((d:any)=>d.id===id));for(const o of a.opportunities.filter((o:any)=>!['tnbr-workstation-q26a','ptt-notebook-lease-committed'].includes(o.id))){assert.equal(o.eligibility.status,'confirmed');assert.notEqual(o.score.readiness,'Active procurement');assert.equal(o.procurement.explicit,false);assert.equal(o.dimensions.scale,null);assert.equal(o.actions.length,4);assert.equal(o.buyers.length,3);assert.ok(r.graph(a.id)!.nodes.some(n=>n.type==='product'&&n.id===o.productFamily));}}
    assert.equal(r.account('micron')!.hqCountry,'US');assert.equal(r.account('micron')!.eligibility.status,'confirmed');
    assert.equal(r.account('dreamworks'),undefined);assert.equal(r.account('epac'),undefined);for(const id of ['dreamworks','epac'])assert.equal(s.get('accounts',id)!.archived,true);
  }finally{s.close();}
});

test('undated profiles remain hypotheses, while KBank has the correct dated post-move scope',()=>{
  const s=new Store(':memory:');try{seed(s);const r=new Repository(s),cohort=r.opportunities().filter(o=>r.accountBase(o.accountId)!.researchDepth==='screened');
    for(const o of cohort.filter(o=>o.accountId!=='kasikornbank'&&!['tnbr-workstation-q26a','ptt-notebook-lease-committed'].includes(o.id))){assert.equal(o.event.claimType,'hypothesis');assert.equal(o.eventDate,null);assert.equal(o.score.readiness,'Watchlist');assert.ok(o.documents.filter((d:any)=>d.relationship==='supports').every((d:any)=>d.publishedAt===null));}
    const k=r.opportunity('kasikornbank-workplace-fit')!;assert.equal(k.eventDate,'2026-07-31');assert.equal(k.score.readiness,'Triggered qualification');assert.match(r.account('kasikornbank')!.facilities[0].name,/Rat Burana/);assert.doesNotMatch(r.account('kasikornbank')!.facilities[0].name,/Phahon/);assert.match(k.whyNow,/already be complete/);assert.equal(k.contextIds.length,1);
  }finally{s.close();}
});

test('group relationship is visible without treating SM and BDO as independent corroboration or one buyer',()=>{
  const s=new Store(':memory:');try{seed(s);const r=new Repository(s),bdo=r.account('bdo')!,sm=r.account('sm-investments')!;
    assert.equal(bdo.relationships[0].relatedAccountId,sm.id);assert.match(bdo.relationships[0].relation,/unverified/);
    assert.equal(bdo.documents[0].announcementGroup,sm.documents[0].announcementGroup);
    assert.notEqual(bdo.opportunities[0].id,sm.opportunities[0].id);assert.match(sm.opportunities[0].reasoning,/BDO/);
    assert.ok(r.graph('bdo')!.edges.some(e=>e.target==='sm-investments'));
  }finally{s.close();}
});

test('ASEAN scope upgrade preserves prior boundary, notes and edited work, and never overwrites a later scope change',()=>{
  const s=new Store(':memory:'),reviewed=new Store(':memory:');try{seed(s);seed(reviewed);
    const old={...s.get('territories','primary')!,name:'FICTIONAL prior unverified boundary',version:9,verificationStatus:'unverified',countries:[]};s.run('UPDATE territories SET version=?,data=? WHERE id=?',9,JSON.stringify(old),'primary');
    const r=new Repository(s);r.saveOpportunity('micron-engineering',{note:'FICTIONAL retained analyst note',analystStatus:'qualifying'});
    const action=s.list('actions')[0];s.run('UPDATE actions SET status=?,data=? WHERE id=?','done',JSON.stringify({...action,status:'done'}),action.id);
    const beforeVersions=s.list('document_versions').map(d=>d.id);synchronizeReviewedSeed(s,reviewed);assert.equal(configureAseanTerritory(s),true);
    assert.equal(r.territory().version,10);assert.equal(r.territory().verificationStatus,'verified');assert.equal(s.meta('territoryHistory')[0].territory.name,old.name);
    assert.match(r.opportunity('micron-engineering')!.notes[0].text,/retained analyst note/);assert.equal(r.opportunity('micron-engineering')!.analystStatus,'qualifying');assert.equal(s.get('actions',action.id)!.status,'done');for(const id of beforeVersions)assert.ok(s.get('document_versions',id));
    const next={...r.territory(),name:'FICTIONAL later analyst scope',countries:['SG']};s.run('UPDATE territories SET data=? WHERE id=?',JSON.stringify(next),'primary');assert.equal(configureAseanTerritory(s),false);assert.deepEqual(r.territory().countries,['SG']);assert.equal(s.all('PRAGMA foreign_key_check').length,0);
  }finally{s.close();reviewed.close();}
});

test('expansion preserves source capture age and never turns retrieval time into publication time',()=>{
  const cohort=JSON.parse(readFileSync(new URL('../data/asean-prospects.json',import.meta.url),'utf8'));
  for(const a of cohort.accounts)for(const d of a.documents){assert.ok(d.url.startsWith('https://'));assert.ok(d.passage.split(/\s+/).length<=25);if(d.cacheState==='hit')assert.ok(d.sourceSnapshotAt);if(d.id==='bdo-procurement-role-context-2026')assert.equal(d.publishedAt,'2026-10-14');else if(a.id!=='kasikornbank')assert.equal(d.publishedAt,null);}
});
