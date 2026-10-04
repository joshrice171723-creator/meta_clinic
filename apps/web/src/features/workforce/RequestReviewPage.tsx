import { useRef, useState } from "react";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import {
  Alert,
  Button,
  Chip,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { useClinic } from "../clinic/Workspace";
import { requestKey, type WorkforceRequest } from "./scheduleTypes";
import { WorkforceRequestDetails } from "./WorkforceRequestDetails";

export function RequestReviewPage() {
  const { current_site: currentSite } = useClinic();
  const {
    data,
    error: loadError,
    refresh,
  } = useResource<{ requests: WorkforceRequest[] }>(
    `/api/clinic/workforce/requests?review=true&site_id=${currentSite?.id ?? ""}`,
    { enabled: !!currentSite },
  );
  const attempts = useRef(new Map<string, string>());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  if (!currentSite)
    return (
      <Alert severity="info">
        Select a clinic location to review workforce requests.
      </Alert>
    );
  if (!data) return <LoadState error={loadError} onRetry={refresh} />;
  const requests = data.requests;
  const decide = async (
    request: WorkforceRequest,
    decision: "manager_approve" | "manager_deny",
  ) => {
    if (busyId || request.site_id !== String(currentSite.id)) return;
    const reason = reasons[request.id]?.trim() || null;
    const signature = JSON.stringify([
      request.id,
      request.revision,
      decision,
      reason,
    ]);
    const key = attempts.current.get(signature) ?? requestKey(decision);
    attempts.current.set(signature, key);
    setBusyId(request.id);
    setError(undefined);
    setNotice(undefined);
    try {
      await api(`/api/clinic/workforce/requests/${request.id}/decision`, {
        method: "POST",
        body: {
          decision: {
            decision,
            expected_revision: request.revision,
            reason,
            idempotency_key: key,
          },
        },
      });
      attempts.current.delete(signature);
      setNotice(
        decision === "manager_approve"
          ? "Request approved and persisted."
          : "Request denied and persisted.",
      );
      refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save this decision.",
      );
    } finally {
      setBusyId(undefined);
    }
  };
  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="overline" color="text.secondary">
          WORKFORCE / REVIEW
        </Typography>
        <Typography variant="h1">Request review</Typography>
        <Typography color="text.secondary">
          Review only requests for {currentSite.name}. Shift swaps appear for
          manager approval only after the target employee accepts.
        </Typography>
      </div>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      <Button onClick={refresh} disabled={!!busyId} sx={{ alignSelf: "start" }}>
        Refresh requests
      </Button>
      {requests.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h2">Nothing awaiting review</Typography>
          <Typography color="text.secondary">
            Submitted requests and target-accepted swaps will appear here.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {requests.map((request) => (
            <Paper variant="outlined" sx={{ p: 2 }} key={request.id}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                sx={{
                  justifyContent: "space-between",
                  alignItems: { md: "center" },
                }}
              >
                <Stack spacing={1} sx={{ flex: 1 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center" }}
                  >
                    <Chip size="small" label={request.status} />
                  </Stack>
                  <WorkforceRequestDetails request={request} />
                  <TextField
                    label="Review reason (optional)"
                    value={reasons[request.id] ?? ""}
                    onChange={(event) =>
                      setReasons((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                    disabled={!!busyId}
                    multiline
                    minRows={2}
                    slotProps={{ htmlInput: { maxLength: 500 } }}
                  />
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button
                    color="inherit"
                    startIcon={<CloseIcon />}
                    disabled={
                      !!busyId ||
                      (request.type === "shift_swap_request" &&
                        request.status !== "accepted")
                    }
                    onClick={() => decide(request, "manager_deny")}
                  >
                    Deny
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<CheckIcon />}
                    disabled={
                      !!busyId ||
                      (request.type === "shift_swap_request" &&
                        request.status !== "accepted")
                    }
                    onClick={() => decide(request, "manager_approve")}
                  >
                    Approve
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
