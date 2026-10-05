import { createServer, transformWithOxc } from "vite";
import { it } from "vitest";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
const evidence = resolve(root, "../../tmp/clinic-anchor-evidence");
mkdirSync(evidence, { recursive: true });
const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
const hooks = app.slice(
  app.indexOf("  const [route, setRoute]"),
  app.indexOf("  const home = route.path"),
);
const workspace = readFileSync(
  resolve(root, "src/features/clinic/Workspace.tsx"),
  "utf8",
);
const begin = workspace.indexOf(
  "                  onClick={(event) => {",
  workspace.indexOf("inert={selectingSiteId"),
);
const click = workspace
  .slice(begin, workspace.indexOf("\n                >", begin))
  .trim();
const entry = "\0anchor-fixture.tsx";
const server = await createServer({
  configFile: false,
  root,
  cacheDir: resolve(evidence, "cache"),
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "clinic-anchor-validation",
      enforce: "pre",
      async transform(code, id) {
        if (id === entry)
          return await transformWithOxc(code, "anchor-fixture.tsx");
      },
      resolveId(id) {
        if (id === "/anchor-fixture.tsx") return entry;
      },
      load(id) {
        if (id !== entry) return;
        return `import React, {useState,useRef,useCallback,useEffect,useMemo} from 'react';
    import {createRoot} from 'react-dom/client';
    import {clinicRoute,clinicRouteHref,clinicTarget,confirmClinicNavigation,scrollToClinicAnchor} from '/src/features/clinic/clinicNavigation.tsx';
    import {ClinicNavigation} from '/src/features/clinic/Workspace.tsx';
    function Fixture() {
      ${hooks}
      const [loaded,setLoaded]=useState(false);
      useEffect(()=>{setLoaded(false); const timer=setTimeout(()=>setLoaded(true),180); return ()=>clearTimeout(timer)},[route.path,route.search]);
      return <div ${click}>
        <aside style={{position:'fixed',width:200,top:0,left:0,height:'100vh',overflow:'auto'}}><ClinicNavigation path={route.path} capabilities={{}}/></aside>
        <main style={{marginLeft:216}}>
          <button onClick={()=>navigate('/clinic/operations?site=7#connectors-transmissions')}>Query and anchor</button>
          <button onClick={()=>navigate('/clinic')}>Clear scope route</button>
          <button onClick={()=>{window.blocked=true; blockerRef.current.add(()=> 'Unsaved synthetic work')}}>Block navigation</button>
          <h1>Synthetic ${"${route.path}"}</h1>
          {route.path==='/clinic/operations' && loaded && <><div style={{height:3864}}>Synthetic operations content</div><section id='connectors-transmissions'><h2>Connectors &amp; transmissions</h2><p>Read-only synthetic anchor destination</p><div style={{height:900}}/></section></>}
        </main>
      </div>
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);`;
      },
      configureServer(s) {
        s.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith("/clinic")) return next();
          res.setHeader("Content-Type", "text/html");
          res.end(
            '<div id="root"></div><script type="module" src="/@id/__x00__anchor-fixture.tsx"></script>',
          );
        });
      },
    },
  ],
});
// Run the actual ClinicApplication routing hooks and Workspace click handler in
// a synthetic delayed-content fixture; no APIs or connections are changed.
it("scrolls advertised clinic anchors after loading and preserves history, queries and guards", async () => {
  let browser;
  const results = [];
  try {
    await server.listen();
    const origin = server.resolvedUrls.local[0].replace(/\/$/, "");
    browser = await chromium.launch({
      executablePath:
        process.env.BROWSER_EXECUTABLE_PATH || "/usr/bin/chromium",
      headless: true,
    });
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const link = page.getByRole("link", {
        name: "Connectors & transmissions",
        exact: true,
      });
      async function activateLink() {
        if (!(await link.isVisible()))
          await page
            .getByRole("button", { name: "Open clinic menu", exact: true })
            .click();
        await link.click();
      }
      async function targetVisible(label) {
        await page.waitForFunction(() => {
          const el = document.getElementById("connectors-transmissions");
          return (
            el &&
            el.getBoundingClientRect().top >= -1 &&
            el.getBoundingClientRect().top < 200
          );
        });
        assert.equal(new URL(page.url()).hash, "#connectors-transmissions");
        results.push({
          width,
          label,
          url: page.url(),
          y: await page
            .locator("#connectors-transmissions")
            .evaluate((el) => el.getBoundingClientRect().top),
          scrollY: await page.evaluate(() => scrollY),
        });
      }
      await page.goto(origin + "/clinic/growth");
      await page.waitForTimeout(1000);
      await activateLink();
      await page.waitForTimeout(500);
      await targetVisible("different route / delayed content");
      const historyLength = await page.evaluate(() => history.length);
      await page.evaluate(() => scrollTo(0, 0));
      await activateLink();
      await targetVisible("repeat activation");
      assert.equal(await page.evaluate(() => history.length), historyLength);
      await page.goBack();
      assert.equal(new URL(page.url()).pathname, "/clinic/growth");
      await page.goForward();
      await targetVisible("forward");
      await page.getByRole("button", { name: "Query and anchor" }).click();
      await targetVisible("query plus anchor");
      assert.equal(new URL(page.url()).search, "?site=7");
      await page.reload();
      await targetVisible("direct load / query retained");
      assert.equal(new URL(page.url()).search, "?site=7");
      await page.screenshot({ path: resolve(evidence, `anchor-${width}.png`) });
      await page.getByRole("button", { name: "Clear scope route" }).click();
      assert.equal(new URL(page.url()).hash, "");
      assert.equal(new URL(page.url()).search, "");
      await page.getByRole("button", { name: "Block navigation" }).click();
      page.on("dialog", (d) => d.dismiss());
      await activateLink();
      assert.equal(new URL(page.url()).pathname, "/clinic");
      assert.deepEqual(errors, []);
      await page.close();
    }
    writeFileSync(
      resolve(evidence, "results.json"),
      JSON.stringify(results, null, 2),
    );
    console.log(
      JSON.stringify(
        { passed: true, assertedVisits: results.length, results },
        null,
        2,
      ),
    );
  } finally {
    await browser?.close();
    await server.close();
  }
}, 120000);
