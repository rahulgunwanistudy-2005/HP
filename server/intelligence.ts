import type {RecordData} from './db.ts';
import {hash,now} from './db.ts';

export const familyMap:Record<string,string>={'Company newsrooms':'company_newsroom','Regulatory and exchange filings':'regulatory_filing','Investor presentations and earnings materials':'investor_material','Procurement notices':'procurement','Contract and award records':'contract_award','Careers and public job feeds':'careers','Investment-agency and facility sources':'investment_agency','Company profiles and facility pages':'investment_agency','Technology and partnership announcements':'technology_partnership','Supplier case studies':'supplier_case_study','Leadership and supplier-registration pages':'supplier_registration','Industry-specific sources':'industry_specific','HP official materials':'official_product_material'};

export const weights={evidence:25,fit:20,timing:20,scale:15,access:10,feasibility:10};
export const labels:Record<string,string>={evidence:'Evidence strength',fit:'HP product fit',timing:'Timing and milestones',scale:'Supported scale',access:'Buyer and procurement access',feasibility:'Commercial feasibility'};
export const defaultPolicy={id:'provisional-v1',version:'provisional-v1',createdAt:now(),weights,rubrics:{
  evidence:['Unknown / rejected','Indirect or unsupported inference','Single relevant primary source','Reviewed primary plus complementary context','Independent, direct, reviewed purchasing evidence'],
  fit:['Unknown / outside HP Inc.','Broad sector fit','Plausible workload','Explicit relevant workflow','Verified requirement and prerequisites'],
  timing:['Unknown / expired','Historical / future beyond qualification horizon','Current strategic change; sourcing unknown','Dated milestone within 90 days','Open purchasing deadline and checked amendments'],
  scale:['Unknown','One disclosed workload/site','Several disclosed functions / rooms','Multiple disclosed sites / capacity','Explicit relevant equipment quantities'],
  access:['Unknown','Relevant role inferred','Published supplier process','Verified purchasing organization','Authority and accessible procurement confirmed'],
  feasibility:['Unknown / excluded','Route hypothesized','Servicing prerequisites identified','Supply eligibility assessed','Availability, eligibility and contract route verified']
},freshness:{procurement:7,careers:30,company_newsroom:180,investment_agency:365,regulatory_filing:400,supplier_case_study:365,default:180},explanation:'Provisional ordinal prioritization, not purchase probability, win probability or expected revenue. Missing values receive zero; no renormalization. Readiness and eligibility gates precede ranking.'};

export function eligibility(account:RecordData,territory:RecordData,opportunity?:RecordData):RecordData {
  const result=(status:string,reason:string)=>({status,reason});
  if(territory.verificationStatus!=='verified'||!territory.countries?.length)return result('unresolved','Country boundaries are unverified. Pursuit is not territory-qualified.');
  const included=new Set(territory.countries),excluded: string[]=territory.exclusions??[],subregions: string[]=territory.subregions??[];
  const normalize=(s:unknown)=>String(s??'').trim().toLowerCase();
  const location=(country:string|undefined,area:RecordData):RecordData=>{
    if(!country)return result('unresolved','Relevant location country is unknown.');
    if(!included.has(country)||excluded.includes(country))return result('excluded','Relevant location is outside the included countries or explicitly excluded.');
    const values=[area.subregionCode,area.subregion,area.city].filter(Boolean).map(normalize);
    const matches=(rule:string)=>values.includes(normalize(rule))||values.includes(normalize(rule.replace(new RegExp(`^${country}:`,'i'),'')));
    const localExclusions=excluded.filter(r=>!/^\w{2}$/.test(r)&&(!/^[A-Z]{2}[-:]/i.test(r)||r.slice(0,2).toUpperCase()===country));
    if(localExclusions.some(matches))return result('excluded','The relevant subregion or locality is explicitly excluded.');
    if(subregions.length&&!subregions.some(matches))return result(values.length?'excluded':'unresolved',values.length?'The relevant locality does not match the included subregions.':'Subregion restriction cannot be evaluated until the relevant locality is evidenced.');
    if(localExclusions.length&&!values.length)return result('unresolved','A locality exclusion is configured, but the relevant locality is unknown.');
    return result('confirmed','The evidenced location satisfies the configured countries and locality restrictions; purchasing authority and HP ownership require separate assessment.');
  };
  if(territory.eligibilityBasis==='headquarters'){
    if(account.reviewStatus&&account.reviewStatus!=='reviewed')return result('unresolved','Headquarters location requires source review.');
    return location(account.hqCountry,{subregion:account.hqSubregion,subregionCode:account.hqSubregionCode,city:account.hqCity});
  }
  if(territory.eligibilityBasis==='purchasing_location'){
    if(account.reviewStatus&&account.reviewStatus!=='reviewed')return result('unresolved','Purchasing location requires source review.');
    return location(account.purchasingCountry,{subregion:account.purchasingSubregion,subregionCode:account.purchasingSubregionCode,city:account.purchasingCity});
  }
  if(opportunity&&!opportunity.facilityId&&!opportunity.facilityCountry)return result('unresolved','This opportunity is not attributed to a specific evidenced deployment location. An account facility cannot localize a global initiative.');
  let facilities:RecordData[]=account.facilities??[];
  if(opportunity?.facilityId)facilities=facilities.filter(f=>f.id===opportunity.facilityId);
  else if(opportunity?.facilityCountry)facilities=facilities.filter(f=>f.country===opportunity.facilityCountry);
  if(territory.operatingRuleMode==='primary_site'){
    facilities=facilities.filter(f=>f.isPrimary===true);
    if(facilities.length!==1)return result('unresolved','The primary-site rule requires exactly one evidenced primary site within this opportunity scope.');
  }
  if(!facilities.length){if(!opportunity&&account.reviewStatus==='reviewed'&&included.has(account.hqCountry)&&!excluded.includes(account.hqCountry))return result('potential','Reviewed headquarters indicates possible account relevance, but an evidenced operating site and purchasing authority remain unresolved. No opportunity inherits this account-level indication.');return result('unresolved','Relevant deployment location is not evidenced; do not inherit a global initiative into a local site.');}
  const evaluations=facilities.map(f=>f.reviewStatus&&f.reviewStatus!=='reviewed'?result('unresolved','Facility location requires source review.'):location(f.country,f));
  if(territory.operatingRuleMode==='all_reviewed_sites'){
    if(evaluations.some(e=>e.status==='excluded'))return result('excluded','At least one relevant site fails the all-sites territory rule.');
    if(evaluations.some(e=>e.status==='unresolved'))return result('unresolved','Every relevant site must have reviewed location evidence for the all-sites rule.');
    return result('confirmed','All relevant evidenced operating sites satisfy the configured territory. HP ownership and contracting authority remain separate.');
  }
  if(evaluations.some(e=>e.status==='confirmed'))return result('confirmed','An evidenced relevant operating facility satisfies the selected country and locality rules. Contracting entity, HP ownership and channel authorization remain separate unknowns.');
  if(evaluations.some(e=>e.status==='unresolved'))return result('unresolved','The relevant facility location or review is insufficient to evaluate the configured territory rules.');
  return result('excluded','No evidenced relevant facility matches the configured operating-location rule.');
}

export function freshness(doc:RecordData,policy=defaultPolicy,asOf=new Date()):RecordData {
  const date=doc.eventDate||doc.publishedAt;
  const limits=policy.freshness as Record<string,number>;
  const threshold=limits[familyMap[doc.family]??doc.family]??limits.default;
  if(!date||!Number.isFinite(Date.parse(date)))return{status:'unknown',ageDays:null,thresholdDays:threshold,reason:'Publication and event dates unavailable; retrieval date does not establish freshness.'};
  const age=Math.floor((asOf.getTime()-Date.parse(date))/86400000);
  return{status:age<0?'future':age>threshold?'stale':'current',ageDays:age,thresholdDays:threshold,reason:`Based on event/publication date ${date}; retrieval does not reset age.`};
}

export function scoreOpportunity(o:RecordData,account:RecordData,territory:RecordData,policy:RecordData=defaultPolicy,asOf=new Date()):RecordData {
  const el=eligibility(account,territory,o),docs:RecordData[]=o.documents??[];
  const supports=docs.filter(d=>(o.evidenceIds??[]).includes(d.id)&&d.reviewStatus==='reviewed'&&!d.supersededBy?.length);
  const contradictions=docs.filter(d=>(o.contradictionIds??[]).includes(d.id)&&d.reviewStatus!=='rejected');
  const changed=Boolean(o.requiresEvidenceReview||o.eventRequiresReview)||docs.some(d=>d.relationship!=='context'&&(d.reviewStatus==='needs_review'||d.supersededBy?.length||d.materialContradiction));
  const inputs={...o.dimensions};
  if(o.outOfScope)inputs.fit=0;
  if(!supports.length)inputs.evidence=0;
  if(!o.scale||/^(?:quantit(?:y|ies)|scope|value)[^.]*\b(?:unknown|unquantified)\b/i.test(o.scale))inputs.scale=null;
  // Explicit gating facts always overrule entered ordinal values.
  const buying=o.procurement??{};
  const expired=Boolean(buying.deadline&&Date.parse(buying.deadline)<asOf.getTime());
  const closed=expired||['closed','canceled','awarded','superseded'].includes(buying.status);
  const checkedAge=asOf.getTime()-Date.parse(buying.verifiedAt??'');
  const noticeSupported=!buying.evidenceIds?.length||buying.evidenceIds.some((id:string)=>supports.some(d=>d.id===id));
  const validDeadline=!buying.deadline||Number.isFinite(Date.parse(buying.deadline));
  const currentExplicit=Boolean(noticeSupported&&validDeadline&&buying.explicit&&buying.status==='open'&&buying.verifiedAt&&checkedAge>=0&&checkedAge<7*86400000&&!closed&&!changed&&!contradictions.length&&supports.length);
  const ff=docs.filter(d=>d.relationship!=='context'&&!d.supersededBy?.length&&d.reviewStatus!=='rejected').map(d=>freshness(d,policy as typeof defaultPolicy,asOf));
  const stale=!currentExplicit&&ff.length>0&&ff.every(f=>['stale','unknown'].includes(f.status));
  if(stale||closed)inputs.timing=Math.min(inputs.timing??0,1);
  if(changed||contradictions.length)inputs.evidence=Math.min(inputs.evidence??0,2);
  const gates=[
    {label:'HP Inc. product fit',status:(inputs.fit??0)>=2?'pass':'blocked',reason:(inputs.fit??0)>=2?'Plausible workload identified; exact requirements remain to qualify.':'Relevant product fit is unsupported.'},
    {label:'Territory eligibility',status:el.status==='confirmed'?'pass':el.status==='excluded'?'blocked':'unknown',reason:el.reason},
    {label:'Procurement status',status:closed?'blocked':currentExplicit?'pass':'unknown',reason:closed?'Purchasing window closed, canceled or superseded.':currentExplicit?'Explicit open purchasing evidence rechecked within seven days.':'No verified open purchasing notice. Business events are not purchase intent.'},
    {label:'Route to supply',status:o.routeAssessment?.status==='ineligible'?'blocked':o.routeAssessed?'pass':'unknown',reason:o.routeAssessment?.basis??(o.routeAssessed?'Route assessed in analyst record.':'Proposed route only; HP ownership, authorization and regional availability unverified.')},
    {label:'Evidence review',status:changed||contradictions.length?'unknown':supports.length?'pass':'blocked',reason:changed?(o.eventRequiresReview?o.eventAssessment?.reason??'Event evidence requires review.':'Changed source requires review.'):contradictions.length?'Contradicting evidence requires qualification.':supports.length?'Supporting passages reviewed; inference remains a hypothesis.':'No accepted supporting document.'}
  ];
  let researchReadiness='Strategic fit';
  if(o.eventTitle&&!stale&&o.eventAssessment?.status!=='hypothesis'&&(inputs.timing??0)>=2)researchReadiness='Triggered qualification';
  if(stale||closed)researchReadiness='Watchlist';
  if(currentExplicit)researchReadiness='Active procurement';
  let readiness=researchReadiness;
  if(el.status==='excluded'||(inputs.fit??0)<2||o.analystStatus==='stopped'||o.routeAssessment?.status==='ineligible')readiness='Blocked or excluded';
  else if(el.status!=='confirmed'||changed||contradictions.length||!supports.length)readiness='Watchlist';
  else if(currentExplicit&&!o.routeAssessed)readiness='Triggered qualification';
  if(o.analystStatus==='nurture'&&readiness!=='Blocked or excluded')readiness='Watchlist';
  const components=Object.entries(policy.weights as Record<string,number>).map(([key,weight])=>{const value=inputs[key]??null;return{key,label:labels[key],weight,value,points:value===null?0:Math.round(value/4*weight*100)/100,reason:value===null?'Unknown; zero points, no renormalization.':`${policy.rubrics[key]?.[value]??'Analyst-assigned ordinal value'}; supporting evidence and limitations shown below.`};});
  const total=Math.round(components.reduce((s,c)=>s+c.points,0)*100)/100;
  const origins=new Set(supports.map(d=>d.announcementGroup??d.independenceGroup??d.origin).filter(Boolean));
  let confidence='Low';
  if(origins.size>=2&&!changed&&!contradictions.length&&(inputs.evidence??0)>=2)confidence='Medium';
  if(currentExplicit&&origins.size>=2&&!changed&&!contradictions.length&&o.routeAssessed)confidence='High';
  return {total,components,version:policy.version,readiness,researchReadiness,gates,confidence,freshness:currentExplicit?'current notice recheck':stale?'stale':ff.some(f=>f.status==='current')?'current':'unknown',missing:components.filter(c=>c.value===null).map(c=>c.label),explanation:`${confidence} recommendation confidence. ${supports.length} reviewed supporting documents from ${origins.size} origin(s); ${contradictions.length} contradicting documents. ${el.status!=='confirmed'?'Territory gate restricts readiness to watchlist or exclusion. ':''}${closed?'Closed procurement cannot rank as active. ':''}Score is a prioritization aid only.`,eligibility:el};
}
export const tierOrder:Record<string,number>={'Active procurement':0,'Triggered qualification':1,'Strategic fit':2,Watchlist:3,'Blocked or excluded':4};
export const rank=(a:RecordData,b:RecordData)=>(tierOrder[a.score.readiness]??4)-(tierOrder[b.score.readiness]??4)||b.score.total-a.score.total||a.id.localeCompare(b.id);
export function eventClusterKey(a:string,title:string,date:string|null,facility:string|null){return hash([a,title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim(),date??'unknown',facility??'unresolved'].join('|')).slice(0,24);}
export function resolveEntity(candidate:RecordData,accounts:RecordData[]):RecordData {
  const normalize=(x:unknown)=>String(x??'').normalize('NFKC').toLowerCase().replace(/^www\./,'').replace(/[^\p{L}\p{N}.]/gu,'');
  const matches=accounts.filter(a=>(candidate.registryId&&a.registryId===candidate.registryId)||(candidate.domain&&normalize(a.domain)===normalize(candidate.domain))||([candidate.legalName,...(Array.isArray(candidate.aliases)?candidate.aliases:[])].filter(name=>normalize(name)).some(name=>[a.legalEntity,a.name,...(Array.isArray(a.aliases)?a.aliases:[])].filter(Boolean).some(stored=>normalize(stored)===normalize(name)))));
  // Subsidiary or facility labels cannot be merged merely because a shared parent domain matches.
  if(candidate.parentId||candidate.subsidiary)return{status:'needs_review',matches:matches.map(a=>a.id),reason:'Explicit subsidiary attribution requires review; parent domain is insufficient.'};
  return matches.length===1?{status:'matched',id:matches[0].id}: {status:matches.length?'ambiguous':'unresolved',matches:matches.map(a=>a.id)};
}
