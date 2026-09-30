import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";
import { ApiError } from "../src/api/client";
import {
  WaitlistReplySubmission,
  type WaitlistReplyAttempt,
  type WaitlistReplyAcknowledgement,
  type WaitlistReplyOffer,
} from "../src/features/patientPortal/waitlistReplySubmission";

const offer: WaitlistReplyOffer = {
  id: 11,
  version: 7,
  state: "offered",
  site_id: 2,
  clinician_id: 3,
  visit_type_id: 4,
  offer_starts_at: "2026-10-10T09:00:00.000000Z",
  offer_ends_at: "2026-10-10T09:30:00.000000Z",
  offer_expires_at: "2026-10-09T09:00:00.000000Z",
};
function acknowledged(
  attempt: WaitlistReplyAttempt,
): WaitlistReplyAcknowledgement {
  const accept = attempt.body.waitlist.action === "accept";
  return {
    ...attempt.offer,
    version: attempt.offer.version + 1,
    state: accept ? "booked" : "waiting",
    recorded_state: accept ? "booked" : "waiting",
    appointment_id: accept ? 81 : null,
    offer_starts_at: accept ? attempt.offer.offer_starts_at : null,
    offer_ends_at: accept ? attempt.offer.offer_ends_at : null,
    offer_expires_at: accept ? attempt.offer.offer_expires_at : null,
  };
}

describe("exact waitlist reply ownership", () => {
  it.each([
    new Error("Synthetic transport failure"),
    new ApiError(408, "Synthetic timeout"),
    new ApiError(503, "Synthetic response loss"),
    new ApiError(422, "Synthetic uncertain outcome", "outcome_unconfirmed"),
  ])(
    "retains original intent through uncertainty and subsequent rejection: %s",
    async (failure) => {
      const deliver = vi.fn(async (attempt: WaitlistReplyAttempt) =>
        acknowledged(attempt),
      );
      deliver
        .mockRejectedValueOnce(failure)
        .mockRejectedValueOnce(new ApiError(409, "Synthetic changed offer"));
      const submission = new WaitlistReplySubmission(deliver);
      const source = { ...offer };
      await expect(submission.submit(source, "accept", true)).rejects.toThrow();
      const original = submission.pendingReply;
      source.id = 99;
      source.version = 90;
      await expect(
        submission.submit(source, "decline", false),
      ).rejects.toThrow();
      expect(submission.outcomeUnconfirmed).toBe(true);
      expect(submission.pendingReply).toBe(original);
      expect(await submission.submit(source, "decline", false)).toMatchObject({
        id: 11,
        state: "booked",
      });
      expect(deliver.mock.calls.map(([attempt]) => attempt)).toEqual([
        original,
        original,
        original,
      ]);
      expect(original?.body.waitlist).toMatchObject({
        action: "accept",
        expected_version: 7,
      });
      expect(submission.pendingReply).toBeNull();
      expect(submission.outcomeUnconfirmed).toBe(false);
    },
  );

  it.each([400, 403, 409, 422])(
    "a rejection after uncertainty cannot discard the key: %i",
    async (status) => {
      const deliver = vi.fn(async (attempt: WaitlistReplyAttempt) =>
        acknowledged(attempt),
      );
      deliver
        .mockRejectedValueOnce(new Error("Synthetic lost decline"))
        .mockRejectedValueOnce(new ApiError(status, "Synthetic rejection"));
      const submission = new WaitlistReplySubmission(deliver);
      await expect(
        submission.submit(offer, "decline", false),
      ).rejects.toThrow();
      const original = submission.pendingReply;
      await expect(
        submission.submit(
          { ...offer, state: "waiting", version: 100 },
          "accept",
          true,
        ),
      ).rejects.toThrow();
      expect(submission.pendingReply).toBe(original);
      expect(submission.outcomeUnconfirmed).toBe(true);
      expect(await submission.submit(offer, "accept", true)).toMatchObject({
        state: "waiting",
      });
      expect(deliver.mock.calls[2][0]).toBe(original);
    },
  );

  it("an initial known rejection permits a new explicit intent without bypassing fresh eligibility", async () => {
    const deliver = vi.fn(async (attempt: WaitlistReplyAttempt) =>
      acknowledged(attempt),
    );
    deliver.mockRejectedValueOnce(
      new ApiError(422, "Synthetic unavailable offer"),
    );
    const submission = new WaitlistReplySubmission(deliver);
    await expect(submission.submit(offer, "accept", true)).rejects.toThrow();
    expect(submission.pendingReply).toBeNull();
    expect(submission.outcomeUnconfirmed).toBe(false);
    expect(await submission.submit(offer, "accept", false)).toBeNull();
    expect(deliver).toHaveBeenCalledTimes(1);
    await submission.submit(offer, "decline", false);
    expect(deliver.mock.calls[1][0].body.waitlist.request_key).not.toBe(
      deliver.mock.calls[0][0].body.waitlist.request_key,
    );
    expect(deliver.mock.calls[1][0].body.waitlist.action).toBe("decline");
  });

  it.each([
    { id: 99 },
    { site_id: 99 },
    { clinician_id: 99 },
    { visit_type_id: 99 },
    { version: 7 },
    { version: 9 },
    { state: "waiting" },
    { recorded_state: "waiting" },
    { appointment_id: null },
    { appointment_id: -1 },
    { offer_starts_at: "changed" },
  ])(
    "a mismatched acknowledgment retains the original attempt: %j",
    async (override) => {
      const deliver = vi.fn(async (attempt: WaitlistReplyAttempt) => ({
        ...acknowledged(attempt),
        ...override,
      }));
      const submission = new WaitlistReplySubmission(deliver);
      await expect(submission.submit(offer, "accept", true)).rejects.toThrow(
        "could not be confirmed",
      );
      expect(submission.pendingReply?.offer.id).toBe(11);
      expect(submission.outcomeUnconfirmed).toBe(true);
      expect(deliver).toHaveBeenCalledTimes(1);
    },
  );

  it("a waiting decline status with the wrong version is not an exact acknowledgment", async () => {
    const submission = new WaitlistReplySubmission(async (attempt) => ({
      ...acknowledged(attempt),
      version: 90,
    }));
    await expect(submission.submit(offer, "decline", false)).rejects.toThrow();
    expect(submission.outcomeUnconfirmed).toBe(true);
    expect(submission.pendingReply?.body.waitlist.action).toBe("decline");
  });

  it("serializes repeated clicks and discards late responses after owner disposal", async () => {
    let resolve!: (value: WaitlistReplyAcknowledgement) => void;
    const deliver = vi.fn(
      () =>
        new Promise<WaitlistReplyAcknowledgement>((done) => {
          resolve = done;
        }),
    );
    const submission = new WaitlistReplySubmission(deliver);
    const first = submission.submit(offer, "accept", true);
    const original = submission.pendingReply!;
    expect(Object.isFrozen(original.body.waitlist)).toBe(true);
    expect(await submission.submit(offer, "decline", true)).toBeNull();
    expect(deliver).toHaveBeenCalledTimes(1);
    submission.dispose();
    resolve(acknowledged(original));
    expect(await first).toBeNull();
    expect(submission.pendingReply).toBeNull();
    expect(await submission.submit(offer, "accept", true)).toBeNull();
    expect(deliver).toHaveBeenCalledTimes(1);
  });
});

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;
beforeAll(async () => {
  const virtualId = "\0waitlist-reply-browser-entry.tsx";
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "waitlist-reply-browser-entry",
        resolveId(id) {
          if (id === virtualId) return id;
        },
        load(id) {
          if (id === virtualId)
            return `import React from "react";
          import {createRoot} from "react-dom/client";
          import {PatientWaitlistOffers} from "/src/features/patientPortal/PatientWaitlistOffers";
          createRoot(document.getElementById("root")).render(React.createElement(React.StrictMode, null, React.createElement(PatientWaitlistOffers)));`;
        },
        configureServer(vite) {
          vite.middlewares.use(async (req, res, next) => {
            if (req.url !== "/waitlist-probe") return next();
            res.setHeader("Content-Type", "text/html");
            res.end(
              await vite.transformIndexHtml(
                "/waitlist-probe",
                '<div id="root"></div><script type="module" src="/@id/__x00__waitlist-reply-browser-entry.tsx"></script>',
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
    throw new Error("Missing synthetic probe port");
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
  });
}, 15000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

it.each(["accept", "decline"] as const)(
  "mounted %s preserves exact PATCH through uncertainty, rejection and matching acknowledgment",
  async (action) => {
    const page = await browser.newPage({
      viewport: { width: 834, height: 1100 },
    });
    page.setDefaultTimeout(6000);
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    const bodies: Array<WaitlistReplyAttempt["body"]> = [];
    const paths: string[] = [];
    let changed = false;
    const fixture = {
      ...offer,
      site_name: "Synthetic site",
      clinician_name: "Synthetic clinician",
      visit_type_name: "Synthetic visit",
      duration_minutes: 30,
      appointment_id: null,
    };
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (!path.startsWith("/api/")) return route.continue();
      if (path === "/api/csrf")
        return route.fulfill({ json: { csrf_token: "synthetic-only" } });
      if (request.method() === "GET")
        return route.fulfill({
          json: {
            entries: [
              {
                ...fixture,
                ...(changed && action === "decline"
                  ? { state: "waiting", version: 90 }
                  : {}),
              },
            ],
            can_accept: !changed,
            booking_requirement: "Synthetic membership requirement",
          },
        });
      paths.push(path);
      const body = request.postDataJSON() as WaitlistReplyAttempt["body"];
      bodies.push(body);
      changed = true;
      if (bodies.length === 1)
        return route.fulfill({
          status: action === "accept" ? 408 : 503,
          json: { error: "Synthetic lost response" },
        });
      if (bodies.length === 2)
        return route.fulfill({
          status: 409,
          json: { error: "Synthetic changed offer", code: "stale_record" },
        });
      return route.fulfill({ json: { entry: acknowledged({ offer, body }) } });
    });
    try {
      await page.goto(`${baseUrl}/waitlist-probe`);
      await page
        .getByRole("button", {
          name: action === "accept" ? "Accept and book" : "Decline this time",
        })
        .click();
      await page.getByRole("button", { name: "Retry response" }).waitFor();
      const acceptButton = page.getByRole("button", {
        name: "Accept and book",
      });
      if (action === "accept")
        expect(await acceptButton.isEnabled()).toBe(false);
      if (action === "decline") {
        await page
          .getByText("This does not confirm the original decline", {
            exact: false,
          })
          .waitFor();
        expect(await acceptButton.count()).toBe(0);
      }
      expect(
        await page
          .getByText("The offer was declined.", { exact: false })
          .count(),
      ).toBe(0);
      await page.getByRole("button", { name: "Retry response" }).click();
      await page
        .getByText("Synthetic changed offer", { exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Retry response" }).click();
      await page
        .getByText(
          action === "accept"
            ? "Your appointment is booked."
            : "The offer was declined.",
          { exact: false },
        )
        .waitFor();
      expect(bodies).toHaveLength(3);
      expect(bodies[1]).toEqual(bodies[0]);
      expect(bodies[2]).toEqual(bodies[0]);
      expect(paths).toEqual(Array(3).fill("/api/patient_portal/waitlist/11"));
      expect(
        await page.getByRole("button", { name: "Retry response" }).count(),
      ).toBe(0);
      expect(browserErrors).toEqual([]);
    } finally {
      await page.close();
    }
  },
  15000,
);
