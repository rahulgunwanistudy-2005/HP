# Confirmed requirements and decisions

Recorded 2026-10-16. Source: [full user assignment](assignment.md).

Product: **HP Account Intelligence** for enterprise sellers. Public evidence must connect account → business event → potential requirement → HP Inc. product opportunity → qualification action. Hypotheses are never purchase intent.

- Large enterprises and potentially sizable deals; new product sales primary. Multiple opportunities per account. Acquisition, replacement, expansion and renewal only as hypotheses supported by evidence.
- Territory wording “global South East” is unresolved. Asked once for exact countries and deadline/rubric. No countries assumed. All initial real enterprises are demonstration records, not qualified territory prospects.
- Public free sources; no HP CRM, fleet, contract, prices, margin, account ownership, eligibility or contact guesses.
- Local-first single-user Node 24 + React/TypeScript + SQLite; no paid key needed. Persistent research queue; reviewed seed records explicitly distinct from live retrieval. No external scheduled monitors.
- Deterministic scoring, ordinal rubrics, gates first, unknown zero points, provisional weights 25/20/20/15/10/10. No purchase probabilities or invented revenue.
- Full evidence provenance, source-family coverage, independent origin, chronology, review, contradictions, failed retrievals and account-specific 0–90-day qualification actions.
- Persist analyst edits; Markdown, JSON, CSV and print exports; bounded public URL retrieval; no outreach automatically.
- Hosting suitability assessed separately. Never deploy a static-only shell in place of the persistent application. Local SQLite requires a Node host and persistent disk; Sites Workers require a D1 port before full deployment.

Acceptance: runnable documented app, reproducible sources, real persisted ingestion outcome, territory behavior, evidence-linked explanations, durable edits, meaningful tests and browser checks, honest limitations and panel materials. Implementation status is recorded in validation and coverage reports.

The user later clarified “all the major countries in the global south east” and authorized referring to the prior “Map HP Prospects” chat. That chat was read; it confirms the same large-enterprise/public-data/actionability priorities but contains no exact country list. No deadline constraint was imposed. Country configuration therefore remains explicitly unverified.

## 17 October 2026 — prospect volume and ASEAN clarification

The user requested at least 30 prospective clients in the account directory and clarified the territory as the major ASEAN economies. The implemented priority markets are ID, MY, PH, SG, TH and VN, using reviewed operating-country evidence. ASEAN-6 is a sales-priority scope, not the full ASEAN membership list. Thirty new primary-source screened prospects complement the original seven deep demonstrations; 35 accounts match the territory and two territory-unqualified references remain accessible. Screened prospects must remain explicitly distinct from active procurement and deep research. Existing records and analyst work must be preserved. This supersedes the earlier unresolved-boundary decision.

## Buyer-detail and presentation update

The user requested removal of USA and Canada from prospect lists, substantive Who Buys details for every prospect, and 15 Oct dates outside Research operations. The active workspace now excludes the two North American reference cases while retaining their underlying history. All 35 active accounts receive sourced company / purchasing profiles. Fifteen October is explicitly a report presentation edition; actual retrieval and audit dates remain in Research operations and machine-readable evidence. Source publication dates, business events, procurement deadlines, verification facts and scoring chronology must remain accurate.

## Qualification research refinement

Resolve unknowns using real public evidence; retain unresolved private requirements. Distinguish supplier process from HP authorization, company identity from deal approval, dated events from buying intent, and quantities/budget/reference price/awarded value from one another. Preserve watchlists and exclusions when evidence does not justify promotion. Committed purchases remain visible with their actual scope and a clear issued-PO label. Keep original evidence versions, analyst notes and completed actions.
