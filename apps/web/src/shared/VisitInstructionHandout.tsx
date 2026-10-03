import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { formatDisplayDateTime } from "./dateTime";
import { useResource } from "./ui";

export type VisitInstructionHandoutItem = {
  encounter_id: number;
  visit_at: string;
  signed_at: string;
  instructions: string;
  patient_name: string;
  practice_name: string;
  timezone: string;
};

type VisitInstructionHandoutResponse = {
  item: VisitInstructionHandoutItem | null;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function dateLabel(value: string, timezone: string) {
  return formatDisplayDateTime(value, { timeZone: timezone });
}

export function visitInstructionHandoutHtml(item: VisitInstructionHandoutItem) {
  const visit = dateLabel(item.visit_at, item.timezone);
  const signed = dateLabel(item.signed_at, item.timezone);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>After-visit instructions</title>
<style>
  @page { margin: 0.65in; }
  body { color: #111; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 12pt; line-height: 1.5; margin: 0; padding: 24px; }
  @media print { body { padding: 0; } }
  h1 { font-size: 20pt; line-height: 1.2; margin: 0 0 0.25rem; }
  h2 { font-size: 14pt; line-height: 1.3; margin: 1.5rem 0 0.5rem; }
  .practice { font-size: 14pt; font-weight: 700; margin-bottom: 1rem; }
  .meta { border-top: 1px solid #aaa; border-bottom: 1px solid #aaa; margin: 1rem 0; padding: 0.7rem 0; }
  .meta p { margin: 0.15rem 0; }
  .instructions { overflow-wrap: anywhere; white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="practice">${escapeHtml(item.practice_name)}</div>
  <h1>After-visit instructions</h1>
  <div class="meta">
    <p><strong>Patient:</strong> ${escapeHtml(item.patient_name)}</p>
    <p><strong>Visit:</strong> ${escapeHtml(visit)} (${escapeHtml(item.timezone)})</p>
    <p><strong>Signed:</strong> ${escapeHtml(signed)} (${escapeHtml(item.timezone)})</p>
  </div>
  <h2>Instructions from your clinic</h2>
  <div class="instructions">${escapeHtml(item.instructions)}</div>
</body>
</html>`;
}

export function VisitInstructionHandout({
  endpoint,
  onClose,
}: {
  endpoint: string;
  onClose: () => void;
}) {
  const resource = useResource<VisitInstructionHandoutResponse>(endpoint);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loadedHandout, setLoadedHandout] = useState("");
  const [printError, setPrintError] = useState("");
  const item = resource.data?.item ?? null;
  const handout = item ? visitInstructionHandoutHtml(item) : "";
  const iframeReady = Boolean(item) && loadedHandout === handout;

  useEffect(() => {
    setPrintError("");
  }, [handout]);

  const print = () => {
    const frame = iframeRef.current;
    if (!item || !iframeReady || !frame?.contentWindow) {
      setPrintError("The handout preview is not ready to print.");
      return;
    }
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      setPrintError("The handout could not be opened for printing.");
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="md"
      aria-labelledby="visit-instruction-handout-title"
    >
      <DialogTitle id="visit-instruction-handout-title">
        After-visit instructions handout
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {!resource.data && !resource.error && (
            <Stack
              direction="row"
              spacing={1.5}
              role="status"
              sx={{ alignItems: "center" }}
            >
              <CircularProgress size={20} />
              <Typography>Loading released instructions…</Typography>
            </Stack>
          )}
          {resource.error && (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={resource.refresh}>
                  Retry
                </Button>
              }
            >
              The released instructions could not be loaded. {resource.error}
            </Alert>
          )}
          {resource.data && !item && (
            <Alert severity="info">
              No signed instructions were released for this completed visit.
            </Alert>
          )}
          {printError && <Alert severity="error">{printError}</Alert>}
          {item && (
            <Box
              sx={{
                border: "1px solid",
                borderColor: "divider",
                minHeight: 480,
                overflow: "hidden",
              }}
            >
              <iframe
                ref={iframeRef}
                title="After-visit instructions handout preview"
                sandbox="allow-same-origin allow-modals"
                srcDoc={handout}
                onLoad={() => setLoadedHandout(handout)}
                style={{
                  border: 0,
                  display: "block",
                  height: 560,
                  width: "100%",
                }}
              />
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Tooltip title="Print this handout or save it as a PDF in the browser dialog.">
          <span>
            <Button
              variant="contained"
              disabled={!item || !iframeReady}
              onClick={print}
            >
              Print / save PDF
            </Button>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
}

export default VisitInstructionHandout;
