import { useEffect, useState } from "react";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { Alert, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { api } from "../../api/client";
import { LoadState } from "../../shared/ui";
import { useClinic } from "../clinic/Workspace";
import { requestKey, type WorkforceRequest } from "./scheduleTypes";

export function RequestReviewPage() {
  const { current_site: currentSite } = useClinic();
  const [requests, setRequests] = useState<WorkforceRequest[]>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const load = async () => {
    if (!currentSite) return;
    try {
      const data = await api<{ requests: WorkforceRequest[] }>(
        `/api/clinic/workforce/requests?review=true&site_id=${currentSite.id}`,
      );
      setRequests(data.requests);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load request review.",
      );
    }
  };
  useEffect(() => {
    void load();
  }, [currentSite?.id]);
  if (!currentSite)
    return (
      <Alert severity="info">
        Select a clinic location to review workforce requests.
      </Alert>
    );
  if (!requests) return <LoadState error={error} />;
  const decide = async (
    request: WorkforceRequest,
    decision: "manager_approve" | "manager_deny",
  ) => {
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
            idempotency_key: requestKey(decision),
          },
        },
      });
      setNotice(
        decision === "manager_approve"
          ? "Request approved and persisted."
          : "Request denied and persisted.",
      );
      await load();
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
                <div>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center" }}
                  >
                    <Typography variant="h3">
                      {request.type.replaceAll("_", " ")}
                    </Typography>
                    <Chip size="small" label={request.status} />
                  </Stack>
                  <Typography>{request.reason}</Typography>
                  {request.type === "shift_swap_request" && (
                    <Typography color="text.secondary">
                      Target: {request.target_employee_name}
                    </Typography>
                  )}
                </div>
                <Stack direction="row" spacing={1}>
                  <Button
                    color="inherit"
                    startIcon={<CloseIcon />}
                    disabled={busyId === request.id}
                    onClick={() => decide(request, "manager_deny")}
                  >
                    Deny
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<CheckIcon />}
                    disabled={busyId === request.id}
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
