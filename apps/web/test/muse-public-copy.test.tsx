import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";
let server: ViteDevServer, browser: Browser, base: string;
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import {ClinicPage,LaunchLayout} from '/src/App.tsx';
import {MembershipGrowth} from '/src/features/membershipGrowth/MembershipGrowth.tsx';
import {PublicClinicServices} from '/src/features/membershipGrowth/PublicClinicServices.tsx';
import {PublicMembershipDirectory} from '/src/features/membershipGrowth/PublicMembershipDirectory.tsx';
import {AppearanceSettings} from '/src/features/identity/Settings.tsx';
import {Login} from '/src/features/identity/Login.tsx';
const mode=new URLSearchParams(location.search).get('mode');
const el=React.createElement;
let content = mode==='legacy' ? el(ClinicPage,{route:{path:'/clinic/memberships',search:''}}) : mode==='growth' ? el(MembershipGrowth) : location.pathname.startsWith('/clinics/') ? el(PublicClinicServices,{slug:'synthetic-clinic'}) : mode==='appearance' ? el(AppearanceSettings,{user:{id:1,email_address:'synthetic@example.test'}, settings:{user_id:1,appearance:{palette:'cobalt',mode:'light',version:1}},accept:()=>{}}) : mode==='directory' ? el(PublicMembershipDirectory) : el(LaunchLayout,{user:null,environment:'test'},el(Login,{developmentLogin:true,ownerPinRequired:false,environment:'test'}));
createRoot(document.getElementById('root')).render(content);`;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-public-copy",
        enforce: "pre",
        resolveId(source) {
          if (source === "/qa-copy.tsx") return "\0qa-copy";
        },
        load(id) {
          if (id === "\0qa-copy") return entry;
        },
        transform(code, id) {
          if (id.endsWith("/src/App.tsx"))
            return code + "\nexport { ClinicPage, LaunchLayout };";
        },
        configureServer(vite) {
          vite.middlewares.use((req, res, next) => {
            if (
              req.url?.startsWith("/qa-copy?") ||
              req.url?.startsWith("/clinics/") ||
              req.url?.startsWith("/login")
            ) {
              res.setHeader("Content-Type", "text/html");
              res.end(
                '<div id="root"></div><script type="module" src="/qa-copy.tsx"></script>',
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
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function open(mode: string) {
  const page = await browser.newPage();
  let writes = 0;
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") writes++;
      let body: unknown = {};
      if (path.endsWith("/csrf"))
        body = {
          csrf_token: "synthetic-only",
          development_accounts: [],
          development_login: true,
        };
      else if (path.endsWith("/membership_prospects"))
        body = {
          storefront: {
            slug: "synthetic-clinic",
            enabled: true,
            public_path: "/memberships/synthetic-clinic",
            service_page_path: "/clinics/synthetic-clinic/services",
          },
          capabilities: { configure: true, review: true },
          prospects: [],
        };
      else if (path.endsWith("/service_inquiries"))
        body = {
          inquiries: [],
          pagination: { page: 1, per_page: 50, total: 0, total_pages: 1 },
        };
      else if (path.endsWith("/membership_storefronts"))
        body = { storefronts: [] };
      else if (path.includes("/clinic_services/"))
        body = {
          practice: {
            name: "Synthetic Clinic",
            slug: "synthetic-clinic",
            headline: null,
            intro: null,
            accent: null,
            logo_path: null,
          },
          membership_path: "/memberships/synthetic-clinic",
          services: [],
        };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
  await page.goto(base + "qa-copy?mode=" + mode);
  return { page, writes: () => writes };
}
it("Muse126 retains invalid typed clinic page name and blocks saving", async () => {
  const { page, writes } = await open("growth");
  const input = page.getByLabel("Clinic page name", { exact: false });
  await input.fill("Bad Name!");
  expect(await input.inputValue()).toBe("Bad Name!");
  expect(await input.getAttribute("aria-invalid")).toBe("true");
  expect(
    await page.getByRole("button", { name: "Save page settings" }).isDisabled(),
  ).toBe(true);
  await input.fill("synthetic-new-name");
  expect(
    await page.getByRole("button", { name: "Save page settings" }).isEnabled(),
  ).toBe(true);
  expect(writes()).toBe(0);
  await page.close();
});
it("Muse124 retired clinic memberships route gives recovery destinations", async () => {
  const { page } = await open("legacy");
  await page
    .getByRole("heading", { name: "Membership management has moved" })
    .waitFor({ timeout: 3000 });
  expect(
    await page
      .getByRole("link", { name: "Growth", exact: true })
      .getAttribute("href"),
  ).toBe("/clinic/growth");
  expect(
    await page
      .getByRole("link", { name: "Subscription catalog", exact: true })
      .getAttribute("href"),
  ).toBe("/clinic/subscriptions");
  await page.close();
});
it("Muse125 services page exists and the Growth link opens it", async () => {
  const { page, writes } = await open("growth");
  const link = page.getByRole("link", { name: "Open services page" });
  await link.waitFor();
  const href = await link.getAttribute("href");
  expect(href).toBe("/clinics/synthetic-clinic/services");
  await page.goto(base + href!.slice(1));
  await page
    .getByRole("heading", { name: "Synthetic Clinic", exact: true })
    .waitFor();
  expect(writes()).toBe(0);
  await page.close();
});
it("Muse7 account appearance uses plain labels and one copy of its guidance", async () => {
  const { page } = await open("appearance");
  await page
    .getByRole("heading", { name: "Appearance", exact: true })
    .waitFor();
  const text = await page.locator("body").innerText();
  expect(text).toContain("Graphite and blue");
  expect(text).toContain("Classic blue");
  expect(text).not.toMatch(
    /VS Code|Owner blue & white|after the server accepts it/,
  );
  expect(
    text.match(/Choose a color palette and display brightness/g),
  ).toHaveLength(1);
  expect(text.match(/Reloading discards unsaved selections/g)).toHaveLength(1);
  await page.close();
});
it("Muse4 empty directory explains recovery and offers sign in", async () => {
  const { page } = await open("directory");
  await page
    .getByRole("heading", {
      name: "No public membership pages are available yet.",
    })
    .waitFor();
  expect(await page.locator("body").innerText()).toContain(
    "Ask your clinic for its membership link",
  );
  expect(
    await page
      .getByRole("link", { name: "I already have an account" })
      .getAttribute("href"),
  ).toBe("/login");
  await page.close();
});
it("Muse4/100 public entry omits Future Patient shortcut and offers patient credentials", async () => {
  const { page } = await open("entry");
  const link = page.getByRole("link", {
    name: "Sign in with patient portal account",
    exact: true,
  });
  await link.waitFor();
  expect(await page.locator("body").innerText()).not.toMatch(/FUTURE PATIENT/i);
  await link.click();
  await page
    .getByText(
      "Patients use the account activated from their clinic invitation.",
      { exact: true },
    )
    .waitFor();
  expect(
    await page.getByLabel("Email", { exact: false }).count(),
  ).toBeGreaterThan(0);
  expect(
    await page.getByLabel("Password", { exact: false }).count(),
  ).toBeGreaterThan(0);
  expect(
    await page
      .getByRole("link", { name: "Forgot patient portal password?" })
      .getAttribute("href"),
  ).toBe("/patient-portal/recovery");
  await page.close();
});
