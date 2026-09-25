# Investor demo login and Omni organization setup — 2026-09-24

## Requested scope and implementation

The founder requested account tools as the default login locally and on aimetaclinic.com for an investor demonstration, preserving “Streamline your practice. Scale your organization.” The Clinic organization selector now offers New organization, organization/clinic/location names, and a fixed Omni account. Creation is transactional and repeat submissions with the same names reopen the saved workspace. Omni can select any existing clinic/location and passes role-name checks as well as atomic permission checks.

Application commit: `6095610d674a0e9b3b91a8b8eb21b02aa9890592`. Release preflight correction: `72244f46fcd7e70f49248e7b4b2dc0301f6fad7b`.

Hosted workspace requests use the existing isolated `apply_guided_demo` backend and demo cookie. The ordinary database retains normal authentication and denies development shortcuts. No records were copied from the local database. The interface uses existing Material UI TextField, Select, MenuItem, ToggleButtonGroup and Button components; the official TextField documentation was consulted through MUI MCP.

## Local verification

- New-organization and psychotherapy-access integration tests: 7 tests, 76 assertions passed, including blank-name rollback, repeat creation, isolated-hosted access and ordinary-database denial.
- Existing development-login regression: 11 tests, 83 assertions passed.
- Omni role-switch regression after repairing the role-name check: 1 test, 46 assertions passed.
- Frontend related suite: 45 files, 370 tests passed. TypeScript, production bundle, Rails eager loading and changed-file RuboCop passed.
- Browser walkthrough created Investor Walkthrough Group, Investor Walkthrough Clinic and Main location, entered with Omni, and retained the organization/location after reload. The login headline and desktop/390px layout were inspected.
- The broader 139-test backend selection was stopped at the verification checkpoint after identifying the Omni role-name failure. The failure was fixed and its focused regression passed; the full selection is not claimed as passing.
- Changed frontend formatting passed except the existing compact `public/launch.css` formatting warning. The legacy stylesheet was not broadly reformatted. Scoped Git diff and release Bash/Python syntax checks passed.

## Hosted release progress

The first release attempt stopped before activation because the non-root Nginx preflight lacked the runtime's `/tmp` filesystem. The release check was corrected to use `--tmpfs /tmp`, verified locally, committed and pushed. The retry uses matching API/web images from `72244f46`; hosted completion is pending at this checkpoint.

The `72244f46` attempt backed up and restore-checked both databases, downloaded a verified DPAPI-encrypted recovery archive to the owner's Secure Files folder, and migrated both databases. It rolled the images back after an immediate `/up` check returned 502 while Rails was starting; migrations remained applied. The prior images subsequently returned `/up` 200. Commit `36a1b541` adds a bounded readiness wait for both ordinary and isolated-demo APIs before verification. Its release retry is pending at this checkpoint.

The `36a1b541` attempt passed readiness, then rolled back because the verifier referenced a removed `/opt/certbot/bin/python`. The server's `/usr/bin/python3` and requests 2.25.1 were verified. Commit `9158ca22` uses that interpreter and checks its dependency before activation. Concurrent investor-page edits appeared in `apps/web/src/App.tsx`; they were preserved, and a clean checkout of `9158ca22` was selected for the next release.

These are synthetic demonstration checks, not clinical, operational, security or production acceptance.

## Hosted completion

On 2026-09-24 Central time, the release command completed successfully for `9158ca2255002bd833bb11ee0882b5aa3dccc57a` from a clean checkout. Matching API/web images were activated. Both databases were backed up and restore-checked, and a verified DPAPI-encrypted recovery archive was retained in the owner's Secure Files folder. The readiness and verification steps passed without rollback.

The hosted verifier passed HTTPS and health checks, ordinary authentication and CSRF/anonymous denial, ordinary development-shortcut denial, concurrent context reads and logout. On the isolated demo backend it passed Omni availability, organization creation and persisted location, plus sandbox registration, creation, location switching, persistence and reset.

A browser walkthrough at https://aimetaclinic.com/login confirmed the exact streamlining headline, default development tools, hidden credential form and New organization inputs. It created Investor Meeting Organization / Investor Meeting Clinic / Main location, entered the clinic workspace and retained all three values after a page reload. The new clinic correctly starts with no visits. Existing populated demo clinics remain available through the organization and clinic selectors.

Concurrent investor-page work was excluded from this deployed revision. These checks establish the requested synthetic demo entry and persistence, not a complete clinical journey or production acceptance.
