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
import { useClinic } from "../clinic/Workspace";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import type { Adjustment, Timecard, TimecardEmployee } from "./clockTypes";
import { AdjustmentDialog } from "./AdjustmentDialog";
import { TimecardSummary } from "./TimecardSummary";
import { timecardAttention, type TimecardAttention } from "./timecardAttention";

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
  const { navigate } = useClinicNavigation();
  const canRead = clinic.capabilities.workforce_timecards_read === true;
  const canReview = clinic.capabilities.workforce_timecards_review === true;
  const canApprove = clinic.capabilities.workforce_timecards_approve === true;
  const [siteId, setSiteId] = useState(
    String(clinic.current_site?.id ?? clinic.sites[0]?.id ?? ""),
  );
  const [attention, setAttention] = useState<TimecardAttention>("all");
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
    Record<number, string>
  >({});

  useEffect(() => {
    if (!siteId || !canRead) return;
    setLoading(true);
    setCards([]);
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
  useEffect(() => {
    if (!canReview)
      setAttention((current) => (current === "corrections" ? "all" : current));
  }, [canReview]);

  async function calculate() {
    if (!employmentId || !periodStart) return;
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

  async function approve(card: Timecard) {
    setBusy(true);
    setError("");
    setSettingsPath(null);
    setNotice("");
    try {
      await api(`/api/clinic/workforce/timecards/${card.id}/approve`, {
        method: "POST",
        body: { lock_version: card.lock_version },
      });
      setNotice(
        `${card.employee_name}'s timecard was approved as an immutable version.`,
      );
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to approve the timecard.",
      );
      setSettingsPath(workforceSettingsPath(reason, siteId));
    } finally {
      setBusy(false);
    }
  }

  async function decide(
    adjustment: Adjustment,
    decision: "approved" | "denied",
  ) {
    const decisionReason = decisionReasons[adjustment.id]?.trim();
    if (!decisionReason) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/clinic/workforce/adjustments/${adjustment.id}/decide`, {
        method: "POST",
        body: {
          decision,
          decision_reason: decisionReason,
          lock_version: adjustment.lock_version,
        },
      });
      setNotice(`Correction request ${decision}.`);
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to decide the correction request.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!canRead)
    return <Alert severity="info">Timecard read access is unavailable.</Alert>;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          TEAM / WORKFORCE
        </Typography>
        <Typography variant="h1">Timecard review</Typography>
        <Typography color="text.secondary">
          Review location-scoped hours, resolve exceptions, and approve only
          current calculated versions.
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
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography variant="h3">Timecard attention</Typography>
          <Typography variant="body2">
            Latest recorded versions at this location. Submitted does not mean
            eligible for approval; the existing server policy and correction
            checks still apply.
          </Typography>
          {loading && (
            <Typography role="status">Loading timecard attention…</Typography>
          )}
          {canReview && (
            <TextField
              select
              label="Location"
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
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
          {canReview && currentSource && (
            <Typography role="status">
              {reviewError
                ? "Pending correction count is unknown."
                : `${attentionData.pending.length} pending correction requests. Requests against earlier versions remain listed below.`}
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
      {canReview &&
        currentSource &&
        attentionData.pending.map((adjustment) => (
          <Paper variant="outlined" sx={{ p: 2 }} key={adjustment.id}>
            <Stack spacing={1}>
              <Typography variant="h3">
                Correction request #{adjustment.id}
              </Typography>
              <Typography>{adjustment.reason}</Typography>
              <Typography variant="body2" color="text.secondary">
                {adjustment.correction_type.replaceAll("_", " ")} · submitted{" "}
                {new Date(adjustment.requested_at).toLocaleString()}
              </Typography>
              <TextField
                label="Decision reason"
                value={decisionReasons[adjustment.id] ?? ""}
                onChange={(event) =>
                  setDecisionReasons((current) => ({
                    ...current,
                    [adjustment.id]: event.target.value,
                  }))
                }
                multiline
                minRows={2}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  disabled={busy || !decisionReasons[adjustment.id]?.trim()}
                  onClick={() => void decide(adjustment, "approved")}
                >
                  Approve correction
                </Button>
                <Button
                  color="warning"
                  disabled={busy || !decisionReasons[adjustment.id]?.trim()}
                  onClick={() => void decide(adjustment, "denied")}
                >
                  Deny
                </Button>
              </Stack>
            </Stack>
          </Paper>
        ))}
      {currentSource &&
        !error &&
        attentionAvailable &&
        latestCards.map((card) => (
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
                  {canApprove && (
                    <Button
                      variant="contained"
                      disabled={
                        busy ||
                        card.status !== "submitted" ||
                        card.unresolved_exceptions.length > 0
                      }
                      onClick={() => void approve(card)}
                    >
                      Approve timecard
                    </Button>
                  )}
                  {canReview && (
                    <Button
                      disabled={busy || card.status === "superseded"}
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
                  type="date"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <Button
                  variant="contained"
                  disabled={busy || !employmentId || !periodStart}
                  onClick={() => void calculate()}
                >
                  Calculate
                </Button>
              </Stack>
              {!employees.length && (
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
