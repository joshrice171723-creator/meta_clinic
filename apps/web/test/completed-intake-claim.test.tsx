import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClinicTrackingBoardVisit } from "../src/api/contracts";
import {
  trackingBoardOperationMetadata,
  trackingBoardVisitToBoardVisit,
} from "../src/features/clinic/trackingBoardApi";
import { TrackingBoardView } from "../src/features/clinic/TrackingBoardPage";

function visit(
  status: "open" | "completed",
  lease = true,
): ClinicTrackingBoardVisit {
  return {
    id: 991,
    row_type: "encounter",
    operational_state: "unrecorded",
    patient_id: 992,
    encounter_id: 991,
    chart_status: "unopened",
    provider_assignment_available: false,
    patient: {
      id: 992,
      display_name: "Synthetic intake ownership",
      reference: "SYN-992",
    },
    encounter: {
      id: 991,
      status,
      started_at: "2030-02-04T10:00:00Z",
      ended_at: status === "completed" ? "2030-02-04T10:30:00Z" : null,
      site_id: "15",
      site_code: "SYN",
      room_id: null,
      room_code: null,
    },
    appointment: null,
    care_summary: null,
    intake_claim_available: true,
    intake_ownership: lease
      ? {
          participant_id: "993",
          token: "synthetic-revision-4",
          owner: { membership_id: "7", display_name: "Synthetic nurse" },
          lease_expires_at: "2030-02-04T10:10:00Z",
          state: "stale",
          claim_available: true,
          release_available: true,
        }
      : null,
  };
}
describe("141 completed intake claim", () => {
  it.each([true, false])(
    "suppresses completed claims with stale lease=%s without changing open eligibility",
    (lease) => {
      const closed = trackingBoardOperationMetadata(visit("completed", lease));
      expect(closed.canClaimIntake).toBe(false);
      if (lease) {
        expect(closed.intakeOwnership?.canClaim).toBe(false);
        expect(closed.intakeOwnership).toMatchObject({
          token: "synthetic-revision-4",
          state: "stale",
          canRelease: true,
        });
      }
      expect(
        trackingBoardOperationMetadata(visit("open", lease)).canClaimIntake,
      ).toBe(true);
    },
  );
  it("never promotes a server-denied open claim", () => {
    const source = visit("open");
    source.intake_ownership!.claim_available = false;
    expect(trackingBoardOperationMetadata(source).canClaimIntake).toBe(false);
  });
  it.each(["open", "completed"] as const)(
    "renders claim only for open ownership (%s)",
    (status) => {
      const source = visit(status),
        claim = vi.fn();
      const html = renderToStaticMarkup(
        <TrackingBoardView
          visits={[
            {
              ...trackingBoardVisitToBoardVisit(source),
              operations: trackingBoardOperationMetadata(source),
            },
          ]}
          now="2030-02-04T10:35:00Z"
          timezone="UTC"
          onClaimIntake={claim}
        />,
      );
      if (status === "open") expect(html).toContain("Claim intake");
      else expect(html).not.toContain("Claim intake");
      expect(html).toContain("Synthetic nurse");
      expect(claim).not.toHaveBeenCalled();
    },
  );
});
