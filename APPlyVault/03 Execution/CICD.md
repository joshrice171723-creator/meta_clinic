---
type: operating-guide
status: staging-active-production-activation-pending
updated: 2026-09-03
lifecycle: active
canonical_for: delivery-state-pointer
---
# CICD

Home: [[00 Home]] · Developer docs: [Getting started](../../docs/development/getting-started.md), [Contributing](../../docs/development/contributing.md), [CI](../../docs/development/ci.md) · Architecture: [[Software Architecture]] · Status: [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap) · Evidence: [[Progress Log]]

## Purpose and ownership

This note routes current APPly context; it is not the developer command manual. Developer setup, branches, checks and CI live in [developer documentation](../../docs/development/README.md). Application-specific commands live in [apps/api/README.md](../../apps/api/README.md) and [apps/web/README.md](../../apps/web/README.md). Hosted procedures and environment authority live in [EC2 operations](../../ops/aws/ec2/README.md), [staging and production](../../ops/aws/ec2/environments.md), and [PostgreSQL cutover](../../ops/aws/ec2/postgres-cutover.md). The workflow YAML is the executable CI/delivery authority.

## Current boundary

D-033 keeps one repository with independent React/Vite and Rails/PostgreSQL applications. The frontend owns presentation and same-origin transport; Rails owns sessions, authorization, tenancy, domain workflows and persistence. Release artifacts are a matched API/web pair from one reviewed commit. Source, tests, migrations and runbooks are executable truth; this vault records the rationale, limits and evidence.

Staging PostgreSQL/API/web activation and bounded recovery were verified on 2026-08-31. Production retains its prior arrangement and requires separate cutover, promotion and acceptance authority. CI, local checks, staging review and browser/accessibility review are not interchangeable evidence. Current status and dated outcomes remain in [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap) and [[Progress Log]].

## Release limits

All development and CI fixtures are synthetic. Never place credentials, keys, patient information or real-derived examples in source, notes, logs, images or builds. Do not tunnel local services or deploy from `site/`. A passing build/test is not security, clinical, operational, HIPAA or release acceptance. Follow the applicable release/database playbook and ops runbook before any hosted action; no production change is authorized by this note.

## Stable compatibility anchors

The former developer sections are now [Developer quick start](../../docs/development/getting-started.md), [Daily workflow](../../docs/development/contributing.md), and [What CI does now](../../docs/development/ci.md). Existing links should migrate to those documents; this note intentionally retains the `#Purpose and ownership` and `#Current boundary` headings for vault references during the transition.

## Developer quick start

Use [Getting started](../../docs/development/getting-started.md) for prerequisites and first setup.

## Rails can run locally

The API and frontend run independently on loopback with synthetic data. See [Getting started](../../docs/development/getting-started.md) and the app READMEs.

## Finish activation

Hosted activation is separately authorized and remains governed by the [EC2 runbook](../../ops/aws/ec2/README.md), [environment notes](../../ops/aws/ec2/environments.md), and [PostgreSQL cutover](../../ops/aws/ec2/postgres-cutover.md). Staging evidence does not authorize production.
