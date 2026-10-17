# Deep feature audit — 17 October 2026

The implemented local workflows passed the checks below after failures were repaired. Features were retained. The audit expanded persistent authoring and reconciliation rather than hiding incomplete controls. This is evidence of tested behavior, not a guarantee about every possible input or the continued availability of third-party websites.

## Measured result

- `RUN_HTTP_TESTS=1 npm test`: **106 tests passed, 0 failed, 0 skipped**, including actual temporary HTTP listeners and startup subprocesses. Recorded run: 5.653 seconds. [Full output](../deliverables/deep-audit-tests.txt).
- `npm run build`: TypeScript and production Vite build passed.
- `npm run validate:data`: 24 screened organizations, 7 deep accounts, 20 reviewed logical extracts from19 canonical URLs, 9 opportunities, 8 unique opportunity event clusters, 9 account-source families, 8 conservative independent-origin groups, 9 HP product families/14 product source records, 36 actions, 30 unresolved buyer roles, **0 foreign-key violations**. [Integrity output](../deliverables/data-validation.json).
- `npm run export:briefs`: seven evidence-linked Markdown and printable account briefs regenerated successfully.
- Direct before/after comparison of the working database found **all11 checked record tables unchanged**, including source versions, notes, runs, territory and policy. [Preservation result](../deliverables/deep-audit-data-preservation.json). Additive migrations created relationship/reconciliation storage and materialized existing curated supersession without changing source facts.

The reviewed seed and the current working database are different measurements: the working database also retains an earlier rejected live extract and real research history. New audit fixtures and browser mutations stayed in `storage/audit-2026-10-17.sqlite`, not the working database.

## Feature checks

| Capability | Verification and result |
| --- | --- |
| Startup/setup | Normal startup/health/shutdown, invalid host/port/path, occupied port, dev child failure and configurable proxy tested. Readiness is logged only after an actual listener; failures exit nonzero. |
| Territory | Country, location basis, primary/any/all site rules, locality restrictions, HQ exclusions, missing/unreviewed sites and purchasing-location uncertainty tested. Browser save recomputed eligibility without rewriting source facts. |
| Ranked shortlist | Browser search, empty state, readiness filtering, reset and sorting exercised; deterministic tier-before-score and tie behavior regression tested. |
| Account directory/comparison | Browser created an isolated account, compared Micron/Sunway and opened accounts. New records are distinguished from research demonstrations. |
| Account/facility authoring | Browser saved account and facility; API tested full edits, source-based review, locality and primary flags, stable IDs, invalid inputs and persistence. Unreviewed locations cannot qualify pursuit. |
| Events/opportunities | Browser created a distinct event and opportunity using a stored event and HP family. API checks event/facility/account isolation, supported product scope, evidence requirements and commercial unknowns. |
| Buyer map | Browser added an unresolved buyer role and displayed it in the map. API rejects unsupported names and verified authority claims, cross-account or superseded supporting sources. No private contacts are generated. |
| Action plan | Browser saved full action content, outcome, role, question and advance/stop conditions, then changed progress to done. API verifies stable IDs and content persistence. |
| Qualification | Browser saved status and an explicit fictional test note; the log and downloaded brief retained it. API checks assessment notes, score inputs and persistence. |
| Procurement/amendments | Actual mounted API checks explicit reviewed notice support, deadline extension, amendment basis, future verification rejection, expired/reopened notices, replacement notices and retained history. The browser form is exposed with the same validated contract; no real notice was falsely reverified during the audit. |
| Evidence explorer | Browser account/search filters, source detail, original URL, retained passage, dates, versions, linked hypotheses and review history checked. Accepted/rejected/new candidate states remain distinct. |
| Source review | Browser saved review and confirmed it after reload. Metadata editor exposes title, ≤25-word passage, section/page/language and separate dates; latest retrieved values are unreviewed comparisons. API verifies factual claim, passage and family synchronization with audit history. |
| Source relationships | Browser saved and revoked a same-announcement test relationship, retaining its reason/history. Regression checks supersession, conflicts, chronology, cycles, revocation/reactivation and confidence/metric independence groups. |
| Event reconciliation | Browser inspected heuristic duplicate suggestions, manually merged test events, then restored their mappings. Tests cover cross-site/country rejection, duplicate-key consistency, source retention and refusal to overwrite later edits. |
| Event-evidence propagation | Changed/rejected/superseded/conflicting event support suspends dependent opportunities even when workload documents differ. Event-only sources do not automatically inflate opportunity corroboration. |
| Stored relationship graph | Browser selected a stored document node and opened its evidence drawer. Graph uses actual account/facility/event/opportunity/document/action links; context differs from support. |
| Research queue | Browser submitted a real HTML request to example.org on the explicitly fictional audit account:1 requested,1 retrieved,0 failed;1 unreviewed document/candidate,0 events. This was a transport test, not enterprise evidence. A second run reused cache:0 retrieved,1 skipped. |
| Research cancellation/errors | Browser canceled a run: partial,0 retrieved,1 skipped,0 failed, with cancellation reason. Private-loopback source input displayed a useful rejection. Existing failed runs and research-session source failures remained inspectable. |
| Adapters | Native HTML/JSON/RSS/Atom/PDF parsers, malformed data, non-UTF8 handling, physical PDF references,60-page bound, metadata dates, content changes, redirect aliases, cache/force refresh, timeout and abort behavior tested. Current live availability is separate from parser correctness. Earlier real HTML/PDF run records are preserved. |
| Connector settings | Browser toggled Structured JSON off/on; saved setting and adapter availability updated. Fixed controlled-input flicker and added a specific accessible name for each connector. Planned/manual integrations cannot be enabled as fictitious runtime connectors. |
| Scoring/policy | Browser invalid weight total disabled saving, reset restored saved inputs, save appended a policy version. Rubrics, freshness and four real sensitivity calculations remain visible.106-test suite includes eligibility/expiry/contradiction/missing-value/unknown-scale and score reproducibility checks. |
| Exports | Browser downloaded an authored Markdown account brief and inspected its persisted note/action/buyer/unknowns. Printable HTML opened successfully. API tested Markdown/JSON/CSV/HTML, empty authored accounts, supported/contradicting/context/superseded evidence, amendments, chronology, missing records, unsupported formats, HTML escaping and CSV formula protection. Physical paper printing was not performed. |
| Methodology/catalog | Browser methodology, research limitations and official HP family catalog rendered; all9 families/14 official source records pass corpus checks. Source support remains distinct from purchase intent and regional product availability. |
| Responsive/keyboard | Browser checked1440×1000 desktop overview and390×844 mobile overview, research, scoring, methodology, directory and account/form layouts: document width390 with no page overflow; authoring dialog388px with no internal horizontal overflow. Mobile navigation, arrow-key account tabs and Escape dismissal worked. Temporary viewport override was reset. |
| Seed updates | Tests confirm authored content, buyer/action edits, reviewed claims, evidence relationships and immutable versions survive repeated seed synchronization. No reset or replacement database was used for user data. |

## Repairs made

Territory exclusions now follow the chosen location basis; parent HQ cannot veto an eligible deployment site. Locality restrictions and executable operating-site modes work. New location assertions need source review. Nurture no longer overrides exclusion, explicit out-of-scope fit remains blocked, context-only changes do not falsely refresh/demote independent buying evidence, and invalid notice dates cannot establish active procurement.

Accounts, facilities, events, opportunities, buyers, action content and procurement notices now have persistent validated authoring workflows. Reviewed evidence can start a new hypothesis. Source reviews retain before/after history and synchronize claim metadata. Event duplicates and source supersession/conflicts can be resolved with stable IDs and reversible audited operations. Unicode identifiers no longer collapse distinct non-Latin names or events. Merge compatibility covers all relevant site/country bindings and updates/restores duplicate keys atomically.

Ingestion now ranks substantive passages, separates publication from modified/feed/PDF-technical dates, retains physical page references and truncation limits, handles redirect aliases without duplicating claims, respects source access/backoff, and bounds uncooperative retrieval/cancellation. Rechecks preserve reviewed facts until explicit correction. Startup and development failures no longer masquerade as a ready server. Exports preserve authored unknowns, evidence relationship types, supersession and procurement amendment history.

## Explicit limits

- The app is a single-user local Node/SQLite application; no cloud deployment or production multi-user security/load test was performed.
- “Global South East” still has no explicit agreed country list. The working territory remains unverified, as required by the assignment. Test territory changes were isolated. HP ownership, channel authorization and model availability remain separate qualification questions.
- Country procurement discovery and source-specific ATS connectors remain clearly labeled planned/not applicable. They are optional integration candidates, not falsely working connections. Four reusable native retrieval adapters exist; a particular site can still refuse access or fail.
- Native retrieval does not provide open-web search, automatic translation, semantic buyer verification or automatic interpretation of amendments. Ranked candidates, change hints and duplicate suggestions require analyst review. No paid or integrated model provider was enabled.
- PDF extraction is text-only, bounded to the first60 physical pages; no OCR/browser-rendering bypass is claimed. Original source links and reviewed page references remain available when a recheck cannot reproduce the passage.
- This audit validates software behavior and corpus integrity. It does not independently establish every underlying public claim, reverify every current tender term, measure sales conversion, or guarantee ongoing external-source availability. Monetary scenarios and pricing estimates remain unimplemented optional scope; no revenue pipeline is fabricated.

Open the verified application at [http://127.0.0.1:3001](http://127.0.0.1:3001). Setup and operating instructions are in [README](../README.md); exact authoring and reconciliation contracts are in [authoring-api.md](authoring-api.md), [ui-api-contract.md](ui-api-contract.md), and [audit-api.md](audit-api.md).

## Visual record

[Desktop verification](../deliverables/screenshots/deep-audit-desktop.png) · [Mobile verification](../deliverables/screenshots/deep-audit-mobile.png). The temporary desktop/mobile viewport overrides were reset. The main app was reopened with7 original accounts and9 opportunities; browser console checks found no warnings or errors in the refreshed view.
