import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import type { ButtonProps } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { isDemoFrame } from "../demo/frame";

export function BillingDocumentPreview({
  title,
  path,
  marker,
  onClose,
}: {
  title: string;
  path: string;
  marker: string;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const documentUrl = `${isDemoFrame() ? "/api/demo-workspace" : "/api"}${path}`;
  useEffect(() => {
    if (ready || error) return;
    const timeout = window.setTimeout(
      () =>
        setError(
          "The document did not load. Close this preview, check your session, and try again.",
        ),
      15000,
    );
    return () => window.clearTimeout(timeout);
  }, [ready, error]);
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="md"
      aria-labelledby="billing-document-title"
    >
      <DialogTitle id="billing-document-title">{title}</DialogTitle>
      <DialogContent dividers>
        {!ready && !error && (
          <Typography role="status">Loading document…</Typography>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {ready && (
          <Alert severity="info">
            Open the print view in a separate tab, then use its Print button to
            choose a printer or Save as PDF. This preview remains available.
          </Alert>
        )}
        <Box
          component="iframe"
          ref={frame}
          title={`${title} preview`}
          src={documentUrl}
          sandbox="allow-same-origin allow-modals"
          onLoad={() => {
            const loaded =
              frame.current?.contentDocument?.querySelector(marker);
            if (loaded) loaded.closest(".actions")?.remove();
            setReady(Boolean(loaded));
            if (!loaded)
              setError(
                "The document could not be loaded. Check your session and billing access, then reopen it.",
              );
          }}
          onError={() =>
            setError(
              "The document could not be loaded. Reopen it to try again.",
            )
          }
          sx={{ border: 0, display: "block", height: 560, width: "100%" }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          component="a"
          variant="contained"
          disabled={!ready}
          href={ready ? documentUrl : undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open print / PDF view
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function BillingReceiptButton({
  paymentId,
  receiptId,
  children = "Open receipt",
  ...props
}: ButtonProps & { paymentId: number; receiptId?: number }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [paymentId, receiptId]);
  return (
    <>
      <Button {...props} onClick={() => setOpen(true)}>
        {children}
      </Button>
      {open && (
        <BillingDocumentPreview
          title="Receipt"
          path={`/clinic/payment_events/${paymentId}/receipt${receiptId ? `?receipt_id=${receiptId}` : ""}`}
          marker="#print-receipt"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
