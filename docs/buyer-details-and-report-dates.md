> Historical checkpoint. The later [qualification review](qualification-progress.md) supersedes corpus counts and gate assessments below; the 15 October presentation / actual audit-date policy still applies.

# Buyer details and report presentation

The active workspace contains **35 ASEAN prospective accounts**. The USA / Canada reference cases, ePac and DreamWorks, are archived outside the active directory, opportunity lists and evidence library. Their original records and evidence remain preserved. Micron remains because its relevant operating sites are in Singapore; a parent's headquarters is not the territory rule.

Every active account now has a **Who buys?** profile containing a documented company or operating-entity name, the purchasing function or role to approach, the official supplier / company route, published business contacts where available, the relevant HP technical role, entity boundaries, contract-approval checks and linked sources. The same buying context is available in the opportunity buyer map and account briefs.

The profile distinguishes a published procurement function from a role that must be identified through the company. Published roles are scoped to their actual function: BDO’s 14 October procurement vacancy concerns construction, not endpoint purchasing, and is retained only as contextual evidence. Company identity and a supplier portal do not prove an individual's budget authority, approval limit or a current equipment requirement. A named stakeholder is included only where the source explicitly documents the role: Sunway’s 2026 prospectus identifies CFO Chelsea Cheng and describes her procurement oversight. This is not a claim of device-specific PO signing authority. No private contact is inferred.

Examples of source-supported detail:

- [SM Investments' vendor policy](https://www.sminvestments.com/policy-for-vendor-selection-and-purchase-of-goods-and-services/) assigns purchasing and PO issuance to its Procurement Department, requires vendor accreditation, and directs IT purchases to involve IT. This applies to the holding company's scope; BDO remains separate.
- [PTT's procurement-unit directory](https://procurement.pttplc.com/en/page/index/1025) identifies its Material and Commercial Procurement Division for head-office goods and services, with a published telephone contact.
- [Singtel's supplier portal](https://www.singtel.com/about-us/sustainability/singtel-group-supplier-portal) documents AcuBuy and publishes a Supplier Enablement mailbox. That mailbox supports supplier-platform queries and is not treated as a budget approver.
- [LEGO's supplier information](https://www.lego.com/nl-nl/aboutus/suppliers) explains Coupa sourcing collaboration and explicitly says manufacturing / distribution POs are not generated there. Vietnam factory purchases must follow the actual issuing team's route.
- [Singapore Airlines' supplier portal](https://www.singaporeair.com/en_UK/sg/about-us/supplier-portal/) applies to Singapore Airlines Limited and explicitly excludes SIA Engineering Company.
- [Ayala Land's supplier disclosure](https://ir.ayalaland.com.ph/sustainability/social-engagement/enhancing-quality-of-life-across-our-communities/) identifies MDC's centralized procurement and accreditation processes. Drawing-output requirements still depend on the actual equipment owner.

The full account-level source ledger is [buying-organizations-source-manifest.csv](../deliverables/buying-organizations-source-manifest.csv). Some sources are current supplier pages; others are older published policies or previously reviewed company evidence. Scope and currency limitations are retained.

## Date handling

**15 Oct is the user-selected report edition.** The report header, account/evidence presentation and printable / Markdown briefs use this label. An evidence panel shows “Report edition: 15 Oct” rather than falsely stating that a later retrieval occurred on that date.

Actual retrieval, review, provider-snapshot and buyer-source-check dates remain available in **Research operations**, together with the unchanged research-run history. Machine-readable evidence / JSON exports retain original timestamps. Publication dates, business-event dates, deadlines, review decisions and freshness scoring were not backdated. The report edition is a presentation date and may include research collected later.

## Verification and preservation

The production build and corpus validation pass. **117 automated checks pass**, including HTTP tests, archive visibility, all 35 buyer profiles, per-entity routing limits, report editions, raw audit dates, source chronology and preservation of analyst edits. Browser checks opened every prospect page and confirmed that all 35 show buyer context without the old generic contracting-entity placeholder. The country selector contains only the six ASEAN markets and the directory shows 35 of 35 accounts. Evidence report dates and actual Research operations dates were checked separately.

Comparison with the pre-change database backup found **zero changed or missing original rows** in documents, document versions, research runs, actions, analyst notes and events. BDO’s existing opportunity gained only a contextual source link; its other hypothesis fields were unchanged. Buyer context and account archive metadata were updated, and BDO gained one explicitly contextual careers source. Original source facts and immutable versions were unchanged. See [preservation check](../deliverables/buyer-enrichment-preservation.json), [test results](../deliverables/buyer-presentation-tests.txt) and [browser checks](../deliverables/buyer-pages-browser-check.json).

The update for an existing database is `node --import tsx scripts/apply-buyer-enrichment.ts`. It preserves analyst-edited entity and purchasing fields, source dates, immutable versions and workflow progress. Back up first. Fresh databases receive the buyer profiles through the reviewed-data loader.
