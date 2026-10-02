#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(webRoot, "../..");
const allowedPortals = new Set(["clinic", "launch", "owner", "patient"]);

function fail(message) {
  process.stderr.write(`browser-smoke: ${message}\n`);
  process.exitCode = 2;
  throw new Error(message);
}

function help() {
  process.stdout.write(
    `Usage: pnpm run browser:smoke [options]\n\nOptions:\n  --route <path>       Route to inspect (default: /clinic)\n  --profile <value>    Account id or clinic-administrator (default)\n  --portal <name>      clinic, launch, owner, or patient (default: clinic)\n  --viewport <name>    desktop, tablet, or phone (default: desktop)\n  --screenshot <path>  Output PNG (default: outputs/browser-smoke/<timestamp>.png)\n  --matrix             Inspect the core clinic routes in one retained session\n  --ui-login           Exercise the visible development selector before opening the route\n  --base-url <url>     Loopback web URL (default: http://127.0.0.1:3000)\n  --headed             Show the browser window\n  --no-start           Require an already-running managed stack\n  --help               Show this help\n`,
  );
}

function options(argv) {
  const result = {
    route: "/clinic",
    profile: "clinic-administrator",
    portal: "clinic",
    viewport: "desktop",
    baseUrl: "http://127.0.0.1:3000",
    headed: false,
    matrix: false,
    uiLogin: false,
    start: true,
    screenshot: null,
    authorizedFixture: null,
    expectedHead: null,
    databaseProof: null,
    evidenceDir: null,
    locale: "en-US",
    timezone: "UTC",
    routes: null,
    artifactMap: null,
    sourceFiles: null,
  };
  const valued = new Map([
    ["--route", "route"],
    ["--profile", "profile"],
    ["--portal", "portal"],
    ["--viewport", "viewport"],
    ["--base-url", "baseUrl"],
    ["--screenshot", "screenshot"],
    ["--authorized-fixture", "authorizedFixture"],
    ["--expected-head", "expectedHead"],
    ["--database-proof", "databaseProof"],
    ["--evidence-dir", "evidenceDir"],
    ["--locale", "locale"],
    ["--timezone", "timezone"],
    ["--routes", "routes"],
    ["--artifact-map", "artifactMap"],
    ["--source-files", "sourceFiles"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help") return { help: true };
    if (argument === "--headed") result.headed = true;
    else if (argument === "--matrix") result.matrix = true;
    else if (argument === "--ui-login") result.uiLogin = true;
    else if (argument === "--no-start") result.start = false;
    else if (valued.has(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--"))
        fail(`${argument} requires a value`);
      result[valued.get(argument)] = value;
      index += 1;
    } else fail(`unknown option ${argument}`);
  }
  return result;
}

function requireCapture(condition, message) {
  if (!condition) throw new Error(message);
}

function gitRead(...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  requireCapture(result.status === 0, "Unable to read local Git identity");
  return result.stdout.trim();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value) {
  const sort = (item) => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, sort(item[key])]),
      );
    return item;
  };
  return JSON.stringify(sort(value), null, 2) + "\n";
}

function captureSource(head) {
  requireCapture(
    gitRead("rev-parse", "HEAD") === head,
    "Local HEAD does not match --expected-head",
  );
  requireCapture(
    gitRead("status", "--porcelain=v1", "--untracked-files=normal") === "",
    "Guarded capture requires a clean source worktree",
  );
  return {
    revision: head,
    dirty: false,
    harness_sha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
  };
}

function captureBrowserPath() {
  const explicit = process.env.BROWSER_EXECUTABLE_PATH;
  const channel =
    process.env.PLAYWRIGHT_CHANNEL ||
    (process.platform === "win32" ? "msedge" : "chrome");
  let candidates;
  if (explicit) candidates = [resolve(explicit)];
  else if (channel === "chromium") candidates = [chromium.executablePath()];
  else {
    requireCapture(
      ["chrome", "msedge"].includes(channel),
      "Set BROWSER_EXECUTABLE_PATH for this PLAYWRIGHT_CHANNEL",
    );
    if (process.platform === "win32") {
      const suffix =
        channel === "msedge"
          ? ["Microsoft", "Edge", "Application", "msedge.exe"]
          : ["Google", "Chrome", "Application", "chrome.exe"];
      candidates = [
        process.env.ProgramFiles,
        process.env["ProgramFiles(x86)"],
        process.env.LOCALAPPDATA,
      ]
        .filter(Boolean)
        .map((directory) => join(directory, ...suffix));
    } else if (process.platform === "darwin") {
      candidates = [
        channel === "msedge"
          ? "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
          : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ];
    } else
      candidates =
        channel === "msedge"
          ? ["/opt/microsoft/msedge/msedge", "/usr/bin/microsoft-edge"]
          : [
              "/opt/google/chrome/chrome",
              "/usr/bin/google-chrome",
              "/usr/bin/chromium",
              "/usr/bin/chromium-browser",
            ];
  }
  const executablePath = candidates.find((candidate) => {
    try {
      accessSync(
        candidate,
        process.platform === "win32" ? constants.R_OK : constants.X_OK,
      );
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  requireCapture(
    executablePath,
    "Browser executable unavailable. Set BROWSER_EXECUTABLE_PATH to an installed browser. Checked: " +
      candidates.join(", "),
  );
  return executablePath;
}

async function captureBuild(baseUrl, head) {
  const response = await fetch(new URL("/build.json", baseUrl), {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  requireCapture(response.ok, "Served build identity is unavailable");
  const build = await response.json();
  requireCapture(
    build.revision === head && build.dirty === false,
    "Served build revision/dirty state does not match the clean expected source",
  );
  return {
    revision: build.revision,
    dirty: build.dirty,
    version: build.version,
    environment: build.environment,
    observed_at: build.observed_at,
  };
}

async function captureGet(page, baseUrl, path) {
  const response = await page.request.get(new URL(path, baseUrl).href, {
    timeout: 15000,
  });
  requireCapture(
    response.status() === 200,
    "Identity read failed: " + path + " HTTP " + response.status(),
  );
  return response.json();
}

async function captureServedSources(baseUrl, head, paths) {
  requireCapture(
    Array.isArray(paths) && paths.length >= 1 && paths.length <= 5,
    "Use one to five explicit source modules",
  );
  return Promise.all(
    paths.map(async (path) => {
      requireCapture(
        typeof path === "string" &&
          /^apps\/web\/src\/[A-Za-z0-9_./-]+\.[jt]sx?$/.test(path) &&
          !path.split("/").includes(".."),
        "Source modules must be tracked apps/web/src JavaScript or TypeScript files",
      );
      const response = await fetch(
        new URL("/" + path.slice("apps/web/".length), baseUrl),
        { cache: "no-store", signal: AbortSignal.timeout(10000) },
      );
      requireCapture(
        response.ok,
        "Served source module is unavailable: " + path,
      );
      const module = await response.text();
      const match = module.match(
        /sourceMappingURL=data:application\/json;base64,([^\s]+)/,
      );
      requireCapture(
        match,
        "Served source module has no inspectable inline Vite source map: " +
          path,
      );
      const map = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
      const filename = path.split("/").at(-1);
      const indexes = (map.sources || [])
        .map((source, index) => ({ source, index }))
        .filter(
          ({ source }) =>
            source === filename ||
            source.replaceAll("\\", "/").endsWith("/" + filename),
        );
      requireCapture(
        indexes.length === 1 &&
          typeof map.sourcesContent?.[indexes[0].index] === "string",
        "Served source map does not identify exactly the expected source filename: " +
          path,
      );
      const original = spawnSync("git", ["show", head + ":" + path], {
        cwd: root,
      });
      requireCapture(
        original.status === 0,
        "Source module is not available at the expected HEAD: " + path,
      );
      const hash = (content) => sha256(content.replaceAll("\r\n", "\n"));
      const diskHash = hash(readFileSync(resolve(root, path), "utf8"));
      const headHash = hash(original.stdout.toString("utf8"));
      const servedHash = hash(map.sourcesContent[indexes[0].index]);
      requireCapture(
        diskHash === headHash && servedHash === diskHash,
        "Actual served source content differs from disk/HEAD: " + path,
      );
      return {
        path,
        source_filename: indexes[0].source,
        disk_lf_sha256: diskHash,
        head_lf_sha256: headHash,
        served_lf_sha256: servedHash,
      };
    }),
  );
}

async function captureGeometry(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility === "visible" &&
        !node.closest("[hidden], [inert]")
      );
    };
    const bounds = (node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const table = [
      ...document.querySelectorAll(".tracking-table-container"),
    ].find(visible);
    return {
      pathname: location.pathname,
      viewport: {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
      },
      document: {
        client_width: document.documentElement.clientWidth,
        scroll_width: document.documentElement.scrollWidth,
        horizontal_overflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      },
      headings: [...document.querySelectorAll("main h1, main h2")]
        .filter(visible)
        .map((node) => node.textContent.trim()),
      visible_states: [
        ...document.querySelectorAll(
          "main [role=status], main [role=alert], main [aria-busy=true]",
        ),
      ]
        .filter(visible)
        .map((node) => ({
          role: node.getAttribute("role"),
          busy: node.getAttribute("aria-busy"),
          text: node.textContent.trim(),
        })),
      controls: [
        ...document.querySelectorAll(
          "main button, main a[href], main input, main select, main textarea",
        ),
      ]
        .filter(visible)
        .map((node) => ({
          tag: node.tagName.toLowerCase(),
          label:
            node.getAttribute("aria-label") ||
            node.labels?.[0]?.textContent.trim() ||
            node.textContent.trim(),
          disabled:
            node.matches(":disabled") ||
            node.getAttribute("aria-disabled") === "true",
          bounds: bounds(node),
        })),
      tracking_table: table
        ? {
            bounds: bounds(table),
            scroll_left: table.scrollLeft,
            scroll_top: table.scrollTop,
            scroll_width: table.scrollWidth,
            scroll_height: table.scrollHeight,
            client_width: table.clientWidth,
            client_height: table.clientHeight,
            rows: table.querySelectorAll("tbody tr").length,
            headers: [...table.querySelectorAll("thead th")].map((node) => ({
              text: node.textContent.trim(),
              bounds: bounds(node),
              position: getComputedStyle(node).position,
            })),
          }
        : null,
      source_links: [...document.querySelectorAll("main a[href]")]
        .filter(
          (node) =>
            visible(node) && new URL(node.href).origin === location.origin,
        )
        .map((node) => ({
          label: node.getAttribute("aria-label") || node.textContent.trim(),
          pathname: new URL(node.href).pathname,
        })),
    };
  });
}

async function runAuthorizedCapture(selected, baseUrl) {
  requireCapture(
    selected.expectedHead && /^[a-f0-9]{40}$/.test(selected.expectedHead),
    "--expected-head requires the full 40-character revision",
  );
  requireCapture(
    selected.authorizedFixture &&
      selected.databaseProof &&
      selected.evidenceDir,
    "Guarded capture requires --authorized-fixture, --database-proof and --evidence-dir",
  );
  requireCapture(
    selected.portal === "clinic" &&
      !selected.matrix &&
      !selected.uiLogin &&
      !selected.screenshot,
    "Guarded capture uses one clinic route and fixture-exact session setup; omit --matrix, --ui-login and --screenshot",
  );
  const routes = selected.routes
    ? selected.routes.startsWith("[")
      ? JSON.parse(selected.routes)
      : selected.routes.split(",")
    : [selected.route];
  const sourceFiles = selected.sourceFiles
    ? JSON.parse(selected.sourceFiles)
    : [
        "apps/web/src/features/clinic/TrackingBoardPage.tsx",
        "apps/web/src/features/identity/Login.tsx",
      ];
  requireCapture(
    Array.isArray(routes) &&
      routes.length >= 1 &&
      routes.length <= 5 &&
      routes.every((route) => {
        if (
          typeof route !== "string" ||
          !route.startsWith("/") ||
          route.startsWith("//")
        )
          return false;
        const target = new URL(route, baseUrl);
        return (
          target.origin === baseUrl.origin &&
          (target.pathname === "/login" ||
            target.pathname === "/clinic" ||
            target.pathname.startsWith("/clinic/"))
        );
      }),
    "Guarded capture requires one to five explicit same-origin /login or /clinic routes",
  );
  const viewports = selected.viewport.split(",").map((value) => {
    const match = /^(\d+)x(\d+)$/.exec(value);
    requireCapture(
      match,
      "Guarded --viewport requires WIDTHxHEIGHT, optionally comma-separated",
    );
    const viewport = { width: Number(match[1]), height: Number(match[2]) };
    requireCapture(
      viewport.width >= 320 &&
        viewport.width <= 3840 &&
        viewport.height >= 320 &&
        viewport.height <= 2160,
      "Guarded viewport dimensions are outside 320..3840 by 320..2160",
    );
    return viewport;
  });
  requireCapture(
    viewports.length <= 5 &&
      new Set(viewports.map((v) => v.width + "x" + v.height)).size ===
        viewports.length,
    "Use one to five distinct viewports",
  );
  const output = resolve(root, selected.evidenceDir);
  const outputRelative = relative(root, output);
  requireCapture(
    outputRelative &&
      !outputRelative.startsWith("..") &&
      !isAbsolute(outputRelative) &&
      !existsSync(output),
    "Use a fresh evidence directory inside this repository",
  );
  requireCapture(
    ["tmp", "outputs"].includes(
      outputRelative.replaceAll("\\", "/").split("/")[0],
    ),
    "Evidence must be inside repository-owned tmp or outputs",
  );
  const ignored = spawnSync(
    "git",
    ["check-ignore", "--quiet", "--", join(outputRelative, "report.json")],
    { cwd: root },
  );
  requireCapture(
    ignored.status === 0,
    "Evidence directory must be Git-ignored so source guards remain meaningful",
  );
  mkdirSync(output, { recursive: true });
  const started = performance.now();
  const report = {
    schema: "authorized-browser-capture-v1",
    started_utc: new Date().toISOString(),
    outcome: "running",
    routes,
    locale: selected.locale,
    timezone: selected.timezone,
    captures: [],
    api_outcomes: [],
    browser_errors: [],
    domain_mutations_blocked: [],
    reused_artifacts: [],
    limits: [
      "Database identity uses the supplied trusted Rails proof; HTTP does not independently disclose the database.",
      "Development-session helper setup does not prove visible selector login, domain mutation authorization/persistence, provider media or sticky scrolling.",
      "Viewport observations and stage durations are not paired benchmark improvement measurements.",
    ],
  };
  const files = [];
  let browser;
  let phase = "preflight";
  try {
    const executablePath = captureBrowserPath();
    report.browser_executable = executablePath;
    report.source_before = captureSource(selected.expectedHead);
    const fixtureBytes = readFileSync(
      resolve(root, selected.authorizedFixture),
    );
    const proofBytes = readFileSync(resolve(root, selected.databaseProof));
    const fixture = JSON.parse(fixtureBytes.toString("utf8"));
    const proof = JSON.parse(proofBytes.toString("utf8"));
    requireCapture(
      fixture.schema === "authorized-real-stack-v1" &&
        fixture.synthetic === true &&
        /^apply_authorized_qa_20261001_[a-f0-9]{10}_development$/.test(
          fixture.isolated_database,
        ),
      "Fixture must preserve the authorized independently synthetic isolated-stack contract",
    );
    requireCapture(
      fixture.head === selected.expectedHead,
      "Fixture head does not match --expected-head; preserve historical fixtures and supply a new capture copy",
    );
    for (const key of ["actor_user_id", "practice_id", "site_id", "patient_id"])
      requireCapture(
        Number.isSafeInteger(fixture[key]) && fixture[key] > 0,
        "Fixture identity is invalid: " + key,
      );
    requireCapture(
      typeof fixture.profile === "string" && fixture.profile.length > 0,
      "Fixture requires its exact development profile",
    );
    requireCapture(
      proof.schema === "authorized-real-stack-db-proof-v1" &&
        proof.database === fixture.isolated_database &&
        proof.source_head === selected.expectedHead &&
        proof.practice_id === fixture.practice_id &&
        proof.patient_id === fixture.patient_id &&
        proof.independently_synthetic_reference_matched === true &&
        proof.rails_environment === "development" &&
        proof.mutations_performed === false &&
        proof.external_sends === false,
      "Trusted Rails database proof does not match the fixture/source/read-only contract",
    );
    const proofAge = Date.now() - Date.parse(proof.generated_utc);
    requireCapture(
      Number.isFinite(proofAge) && proofAge >= 0 && proofAge <= 15 * 60 * 1000,
      "Trusted Rails database proof must be generated within the previous 15 minutes",
    );
    report.inputs = {
      fixture_sha256: sha256(fixtureBytes),
      database_proof_sha256: sha256(proofBytes),
      fixture_identity: {
        schema: fixture.schema,
        synthetic: fixture.synthetic,
        isolated_database: fixture.isolated_database,
        head: fixture.head,
        profile: fixture.profile,
        actor_user_id: fixture.actor_user_id,
        practice_id: fixture.practice_id,
        site_id: fixture.site_id,
        patient_id: fixture.patient_id,
      },
      database_proof: {
        provenance:
          "provided trusted configured local Rails/PostgreSQL read-only artifact",
        verification_type: proof.verification_type,
        generated_utc: proof.generated_utc,
        source_head: proof.source_head,
        database: proof.database,
        independently_http_verified: false,
      },
    };
    if (selected.artifactMap) {
      const mapBytes = readFileSync(resolve(root, selected.artifactMap));
      report.artifact_map_sha256 = sha256(mapBytes);
      const artifacts = JSON.parse(mapBytes.toString("utf8"));
      requireCapture(
        Array.isArray(artifacts) && artifacts.length <= 30,
        "--artifact-map must contain an explicit array of at most 30 existing evidence files",
      );
      for (const [index, entry] of artifacts.entries()) {
        requireCapture(
          entry &&
            typeof entry.path === "string" &&
            /^[a-f0-9]{40}$/.test(entry.source_head) &&
            typeof entry.evidence_type === "string" &&
            Array.isArray(entry.source_paths) &&
            entry.source_paths.length > 0 &&
            entry.source_paths.length <= 30,
          "Each artifact requires path, source_head, evidence_type and explicit source_paths",
        );
        const sources = entry.source_paths.map((path) => {
          requireCapture(
            typeof path === "string" &&
              path.length > 0 &&
              !path.startsWith("-") &&
              !isAbsolute(path) &&
              !path.split(/[\\/]/).includes(".."),
            "Artifact source paths must be repository-relative tracked files",
          );
          const blob = gitRead("rev-parse", entry.source_head + ":" + path);
          requireCapture(
            blob === gitRead("rev-parse", selected.expectedHead + ":" + path),
            "Reused evidence source changed: " + path,
          );
          return { path, blob };
        });
        requireCapture(
          entry.path.length > 0 &&
            !isAbsolute(entry.path) &&
            !entry.path.split(/[\\/]/).includes("..") &&
            ["tmp", "outputs"].includes(entry.path.split(/[\\/]/)[0]),
          "Artifact paths must be repository-relative files under ignored tmp or outputs",
        );
        const artifactPath = resolve(root, entry.path);
        const realArtifactRelative = relative(
          realpathSync(root),
          realpathSync(artifactPath),
        );
        requireCapture(
          !isAbsolute(realArtifactRelative) &&
            !realArtifactRelative.split(/[\\/]/).includes("..") &&
            ["tmp", "outputs"].includes(
              realArtifactRelative.split(/[\\/]/)[0],
            ) &&
            statSync(artifactPath).isFile(),
          "Artifact real paths must remain regular files inside repository tmp or outputs",
        );
        requireCapture(
          spawnSync("git", ["check-ignore", "-q", "--", entry.path], {
            cwd: root,
            encoding: "utf8",
          }).status === 0,
          "Artifact paths must be ignored by Git",
        );
        const bytes = readFileSync(artifactPath);
        const name =
          "artifact-" +
          String(index + 1).padStart(3, "0") +
          (entry.path.endsWith(".json") ? ".json" : ".log");
        writeFileSync(join(output, name), bytes, { flag: "wx" });
        files.push(name);
        report.reused_artifacts.push({
          name,
          original_path: entry.path,
          source_head: entry.source_head,
          evidence_type: entry.evidence_type,
          source_files: sources,
          sha256: sha256(bytes),
          scope_limit:
            "Reuse is limited to the operator-listed source files; no broader validation is inferred.",
        });
      }
    }
    report.build_before = await captureBuild(baseUrl, selected.expectedHead);
    report.served_sources_before = await captureServedSources(
      baseUrl,
      selected.expectedHead,
      sourceFiles,
    );
    report.preflight_ms = performance.now() - started;
    phase = "browser launch";
    const launching = performance.now();
    browser = await chromium.launch({
      executablePath,
      headless: !selected.headed,
      timeout: 10000,
    });
    report.browser_version = browser.version();
    report.browser_launch_ms = performance.now() - launching;
    const context = await browser.newContext({
      viewport: viewports[0],
      deviceScaleFactor: 1,
      locale: selected.locale,
      timezoneId: selected.timezone,
    });
    let loginAllowed = true;
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      const path = requestUrl.pathname;
      if (
        !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
        !(
          loginAllowed &&
          request.method() === "POST" &&
          requestUrl.origin === baseUrl.origin &&
          path === "/api/development_session"
        )
      ) {
        report.domain_mutations_blocked.push({
          method: request.method(),
          path,
        });
        await route.abort("blockedbyclient");
      } else await route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => report.browser_errors.push(error.message));
    page.on("response", (response) => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith("/api/"))
        report.api_outcomes.push({ path, status: response.status() });
    });
    page.on("requestfailed", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/"))
        report.api_outcomes.push({ path, outcome: "requestfailed" });
    });
    phase = "fixture session";
    const loggingIn = performance.now();
    await page.goto(new URL("/login", baseUrl).href, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const loginUrl = new URL(page.url());
    requireCapture(
      loginUrl.origin === baseUrl.origin &&
        loginUrl.pathname === "/login" &&
        loginUrl.search === "",
      "Fixture session login must retain the exact local login URL",
    );
    await page
      .getByRole("button", { name: "Log in", exact: true })
      .waitFor({ state: "visible", timeout: 30000 });
    const loginScreenshot =
      "000-login-" + viewports[0].width + "x" + viewports[0].height + ".png";
    await page.screenshot({
      path: join(output, loginScreenshot),
      animations: "disabled",
    });
    files.push(loginScreenshot);
    report.login_presentation = await captureGeometry(page);
    const loginStatus = await page.evaluate(
      async ({ profile, practiceId, siteId }) => {
        const csrfResponse = await fetch("/api/csrf", {
          credentials: "same-origin",
        });
        if (!csrfResponse.ok) return csrfResponse.status;
        const csrf = await csrfResponse.json();
        if (
          !csrf.development_accounts?.some((account) => account.id === profile)
        )
          return 422;
        const response = await fetch("/api/development_session", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf.csrf_token,
          },
          body: JSON.stringify({
            profile,
            portal: "clinic",
            practice_id: practiceId,
            site_id: siteId,
          }),
        });
        return response.status;
      },
      {
        profile: fixture.profile,
        practiceId: fixture.practice_id,
        siteId: fixture.site_id,
      },
    );
    loginAllowed = false;
    requireCapture(
      loginStatus === 201,
      "Fixture-exact development session refused: HTTP " + loginStatus,
    );
    const session = await captureGet(page, baseUrl, "/api/session");
    const clinic = await captureGet(page, baseUrl, "/api/clinic/context");
    requireCapture(
      session.user?.id === fixture.actor_user_id &&
        clinic.practice?.id === fixture.practice_id &&
        clinic.current_site?.id === fixture.site_id,
      "Actual session/clinic/site identity does not match the fixture",
    );
    const lookup = await captureGet(
      page,
      baseUrl,
      "/api/clinic/patients/lookup?id=" + fixture.patient_id,
    );
    const patient = lookup.patients?.find(
      (item) => item.id === fixture.patient_id,
    );
    requireCapture(
      patient && patient.display_name === fixture.patient_name,
      "Actual independently synthetic patient identity does not match the fixture",
    );
    report.session_identity = {
      actor_user_id: session.user.id,
      practice_id: clinic.practice.id,
      site_id: clinic.current_site.id,
      patient_id: patient.id,
    };
    report.session_setup_ms = performance.now() - loggingIn;
    phase = "viewport capture";
    const publicContext = await browser.newContext({
      viewport: viewports[0],
      deviceScaleFactor: 1,
      locale: selected.locale,
      timezoneId: selected.timezone,
    });
    await publicContext.route("**/api/**", async (route) => {
      const request = route.request();
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        report.domain_mutations_blocked.push({
          method: request.method(),
          path: new URL(request.url()).pathname,
        });
        await route.abort("blockedbyclient");
      } else await route.continue();
    });
    const publicPage = await publicContext.newPage();
    publicPage.on("pageerror", (error) =>
      report.browser_errors.push(error.message),
    );
    for (const [index, viewport] of viewports.entries())
      for (const [routeIndex, route] of routes.entries()) {
        captureSource(selected.expectedHead);
        const target = new URL(route, baseUrl);
        const capturePage = target.pathname === "/login" ? publicPage : page;
        await capturePage.setViewportSize(viewport);
        const response = await capturePage.goto(target.href, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        requireCapture(
          response?.ok(),
          "Requested route did not return success",
        );
        const actual = new URL(capturePage.url());
        requireCapture(
          actual.origin === target.origin &&
            actual.pathname === target.pathname &&
            actual.search === target.search,
          "Requested route origin/path/query changed; preserve the actual unavailable/denied result",
        );
        if (target.pathname === "/login")
          await capturePage
            .getByRole("button", { name: /^(Log in|Sign in)$/ })
            .waitFor({ state: "visible", timeout: 30000 });
        else
          await capturePage
            .locator(".clinic-shell")
            .waitFor({ state: "visible", timeout: 30000 });
        if (target.pathname === "/clinic")
          await capturePage
            .getByRole("table", { name: "Clinic patient tracking board" })
            .waitFor({ state: "visible", timeout: 30000 });
        else if (target.pathname !== "/login") {
          await waitForRouteDataState(capturePage, route);
          const readySelector =
            fixture.capture_ready_selectors?.[route] ||
            fixture.capture_ready_selectors?.[target.pathname];
          requireCapture(
            typeof readySelector === "string" && readySelector.length > 0,
            "Provide a fixture capture_ready_selectors entry for this clinic route; shell visibility is not task readiness",
          );
          await capturePage
            .locator(readySelector)
            .waitFor({ state: "visible", timeout: 30000 });
        }
        await capturePage.evaluate(() => document.fonts.ready);
        const name =
          String(index + 1).padStart(3, "0") +
          "-route-" +
          String(routeIndex + 1).padStart(2, "0") +
          "-" +
          viewport.width +
          "x" +
          viewport.height +
          ".png";
        await capturePage.screenshot({
          path: join(output, name),
          animations: "disabled",
        });
        files.push(name);
        const observation = await captureGeometry(capturePage);
        requireCapture(
          observation.viewport.width === viewport.width &&
            observation.viewport.height === viewport.height &&
            observation.viewport.dpr === 1,
          "Actual viewport does not match the declared capture",
        );
        report.captures.push({ route, screenshot: name, observation });
      }
    phase = "final guards";
    report.source_after = captureSource(selected.expectedHead);
    report.build_after = await captureBuild(baseUrl, selected.expectedHead);
    report.served_sources_after = await captureServedSources(
      baseUrl,
      selected.expectedHead,
      sourceFiles,
    );
    requireCapture(
      sha256(readFileSync(resolve(root, selected.authorizedFixture))) ===
        report.inputs.fixture_sha256 &&
        sha256(readFileSync(resolve(root, selected.databaseProof))) ===
          report.inputs.database_proof_sha256,
      "Capture inputs changed during observation",
    );
    requireCapture(
      Date.now() - Date.parse(proof.generated_utc) <= 15 * 60 * 1000,
      "Trusted database proof expired during capture; preserve this incomplete evidence",
    );
    requireCapture(
      report.domain_mutations_blocked.length === 0 &&
        report.browser_errors.length === 0,
      "Capture observed a browser error or blocked domain mutation",
    );
    report.outcome = "captured";
  } catch (error) {
    report.outcome = "failed";
    report.failure = { phase, message: error.message };
    process.exitCode = 1;
  } finally {
    if (browser)
      await browser.close().catch((error) => {
        report.outcome = "failed";
        report.failure ||= { phase: "browser close", message: error.message };
        process.exitCode = 1;
      });
    report.finished_utc = new Date().toISOString();
    report.total_ms = performance.now() - started;
    writeFileSync(join(output, "report.json"), canonicalJson(report), {
      flag: "wx",
    });
    files.push("report.json");
    const manifest = {
      schema: "authorized-browser-bundle-v1",
      files: files.sort().map((name) => {
        const bytes = readFileSync(join(output, name));
        return { name, bytes: bytes.length, sha256: sha256(bytes) };
      }),
    };
    const manifestBytes = canonicalJson(manifest);
    writeFileSync(join(output, "manifest.json"), manifestBytes, { flag: "wx" });
    process.stdout.write(
      canonicalJson({
        outcome: report.outcome,
        evidence_directory: output,
        manifest_sha256: sha256(manifestBytes),
        failure: report.failure || null,
      }),
    );
  }
}

async function waitForRouteDataState(page, route) {
  if (new URL(route, base).pathname !== "/clinic/work") return;
  await page.waitForFunction(
    () => {
      const text = document.querySelector("main")?.textContent || "";
      return (
        !text.includes("Updating work queues…") &&
        !text.includes("Loading work inbox…")
      );
    },
    undefined,
    { timeout: 35_000 },
  );
}

const selected = options(process.argv.slice(2));
if (selected.help) {
  help();
  process.stdout.write(
    "\nGuarded capture (existing managed stack; no startup/reset):\n  --authorized-fixture <json> --expected-head <full revision>\n  --database-proof <json> --evidence-dir <fresh ignored tmp/outputs path>\n  --viewport <WIDTHxHEIGHT[,WIDTHxHEIGHT]>\n  --routes <comma-separated paths or JSON array> (optional; default --route)\n  --locale <name> --timezone <IANA name> (defaults: en-US, UTC)\n  --artifact-map <json> (optional explicit evidence array: path, source_head, evidence_type, source_paths)\n\nGuarded mode records observations, unavailable/disabled states and hashes; it does not establish domain authorization/persistence or sticky-scroll acceptance.\n",
  );
  process.exit(0);
}
if (!selected.route.startsWith("/") || selected.route.startsWith("//"))
  fail("--route must be a same-origin absolute path");
if (!allowedPortals.has(selected.portal))
  fail("--portal must be clinic, launch, owner, or patient");
if (
  !selected.authorizedFixture &&
  !new Set(["desktop", "tablet", "phone"]).has(selected.viewport)
)
  fail("--viewport must be desktop, tablet, or phone");
const base = new URL(selected.baseUrl);
if (
  !["127.0.0.1", "localhost"].includes(base.hostname) ||
  base.protocol !== "http:"
)
  fail("--base-url must be loopback HTTP");

if (selected.authorizedFixture) {
  await runAuthorizedCapture(selected, base);
  process.exit(process.exitCode || 0);
}
if (
  !selected.authorizedFixture &&
  ([
    selected.expectedHead,
    selected.databaseProof,
    selected.evidenceDir,
    selected.routes,
    selected.artifactMap,
    selected.sourceFiles,
  ].some(Boolean) ||
    selected.locale !== "en-US" ||
    selected.timezone !== "UTC")
)
  fail(
    "Partial guarded capture options are forbidden; supply --authorized-fixture and every required guard",
  );

if (selected.start) {
  const started = spawnSync("ruby", ["bin/dev", "start", "--no-browser"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      APPLY_API_READINESS_TIMEOUT:
        process.env.APPLY_API_READINESS_TIMEOUT || "120",
      APPLY_WEB_READINESS_TIMEOUT:
        process.env.APPLY_WEB_READINESS_TIMEOUT || "120",
    },
  });
  if (started.status !== 0)
    fail("the managed development stack did not become ready");
}

const stamp = new Date()
  .toISOString()
  .replaceAll(":", "-")
  .replaceAll(".", "-");
const screenshot = resolve(
  root,
  selected.screenshot ||
    `outputs/browser-smoke/${stamp}-${selected.viewport}.png`,
);
mkdirSync(dirname(screenshot), { recursive: true });

const channel =
  process.env.PLAYWRIGHT_CHANNEL ||
  (process.platform === "win32" ? "msedge" : "chrome");
const browser = await chromium.launch({ channel, headless: !selected.headed });
try {
  const viewport =
    selected.viewport === "phone"
      ? { width: 390, height: 844 }
      : selected.viewport === "tablet"
        ? { width: 1024, height: 768 }
        : { width: 1440, height: 1000 };
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const failures = [];
  const requestStarts = new Map();
  const apiOutcomes = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      requestStarts.set(request, Date.now());
  });
  page.on("response", (response) => {
    const request = response.request();
    if (!requestStarts.has(request)) return;
    apiOutcomes.push({
      path: new URL(response.url()).pathname,
      status: response.status(),
      duration_ms: Date.now() - requestStarts.get(request),
    });
    requestStarts.delete(request);
  });
  page.on("requestfailed", (request) => {
    if (!requestStarts.has(request)) return;
    apiOutcomes.push({
      path: new URL(request.url()).pathname,
      failure: request.failure()?.errorText || "request failed",
      duration_ms: Date.now() - requestStarts.get(request),
    });
    requestStarts.delete(request);
  });
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  await page.goto(
    new URL(`/login?next=${encodeURIComponent(selected.route)}`, base).href,
    { waitUntil: "domcontentloaded" },
  );
  const visibleLogin = async () => {
    const account = await page.evaluate(
      ({ profile }) =>
        fetch("/api/csrf", { credentials: "same-origin" })
          .then((response) => response.json())
          .then((payload) => {
            const accounts = payload.development_accounts || [];
            return (
              accounts.find((candidate) => candidate.id === profile) ||
              accounts.find(
                (candidate) =>
                  candidate.account_type === "employee" &&
                  candidate.label === "Clinic Administrator",
              ) ||
              null
            );
          }),
      { profile: selected.profile },
    );
    if (!account)
      return {
        status: 422,
        body: {
          error: `No available development account matches ${selected.profile}`,
        },
        profile: null,
      };
    const waitForEnabled = async (locator) => {
      for (let attempt = 0; attempt < 150; attempt += 1) {
        if (await locator.isEnabled()) return;
        await page.waitForTimeout(100);
      }
      fail("a development selector did not become enabled");
    };
    const chooseOption = async (label) => {
      const options = page
        .getByRole("option")
        .filter({ hasNotText: /^Select / });
      const target = label
        ? options.filter({ hasText: label }).first()
        : options.first();
      await target.waitFor({ state: "visible", timeout: 15000 });
      await target.click();
    };
    const organization = page.getByRole("combobox", {
      name: "Organization",
      exact: true,
    });
    if (await organization.count()) {
      await waitForEnabled(organization);
      await organization.click();
      await chooseOption(account.organization?.name);
      const clinic = page.getByRole("combobox", {
        name: "Clinic",
        exact: true,
      });
      await waitForEnabled(clinic);
      await clinic.click();
      await chooseOption(account.clinic?.name);
      const location = page.getByRole("combobox", {
        name: "Location",
        exact: true,
      });
      await waitForEnabled(location);
      await location.click();
      await chooseOption(account.locations?.[0]?.name);
    }
    const accountSelector = page.getByRole("combobox", {
      name: /Select .* account/,
    });
    await waitForEnabled(accountSelector);
    await accountSelector.click();
    await page
      .getByRole("option", { name: account.label, exact: true })
      .click();
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    try {
      await page.waitForURL((url) => url.pathname !== "/login", {
        // The client allows 30 seconds for an explicit API outcome.
        timeout: 35_000,
        waitUntil: "domcontentloaded",
      });
    } catch (error) {
      const visibleError = await page
        .getByRole("alert")
        .allTextContents()
        .catch(() => []);
      fail(
        `visible login did not navigate: ${JSON.stringify({
          current_path: new URL(page.url()).pathname,
          alerts: visibleError,
          api_outcomes: apiOutcomes,
          pending_api: [...requestStarts.keys()].map(
            (request) => new URL(request.url()).pathname,
          ),
        })}; ${error.message}`,
      );
    }
    return { status: 201, body: {}, profile: account.id };
  };
  const login = selected.uiLogin
    ? await visibleLogin()
    : await page.evaluate(
        async ({ profile, portal }) => {
          const csrfResponse = await fetch("/api/csrf", {
            credentials: "same-origin",
          });
          const csrf = await csrfResponse.json();
          const accounts = csrf.development_accounts || [];
          const account =
            accounts.find((candidate) => candidate.id === profile) ||
            (profile === "clinic-administrator"
              ? accounts.find(
                  (candidate) =>
                    candidate.account_type === "employee" &&
                    candidate.label === "Clinic Administrator",
                )
              : null);
          if (!account) {
            return {
              status: 422,
              body: {
                error: `No available development account matches ${profile}`,
              },
              profile: null,
            };
          }
          const locations = account.locations || [];
          const scope =
            account.account_type !== "omni" &&
            account.clinic &&
            locations.length > 0
              ? { practice_id: account.clinic.id, site_id: locations[0].id }
              : {};
          const response = await fetch("/api/development_session", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrf.csrf_token,
            },
            body: JSON.stringify({ profile: account.id, portal, ...scope }),
          });
          return {
            status: response.status,
            body: await response.json(),
            profile: account.id,
          };
        },
        { profile: selected.profile, portal: selected.portal },
      );
  if (login.status !== 201)
    fail(
      `development login returned HTTP ${login.status}: ${login.body?.error || "unknown response"}`,
    );
  failures.length = 0;
  const routes = selected.matrix
    ? [
        "/clinic",
        "/clinic/schedule",
        "/clinic/work",
        "/clinic/billing",
        "/clinic/inventory",
        "/clinic/workforce",
        "/clinic/telehealth",
      ]
    : [selected.route];
  const observations = [];
  for (const [index, route] of routes.entries()) {
    failures.length = 0;
    const response = await page.goto(new URL(route, base).href, {
      // Clinic pages poll while visible, so network-idle is not a stable
      // readiness signal. The route response plus visible main content is the
      // bounded smoke contract; individual data states are rendered by the
      // page itself.
      waitUntil: "domcontentloaded",
    });
    if (!response?.ok())
      fail(`${route} returned HTTP ${response?.status() || "unknown"}`);
    if (new URL(page.url()).pathname === "/login")
      fail(`${route} redirected back to login`);
    await page
      .locator("main")
      .first()
      .waitFor({ state: "visible", timeout: 15000 });
    if (selected.portal === "clinic") {
      await page.waitForFunction(
        () =>
          document.querySelector("main h1, main [role=heading]") ||
          document.querySelector(
            '[role="dialog"][aria-labelledby="location-picker-title"]',
          ),
        undefined,
        { timeout: 60000 },
      );
      const locationPicker = page.getByRole("dialog", {
        name: "Choose your location",
      });
      if (await locationPicker.isVisible()) {
        await locationPicker
          .getByRole("list", { name: "Available locations" })
          .locator('[role="button"]')
          .first()
          .click();
      }
    }
    try {
      await page
        .locator("main h1:visible, main [role=heading]:visible")
        .first()
        .waitFor({ state: "visible", timeout: 60000 });
    } catch (error) {
      await page.screenshot({ path: screenshot, fullPage: true });
      fail(
        `${route} did not render a heading: ${JSON.stringify({
          url: page.url(),
          main: (await page.locator("main").first().textContent())?.slice(
            0,
            600,
          ),
          body: (await page.locator("body").textContent())?.slice(0, 900),
          screenshot,
          errors: failures,
          api_outcomes: apiOutcomes,
          pending_api: [...requestStarts.keys()].map(
            (request) => new URL(request.url()).pathname,
          ),
        })}; ${error.message}`,
      );
    }
    try {
      await waitForRouteDataState(page, route);
    } catch (error) {
      fail(
        `${route} did not settle: ${JSON.stringify({
          api_outcomes: apiOutcomes,
          pending_api: [...requestStarts.keys()].map(
            (request) => new URL(request.url()).pathname,
          ),
        })}; ${error.message}`,
      );
    }
    const routeScreenshot = selected.matrix
      ? screenshot.replace(
          /\.png$/,
          `-${String(index + 1).padStart(2, "0")}.png`,
        )
      : screenshot;
    await page.screenshot({ path: routeScreenshot, fullPage: true });
    if (failures.length)
      fail(`${route} reported errors: ${[...new Set(failures)].join(" | ")}`);
    const dataState =
      new URL(route, base).pathname === "/clinic/work"
        ? await page.evaluate(() => {
            const main = document.querySelector("main");
            const text = main?.textContent || "";
            return {
              settled:
                !text.includes("Updating work queues…") &&
                !text.includes("Loading work inbox…"),
              source_warning: text.includes(
                "Some inbox sources are unavailable",
              ),
              item_count: Number(/(\d+) items? shown/.exec(text)?.[1] ?? 0),
            };
          })
        : undefined;
    observations.push({
      route,
      screenshot: routeScreenshot,
      data_state: dataState,
    });
  }
  process.stdout.write(
    `${JSON.stringify({ routes: observations, profile: login.profile, portal: selected.portal, viewport: selected.viewport, api_outcomes: apiOutcomes })}\n`,
  );
  await context.close();
} finally {
  await browser.close();
}
