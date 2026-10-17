# Deep audit implementation contract (17 October 2026)

Existing API stays compatible. All edits preserve original source facts, versions, user notes and qualification history. Tests use separate databases. New authoring endpoints are registered from `server/authoring.ts`.

## Authoring

Canonical authoring shapes are maintained by the authoring agent and communicated directly to the frontend. Prefix `/api/authoring`: create/update accounts, account facilities and events; create/update opportunity content; buyer-role and action content edits; dedicated opportunity procurement update with notice evidence, deadlines, amendment details and verification basis. Ordinary status/note routes stay unchanged.

## Event and entity reconciliation

- GET `/api/reconciliation/:accountId` → `{events,duplicateCandidates:[{sourceEventId,targetEventId,sourceTitle,targetTitle,similarity,reasons}],documentRelations,entityCandidates,history}`. Events include original date, facility, claimType, evidenceIds and mergedIntoId where applicable. Suggestions are candidates, never automatic merges.
- POST `/api/reconciliation/events/merge` `{accountId,sourceEventId,targetEventId,reason}` → reconciliation view. Must be same account, distinct current events, compatible site attribution. Keeps source event and original history, unions source links, reassigns affected opportunities to target, recomputes scores. Response also includes `mergeId`.
- POST `/api/reconciliation/events/unmerge` `{mergeId,reason}` → reconciliation view. Restores prior event mappings if not subsequently edited; returns409 on conflict. No historical rows deleted.
- POST `/api/reconciliation/entities/match` `{domain?,legalName?,registryId?,parentId?,subsidiary?,aliases?}` → `{status,id?,matches?,reason?}`. Only suggestions; do not merge subsidiaries by a common domain.

## Source relationships and review

- POST `/api/evidence/:id/relationships` `{relatedDocumentId,type:'supersedes'|'contradicts'|'corroborates'|'same_announcement',reason}`. The document in the URL is the **newer/source** document: e.g. URL doc A supersedes related doc B. Same account required, source document reviewed. Both documents retained. Superseded source loses support credit and affected opportunities require review; contradiction affects readiness; shared-announcement origins cannot inflate confidence. Returns `{document,relationship,affectedOpportunityIds}`.
- GET `/api/evidence/:id` additionally returns `{relationships,reviewHistory}`.
- Research POST supports optional `forceRefresh:boolean` (defaultfalse). A real recheck still obeys source access and network limits. Normal cache behavior remains visible.

## Territory

PUT `/api/territory` adds optional `operatingRuleMode:'any_reviewed_site'|'all_reviewed_sites'|'primary_site'` (defaultany). Freeform `operatingRule` remains its saved analyst explanation, not an arbitrary executable language. The UI supplies a real mode selector and describes the text as explanation. `subregions` and `exclusions` accept either country codes (exclusions), ISO-like `MY-10`, explicit `SG:Singapore`, or exact locality names. A restriction with an unknown facility subregion produces unresolved, never a silent pass. Country exclusions apply to the chosen location basis, never globally to overseas headquarters.

Facilities may have `{subregion,subregionCode,isPrimary,reviewStatus,evidenceIds}`. Explicit unreviewed/rejected facility facts cannot confer confirmed eligibility. New account headquarters/purchasing-country values require analyst review before qualifying those location bases. Preserve legacy reviewed seed records and fixture behavior.

## Verification

Every finding/fix gets a targeted regression check or recorded browser check. No synthetic test account is inserted into the user's main database. A backup is retained at `storage/backups/intelligence-before-audit-2026-10-17.sqlite`.

Source relationship correction: POST `/api/evidence/relationships/:relationshipId/revoke` accepts `{reason}` (at least10characters), retaining the relationship with revoked status and audit history. Re-establishing it after review reactivates its stable ID.
