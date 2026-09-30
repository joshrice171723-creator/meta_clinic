import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { PatientRefillRequest } from "../../api/contracts";
import { api } from "../../api/client";
import { useResource } from "../../shared/ui";

import {
  RefillRequestSubmission,
  type RefillRequestAcknowledgement,
} from "./refillRequestSubmission";

const statusLabels: Record<PatientRefillRequest["status"], string> = {
  pending: "Received",
  in_review: "Clinical review",
  resolved: "Completed",
  declined: "Declined",
};

export function PatientRefillRequests() {
  const requests = useResource<{ requests: PatientRefillRequest[] }>(
    "/api/patient_portal/requests?request_type=refill",
  );
  const [medicationName, setMedicationName] = useState("");
  const [pharmacyDestination, setPharmacyDestination] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [outcomeUnconfirmed, setOutcomeUnconfirmed] = useState(false);
  const submission = useRef<RefillRequestSubmission | null>(null);
  submission.current ??= new RefillRequestSubmission(async (attempt) => {
    const response = await api<{ request: RefillRequestAcknowledgement }>(
      "/api/patient_portal/requests",
      {
        method: "POST",
        body: {
          patient_portal_request: {
            request_key: attempt.requestKey,
            request_type: "refill",
            medication_name: attempt.medicationName,
            pharmacy_destination: attempt.pharmacyDestination,
            request_note: attempt.requestNote || undefined,
          },
        },
      },
    );
    return response.request;
  });

  const submit = async () => {
    const current = submission.current!;
    if (current.busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (
        !(await current.submit({
          medicationName,
          pharmacyDestination,
          requestNote,
        }))
      )
        return;
      setMedicationName("");
      setPharmacyDestination("");
      setRequestNote("");
      setNotice(
        "Your refill request is saved. Check its current status below.",
      );
      requests.refresh();
    } catch (reason) {
      setError(
        current.outcomeUnconfirmed
          ? "We could not confirm the request outcome. Your refill details are kept unchanged. Retry the same request before starting another."
          : reason instanceof Error
            ? reason.message
            : "Your refill request could not be sent.",
      );
    } finally {
      setOutcomeUnconfirmed(current.outcomeUnconfirmed);
      setBusy(false);
    }
  };

  return (
    <Paper
      component="section"
      variant="outlined"
      sx={{ p: { xs: 2.5, sm: 3.5 } }}
    >
      <Stack spacing={2.5}>
        <Box>
          <Typography component="h2" variant="h2">
            Request a medication refill
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Tell the clinic which medication and pharmacy to review. Sending a
            request does not authorize a prescription or send anything to a
            pharmacy.
          </Typography>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        <TextField
          fullWidth
          required
          label="Medication name"
          value={medicationName}
          onChange={(event) => setMedicationName(event.target.value)}
          disabled={busy || outcomeUnconfirmed}
          slotProps={{ htmlInput: { maxLength: 240 } }}
        />
        <TextField
          fullWidth
          required
          label="Pharmacy destination"
          value={pharmacyDestination}
          onChange={(event) => setPharmacyDestination(event.target.value)}
          disabled={busy || outcomeUnconfirmed}
          helperText="Enter the pharmacy name and location the clinic should review."
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
        <TextField
          fullWidth
          multiline
          minRows={3}
          label="Note for the clinic (optional)"
          value={requestNote}
          onChange={(event) => setRequestNote(event.target.value)}
          disabled={busy || outcomeUnconfirmed}
          helperText={`${requestNote.length}/2,000 characters`}
          slotProps={{ htmlInput: { maxLength: 2_000 } }}
        />
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={
            busy || !medicationName.trim() || !pharmacyDestination.trim()
          }
          sx={{ alignSelf: "flex-start" }}
          startIcon={
            busy ? <CircularProgress size={18} color="inherit" /> : undefined
          }
        >
          {busy
            ? "Sending request…"
            : outcomeUnconfirmed
              ? "Retry same request"
              : "Send refill request"}
        </Button>

        <Divider />
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Typography component="h3" variant="h6">
            Your refill requests
          </Typography>
          <Button size="small" onClick={requests.refresh}>
            Refresh status
          </Button>
        </Stack>
        {!requests.data && !requests.error && (
          <Typography color="text.secondary" role="status">
            Loading your refill requests…
          </Typography>
        )}
        {requests.error && (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" size="small" onClick={requests.refresh}>
                Retry
              </Button>
            }
          >
            {requests.error}
          </Alert>
        )}
        {requests.data?.requests.length === 0 && (
          <Typography color="text.secondary">
            You have not sent a refill request yet.
          </Typography>
        )}
        {requests.data?.requests.map((request) => (
          <Box
            key={request.id}
            sx={{ borderTop: "1px solid", borderColor: "divider", pt: 2 }}
          >
            <Stack spacing={1}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", flexWrap: "wrap" }}
              >
                <Typography sx={{ fontWeight: 700 }}>
                  {request.medication_name || "Medication details unavailable"}
                </Typography>
                <Chip label={statusLabels[request.status]} size="small" />
              </Stack>
              {request.pharmacy_destination && (
                <Typography variant="body2">
                  Pharmacy: {request.pharmacy_destination}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                Requested{" "}
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(request.requested_at))}
              </Typography>
              {request.patient_message && (
                <Alert
                  severity={request.status === "declined" ? "info" : "success"}
                >
                  <Typography sx={{ fontWeight: 700 }}>
                    {request.decision === "changed"
                      ? "Updated plan"
                      : request.decision === "approved"
                        ? "Clinic response"
                        : "Clinic decision"}
                  </Typography>
                  <Typography sx={{ whiteSpace: "pre-wrap" }}>
                    {request.patient_message}
                  </Typography>
                  {request.reviewed_by && (
                    <Typography variant="caption" color="text.secondary">
                      Reviewed by {request.reviewed_by.display_name}
                    </Typography>
                  )}
                </Alert>
              )}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
