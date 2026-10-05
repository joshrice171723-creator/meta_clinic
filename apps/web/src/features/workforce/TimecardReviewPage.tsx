import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { ApiError, api } from "../../api/client";
import {
  formatDisplayDate,
  formatDisplayDateTime,
} from "../../shared/dateTime";
import { useClinic } from "../clinic/Workspace";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import type { Adjustment, Timecard, TimecardEmployee } from "./clockTypes";
import { AdjustmentDialog } from "./AdjustmentDialog";
import { TimecardSummary } from "./TimecardSummary";
import { timecardAttention, type TimecardAttention } from "./timecardAttention";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";

type ReviewDraft = { text: string; employee: string; siteId: string };
type TimecardTransition = {
  card: Timecard;
  action: "submit" | "approve";
  siteId: string;
};
type CorrectionDecision = {
  adjustment: Adjustment;
  siteId: string;
  body: {
    decision: "approved" | "denied";
    decision_reason: string;
    lock_version: number;
  };
};

function workforceSettingsPath(reason: unknown, siteId: string) {
  if (!(reason instanceof ApiError)) return null;
  if (reason.code === "workforce_settings_unconfigured")
    return "/clinic/workforce/settings";
  if (/approval policy is unconfigured/i.test(reason.message))
    return siteId
      ? `/clinic/workforce/settings?site_id=${encodeURIComponent(siteId)}`
      : "/clinic/workforce/settings";
  return null;
}

export function TimecardReviewPage() {
  const clinic = useClinic();
  const { navigate, registerBlocker } = useClinicNavigation();
  const canRead = clinic.capabilities.workforce_timecards_read === true;
  const canReview = clinic.capabilities.workforce_timecards_review === true;
  const canApprove = clinic.capabilities.workforce_timecards_approve === true;
  const [siteId, setSiteId] = useState(
    String(clinic.current_site?.id ?? clinic.sites[0]?.id ?? ""),
  );
  const [attention, setAttention] = useState<TimecardAttention>("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [reviewWeek, setReviewWeek] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadedSiteId, setLoadedSiteId] = useState("");
  const [cards, setCards] = useState<Timecard[]>([]);
  const [employees, setEmployees] = useState<TimecardEmployee[]>([]);
  const [employmentId, setEmploymentId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [error, setError] = useState("");
  const [settingsPath, setSettingsPath] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [correctionCard, setCorrectionCard] = useState<Timecard | null>(null);
  const [decisionReasons, setDecisionReasons] = useState<
    Record<number, ReviewDraft>
  >({});
  const [pendingDecision, setPendingDecision] =
    useState<CorrectionDecision | null>(null);
  const [pendingTransition, setPendingTransition] =
    useState<TimecardTransition | null>(null);
  const controlsLocked =
    busy || pendingDecision !== null || pendingTransition !== null;
  const leaveMessage = busy
    ? "A timecard action is still saving."
    : pendingTransition
      ? "A timecard action is unconfirmed. Leaving loses its saved retry."
      : pendingDecision
        ? "A correction decision is unconfirmed. Leaving loses its saved retry."
        : Object.values(decisionReasons).some((draft) => draft.text.trim())
          ? "Leave unsaved correction review reasons? They will be lost if this page closes."
          : null;
  useDemoNavigationBlocker(() => ({ blocked: busy, message: leaveMessage }));
  useEffect(() => {
    if (!leaveMessage) return;
    const unregister = registerBlocker(() => leaveMessage, {
      preventNavigation: busy,
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
  }, [leaveMessage, busy, registerBlocker]);

  function discardReason(id: number) {
    setDecisionReasons((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  useEffect(() => {
    if (!siteId || !canRead) return;
    setLoading(true);
    setLoadedSiteId("");
    setCards([]);
    setEmployees([]);
    setAdjustments([]);
    setCorrectionCard(null);
    const abort = new AbortController();
    setError("");
    setSettingsPath(null);
    setReviewError("");
    const query = `?site_id=${encodeURIComponent(siteId)}`;
    const adjustmentRequest = canReview
      ? api<{ adjustments: Adjustment[] }>(
          `/api/clinic/workforce/adjustments${query}`,
          { signal: abort.signal },
        ).catch((reason: unknown) => {
          if (!abort.signal.aborted)
            setReviewError(
              reason instanceof Error
                ? reason.message
                : "Correction requests are unavailable.",
            );
          return { adjustments: [] };
        })
      : Promise.resolve({ adjustments: [] });
    Promise.all([
      api<{
        timecards: Timecard[];
        employees: TimecardEmployee[];
        default_period_start: string;
      }>(`/api/clinic/workforce/timecards${query}`, { signal: abort.signal }),
      adjustmentRequest,
    ])
      .then(([timecardData, adjustmentData]) => {
        if (!abort.signal.aborted) {
          setLoadedSiteId(siteId);
          setLoading(false);
          setCards(timecardData.timecards);
          setEmployees(timecardData.employees);
          setEmploymentId((current) =>
            timecardData.employees.some(
              (employee) => String(employee.id) === current,
            )
              ? current
              : String(timecardData.employees[0]?.id ?? ""),
          );
          setPeriodStart(
            (current) => current || timecardData.default_period_start,
          );
          setAdjustments(adjustmentData.adjustments);
        }
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) setLoading(false);
        if (!abort.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load timecard review.",
          );
        if (!abort.signal.aborted)
          setSettingsPath(workforceSettingsPath(reason, siteId));
      });
    return () => abort.abort();
  }, [canRead, canReview, siteId, revision]);

  const currentSource = canRead && loadedSiteId === siteId && !loading;
  const attentionData = useMemo(
    () =>
      timecardAttention(
        currentSource ? cards : [],
        currentSource ? adjustments : [],
      ),
    [cards, adjustments, currentSource],
  );
  const attentionAvailable = attention !== "corrections" || !reviewError;
  const latestCards = attentionData.groups[attention];
  const employeeQuery = employeeSearch.trim().toLocaleLowerCase();
  const matchesReview = (record: {
    employee_name: string;
    period_start: string;
  }) =>
    (!employeeQuery ||
      record.employee_name.toLocaleLowerCase().includes(employeeQuery)) &&
    (reviewWeek === "all" || record.period_start === reviewWeek);
  const visibleCards = latestCards.filter(matchesReview);
  const visiblePending = attentionData.pending.filter(matchesReview);
  const reviewWeeks = [
    ...new Set(
      [...attentionData.groups.all, ...attentionData.pending].map(
        (record) => record.period_start,
      ),
    ),
  ]
    .sort()
    .reverse();
  const hiddenDraftCount = attentionData.pending.filter(
    (adjustment) =>
      !matchesReview(adjustment) && decisionReasons[adjustment.id]?.text.trim(),
  ).length;
  useEffect(() => {
    if (!canReview)
      setAttention((current) => (current === "corrections" ? "all" : current));
  }, [canReview]);

  async function calculate() {
    if (controlsLocked || !currentSource || !employmentId || !periodStart)
      return;
    setBusy(true);
    setError("");
    setSettingsPath(null);
    setNotice("");
    try {
      await api("/api/clinic/workforce/timecards/calculate", {
        method: "POST",
        body: {
          employment_id: Number(employmentId),
          site_id: Number(siteId),
          period_start: periodStart,
        },
      });
      setNotice(
        "The employee timecard was calculated from saved workforce records.",
      );
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to calculate the employee timecard.",
      );
      setSettingsPath(workforceSettingsPath(reason, siteId));
    } finally {
      setBusy(false);
    }
  }

  async function transition(card: Timecard, action: "submit" | "approve") {
    if (
      controlsLocked ||
      !currentSource ||
      !card.workflow?.[action === "submit" ? "can_submit" : "can_approve"]
    )
      return;
    await sendTransition({ card, action, siteId });
  }

  async function sendTransition(attempt: TimecardTransition) {
    if (busy || attempt.siteId !== siteId) return;
    const recovering = pendingTransition !== null;
    const { card, action } = attempt;
    setPendingTransition(attempt);
    setBusy(true);
    setError("");
    setSettingsPath(null);
    setNotice("");
    try {
      await api(`/api/clinic/workforce/timecards/${card.id}/${action}`, {
        method: "POST",
        body: {
          lock_version: card.lock_version,
          site_id: Number(attempt.siteId),
        },
      });
      setPendingTransition(null);
      setNotice(
        action === "submit"
          ? `${card.employee_name}'s timecard was submitted for approval.`
          : `${card.employee_name}'s timecard was approved as an immutable version.`,
      );
      setRevision((value) => value + 1);
    } catch (reason) {
      const rejected =
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        ![408, 429].includes(reason.status) &&
        !["outcome_unconfirmed", "session_changed"].includes(reason.code ?? "");
      if (rejected && !recovering) setPendingTransition(null);
      setError(
        `${reason instanceof Error ? reason.message : "Unable to confirm the timecard action."} ${rejected && !recovering ? "Refresh and review the card before trying again." : "Retry the saved action to confirm its original outcome."}`,
      );
      setSettingsPath(workforceSettingsPath(reason, siteId));
    } finally {
      setBusy(false);
    }
  }

  async function sendDecision(attempt: CorrectionDecision) {
    if (
      busy ||
      attempt.siteId !== siteId ||
      !canReview ||
      attempt.adjustment.can_decide !== true
    )
      return;
    const recovering = pendingDecision !== null;
    setPendingDecision(attempt);
    setBusy(true);
    setError("");
    setSettingsPath(null);
    setNotice("");
    try {
      await api(
        `/api/clinic/workforce/adjustments/${attempt.adjustment.id}/decide`,
        {
          method: "POST",
          body: attempt.body,
        },
      );
      setPendingDecision(null);
      discardReason(attempt.adjustment.id);
      setNotice(`Correction request ${attempt.body.decision}.`);
      setRevision((value) => value + 1);
    } catch (reason) {
      const rejected =
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        ![408, 429].includes(reason.status) &&
        !["outcome_unconfirmed", "session_changed"].includes(reason.code ?? "");
      if (rejected && !recovering) setPendingDecision(null);
      setError(
        `${reason instanceof Error ? reason.message : "Unable to confirm this correction decision."} ${rejected && !recovering ? "Refresh and review the correction before trying again." : "Retry the saved decision to confirm its original outcome."}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function decide(
    adjustment: Adjustment,
    decision: "approved" | "denied",
  ) {
    const decisionReason = decisionReasons[adjustment.id]?.text.trim();
    if (
      controlsLocked ||
      !currentSource ||
      adjustment.can_decide !== true ||
      !decisionReason
    )
      return;
    await sendDecision({
      adjustment,
      siteId,
      body: {
        decision,
        decision_reason: decisionReason,
        lock_version: adjustment.lock_version,
      },
    });
  }

  if (!canRead)
    return <Alert severity="info">Timecard read access is unavailable.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h1">Timecard review</Typography>
        <Typography color="text.secondary">
          Review employee hours, resolve exceptions, and approve only current
          calculated versions.
        </Typography>
      </Box>
      {error && (
        <Alert
          severity={settingsPath ? "warning" : "error"}
          action={
            settingsPath && clinic.capabilities.workforce_settings === true ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => navigate(settingsPath)}
              >
                Open workforce settings
              </Button>
            ) : undefined
          }
        >
          {error}
          {settingsPath && clinic.capabilities.workforce_settings !== true
            ? " Ask a workforce settings administrator to save the required practice or location settings."
            : ""}
        </Alert>
      )}
      {attention === "corrections" && reviewError && (
        <Alert severity="warning">
          This correction view is unavailable. Select another view or refresh.
        </Alert>
      )}
      {reviewError && (
        <Alert severity="warning">
          {reviewError} Authorized timecard records remain available below.
        </Alert>
      )}
      {notice && <Alert severity="success">{notice}</Alert>}
      {busy && (pendingTransition || pendingDecision) && (
        <Typography role="status">Saving timecard action…</Typography>
      )}
      {pendingTransition && !busy && (
        <Alert severity="warning">
          The{" "}
          {pendingTransition.action === "submit" ? "submission" : "approval"}{" "}
          for {pendingTransition.card.employee_name}, week starting{" "}
          {formatDisplayDate(pendingTransition.card.period_start)}, version{" "}
          {pendingTransition.card.version_number}, is unconfirmed.
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ mt: 1 }}
          >
            <Button
              disabled={busy || pendingTransition.siteId !== siteId}
              onClick={() => void sendTransition(pendingTransition)}
            >
              Retry saved timecard action
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    "Stop retrying this timecard action? It may already be saved. Refresh and review its current status before acting again.",
                  )
                )
                  return;
                setPendingTransition(null);
                setRevision((value) => value + 1);
              }}
            >
              Stop retrying and refresh
            </Button>
          </Stack>
        </Alert>
      )}
      {pendingDecision && !busy && (
        <Alert severity="warning">
          The correction decision for {pendingDecision.adjustment.employee_name}{" "}
          is unconfirmed. Its original reason and version are retained.
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Typography>
              Request #{pendingDecision.adjustment.id} · week starting{" "}
              {formatDisplayDate(pendingDecision.adjustment.period_start)} ·{" "}
              {pendingDecision.body.decision === "approved"
                ? "Approve"
                : "Deny"}
            </Typography>
            <Typography sx={{ whiteSpace: "pre-wrap" }}>
              Review reason: {pendingDecision.body.decision_reason}
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                disabled={
                  busy ||
                  pendingDecision.siteId !== siteId ||
                  !canReview ||
                  pendingDecision.adjustment.can_decide !== true
                }
                onClick={() => void sendDecision(pendingDecision)}
              >
                Retry saved decision
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Stop retrying this correction decision? It may already be saved. Refresh and review its current state before deciding again.",
                    )
                  )
                    return;
                  setPendingDecision(null);
                  setRevision((value) => value + 1);
                }}
              >
                Stop retrying and refresh
              </Button>
            </Stack>
          </Stack>
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography variant="h3">Timecard attention</Typography>
          <Typography variant="body2">
            Latest recorded versions with hours at this location. Resolve
            exceptions and pending corrections before approval.
          </Typography>
          {loading && (
            <Typography role="status">Loading timecard attention…</Typography>
          )}
          {canRead && (
            <TextField
              select
              label="Location"
              value={siteId}
              disabled={controlsLocked}
              onChange={(event) => {
                setSiteId(event.target.value);
                setEmploymentId("");
                setPeriodStart("");
                setEmployeeSearch("");
                setReviewWeek("all");
                setNotice("");
              }}
              sx={{ minWidth: 220 }}
            >
              {clinic.sites.map((site) => (
                <MenuItem key={site.id} value={String(site.id)}>
                  {site.name || site.code}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            select
            label="Timecard view"
            value={attention}
            disabled={!currentSource || !!error}
            onChange={(event) =>
              setAttention(event.target.value as TimecardAttention)
            }
          >
            <MenuItem value="all">
              All latest versions ({attentionData.groups.all.length})
            </MenuItem>
            <MenuItem value="submitted">
              Submitted for approval ({attentionData.groups.submitted.length})
            </MenuItem>
            <MenuItem value="exceptions">
              Recorded exceptions ({attentionData.groups.exceptions.length})
            </MenuItem>
            {canReview && (
              <MenuItem value="corrections" disabled={!!reviewError}>
                Pending corrections (
                {reviewError
                  ? "unknown"
                  : attentionData.groups.corrections.length}
                )
              </MenuItem>
            )}
          </TextField>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{ gap: 2, flexWrap: "wrap" }}
          >
            <TextField
              label="Find employee in review"
              value={employeeSearch}
              onChange={(event) => setEmployeeSearch(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 120 } }}
            />
            <TextField
              select
              label="Review workweek"
              value={reviewWeek}
              onChange={(event) => setReviewWeek(event.target.value)}
              sx={{ minWidth: 210 }}
            >
              <MenuItem value="all">All workweeks</MenuItem>
              {reviewWeek !== "all" && !reviewWeeks.includes(reviewWeek) && (
                <MenuItem value={reviewWeek}>
                  Starting {formatDisplayDate(reviewWeek)}
                </MenuItem>
              )}
              {reviewWeeks.map((week) => (
                <MenuItem key={week} value={week}>
                  Starting {formatDisplayDate(week)}
                </MenuItem>
              ))}
            </TextField>
            {(employeeSearch || reviewWeek !== "all") && (
              <Button
                onClick={() => {
                  setEmployeeSearch("");
                  setReviewWeek("all");
                }}
              >
                Clear review filters
              </Button>
            )}
          </Stack>
          {currentSource && attentionAvailable && (
            <Typography role="status" color="text.secondary">
              Showing {visibleCards.length} of {latestCards.length} timecards in
              this view.
            </Typography>
          )}
          {canReview && currentSource && (
            <Typography role="status">
              {reviewError
                ? "Pending correction count is unknown."
                : `${visiblePending.length} of ${attentionData.pending.length} pending correction requests match these filters. Requests against earlier versions remain listed below.`}
            </Typography>
          )}
          <Button
            disabled={busy || loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            Refresh timecard attention
          </Button>
        </Stack>
      </Paper>
      {hiddenDraftCount > 0 && (
        <Alert severity="info">
          {hiddenDraftCount} unsaved correction review reasons are hidden by
          these filters. Clear review filters to return to them; their text is
          preserved.
        </Alert>
      )}
      {currentSource &&
        !reviewError &&
        Object.entries(decisionReasons)
          .filter(
            ([id, draft]) =>
              draft.siteId === siteId &&
              draft.text.trim() &&
              !attentionData.pending.some(
                (adjustment) => adjustment.id === Number(id),
              ),
          )
          .map(([id, draft]) => (
            <Alert severity="info" key={id}>
              The correction for {draft.employee} (request #{id}) is no longer
              in the pending queue. Your unsaved review reason is retained
              below.
              <Typography sx={{ whiteSpace: "pre-wrap", mt: 1 }}>
                {draft.text}
              </Typography>
              <Button
                disabled={controlsLocked}
                onClick={() => discardReason(Number(id))}
              >
                Discard saved draft
              </Button>
            </Alert>
          ))}
      {canReview &&
        currentSource &&
        visiblePending.map((adjustment) => (
          <Paper variant="outlined" sx={{ p: 2 }} key={adjustment.id}>
            <Stack spacing={1}>
              <Typography variant="h3">
                {adjustment.employee_name} · correction request #{adjustment.id}
              </Typography>
              <Typography variant="body2">
                Week starting {formatDisplayDate(adjustment.period_start)}
              </Typography>
              {adjustment.source_interval && (
                <Typography variant="body2">
                  Original interval:{" "}
                  {formatDisplayDateTime(
                    adjustment.source_interval.started_at_utc,
                  )}
                  {" – "}
                  {formatDisplayDateTime(
                    adjustment.source_interval.ended_at_utc,
                  )}{" "}
                  ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                </Typography>
              )}
              {adjustment.proposed_changes.started_at_utc &&
                adjustment.proposed_changes.ended_at_utc && (
                  <Typography variant="body2">
                    Proposed interval:{" "}
                    {formatDisplayDateTime(
                      String(adjustment.proposed_changes.started_at_utc),
                    )}
                    {" – "}
                    {formatDisplayDateTime(
                      String(adjustment.proposed_changes.ended_at_utc),
                    )}{" "}
                    ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                  </Typography>
                )}
              <Typography>{adjustment.reason}</Typography>
              <Typography variant="body2" color="text.secondary">
                {adjustment.correction_type.replaceAll("_", " ")} · submitted{" "}
                {new Date(adjustment.requested_at).toLocaleString()}
              </Typography>
              {adjustment.can_decide === true ? (
                <>
                  <TextField
                    label="Decision reason"
                    disabled={controlsLocked}
                    slotProps={{ htmlInput: { maxLength: 1000 } }}
                    value={decisionReasons[adjustment.id]?.text ?? ""}
                    onChange={(event) =>
                      setDecisionReasons((current) => ({
                        ...current,
                        [adjustment.id]: {
                          text: event.target.value,
                          employee: adjustment.employee_name,
                          siteId,
                        },
                      }))
                    }
                    multiline
                    minRows={2}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      disabled={
                        controlsLocked ||
                        !decisionReasons[adjustment.id]?.text.trim()
                      }
                      onClick={() => void decide(adjustment, "approved")}
                    >
                      Approve correction
                    </Button>
                    <Button
                      color="warning"
                      disabled={
                        controlsLocked ||
                        !decisionReasons[adjustment.id]?.text.trim()
                      }
                      onClick={() => void decide(adjustment, "denied")}
                    >
                      Deny
                    </Button>
                  </Stack>
                </>
              ) : (
                <Alert severity="info">
                  Another reviewer must decide this correction.
                </Alert>
              )}
            </Stack>
          </Paper>
        ))}
      {currentSource &&
        !error &&
        attentionAvailable &&
        visibleCards.map((card) => (
          <TimecardSummary
            key={card.id}
            card={card}
            corrections={adjustments.filter(
              (adjustment) =>
                adjustment.resulting_timecard_version_id === card.id,
            )}
            actions={
              canReview || canApprove ? (
                <>
                  {canReview && card.status === "draft" && (
                    <Button
                      variant="contained"
                      disabled={
                        controlsLocked || card.workflow?.can_submit !== true
                      }
                      onClick={() => void transition(card, "submit")}
                    >
                      Submit for approval
                    </Button>
                  )}
                  {canApprove && (
                    <Button
                      variant="contained"
                      disabled={
                        controlsLocked || card.workflow?.can_approve !== true
                      }
                      onClick={() => void transition(card, "approve")}
                    >
                      Approve timecard
                    </Button>
                  )}
                  {canReview && (
                    <Button
                      disabled={controlsLocked || card.status === "superseded"}
                      onClick={() => setCorrectionCard(card)}
                    >
                      Add manager correction
                    </Button>
                  )}
                </>
              ) : undefined
            }
          />
        ))}
      {currentSource && !error && attentionAvailable && !latestCards.length && (
        <Alert severity="info">
          {attention === "all"
            ? "No calculated timecards are available for this location."
            : "No latest timecards match this attention view."}
        </Alert>
      )}
      {currentSource &&
        !error &&
        attentionAvailable &&
        latestCards.length > 0 &&
        visibleCards.length === 0 && (
          <Alert severity="info">
            No timecards in this view match the employee and workweek filters.
          </Alert>
        )}
      {canReview && (
        <Accordion disableGutters variant="outlined">
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls="timecard-calculation-content"
            id="timecard-calculation-header"
          >
            <Typography variant="h3">Calculate a timecard</Typography>
          </AccordionSummary>
          <AccordionDetails id="timecard-calculation-content">
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  select
                  label="Employee"
                  disabled={controlsLocked || !currentSource}
                  value={employmentId}
                  onChange={(event) => setEmploymentId(event.target.value)}
                  sx={{ minWidth: 240 }}
                >
                  {employees.map((employee) => (
                    <MenuItem key={employee.id} value={String(employee.id)}>
                      {employee.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Week starting"
                  disabled={controlsLocked || !currentSource}
                  type="date"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <Button
                  variant="contained"
                  disabled={
                    controlsLocked ||
                    !currentSource ||
                    !employmentId ||
                    !periodStart
                  }
                  onClick={() => void calculate()}
                >
                  Calculate
                </Button>
              </Stack>
              {currentSource && !employees.length && (
                <Alert
                  severity="info"
                  action={
                    clinic.capabilities.workforce_admin === true ? (
                      <Button
                        color="inherit"
                        size="small"
                        onClick={() => navigate("/clinic/workforce/employees")}
                      >
                        Manage employees
                      </Button>
                    ) : undefined
                  }
                >
                  No active employees are eligible at this location.{" "}
                  {clinic.capabilities.workforce_admin === true
                    ? "Activate or link an employee and assign this location."
                    : "Ask a workforce administrator to activate or link an employee and assign this location."}
                </Alert>
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
      {canReview && currentSource && correctionCard && (
        <AdjustmentDialog
          card={correctionCard}
          siteId={Number(siteId)}
          open={true}
          onClose={() => setCorrectionCard(null)}
          onSaved={() => {
            setNotice("Manager correction submitted for review.");
            setRevision((value) => value + 1);
          }}
        />
      )}
    </Stack>
  );
}
