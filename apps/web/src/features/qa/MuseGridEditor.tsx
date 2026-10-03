import { useRef, useState } from "react";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import {
  connectMuseKey,
  museWrite,
  type MuseBrowserKey,
} from "./museBrowserKey";
export function MuseKeyConnection({
  connection,
  onConnect,
}: {
  connection?: MuseBrowserKey;
  onConnect: (key?: MuseBrowserKey) => void;
}) {
  const [error, setError] = useState("");
  return (
    <Stack spacing={1} sx={{ my: 1 }}>
      {connection ? (
        <>
          <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
            Muse connected: {connection.fingerprint}
          </Typography>
          <Button onClick={() => onConnect(undefined)}>Disconnect Muse</Button>
        </>
      ) : (
        <Button component="label" variant="outlined">
          Connect Muse key
          <input
            type="file"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                if (file.size > 16384)
                  throw new Error("Key file is too large.");
                onConnect(await connectMuseKey(await file.text()));
                setError("");
              } catch (reason) {
                onConnect(undefined);
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Could not connect Muse.",
                );
              }
            }}
          />
        </Button>
      )}
      <Typography variant="caption">
        The private key stays on this computer and is never uploaded.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
export function MuseGridEditor({
  connection,
  workflowId,
  revision,
  enabled,
  onSaved,
}: {
  connection?: MuseBrowserKey;
  workflowId: string;
  revision?: string;
  enabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const [evidence, setEvidence] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const openedRevision = useRef(revision);
  const requests = useRef(new Map<string, string>());
  const changed = openedRevision.current !== revision;
  const disabled = !connection || !enabled || busy;
  const write = async (action: string, extra: Record<string, unknown> = {}) => {
    if (disabled || !connection) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const input = { build_pin: openedRevision.current ?? null, ...extra };
      const identity = action + JSON.stringify(input);
      let id = requests.current.get(identity);
      if (!id) {
        id = crypto.randomUUID();
        requests.current.set(identity, id);
      }
      await museWrite(connection, action, { ...input, idempotency_key: id });
      await onSaved();
      // Retain unresolved transport intent, but a confirmed receipt ends this
      // request so a later intentional claim can acquire a fresh lease.
      requests.current.delete(identity);
      setNotice("Saved to the coverage grid.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Write failed. Inputs retained.",
      );
    } finally {
      setBusy(false);
    }
  };
  const items = [
    { kind: "observation", text: evidence },
    ...(screenshot ? [{ kind: "screenshot", url: screenshot }] : []),
  ];
  return (
    <Stack spacing={1.5} sx={{ mt: 2 }}>
      <Typography variant="subtitle1">Update {workflowId}</Typography>
      {!connection && (
        <Alert severity="info">
          Connect Muse's key above the grid to edit.
        </Alert>
      )}
      {changed && (
        <Alert severity="warning">
          Deployment boundary observed. Notes remain available; submission
          records the observed build separately from this draft's revision.
        </Alert>
      )}
      <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
        <Button
          disabled={disabled}
          onClick={() =>
            void write("workflow/claim", {
              workflow_id: workflowId,
              agent: "Muse",
            })
          }
        >
          Claim
        </Button>
        <Button
          disabled={disabled}
          onClick={() =>
            void write("test-data/prepare", { workflow_id: workflowId })
          }
        >
          Prepare test data
        </Button>
        <Button
          disabled={disabled}
          onClick={() =>
            void write("retest-request", { workflow_id: workflowId })
          }
        >
          Request retest
        </Button>
      </Stack>
      <TextField
        label="Evidence / observations"
        multiline
        minRows={2}
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
        disabled={busy}
        slotProps={{ htmlInput: { maxLength: 4000 } }}
      />
      <TextField
        label="Screenshot URL (optional)"
        value={screenshot}
        onChange={(e) => setScreenshot(e.target.value)}
        disabled={busy}
      />
      <Stack direction="row" spacing={1}>
        {(["pass", "fail", "blocked"] as const).map((verdict) => (
          <Button
            key={verdict}
            variant="contained"
            disabled={disabled || !evidence.trim()}
            onClick={() =>
              void write("verdict", {
                workflow_id: workflowId,
                verdict,
                evidence: items,
              })
            }
          >
            {verdict}
          </Button>
        ))}
      </Stack>
      <TextField
        label="Defect title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={busy}
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
      {title && (
        <>
          <TextField
            label="Reproduction steps"
            multiline
            minRows={2}
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            disabled={busy}
          />
          <Button
            disabled={disabled || !steps.trim() || !evidence.trim()}
            onClick={() =>
              void write("defect", {
                title,
                repro_steps: steps.split("\n").filter((s) => s.trim()),
                evidence: items,
                affected_workflow_ids: [workflowId],
              })
            }
          >
            Save defect
          </Button>
        </>
      )}
      {error && <Alert severity="error">{error} Inputs retained.</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
    </Stack>
  );
}
