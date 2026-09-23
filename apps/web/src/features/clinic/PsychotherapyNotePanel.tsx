import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import type { EncounterDetail } from "../../api/contracts";
import { LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { useClinicNavigation } from "./clinicNavigation";

type ProtectedRevision = {
  id: number;
  encounter_id: number;
  version: number;
  previous_revision_id: number | null;
  body: string;
  revision_reason: string | null;
  recorded_at: string;
};
type Response = {
  note: ProtectedRevision | null;
  history: ProtectedRevision[];
};
type Attempt = {
  body: string;
  revision_reason: string;
  expected_version: number;
  request_key: string;
};

export function PsychotherapyNotePanel({
  encounter,
}: {
  encounter: EncounterDetail;
}) {
  const { capabilities } = useClinic();
  const { registerBlocker } = useClinicNavigation();
  const enabled =
    capabilities.psychotherapy_notes === true &&
    encounter.individual_therapy_visit === true;
  const path = `/api/clinic/encounters/${encounter.id}/psychotherapy_note`;
  const resource = useResource<Response>(path, { enabled });
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("");
  const [baseline, setBaseline] = useState<
    ProtectedRevision | null | undefined
  >(undefined);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (resource.data && baseline === undefined) {
      setBaseline(resource.data.note);
      setBody(resource.data.note?.body ?? "");
    }
  }, [baseline, resource.data]);

  useEffect(() => {
    if (
      !resource.data ||
      baseline === undefined ||
      attempt ||
      reason ||
      body !== (baseline?.body ?? "")
    )
      return;
    if ((resource.data.note?.version ?? 0) <= (baseline?.version ?? 0)) return;
    setBaseline(resource.data.note);
    setBody(resource.data.note?.body ?? "");
  }, [attempt, baseline, body, reason, resource.data]);

  useEffect(() => {
    if (!attempt || !resource.data?.note) return;
    if (
      resource.data.note.version === attempt.expected_version + 1 &&
      resource.data.note.body === attempt.body
    ) {
      setBaseline(resource.data.note);
      setBody(resource.data.note.body);
      setReason("");
      setAttempt(null);
      setError("");
      setNotice("The saved revision was confirmed after refresh.");
    }
  }, [attempt, resource.data]);

  const dirty =
    baseline !== undefined &&
    (body !== (baseline?.body ?? "") ||
      reason.trim().length > 0 ||
      attempt !== null);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(
    () =>
      registerBlocker(
        dirty
          ? () =>
              "This protected note has unsaved changes. Leave and discard them?"
          : null,
      ),
    [dirty, registerBlocker],
  );

  if (!enabled) return null;
  if (!resource.data || baseline === undefined)
    return <LoadState error={resource.error} onRetry={resource.refresh} />;

  const save = async (exact: Attempt) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    setAttempt(exact);
    try {
      const result = await api<{ note: ProtectedRevision }>(path, {
        method: "PUT",
        body: { psychotherapy_note: exact },
      });
      if (
        result.note.encounter_id !== encounter.id ||
        result.note.version !== exact.expected_version + 1 ||
        result.note.body !== exact.body
      )
        throw new Error(
          "The response did not match this encounter and revision. Refresh before continuing.",
        );
      setBaseline(result.note);
      setBody(result.note.body);
      setReason("");
      setAttempt(null);
      setNotice("Protected note saved.");
      resource.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The save outcome is unknown. Refresh before retrying the exact request.",
      );
    } finally {
      setBusy(false);
    }
  };

  const startSave = () => {
    if (!body.trim() || body.length > 50_000 || attempt) return;
    if (baseline && (!reason.trim() || reason.length > 2_000)) return;
    void save({
      body,
      revision_reason: reason.trim(),
      expected_version: baseline?.version ?? 0,
      request_key: crypto.randomUUID(),
    });
  };

  const discard = () => {
    if (!window.confirm("Discard the local protected-note changes?")) return;
    setAttempt(null);
    setBaseline(resource.data?.note ?? null);
    setBody(resource.data?.note?.body ?? "");
    setReason("");
    setError("");
  };

  return (
    <Paper id="protected-psychotherapy-note" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography component="h2" variant="subtitle1">
            Private psychotherapy note
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Separate from the ordinary clinical note. Only the clinician who
            records this note can reopen it here. Record routine treatment, plan
            and follow-up information in the ordinary clinical note.
          </Typography>
        </Box>
        {error && <Alert severity="warning">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        <TextField
          label="Private session note"
          multiline
          minRows={6}
          fullWidth
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={busy || attempt !== null}
          slotProps={{ htmlInput: { maxLength: 50_000 } }}
        />
        {baseline && (
          <TextField
            label="Reason for revision"
            fullWidth
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy || attempt !== null}
            helperText="Previous versions remain available to you."
            slotProps={{ htmlInput: { maxLength: 2_000 } }}
          />
        )}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          {attempt ? (
            <Button
              variant="contained"
              disabled={busy}
              onClick={() => void save(attempt)}
            >
              Retry exact request
            </Button>
          ) : (
            <Button
              variant="contained"
              disabled={
                busy ||
                !body.trim() ||
                body === (baseline?.body ?? "") ||
                (baseline !== null && !reason.trim())
              }
              onClick={startSave}
            >
              Save protected note
            </Button>
          )}
          <Button disabled={busy} onClick={resource.refresh}>
            Refresh saved note
          </Button>
          {dirty && (
            <Button disabled={busy} onClick={discard}>
              Discard local changes
            </Button>
          )}
        </Stack>
        {baseline && (
          <Typography variant="caption" color="text.secondary">
            Saved version {baseline.version} · {baseline.recorded_at}
          </Typography>
        )}
        {resource.data.history.length > 1 && (
          <Box>
            <Typography variant="subtitle2">Previous versions</Typography>
            {resource.data.history.slice(1).map((revision) => (
              <Paper
                key={revision.id}
                variant="outlined"
                sx={{ p: 1.5, mt: 1 }}
              >
                <Typography variant="caption">
                  Version {revision.version} · {revision.recorded_at}
                </Typography>
                {revision.revision_reason && (
                  <Typography variant="body2">
                    Reason: {revision.revision_reason}
                  </Typography>
                )}
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {revision.body}
                </Typography>
              </Paper>
            ))}
          </Box>
        )}
      </Stack>
    </Paper>
  );
}
