import { useId } from "react";
import { Box, Paper, Stack, TextField, Typography } from "@mui/material";
import {
  composeReviewOfSystemsSubjective,
  splitReviewOfSystemsSubjective,
  type ReviewOfSystemsSelections,
} from "./ReviewOfSystems";

export type HpiFields = {
  chiefComplaint: string;
  onsetTime: string;
  duration: string;
  onsetCause: string;
  character: string;
  exacerbatedBy: string;
  improvedBy: string;
};

export const EMPTY_HPI_FIELDS: HpiFields = {
  chiefComplaint: "",
  onsetTime: "",
  duration: "",
  onsetCause: "",
  character: "",
  exacerbatedBy: "",
  improvedBy: "",
};

const HPI_HEADING = "History of Present Illness";
const FIELD_LABELS: Array<[keyof HpiFields, string]> = [
  ["chiefComplaint", "Chief Complaint"],
  ["onsetTime", "Onset Time"],
  ["duration", "Duration"],
  ["onsetCause", "Onset Cause"],
  ["character", "Character"],
  ["exacerbatedBy", "Exacerbated by"],
  ["improvedBy", "Improved by"],
];

export function splitHistoryOfPresentIllness(value: string) {
  const ros = splitReviewOfSystemsSubjective(value);
  const source = ros.narrative;
  const boundary = source.indexOf("\n\n");
  const block = boundary >= 0 ? source.slice(0, boundary) : source;
  if (!block.startsWith(`${HPI_HEADING}\n`))
    return {
      narrative: source,
      hpi: EMPTY_HPI_FIELDS,
      selections: ros.selections,
    };
  const hpi = { ...EMPTY_HPI_FIELDS };
  block
    .split("\n")
    .slice(1)
    .forEach((line) => {
      const match = line.match(/^- ([^:]+): (.*)$/);
      const field = FIELD_LABELS.find(
        ([, label]) => label.toLowerCase() === match?.[1].toLowerCase(),
      )?.[0];
      if (field && match) hpi[field] = match[2];
    });
  return {
    narrative: boundary >= 0 ? source.slice(boundary + 2) : "",
    hpi,
    selections: ros.selections,
  };
}

export function composeHistoryOfPresentIllness(
  narrative: string,
  hpi: HpiFields,
  selections: ReviewOfSystemsSelections = {},
) {
  // This composer runs on every keystroke, including spaces and IME input.
  // Preserve the exact field value in the working note and its recovery copy.
  const lines = FIELD_LABELS.filter(([field]) => hpi[field].length > 0).map(
    ([field, label]) => `- ${label}: ${hpi[field]}`,
  );
  const hpiBlock = lines.length ? `${HPI_HEADING}\n${lines.join("\n")}` : "";
  const combined = hpiBlock
    ? narrative
      ? `${hpiBlock}\n\n${narrative}`
      : hpiBlock
    : narrative;
  return composeReviewOfSystemsSubjective(combined, selections);
}

export function HistoryOfPresentIllness({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const parsed = splitHistoryOfPresentIllness(value);
  const update = (field: keyof HpiFields, next: string) =>
    onChange(
      composeHistoryOfPresentIllness(
        parsed.narrative,
        { ...parsed.hpi, [field]: next },
        parsed.selections,
      ),
    );
  return (
    <Paper
      id="chart-hpi"
      component="section"
      variant="outlined"
      className="hpi-composer chart-anchor"
      aria-labelledby={`${id}-heading`}
    >
      <Stack spacing={0.75}>
        <Typography id={`${id}-heading`} component="h3" variant="h6">
          History of Present Illness
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Capture the patient-reported history in structured fields; leave
          unknown details blank.
        </Typography>
      </Stack>
      <Box className="hpi-field-grid">
        {FIELD_LABELS.map(([field, label]) => (
          <TextField
            key={field}
            size="small"
            label={label}
            value={parsed.hpi[field]}
            onChange={(event) => update(field, event.target.value)}
            disabled={disabled}
            fullWidth
          />
        ))}
      </Box>
      <TextField
        name="subjective"
        label="Additional subjective history"
        value={parsed.narrative}
        onChange={(event) =>
          onChange(
            composeHistoryOfPresentIllness(
              event.target.value,
              parsed.hpi,
              parsed.selections,
            ),
          )
        }
        multiline
        minRows={3}
        disabled={disabled}
        fullWidth
      />
    </Paper>
  );
}
