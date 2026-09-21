# Joshua Rice — personal website

Standalone static portfolio, separate from the Meta Clinic application. Serve this directory as the web root on any static host. No build, package installation, database, or API configuration is required.

## Preview

From this directory:

```sh
python -m http.server 4178 --bind 127.0.0.1
```

Open http://127.0.0.1:4178. `index.html` is the portfolio; `resume.html` is the complete web résumé. Its Print / save as PDF button uses the browser print dialog with a print stylesheet.

## Content and boundaries

Career details and public contact links were transcribed and lightly edited from the existing owner résumé in `tmp_resume_inspect/word/document.xml`. The homepage highlights a selection of that work. The résumé's unsupported aggregate claim of five years was replaced with a description of experience; employer dates are preserved. Project descriptions are résumé-derived, not independent verification of those other projects. The Meta Clinic illustration is a labeled diagram, not a product screenshot or fabricated live dashboard.

The demo link is https://aimetaclinic.com/demo. Google Fonts supplies Manrope and DM Sans; local sans-serif fallback keeps the site usable when that service is unavailable. All content and navigation work without JavaScript; only the print button uses JavaScript. There are no tracking scripts, contact-form submissions, cookies, embedded demos, or credentials.

Joshua authorized public publication on September 20, 2026. The chosen URL is https://aimetaclinic.com/joshua/. Canonical metadata points to that address. The downloadable `Joshua_Rice_resume_2026.docx` preserves the newer Desktop résumé's career details, adds the portfolio and corrected GitHub link, and removes semester counts. Its two-page layout was rendered through Microsoft Word and visually inspected; the packaged LibreOffice renderer was unavailable on Windows.

## Static deployment

The existing Lightsail HTTPS nginx server includes `/etc/nginx/snippets/joshua-portfolio.conf`, sourced from `deploy-nginx.conf`. Only `/joshua` and `/joshua/` are added; application proxies, images, credentials, and databases are outside this deployment.

Publish an explicit allowlist from one committed revision: `index.html`, `resume.html`, `styles.css`, `resume.js`, `favicon.svg`, and `Joshua_Rice_resume_2026.docx`. Do not publish this README, deployment configuration, the repository root, or other files. Store each release under `/var/www/joshua-portfolio/releases/<commit>/joshua/`, and point `/var/www/joshua-portfolio/current` at that release directory.

Before changing nginx, retain its existing site configuration and the previous static symlink target in a timestamped backup under `/var/backups/joshua-portfolio/`. Run `nginx -t` before reloading. On failure, restore the saved configuration/snippet and previous symlink before testing and reloading again. Keep old releases for recovery. Static-only publication does not run application migrations or restart containers.

Verify HTTPS redirects, both HTML pages, styles/scripts/favicon, the Word download hash, missing-file 404 behavior, and `/demo` and `/up`. Confirm the public layout in a browser. Later app deployments must preserve this nginx include and static directory.
