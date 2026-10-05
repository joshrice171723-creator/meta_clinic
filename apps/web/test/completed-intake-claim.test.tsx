import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";
import type { ClinicTrackingBoardVisit } from "../src/api/contracts";
import { trackingBoardOperationMetadata } from "../src/features/clinic/trackingBoardApi";

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
let server: ViteDevServer, browser: Browser, base: string;
beforeAll(async () => {
  const virtual = "\0intake-claim-fixture.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "intake-claim-fixture",
        resolveId: (id) => (id === virtual ? virtual : undefined),
        load: (id) =>
          id === virtual
            ? `
        import React from "react";
        import {createRoot} from "react-dom/client";
        import {TrackingBoardView} from "/src/features/clinic/TrackingBoardPage";
        import {trackingBoardVisitToBoardVisit,trackingBoardOperationMetadata} from "/src/features/clinic/trackingBoardApi";
        const source=JSON.parse(new URL(location.href).searchParams.get("visit"));
        window.claimCalls=0;
        createRoot(document.getElementById("root")).render(React.createElement(TrackingBoardView,{
          visits:[{...trackingBoardVisitToBoardVisit(source),operations:trackingBoardOperationMetadata(source)}],
          now:"2030-02-04T10:35:00Z",timezone:"UTC",onClaimIntake:()=>window.claimCalls++
        }));`
            : undefined,
        configureServer(s) {
          s.middlewares.use("/claim-fixture", async (_req, res) => {
            res.setHeader("Content-Type", "text/html");
            res.end(
              await s.transformIndexHtml(
                "/claim-fixture",
                '<div id="root"></div><script type="module" src="/@id/__x00__intake-claim-fixture.tsx"></script>',
              ),
            );
          });
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
  });
}, 20000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

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
    async (status) => {
      const page = await browser.newPage();
      try {
        await page.goto(
          `${base}/claim-fixture?visit=${encodeURIComponent(JSON.stringify(visit(status)))}`,
        );
        await page
          .getByRole("button", { name: /Patient and visit details/ })
          .click();
        const details = page.getByRole("dialog");
        await details.waitFor();
        expect(
          await details
            .getByRole("button", { name: "Claim intake", exact: true })
            .count(),
        ).toBe(status === "open" ? 1 : 0);
        expect(await details.innerText()).toContain("Synthetic nurse");
        expect(
          await page.evaluate(
            () => (window as unknown as { claimCalls: number }).claimCalls,
          ),
        ).toBe(0);
      } finally {
        await page.close();
      }
    },
  );
});
