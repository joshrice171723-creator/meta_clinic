import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";
import type {
  EmploymentAdminData,
  WorkforceEmployment,
} from "../src/features/workforce/foundationTypes";
import { sameRoleScope } from "../src/features/workforce/BulkRoleEditor";

const root = fileURLToPath(new URL("..", import.meta.url));
const sites = [{ id: 1, code: "SYN-A", name: "Synthetic East" }];
const roles = [
  {
    id: 11,
    role_code: "workforce-employee",
    label: "Employee",
    version: 1,
    permissions: ["workforce.clock"],
  },
  {
    id: 12,
    role_code: "front-desk-coordinator",
    label: "Front Desk Coordinator",
    version: 2,
    permissions: ["appointments.write"],
  },
  {
    id: 13,
    role_code: "workforce-location-manager",
    label: "Location Manager",
    version: 1,
    permissions: ["workforce.admin"],
  },
];
function employee(id: number): WorkforceEmployment {
  return {
    id,
    access_revision: String(id).padStart(64, "0"),
    status: "active",
    effective_from: "2026-01-01T00:00:00Z",
    effective_until: null,
    active_for_work: true,
    staff_member: {
      id: id + 100,
      display_name: `Synthetic Person ${id}`,
      job_title: "Synthetic Employee",
      active: true,
    },
    membership_summary: {
      id: id + 200,
      email_address: `person${id}@example.invalid`,
      active: true,
    },
    roles: [
      {
        role_version_id: 11,
        role_code: "workforce-employee",
        label: "Employee",
        scope_kind: "practice",
        site_id: null,
      },
    ],
    sites: [
      {
        ...sites[0],
        active: true,
        effective_from: "2026-01-01T00:00:00Z",
        effective_until: null,
      },
    ],
    active_work_by_site: [{ site_id: 1, count: 2 }],
  };
}
let server: ViteDevServer;
let browser: Browser;
let base: string;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-bulk-role-test",
        resolveId(source) {
          if (source === "/bulk-test.tsx") return "\0bulk-test";
        },
        load(id) {
          if (id === "\0bulk-test")
            return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {EmploymentAdminPage} from '/src/features/workforce/EmploymentAdminPage.tsx'; import {collectDemoNavigationBlockers} from '/src/features/demo/navigationBlockers.ts'; window.readBlockers = collectDemoNavigationBlockers; createRoot(document.getElementById('root')).render(React.createElement(EmploymentAdminPage));`;
        },
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (request.url === "/bulk-test") {
              response.setHeader("Content-Type", "text/html");
              response.end(
                '<div id="root"></div><script type="module" src="/bulk-test.tsx"></script>',
              );
            } else next();
          });
        },
      },
    ],
  });
  await server.listen();
  base = server.resolvedUrls!.local[0];
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function open(mode = "success") {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const records = [employee(1), employee(2), employee(3)];
  if (mode === "missing-revision")
    records.forEach((record) => {
      delete record.access_revision;
    });
  const writes: { id: number; employment: Record<string, unknown> }[] = [];
  let listReads = 0;
  let releaseUnknown = false;
  page.on("pageerror", (error) =>
    console.error("Synthetic browser error:", error.message),
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let status = 200;
      let body: unknown;
      if (path === "/api/csrf") body = { csrf_token: "synthetic-only" };
      else if (
        path === "/api/clinic/workforce/onboarding" &&
        request.method() === "POST"
      ) {
        status = 503;
        body = { error: "Synthetic setup outcome unknown" };
      } else if (
        path === "/api/clinic/workforce/employments" &&
        request.method() === "GET"
      ) {
        listReads += 1;
        if (mode === "stale" && listReads === 3)
          records[1].roles[0].role_version_id = 99;
        const projected = structuredClone(records);
        if (
          ["unknown", "timeout408"].includes(mode) &&
          !releaseUnknown &&
          writes.some((write) => write.id === 2)
        )
          projected[1] = employee(2);
        body = {
          schema_version: 1,
          employments: projected,
          role_options: roles,
          sites,
          staff_members: [],
          membership_options: [],
          invitations:
            mode === "invitation"
              ? [
                  {
                    id: 9,
                    staff_member_id: 109,
                    display_name: "Synthetic Invitee",
                    email_address: "invitee@example.invalid",
                    role_code: "workforce-employee",
                    expires_at: "2026-12-01T00:00:00Z",
                  },
                ]
              : [],
        } satisfies EmploymentAdminData;
      } else if (
        /\/employments\/\d+$/.test(path) &&
        request.method() === "PATCH"
      ) {
        const id = Number(path.split("/").at(-1));
        const input = request.postDataJSON().employment;
        writes.push({ id, employment: input });
        const record = records.find((item) => item.id === id)!;
        if (mode === "atomic-stale") {
          record.roles[0] = {
            ...record.roles[0],
            role_version_id: 99,
            scope_kind: "site",
            site_id: 2,
          };
          record.access_revision = "e".repeat(64);
        }
        if (
          input.account_action !== "revoke" &&
          input.expected_access_revision !== record.access_revision
        ) {
          status = 409;
          body = {
            error: "This record changed. Reload before trying again.",
            code: "stale_record",
          };
        } else if (mode === "denied" && id === 2) {
          status = 403;
          body = { error: "Synthetic authority denied" };
        } else {
          if (input.account_action === "revoke") {
            record.membership_summary.active = false;
            record.status = "inactive";
            record.roles = [];
            record.active_for_work = false;
          } else {
            const role = roles.find(
              (item) => item.id === input.role_version_id,
            )!;
            record.roles = [
              {
                role_version_id: role.id,
                role_code: role.role_code,
                label: role.label,
                scope_kind: "practice",
                site_id: null,
              },
            ];
            record.access_revision = `${"f".repeat(63)}${id}`;
          }
          if (["unknown", "timeout408"].includes(mode) && id === 2) {
            status = mode === "timeout408" ? 408 : 503;
            body = { error: "Synthetic response lost" };
          } else body = { employment: record };
        }
      } else if (
        path === "/api/clinic/workforce/onboarding/9" &&
        request.method() === "PATCH"
      ) {
        writes.push({
          id: 9,
          employment: request.postDataJSON().employee_invitation,
        });
        body = { invitation: { id: 9, status: "revoked" } };
      } else {
        status = 404;
        body = { error: "Unexpected synthetic API request" };
      }
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
  await page.goto(base + "bulk-test");
  await page.getByRole("heading", { name: "Bulk role editor" }).waitFor();
  return {
    page,
    writes,
    records,
    release: () => {
      releaseUnknown = true;
    },
  };
}
async function select(page: Page, ids: number[]) {
  await page
    .getByRole("combobox", { name: "Role for selected accounts" })
    .click();
  await page
    .getByRole("option", { name: "Front Desk Coordinator · version 2" })
    .click();
  for (const id of ids)
    await page
      .getByRole("checkbox", {
        name: `Synthetic Person ${id} — person${id}@example.invalid (account ${id + 200})`,
        exact: true,
      })
      .check();
  await page
    .getByRole("button", {
      name: `Review ${ids.length} selected accounts`,
      exact: true,
    })
    .click();
  await page.getByRole("dialog").waitFor();
  return ids.length + 3;
}
async function confirm(page: Page, count: number) {
  await page
    .getByRole("button", {
      name: `Confirm role changes for ${count} accounts`,
      exact: true,
    })
    .click();
  return 1;
}

it("three-account representative bulk journey takes seven deliberate actions", async () => {
  const { page, writes } = await open();
  try {
    const actions = (await select(page, [1, 2, 3])) + (await confirm(page, 3));
    await page
      .getByText("Synthetic Person 3 · person3@example.invalid · saved:", {
        exact: false,
      })
      .waitFor();
    expect(actions).toBe(7);
    expect(writes.map((write) => write.id)).toEqual([1, 2, 3]);
    console.info(
      "Synthetic bulk role actions: N=3, after=7 (2 role choices + 3 account checks + review + confirm); pinned individual path source-derived before=9.",
    );
  } finally {
    await page.close();
  }
});

it("only selected accounts are reviewed; cancellation writes nothing; confirmed role-only payload preserves sites and scope", async () => {
  const { page, writes } = await open();
  try {
    expect(
      await page
        .getByRole("checkbox", { name: /Synthetic Person \d —/, checked: true })
        .count(),
    ).toBe(0);
    await select(page, [1, 3]);
    const review = await page.getByRole("dialog").innerText();
    expect(review).toContain("person1@example.invalid");
    expect(review).toContain("person3@example.invalid");
    expect(review).not.toContain("person2@example.invalid");
    expect(review).toContain("version 2 (ID 12)");
    expect(review).toContain("appointments.write");
    expect(review).toContain("Work sites unchanged: Synthetic East (1)");
    expect(writes).toEqual([]);
    await page.getByRole("button", { name: "Back to selection" }).click();
    expect(writes).toEqual([]);
    await page
      .getByRole("button", { name: "Review 2 selected accounts" })
      .click();
    await confirm(page, 2);
    await expect.poll(() => writes.length).toBe(2);
    await page
      .getByText("Synthetic Person 3 · person3@example.invalid · saved:", {
        exact: false,
      })
      .waitFor();
    expect(writes).toEqual([
      {
        id: 1,
        employment: {
          role_version_id: 12,
          expected_access_revision: employee(1).access_revision,
        },
      },
      {
        id: 3,
        employment: {
          role_version_id: 12,
          expected_access_revision: employee(3).access_revision,
        },
      },
    ]);
    expect(
      await page
        .getByRole("checkbox", {
          name: "Synthetic Person 1 — person1@example.invalid (account 201)",
          exact: true,
        })
        .isDisabled(),
    ).toBe(true);
  } finally {
    await page.close();
  }
});
it("authority denial stops the batch; another review skips successful grants", async () => {
  const { page, writes } = await open("denied");
  try {
    await select(page, [1, 2, 3]);
    await confirm(page, 3);
    await page
      .getByText("Synthetic Person 2 · person2@example.invalid · failed:", {
        exact: false,
      })
      .waitFor();
    expect(writes.map((write) => write.id)).toEqual([1, 2]);
    expect(
      await page
        .getByText(
          "Synthetic Person 3 · person3@example.invalid · pending: Not attempted",
          { exact: true },
        )
        .count(),
    ).toBe(1);
    await page
      .getByRole("button", { name: "Review 2 selected accounts" })
      .click();
    expect(await page.getByRole("dialog").innerText()).not.toContain(
      "person1@example.invalid",
    );
    await confirm(page, 2);
    await expect.poll(() => writes.length).toBe(3);
    expect(writes.map((write) => write.id)).toEqual([1, 2, 2]);
  } finally {
    await page.close();
  }
});
it.each(["unknown", "timeout408"])(
  "%s outcome blocks switching and retries; saved-access reconciliation never sends another grant",
  async (mode) => {
    const { page, writes, release } = await open(mode);
    try {
      await select(page, [1, 2, 3]);
      await confirm(page, 3);
      await page
        .getByText("An access outcome is unconfirmed.", { exact: false })
        .waitFor();
      expect(writes.map((write) => write.id)).toEqual([1, 2]);
      expect(
        await page
          .getByRole("combobox", { name: "Role for selected accounts" })
          .isDisabled(),
      ).toBe(true);
      expect(
        await page
          .getByRole("button", {
            name: "Review 2 selected accounts",
            exact: true,
          })
          .isDisabled(),
      ).toBe(true);
      expect(
        await page.evaluate(
          () =>
            (
              window as unknown as { readBlockers: () => { blocked: boolean } }
            ).readBlockers().blocked,
        ),
      ).toBe(true);
      await page
        .getByRole("button", { name: "Check saved access", exact: true })
        .click();
      expect(writes).toHaveLength(2);
      release();
      await page
        .getByRole("button", { name: "Check saved access", exact: true })
        .click();
      await page
        .getByText("Reviewed role version confirmed in saved access", {
          exact: false,
        })
        .waitFor();
      expect(writes).toHaveLength(2);
      expect(
        await page.evaluate(
          () =>
            (
              window as unknown as { readBlockers: () => { blocked: boolean } }
            ).readBlockers().blocked,
        ),
      ).toBe(false);
      await page
        .getByRole("button", { name: "Review 1 selected accounts" })
        .click();
      await confirm(page, 1);
      await expect.poll(() => writes.length).toBe(3);
      expect(writes.map((write) => write.id)).toEqual([1, 2, 3]);
    } finally {
      await page.close();
    }
  },
);
it("stale access after review stops writes and retains selected identities", async () => {
  const { page, writes } = await open("stale");
  try {
    await select(page, [2, 3]);
    await confirm(page, 2);
    await page
      .getByText("Access or assignable roles changed after review.", {
        exact: false,
      })
      .waitFor();
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
});
it("scope changes and inactive accounts are ineligible", () => {
  expect(sameRoleScope(employee(1), roles[2])).toBe(false);
  expect(
    sameRoleScope({ ...employee(1), active_for_work: false }, roles[1]),
  ).toBe(false);
  expect(sameRoleScope({ ...employee(1), roles: [] }, roles[1])).toBe(false);
});
it("revoke requires a distinct account consequence acknowledgement and sends only revoke", async () => {
  const { page, writes } = await open();
  try {
    await page
      .getByRole("button", { name: "Revoke clinic account", exact: true })
      .first()
      .click();
    expect(await page.getByRole("dialog").innerText()).toContain(
      "all active account role grants revoked",
    );
    const revoke = page.getByRole("button", {
      name: "Revoke account",
      exact: true,
    });
    expect(await revoke.isDisabled()).toBe(true);
    expect(writes).toEqual([]);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(writes).toEqual([]);
    await page
      .getByRole("button", { name: "Revoke clinic account", exact: true })
      .first()
      .click();
    await page
      .getByRole("checkbox", {
        name: "I intend to revoke clinic access for person1@example.invalid",
        exact: true,
      })
      .check();
    await revoke.click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes).toEqual([
      { id: 1, employment: { account_action: "revoke" } },
    ]);
  } finally {
    await page.close();
  }
});

it("invitation revoke reviews affected identity and consequence before a separate confirmation", async () => {
  const { page, writes } = await open("invitation");
  try {
    await page
      .getByRole("button", { name: "Revoke invitation", exact: true })
      .click();
    expect(await page.getByRole("dialog").innerText()).toContain(
      "invitee@example.invalid",
    );
    expect(await page.getByRole("dialog").innerText()).toContain(
      "activation link will stop working",
    );
    expect(
      await page
        .getByRole("button", { name: "Confirm invitation revoke" })
        .isDisabled(),
    ).toBe(true);
    expect(writes).toEqual([]);
    await page
      .getByRole("checkbox", {
        name: "I intend to revoke this employee invitation",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Confirm invitation revoke" })
      .click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes).toEqual([{ id: 9, employment: { action: "revoke" } }]);
  } finally {
    await page.close();
  }
});

it("existing unsaved employee setup and unknown setup switching guards remain active", async () => {
  const { page, writes } = await open();
  try {
    await page
      .getByRole("textbox", { name: "Employee name", exact: true })
      .fill("Synthetic New Employee");
    expect(
      await page.evaluate(() =>
        window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
      ),
    ).toBe(false);
    expect(
      await page
        .getByRole("combobox", { name: "Role for selected accounts" })
        .isDisabled(),
    ).toBe(true);
    await page
      .getByRole("textbox", { name: "Job title", exact: true })
      .fill("Synthetic Employee");
    await page
      .getByRole("textbox", { name: "Employee email", exact: true })
      .fill("new@example.invalid");
    await page
      .getByRole("checkbox", { name: "Synthetic East", exact: true })
      .last()
      .check();
    await page
      .getByRole("button", { name: "Create employee invitation", exact: true })
      .click();
    await page
      .getByText("This employee setup has an unconfirmed outcome.", {
        exact: false,
      })
      .waitFor();
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as { readBlockers: () => { blocked: boolean } }
          ).readBlockers().blocked,
      ),
    ).toBe(true);
    expect(
      await page
        .getByRole("combobox", { name: "Role for selected accounts" })
        .isDisabled(),
    ).toBe(true);
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
});

it("the reviewed revision rejects a role/scope change after the last fresh read and stops remaining accounts", async () => {
  const { page, writes, records } = await open("atomic-stale");
  try {
    await select(page, [1, 2]);
    await confirm(page, 2);
    await page
      .getByText("This record changed. Reload before trying again.", {
        exact: false,
      })
      .waitFor();
    expect(writes).toEqual([
      {
        id: 1,
        employment: {
          role_version_id: 12,
          expected_access_revision: employee(1).access_revision,
        },
      },
    ]);
    expect(records[0].roles[0]).toMatchObject({
      role_version_id: 99,
      scope_kind: "site",
      site_id: 2,
    });
    expect(records[1].roles[0].role_version_id).toBe(11);
    expect(
      await page
        .getByText(
          "Synthetic Person 2 · person2@example.invalid · pending: Not attempted",
          { exact: true },
        )
        .count(),
    ).toBe(1);
  } finally {
    await page.close();
  }
});

it("a projection without an access revision cannot open a bulk confirmation or mutate access", async () => {
  const { page, writes } = await open("missing-revision");
  try {
    await page
      .getByRole("combobox", { name: "Role for selected accounts" })
      .click();
    await page
      .getByRole("option", { name: "Front Desk Coordinator · version 2" })
      .click();
    await page
      .getByRole("checkbox", {
        name: "Synthetic Person 1 — person1@example.invalid (account 201)",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Review 1 selected accounts", exact: true })
      .click();
    await page
      .getByText("Selected access changed or has a different scope.", {
        exact: false,
      })
      .waitFor();
    expect(await page.getByRole("dialog").count()).toBe(0);
    expect(writes).toEqual([]);
  } finally {
    await page.close();
  }
});
