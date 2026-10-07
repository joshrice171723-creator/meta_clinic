# Clinic map extraction and 2D view

The authenticated `/clinic/map` page is a second view of the existing clinic records. It sits beside the Tracking Board in Care navigation and uses the current clinic appearance, location selection, session transport and encounter navigation.

## Ownership

- [`clinicMapApi.ts`](../../apps/web/src/features/clinic/clinicMapApi.ts) reads the selected site's room catalog and tracking board through the existing same-origin client. It reads up to ten 100-room pages, labels a capped result partial, and rechecks actor, membership, practice, location, policy, authorization generation and capabilities before accepting the snapshot.
- [`clinicMapExtraction.ts`](../../apps/web/src/features/clinic/clinicMapExtraction.ts) produces a presentation model without transport, layout coordinates or persistence. It admits only open, started encounters at the selected site, deduplicates encounter IDs, and groups recorded room assignments. Scheduled appointments and completed encounters are excluded.
- [`ClinicMapPage.tsx`](../../apps/web/src/features/clinic/ClinicMapPage.tsx) renders a top-down schematic using the existing Material UI theme and controls. Room search and stage visibility are transient presentation choices retained across refreshes. Room order and decorative furniture do not represent physical coordinates or a facility inventory. Telehealth resources sit outside the physical floor.

The waiting area requires an explicit nurse workflow stage of `waiting`, no recorded room and no assigned provider. Other unplaced visits remain separate. The board's broad `waiting_room` operational label is not enough to establish arrival. No occupancy, readiness, staff availability, clinical priority or real floor dimensions are inferred. Multiple recorded visits remain visible for a room; they are not interpreted as a capacity calculation.

Refresh, context changes, session/location invalidation, denied reads and errors clear the snapshot. The existing realtime tracking-board topic invalidates reads and periodically refreshes while visible. Accepted snapshots expire after 60 seconds. No record content is stored in browser persistence, and API failures never produce synthetic fallback records. This page adds no business mutation or backend permission. Encounter links use existing capability hints and remain subject to the destination's server authorization.

## Reference applicability

Reviewed [US Core Encounter Profile 8.0.1](https://hl7.org/fhir/us/core/STU8.0.1/StructureDefinition-us-core-encounter.html), the published U.S. FHIR R4 profile, for the separation of encounter status, timing, providers and recorded location. This is a reference for preserving those distinct facts; the extraction model is not a FHIR implementation or conformance claim. No relevant U.S. guide supplies physical floor coordinates, furniture, occupancy or this application's operational waiting-stage semantics. Those remain unknown or explicitly schematic. Existing Rails projections remain authoritative.

Material UI controls follow the installed v9 library and [official Button documentation](https://mui.com/material-ui/react-button/). The page uses Button, ButtonBase, Switch, TextField, Chip, Paper, Stack and Alert; no additional dependency or copied interaction framework is introduced.
