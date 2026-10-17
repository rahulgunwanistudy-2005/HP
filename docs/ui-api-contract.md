# Working API contract

The UI uses relative `/api` requests. All endpoints are loopback-confined single-user demo endpoints. JSON errors: `{error:{code,message,details?}}`. Lists: `{items,total,page,pageSize}`. ISO timestamps. No credentials in browser.

GET `/api/bootstrap` => `{territory,metrics,accounts,opportunities,products,coverage,connectors,policy,limitations}`. Accounts and opportunities here are full enriched records (same as detail), small demo corpus. Global territory is `{id,name,verificationStatus,countries:ISO3166Alpha2[],subregions,exclusions,languages,eligibilityBasis,operatingRule,operatingRuleMode,version,updatedAt}`.

Account => `{id,name,domain,industry,hqCountry,summary,discovery,rationale,screeningStatus,demonstration:boolean,facilities:[],documents:[],opportunities:[],eligibility:{status,reason},legalEntity,purchasingOrganization,relationships:[]}`.

Opportunity => `{id,accountId,accountName,title,type,productFamily,eventTitle,eventDate,requirement,reasoning,whyNow,scale,explicitPurchasingEvidence,buyers:[{role,scope,organization,status}],route,barriers:[],unknowns:[],confirm:[],weaken:[],disprove:[],evidenceIds:[],contradictionIds:[],dimensions:{evidence,fit,timing,scale,access,feasibility},actions:[{id,phase,title,outcome,role,question,progressCondition,stopCondition,status}],analystStatus,notes:[],eligibility:{status,reason},score:{total,components:[{key,label,weight,value,points,reason}],version,readiness,gates:[{label,status,reason}],confidence,freshness,missing:[],explanation,sensitivity:[]},documents:[]}`. Ordinal values 0–4 or null. No monetary values.

Document => `{id,accountId,url,canonicalUrl,title,publisher,family,origin,publishedAt,eventDate,retrievedAt,passage,claim,section,limitations,reviewStatus,extractionMethod,fingerprint,language,translationStatus,retrievalStatus}`.

GET `/api/accounts` supports search,industry,eligibility,page,pageSize. GET `/api/accounts/:id`. GET `/api/opportunities` supports search,readiness,productFamily,eligibility,sort=score|freshness|account,page,pageSize. GET `/api/opportunities/:id`. GET `/api/evidence` with accountId,family,search,page,pageSize. GET `/api/evidence/:id` returns document and related opportunity IDs, claims and events.

PUT `/api/territory` body `{name,verificationStatus:'unverified'|'verified',countries:[],eligibilityBasis:'operating_location'|'headquarters'|'purchasing_location',operatingRule,operatingRuleMode?:'any_reviewed_site'|'all_reviewed_sites'|'primary_site',subregions:[],exclusions:[],languages:[]}`. Recomputes eligibility, never changes facts.

PATCH `/api/accounts/:id` `{purchasingOrganization?,legalEntity?}`. PATCH `/api/opportunities/:id` `{analystStatus?:'unreviewed'|'qualifying'|'qualified'|'nurture'|'stopped',note?:string,dimensions?:{...},routeAssessment?:{status:'unknown'|'eligible'|'ineligible',basis:string},procurementStatus?:'unknown'|'open'|'closed'|'canceled'|'awarded'|'superseded',procurementRechecked?:boolean}`; assessment changes require a source-basis qualification note of at least10characters. Recheck is analyst-entered; the app does not independently verify the notice. Notes persist. PATCH `/api/actions/:id` `{status:'pending'|'in_progress'|'done'|'stopped'}`. POST `/api/evidence/:id/review` `{status:'reviewed'|'needs_review'|'rejected',note?,claim?,family?,publishedAt?:'YYYY-MM-DD'|null,eventDate?:'YYYY-MM-DD'|null}; accepting an unclassified extraction requires claim and source family`. POST `/api/opportunities/:id/evidence` `{documentId,relationship:'supports'|'contradicts'|'context'}` requires matching account and reviewed status for supporting sources; scores recompute.

GET `/api/research-runs` => list. POST `/api/research-runs` `{accountId,urls?:string[],adapter?:'html'|'json'|'feed'|'pdf',forceRefresh?:boolean}` => persisted queued run. Defaults to account document URLs (bounded to 5). GET `/api/research-runs/:id`. POST `/api/research-runs/:id/cancel`. Run => `{id,accountId,accountName,state,scope,sourceConfig,startedAt,completedAt,createdAt,requested,retrieved,skipped,failed,documentsProduced,claimsProduced,eventsProduced,manualReviewRequired,cancelRequested,results:[{url,status,error?,documentId?,changed?}],usage,errors:[]}`. Real worker progress only; poll every 2s while running/queued. New pages are unreviewed and never silently create sales intent.

PATCH `/api/connectors/:id` `{enabled:boolean}`. GET `/api/policy` returns `{version,weights,rubrics,freshness,explanation}`. POST `/api/scores/recompute` `{weights?:{evidence,fit,timing,scale,access,feasibility}}` (sum 100), saves version and snapshots. GET `/api/validation` gives methodology, source counts, baseline comparison, unknowns, tests reference. GET `/api/graph/:accountId` gives real `{nodes,edges}` links.

Exports use browser anchor download: `/api/exports/accounts/:id?format=md|json|csv|html`, `/api/exports/opportunities?format=json|csv`. HTML print brief opens a new tab. All include sources, uncertainty and dates. CSV formula safety server-side.

Metrics => `{accounts,deepAccounts,screenedAccounts,reviewedOpportunities,opportunities,uniqueEvents,sourceFamilies,independentOrigins,staleFindings,unresolvedBuyers,failedRuns,activeProcurement}`. Coverage is researched demonstration coverage, not territory completeness.

## Persistent authoring and reconciliation

Complete create/edit schemas are in [authoring-api.md](authoring-api.md). The /api/authoring routes support accounts, facilities, events, opportunities, buyer roles, actions and audited procurement notices. Unknown properties and empty patches fail validation; source/account isolation is enforced. Reviewed names, locations and monetary values require matching reviewed evidence.

- GET /api/reconciliation/:accountId returns events, duplicateCandidates, documentRelations, entityCandidates and history.
- POST /api/reconciliation/events/merge accepts {accountId,sourceEventId,targetEventId,reason}. It preserves event rows and source links, checks all deployment-site attributions, updates opportunity mappings and duplicate keys, then records mergeId.
- POST /api/reconciliation/events/unmerge accepts {mergeId,reason}. Conflicting later edits/keys return409; historical merges remain with status undone.
- POST /api/reconciliation/entities/match accepts domain/legalName/registryId/aliases and subsidiary/parent context; returns suggestions only.
- POST /api/evidence/:id/relationships accepts {relatedDocumentId,type,reason}; types supersedes,contradicts,corroborates,same_announcement. Both sources must be reviewed and share an account.
- POST /api/evidence/relationships/:relationshipId/revoke accepts {reason}; retains the relationship with revoked status and audit history. Recreating a revoked relationship reactivates its same stable ID with history.

Evidence detail additionally returns relationships, supersededBy, materialContradiction, reviewHistory, document versions and event links. Review metadata accepts title, passage (maximum25 retained words), section, page, language, claim, source family, publication and event dates. Future publication dates are rejected. Latest retrieved title/passage/metadata are comparison fields until explicitly accepted. A reviewed document must have a factual claim and supporting passage.

Opportunity detail includes contextIds, event, eventDocuments and eventAssessment. Event-review failures propagate to scores; event-only sources are not silently promoted to opportunity corroboration. Actual graphs distinguish support, contradiction and context and include persisted facility relationships.

Local mutation origin checks require the same request origin, the explicit development UI origin, or configured CLIENT_ORIGINS. Beyond loopback, a private reverse proxy supplies the server-side bearer token; no browser credential is bundled. See deployment.md.
