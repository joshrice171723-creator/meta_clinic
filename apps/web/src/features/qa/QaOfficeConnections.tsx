import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";

/** Approval carries a public fingerprint only. The actor keeps its token locally. */
export function QaOfficeConnections({
  disabled,
  onSaved,
}: {
  disabled?: boolean;
  onSaved?: () => void;
}) {
  const [actor, setActor] = useState("muse");
  const [digest, setDigest] = useState("");
  const [name, setName] = useState("Muse Office");
  const [cadence, setCadence] = useState("60");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef<{ content: string; key: string } | undefined>(
    undefined,
  );
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const valid =
    /^[0-9a-f]{64}$/.test(digest.trim()) &&
    !!name.trim() &&
    name.length <= 80 &&
    (actor !== "muse" ||
      (Number.isInteger(Number(cadence)) &&
        Number(cadence) >= 10 &&
        Number(cadence) <= 86400));
  const approve = async () => {
    if (disabled || busy || !valid) return;
    const enrollment = {
      actor,
      digest: digest.trim(),
      name: name.trim(),
      ...(actor === "muse" ? { cadence_seconds: Number(cadence) } : {}),
    };
    const content = JSON.stringify(enrollment);
    if (pending.current?.content !== content)
      pending.current = { content, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/qa/office/enrollments", {
        method: "POST",
        body: {
          enrollment: { ...enrollment, request_key: pending.current.key },
        },
      });
      if (!active.current) return;
      pending.current = undefined;
      setDigest("");
      setNotice(
        `${actor === "muse" ? "Muse" : "dot"} Office connection approved. Waiting for its first authenticated check-in.`,
      );
      onSaved?.();
    } catch (reason) {
      if (active.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Connection approval could not be confirmed.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  };
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2">
        Approve a connection for an agent that generated its credential in its
        own runtime. Paste only its public SHA-256 fingerprint here; its token
        stays with the agent.
      </Typography>
      <Typography variant="body2">
        This grants its own Office messages, assigned work, positions, and
        check-ins. It grants no general QA or deployment access. An existing
        binding must be revoked before replacement.
      </Typography>
      {error && (
        <Alert severity="error">
          {error} Inputs retained. Retry explicitly with the same content.
        </Alert>
      )}
      {notice && (
        <Alert severity="success" role="status">
          {notice}
        </Alert>
      )}
      <Stack
        component="form"
        spacing={1.5}
        onSubmit={(event) => {
          event.preventDefault();
          void approve();
        }}
      >
        <TextField
          label="Office actor"
          select
          value={actor}
          disabled={busy || disabled}
          onChange={(event) => {
            setActor(event.target.value);
            setName(
              event.target.value === "muse" ? "Muse Office" : "dot Office",
            );
          }}
        >
          <MenuItem value="muse">Muse</MenuItem>
          <MenuItem value="dot">dot</MenuItem>
        </TextField>
        <TextField
          label="Connection name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy || disabled}
          required
          slotProps={{ htmlInput: { maxLength: 80 } }}
        />
        <TextField
          label="Public credential fingerprint"
          value={digest}
          onChange={(event) => setDigest(event.target.value)}
          disabled={busy || disabled}
          required
          helperText="64 lowercase hexadecimal characters. Never paste the credential itself."
          slotProps={{
            htmlInput: {
              maxLength: 64,
              pattern: "[0-9a-f]{64}",
              autoComplete: "off",
              spellCheck: false,
            },
          }}
        />
        {actor === "muse" && (
          <TextField
            label="Muse expected check-in interval (seconds)"
            type="number"
            value={cadence}
            onChange={(event) => setCadence(event.target.value)}
            disabled={busy || disabled}
            required
            helperText="Match Muse's actual schedule; this setting does not start or change a schedule."
            slotProps={{ htmlInput: { min: 10, max: 86400, step: 1 } }}
          />
        )}
        <Button
          type="submit"
          variant="contained"
          disabled={busy || disabled || !valid}
        >
          {busy ? "Approving…" : "Approve Office-only connection"}
        </Button>
      </Stack>
    </Stack>
  );
}
