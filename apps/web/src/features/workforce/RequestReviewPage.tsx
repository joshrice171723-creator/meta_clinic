import { useEffect, useState } from "react";
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
import { ApiError, api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { useClinic } from "../clinic/Workspace";
import { requestKey, type WorkforceRequest } from "./scheduleTypes";
import { WorkforceRequestDetails } from "./WorkforceRequestDetails";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";

type ReviewDraft = { text: string; employee: string; siteId: string };
type ReviewAttempt = {
  request: WorkforceRequest;
  decision: {
    decision: "manager_approve" | "manager_deny";
    expected_revision: number;
    reason: string | null;
    idempotency_key: string;
  };
};

export function RequestReviewPage() {
  const { current_site: currentSite } = useClinic();
  const { registerBlocker } = useClinicNavigation();
  const {
    data,
    error: loadError,
    refresh,
  } = useResource<{ requests: WorkforceRequest[] }>(
    `/api/clinic/workforce/requests?review=true&site_id=${currentSite?.id ?? ""}`,
    { enabled: !!currentSite },
  );
  const [reasons, setReasons] = useState<Record<string, ReviewDraft>>({});
  const [pendingAttempt, setPendingAttempt] = useState<ReviewAttempt | null>(
    null,
  );
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const controlsLocked = !!busyId || pendingAttempt !== null;
  const leaveMessage = busyId
    ? "A request decision is still saving."
    : pendingAttempt
      ? "A request decision is unconfirmed. Leaving loses its saved retry."
      : Object.values(reasons).some((draft) => draft.text.trim())
        ? "Leave unsaved review reasons? They will be lost if this page closes."
        : null;
  useDemoNavigationBlocker(() => ({
    blocked: !!busyId,
    message: leaveMessage,
  }));
  useEffect(() => {
    if (!leaveMessage) return;
    const unregister = registerBlocker(() => leaveMessage, {
      preventNavigation: !!busyId,
    });
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = leaveMessage;
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [leaveMessage, busyId, registerBlocker]);

  function discardReason(id: string) {
    setReasons((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  async function sendDecision(attempt: ReviewAttempt) {
    if (busyId || attempt.request.site_id !== String(currentSite?.id ?? ""))
      return;
    const recovering = pendingAttempt !== null;
    setPendingAttempt(attempt);
    setBusyId(attempt.request.id);
    setError(undefined);
    setNotice(undefined);
    try {
      await api(
        `/api/clinic/workforce/requests/${attempt.request.id}/decision`,
        {
          method: "POST",
          body: {
            decision: attempt.decision,
          },
        },
      );
      setPendingAttempt(null);
      discardReason(attempt.request.id);
      setNotice(
        attempt.decision.decision === "manager_approve"
          ? "Request approval saved."
          : "Request denial saved.",
      );
      refresh();
    } catch (reason) {
      const rejected =
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        ![408, 429].includes(reason.status) &&
        !["outcome_unconfirmed", "session_changed"].includes(reason.code ?? "");
      if (rejected && !recovering) setPendingAttempt(null);
      setError(
        `${reason instanceof Error ? reason.message : "Unable to confirm this decision."} ${rejected && !recovering ? "Refresh and review the request before trying again." : "Retry the saved decision to confirm its original outcome."}`,
      );
    } finally {
      setBusyId(undefined);
    }
  }
  const decide = async (
    request: WorkforceRequest,
    decision: ReviewAttempt["decision"]["decision"],
  ) => {
    if (controlsLocked) return;
    await sendDecision({
      request,
      decision: {
        decision,
        expected_revision: request.revision,
        reason: reasons[request.id]?.text.trim() || null,
        idempotency_key: requestKey(decision),
      },
    });
  };
  const feedback = (
    <>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {pendingAttempt && (
        <Alert severity="warning">
          The decision for{" "}
          {pendingAttempt.request.employee_name || "this employee"} is
          unconfirmed. Its original request, reason and retry key are retained.
          <Stack spacing={1} sx={{ mt: 1 }}>
            <WorkforceRequestDetails request={pendingAttempt.request} />
            <Typography>
              Decision:{" "}
              {pendingAttempt.decision.decision === "manager_approve"
                ? "Approve"
                : "Deny"}
              . Review reason:{" "}
              {pendingAttempt.decision.reason || "None entered"}
            </Typography>
            {pendingAttempt.request.site_id !==
              String(currentSite?.id ?? "") && (
              <Typography>
                Return to{" "}
                {pendingAttempt.request.site_name || "the original location"} to
                retry this decision.
              </Typography>
            )}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                disabled={
                  !!busyId ||
                  pendingAttempt.request.site_id !==
                    String(currentSite?.id ?? "")
                }
                onClick={() => void sendDecision(pendingAttempt)}
              >
                Retry saved decision
              </Button>
              <Button
                disabled={!!busyId}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Stop retrying this decision? It may already be saved. Refresh and review the current request state before deciding again.",
                    )
                  )
                    return;
                  setPendingAttempt(null);
                  refresh();
                }}
              >
                Stop retrying and refresh
              </Button>
            </Stack>
          </Stack>
        </Alert>
      )}
    </>
  );
  if (!currentSite)
    return (
      <Stack spacing={2}>
        {feedback}
        <Alert severity="info">
          Select a clinic location to review workforce requests.
        </Alert>
      </Stack>
    );
  if (!data)
    return (
      <Stack spacing={2}>
        {feedback}
        <LoadState error={loadError} onRetry={refresh} />
      </Stack>
    );
  const requests = data.requests;
  const removedDrafts = Object.entries(reasons).filter(
    ([id, draft]) =>
      draft.siteId === String(currentSite.id) &&
      draft.text.trim() &&
      !requests.some((request) => request.id === id),
  );
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
      {feedback}
      <Button onClick={refresh} disabled={!!busyId} sx={{ alignSelf: "start" }}>
        Refresh requests
      </Button>
      {removedDrafts.map(([id, draft]) => (
        <Alert severity="info" key={id}>
          {draft.employee}'s request is no longer awaiting review. Your unsaved
          reason is retained below.
          <Typography sx={{ whiteSpace: "pre-wrap", mt: 1 }}>
            {draft.text}
          </Typography>
          <Button disabled={controlsLocked} onClick={() => discardReason(id)}>
            Discard retained reason
          </Button>
        </Alert>
      ))}
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
                    value={reasons[request.id]?.text ?? ""}
                    onChange={(event) =>
                      setReasons((current) => ({
                        ...current,
                        [request.id]: {
                          text: event.target.value,
                          employee: request.employee_name || "Employee",
                          siteId: request.site_id,
                        },
                      }))
                    }
                    disabled={controlsLocked}
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
                      controlsLocked ||
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
                      controlsLocked ||
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
