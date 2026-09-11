import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useId, useState } from "react";
import { useResource } from "../../shared/ui";

export type PrevisitNote = {
  id: number;
  version_number: number;
  text: string;
  attestation?: { id: string; version: string; accepted: true } | null;
  submitted_at: string;
};

type PrevisitNoteResponse = {
  patient_id: number;
  encounter_id: number;
  appointment_id: number | null;
  note: PrevisitNote | null;
};

export function previsitNoteBlock(note: PrevisitNote) {
  return `Patient-provided pre-visit note (version ${note.version_number}, submitted ${note.submitted_at}):\n${note.text}`;
}

export function appendPrevisitNote(subjective: string, note: PrevisitNote) {
  const block = previsitNoteBlock(note);
  if (!note.text.trim() || subjective.includes(block)) return subjective;
  return subjective ? `${subjective}\n\n${block}` : block;
}

export function PrevisitNoteImport({
  patientId,
  encounterId,
  patientName,
  subjective,
  disabled,
  onAppend,
}: {
  patientId: number;
  encounterId: number;
  patientName?: string;
  subjective: string;
  disabled: boolean;
  onAppend: (note: PrevisitNote) => void;
}) {
  const resource = useResource<PrevisitNoteResponse>(
    `/api/clinic/patients/${patientId}/encounters/${encounterId}/previsit_note`,
  );
  const [preview, setPreview] = useState<PrevisitNote | null>(null);
  const titleId = useId();
  const note = resource.data?.note;
  const contextMismatch = Boolean(
    resource.data &&
      (resource.data.patient_id !== patientId ||
        resource.data.encounter_id !== encounterId),
  );
  const alreadyIncluded = Boolean(
    note?.text.trim() && subjective.includes(previsitNoteBlock(note)),
  );
  const previewIsCurrent = Boolean(
    preview &&
    note?.id === preview.id &&
    note.version_number === preview.version_number,
  );
  const previewIncluded = Boolean(
    preview && subjective.includes(previsitNoteBlock(preview)),
  );
  const wouldExceedLimit = Boolean(
    preview && appendPrevisitNote(subjective, preview).length > 50_000,
  );

  if (resource.error) {
    return (
      <Alert
        severity="warning"
        action={
          <Button color="inherit" onClick={resource.refresh}>
            Retry
          </Button>
        }
      >
        The patient's pre-visit note could not be loaded.
      </Alert>
    );
  }
  if (!resource.data) {
    return (
      <Typography role="status" color="text.secondary">
        Checking for a pre-visit note…
      </Typography>
    );
  }
  if (contextMismatch) {
    return (
      <Alert severity="error">
        The pre-visit submission does not match this patient and encounter.
      </Alert>
    );
  }
  if (!note?.text.trim()) return null;

  return (
    <Paper component="section" variant="outlined" sx={{ p: 2, minWidth: 0 }}>
      <Stack spacing={1}>
        <Typography component="h3" variant="h6">
          Before this visit
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Patient-provided · Submitted{" "}
          {new Date(note.submitted_at).toLocaleString()}
        </Typography>
        <Typography
          variant="caption"
          color={note.attestation?.accepted ? "success.main" : "warning.main"}
        >
          {note.attestation?.accepted
            ? "Patient confirmed the intake for care-team review."
            : "Legacy submission without the current confirmation record."}
        </Typography>
        <Typography
          sx={{
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            maxHeight: 160,
            overflowY: "auto",
          }}
        >
          {note.text}
        </Typography>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", flexWrap: "wrap" }}
        >
          <Button
            size="small"
            variant="outlined"
            onClick={() => setPreview(note)}
          >
            Review note
          </Button>
          {alreadyIncluded && (
            <Typography variant="body2" color="text.secondary">
              Already included in subjective history.
            </Typography>
          )}
        </Stack>
      </Stack>
      <Dialog
        open={preview !== null}
        onClose={() => setPreview(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby={titleId}
      >
        <DialogTitle id={titleId}>Add patient note to this draft</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography color="text.secondary">
              {patientName || `Patient #${patientId}`} · Encounter #
              {encounterId}
            </Typography>
            <Typography>
              This adds the patient's words, labeled as patient-provided, to the
              end of your current subjective history. Your existing draft stays
              in place. Save the chart to record the addition.
            </Typography>
            <Alert
              severity={preview?.attestation?.accepted ? "info" : "warning"}
            >
              {preview?.attestation?.accepted
                ? "This submission includes the current patient confirmation for care-team review."
                : "This is a legacy submission without the current confirmation record. Review it as patient-reported context."}
            </Alert>
            <Box sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {preview?.text}
            </Box>
            {!previewIsCurrent && (
              <Alert severity="warning">
                The source note changed. Close this preview and review the
                current note.
              </Alert>
            )}
            {previewIncluded && (
              <Alert severity="info">
                This version is already included in subjective history.
              </Alert>
            )}
            {wouldExceedLimit && (
              <Alert severity="warning">
                The subjective history is too long to add this note. Shorten the
                draft before trying again.
              </Alert>
            )}
            {disabled && (
              <Typography color="text.secondary">
                You can add this text when the chart is editable.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>Close</Button>
          <Button
            variant="contained"
            disabled={
              disabled ||
              !previewIsCurrent ||
              previewIncluded ||
              wouldExceedLimit
            }
            onClick={() => {
              if (
                !preview ||
                disabled ||
                !previewIsCurrent ||
                previewIncluded ||
                wouldExceedLimit
              )
                return;
              onAppend(preview);
              setPreview(null);
            }}
          >
            Append to subjective history
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
