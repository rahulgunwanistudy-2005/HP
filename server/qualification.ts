import type {RecordData} from './db.ts';

/** Explain established public facts separately from private commercial qualification. */
export function qualificationFindings(o:RecordData,account:RecordData):RecordData {
  const p=o.buyingContext??account.buyingProfile;
  const accepted=(ids:string[])=>ids.length>0&&ids.every(id=>o.documents.some((d:RecordData)=>d.id===id&&d.reviewStatus==='reviewed'&&!d.supersededBy?.length&&!d.materialContradiction));
  const quantity=o.quantity&&Number.isFinite(o.quantity.amount)&&o.quantity.amount>0&&accepted(o.quantity.evidenceIds??[])?o.quantity:null;
  const value=o.valueAssessment&&accepted(o.valueAssessment.evidenceIds??[])?o.valueAssessment:null;
  const monetary=Boolean(value&&value.status==='published_budget'&&Number.isFinite(value.amount)&&value.amount>0&&/^[A-Z]{3}$/.test(value.currency));
  const money=monetary?`${value!.currency} ${value!.amount.toLocaleString('en-US')} published package budget`:null;
  const process=Boolean(p?.procurementBasis==='published'&&p.sources?.length&&p.supplierProcess);
  const sourceRefs=p?.sources??[];
  const resolved:RecordData[]=[];
  if(p?.operatingEntity&&sourceRefs.length)resolved.push({field:'Company / buyer context',finding:p.operatingEntity,limit:p.scopeBoundary,sources:sourceRefs});
  if(o.eventAssessment?.status==='reviewed'&&o.eventDate&&accepted(o.eventAssessment.sourceIds??[]))resolved.push({field:'Dated event / milestone',finding:`${o.eventTitle} · ${o.eventDate}`,limit:'The event establishes only its stated scope; it does not independently establish a new device order.',sources:o.documents.filter((d:RecordData)=>o.eventAssessment.sourceIds.includes(d.id)).map((d:RecordData)=>({url:d.url,title:d.title}))});
  if(process)resolved.push({field:'Public purchasing process',finding:p.supplierProcess,limit:'Published process access does not establish bidder registration, delegated approval or HP authorization.',sources:sourceRefs});
  if(o.procurement?.explicit&&accepted(o.procurement.evidenceIds??[]))resolved.push({field:'Purchasing notice',finding:`${o.procurement.noticeId}; recorded ${o.procurement.status}; deadline ${o.procurement.deadline??'not published'}`,limit:o.score.gates.find((g:RecordData)=>g.label==='Procurement status')?.reason,sources:o.documents.filter((d:RecordData)=>(o.procurement.evidenceIds??[]).includes(d.id)).map((d:RecordData)=>({url:d.url,title:d.title}))});
  if(quantity)resolved.push({field:'Equipment quantity',finding:`${quantity.amount} ${quantity.unit}`,limit:quantity.scope,sources:o.documents.filter((d:RecordData)=>quantity.evidenceIds.includes(d.id)).map((d:RecordData)=>({url:d.url,title:d.title}))});
  if(monetary)resolved.push({field:'Published package budget',finding:money,limit:value!.basis,sources:o.documents.filter((d:RecordData)=>value!.evidenceIds.includes(d.id)).map((d:RecordData)=>({url:d.url,title:d.title}))});
  const remaining:RecordData[]=[
    ...(!process?[{field:'Purchasing function',finding:p?.procurementTeam??'No relevant public purchasing function established.',next:'Identify the actual category buyer through the documented company route; do not borrow a subsidiary buyer.'}]:[]),
    ...(!quantity?[{field:'Equipment scope',finding:'No equipment quantity established by the reviewed sources.',next:'Obtain a buyer-approved bill of materials, room list or site inventory. Do not convert headcount, beds or project capex into devices.'}]:[]),
    ...(!monetary?[{field:'Equipment budget',finding:value?.basis??'No equipment budget established in the reviewed sources.',next:'Obtain the approved package budget or a buyer-approved priced bill of materials. Public list prices are not the customer budget.'}]:[]),
    ...(value?.contractAmountUnresolved?[{field:'Awarded contract amount',finding:'The public selection record displays 0.00; a reliable awarded value is not established.',next:'Obtain the actual executed contract amount or corrected public record. Do not substitute the budget or reference price.'}]:[]),
    {field:'Approval and supply eligibility',finding:p?.approvalCheck??'Actual signatory, HP account ownership, authorized seller and service eligibility remain to qualify.',next:o.routeAssessment?.basis??'Validate account ownership, seller credentials, regional configuration and service coverage for this exact scope.'}
  ];
  const committed=['awarded','closed','canceled','superseded'].includes(o.procurement?.status);
  const readinessReason=o.score.readiness==='Blocked or excluded'?'Product, territory or analyst exclusion applies; retain the record for its documented reason.':committed?'This purchasing package is already committed or closed. Retain its sourced scope and commercial context; do not count it as open pipeline.':o.score.readiness==='Watchlist'?o.score.gates.find((g:RecordData)=>g.label==='Evidence review'&&g.status!=='pass')?.reason??(o.eventAssessment?.status==='hypothesis'?'Only standing company / operating context is established; no dated equipment project or buying window is evidenced.':o.score.freshness==='stale'?'The supporting event is dated or undated beyond the freshness policy; no current equipment buying window is established.':'An unresolved readiness gate prevents advancement.'):o.score.readiness==='Triggered qualification'?'A reviewed event or purchasing notice supports qualification. Remaining supply and commercial conditions prevent treating it as a fully qualified pursuit.':'Readiness follows the documented evidence and gates.';
  return{resolved,remaining,quantity,value,readinessReason,publicProcessEstablished:process,headline:[quantity?`${quantity.amount} ${quantity.unit}`:null,money??'budget not established',committed?'committed / closed':null].filter(Boolean).join(' · '),reviewNote:o.qualificationNote??null};
}
