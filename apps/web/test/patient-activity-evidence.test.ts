import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser } from "playwright-core";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
const root = fileURLToPath(new URL("..", import.meta.url));
const mocks: Record<string, string> = {
  "../../api/client": `export * from '/src/api/client.ts'; export const api=(...args)=>window.qa.request(...args);`,
  "./Workspace": `export const useClinic=()=>({practice:{id:1},user_id:1,authorization_generation:1,sites:[],capabilities:{patients_write:true}});`,
  "./clinicNavigation": `const registerBlocker=()=>()=>{}; export const useClinicNavigation=()=>({registerBlocker});`,
};
for (const [file, name] of Object.entries({
  CareFlow: "PatientSupport",
  PatientClinicalHistory: "PatientClinicalHistory",
  IntakeConsentEvidence: "IntakeConsentEvidence",
  PatientLabReports: "PatientLabReports",
  PatientDocumentProvenance: "PatientDocumentProvenance",
}))
  mocks[`./${file}`] = `export const ${name}=()=>null;`;
mocks["../api/client"] = mocks["../../api/client"];
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
import {Patients} from '/src/features/clinic/Patients.tsx';
const patient={id:77,display_name:'Synthetic activity patient',reference:'QA-ACTIVITY',demographics:{},contacts:[],emergency_contacts:[],social_histories:[]};
const activity={coverage:[{source:'appointments',label:'Appointments',status:'included'},{source:'notes',label:'Encounter notes',status:'not_authorized'},{source:'care_coordination',label:'Care coordination',status:'included'}],has_more:true,entries:[
{id:1,source:'appointments',section:'Appointments',record_type:'Clinic::Appointment',record_id:88,event:'create',actor_reference:'user:901',occurred_at:'2026-10-01T01:00:00Z',changed_fields:['starts_at']},
{id:2,source:'appointments',section:'Appointments',record_type:'Clinic::Appointment',record_id:88,event:'update',actor_reference:'user:902',occurred_at:'2026-10-01T02:00:00Z',changed_fields:['status']} ]};
let coordination={coordination:{id:1,patient_id:77,revision:1,payload:Object.fromEntries(['primary_care','specialists','pharmacy'].map(k=>[k,{state:'none',entries:[]}])),recorded_at:'2026-10-01T00:00:00Z',recorded_by_membership_id:9},can_write:true,limits:{primary_care:1,specialists:20,pharmacy:1}};
window.qa={requests:[],mode:'success',request(path,options={}){
 this.requests.push({path,method:options.method||'GET'});
 if(path==='/api/clinic/patients/77/care_coordination'){
  if(options.method==='POST'){
   if(this.mode==='failure')return Promise.reject(new Error('Synthetic unconfirmed response'));
   coordination={...coordination,coordination:{...coordination.coordination,id:2,revision:2,payload:options.body.care_coordination.payload}};
   activity.entries.unshift({id:2,source:'care_coordination',section:'Care coordination revision 2',record_type:'Clinic::Care::PatientCareCoordinationRevision',record_id:2,event:'recorded',actor_reference:'membership:9',occurred_at:'2026-10-01T03:00:00Z',changed_fields:[]});
  }return Promise.resolve(structuredClone(coordination));
 }
 if(path==='/api/clinic/patients/77')return Promise.resolve({patient,activity_history:structuredClone(activity),notes:[]});
 if(path.startsWith('/api/clinic/patients/77/encounters?'))return Promise.resolve({encounters:[]});
 throw new Error('Unexpected synthetic request '+path);
}};
createRoot(document.getElementById('root')).render(React.createElement(Patients,{id:'77'}));`;
let server: ViteDevServer, browser: Browser, base: string;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root,
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "synthetic-activity",
        enforce: "pre",
        resolveId(source, importer) {
          if (source === "/qa-entry.tsx") return "\0qa-entry";
          if (importer?.includes("/src/") && source in mocks)
            return "\0qa-mock:" + encodeURIComponent(source);
        },
        load(id) {
          if (id === "\0qa-entry") return entry;
          if (id.startsWith("\0qa-mock:"))
            return mocks[decodeURIComponent(id.slice(9))];
        },
        configureServer(vite) {
          vite.middlewares.use((req, res, next) => {
            if (req.url === "/qa") {
              res.setHeader("Content-Type", "text/html");
              res.end(
                '<div id="root"></div><script type="module" src="/qa-entry.tsx"></script>',
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
      ["/usr/bin/chromium", chromium.executablePath()].find(existsSync),
    args: ["--no-sandbox"],
  });
}, 60000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
});
it.each(["#144", "#243"])(
  "%s renders action, actor, timestamp and source record identity",
  async () => {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(base + "qa");
    await page.waitForFunction(() => Boolean((window as any).qa));
    await page
      .getByRole("button", { name: "Patient activity", exact: true })
      .click();
    for (const label of ["Appointments · Created", "Appointments · Updated"])
      expect(await page.getByText(label, { exact: true }).isVisible()).toBe(
        true,
      );
    expect(
      await page.getByText("Record: Appointment #88", { exact: true }).count(),
    ).toBe(2);
    expect(
      await page.getByText(/Actor reference: user:902/).textContent(),
    ).toContain("2026");
    expect(
      await page
        .getByText("Encounter notes: Not available with your access", {
          exact: true,
        })
        .isVisible(),
    ).toBe(true);
    expect(
      await page.getByText(/Showing the latest 25 events/).isVisible(),
    ).toBe(true);
    await page.close();
  },
  15000,
);
it.each(["success", "failure"])(
  "#244 refreshes activity only after confirmed save (%s)",
  async (mode) => {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(base + "qa");
    await page
      .getByRole("button", { name: "Edit care coordination", exact: true })
      .click();
    await page.evaluate((mode) => ((window as any).qa.mode = mode), mode);
    await page
      .getByRole("button", { name: "Save coordination", exact: true })
      .click();
    if (mode === "success") {
      await page.getByText(/^Revision 2 · Recorded/).waitFor();
      await page
        .getByRole("button", { name: "Patient activity", exact: true })
        .click();
      await page
        .getByText("Care coordination revision 2 · Recorded", { exact: true })
        .waitFor();
      expect(
        await page.getByText(/Actor reference: membership:9/).isVisible(),
      ).toBe(true);
      expect(
        await page.getByText("Appointments · Updated", { exact: true }).count(),
      ).toBe(1);
    } else {
      await page
        .getByText("Synthetic unconfirmed response", { exact: true })
        .waitFor();
      expect(
        await page
          .getByText("Care coordination revision 2 · Recorded", { exact: true })
          .count(),
      ).toBe(0);
    }
    const reads = await page.evaluate(
      () =>
        (window as any).qa.requests.filter(
          (r: any) => r.path === "/api/clinic/patients/77",
        ).length,
    );
    expect(reads).toBe(mode === "success" ? 2 : 1);
    await page.close();
  },
  30000,
);
