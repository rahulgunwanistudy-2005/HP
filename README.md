# HP Account Intelligence

A working, local-first enterprise sales research application. Public evidence connects an account to a business event, a possible operational requirement, an HP Inc. opportunity hypothesis and a qualification action.

**Open the running application:** <http://127.0.0.1:3001>

This is an independent internship demonstration, not an official HP system. It requires no paid data service or language-model key. The real reviewed dataset is clearly separated from analyst-initiated retrieval. Following the user’s ASEAN clarification, the priority territory is **Indonesia, Malaysia, Philippines, Singapore, Thailand and Vietnam (ASEAN-6)**. Eligibility follows reviewed operating locations; HP ownership and purchasing authority remain separate checks.

## Run

Install Node **24.15 or later within 24.x** (validated on 24.19.0) and npm. The native `node:sqlite` binding is a release candidate in this Node line; the database is ordinary SQLite.

```sh
npm ci
npm run seed
npm run build
npm start
```

Open <http://127.0.0.1:3001>. The server binds to loopback. Initial startup also seeds a missing database; repeated seeding preserves analyst changes. For development, run `npm run dev` and open <http://127.0.0.1:5173>. Vite proxies the API to port 3001.

Configuration is optional. Copy `.env.example` to `.env` if needed; server startup loads it. The default database is `storage/intelligence.sqlite`. Preserve that file and its WAL state. See [deployment and backup](docs/deployment.md). Nothing runs on a recurring external schedule.

## Hosting

Deploy the frontend to Vercel and the persistent Node backend to Render from this GitHub repository. Hosted workspaces have a private access-key sign-in. The configuration, required environment variables, paid disk requirement, backup guidance and verification steps are in [the deployment guide](docs/deployment.md). A new cloud disk imports the reviewed corpus; local analyst history requires a private database migration.

## Use

1. Inspect **Territory & coverage**. Explicit country codes and the headquarters, operating-site or purchasing-location rule determine eligibility. Configure only a boundary you can justify. HP ownership and supply authorization remain separate.
2. Filter **Opportunities** by readiness, product family or territory. Scores rank within readiness tiers; the evidence assessment is shown alongside the effective pursuit gate.
3. Open an opportunity. Follow the reasoning chain, source passages, dated facts, unknowns, buyer roles, constraints and tailored action plan.
4. **Research operations** retrieves up to five selected public URLs per run. Inspect real outcomes, cached results, errors and document versions. HTML/PDF live retrieval is demonstrated; JSON and RSS/Atom adapters have deterministic parser checks. Source-specific ATS and procurement discovery integrations remain planned.
5. Review new source text in **Evidence library**. Attach supporting, contradictory or contextual evidence to the correct account's opportunity. New text does not automatically become verified purchasing intent.
6. Create or edit accounts, evidenced facilities, events, opportunities, buyer roles and action content. Review duplicate events and merge/restore their mappings; record superseding or contradicting sources with reversible audited relationships. Save qualification notes, status and action progress. The sourced procurement form records notice identifiers, deadlines, amendments, replacement evidence and verification history; quick assessment controls require an existing accepted notice. An assessment is analyst-entered, not independent verification by the application.
7. Download Markdown, JSON or CSV; use the print brief for printing or browser PDF output. CSV exports neutralize spreadsheet formulas.

## Demonstration corpus

The active directory contains **35 ASEAN prospective accounts**, with **5 deep research demonstrations and 30 screened prospects**. USA / Canada reference cases are archived outside active lists. Every active account has sourced company and buying-organization details, official supplier routes or corporate routing guidance, and public business contacts where published. Individual deal authority remains separate from company identity. The active discovery ledger has 50 organizations and the workspace has 39 opportunity / committed-reference records. The HP catalog retains 9 product families and 14 official source records. See [buyer details and report dates](docs/buyer-details-and-report-dates.md), [buyer sources](deliverables/buying-organizations-source-manifest.csv) and [current corpus validation](deliverables/data-validation.json).

**Report edition: 15 Oct.** Presentation pages and printable / Markdown briefs use the user-selected report date. Actual collection, review and buyer-source-check dates remain in Research operations and raw evidence / JSON exports. Event dates, source publication dates, deadlines and freshness calculations are preserved.

Cases include Micron's Singapore engineering programme, Sunway hospital expansion, ePac's already committed Indigo agreement, Changi contractor and HP Inc. scope constraints, DreamWorks' documented Lenovo relationship, LEGO's historical openings, and THK's explicit print tender. The THK listing was open when reviewed, with a 23 October 2026 noon Singapore deadline. It does **not** establish HP bid eligibility. Always recheck the notice before a decision. Source manifests preserve the review date; old events do not become new because they are retrieved again.

## Verify and export

```sh
npm test
RUN_HTTP_TESTS=1 npm test
npm run validate:data
npm run export:briefs
npm run research -- thk
```

`npm test` uses local deterministic fixtures and a fresh in-memory or temporary database; HTTP listener and startup integration cases are opt-in because restricted environments may prohibit local listeners. `RUN_HTTP_TESTS=1` includes them. No test depends on external availability. `validate:data` checks provenance links, account attribution, required fields, quotation limits, foreign keys and actual sensitivity results. Research CLI requires the server to be running and queues a real bounded job.

For an existing database, `node --import tsx scripts/apply-asean-expansion.ts` adds the new cohort and applies the user-authorized ASEAN scope once, preserving the prior boundary in history. Subsequent runs preserve later territory edits. Back up first.

For the buyer / archive update, run `node --import tsx scripts/apply-buyer-enrichment.ts` against an existing database after backing it up.

Reviewed evidence updates can be synchronized with `node --import tsx scripts/update-reviewed-seed.ts`. This retains notes, research runs, document history, territory and workflow progress; it never deletes rows. Back up a database before applying dataset changes.

Generated briefs are in `deliverables/briefs/`. Validation results and real live-run outcomes are in `deliverables/`. Exports reflect the current database, including clear limitations and analyst notes.

## Evaluator materials

- [Confirmed decisions](docs/requirements.md) and [original assignment](docs/assignment.md)
- [Architecture and data model](docs/architecture.md)
- [API contracts](docs/ui-api-contract.md)
- [Source manifest and selection rationale](docs/research-selection.md)
- [Coverage and gaps](docs/coverage.md)
- [HP official product research](docs/product-research.md)
- [Scoring rubric and versioning](docs/scoring.md)
- [Deep feature audit and fixes](docs/deep-audit.md) and [original measured validation](docs/validation.md)
- [Authoring API](docs/authoring-api.md) and [reconciliation API](docs/audit-api.md)
- [Deployment and persistence](docs/deployment.md)
- [6½-minute demonstration script](docs/demo-script.md)
- [Future data options](docs/future-data.md)

## Practical limits

This is a single-user local application, not an exhaustive market census or autonomous sales agent. It has no HP CRM, ownership, installed-base, prices, margins or private contacts. Buyers are role hypotheses. Unknown quantities earn no unsupported points; there is no revenue total, win probability or automatic outreach. The reviewed corpus is English-biased and small. Native extraction does not provide open-web search, semantic subsidiary resolution, automatic amendment interpretation or an integrated AI provider. JSON/RSS adapters are generic; specific live integrations need their own contracts and validation. Manual source supersession and sourced amendments work; automatic semantic interpretation remains an analyst task. The Node/SQLite backend requires a Node host with durable disk; the included Render configuration provides this architecture, with Vercel serving the frontend.

The 17 October deep audit passed **106 automated checks with no failures or skips**, plus desktop/mobile browser checks. It added persistent authoring and reconciliation, corrected eligibility/scoring/ingestion/startup edge cases, and verified the complete local workflow. See [the measured audit](docs/deep-audit.md) for exact checks and limits.

Latest qualification review: [resolved facts, committed scope and remaining gates](docs/qualification-progress.md). Eight additional source records establish a one-workstation TNB Research notice, a PTT 450-notebook committed lease with a published THB24.61m budget, and updated project / notice evidence. Published budgets are kept separate from contract values and open pipeline.
