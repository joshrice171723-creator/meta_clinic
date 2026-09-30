import { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Button,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { IntakeQuestionFollowUpRecord } from "../../api/contracts";
import {
  answerState,
  type IntakeAnswers,
  type IntakeField,
} from "../patientPortal/IntakeQuestions";

export type QuestionFollowUpDraft = {
  reason: string;
  next_action: string;
  rebind?: boolean;
};
export function questionFollowUpDrafts(
  records: Record<string, IntakeQuestionFollowUpRecord> = {},
) {
  return Object.fromEntries(
    Object.entries(records).map(([id, record]) => [
      id,
      { reason: record.reason, next_action: record.next_action },
    ]),
  );
}

export function IntakeQuestionFollowUp({
  fields,
  answers,
  saved = {},
  drafts,
  writable,
  disabled,
  onChange,
}: {
  fields: IntakeField[];
  answers: IntakeAnswers;
  saved?: Record<string, IntakeQuestionFollowUpRecord>;
  drafts: Record<string, QuestionFollowUpDraft>;
  writable: boolean;
  disabled: boolean;
  onChange: (drafts: Record<string, QuestionFollowUpDraft>) => void;
}) {
  const [selected, setSelected] = useState<IntakeField | null>(null);
  const currentIds = new Set(fields.map((field) => field.id));
  const entries = Object.entries(drafts).filter(([id]) => currentIds.has(id));
  const options = fields.filter((field) => !drafts[field.id]);
  const update = (id: string, change: Partial<QuestionFollowUpDraft>) =>
    onChange({ ...drafts, [id]: { ...drafts[id], ...change } });
  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        Question follow-up details ({entries.length})
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Record a reason and next action for a specific question. Save with
            the intake draft. This documents follow-up without creating a task
            or resolving the answer.
          </Typography>
          {writable && (
            <Stack spacing={1}>
              <Autocomplete
                options={options}
                value={
                  selected && options.some((field) => field.id === selected.id)
                    ? selected
                    : null
                }
                getOptionLabel={(field) => field.label}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                disabled={disabled}
                onChange={(_event, value) => setSelected(value)}
                renderInput={(params) => (
                  <TextField {...params} label="Question for follow-up" />
                )}
              />
              <Button
                disabled={disabled || !selected || Boolean(drafts[selected.id])}
                onClick={() => {
                  if (selected) {
                    update(selected.id, { reason: "", next_action: "" });
                    setSelected(null);
                  }
                }}
              >
                Add follow-up detail
              </Button>
            </Stack>
          )}
          {entries.map(([id, draft]) => {
            const record = saved[id];
            const changed =
              record &&
              JSON.stringify(record.source_answer) !==
                JSON.stringify(answers[id]);
            const label =
              fields.find((field) => field.id === id)?.label ||
              record?.question.label ||
              id;
            return (
              <Stack key={id} spacing={1}>
                <Typography variant="subtitle2">
                  {label} · Answer state: {answerState(answers[id])}
                </Typography>
                {record && (
                  <Typography variant="body2" color="text.secondary">
                    Saved context: intake version{" "}
                    {record.source_revision_version}, {record.source_form_id},
                    questionnaire version {record.source_questionnaire_version},
                    answer state {answerState(record.source_answer)}; membership{" "}
                    {record.recorded_by_membership_id}, {record.recorded_at}
                  </Typography>
                )}
                {changed && (
                  <Alert severity="warning">
                    The answer changed since these follow-up details were
                    recorded. The saved source context remains preserved.
                  </Alert>
                )}
                <TextField
                  label={`Follow-up reason — ${label}`}
                  value={draft.reason}
                  multiline
                  disabled={disabled || !writable}
                  onChange={(event) =>
                    update(id, { reason: event.target.value })
                  }
                  slotProps={{ htmlInput: { maxLength: 600 } }}
                />
                <TextField
                  label={`Next action — ${label}`}
                  value={draft.next_action}
                  multiline
                  disabled={disabled || !writable}
                  onChange={(event) =>
                    update(id, { next_action: event.target.value })
                  }
                  slotProps={{ htmlInput: { maxLength: 600 } }}
                />
                {writable && (
                  <Stack direction="row" spacing={1}>
                    {changed && (
                      <Button
                        disabled={disabled || draft.rebind}
                        onClick={() => update(id, { rebind: true })}
                      >
                        {draft.rebind
                          ? "New context will be recorded on save"
                          : "Record current answer context on save"}
                      </Button>
                    )}
                    <Button
                      disabled={disabled}
                      onClick={() => {
                        const remaining = { ...drafts };
                        delete remaining[id];
                        onChange(remaining);
                      }}
                    >
                      Remove follow-up detail
                    </Button>
                  </Stack>
                )}
              </Stack>
            );
          })}
          {!entries.length && (
            <Typography color="text.secondary">
              No question follow-up details recorded in this group.
            </Typography>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
