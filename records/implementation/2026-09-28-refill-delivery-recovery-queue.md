# Refill response delivery recovery queue — 2026-09-28

## Scope and source evidence

`GET /api/clinic/refill_requests` previously returned only the oldest 100 requests. A newer saved terminal decision with failed portal delivery could therefore disappear from the staff refill queue even though the request-specific retry route existed. The server now provides bounded pages, an exact total, and an optional `delivery=failed` filter. The existing default of 100 remains for the Work Inbox consumer; the Refill requests screen asks for 25 per page and exposes page navigation and a Portal delivery follow-up filter. Practice scope and existing read/write permissions remain server-owned. Retry still uses its existing request key and delivery service.

This is an MC-10/12 Build source slice, not evidence that an actual patient received a message. MC-10 Build moves 65→66% and MC-12 62→65% (+4 row points), taking the equal-weight MC-01–15 Build estimate from 72.8% to 73.1%. Validation and External / human remain unchanged.

## Verification and limits

Ruby syntax, scoped RuboCop, TypeScript, diff hygiene, and a read-only isolated PostgreSQL query using the failed-delivery association passed. No tests or connected browser delivery/reload/role-denial walkthrough ran. The Work Inbox still has its prior oldest-100 summary window; staff can use the dedicated Refill requests screen to find older failed deliveries. An unavailable active portal identity remains a failed, retryable outcome. This does not provide an alternate patient contact channel or prove message receipt.
