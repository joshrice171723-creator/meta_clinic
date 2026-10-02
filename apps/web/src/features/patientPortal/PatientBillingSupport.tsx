import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { PatientBillingSupportRequest } from "../../api/contracts";
import { api } from "../../api/client";
import { useResource } from "../../shared/ui";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";
import {
  BillingSupportSubmission,
  type BillingSupportAcknowledgement,
} from "./billingSupportSubmission";

function requestStatus(value: PatientBillingSupportRequest["status"]) {
  return value.replaceAll("_", " ");
}

export function PatientBillingSupport() {
  const requests = useResource<{ requests: PatientBillingSupportRequest[] }>(
    "/api/patient_portal/requests",
  );
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcomeUnconfirmed, setOutcomeUnconfirmed] = useState(false);
  const submission = useRef<BillingSupportSubmission | null>(null);
  submission.current ??= new BillingSupportSubmission(async (attempt) => {
    const response = await api<{ request: BillingSupportAcknowledgement }>(
      "/api/patient_portal/requests",
      {
        method: "POST",
        body: {
          patient_portal_request: {
            request_key: attempt.requestKey,
            request_type: "message",
            content: attempt.content,
          },
        },
      },
    );
    return response.request;
  });

  useDemoNavigationBlocker(() => ({
    blocked: Boolean(
      busy ||
      outcomeUnconfirmed ||
      submission.current?.busy ||
      submission.current?.outcomeUnconfirmed,
    ),
    message: content.trim()
      ? "Discard your unsaved billing support question?"
      : null,
  }));

  const submit = async () => {
    const value = content.trim();
    const current = submission.current!;
    if (!value || current.busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!(await current.submit(value))) return;
      setContent("");
      setMessage(
        "Your billing support request is saved for the clinic team to review.",
      );
      requests.refresh();
    } catch (reason) {
      setError(
        current.outcomeUnconfirmed
          ? "We could not confirm the request outcome. Your question is kept unchanged. Retry the same request before starting another."
          : reason instanceof Error
            ? reason.message
            : "Your billing support request could not be sent.",
      );
    } finally {
      setOutcomeUnconfirmed(current.outcomeUnconfirmed);
      setBusy(false);
    }
  };

  return (
    <Paper
      component="section"
      id="billing-support"
      variant="outlined"
      sx={{ p: { xs: 2.5, sm: 3.5 } }}
    >
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h2" component="h2">
            Need billing help?
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Send a question about an invoice, payment, refund, or portal billing
            access. The clinic team reviews requests here; this is not emergency
            care or medical advice.
          </Typography>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        <TextField
          label="Billing question"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={busy || outcomeUnconfirmed}
          multiline
          minRows={3}
          slotProps={{ htmlInput: { maxLength: 10_000 } }}
          helperText={`${content.length}/10,000 characters`}
          fullWidth
        />
        <Button
          variant="contained"
          disabled={busy || !content.trim()}
          onClick={() => void submit()}
          sx={{ alignSelf: "flex-start" }}
          startIcon={
            busy ? <CircularProgress size={18} color="inherit" /> : undefined
          }
        >
          {busy
            ? "Sending request…"
            : outcomeUnconfirmed
              ? "Retry same billing support request"
              : "Send billing support request"}
        </Button>
        {!requests.data && !requests.error && (
          <Typography color="text.secondary" role="status">
            Loading your billing support requests…
          </Typography>
        )}
        {requests.error && (
          <Alert severity="warning">
            Your previous support-request status could not be loaded.{" "}
            {requests.error}
          </Alert>
        )}
        {requests.data && (
          <Stack spacing={1}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", justifyContent: "space-between" }}
            >
              <Typography variant="subtitle2" component="h3">
                Your recent requests
              </Typography>
              <Button size="small" onClick={requests.refresh}>
                Refresh status
              </Button>
            </Stack>
            {requests.data.requests.length === 0 ? (
              <Typography color="text.secondary">
                You have not sent a billing support request yet.
              </Typography>
            ) : (
              requests.data.requests.map((request) => (
                <Box
                  key={request.id}
                  sx={{ pt: 1, borderTop: "1px solid", borderColor: "divider" }}
                >
                  <Typography
                    sx={{ fontWeight: 650, textTransform: "capitalize" }}
                  >
                    {requestStatus(request.status)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Sent{" "}
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(request.requested_at))}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 1 }}
                  >
                    Your message
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {request.content}
                  </Typography>
                </Box>
              ))
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
