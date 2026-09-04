import { useId } from "react";
import { Box, ButtonBase, Chip, Paper, Stack, Typography } from "@mui/material";

export type ReviewOfSystemsFindingState = "present" | "absent";

export type ReviewOfSystemsSelections = Readonly<
  Record<string, ReviewOfSystemsFindingState>
>;

type ReviewOfSystemsFinding = {
  id: string;
  label: string;
  noteLabel: string;
};

type ReviewOfSystemsSystem = {
  id: string;
  label: string;
  findings: readonly ReviewOfSystemsFinding[];
};

export const REVIEW_OF_SYSTEMS: readonly ReviewOfSystemsSystem[] = [
  {
    id: "general",
    label: "General",
    findings: [
      { id: "fever", label: "Fever", noteLabel: "fever" },
      { id: "chills", label: "Chills", noteLabel: "chills" },
      { id: "fatigue", label: "Fatigue", noteLabel: "fatigue" },
      {
        id: "weight-change",
        label: "Weight Change",
        noteLabel: "weight change",
      },
      { id: "malaise", label: "Malaise", noteLabel: "malaise" },
    ],
  },
  {
    id: "heent",
    label: "HEENT",
    findings: [
      { id: "headache", label: "Headache", noteLabel: "headache" },
      { id: "dizziness", label: "Dizziness", noteLabel: "dizziness" },
      {
        id: "vision-problem",
        label: "Vision Problem",
        noteLabel: "vision problem",
      },
      {
        id: "hearing-problem",
        label: "Hearing Problem",
        noteLabel: "hearing problem",
      },
      { id: "ear-pain", label: "Ear Pain", noteLabel: "ear pain" },
      { id: "sinus-pain", label: "Sinus Pain", noteLabel: "sinus pain" },
      { id: "sore-throat", label: "Sore Throat", noteLabel: "sore throat" },
    ],
  },
  {
    id: "respiratory",
    label: "Respiratory",
    findings: [
      { id: "cough", label: "Cough", noteLabel: "cough" },
      { id: "wheezing", label: "Wheezing", noteLabel: "wheezing" },
      {
        id: "shortness-of-breath",
        label: "Shortness of Breath",
        noteLabel: "shortness of breath",
      },
      { id: "chest-pain", label: "Chest Pain", noteLabel: "chest pain" },
    ],
  },
  {
    id: "cardiovascular",
    label: "Cardiovascular",
    findings: [
      { id: "chest-pain", label: "Chest Pain", noteLabel: "chest pain" },
      {
        id: "palpitations",
        label: "Palpitations",
        noteLabel: "palpitations",
      },
      { id: "edema", label: "Edema", noteLabel: "edema" },
      { id: "tachycardia", label: "Tachycardia", noteLabel: "tachycardia" },
      { id: "bradycardia", label: "Bradycardia", noteLabel: "bradycardia" },
    ],
  },
  {
    id: "gastrointestinal",
    label: "Gastrointestinal",
    findings: [
      {
        id: "abdominal-pain",
        label: "Abdominal Pain",
        noteLabel: "abdominal pain",
      },
      { id: "nausea", label: "Nausea", noteLabel: "nausea" },
      { id: "vomiting", label: "Vomiting", noteLabel: "vomiting" },
      { id: "diarrhea", label: "Diarrhea", noteLabel: "diarrhea" },
      {
        id: "constipation",
        label: "Constipation",
        noteLabel: "constipation",
      },
    ],
  },
  {
    id: "genitourinary",
    label: "Genitourinary",
    findings: [
      {
        id: "urinary-frequency",
        label: "Urinary Frequency",
        noteLabel: "urinary frequency",
      },
      {
        id: "urinary-incontinence",
        label: "Urinary Incontinence",
        noteLabel: "urinary incontinence",
      },
      {
        id: "urinary-discomfort",
        label: "Urinary Discomfort",
        noteLabel: "urinary discomfort",
      },
    ],
  },
  {
    id: "musculoskeletal",
    label: "Musculoskeletal",
    findings: [
      { id: "joint-pain", label: "Joint Pain", noteLabel: "joint pain" },
      {
        id: "muscle-weakness",
        label: "Muscle Weakness",
        noteLabel: "muscle weakness",
      },
      { id: "back-pain", label: "Back Pain", noteLabel: "back pain" },
      {
        id: "other-musculoskeletal-issue",
        label: "Other Musculoskeletal Issue",
        noteLabel: "other musculoskeletal issue",
      },
    ],
  },
  {
    id: "neurological",
    label: "Neurological",
    findings: [
      { id: "headache", label: "Headache", noteLabel: "headache" },
      { id: "dizziness", label: "Dizziness", noteLabel: "dizziness" },
      { id: "numbness", label: "Numbness", noteLabel: "numbness" },
      { id: "tingling", label: "Tingling", noteLabel: "tingling" },
    ],
  },
  {
    id: "psychiatric",
    label: "Psychiatric",
    findings: [
      { id: "depression", label: "Depression", noteLabel: "depression" },
      { id: "anxiety", label: "Anxiety", noteLabel: "anxiety" },
      { id: "mood-changes", label: "Mood Changes", noteLabel: "mood changes" },
      {
        id: "behavior-changes",
        label: "Behavior Changes",
        noteLabel: "behavior changes",
      },
      {
        id: "other-psychiatric-issue",
        label: "Other Psychiatric Issue",
        noteLabel: "other psychiatric issue",
      },
    ],
  },
  {
    id: "endocrine",
    label: "Endocrine",
    findings: [
      {
        id: "excessive-thirst",
        label: "Excessive Thirst",
        noteLabel: "excessive thirst",
      },
      {
        id: "excessive-hunger",
        label: "Excessive Hunger",
        noteLabel: "excessive hunger",
      },
      {
        id: "heat-intolerance",
        label: "Heat Intolerance",
        noteLabel: "heat intolerance",
      },
      {
        id: "cold-intolerance",
        label: "Cold Intolerance",
        noteLabel: "cold intolerance",
      },
    ],
  },
  {
    id: "hema-lymph",
    label: "Hema/Lymph",
    findings: [
      { id: "bruising", label: "Bruising", noteLabel: "bruising" },
      { id: "bleeding", label: "Bleeding", noteLabel: "bleeding" },
      {
        id: "swollen-lymph-nodes",
        label: "Swollen Lymph Nodes",
        noteLabel: "swollen lymph nodes",
      },
      { id: "edema", label: "Edema", noteLabel: "edema" },
    ],
  },
  {
    id: "integumentary",
    label: "Integumentary",
    findings: [
      { id: "lesion", label: "Lesion", noteLabel: "lesion" },
      { id: "rash", label: "Rash", noteLabel: "rash" },
      {
        id: "other-skin-issue",
        label: "Other Skin Issue",
        noteLabel: "other skin issue",
      },
    ],
  },
  {
    id: "sleep",
    label: "Sleep",
    findings: [
      {
        id: "sleep-disturbances",
        label: "Sleep Disturbances",
        noteLabel: "sleep disturbances",
      },
    ],
  },
];

export const REVIEW_OF_SYSTEMS_HEADING = "Review of Systems";

export function nextReviewOfSystemsFindingState(
  state?: ReviewOfSystemsFindingState,
): ReviewOfSystemsFindingState | undefined {
  if (!state) return "present";
  return state === "present" ? "absent" : undefined;
}

function findingKey(systemId: string, findingId: string) {
  return `${systemId}.${findingId}`;
}

export function renderReviewOfSystemsBlock(
  selections: ReviewOfSystemsSelections,
) {
  const lines = REVIEW_OF_SYSTEMS.flatMap((system) => {
    const present = system.findings
      .filter(
        (finding) =>
          selections[findingKey(system.id, finding.id)] === "present",
      )
      .map((finding) => finding.noteLabel);
    const absent = system.findings
      .filter(
        (finding) => selections[findingKey(system.id, finding.id)] === "absent",
      )
      .map((finding) => finding.noteLabel);
    const findings = [
      present.length > 0 ? `Present — ${present.join(", ")}` : "",
      absent.length > 0 ? `Absent — ${absent.join(", ")}` : "",
    ].filter(Boolean);
    return findings.length > 0
      ? [`- ${system.label}: ${findings.join("; ")}.`]
      : [];
  });
  return lines.length > 0
    ? [REVIEW_OF_SYSTEMS_HEADING, ...lines].join("\n")
    : "";
}

function parseReviewOfSystemsBlock(block: string) {
  const lines = block.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== REVIEW_OF_SYSTEMS_HEADING) return null;
  const selections: Record<string, ReviewOfSystemsFindingState> = {};
  const seenSystems = new Set<string>();

  for (const line of lines.slice(1)) {
    const system = REVIEW_OF_SYSTEMS.find((candidate) =>
      line.startsWith(`- ${candidate.label}: `),
    );
    if (!system || seenSystems.has(system.id) || !line.endsWith("."))
      return null;
    seenSystems.add(system.id);
    const content = line.slice(`- ${system.label}: `.length, -1).split("; ");
    for (const group of content) {
      const state = group.startsWith("Present — ")
        ? "present"
        : group.startsWith("Absent — ")
          ? "absent"
          : null;
      if (!state) return null;
      const labels = group
        .slice(`${state === "present" ? "Present" : "Absent"} — `.length)
        .split(", ");
      for (const label of labels) {
        const finding = system.findings.find(
          (candidate) => candidate.noteLabel === label,
        );
        if (!finding) return null;
        const key = findingKey(system.id, finding.id);
        if (selections[key]) return null;
        selections[key] = state;
      }
    }
  }

  return lines.length > 1 ? selections : null;
}

function firstSubjectiveSeparator(value: string) {
  const separators = ["\r\n\r\n", "\n\n"] as const;
  return separators
    .map((separator) => ({ separator, index: value.indexOf(separator) }))
    .filter(({ index }) => index >= 0)
    .sort((left, right) => left.index - right.index)[0];
}

export function splitReviewOfSystemsSubjective(value: string): {
  narrative: string;
  selections: ReviewOfSystemsSelections;
} {
  if (
    value !== REVIEW_OF_SYSTEMS_HEADING &&
    !value.startsWith(`${REVIEW_OF_SYSTEMS_HEADING}\n`) &&
    !value.startsWith(`${REVIEW_OF_SYSTEMS_HEADING}\r\n`)
  )
    return { narrative: value, selections: {} };

  const boundary = firstSubjectiveSeparator(value);
  const block = boundary ? value.slice(0, boundary.index) : value;
  const selections = parseReviewOfSystemsBlock(block);
  if (!selections) return { narrative: value, selections: {} };

  return {
    narrative: boundary
      ? value.slice(boundary.index + boundary.separator.length)
      : "",
    selections,
  };
}

export function composeReviewOfSystemsSubjective(
  narrative: string,
  selections: ReviewOfSystemsSelections,
) {
  const block = renderReviewOfSystemsBlock(selections);
  if (!block) return narrative;
  return narrative ? `${block}\n\n${narrative}` : block;
}

export function ReviewOfSystems({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const { narrative, selections } = splitReviewOfSystemsSubjective(value);
  const selectedSystems = REVIEW_OF_SYSTEMS.filter((system) =>
    system.findings.some(
      (finding) => selections[findingKey(system.id, finding.id)] !== undefined,
    ),
  ).length;
  const selectedFindings = Object.keys(selections).length;

  const updateFinding = (
    systemId: string,
    findingId: string,
    state?: ReviewOfSystemsFindingState,
  ) => {
    const nextSelections: Record<string, ReviewOfSystemsFindingState> = {
      ...selections,
    };
    const key = findingKey(systemId, findingId);
    if (state) nextSelections[key] = state;
    else delete nextSelections[key];
    onChange(composeReviewOfSystemsSubjective(narrative, nextSelections));
  };

  return (
    <Paper
      id="chart-ros"
      component="section"
      variant="outlined"
      className="ros-composer chart-anchor"
      aria-labelledby={`${id}-heading`}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={0.5}
        sx={{
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography id={`${id}-heading`} component="h3" variant="h6">
            Review of Systems
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Click a finding to cycle: positive, negative, then not reviewed.
          </Typography>
        </Box>
        <Chip
          variant="outlined"
          label={`${selectedSystems}/${REVIEW_OF_SYSTEMS.length} systems with selections · ${selectedFindings} finding${selectedFindings === 1 ? "" : "s"}`}
        />
      </Stack>
      <Stack
        component="ul"
        className="ros-state-key"
        direction={{ xs: "column", sm: "row" }}
        spacing={{ xs: 0.25, sm: 1 }}
        aria-label="Review of Systems finding states"
      >
        <Typography component="li" variant="caption">
          <Box component="span" className="ros-state-example is-positive">
            Positive
          </Box>
          — blue circle
        </Typography>
        <Typography component="li" variant="caption">
          <Box component="span" className="ros-state-example is-negative">
            Negative
          </Box>
          — red crossed circle
        </Typography>
        <Typography component="li" variant="caption">
          Plain — not reviewed
        </Typography>
      </Stack>
      <Box className="ros-system-grid">
        {REVIEW_OF_SYSTEMS.map((system) => (
          <Box
            component="section"
            key={system.id}
            className="ros-system"
            aria-labelledby={`${id}-${system.id}-heading`}
          >
            <Typography
              id={`${id}-${system.id}-heading`}
              component="h4"
              variant="subtitle2"
            >
              {system.label}
            </Typography>
            <Box className="ros-finding-list">
              {system.findings.map((finding) => {
                const key = findingKey(system.id, finding.id);
                const state = selections[key];
                const nextState = nextReviewOfSystemsFindingState(state);
                const currentLabel =
                  state === "present"
                    ? "positive"
                    : state === "absent"
                      ? "negative"
                      : "not reviewed";
                const nextLabel =
                  nextState === "present"
                    ? "positive"
                    : nextState === "absent"
                      ? "negative"
                      : "not reviewed";
                return (
                  <ButtonBase
                    key={finding.id}
                    type="button"
                    className="ros-finding-button"
                    data-state={state ?? "unselected"}
                    onClick={() =>
                      updateFinding(system.id, finding.id, nextState)
                    }
                    disabled={disabled}
                    focusRipple
                    aria-label={`${finding.label}: ${currentLabel}. Activate to mark ${nextLabel}.`}
                  >
                    <span className="ros-finding-mark">{finding.label}</span>
                  </ButtonBase>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
