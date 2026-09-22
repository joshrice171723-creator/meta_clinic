import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const script = readFileSync(
  new URL("../public/visit-tracking.js", import.meta.url),
  "utf8",
);

async function visit(path: string, privacy = false) {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ csrf_token: "synthetic-csrf" }),
  });
  const window = { location: { pathname: path }, top: 1, self: 1 };
  runInNewContext(script, {
    window,
    navigator: { globalPrivacyControl: privacy },
    document: {
      referrer: "https://example.invalid/profile?private=hidden",
      visibilityState: "visible",
    },
    URL,
    crypto: { randomUUID: () => "synthetic-event" },
    fetch,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return fetch;
}

describe("public website tracking", () => {
  it("reports both pages to the main API and strips referring URL details", async () => {
    for (const path of ["/joshua/", "/demo"]) {
      const fetch = await visit(path);
      expect(fetch.mock.calls[0][0]).toBe("/api/csrf");
      expect(fetch.mock.calls[1][0]).toBe("/api/public/page_visits");
      expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
        path: path.replace(/\/$/, ""),
        event_id: "synthetic-event",
        referrer_host: "example.invalid",
      });
      expect(fetch.mock.calls[1][1].headers["X-CSRF-Token"]).toBe(
        "synthetic-csrf",
      );
    }
  });
  it("does not track protected pages or privacy opt outs", async () => {
    expect(await visit("/owner")).not.toHaveBeenCalled();
    expect(await visit("/clinic/patients")).not.toHaveBeenCalled();
    expect(await visit("/demo", true)).not.toHaveBeenCalled();
  });
});
