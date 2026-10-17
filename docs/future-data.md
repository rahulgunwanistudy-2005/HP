# Future data and integration options

The application is useful without paid intelligence: reviewed evidence, provenance, deterministic scoring, qualification records and exports work with the local dataset. Additional data should reduce specific uncertainties, not replace review with a larger opaque score. No paid service, subscription, external model or recurring monitor has been activated.

This document describes capability categories only. It makes no claim about a particular provider's current coverage, product contract, pricing, permissions or terms.

## Capabilities worth evaluating

| Category | Possible improvement | What it would still not establish |
|---|---|---|
| Licensed company identity and hierarchy data | Registry identifiers, aliases, ownership links, legal entities and subsidiary relationships | That a parent controls a site's procurement or that HP owns the account |
| Licensed geographic and facility coverage | Better local-language discovery, operating-site identifiers and project updates | That a facility is territory-eligible under an unresolved country rule or needs equipment |
| Licensed public filings and procurement collections | More systematic notice discovery, amendment history, awards and change alerts | That an apparently open notice is still live, that HP can bid or that a service subscription permits unrestricted reuse |
| Licensed business-role/contact information | A starting point for verifying current role, organization and relevance | Purchasing authority, consent to contact, a private email address, or permission to message anyone |
| Licensed public intent or technology signals | Additional contextual inputs from disclosed public sources and appropriately licensed observations | A device order, a sourcing window, installed-base truth or purchase/win probability |
| Licensed document access and language support | Wider lawful access, translation support and improved retrieval for difficult sources | Independent truth, permission to retain complete copyrighted documents, or the absence of translation error |
| Optional language-model extraction and drafting | Candidate claim extraction, event matching, source comparison and draft briefs | Verified facts, confirmed intent or safe automatic publication |

The categories overlap; one subscription should not be counted as several independent source origins. Broader coverage can also create more duplicate stories and contradictions. Public original documents should remain available for checking important claims wherever permitted.

## Admission checks before selecting or enabling a service

Evaluate a specific candidate against a concrete gap, such as unresolved hospital contracting entities or missed local procurement amendments. Verify its current official capability documentation and contract at the time of selection. Assess:

- Countries, languages, industries and entity/site granularity actually covered.
- Original-source provenance, event versus retrieval dates, amendment support and historical depth.
- Rights to retrieve, store extracts, display in the application, export in briefs and retain after termination.
- Contact-data privacy, lawful use, update/deletion handling and restrictions on outreach.
- Rate limits, bounded cost, reliability, authentication and availability of a suitable evaluation sample.
- How errors, stale data, uncertain matches and coverage gaps are represented.

Do not buy coverage merely to increase a source count. No current provider claim is assumed by this design.

## Integration boundaries

A new connector should remain server-side, use bounded jobs and preserve the existing run history: requested, retrieved, skipped, failed and changed sources. Provider identifiers supplement stable local account/facility IDs; uncertain matches must remain reviewable. Source URLs, publisher origin, independence grouping, licensing metadata, date precision and access limitations must survive import and export.

Keep raw licensed records separate from reviewed factual claims and opportunity hypotheses. New or changed data should enter a review state. A provider signal must not silently award points for scale, authority or procurement access. A changed or cancelled notice must invalidate the earlier review and recompute affected readiness.

The optional model-provider interface can support future extraction or draft assistance. It currently supplies no external model integration. Any future implementation must continue to work without a key, keep credentials server-side, constrain cost and treat retrieved text as untrusted source content. Drafts remain drafts until reviewed.

## Evaluate added value before expanding

Use the same small account set under the existing public-source workflow and the proposed added input. Record the actual sample size, retrieval failures, entity-match errors, duplicate-event handling, amendment detection and reviewer corrections. Assess whether the added source changes a defensible next action, resolves a buyer/entity ambiguity or prevents a mistaken pursuit.

Keep the original-source and combined views inspectable. Report observed improvements and remaining gaps without inventing prediction accuracy, conversion or revenue impact. Paid access does not remove territory, HP ownership, route-to-supply, regional product availability or customer qualification gates.

External contact, registration, bid submission and recurring monitoring require their own explicit authorized workflow. A new data connector is not authorization to contact anyone or spend money.

