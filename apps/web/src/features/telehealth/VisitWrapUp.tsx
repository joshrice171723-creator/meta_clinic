import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import { ApiError } from "../../api/client";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { finalizeVisitWrapUp, requestKey, saveVisitWrapUp } from "./api";
import type {
  TelehealthEnvelope,
  TelehealthMutationData,
  TelehealthVisit,
} from "./types";

type Input = Parameters<typeof saveVisitWrapUp>[2];

function draftFor(visit: TelehealthVisit): Input {
  const saved = visit.wrap_up;
  return {
    outcome: saved?.outcome ?? null,
    clinician_notes: saved?.clinician_notes ?? "",
    patient_instructions: saved?.patient_instructions ?? "",
    instruction_note_revision_id: saved?.instruction_note_revision_id ?? null,
    follow_up_status: saved?.follow_up_status ?? null,
    follow_up_plan: saved?.follow_up_plan ?? "",
    follow_up_appointment_id: saved?.follow_up_appointment?.id ?? null,
    scribe_review_status: saved?.scribe_review_status ?? null,
  };
}

export function VisitWrapUp({
  visit,
  version,
  allowedActions,
  onSaved,
  onRefresh,
  onReviewScribe,
}: {
  visit: TelehealthVisit;
  version: number;
  allowedActions: string[];
  onSaved: (response: TelehealthEnvelope<TelehealthMutationData>) => void;
  onRefresh: () => Promise<void>;
  onReviewScribe: () => void;
}) {
  const { navigate, registerBlocker } = useClinicNavigation();
  const [expanded, setExpanded] = useState(visit.status === "ended");
  const [draft, setDraft] = useState<Input>(() => draftFor(visit));
  const [baseVersion, setBaseVersion] = useState(version);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const latest = useRef(visit);
  latest.current = visit;
  const finalized = visit.wrap_up?.status === "finalized";
  const canSave =
    allowedActions.includes("telehealth.save_wrap_up") && !finalized;
  const canFinalize =
    allowedActions.includes("telehealth.finalize_wrap_up") &&
    !dirty &&
    !finalized;
  const options = visit.wrap_up_options;
  const changed = dirty && baseVersion !== version;

  useEffect(() => {
    if (visit.status === "ended") setExpanded(true);
  }, [visit.status]);
  useEffect(() => {
    if (!dirty) {
      setDraft(draftFor(latest.current));
      setBaseVersion(version);
    }
  }, [version, visit.wrap_up?.version, dirty]);
  useEffect(() => {
    return registerBlocker(() =>
      dirtyRef.current
        ? "Leave this visit and discard unsaved wrap-up changes?"
        : null,
    );
  }, [registerBlocker]);
  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);

  const edit = (patch: Partial<Input>) => {
    setDraft((value) => ({ ...value, ...patch }));
    setDirty(true);
    setNotice(null);
  };
  const restore = () => {
    setDraft(draftFor(visit));
    setBaseVersion(version);
    setDirty(false);
    setError(null);
    attempt.current = null;
  };
  const submit = async (kind: "save" | "finalize") => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setNotice(null);
    const expected = kind === "save" ? baseVersion : version;
    const signature = JSON.stringify({
      kind,
      expected,
      input: kind === "save" ? draft : null,
    });
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: requestKey() };
    try {
      const response =
        kind === "save"
          ? await saveVisitWrapUp(
              visit.public_id,
              expected,
              draft,
              attempt.current.key,
            )
          : await finalizeVisitWrapUp(
              visit.public_id,
              expected,
              attempt.current.key,
            );
      onSaved(response);
      setDraft(draftFor(response.data.visit));
      setBaseVersion(response.version);
      setDirty(false);
      dirtyRef.current = false;
      attempt.current = null;
      setNotice(
        kind === "save"
          ? "Wrap-up draft saved. Patient instructions have not been released."
          : "Wrap-up finalized. Patient availability follows the encounter’s release status.",
      );
      return true;
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.status === 409
          ? "The visit changed before this action was confirmed. Your edits are still here. Refresh the visit before retrying."
          : reason instanceof Error
            ? reason.message
            : "Wrap-up could not be saved. Your edits are still here.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const chartHref = visit.encounter_id
    ? `/clinic/patients/${visit.appointment.patient.id}/encounters/${visit.encounter_id}`
    : null;

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, value) => setExpanded(value)}
      disableGutters
      variant="outlined"
    >
      <AccordionSummary
        expandIcon={<ExpandMoreOutlinedIcon />}
        aria-controls="visit-wrap-up-content"
        id="visit-wrap-up-heading"
      >
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: "center", flexWrap: "wrap" }}
        >
          <Typography component="h2" variant="h6">
            Visit wrap-up
          </Typography>
          <Chip
            size="small"
            variant="outlined"
            label={
              finalized
                ? "Finalized"
                : dirty
                  ? "Unsaved changes"
                  : visit.wrap_up
                    ? "Draft saved"
                    : "Not started"
            }
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails id="visit-wrap-up-content">
        <Stack spacing={2}>
          <Typography color="text.secondary">
            Review the note, record the visit outcome, and confirm what the
            patient should do next.
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            <Button onClick={onReviewScribe} disabled={!visit.encounter_id}>
              Review Scribe draft
            </Button>
            {chartHref &&
              (dirty ? (
                <Button
                  disabled={busy || !canSave || changed}
                  onClick={async () => {
                    if (await submit("save")) {
                      window.setTimeout(() => navigate(chartHref), 0);
                    }
                  }}
                >
                  Save draft and open encounter
                </Button>
              ) : (
                <Button
                  href={chartHref}
                  onClick={(event) => {
                    if (
                      !event.ctrlKey &&
                      !event.metaKey &&
                      !event.shiftKey &&
                      !event.altKey
                    ) {
                      event.preventDefault();
                      navigate(chartHref);
                    }
                  }}
                >
                  Open encounter documentation
                </Button>
              ))}
          </Stack>
          {!visit.encounter_id && (
            <Alert severity="info">
              Start the encounter before preparing its wrap-up.
            </Alert>
          )}
          {visit.status !== "ended" && (
            <Alert severity="info">
              You can prepare a draft during the visit. Finalization becomes
              available after the video call has ended.
            </Alert>
          )}
          {finalized && (
            <Alert severity="success">
              {visit.wrap_up?.publication_state === "released"
                ? "The patient can now read the released instructions."
                : "Wrap-up is finalized. Instructions become available to the patient when the encounter is closed."}
            </Alert>
          )}
          {error && (
            <Alert
              severity="error"
              action={
                <Button
                  color="inherit"
                  disabled={busy}
                  onClick={() => void onRefresh()}
                >
                  Refresh visit
                </Button>
              }
            >
              {error}
            </Alert>
          )}
          {notice && <Alert severity="info">{notice}</Alert>}
          {changed && (
            <Alert severity="warning">
              <Stack spacing={1}>
                <Typography variant="body2">
                  The visit was updated while you were editing. Compare the
                  current saved draft or keep your edits against the latest
                  visit version.
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ flexWrap: "wrap" }}
                >
                  <Button color="inherit" disabled={busy} onClick={restore}>
                    Load saved draft
                  </Button>
                  <Button
                    color="inherit"
                    disabled={busy || !canSave}
                    onClick={() => {
                      setBaseVersion(version);
                      attempt.current = null;
                    }}
                  >
                    Keep my edits
                  </Button>
                </Stack>
              </Stack>
            </Alert>
          )}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 2,
            }}
          >
            <TextField
              select
              label="Visit outcome"
              value={draft.outcome ?? ""}
              disabled={busy || !canSave}
              onChange={(event) =>
                edit({ outcome: event.target.value as Input["outcome"] })
              }
            >
              <MenuItem value="" disabled>
                Choose an outcome
              </MenuItem>
              <MenuItem value="completed">Visit completed</MenuItem>
              <MenuItem value="technical_failure">
                Unable to complete video visit
              </MenuItem>
              <MenuItem value="follow_up_needed">
                Further follow-up needed
              </MenuItem>
            </TextField>
            <TextField
              select
              label="Scribe review"
              value={draft.scribe_review_status ?? ""}
              disabled={busy || !canSave}
              onChange={(event) =>
                edit({
                  scribe_review_status: event.target
                    .value as Input["scribe_review_status"],
                })
              }
              helperText="Review and export remain part of the exact encounter."
            >
              <MenuItem value="" disabled>
                Choose review status
              </MenuItem>
              <MenuItem value="not_used">Scribe was not used</MenuItem>
              <MenuItem value="reviewed">Scribe draft reviewed</MenuItem>
              <MenuItem value="deferred">Review still needed</MenuItem>
            </TextField>
          </Box>
          <TextField
            label="Clinician wrap-up notes"
            value={draft.clinician_notes ?? ""}
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 8000 } }}
            disabled={busy || !canSave}
            onChange={(event) => edit({ clinician_notes: event.target.value })}
            helperText="For the care team only. These notes do not replace the signed encounter note."
          />
          <TextField
            select
            label="Signed patient instructions"
            value={draft.instruction_note_revision_id ?? ""}
            disabled={busy || !canSave}
            onChange={(event) => {
              const id = Number(event.target.value) || null;
              const revision = options?.instruction_revisions.find(
                (item) => item.id === id,
              );
              edit({
                instruction_note_revision_id: id,
                ...(revision
                  ? { patient_instructions: revision.patient_instructions }
                  : {}),
              });
            }}
            helperText="Select instructions from the signed encounter note before finalizing."
          >
            <MenuItem value="">
              Draft — no signed instructions selected
            </MenuItem>
            {(options?.instruction_revisions ?? []).map((item) => (
              <MenuItem key={item.id} value={item.id}>
                Signed {new Date(item.signed_at).toLocaleString()}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Patient instructions"
            value={draft.patient_instructions ?? ""}
            multiline
            minRows={3}
            slotProps={{ htmlInput: { maxLength: 4000 } }}
            disabled={
              busy || !canSave || Boolean(draft.instruction_note_revision_id)
            }
            onChange={(event) =>
              edit({ patient_instructions: event.target.value })
            }
            helperText="Draft text stays private until it matches signed encounter instructions and is released."
          />
          <TextField
            select
            label="Follow-up"
            value={draft.follow_up_status ?? ""}
            disabled={busy || !canSave}
            onChange={(event) =>
              edit({
                follow_up_status: event.target
                  .value as Input["follow_up_status"],
                follow_up_appointment_id: null,
              })
            }
          >
            <MenuItem value="" disabled>
              Choose a follow-up plan
            </MenuItem>
            <MenuItem value="none">No follow-up required</MenuItem>
            <MenuItem value="needed">Follow-up needs arranging</MenuItem>
            <MenuItem value="arranged">Link a scheduled appointment</MenuItem>
          </TextField>
          {draft.follow_up_status === "arranged" && (
            <TextField
              select
              label="Scheduled follow-up appointment"
              value={draft.follow_up_appointment_id ?? ""}
              disabled={busy || !canSave}
              onChange={(event) =>
                edit({
                  follow_up_appointment_id: Number(event.target.value) || null,
                })
              }
              helperText="Only an existing appointment for this patient can be linked."
            >
              <MenuItem value="" disabled>
                Select an appointment
              </MenuItem>
              {(options?.follow_up_appointments ?? []).map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {new Date(item.starts_at).toLocaleString(undefined, {
                    timeZone: item.timezone,
                  })}{" "}
                  ({item.timezone})
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            label="Follow-up instructions"
            value={draft.follow_up_plan ?? ""}
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 4000 } }}
            disabled={busy || !canSave}
            onChange={(event) => edit({ follow_up_plan: event.target.value })}
            helperText="State the agreed next step. Saving this text does not book an appointment or send a message."
          />
          {!finalized && Boolean(options?.blockers.length) && (
            <Alert severity="info">
              <Typography variant="subtitle2">Before finalizing</Typography>
              <Box component="ul" sx={{ pl: 2.5, my: 0.5 }}>
                {options?.blockers.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </Box>
            </Alert>
          )}
          {!finalized && (
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: "wrap" }}
            >
              <Button
                variant="outlined"
                disabled={busy || !canSave || changed}
                onClick={() => void submit("save")}
              >
                {busy ? "Saving…" : "Save wrap-up draft"}
              </Button>
              <Button
                variant="contained"
                disabled={busy || !canFinalize}
                onClick={() => void submit("finalize")}
              >
                Finalize wrap-up
              </Button>
              {dirty && (
                <Button disabled={busy} onClick={restore}>
                  Discard unsaved changes
                </Button>
              )}
            </Stack>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
