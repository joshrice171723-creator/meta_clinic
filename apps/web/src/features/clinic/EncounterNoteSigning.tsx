import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import { useRef, useState } from "react";
import type { EncounterNote, SoapNoteSections } from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { useClinic } from "./Workspace";

type Attempt = { revisionNo: number; digest: string };
const labels: [keyof SoapNoteSections, string][] = [
  ["subjective", "Subjective"],
  ["objective", "Objective"],
  ["assessment", "Assessment"],
  ["plan", "Plan"],
];

export function EncounterNoteSigning({
  note,
  patientId,
  encounterId,
  canSign,
  disabled,
  onSigned,
  patientName,
}: {
  note: EncounterNote;
  patientId: number;
  encounterId: number;
  canSign: boolean;
  disabled: boolean;
  onSigned: () => void;
  patientName?: string;
}) {
  const { membership_id } = useClinic();
  const [open, setOpen] = useState(false);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unknown, setUnknown] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const revision = note.current_revision;
  const signed = note.signed || revision?.signed === true;
  const body = revision?.body;
  const close = () => {
    if (!busy && !unknown) {
      attempt.current = null;
      setOpen(false);
      setAttested(false);
      setError("");
    }
  };
  const confirmed = (candidate: EncounterNote, target: Attempt) => {
    const current = candidate.current_revision;
    return (
      candidate.id === note.id &&
      candidate.patient_id === patientId &&
      candidate.encounter_id === encounterId &&
      current?.revision_no === target.revisionNo &&
      current.signed === true &&
      candidate.signatures?.some(
        (signature) =>
          signature.revision_id === current.id &&
          signature.content_digest === target.digest &&
          signature.signer_membership_id === membership_id,
      ) === true
    );
  };
  const check = async () => {
    const target = attempt.current;
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ note: EncounterNote }>(
        `/api/clinic/notes/${note.id}`,
      );
      if (confirmed(result.note, target)) {
        attempt.current = null;
        setUnknown(false);
        setOpen(false);
        onSigned();
      } else {
        setUnknown(false);
        setError(
          "The note is not signed with the reviewed revision. Review the saved note before trying again.",
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to verify the signing outcome.",
      );
    } finally {
      setBusy(false);
    }
  };
  const sign = async () => {
    if (
      !revision ||
      !revision.content_digest ||
      !body ||
      !canSign ||
      disabled ||
      !attested ||
      signed
    )
      return;
    const target = attempt.current ?? {
      revisionNo: revision.revision_no,
      digest: revision.content_digest,
    };
    attempt.current = target;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ note: EncounterNote }>(
        `/api/clinic/notes/${note.id}/signatures`,
        {
          method: "POST",
          body: {
            signature: {
              revision_no: target.revisionNo,
              content_digest: target.digest,
              attestation_version: "clinic-note-attestation-v1",
            },
          },
        },
      );
      if (!confirmed(result.note, target))
        throw new Error(
          "The signing response did not confirm the reviewed revision.",
        );
      attempt.current = null;
      setOpen(false);
      onSigned();
    } catch (reason) {
      if (
        reason instanceof ApiError &&
        (reason.status === 409 || reason.status === 422)
      ) {
        attempt.current = null;
        setError(
          "The note changed or could not be signed. Reload and review the saved revision again.",
        );
      } else {
        setUnknown(true);
        setError(
          "The signing outcome is unknown. Check the saved note before closing or retrying.",
        );
      }
    } finally {
      setBusy(false);
    }
  };
  if (!revision || !body || signed) return null;
  if (!revision.content_digest)
    return (
      <Alert severity="warning">
        The saved note cannot be signed until its revision digest is available.
        Reload the chart and review it again.
      </Alert>
    );
  return (
    <>
      <Button
        variant="contained"
        disabled={!canSign || disabled}
        onClick={() => setOpen(true)}
      >
        Review and sign
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="md">
        <DialogTitle>Review and sign saved SOAP note</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography color="text.secondary">
              {patientName || `Patient #${patientId}`} · Encounter #
              {encounterId}
              {" · "}Revision {revision.revision_no}
            </Typography>
            {error && (
              <Alert severity={unknown ? "warning" : "error"}>{error}</Alert>
            )}
            {labels.map(([key, label]) => (
              <Box key={key}>
                <Typography sx={{ fontWeight: 700 }}>{label}</Typography>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>
                  {body.sections[key] || "Not recorded"}
                </Typography>
                <Divider sx={{ mt: 1 }} />
              </Box>
            ))}
            <FormControlLabel
              control={
                <Checkbox
                  checked={attested}
                  disabled={busy || unknown}
                  onChange={(event) => setAttested(event.target.checked)}
                />
              }
              label="I reviewed this note and confirm it accurately records my documentation."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          {unknown ? (
            <Button disabled={busy} onClick={() => void check()}>
              Check saved note
            </Button>
          ) : (
            <Button disabled={busy} onClick={close}>
              Cancel
            </Button>
          )}
          <Button
            variant="contained"
            disabled={!attested || !canSign || disabled || busy || unknown}
            onClick={() => void sign()}
          >
            {busy ? "Signing…" : "Sign note"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
