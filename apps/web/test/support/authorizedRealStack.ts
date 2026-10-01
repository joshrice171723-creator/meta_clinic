import { readFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";
import { expect } from "vitest";

export type RealFixture = {
  schema: string;
  synthetic: boolean;
  isolated_database: string;
  head: string;
  organization_id: number;
  organization_name: string;
  practice_id: number;
  practice_name: string;
  site_id: number;
  site_name: string;
  site_code: string;
  second_site_id: number;
  second_site_name: string;
  foreign_site_id: number;
  actor_user_id: number;
  profile: string;
  membership_id: number;
  clinician_id: number;
  room_id: number;
  patient_id: number;
  patient_name: string;
  visit_type_id: number;
  visit_type_code: string;
  day: string;
  starts_at: string;
  ends_at: string;
  [key: string]: unknown;
};

export const realStackEnabled =
  !!process.env.QA_REAL_BASE_URL && process.env.QA_REAL_ISOLATED === "1";
export function readRealFixture<T extends RealFixture = RealFixture>(): T {
  expect(process.env.QA_REAL_ISOLATED).toBe("1");
  const base = new URL(process.env.QA_REAL_BASE_URL!);
  expect(base.protocol).toBe("http:");
  expect(["localhost", "127.0.0.1"]).toContain(base.hostname);
  const fixture = JSON.parse(
    readFileSync(process.env.QA_REAL_FIXTURE!, "utf8"),
  ) as T;
  expect(fixture.schema).toBe("authorized-real-stack-v1");
  expect(fixture.synthetic).toBe(true);
  expect(fixture.isolated_database).toMatch(
    /^apply_authorized_qa_20261001_[a-f0-9]{10}_development$/,
  );
  expect(fixture.head).toBe(process.env.QA_REAL_HEAD);
  return fixture;
}

export async function launchRealBrowser() {
  return chromium.launch({
    ...(process.env.BROWSER_EXECUTABLE_PATH
      ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
      : {
          channel:
            process.env.PLAYWRIGHT_CHANNEL ||
            (process.platform === "win32" ? "msedge" : "chrome"),
        }),
    headless: true,
  });
}

export function realUrl(path: string) {
  return new URL(path, process.env.QA_REAL_BASE_URL!).href;
}
export async function selectReal(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
export async function realGet<T = Record<string, unknown>>(
  page: Page,
  path: string,
): Promise<T> {
  const response = await page.request.get(realUrl(path));
  expect(response.status()).toBe(200);
  return response.json() as Promise<T>;
}
export async function realMutation(
  page: Page,
  path: string,
  body: unknown,
  method = "POST",
) {
  const csrf = await realGet<{ csrf_token: string }>(page, "/api/csrf");
  return page.request.fetch(realUrl(path), {
    method,
    data: body,
    headers: {
      Origin: new URL(process.env.QA_REAL_BASE_URL!).origin,
      "X-CSRF-Token": csrf.csrf_token,
    },
  });
}
export async function loginReal(
  page: Page,
  fixture: RealFixture,
  route = "/clinic",
) {
  await page.goto(realUrl(`/login?next=${encodeURIComponent(route)}`));
  const response = await realMutation(page, "/api/development_session", {
    profile: fixture.profile,
    portal: "clinic",
    practice_id: fixture.practice_id,
    site_id: fixture.site_id,
  });
  expect(response.status()).toBe(201);
  await page.goto(realUrl(route));
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  const session = await realGet<{ user: { id: number } }>(page, "/api/session");
  expect(session.user.id).toBe(fixture.actor_user_id);
  const context = await realGet<{
    practice: { id: number };
    current_site: { id: number };
  }>(page, "/api/clinic/context");
  expect(context.practice.id).toBe(fixture.practice_id);
  expect(context.current_site.id).toBe(fixture.site_id);
}
