---
name: task-trace
description: "Measure and visualize observable Codex task execution. Use only when the user explicitly invokes task-trace or $task-trace, or asks to profile task timing; do not use for application-log changes, CPU profiling, or routine tasks."
---

# Trace observable task work

Measure the current task from trace initialization through finalization. This reports observable agent and tool activity; it cannot recover time before activation, inspect private reasoning, or provide a sampled CPU profile.

## Start

1. Derive a short generic task label that contains no person, patient, credential, protected value, raw prompt, command argument or external-record content.
2. From the repository root, run `bin/task-trace start "LABEL"` and retain the returned absolute JSON path for the rest of the turn.
3. State that tracing has started and that the final timing covers only activity after initialization.

The trace is written incrementally under ignored `tmp/task-traces/`. Do not move it into source, the vault, records or Shortcut.

## Record work

Use these categories: `agent`, `git`, `dependency`, `database`, `server`, `test`, `external`, `wait`, `setup`, or `other`.

- Wrap a shell command with `bin/task-trace span TRACE CATEGORY "SAFE LABEL" -- COMMAND ...`. The trace stores only the supplied label, category, timing and exit status; it does not store the command, arguments, environment or output.
- Around a non-shell tool or other observable interval, run `bin/task-trace begin TRACE CATEGORY "SAFE LABEL"`, retain its span ID, perform the work, then run `bin/task-trace end TRACE SPAN_ID ok`. End it as `failed` or `interrupted` when that is the observed outcome.
- Prefer one meaningful span for a cohesive operation over a span for every trivial read. Use nested tool telemetry when a repository command, such as `bin/dev`, already emits spans into the path named by `APPLY_TASK_TRACE`.
- Never place secrets, credentials, URLs with tokens, database values, user data, complete commands or raw tool output in a span label. Synthetic labels still remain generic.

If trace bookkeeping itself fails, continue the authorized task, disclose the coverage gap and do not invent timing.

## Finish

Before the final response, run `bin/task-trace finish TRACE ok`. Use `failed` when the requested outcome was not achieved and `interrupted` when work stopped early. The command closes unfinished spans as interrupted, renders a self-contained SVG timeline, and prints a duration/category summary.

Report:

- traced wall-clock duration;
- the largest observable categories or critical path;
- meaningful waiting, retries or failures;
- unattributed time and any known coverage gap;
- clickable absolute links to the SVG timeline and JSON trace.

Category totals are exclusive within a parent/child chain. Independent parallel spans may overlap, so category totals are not percentages and need not add up to wall-clock time.

Call the visualization a task timeline or flame-chart-style trace, not a CPU flame graph. Do not expose or speculate about private reasoning content.
