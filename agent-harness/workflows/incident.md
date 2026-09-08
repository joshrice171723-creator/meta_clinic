# Sensitive-data and incident workflow

## Trigger

Use when patient information, credentials, confidential applicant material, unauthorized access or a plausible security/privacy incident is encountered.

## Immediate actions

1. Stop the affected inspection or tool workflow and prevent further copying or transmission within current authority.
2. Notify the user promptly with a non-sensitive description of the location and issue. Do not repeat the sensitive contents.
3. Preserve existing files, logs, audit/history and timestamps. Record only the minimum non-sensitive facts needed for escalation.
4. Keep independent unaffected work paused only if it could compound the incident; otherwise isolate the blocked path.

## Do not do independently

- Do not delete files, rewrite Git history, purge logs or alter evidence.
- Do not rotate credentials, change access, contact affected people, notify regulators/vendors or make legal conclusions without authorized incident-response direction.
- Do not continue reading suspected PHI merely to finish a review or prove scope.
- Do not upload the material to another tool for classification.

Resume the affected work only after a responsible privacy/security lead or the user supplies a safe, authorized scope. An incident record is not a completed breach assessment.
