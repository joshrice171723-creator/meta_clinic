# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

APPly contains two independent products that share a repository and account infrastructure but do not share a product identity.

- **Guidance portal:** new healthcare providers progressing from graduation through planning, opening and beginning to operate a clinic. They use a mentoring service, knowledge base and training experience on phones, tablets and computers.
- **Clinic software:** staff and providers working inside member clinics. Staff are expected to use desktop and tablet devices; computers are required and tablets are a supported operating context. Mobile-phone use is unlikely and is not a primary clinic-design target. Exact clinical roles, permissions and workflows remain subject to workflow and professional review.

## Product Purpose

The guidance portal helps new providers understand and complete the work required to start a clinic, with mentoring, structured knowledge and training.

The clinic software is a separate operational package offered to members. Its first design-defining surface is the patient tracking board: a shared view of expected, waiting and in-progress work that helps authorized staff and providers understand the current recorded state and choose the next appropriate action.

Success for one product does not imply success, access or authority in the other.

## Positioning

The guidance portal combines a staged clinic-start journey with mentoring and reusable operational knowledge for new providers.

The clinic software centers its operational experience on an explicit, evidence-bounded tracking board rather than a generic dashboard. It must distinguish recorded facts, unknown or unavailable information, synthetic demonstrations and operational timing without implying clinical priority or authority.

## Operating Context

- Guidance content is read and revisited across phones, tablets and computers, often outside a clinic workstation.
- Clinic software is used during operational work on desktop and tablet screens, including interruption-heavy shared-workspace contexts.
- The current tracking board contains wholly synthetic examples and a bounded development projection. It is design and implementation evidence, not an approved clinical workflow or patient-record release.
- The portal and clinic software may share technical infrastructure, but their navigation, information architecture, visual language and product promises are evaluated independently.

## Capabilities and Constraints

- Preserve the existing React/Vite frontend and Rails JSON/API ownership boundaries.
- Use independently created synthetic data only. No real patient or confidential applicant information belongs in design artifacts, prompts, screenshots, fixtures or tests.
- Clinic design must prioritize desktop and tablet. Mobile-phone clinic layouts may remain safe and operable where practical, but do not drive density, navigation or table decisions.
- Guidance-portal design remains responsive through mobile widths.
- Visible navigation never establishes authorization; backend capabilities remain authoritative.
- Missing, stale, partial and unknown clinical-operational information must remain visibly distinct from reassuring or completed states.
- Schedule timing, queue order, membership and presentation color do not establish clinical priority.
- Current palettes, typography, chrome and component styling are implementation evidence, not permanent design commitments.
- Exact clinic roles, field sets, escalation rules, handoffs, signing, prescribing and real-data release remain open or separately gated.

## Brand Commitments

- The portal and clinic are unrelated products and must not be forced into one visual identity.
- The clinic software should feel clean, crisp and professional, with high readability and no distracting frills.
- The guidance portal may retain a warmer mentoring and editorial character appropriate to teaching and reassurance.
- APPly remains a working name; no permanent public brand or trademark conclusion is implied.

## Evidence on Hand

- Current product direction and boundaries are recorded in `APPlyVault/`.
- The clinic tracking board, appearance tokens, navigation shell and synthetic tests in `apps/web/` are the primary implemented design evidence.
- The launch portal, knowledge/training foundation and responsive behavior exist in `apps/web/` but are outside the clinic design-system scope.
- There are no approved real-patient examples, released clinical workflows, completed professional reviews or production clinic acceptance artifacts to use as design proof.

## Product Principles

1. Treat the portal and clinic software as separate products with separate measures of clarity and trust.
2. Make the clinic's recorded operational state legible before offering customization or decoration.
3. Preserve the distinction between fact, unknown, stale, partial, simulated and complete.
4. Design clinic workflows for sustained desktop and tablet use; design guidance content for responsive reading.
5. Prefer explicit language, recoverable actions and visible system state over cleverness or ornamental interaction.

## Accessibility & Inclusion

Target WCAG 2.2 AA for both products. The clinic system should support keyboard operation, visible focus, 200% text zoom, 400% browser zoom where required, tablet touch use, non-color state communication and readable type during sustained operational work. The portal should additionally reflow cleanly at mobile widths. Passing automated checks does not establish complete accessibility acceptance.
