import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibility,scoreOpportunity,defaultPolicy,resolveEntity} from '../server/intelligence.ts';
import type {RecordData} from '../server/db.ts';
const territory:RecordData={verificationStatus:'verified',countries:['SG','MY'],exclusions:['US'],eligibilityBasis:'operating_location'};
const account:RecordData={id:'fictional',hqCountry:'US',reviewStatus:'reviewed',facilities:[{id:'sg',country:'SG',city:'Singapore'},{id:'my',country:'MY',city:'Penang',subregionCode:'MY-07'}]};
test('HQ exclusion follows location basis and cannot override an included operating facility',()=>{
 assert.equal(eligibility(account,territory,{facilityId:'sg'}).status,'confirmed');
 assert.equal(eligibility(account,{...territory,eligibilityBasis:'headquarters'}).status,'excluded');
});
test('country-qualified sites still enforce configured locality restrictions and unknown locations',()=>{
 assert.equal(eligibility(account,{...territory,subregions:['MY-07']},{facilityId:'my'}).status,'confirmed');
 assert.equal(eligibility(account,{...territory,subregions:['SG:Singapore']},{facilityId:'sg'}).status,'confirmed');
 assert.equal(eligibility(account,{...territory,subregions:['MY-10']},{facilityId:'my'}).status,'excluded');
 assert.equal(eligibility({...account,facilities:[{id:'sg',country:'SG'}]},{...territory,subregions:['Singapore']},{facilityId:'sg'}).status,'unresolved');
 assert.equal(eligibility(account,{...territory,exclusions:['Singapore']},{facilityId:'sg'}).status,'excluded');
});
test('any-site, all-sites and primary-site operating rules are executable and conservative',()=>{
 const a={...account,facilities:[...account.facilities,{id:'us',country:'US',isPrimary:true}]};
 assert.equal(eligibility(a,territory).status,'confirmed');
 assert.equal(eligibility(a,{...territory,operatingRuleMode:'all_reviewed_sites'}).status,'excluded');
 assert.equal(eligibility(a,{...territory,operatingRuleMode:'primary_site'}).status,'excluded');
 assert.equal(eligibility(account,{...territory,operatingRuleMode:'primary_site'}).status,'unresolved');
 assert.equal(eligibility({...account,facilities:[{id:'sg',country:'SG',reviewStatus:'needs_review'}]},territory,{facilityId:'sg'}).status,'unresolved');
 assert.equal(eligibility({...account,reviewStatus:'needs_review',hqCountry:'SG'},{...territory,eligibilityBasis:'headquarters'}).status,'unresolved');
});
const op=(patch:RecordData={})=>({id:'fictional-op',facilityId:'sg',eventTitle:'Fictional change',eventDate:'2026-10-10',dimensions:{evidence:4,fit:4,timing:4,scale:4,access:4,feasibility:4},scale:'Four disclosed units',routeAssessed:true,evidenceIds:['d'],documents:[{id:'d',origin:'fictional',reviewStatus:'reviewed',publishedAt:'2026-10-10'}],procurement:{explicit:true,status:'open',verifiedAt:'2026-10-15',deadline:'2026-11-01'},...patch});
const score=(patch:RecordData)=>scoreOpportunity(op(patch),account,territory,defaultPolicy,new Date('2026-10-16T12:00:00Z'));
test('nurture cannot override stopped, product, route or geography exclusions',()=>{
 for(const patch of [{outOfScope:true},{dimensions:{fit:0}},{routeAssessment:{status:'ineligible'}},{facilityId:'outside',facilityCountry:'US'}]){
  const a=patch.facilityId?{...account,facilities:[...account.facilities,{id:'outside',country:'US'}]}:account;
  assert.equal(scoreOpportunity(op({...patch,analystStatus:'nurture'}),a,territory,defaultPolicy,new Date('2026-10-16')).readiness,'Blocked or excluded');
 }
});
test('superseded and materially contradicted sources suspend readiness without erasing history',()=>{
 const docs=op().documents;
 for(const flag of [{supersededBy:['amendment']},{materialContradiction:true}]){
  const r=score({documents:docs.map(d=>({...d,...flag}))});assert.equal(r.readiness,'Watchlist');assert.equal(r.confidence,'Low');
 }
 assert.equal(score({procurement:{explicit:true,status:'open',verifiedAt:'2026-10-15',deadline:'invalid'}}).researchReadiness,'Triggered qualification');
});
test('context-only changes cannot refresh or demote a reviewed current buying fact',()=>{
 const r=score({documents:[...op().documents,{id:'context',relationship:'context',reviewStatus:'needs_review',publishedAt:'2020-01-01'}]});assert.equal(r.readiness,'Active procurement');
});

test('country-specific locality exclusions do not block unrelated countries with unknown localities',()=>{assert.equal(eligibility({...account,facilities:[{id:'sg',country:'SG'}]},{...territory,exclusions:['MY-10']},{facilityId:'sg'}).status,'confirmed');});
test('explicit aliases participate in entity suggestions while subsidiary uncertainty is preserved',()=>{const accounts=[{id:'fictional-a',domain:'fictional.example.org',name:'Fictional International',aliases:['虚构企业']}];assert.equal(resolveEntity({aliases:['虚构企业']},accounts).id,'fictional-a');assert.equal(resolveEntity({aliases:['虚构企业'],subsidiary:true},accounts).status,'needs_review');});

test('potential account relevance remains separate from confirmed deployment-site pursuit',()=>{const a={...account,hqCountry:'SG',facilities:[]};assert.equal(eligibility(a,territory).status,'potential');assert.equal(eligibility(a,territory,{eventTitle:'Fictional global change'}).status,'unresolved');assert.equal(eligibility({...a,reviewStatus:'needs_review'},territory).status,'unresolved');});
