# Joshua Rice â€” personal website

Standalone static portfolio, separate from the Meta Clinic application. Serve this directory as the web root on any static host. No build, package installation, database, or API configuration is required.

## Preview

From this directory:

```sh
python -m http.server 4178 --bind 127.0.0.1
```

Open http://127.0.0.1:4178. `index.html` is the portfolio; `resume.html` is the complete web rÃ©sumÃ©. Its Print / save as PDF button uses the browser print dialog with a print stylesheet.

## Content and boundaries

Career details and public contact links were transcribed and lightly edited from the existing owner rÃ©sumÃ© in `tmp_resume_inspect/word/document.xml`. The homepage highlights a selection of that work. The rÃ©sumÃ©'s unsupported aggregate claim of five years was replaced with a description of experience; employer dates are preserved. Project descriptions are rÃ©sumÃ©-derived, not independent verification of those other projects. The Meta Clinic section describes the engineering scope and links to the guided application demo.

The demo link is https://aimetaclinic.com/demo. Google Fonts supplies Manrope and DM Sans; local sans-serif fallback keeps the site usable when that service is unavailable. Content and navigation work without JavaScript. The homepage loads the application-owned `/visit-tracking.js` for first-party page-view reporting in the owner dashboard. It tracks only `/joshua` and `/demo`, respects DNT/GPC, and uses an HTTP-only signed 30-day browser identifier. Analytics stores the canonical path, random event/browser IDs, timestamp and referring hostname, never full URLs, query strings, names, email addresses or IP addresses. The main API owns ingestion for both pages, independent of the isolated demo database. No third-party analytics service is used. The script is unavailable in the standalone preview without the main application, and fails silently there.

Joshua authorized public publication on September 20, 2026. The chosen URL is https://aimetaclinic.com/joshua/. Canonical metadata points to that address. The downloadable `Joshua_Rice_resume_2026.docx` preserves the newer Desktop rÃ©sumÃ©'s career details, adds the portfolio and corrected GitHub link, and removes semester counts. Its two-page layout was rendered through Microsoft Word and visually inspected; the packaged LibreOffice renderer was unavailable on Windows.

## Career positioning evidence (September 21, 2026)

The homepage introduces Joshua with his original `joshua-rice.png` portrait, leads the projects with Meta Clinic, and places the detailed WeInfuse case study last before contact. The image was added in `ec71c0fa`; `60ed12de` removed its hero markup while leaving the asset intact. Third-engineer status, personal contributions, greenfield ownership, and more than $1 billion in product processed are owner-reported career facts, consistent with the supplied resume and his explicit description in this task. They are not independently verified employer metrics. Do not rewrite product processed as revenue or company valuation, or imply sole authorship of the entire platform.

WeInfuse's [current product overview](https://weinfuse.com/infusion-center-software/) and [inventory page](https://weinfuse.com/infusion-center-software/inventory-management/) were checked on September 21, 2026. They support that inventory, billing, patient estimates, and treatment-margin capabilities are still marketed; they do not establish authorship or prove that historical code remains unchanged.

HIPAA knowledge is owner-reported and presented as engineering judgment, not certification or a product compliance determination. The terminology was checked against the [HHS Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html). Technical controls are part of broader administrative, physical, and technical safeguards. No employer security implementation is claimed. This is a personal portfolio, not clinical workflow design; FHIR field mapping is not applicable.

## Static deployment

The existing Lightsail HTTPS nginx server includes `/etc/nginx/snippets/joshua-portfolio.conf`, sourced from `deploy-nginx.conf`. Only `/joshua` and `/joshua/` are added; application proxies, images, credentials, and databases are outside this deployment.

Publish an explicit allowlist from one committed revision: `index.html`, `resume.html`, `styles.css`, `resume.js`, `favicon.svg`, `joshua-rice.png`, `Joshua_Rice_resume_2026.docx`, `assets/agent-office.png`, and `assets/workflow-coverage.png`. Do not publish this README, deployment configuration, the repository root, or other files. Store each release under `/var/www/joshua-portfolio/releases/<commit>/joshua/`, and point `/var/www/joshua-portfolio/current` at that release directory.

Before changing nginx, retain its existing site configuration and the previous static symlink target in a timestamped backup under `/var/backups/joshua-portfolio/`. Run `nginx -t` before reloading. On failure, restore the saved configuration/snippet and previous symlink before testing and reloading again. Keep old releases for recovery. Static-only publication does not run application migrations or restart containers.

Verify HTTPS redirects, both HTML pages, styles/scripts/favicon, the Word download hash, missing-file 404 behavior, and `/demo` and `/up`. Confirm the public layout in a browser. Later app deployments must preserve this nginx include and static directory.


## AI workflow evidence (2026-10-04)

Joshua approved the AI development section and publication after reviewing the local preview. The copy explains the scoped implementation, QA finding, repair, and retest feedback loop, with Joshua retaining product, architecture, and publication decisions. It does not establish unattended release authority or full application acceptance.

The two images are read-only public browser captures from `https://aimetaclinic.com/qa?view=office` on 2026-10-04. The Office image focuses on the shared floor. The coverage image retains the ledger's 95 passed, 8 failed, and 13 blocked results, historical import date, and unavailable release-impact mapping. Recorded QA is not relabeled as a fresh whole-app pass.

The usage figures are transcribed from Joshua's supplied dashboard screenshot: 24.8B lifetime tokens, 2.3B peak tokens, 12h 35m longest task, and 53-day longest/current streak. The reporting tool, interval, and whether it covers other projects were not supplied. They are labeled an owner-supplied snapshot and are not attributed exclusively to Meta Clinic.

Local preview verification at 1440, 390, and 320 pixels found loaded images, no horizontal overflow, and no page JavaScript errors. A separate visual review accepted the local preview. The mechanical design detector ran in degraded regex mode because optional parser modules were unavailable; this does not establish complete accessibility or contrast acceptance. No application tests or full CI pass were claimed.
