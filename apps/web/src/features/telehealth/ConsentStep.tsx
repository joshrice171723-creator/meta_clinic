import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import type { TelehealthPolicy } from "./types";

export function ConsentStep({
  policy,
  busy,
  error,
  onBack,
  onAccept,
  onDecline,
}: {
  policy: TelehealthPolicy;
  busy: boolean;
  error?: string | null;
  onBack: () => void;
  onAccept: () => Promise<void>;
  onDecline: () => Promise<void>;
}) {
  const [agreed, setAgreed] = useState(false);
  useEffect(() => setAgreed(false), [policy.version]);
  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h5">{policy.title}</Typography>
        <Typography variant="caption" color="text.secondary">
          Policy version {policy.version}
        </Typography>
      </div>
      <Typography sx={{ whiteSpace: "pre-wrap" }}>{policy.body}</Typography>
      {policy.instructions && (
        <Alert severity="info">{policy.instructions}</Alert>
      )}
      <FormControlLabel
        control={
          <Checkbox
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            disabled={busy}
          />
        }
        label="I have read this telehealth policy and agree to continue."
      />
      {error && <Alert severity="error">{error}</Alert>}
      <Stack
        direction={{ xs: "column-reverse", sm: "row" }}
        spacing={1}
        sx={{ justifyContent: "space-between" }}
      >
        <Button disabled={busy} onClick={onBack}>Back</Button>
        <Stack direction={{ xs: "column-reverse", sm: "row" }} spacing={1}>
          <Button
            color="inherit"
            disabled={busy}
            onClick={() => void onDecline().catch(() => undefined)}
          >
            I do not agree
          </Button>
          <Button
            variant="contained"
            disabled={!agreed || busy}
            onClick={() => void onAccept().catch(() => undefined)}
          >
            {busy ? "Saving…" : "I agree and enter waiting room"}
          </Button>
        </Stack>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        Recording consent is separate and will be requested only if Scribe is
        used during the visit.
      </Typography>
    </Stack>
  );
}
