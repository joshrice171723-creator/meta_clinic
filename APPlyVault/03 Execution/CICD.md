---
type: operating-guide
status: founder-selected-lightsail-synthetic-demo
updated: 2026-09-23
lifecycle: active
canonical_for: delivery-state-pointer
---
# CICD

Home: [[00 Home]] · Developer docs: [Getting started](../../docs/development/getting-started.md), [Contributing](../../docs/development/contributing.md), [CI](../../docs/development/ci.md) · Architecture: [[Software Architecture]] · Evidence: [[Progress Log]]

## Purpose and ownership

This note routes current delivery context. Developer setup, branches, checks and CI live in [developer documentation](../../docs/development/README.md). Application-specific commands live in [apps/api/README.md](../../apps/api/README.md) and [apps/web/README.md](../../apps/web/README.md). Portable packaging lives in [owner-controlled deployment](../../ops/portable/README.md). Workflow YAML is the executable CI/publication authority; it does not deploy to a host.

## Current boundary

D-033 keeps one repository with independent React/Vite and Rails/PostgreSQL applications. The frontend owns presentation and same-origin transport; Rails owns sessions, authorization, tenancy, domain workflows and persistence. Release artifacts remain a matched API/web pair from one reviewed commit.

The former AWS environments and OIDC delivery path were retired from active source on 2026-09-10 after the founder ended the external working relationship. Their dated observations remain historical evidence only. The founder subsequently selected account ending 9164 for a new $12/month Lightsail synthetic demo. The new HTTPS deployment and its remaining limits are documented in [the Lightsail runbook](../../ops/lightsail/README.md) and [[Progress Log]]. CI, image publication, hosted verification and browser/accessibility review are separate evidence.

## Current publication path

The manual `publish-containers.yml` workflow runs only on `main` with an exact confirmation. It builds the API and web from the same commit and publishes commit-tagged images to the repository owner's GitHub Container Registry using GitHub's short-lived repository token. It has no cloud OIDC permission and performs no deployment.

The 2026-09-23 publish attempt for `9b006747` failed before either job started; GitHub reported an account payment or spending-limit restriction. The [Lightsail runbook](../../ops/lightsail/README.md) now provides a local Docker build/transfer path that does not depend on Actions, plus an optional registry path when publication is available. These scripts are source and local-check evidence; neither path has completed a hosted rollout through the new command.

The provider-neutral Compose package binds to loopback by default. Its environment file and host credentials remain untracked. A new host requires separate owner-controlled account setup, TLS/access design, backup and restore evidence, monitoring, cost controls, and explicit release authorization.

## Release limits

All development and CI fixtures are synthetic. Never place credentials, keys, patient information or real-derived examples in source, notes, logs, images or builds. A passing build/test is not security, clinical, operational, HIPAA or release acceptance. No production change is authorized by this note.

## Rails can run locally

The API and frontend run independently on loopback with synthetic data. See [Getting started](../../docs/development/getting-started.md) and the application READMEs.

## Finish activation

The new Lightsail demo has verified HTTPS, password authentication, anonymous/CSRF denial, application restart and PostgreSQL backup/restore. Deployment remains manual; the current container-publisher attempt is blocked by GitHub billing and pre-existing full CI failures remain unresolved. Long-term off-host backup portability, monitoring and any production or real-data release remain separate work. Do not reuse credentials or access paths from the retired environments.
