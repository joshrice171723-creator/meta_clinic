import {
  Alert,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type {
  AssessmentFollowUpTask,
  AssessmentRevision,
  AsqHistory,
  AsqInstrument,
} from "../../api/contracts";

type Form = Record<string, string>;
type Item = AssessmentRevision["item_responses"][number];
export function asqItems(form: Form): Item[] {
  try {
    return JSON.parse(form._asq_items || "[]") as Item[];
  } catch {
    return [];
  }
}
function protocol(form: Form): Record<string, string> {
  try {
    return JSON.parse(form.follow_up_plan || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
const label = (text: string) => text.replaceAll("_", " ");

export function AsqAdultAssessmentFields({
  instrument,
  form,
  onChange,
  tasks,
  disabled,
}: {
  instrument: AsqInstrument;
  form: Form;
  onChange: (next: Form) => void;
  tasks: AssessmentFollowUpTask[];
  disabled: boolean;
}) {
  const items = asqItems(form);
  const evidence = protocol(form);
  const answer = (id: string) => items.find((item) => item.item_id === id);
  const yes = (id: string) =>
    answer(id)?.state === "answered" && answer(id)?.value === "yes";
  const positive = ["q1", "q2", "q3", "q4"].some(yes);
  function setItem(id: string, value: string) {
    const state = ["declined", "unknown", "not_asked", "unanswered"].includes(
      value,
    )
      ? (value as Item["state"])
      : "answered";
    let next = [
      ...items.filter((item) => item.item_id !== id),
      { item_id: id, state, ...(state === "answered" ? { value } : {}) },
    ];
    if (id === "q4" && value !== "yes")
      next = next.filter((item) => item.item_id !== "attempt_timing");
    if (
      ["q1", "q2", "q3", "q4"].includes(id) &&
      !next.some(
        (item) =>
          ["q1", "q2", "q3", "q4"].includes(item.item_id) &&
          item.value === "yes",
      )
    )
      next = next.filter((item) => item.item_id !== "q5");
    onChange({ ...form, _asq_items: JSON.stringify(next) });
  }
  function setEvidence(key: string, value: string) {
    onChange({
      ...form,
      follow_up_plan: JSON.stringify({
        ...evidence,
        version: instrument.protocol_version,
        [key]: value,
      }),
    });
  }
  const select = (
    id: string,
    title: string,
    choices: { code: string; label: string }[],
  ) => (
    <TextField
      key={id}
      id={`asq-${id}`}
      select
      fullWidth
      label={title}
      disabled={disabled}
      value={answer(id)?.value || answer(id)?.state || "not_asked"}
      onChange={(event) => setItem(id, event.target.value)}
    >
      {choices.map((option) => (
        <MenuItem key={option.code} value={option.code}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
  const responseStates = [
    { code: "not_asked", label: "Not asked" },
    { code: "declined", label: "Declined" },
    { code: "unknown", label: "Unknown" },
    { code: "unanswered", label: "Unanswered" },
  ];
  return (
    <Stack spacing={2}>
      <Typography variant="body2">
        {instrument.name} · {instrument.version}
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button href={instrument.source} target="_blank" rel="noreferrer">
          NIMH screening source
        </Button>
        <Button
          href={instrument.protocol_source}
          target="_blank"
          rel="noreferrer"
        >
          Adult outpatient guide
        </Button>
      </Stack>
      {select("adult_eligibility", "Adult eligibility (18 or older)", [
        { code: "not_asked", label: "Confirmation required" },
        { code: "documented_age", label: "Confirmed from documented age" },
        {
          code: "recorder_attestation",
          label: "I attest the patient is 18 or older",
        },
      ])}
      {instrument.questions
        .filter((question) => question.id !== "q5" || positive || yes("q5"))
        .map((question) =>
          select(
            question.id,
            `${question.id.toUpperCase()}. ${question.label}`,
            [
              ...responseStates,
              ...question.options.map((option) => ({
                code: option,
                label: option === "yes" ? "Yes" : "No",
              })),
            ],
          ),
        )}
      {yes("q4") &&
        select("attempt_timing", "Most recent attempt", [
          { code: "not_asked", label: "Not documented" },
          { code: "within_last_12_months", label: "Within last 12 months" },
          { code: "over_1_year_ago", label: "Over 1 year ago" },
          { code: "unknown", label: "Unknown" },
        ])}
      <Alert severity={yes("q5") ? "error" : positive ? "warning" : "info"}>
        {yes("q5")
          ? "Current suicidal thoughts: urgent safety/full mental health evaluation; do not leave the patient alone, keep them in sight, secure dangerous objects when possible, and notify the medical team. Document actions actually taken below."
          : positive
            ? "Positive responses require the current-thoughts question. A non-acute positive screen prompts a brief suicide safety assessment and clinician disposition. A lifetime-attempt-only exception over one year ago requires explicit clinician documentation."
            : "Unknown, unanswered and declined answers are not negative screens. Adult refusal alone is not a positive screen. Clinical judgment can override a negative screen. Provide crisis resources to every patient."}
      </Alert>
      <Typography variant="subtitle2">
        Clinician response documentation
      </Typography>
      <Typography variant="body2">
        Save in progress to retain screening work. Completed means clinician
        reviewed; it does not establish clinical clearance. Guidance and
        documented actions are separate.
      </Typography>
      <TextField
        select
        label="Brief suicide safety assessment"
        value={evidence.bssa_state || ""}
        disabled={disabled}
        onChange={(event) => setEvidence("bssa_state", event.target.value)}
        fullWidth
      >
        <MenuItem value="">Not documented</MenuItem>
        <MenuItem value="completed">Completed</MenuItem>
        <MenuItem value="declined">Declined by adult</MenuItem>
        <MenuItem value="lifetime_attempt_exception">
          Clinician lifetime-attempt exception
        </MenuItem>
      </TextField>
      <TextField
        select
        label="Clinician disposition"
        value={evidence.disposition || ""}
        disabled={disabled}
        onChange={(event) => setEvidence("disposition", event.target.value)}
        fullWidth
      >
        <MenuItem value="">Not determined</MenuItem>
        {instrument.dispositions.map((option) => (
          <MenuItem key={option.code} value={option.code}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      {[
        [
          "findings",
          "Assessment findings: thoughts/frequency, plan/intent/access to means, past behavior, symptoms, supports/stressors",
        ],
        [
          "disposition_reason",
          "Disposition rationale and other safety concerns",
        ],
        [
          "urgent_actions",
          "Urgent evaluation, observation and team notification actually performed",
        ],
        [
          "bssa_exception",
          "Refusal or lifetime-attempt exception: clinician rationale",
        ],
        [
          "safety_plan",
          "Safety plan and coping/support actions (not a safety contract)",
        ],
        ["means_discussion", "Means restriction discussion and actions"],
        [
          "resources",
          "Resources actually provided: 988; Crisis Text Line HOME to 741741",
        ],
        [
          "follow_up_action",
          "Next action, responsible team and timing chosen by clinician",
        ],
        [
          "coverage_exception",
          "Follow-up ownership/coverage exception and alternative plan",
        ],
      ].map(([key, title]) => (
        <TextField
          key={key}
          fullWidth
          multiline
          minRows={2}
          label={title}
          value={evidence[key] || ""}
          disabled={disabled}
          onChange={(event) => setEvidence(key, event.target.value)}
          slotProps={{ htmlInput: { maxLength: 350 } }}
        />
      ))}
      <TextField
        fullWidth
        select
        label="Existing owned follow-up task"
        value={evidence.follow_up_task_id || ""}
        disabled={disabled}
        onChange={(event) =>
          setEvidence("follow_up_task_id", event.target.value)
        }
        helperText="Create a safety follow-up or patient call in the existing Patient Flow queue, then select its accepted owner here; otherwise document a coverage exception. Completing the assessment does not complete this task."
      >
        <MenuItem value="">
          No linked task — coverage exception required for positive screen
        </MenuItem>
        {tasks.map((task) => (
          <MenuItem
            key={task.id}
            value={String(task.id)}
            disabled={!task.accepted_owner}
          >
            Task {task.id} · {label(task.state)} ·{" "}
            {task.owner_membership_id
              ? `owner ${task.owner_membership_id}`
              : "owner unavailable"}
          </MenuItem>
        ))}
        {evidence.follow_up_task_id &&
          !tasks.some(
            (task) => String(task.id) === evidence.follow_up_task_id,
          ) && (
            <MenuItem value={evidence.follow_up_task_id}>
              Previously linked task {evidence.follow_up_task_id} — review
              current coverage
            </MenuItem>
          )}
      </TextField>
      <Typography variant="body2">
        NIMH recommends positive-screen check-in within 48 hours if possible;
        further evaluation preferably within 72 hours, and follow-up at the next
        appointment. Record actual timing and ownership; no outreach is sent
        automatically.
      </Typography>
    </Stack>
  );
}

export function AsqHistoryPanel({
  history,
  version,
}: {
  history: AsqHistory[];
  version: string;
}) {
  if (!history.length) return null;
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">ASQ history · {version}</Typography>
      <Typography variant="body2">
        Recent history from up to 500 assessment revisions, same instrument
        version only. Superseded, incomplete, declined, in-progress and
        entered-in-error records are excluded from longitudinal comparison.
        Categorical results do not establish a severity trend.
      </Typography>
      {history.map((record) => (
        <Typography key={record.id} variant="body2">
          Encounter {record.encounter_id} · location {record.site_id} · revision{" "}
          {record.revision} ·{" "}
          {new Date(record.assessed_at || record.recorded_at).toLocaleString()}{" "}
          · {label(record.result || "unknown")} · {label(record.status)} ·
          source {label(record.source || "unknown")} ·{" "}
          {record.reviewed_at
            ? `reviewed by ${record.reviewer_membership_id} at ${new Date(record.reviewed_at).toLocaleString()}`
            : "not reviewed"}
          {!record.comparable && " · excluded from comparison"}
        </Typography>
      ))}
    </Stack>
  );
}
