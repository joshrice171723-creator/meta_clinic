import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { inspectMusePublicKey } from "./museBrowserKey";
export function MuseKeyApproval({ revision }: { revision?: string }) {
  const [publicKey, setPublicKey] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef({ body: "", id: "" });
  useEffect(() => {
    let active = true;
    setFingerprint("");
    setError("");
    setNotice("");
    if (publicKey.trim())
      void inspectMusePublicKey(publicKey)
        .then((result) => {
          if (active) setFingerprint(result.fingerprint);
        })
        .catch((reason) => {
          if (active) setError(reason.message);
        });
    return () => {
      active = false;
    };
  }, [publicKey]);
  const approve = async () => {
    if (!fingerprint) return;
    setBusy(true);
    setError("");
    try {
      const body = {
        fingerprint,
        public_key: publicKey.trim(),
        build_pin: revision ?? null,
      };
      const serialized = JSON.stringify(body);
      if (pending.current.body !== serialized)
        pending.current = { body: serialized, id: crypto.randomUUID() };
      const csrf = await fetch("/api/csrf", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!csrf.ok) throw new Error("Owner session unavailable.");
      const { csrf_token } = await csrf.json();
      const response = await fetch("/qa/api/enrollment/approve", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf_token,
        },
        body: JSON.stringify({ ...body, idempotency_key: pending.current.id }),
      });
      const receipt = await response.json();
      if (!response.ok) throw new Error(receipt.error || "Approval failed.");
      if (receipt.fingerprint !== fingerprint)
        throw new Error(
          "Approval receipt fingerprint differs. Stop and inspect.",
        );
      setNotice("Muse approved: " + receipt.fingerprint);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Approval failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper
      component="section"
      variant="outlined"
      aria-label="Muse key approval"
      sx={{ p: 2, my: 2 }}
    >
      <Stack spacing={1.5}>
        <Typography variant="h6">Approve Muse</Typography>
        <TextField
          label="Muse public key"
          multiline
          minRows={2}
          value={publicKey}
          disabled={busy}
          onChange={(e) => setPublicKey(e.target.value)}
          helperText="Paste the ssh-ed25519 public key. Compare the fingerprint below with Muse."
        />
        {fingerprint && (
          <Typography
            sx={{ overflowWrap: "anywhere", fontFamily: "monospace" }}
          >
            {fingerprint}
          </Typography>
        )}
        <Typography variant="body2">
          Permissions: claim workflows, record verdicts, file defects, select
          verified test data, request retests.
        </Typography>
        <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
          Build: {revision || "Unavailable"}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        <Button
          variant="contained"
          disabled={busy || !fingerprint || !!notice}
          onClick={() => void approve()}
        >
          Approve Muse
        </Button>
      </Stack>
    </Paper>
  );
}
