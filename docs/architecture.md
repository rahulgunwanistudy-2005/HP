# Architecture and data model

HP Account Intelligence is a local, single-user sales-research demonstration. It joins reviewed public-source account records, explicit opportunity hypotheses, deterministic ranking, analyst qualification and bounded document retrieval. The default workflow requires no paid data subscription or language-model key.

## Runtime and application boundaries

| Layer | Implementation | Responsibility |
| --- | --- | --- |
| Interface | React and TypeScript, Vite | Territory and coverage, opportunity/account/evidence workspaces, research operations, scoring and methodology |
| HTTP API | Express 5, Zod | Validated reads and mutations, pagination, job operations, review, score snapshots and exports |
| Persistence | SQLite through Node's `node:sqlite` DatabaseSync | Relational identity and relationships, JSON record payloads, transactional writes |
| Background work | In-process ResearchQueue | Persistent job records, two concurrent URL workers within one running job, cancellation, retries and outcome accounting |
| Retrieval | Native HTTP(S), vetted DNS lookup, isolated HTML/XML/JSON/PDF parsing processes | Public document extraction and provenance |
| Optional assistance | DraftProvider interface and NoKeyProvider | Extension seam only; no external model API is integrated |

The verified execution runtime is Node 24.19.0. Its native SQLite module is a release candidate, not a fully stable API. The [versioned Node 24 documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html) marks release-candidate status starting with 24.15. DatabaseSync calls execute synchronously. Dependencies and actual resolved versions are recorded in the package manifest and lockfile; official implementation references are in `docs/product-research.md`.

Vite serves the interface during development, while the API runs separately. The production build is served by Express when `dist/index.html` exists. The process binds to loopback by default. The source contains no distributed queue, external database, CRM integration or multi-tenant account system.

## Important source files

- `server/app.ts`: API schemas, endpoints, local-access checks, token/origin checks and response headers.
- `server/index.ts`: environment loading, seed startup, server binding, worker start and shutdown.
- `server/db.ts`: database connection, prepared-statement helpers, transactions, hashing and canonical URLs.
- `server/migrations/001-initial.sql`: relational schema and indexes.
- `server/repository.ts`: reviewed seed import, account/opportunity assembly, relationships, metrics, snapshots, sensitivity and graph data.
- `server/intelligence.ts`: territory eligibility, family taxonomy, freshness, ordinal scores, entity matching and exact event keys.
- `server/retrieval.ts`: URL/DNS/redirect/access checks, network bounds and parsers.
- `server/research.ts`: queue execution, persistence, source-change handling and version snapshots.
- `server/pdf-worker.mjs` and `server/text-worker.ts`: separate, time-bounded extraction processes.
- `server/exports.ts`: Markdown briefs, escaped print view, JSON/CSV outputs.
- `server/provider.ts`: disabled/no-key model-provider interface.
- `data/research-accounts.json` and `data/products.json`: reproducible reviewed records and official HP Inc. family catalog.

## Relational model

The schema uses explicit foreign keys for account and evidence relationships, while record-specific fields remain in JSON payloads. This keeps the demonstration maintainable without introducing a second data store.

| Tables | Purpose and relationships |
| --- | --- |
| territories | Versioned territory configuration, including explicit country list, basis, languages and exclusions |
| accounts, account_relationships, facilities | Parent enterprise, related legal entities and separately attributed deployment sites |
| products | HP Inc. family catalog with capability, prerequisite and source review information |
| connectors, sources | Adapter configuration/status and source origin/family identity |
| documents, document_versions | Current source record, canonical URL, fingerprint, retained passage and historical metadata snapshots |
| claims | Narrow factual wording or unreviewed candidate extraction, its document, entity/time context and review status |
| events, event_evidence | Account event cluster and its supporting source links |
| opportunities, opportunity_evidence | Opportunity hypotheses and supports/contradicts/context relationships to source documents |
| buyer_roles, competitive_constraints, actions | Buyer targets, barriers and opportunity-specific advancement steps |
| analyst_notes | Persistent qualification notes |
| scoring_policies, score_snapshots | Versioned weights/rubrics and computed score audit history |
| research_runs | Job configuration, timestamps, results, failures, cancellation and measured usage counters |
| app_metadata, schema_migrations | Seed state, research coverage and schema initialization marker |

The chain is account → event → potential requirement in the opportunity → HP family → qualification action. Evidence relationships connect documents and claims to the event/opportunity. Graph output is assembled from these stored rows; it is not a decorative fixed diagram.

A document's publication/event dates, retrieval timestamp, review state, source family, origin and independence grouping are distinct. Source support is not the same as purchasing intent or analyst endorsement. Seed import preserves descriptive source-family labels and normalizes policy identifiers. A shared announcement or corporate group can use one independenceGroup even when published on several domains.

Document versions retain fingerprints, source metadata and selected extracts. They are not complete archived copies of every source page, nor a complete visual diff of remote documents. Live rechecks preserve the curated passage and require review when it disappears or content changes.

The database applies numbered SQL migrations exactly once, in order, inside transactions. Migration 001 is the core schema; 002 adds document relationships and event reconciliation history; 003 preserves curated supersession as reversible relationships. Applied versions and timestamps remain in schema_migrations.

## Reviewed seed and live retrieval flow

The startup seed runs once per database seedVersion. It imports reviewed accounts, separate facilities, public sources, factual claims, events, buyer roles, actions and hypotheses. It validates foreign-key relationships during writes and fails on missing opportunity evidence. Restarting an existing database preserves analyst edits. Changing source JSON alone does not overwrite an already-seeded database.

A research run follows these steps:

1. The analyst selects an existing account and supplies up to five public URLs, or chooses existing account sources. The API validates URL structure and the chosen adapter.
2. A queued run is stored before execution. A single process handles one run at a time; that run has two URL workers.
3. URL, DNS, redirect, robots/access and size/time checks run before extraction. A recent live retrieval can be reused: one-hour cache for procurement, otherwise 24 hours. An explicit forceRefresh bypasses the cache and future timestamps never suppress retrieval.
4. HTML, JSON, feed or PDF extraction yields text and a fingerprint. It does not interpret an event as an order.
5. A new document and any substantive candidate claim are stored as needs_review; boilerplate-only extraction records no substantive finding rather than inventing a factual claim. New material remains unclassified until analyst review. Acceptance requires a factual claim and source family; date fields remain unknown unless reviewed. The analyst must establish entity, date, location and relevance.
6. Existing-document rechecks append a version. Changed content or a missing retained passage invalidates document and claim review, then recomputes affected opportunity snapshots.
7. Results distinguish retrieved/new/changed/cached/skipped/failed outcomes. A successful adapter updates its status only after actual retrieval.
8. Completion can be completed, partial or failed. Cancellation is retained explicitly; a canceled request cannot be stored as a successful extract. Interrupted running jobs recover as partial.

There is no recurring account-discovery scheduler, autonomous procurement-portal search, automatic multilingual translation, automatic claim verification or automatic opportunity generation from arbitrary retrieved pages. The optional provider returns no drafts in the no-key implementation. Seed research and live deterministic extraction are labeled separately.

Entity suggestions use Unicode-normalized registry/domain/legal-name/alias identifiers and preserve explicit subsidiary uncertainty. Event keys include account, Unicode-normalized label, actual date and facility. Title-token overlap, source overlap, dates and site compatibility produce duplicate suggestions. Only an analyst can merge events; source rows, mappings and audit history remain. Undo refuses to overwrite later edits or duplicate keys. Site attribution and event keys update atomically.

## API and export behavior

Read operations expose territory, accounts, opportunities, evidence/versions, jobs, connectors, scoring, validation and account graph relationships. Paginated lists have explicit bounds. Mutations validate account purchasing context, opportunity qualification/status/dimensions, actions, evidence review, territory, connector enablement and policy weights. Errors use a consistent JSON envelope.

The interface and /api/authoring endpoints create and edit accounts, facilities, events, opportunities, buyer roles, action content and sourced procurement records. Reviewed evidence can seed a new opportunity form. New assertions remain unreviewed until account-specific source review; authoring never silently creates a verified buyer, monetary value or procurement notice. Audit notes retain before/after states. See docs/authoring-api.md.

Markdown account briefs and structured JSON/CSV exports include hypothesis wording, provenance, dates, unknowns, readiness and actions. The print view escapes source text and has a browser print/save-PDF control. There is no server PDF-rendering service. CSV cells are quoted and formula-leading content is escaped. No overlapping opportunity totals are presented as a monetary pipeline.

## Security properties and practical limits

Implemented controls include credential-free HTTP(S) URLs, supported public ports, IPv4/IPv6 and mapped-address classification, rejection of private/reserved/metadata destinations, rejection of mixed DNS answers, and connection to the same vetted addresses while retaining the hostname/TLS identity. Redirect targets are revalidated and checked against access conditions before their content request.

Responses are bounded to 5 MiB, requests have a ten-second timeout, redirects are bounded, and one retry handles transient failures. Per-host request spacing and cached robots checks reduce unnecessary load. Restricted or inaccessible access conditions are recorded as failures; authentication and anti-bot restrictions are not bypassed.

HTML is reduced to text and escaped again when rendered in printable output. XML DTD/entity declarations are rejected. JSON extraction has traversal/text bounds. Text and PDF parsing run on already-vetted bytes in separate processes with a ten-second timeout and output bound; image-only PDFs and sources requiring browser JavaScript can fail honestly. There is no OCR or full browser-rendering fallback in the native runtime.

The API binds locally by default, blocks non-loopback host access without a token, checks bearer credentials when configured, blocks untrusted mutation origins, and sets no-store/security response headers. Non-loopback startup additionally requires a token of at least 32 characters. A remote deployment still needs the documented authenticated reverse proxy, TLS and persistent volume. These controls have not been assessed as a multi-user enterprise security boundary or a penetration test.

The job execution bound is 90 seconds, but this is an in-process cancellation mechanism. OS DNS behavior and synchronous parsing/database work are not a proof of a hard real-time deadline. This is a bounded local demonstration, not a measured high-throughput research service. Queue recovery preserves outcomes but does not automatically resume unfinished URLs.

SQLite WAL, foreign keys, prepared statements and transactional writes support the intended local workload. Database files and document storage must reside on a persistent filesystem. Synchronous SQLite work and one application process limit concurrency; no multi-host or multi-writer capacity claim has been measured. See deployment documentation for backup and hosting instructions.

## Verification scope

The independent core suite covers territory/facility attribution, unknown-score behavior, freshness, procurement expiry, contradictions, source changes, independence grouping, exact event clustering, entity uncertainty, exports, parser safety, URL/DNS checks, partial runs, cancellation and restart recovery. It uses fictional local fixtures and injected retrievers, without external network dependencies. Integration/browser checks and actual measured outcomes belong in `docs/validation.md`; code structure and passing unit tests alone do not establish source completeness or recommendation accuracy.


## Deep-audit additions (17 October 2026)

Document relationships explicitly record supersedes, contradicts, corroborates and same_announcement. Superseded evidence loses supporting credit; material conflicts suspend readiness. Shared-announcement links consolidate independence groups in confidence and metrics. Relationships can be revoked with a reason and reactivated after review without deleting source facts or history. Publication chronology is compared only with publication chronology; a future business milestone is not a document issuance date.

Event-source review also propagates to dependent opportunities, even when their workload evidence cites different documents. Event-only documents are displayed separately and do not automatically become independent opportunity corroboration. The graph includes real facilities, stored events, sources, opportunities, actions and product relationships where a product ID is available. Context edges remain distinct from support.

Territory supports any reviewed site, all relevant reviewed sites and one evidenced primary site, with country/locality restrictions. Restrictions apply to the selected location basis; parent HQ does not override a deployment-site rule. Explicit unreviewed sites and newly asserted headquarters/purchasing facts cannot qualify pursuit. Rule prose is an analyst explanation; the selectable mode is executable.

HTML prioritizes main/article paragraphs and exposes metadata separately. Feed updates are not publication dates. PDF extraction is limited to the first 60 physical pages, retains available page references and identifies truncation. Parsing uses a 192 MiB JavaScript heap and a ten-second process limit. Source access controls, robots policy, retries, redirects, encoding and cancellation are regression tested. Latest retrieved passages/title/date appear as unreviewed comparisons; reviewed source wording remains until explicitly accepted or corrected.

Startup validates configuration, waits for the listening event, and fails nonzero on an occupied port. The development supervisor restarts backend changes, propagates child failures and uses the configured API port. Full measured checks are in docs/deep-audit.md.
