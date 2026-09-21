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

Before public launch, confirm the current résumé, contact/profile links, and intended hosting domain with Joshua. Deploy only this directory, never the repository root. Public deployment, domain configuration, and the hosted site's verification remain separate from local creation. Once a domain is chosen, add absolute canonical and social-preview URLs for that domain.
