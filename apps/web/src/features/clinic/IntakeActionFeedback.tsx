import { useEffect, useRef } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";
import {
  answerState,
  intakeFieldVisible,
  type IntakeAnswers,
  type IntakeField,
} from "../patientPortal/IntakeQuestions";

export const unresolvedIntakeGroupMessage =
  "Answer or explicitly resolve each question in the group before confirming.";

export type IntakeQuestionError = {
  id: string;
  label: string;
  chunkIndex: number;
};

// Advisory guidance after the server's known rejection, never a second validator.
export function unresolvedIntakeQuestions({
  fields,
  chunks,
  confirmedChunks,
  answers,
  measuredFields,
  video,
}: {
  fields: IntakeField[];
  chunks: Array<{ index: number; fields: string[] }>;
  confirmedChunks: number[];
  answers: IntakeAnswers;
  measuredFields: string[];
  video: boolean;
}): IntakeQuestionError[] {
  return chunks
    .filter((chunk) => confirmedChunks.includes(chunk.index))
    .flatMap((chunk) =>
      fields
        .filter(
          (field) =>
            chunk.fields.includes(field.id) &&
            !["extended", "clinician"].includes(field.requiredness ?? "") &&
            !measuredFields.includes(field.id) &&
            (video ||
              !["telehealth_location", "telehealth_physical_location"].includes(
                field.id,
              )) &&
            intakeFieldVisible(field, answers, fields),
        )
        .filter((field) => {
          const answer = answers[field.id];
          const state = answerState(answer);
          if (state === "unanswered") return true;
          if (state !== "answered") return false;
          // Record/history normalization has distinct errors; do not guess them.
          if (field.record_fields || field.history_kind) return false;
          if (field.input_type === "multiselect")
            return typeof answer === "object" && !answer.values?.length;
          return typeof answer === "object" && !answer.value.trim();
        })
        .map((field) => ({
          id: field.id,
          label: field.label,
          chunkIndex: chunk.index,
        })),
    );
}

export type IntakeActionFailure = {
  message: string;
  chunkIndex: number;
  workspace: "intake" | "handoff";
  questions: IntakeQuestionError[];
};

export function IntakeActionFeedback({
  failure,
  questions = failure.questions,
  onReviewQuestion,
  onRefresh,
  onDiscard,
}: {
  failure: IntakeActionFailure;
  questions?: IntakeQuestionError[];
  onReviewQuestion: (question: IntakeQuestionError) => void;
  onRefresh: () => void;
  onDiscard?: () => void;
}) {
  const alert = useRef<HTMLDivElement>(null);
  useEffect(() => {
    alert.current?.focus({ preventScroll: true });
    alert.current?.scrollIntoView({ block: "nearest" });
  }, [failure]);
  return (
    <Alert
      ref={alert}
      severity="error"
      tabIndex={-1}
      aria-label="Intake save failed"
      aria-atomic="true"
      sx={{
        scrollMarginBlock: 16,
        "&:focus": { outline: "2px solid currentColor" },
      }}
    >
      <Stack spacing={1}>
        <Typography>{failure.message}</Typography>
        {questions.length > 0 && (
          <>
            <Typography variant="body2">
              Answer or explicitly resolve:{" "}
              {questions.map((question) => question.label).join("; ")}.
            </Typography>
            <Button
              color="inherit"
              sx={{ alignSelf: "start" }}
              onClick={() => onReviewQuestion(questions[0])}
            >
              Review first unresolved question
            </Button>
          </>
        )}
        <Button color="inherit" sx={{ alignSelf: "start" }} onClick={onRefresh}>
          Refresh
        </Button>
        {onDiscard && (
          <Button
            color="inherit"
            sx={{ alignSelf: "start" }}
            onClick={onDiscard}
          >
            Discard local edits and load saved intake
          </Button>
        )}
      </Stack>
    </Alert>
  );
}
