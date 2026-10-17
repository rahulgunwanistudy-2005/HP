import {readFileSync} from 'node:fs';
import {workspaceConfig,accountIsVisible} from './workspace.ts';

/** Keep the original deep research cohort intact and add the sourced ASEAN cohort. */
export function reviewedDataset(){
  const read=(file:string)=>JSON.parse(readFileSync(new URL(`../data/${file}`,import.meta.url),'utf8'));
  const original=read('research-accounts.json'),expansion=read('asean-prospects.json'),buyers=read('buying-organizations.json').profiles,research=read('qualification-research.json');
  const accounts=[...original.accounts,...expansion.accounts].map(a=>{
    const profile=buyers[a.id];
    const opportunities=[...a.opportunities,...(research.newOpportunities[a.id]??[])].map((o:any)=>{
      const update=research.opportunityUpdates[o.id]??{},merged={...o,...update},buying=merged.buyingContext??profile;
      merged.dimensions={...o.dimensions,...update.dimensions};
      if(merged.dimensions.access==null&&buying?.procurementBasis==='published'&&buying.sources?.length)merged.dimensions.access=2;
      // This assessment credits published process access only, never bid eligibility or buying intent.
      merged.publicAccessAssessment={status:buying?.procurementBasis==='published'?'published_process':'role_to_identify',basis:buying?.supplierProcess,sources:buying?.sources??[],reviewedAt:research.reviewedAt};
      return merged;
    });
    return {...a,documents:[...a.documents,...(research.documents[a.id]??[])],facilities:[...a.facilities.map((f:any,i:number)=>({...f,...research.facilityUpdates?.[f.id??`${a.id}-site-${i+1}`]})),...(research.facilities[a.id]??[])],opportunities,...(profile?{buyingProfile:profile,legalEntity:profile.operatingEntity,purchasingOrganization:profile.procurementTeam}:{}),...(workspaceConfig.archivedReferenceAccountIds.includes(a.id)?{archived:true,archiveReason:'User removed USA and Canada reference cases from the prospect workspace.'}:{})};
  });
  const key=(a:any)=>String(a.id??a.sourceUrl?.match(/^https?:\/\/(?:www\.)?([^/]+)/)?.[1]??a.name).toLowerCase();
  const screened=[...original.screened.filter((a:any)=>!expansion.screened.some((b:any)=>key(a)===key(b)||a.name===b.previousScreeningName||a.name===b.name)),...expansion.screened].filter(a=>!['US','CA'].includes(a.country)&&!['epac','dreamworks'].includes(a.id)&&!['ePac Flexible Packaging','DreamWorks Animation'].includes(a.name));
  const visibleAccounts=accounts.filter(accountIsVisible);const documents=visibleAccounts.flatMap((a:any)=>a.documents);
  return {...original,reviewedAt:expansion.reviewedAt,accounts,screened,coverage:{...original.coverage,...expansion.coverage,screenedAccounts:screened.length,deepAccounts:5,screenedProspects:expansion.accounts.length,opportunities:visibleAccounts.reduce((n:number,a:any)=>n+a.opportunities.length,0),sourceDocuments:documents.length,uniqueCanonicalUrls:new Set(documents.map((d:any)=>d.url)).size,geography:{verification:'configured',priorityCountries:['ID','MY','PH','SG','TH','VN'],countriesWithReviewedOperatingEvidence:['ID','MY','PH','SG','TH','VN'],limitation:'ASEAN-6 priority territory uses operating location. Thirty new screened prospects complement five deep demonstrations. USA and Canada reference cases are archived outside the active workspace. This is a purposive sample, not an exhaustive market map.'},gaps:['New screening profiles establish company and operating-country context, not active procurement or completed deep research.','Equipment quantities, budgets and incumbent scope are established only in the specific cited cases; most standing profiles still lack these facts. Deal approval authority, HP ownership and bidder authorization remain unverified.',...original.coverage.gaps.filter((s:string)=>!s.startsWith('No country-qualified'))]}};
}
