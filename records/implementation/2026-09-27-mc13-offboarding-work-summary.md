# MC-13 offboarding work summary

**Date:** 2026-09-27
**Scope:** Show an authorized clinic workforce administrator the active clinical tasks assigned to an employee, grouped by location, before account revocation.

The practice-scoped employment list now includes counts of active assigned tasks by site, without patient or task identifiers. The revoke confirmation shows those counts and explains that revocation leaves task ownership intact; eligible staff can claim the work through the existing clinical queue. The counts describe the employment list when it loaded and can become stale before confirmation.

**Checks:** Ruby syntax passed; scoped RuboCop passed; frontend TypeScript passed; changed-file Prettier passed; `git diff --check` passed. No tests or browser journey ran. MUI MCP documentation tools were unavailable; the existing Material UI `Dialog` composition typechecked against installed dependencies.

**Remaining:** Verify the administrator and denied-role paths, location isolation, revocation, and eligible coverage claim/recovery in one synthetic browser journey. This source change does not establish that journey or transfer tasks automatically.
