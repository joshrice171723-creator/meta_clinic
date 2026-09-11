import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { ClinicBillingSupportRequest } from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";
import { patientReferenceLabel } from "./patientReference";

function statusLabel(value: ClinicBillingSupportRequest["status"]) {
  return value.replaceAll("_", " ");
}

export function BillingSupportRequestQueue({
  canManage,
}: {
  canManage: boolean;
}) {
  const requests = useResource<{
    support_requests: ClinicBillingSupportRequest[];
  }>("/api/clinic/billing/support_requests");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const attempts = useRef(new Map<string, string>());
  const openRequests = requests.data?.support_requests.filter((request) =>
    ["pending", "in_review"].includes(request.status),
  );

  const transition = async (
    request: ClinicBillingSupportRequest,
    status: "in_review" | "resolved" | "declined",
  ) => {
    if (!canManage || busyId !== null) return;
    const key = `${request.id}:${status}:${notes[request.id] ?? ""}`;
    const requestKey = attempts.current.get(key) ?? crypto.randomUUID();
    attempts.current.set(key, requestKey);
    setBusyId(request.id);
    setError("");
    setNotice("");
    try {
      await api(
        `/api/clinic/billing/support_requests/${request.id}/transition`,
        {
          method: "POST",
          body: {
            support_request: {
              request_key: requestKey,
              status,
              review_note: notes[request.id]?.trim() || undefined,
            },
          },
        },
      );
      attempts.current.delete(key);
      setNotice(
        `Support request #${request.id} marked ${statusLabel(status)}.`,
      );
      requests.refresh();
    } catch (reason) {
      const unknown =
        reason instanceof ApiError &&
        (reason.status === 408 ||
          reason.status >= 500 ||
          reason.code === "outcome_unconfirmed");
      setError(
        unknown
          ? "The review outcome is not confirmed. Retry the same action before choosing another state."
          : reason instanceof Error
            ? reason.message
            : "The support request could not be updated.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Paper
      component="section"
      variant="outlined"
      sx={{ p: { xs: 2, md: 3 }, mt: 3 }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography component="h2" variant="h5">
            Patient billing support
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Requests are patient-initiated and require a staff response outside
            this queue when follow-up is needed.
          </Typography>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        {!requests.data && !requests.error && (
          <Typography role="status">
            Loading billing support requests…
          </Typography>
        )}
        {requests.error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={requests.refresh}>
                Retry
              </Button>
            }
          >
            {requests.error}
          </Alert>
        )}
        {openRequests?.length === 0 && (
          <Typography color="text.secondary">
            No pending billing support requests.
          </Typography>
        )}
        {openRequests?.map((request) => (
          <Box
            key={request.id}
            sx={{ borderTop: "1px solid", borderColor: "divider", pt: 2 }}
          >
            <Stack spacing={1.25}>
              <Box>
                <Typography sx={{ fontWeight: 700 }}>
                  {request.patient.display_name}
                  {patientReferenceLabel(request.patient.reference) &&
                    ` · ${patientReferenceLabel(request.patient.reference)}`}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Request #{request.id} · {statusLabel(request.status)} ·{" "}
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(request.requested_at))}
                </Typography>
              </Box>
              <Typography sx={{ whiteSpace: "pre-wrap" }}>
                {request.content}
              </Typography>
              {canManage && (
                <>
                  <TextField
                    label="Internal review note (optional)"
                    value={notes[request.id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                    disabled={busyId === request.id}
                    slotProps={{ htmlInput: { maxLength: 1000 } }}
                    fullWidth
                  />
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button
                      disabled={busyId !== null}
                      onClick={() => void transition(request, "in_review")}
                    >
                      Mark reviewing
                    </Button>
                    <Button
                      variant="contained"
                      disabled={busyId !== null}
                      onClick={() => void transition(request, "resolved")}
                    >
                      Resolve
                    </Button>
                    <Button
                      color="inherit"
                      disabled={busyId !== null}
                      onClick={() => void transition(request, "declined")}
                    >
                      Decline
                    </Button>
                  </Stack>
                </>
              )}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
