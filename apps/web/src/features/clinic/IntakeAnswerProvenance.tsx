import { useId, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { EncounterIntakeRevision } from "../../api/contracts";
import type {
  IntakeAnswer,
  IntakeField,
} from "../patientPortal/IntakeQuestions";

type Props = {
  intake: EncounterIntakeRevision;
  patientId: number;
  encounterId: number;
  fields: IntakeField[];
  questionIds: string[];
  scopeId: string;
};

function words(value: string) {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ overflowWrap: "anywhere" }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
        {value}
      </Typography>
    </Box>
  );
}

function Answer({
  answer,
  question,
}: {
  answer?: IntakeAnswer;
  question?: IntakeField;
}) {
  if (answer === undefined)
    return <Typography>Response unavailable</Typography>;
  if (typeof answer === "string")
    return <Detail label="Value (answer state unavailable)" value={answer} />;
  const details = Object.entries(answer).filter(
    ([key, value]) =>
      key !== "entries" &&
      value !== undefined &&
      value !== "" &&
      !(Array.isArray(value) && !value.length),
  );
  return (
    <Stack spacing={1}>
      {details.map(([key, value]) => (
        <Detail
          key={key}
          label={words(key)}
          value={
            key === "state" || key === "source" || key === "verification"
              ? words(String(value))
              : Array.isArray(value)
                ? value.join(", ")
                : String(value)
          }
        />
      ))}
      {answer.entries?.map((entry, index) => (
        <Box key={index} sx={{ borderLeft: 2, borderColor: "divider", pl: 2 }}>
          <Typography variant="subtitle2">Record {index + 1}</Typography>
          {Object.entries(entry)
            .filter(
              ([, value]) =>
                value !== undefined &&
                value !== "" &&
                !(Array.isArray(value) && !value.length),
            )
            .map(([key, value]) => (
              <Detail
                key={key}
                label={
                  question?.record_fields?.find((field) => field.id === key)
                    ?.label ?? words(key)
                }
                value={Array.isArray(value) ? value.join(", ") : String(value)}
              />
            ))}
        </Box>
      ))}
    </Stack>
  );
}

export function IntakeAnswerProvenance(props: Props) {
  if (
    props.intake.patient_id !== props.patientId ||
    props.intake.encounter_id !== props.encounterId
  ) {
    return (
      <Alert severity="warning">
        Saved intake does not match the selected patient and encounter.
      </Alert>
    );
  }
  // Changing context, saved revision or group resets the selected question and disclosure.
  return (
    <SavedAnswerInspector
      key={`${props.patientId}:${props.encounterId}:${props.intake.id}:${props.intake.version}:${props.scopeId}`}
      {...props}
    />
  );
}

function SavedAnswerInspector({ intake, fields, questionIds }: Props) {
  const disclosureId = useId();
  const questionnaire = intake.questionnaire;
  const ids = [...new Set(questionIds)].filter(
    (id) =>
      questionnaire?.answers[id] !== undefined ||
      questionnaire?.items?.[id] !== undefined,
  );
  const [selected, setSelected] = useState(ids[0] ?? "");
  const id = ids.includes(selected) ? selected : ids[0];
  const item = id ? questionnaire?.items?.[id] : undefined;
  const currentField = fields.find((field) => field.id === id);
  const label = item?.question?.label ?? currentField?.label ?? id;

  return (
    <Accordion disableGutters>
      <AccordionSummary
        id={`${disclosureId}-summary`}
        aria-controls={`${disclosureId}-details`}
        expandIcon={<ExpandMoreIcon />}
      >
        <Typography>Inspect saved answer source</Typography>
      </AccordionSummary>
      <AccordionDetails id={`${disclosureId}-details`}>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Saved intake #{intake.id} · Revision {intake.version} · Patient #
            {intake.patient_id} · Encounter #{intake.encounter_id}. This view
            shows saved answers; unsaved edits are separate.
          </Typography>
          {ids.length === 0 ? (
            <Typography>
              No saved questionnaire answers in this group.
            </Typography>
          ) : (
            <>
              <TextField
                select
                label="Saved question"
                size="small"
                value={id ?? ""}
                onChange={(event) => setSelected(event.target.value)}
                fullWidth
              >
                {ids.map((questionId) => (
                  <MenuItem key={questionId} value={questionId}>
                    {questionnaire?.items?.[questionId]?.question?.label ??
                      fields.find((field) => field.id === questionId)?.label ??
                      questionId}
                  </MenuItem>
                ))}
              </TextField>
              <Box role="region" aria-label="Selected saved answer source">
                <Stack spacing={2}>
                  <Typography component="h4" variant="subtitle1">
                    {item?.question?.label
                      ? label
                      : "Recorded question unavailable"}
                  </Typography>
                  {!item?.question?.label && (
                    <Typography variant="body2">
                      Current label: {label}
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    Question {id} ·{" "}
                    {item?.question?.question_version
                      ? `Question version ${item.question.question_version}`
                      : "Question version unavailable"}{" "}
                    ·{" "}
                    {item?.questionnaire_version
                      ? `Recorded form version ${item.questionnaire_version}`
                      : "Recorded form version unavailable"}
                  </Typography>
                  <Detail
                    label="Answer source"
                    value={
                      item?.source
                        ? words(item.source)
                        : "Answer source unavailable"
                    }
                  />
                  <Detail
                    label="Recorded by"
                    value={
                      item?.recorded_by_membership_id
                        ? `Membership #${item.recorded_by_membership_id}`
                        : "Recorder unavailable"
                    }
                  />
                  <Detail
                    label="Answer recorded at"
                    value={item?.recorded_at || "Answer time unavailable"}
                  />
                  <Detail
                    label="Confirmation"
                    value={
                      item?.confirmation
                        ? words(item.confirmation)
                        : "Confirmation unavailable"
                    }
                  />
                  {item?.confirmed_at && (
                    <Detail label="Confirmed at" value={item.confirmed_at} />
                  )}
                  <Typography variant="body2" color="text.secondary">
                    Confirmation records the answer; it does not record clinical
                    review.
                  </Typography>
                  {item?.supersedes_revision_id && (
                    <Detail
                      label="Correction reference"
                      value={`Earlier intake record #${item.supersedes_revision_id}`}
                    />
                  )}
                  <Box>
                    <Typography component="h5" variant="subtitle2">
                      Saved response
                    </Typography>
                    <Answer
                      answer={id ? questionnaire?.answers[id] : undefined}
                      question={item?.question}
                    />
                  </Box>
                  {item?.original_response !== undefined && (
                    <Box>
                      <Typography component="h5" variant="subtitle2">
                        Response as recorded
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Original entry before normalization, not the answer from
                        an earlier revision.
                      </Typography>
                      <Answer
                        answer={item.original_response}
                        question={item.question}
                      />
                    </Box>
                  )}
                </Stack>
              </Box>
            </>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
