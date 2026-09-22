# Performance audit follow-up

This note tracks the safe code changes from the 2026-09-22 static audit and distinguishes them from hypotheses that need representative profiles. No production traffic, representative tenant scale, or production query plans were available during the work. Code-shape improvements are not latency claims.

## Changes in this pass

- Work Inbox replaces its 15-second multi-endpoint refresh burst with topic invalidations, focus refresh, a 60-second healthy-connection freshness check, a 15-second disconnected fallback, and a first-page cap for upcoming appointments. Additional scheduled visits remain in Schedule.
- Billing's landing query no longer builds income outlook. The chart is requested only when opened through a separate permission-checked endpoint. Status counts are grouped and payment totals are reduced to one aggregate per currency metric.
- Price-sheet parsing streams rows, stores only the requested preview page and bounded row errors, caps accepted rows, and writes in batches inside the existing transaction boundary. Paging a preview still resubmits/reparses the uploaded CSV; a durable upload/job design should be justified by measured payload, CPU, memory, or latency.
- Owner command-center organizations, unassigned clinics, and demo visitors are paginated at 25 per page; global counts are separate; requested pages are clamped. Organization options remain a compact ID/name list for the create-clinic selector. Clinics nested under one organization and each visitor's run history are still unbounded and must be profiled before declaring the owner payload fully bounded.
- Fingerprinted `/assets/` files receive immutable one-year caching; HTML and other paths retain `no-store`.
- Website traffic path totals now use one grouped aggregate instead of repeating a grouped query for each path. Daily and referrer summaries remain separate aggregate queries; consider short caching only if owner-page profiles justify staleness.

## Deliberately measurement-gated

- Inventory catalog stock, purchase-order, cart, supplier, lot, and location derivation can repeat expensive scans and filtered counts. Existing pages expose numbered navigation and multiple sort orders. Do not add speculative indexes. Capture plans and first/typical/deep-page timings first; then choose keyset navigation or a simpler bounded-page policy without breaking sort/search semantics. Search terms use leading-wildcard matching, so a normal B-tree is not a justified fix.
- Billing invoice filter/sort correlated sums remain. Capture query count and `EXPLAIN (ANALYZE, BUFFERS)` on synthetic, scale-shaped fixtures before replacing them with grouped SQL or indexes.
- The import request still carries CSV content to the API and preview pages reparse it. A background upload store is a larger persistence/workflow change; require measured browser/API payload, peak worker RSS, GC time, CPU, concurrency, and user wait before adopting it.
- No general request/SQL tracing sink was added. Collect aggregate request duration, SQL count/duration by normalized operation, response bytes, job duration/RSS/GC, and browser transfer/interaction metrics using the approved local/staging telemetry path. Do not log SQL bind values, request bodies, or protected data.

## Verification measurements before tuning

1. Work Inbox request count and bytes per active user; refresh/notification latency and endpoint p50/p95/p99 at realistic role mixes.
2. Billing dashboard and deferred outlook SQL count, per-query duration, allocations, payload bytes, and p95 at multiple invoice/currency/credit/allocation counts.
3. Import peak worker RSS, allocation/GC time, elapsed parse/write duration, database lock time, concurrency, request bytes, and rollback correctness at 50,000 rows / 50 MB plus malformed and selected-subset cases.
4. Owner command-center payload bytes, allocated objects, query count, and p95 at realistic organization, clinic-per-organization, membership, visitor, and run-history counts.
5. Inventory catalog plans/buffer reads for unfiltered, filtered, text search, supplier/lot/location search, and first/typical/deep pages across all supported sorts.
6. Browser cache headers and repeat-visit transferred bytes for HTML, fingerprinted assets, and non-fingerprinted paths.
7. Website traffic query count and owner-page p95 at scale; set a short TTL only with an explicit acceptable analytics staleness window.

Use synthetic data only. Preserve existing statement/lock timeouts and authorization guards. A successful test or local profile is not evidence of production capacity, clinical readiness, or deployment acceptance.
