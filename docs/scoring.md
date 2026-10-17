# Qualification and provisional scoring

The ranking answers which account-specific hypothesis deserves qualification next. It is not a purchase probability, win probability, revenue estimate or empirically calibrated model. No price, margin, discount or installed fleet is inferred.

The initial policy is provisional-v1. Source code, default weights, ordinal descriptions and freshness thresholds are in `server/intelligence.ts`; policy and score history are stored in scoring_policies and score_snapshots. The interface and exports show the version, individual inputs, points, gates, missing information and confidence explanation.

## Gates and readiness precede numerical rank

Territory requires a verified, explicit country list. The configured basis can be operating location, headquarters or purchasing location. Under operating-location rules, each opportunity needs an evidenced relevant facility binding. A global initiative cannot become a local opportunity merely because the parent has a site there. Account-level coverage and opportunity-specific eligibility are assessed separately. Confirmed territory fit still does not prove HP ownership, supply authorization or contracting authority.

The implementation evaluates five gates:

| Gate | Pass basis | Meaning of a missing input |
| --- | --- | --- |
| HP Inc. product fit | Fit ordinal at least 2, a plausible relevant workload | Blocked if no plausible product fit |
| Territory | Confirmed under the selected rule | Watchlist when unresolved; excluded when outside the rule |
| Procurement | Explicit open buying evidence, reverified less than seven days ago, with no expired/closed status or unresolved contradiction/change | A business event remains a hypothesis |
| Route to supply | Analyst has assessed the route | Proposed direct/channel/partner route remains unverified |
| Evidence review | At least one reviewed supporting document and no unresolved source change or contradiction | Review before pursuit |

Readiness labels are evaluated independently from the weighted total:

- **Active procurement:** current explicit open buying evidence, reviewed support, confirmed territory, plausible fit and an assessed route. This label alone does not claim bid eligibility or a likely win.
- **Triggered qualification:** an evidenced event with actionable timing, or current procurement that still lacks an assessed route.
- **Strategic fit:** plausible supported fit without a current actionable trigger.
- **Watchlist:** unresolved territory, missing supporting review, stale material, closed procurement, unresolved contradiction/change, or an explicit nurture decision.
- **Blocked or excluded:** territory exclusion, unsupported product fit, or an explicit stopped decision.

The separate researchReadiness field records evidence-based buying maturity before some pursuit gates. For example, explicit open procurement can be visible in the research assessment while territory keeps the actionable record on watchlist. A closed or awarded buying package stays off the active list even when its scale is well documented; separate expansion scope needs its own hypothesis.

Ranks sort by readiness tier first, descending score second, and stable opportunity ID for ties. A watchlist record scoring 90 does not outrank triggered qualification scoring 40. Analyst changes persist and create new score snapshots.

## Weights and ordinal rubric

Each dimension has an ordinal value from 0 to 4, or null for unknown. Its points are value ÷ 4 × weight. Component points are rounded to two decimals and summed. Null earns zero; the other weights are never renormalized to fill missing information. A known zero and an unknown null remain distinguishable.

| Dimension | Weight | 0 | 1 | 2 | 3 | 4 |
| --- | ---: | --- | --- | --- | --- | --- |
| Evidence strength | 25 | Unknown / rejected | Indirect or unsupported inference | Single relevant primary source | Reviewed primary plus complementary context | Independent, direct, reviewed purchasing evidence |
| HP product fit | 20 | Unknown / outside HP Inc. | Broad sector fit | Plausible workload | Explicit relevant workflow | Verified requirement and prerequisites |
| Timing and milestones | 20 | Unknown / expired | Historical or future beyond horizon | Current strategic change; sourcing unknown | Dated milestone within 90 days | Open purchasing deadline with amendments checked |
| Supported scale | 15 | Unknown | One disclosed workload/site | Several disclosed functions/rooms | Multiple disclosed sites/capacity | Explicit relevant equipment quantities |
| Buyer/procurement access | 10 | Unknown | Relevant role inferred | Published supplier process | Verified purchasing organization | Authority and accessible procurement confirmed |
| Commercial feasibility | 10 | Unknown / excluded | Route hypothesized | Service prerequisites identified | Supply eligibility assessed | Availability, eligibility and contract route verified |

The weights are design assumptions. They reflect the assignment's emphasis on evidence and product fit; they have not been learned from sales outcomes.

A hypothetical record with evidence 4 and fit 4, with all other dimensions unknown, scores 25 + 20 = 45. It does not become 100. Disclosure of employee count does not establish equipment quantity. Disclosed sites or workloads can justify a lower scale ordinal even when equipment quantities and monetary value remain unknown.

Dimensions are analyst-entered reviewed judgments, not automatic natural-language extraction. They should cite the supporting documents and be revised when qualification changes the facts. The app enforces input ranges and several explicit overrides; it does not prove every entered ordinal is justified by its citations.

## Overrides and review triggers

- With no reviewed linked support, evidence is forced to zero.
- Missing scale or a description explicitly stating wholly unknown/unquantified scope receives no scale points. The current check uses a conservative text heuristic; it is not a structured quantity-verification engine. Analysts must distinguish disclosed sites/workloads from unknown device counts.
- If all linked material is stale/unknown and there is no newly verified explicit open procurement, timing is capped at 1.
- An expired deadline, closed, canceled, awarded or superseded procurement caps timing at 1 and prevents active classification.
- A source needing review or an unresolved contradiction caps evidence at 2 and restricts pursuit readiness to watchlist.
- A procurement verification timestamp in the future cannot qualify as recent verification.
- Unknown territory prevents active pursuit ranking even when the evidence is otherwise strong.

The engine currently represents contradictions as explicit linked documents and source-review states. A changed source invalidates prior review and recomputes opportunity scores. It does not automatically understand whether a changed paragraph cancels a project, changes a quantity, or is immaterial; an analyst must resolve it.

## Recommendation confidence is separate

Confidence is a Low / Medium / High label describing the recommendation's evidence support. It is not a percentage.

- **Low:** default when corroboration is limited or critical evidence is unresolved.
- **Medium:** at least two supporting independence groups, an evidence ordinal of at least 2, and no pending review change or contradiction.
- **High:** current explicit procurement, at least two supporting independence groups, assessed route, and no unresolved change or contradiction.

Independence uses active same-announcement relationship groups, then independenceGroup where supplied, otherwise the publisher origin. Shared corporate sources, syndicated stories and the same underlying announcement should use the same group. Repeated articles do not create independent evidence by count alone. This is a conservative analyst grouping policy, not automated investigation of every publisher's reporting chain.

Confidence and territory are deliberately different questions: evidence can support a fact strongly while a territory or procurement-eligibility question remains unresolved. Current confidence logic is provisional and simpler than a validated evidence-quality model; do not present it as measured accuracy.

## Freshness

Freshness prefers the actual event date, then publication date. Retrieval time never replaces either. Undated material remains unknown and future dates are exposed as future rather than silently treated as recent.

| Source category | Review-age threshold |
| --- | ---: |
| Procurement | 7 days |
| Careers | 30 days |
| Company newsroom | 180 days |
| Investment/facility material | 365 days |
| Regulatory filing | 400 days |
| Supplier case study | 365 days |
| Other source families | 180 days |

A document becomes stale when age in whole days exceeds its threshold. Explicit buying verification uses a separate strict seven-day timestamp check. A fresh source can still concern a historical event, and a reliable historical report can still be unsuitable evidence for a current purchase.

Display family labels from the reviewed dataset are mapped to policy keys. Live unclassified sources use the default threshold until classified. The runtime cache is separate: a recent cached fetch does not reset event age or certify procurement status.

## Sensitivity and policy versions

The sensitivity view recomputes the same opportunities under four alternative weight settings:

| Scenario | Change |
| --- | --- |
| Evidence emphasis | Evidence +5; timing −5 |
| Scale emphasis | Scale +5; fit −5 |
| Access emphasis | Access +5; evidence −5 |
| Timing stress case | Timing +10; scale −10 |

Each keeps the total weight at 100 and preserves eligibility/readiness gates. The output reports the leading opportunities and whether the first place changes. It is a small local robustness check, not a claim that the chosen weights are optimal.

Changing weights through the API requires six bounded integer values summing to 100. It appends a new provisional policy/version and score snapshots. Previously stored snapshots are retained for audit. Current opportunity views use the latest policy; they do not overwrite the historical snapshot record.

## Qualification and commercial interpretation

The 0–90-day plan verifies sourcing status and purchasing entity first, then workloads, buyer roles, route and milestones, followed by an appropriate assessment or next procurement step. It does not promise an enterprise close within 90 days. A technical role is not confirmed budget authority, and a supplier relationship is not exclusivity.

Monetary value remains unquantified unless an explicitly sourced scenario is supplied. The implemented scoring uses supported nonmonetary scope and does not calculate a revenue pipeline. Scenario modeling with prices and currencies is not implemented. Overlapping opportunities, shared facilities and existing committed contracts must be considered separately rather than summed.

The reviewed demonstration sample has no verified active HP Inc. procurement established as open and eligible. Real business events, existing supplier relationships, awarded scope, stale notices and unresolved requirements are retained because they improve the qualification decision. Software tests verify these rule behaviors; they do not establish a prediction-accuracy or sales-conversion rate.


## Audit corrections (17 October 2026)

Operating-site eligibility now executes any-site, all-sites and primary-site modes. Exact locality names, country-prefixed localities and stable subregion codes are checked; missing required locality evidence remains unresolved. A country-specific locality exclusion does not block an unrelated country. Exclusions apply to the chosen location basis. Explicit unreviewed facility or account-location assertions cannot qualify a pursuit.

A nurture preference cannot override a product, territory, supply-route or stopped exclusion. Explicit out-of-scope records force fit to zero. Superseded source documents receive no supporting credit. Changed, rejected, superseded or conflicting event support triggers review of dependent opportunities without counting event-only sources as extra opportunity corroboration. Context-only source changes do not demote a separate reviewed buying fact or refresh its event. A hypothetical event does not establish an actionable factual trigger.

Sourced procurement updates store status, notice identifier, deadline, verification time, supporting source IDs, amendment and replacement evidence, with retained history. Open notices require reviewed purchasing sources and a future deadline; deadline changes need a sourced amendment. Future verification timestamps, invalid deadlines and unsupported controlling notices cannot establish active procurement. The seven-day freshness check still applies after saving. Verification is an analyst assertion with a source basis, not an automated finding that all bid terms were reviewed.

Source relationships can be revoked with an auditable reason. Recalculation follows every relationship/review change. Original sources, before/after review history, event merge history, policy versions and score snapshots remain available.

Potential account relevance can be shown when reviewed headquarters lies inside the country boundary but operating-site evidence is absent. It never establishes a confirmed deployment site or localizes a global opportunity; those pursuit gates remain unresolved.
