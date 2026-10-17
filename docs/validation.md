> Follow-up: the 17 October 2026 deep feature audit supersedes the software test counts below. See [deep-audit.md](deep-audit.md) for106 passing tests, browser checks, fixes and current limits. Earlier run/source evidence is retained as history.

**Historical 16 October baseline.** The current 17 October expansion contains 35 territory-matched prospects across ASEAN-6; scope, counts and latest checks are in [ASEAN expansion](asean-expansion.md). The earlier figures and unresolved-boundary statements below describe the original audit only.

# Measured validation

Validation date: **16 October 2026**, India client time. Runtime: macOS, Node **24.19.0**, npm **11.17.0**. These results describe the delivered local demonstration, not sales prediction accuracy or a production security certification.

## Software checks

The final recorded run of `RUN_HTTP_TESTS=1 npm test` completed with **36 tests passed, 0 failed, 0 skipped**. The runner, durations and individual cases are retained in [software-test-results.txt](../deliverables/software-test-results.txt). The production TypeScript check and Vite build passed; see [build-results.txt](../deliverables/build-results.txt). The tests use fictional, explicitly separated fixtures and never depend on external availability.

Coverage includes territory configuration and country exclusions; account versus facility attribution; unbound global initiatives; ambiguous subsidiaries/domains; exact duplicate event clusters; independent origin groups; missing inputs without renormalization; deterministic scores; event age versus retrieval date; current, expired, awarded and superseded procurement; material contradictions; changed-source review; CSV formula safety; source text escaping; IPv4/IPv6/mapped/NAT64 safety; mixed DNS; XML entity/DTD rejection; bounded text parsing; malformed JSON; partial failures; cancellation; restart recovery; database persistence across connections; API validation, origin checks, pagination, evidence review/linking, assessment vetoes, graph records and exports.

The HTTP integration case starts a loopback server against an in-memory database. It exercises rejected unsafe URLs and invalid weights, territory recomputation, saved analyst notes, persisted job states, cancellation, new-extract claim/family review requirements, same-account evidence links and CSV/Markdown exports. The remaining tests use local functions, child processes or temporary databases. `npm test` skips only this explicitly opt-in listener case when `RUN_HTTP_TESTS` is absent.

## Research integrity and recommendation review

The fresh reviewed seed passed `npm run validate:data`. [Machine-readable results](../deliverables/data-validation.json) and [recorded output](../deliverables/data-validation-output.txt) contain:

| Measure | Result |
| --- | ---: |
| Screened organizations / detailed accounts | 24 / 7 |
| Opportunity records, including explicit scope exclusion | 9 |
| Current referenced event clusters | 8 |
| Logical source extracts / unique canonical URLs | 20 / 19 |
| Account-source families | 9 |
| Publisher labels / conservative independent-origin groups | 15 / 8 |
| Official HP product families / source records | 9 / 14 |
| Supporting and contradicting evidence relationships | 26 |
| Qualification action records / unresolved buyer-role records | 36 / 30 |
| Foreign-key violations | 0 |
| Open, territory- and supply-qualified HP pursuits | 0 |

All curated opportunity evidence links resolve to a document belonging to the correct account. Required reasoning, unknowns, confirmation/weakening/disproof conditions, action questions and stop conditions are populated. Retained source quotations pass the per-canonical-source quotation bound. No named individuals, guessed contacts, prices, fleet estimates or win probabilities were introduced. Integrity checks verify the structure, not the independent truth of each source.

Project analysts reviewed all **20 curated extracts and 9 opportunity records** against the stated source support and limitations. These are single-project analyst reviews, not a blinded external evaluation. Two documents rely on partial search-index passages, and procurement listings do not include the full specification packs. The source manifest identifies those limits. The review found and retained timing caveats, an internal press-count discrepancy, existing committed scope, an incumbent relationship, stale completed openings and an HP Inc. product-scope exclusion.

The THK public listing is explicit purchasing evidence. It was verified as open at the recorded review time, with a **23 October 2026, 12:00 Singapore** deadline. Full specifications, amendments, mandatory events and HP supply eligibility remain unverified. Timing receives ordinal **3**, rather than 4, because the full amendment/specification checks have not been completed. Territory remains unverified. The tender issuer is publicly named; individual authority and the final contracting/signatory details remain unresolved.

Four common accounts were manually compared under a news-only and combined-source review; the case table and exact changes are in [research-selection.md](research-selection.md#news-only-versus-combined-source-review). Added supplier rules, filings, awards, procurement notices and supplier relationship evidence improve qualification questions and reveal barriers. This is a selected qualitative comparison; no accuracy percentage, conversion lift or revenue impact is claimed.

## Actual live research outcomes

[runtime-research-runs.json](../deliverables/runtime-research-runs.json) preserves **six real application runs**: **four completed and two failed**. Across them: **four URL retrievals succeeded, two requests were served from cache, three URL attempts failed**, and **5,382,589 bytes** were retrieved. No paid provider call was made. Monetary network/hosting cost was not measured.

- The first HTML and PDF runs failed because DNS also returned standardized NAT64 addresses, which the initial classifier conservatively rejected. Those failures remain in history.
- After validating the embedded public destination, the HTML run retrieved the SESAMi listing and THK organization page. The PDF run retrieved the **4,350,826-byte** Sunway investor briefing. Retained passages matched; source/event chronology was preserved. Private embedded addresses and local translation prefixes remain blocked in regression tests.
- A run initiated through the browser used the cache honestly, reporting zero retrieved and two skipped/cached URLs.
- A fresh THK homepage run retrieved **503,428 bytes**, persisted one new document and one **unreviewed candidate extract**, and produced **zero business events or opportunity hypotheses**. The retained text contained navigation/form labels and did not establish a commercial fact. It was rejected through the evidence-review UI, with a reason. The document and run remain stored; it contributes no reviewed source-family or confidence credit.

Thus the current runtime has the **20 reviewed demonstration documents plus one rejected live extraction**. The reproducible seed deliberately excludes runtime jobs, rejected extraction and browser validation notes. New installations begin with the reviewed corpus and an empty research history. Working live HTML/PDF retrieval, generic tested JSON/feed parsers, preparation tools and manually researched source families are separate measurements.

## Browser verification

The built application was verified in the browser at **1440 × 1000** and **390 × 844**, then the temporary viewport override was reset. Captures are in [screenshots](../deliverables/screenshots/opportunity-desktop.png).

| Workflow | Observed result |
| --- | --- |
| Opportunity search and empty state | No-match query showed zero results; clearing restored records |
| Readiness filter | Blocked/excluded filter isolated the CAG infrastructure scope exclusion |
| Account directory / compare | Two selected accounts displayed in a real comparison |
| Account graph | Navigable current account, event, document, opportunity and action records |
| Opportunity / buyers / evidence | Reasoning chain, unresolved buyer roles, source passage, original URL, dates and constraints visible |
| Qualification | Clearly labeled demonstration note and analyst status saved; note survived browser reload |
| Action progress | First THK action saved as in progress; no bid or buyer contact implied |
| Export | Browser downloaded `thk-brief.md` with real sources and limitations |
| Research UI | Queued a real job; worker history exposed completed, cached and failed outcomes |
| Source review | Weak new extraction rejected; library refreshed and no longer showed it as awaiting review |
| Territory validation | Verified-with-no-countries was blocked by a visible error; real configuration stayed unverified |
| Scoring / methodology | Versioned weights, rubrics, gates, sensitivity and source/baseline views loaded |
| Keyboard | Enter opened source evidence; Escape dismissed the focus-managed dialog |
| Smaller screen | Mobile menu and detail usable; measured document width390 with viewport390, no horizontal page overflow |
| Browser console | No warning/error entries in the final inspected tab log |

This was a targeted manual browser pass, not automated cross-browser testing, a screen-reader audit or formal WCAG certification. Print HTML generation and escaping are covered by software checks; physical printing and a server PDF conversion were not tested. Loading/empty/validation/source-failure states are implemented, but not every possible outage was induced in the browser.

## Sensitivity and remaining limitations

With final inputs, Micron leads under the base weights and all three five-point variants. In the **timing +10 / scale −10** stress case, THK becomes the leader. The score is therefore sensitive to the balance between observable scale and immediate timing, even though territory gates are unchanged. The actual computation is retained in the validation JSON and visible in the app. Weights are provisional assumptions, not fitted coefficients.

Country boundaries, HP ownership, channel authorization, current regional availability, full procurement specifications, buyer authority and most equipment quantities remain unresolved. Discovery and exact matching are bounded; no semantic entity-resolution model, full-web search, native browser rendering, OCR, specific live ATS integration, autonomous opportunity generation, integrated external AI provider, monetary scenario calculator or complete market census is delivered. Source availability can change. No hosted deployment, multi-user load test, penetration test, independently measured recommendation accuracy or real sales outcome is claimed.
