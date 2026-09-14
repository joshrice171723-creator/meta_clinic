import {
  Alert,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { LabReport } from "./PatientLabReports";

export function LabReportActionsPanel({
  report,
  reports,
  canWrite,
  onChanged,
}: {
  report: LabReport;
  reports: LabReport[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [replacement, setReplacement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{
    lab_action: {
      kind: string;
      note: string;
      replacement_report_id: string | null;
      request_key: string;
    };
  } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const actions = report.current_version.actions ?? [];
  const recollection = actions.find(
    (action) => action.kind === "recollection_requested",
  );
  async function send(body: NonNullable<typeof pending>) {
    setBusy(true);
    setPending(body);
    setError("");
    try {
      await api(
        `/api/clinic/patients/${report.patient_id}/lab_reports/${report.id}/versions/${report.current_version_id}/actions`,
        { method: "POST", body },
      );
      if (mounted.current) {
        setPending(null);
        onChanged();
      }
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "The lab action is not confirmed.",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function record(kind: string) {
    void send({
      lab_action: {
        kind,
        note,
        replacement_report_id:
          kind === "recollection_completed" ? replacement : null,
        request_key: crypto.randomUUID(),
      },
    });
  }
  return (
    <Stack spacing={1} sx={{ mt: 1.5 }}>
      {report.current_version.results.some(
        (result) => result.value_kind === "absent",
      ) && (
        <Alert severity="info">
          Some results are still pending. Review available results or follow up
          with the laboratory.
        </Alert>
      )}
      {actions.map((action) => (
        <Typography variant="body2" key={action.id}>
          {action.kind.replaceAll("_", " ")} ·{" "}
          {new Date(action.recorded_at).toLocaleString()} · {action.note}
          {action.clinical_task_id
            ? ` · Clinical team task ${action.clinical_task_id}`
            : ""}
        </Typography>
      ))}
      {error && <Alert severity="warning">{error}</Alert>}
      {pending && (
        <Button disabled={busy} onClick={() => void send(pending)}>
          Retry exact lab action
        </Button>
      )}
      {!actions.some((action) => action.kind === "acknowledged") && (
        <Button
          disabled={!canWrite || busy || !!pending}
          onClick={() => record("acknowledged")}
        >
          Acknowledge receipt of this version
        </Button>
      )}
      <Typography variant="caption">
        Acknowledgment records receipt. Review, handling and patient
        communication remain separate.
      </Typography>
      {["rejected", "compromised"].includes(
        report.specimen?.condition_code ?? "",
      ) && (
        <>
          <TextField
            label="Recollection instructions or outcome"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={busy || !!pending}
          />
          {!recollection ? (
            <Button
              disabled={!canWrite || busy || !!pending || !note.trim()}
              onClick={() => record("recollection_requested")}
            >
              Request recollection from clinical team
            </Button>
          ) : (
            !actions.some(
              (action) => action.kind === "recollection_completed",
            ) && (
              <>
                <TextField
                  select
                  label="Later satisfactory report"
                  value={replacement}
                  onChange={(event) => setReplacement(event.target.value)}
                >
                  {reports
                    .filter(
                      (candidate) =>
                        candidate.id !== report.id &&
                        candidate.specimen?.condition_code === "satisfactory",
                    )
                    .map((candidate) => (
                      <MenuItem key={candidate.id} value={String(candidate.id)}>
                        {candidate.current_version.title} ·{" "}
                        {candidate.source_name}
                      </MenuItem>
                    ))}
                </TextField>
                <Button
                  disabled={
                    !canWrite ||
                    busy ||
                    !!pending ||
                    !replacement ||
                    !note.trim()
                  }
                  onClick={() => record("recollection_completed")}
                >
                  Link recollection evidence and complete task
                </Button>
              </>
            )
          )}
        </>
      )}
    </Stack>
  );
}
