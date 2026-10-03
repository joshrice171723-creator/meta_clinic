import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { api } from "../../api/client";

export function QaObservationDialog({
  open,
  revision,
  tasks,
  onClose,
  onSaved,
}: {
  open: boolean;
  revision: string;
  tasks: { id: number; title: string; revision: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestKey] = useState(() => crypto.randomUUID());
  const [provenance, setProvenance] = useState("");
  const [taskId, setTaskId] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/api/qa/events", {
        method: "POST",
        body: {
          event: {
            kind: "observation_recorded",
            event_key: requestKey,
            revision,
            summary: form.get("summary"),
            payload: {
              provenance,
              details: form.get("details"),
              ...(taskId ? { task_id: Number(taskId) } : {}),
            },
          },
        },
      });
      onClose();
      await onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Observation could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      fullWidth
      maxWidth="sm"
      aria-labelledby="qa-observation-title"
    >
      <form onSubmit={(event) => void submit(event)}>
        <DialogTitle id="qa-observation-title">Record observation</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: 2 }}>
          <p>
            Saved with automatic build observations. Tasks and defect verdicts
            remain unchanged.
          </p>
          <code>{revision}</code>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Summary"
            name="summary"
            required
            fullWidth
            autoFocus
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
          <TextField
            label="Source of this note"
            select
            value={provenance}
            onChange={(event) => setProvenance(event.target.value)}
            required
            fullWidth
            disabled={busy}
          >
            <MenuItem value="observed">Observed directly</MenuItem>
            <MenuItem value="reported">Reported by another source</MenuItem>
          </TextField>
          <TextField
            label="Details and source"
            name="details"
            required
            multiline
            minRows={4}
            fullWidth
            disabled={busy}
            helperText="Describe what you observed, or name the source of the report. Use synthetic QA notes."
            slotProps={{ htmlInput: { maxLength: 5000 } }}
          />
          <TextField
            label="Related task (optional)"
            select
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
            fullWidth
            disabled={busy}
          >
            <MenuItem value="">No related task</MenuItem>
            {tasks.map((task) => (
              <MenuItem key={task.id} value={String(task.id)}>
                #{task.id}: {task.title}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy || !provenance}
          >
            Save observation
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
