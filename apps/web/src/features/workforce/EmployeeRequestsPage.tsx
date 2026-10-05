import { useId, useEffect, useMemo, useState, type FormEvent } from "react";
import SendIcon from "@mui/icons-material/Send";
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { ApiError, api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { formatDisplayDateTime } from "../../shared/dateTime";
import { WorkforceRequestDetails } from "./WorkforceRequestDetails";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";
import {
  displayInterval,
  mondayIso,
  requestKey,
  type SwapOption,
  type WorkforceRequest,
  type WorkforceSite,
} from "./scheduleTypes";

type RequestData = {
  requests: WorkforceRequest[];
  sites: WorkforceSite[];
  swap_options: SwapOption[];
};
const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const requestTabs = [
  ["time_off", "time_off_enabled"],
  ["availability", "availability_editing_enabled"],
  ["swap", "shift_swaps_enabled"],
] as const;
type RequestTab = (typeof requestTabs)[number][0];
type RequestAttempt = {
  path: string;
  body: Record<string, unknown>;
  submission: boolean;
  notice: string;
};

function enabledRequestTab(
  options: Record<string, boolean> | undefined,
  current: RequestTab,
) {
  return (
    requestTabs.find(
      ([tab, option]) => tab === current && options?.[option],
    )?.[0] ?? requestTabs.find(([, option]) => options?.[option])?.[0]
  );
}

export function EmployeeRequestsPage() {
  const fieldId = useId();
  const { registerBlocker } = useClinicNavigation();
  const {
    data,
    error: loadError,
    refresh,
  } = useResource<RequestData>("/api/clinic/workforce/requests");
  const [tab, setTab] = useState<RequestTab>("time_off");
  const [historyType, setHistoryType] = useState("all");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [siteId, setSiteId] = useState("");
  const [reason, setReason] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [startOccurrence, setStartOccurrence] = useState("only");
  const [endOccurrence, setEndOccurrence] = useState("only");
  const [effectiveFrom, setEffectiveFrom] = useState(() => mondayIso());
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [targetEmploymentId, setTargetEmploymentId] = useState("");
  const [publicationId, setPublicationId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [rules, setRules] = useState(
    dayNames.map((_, day) => ({
      day_of_week: day,
      start_time: "",
      end_time: "",
      available: false,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [draftDirty, setDraftDirty] = useState(false);
  const [pendingAttempt, setPendingAttempt] = useState<RequestAttempt | null>(
    null,
  );
  const controlsLocked = busy || pendingAttempt !== null;
  const leaveMessage = busy
    ? "A workforce request action is still saving."
    : pendingAttempt
      ? "A request action is unconfirmed. Leaving loses its saved retry."
      : draftDirty
        ? "Discard the unsaved request?"
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

  function resetDraft() {
    setReason("");
    setStart("");
    setEnd("");
    setStartOccurrence("only");
    setEndOccurrence("only");
    setEffectiveFrom(mondayIso());
    setEffectiveUntil("");
    setPublicationId("");
    setShiftId("");
    setTargetEmploymentId("");
    setRules(
      dayNames.map((_, day) => ({
        day_of_week: day,
        start_time: "",
        end_time: "",
        available: false,
      })),
    );
    setDraftDirty(false);
  }

  function confirmDiscard() {
    return (
      !controlsLocked &&
      (!draftDirty || window.confirm("Discard the unsaved request?"))
    );
  }

  async function sendAttempt(attempt: RequestAttempt) {
    if (busy) return;
    const recovering = pendingAttempt !== null;
    setPendingAttempt(attempt);
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await api(attempt.path, { method: "POST", body: attempt.body });
      setPendingAttempt(null);
      if (attempt.submission) resetDraft();
      setNotice(attempt.notice);
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
        `${reason instanceof Error ? reason.message : "Unable to confirm this request action."} ${rejected && !recovering ? "Review the request details before trying again." : "Use Retry saved action to confirm the original request."}`,
      );
    } finally {
      setBusy(false);
    }
  }

  const pendingNotice =
    pendingAttempt &&
    (busy ? (
      <Typography role="status">Saving request action…</Typography>
    ) : (
      <Alert severity="warning">
        The last request action is unconfirmed. Its original details are held
        for retry. Refreshing history preserves this retry.
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ mt: 1 }}
        >
          <Button
            disabled={busy}
            onClick={() => void sendAttempt(pendingAttempt)}
          >
            Retry saved action
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(
                  "Stop retrying this action? It may already be saved. Review request history before submitting again.",
                )
              )
                return;
              setPendingAttempt(null);
              refresh();
            }}
          >
            Stop retrying and review history
          </Button>
        </Stack>
      </Alert>
    ));
  useEffect(() => {
    if (data && !draftDirty && !pendingAttempt)
      setSiteId((value) =>
        data.sites.some((item) => item.id === value)
          ? value
          : data.sites[0]?.id || "",
      );
  }, [data, draftDirty, pendingAttempt]);
  const site = useMemo(
    () => data?.sites.find((item) => item.id === siteId),
    [data, siteId],
  );
  const swapOptions = useMemo(
    () => data?.swap_options.find((item) => item.site_id === siteId),
    [data, siteId],
  );
  const activeTab = enabledRequestTab(site?.request_options, tab);
  const canSubmitRequest = activeTab === tab;
  useEffect(() => {
    if (activeTab && activeTab !== tab && !draftDirty && !pendingAttempt)
      setTab(activeTab);
  }, [activeTab, tab, draftDirty, pendingAttempt]);
  const changeSite = (nextSiteId: string) => {
    if (!confirmDiscard()) return;
    resetDraft();
    setSiteId(nextSiteId);
    setError(undefined);
  };
  if (!data)
    return (
      <Stack spacing={2}>
        {pendingNotice}
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        <LoadState error={loadError} onRetry={refresh} />
      </Stack>
    );
  const option = site?.request_options ?? {};
  const visibleRequests = data.requests.filter(
    (request) =>
      (historyType === "all" || request.type === historyType) &&
      (historyStatus === "all" ||
        (historyStatus === "needs_response"
          ? request.can_target_decide
          : request.status === historyStatus)),
  );
  const historyStatuses = [
    ...new Set(data.requests.map((request) => request.status)),
  ];
  if (!["all", "needs_response", ...historyStatuses].includes(historyStatus))
    historyStatuses.push(historyStatus);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!site || !canSubmitRequest || controlsLocked) return;
    const kind =
      tab === "time_off"
        ? "time_off"
        : tab === "availability"
          ? "availability"
          : "shift_swap";
    const endpoint =
      tab === "time_off"
        ? "time-off-requests"
        : tab === "availability"
          ? "availability"
          : "shift-swap-requests";
    const values = {
      site_id: site.id,
      reason,
      ...(tab === "time_off"
        ? {
            local_start: start,
            local_end: end,
            start_occurrence: startOccurrence,
            end_occurrence: endOccurrence,
            timezone: site.timezone,
          }
        : tab === "availability"
          ? {
              effective_from: effectiveFrom,
              effective_until: effectiveUntil || null,
              timezone: site.timezone,
              weekly_rules: rules,
            }
          : {
              schedule_publication_id: publicationId,
              offered_shift_public_id: shiftId,
              target_employment_id: targetEmploymentId,
            }),
    };
    await sendAttempt({
      path: `/api/clinic/workforce/${endpoint}`,
      body: { [kind]: { ...values, idempotency_key: requestKey(tab) } },
      submission: true,
      notice: "Request saved.",
    });
  };
  const cancel = async (request: WorkforceRequest) => {
    if (controlsLocked) return;
    await sendAttempt({
      path: `/api/clinic/workforce/requests/${request.id}/decision`,
      body: {
        decision: {
          decision: "cancel",
          expected_revision: request.revision,
          idempotency_key: requestKey("cancel"),
        },
      },
      submission: false,
      notice: "Request canceled.",
    });
  };
  const answerSwap = async (
    request: WorkforceRequest,
    decision: "target_accept" | "target_decline",
  ) => {
    if (controlsLocked) return;
    await sendAttempt({
      path: `/api/clinic/workforce/requests/${request.id}/decision`,
      body: {
        decision: {
          decision,
          expected_revision: request.revision,
          idempotency_key: requestKey(decision),
        },
      },
      submission: false,
      notice:
        decision === "target_accept"
          ? "Swap accepted. Review requirements still apply."
          : "Swap declined.",
    });
  };
  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="overline" color="text.secondary">
          WORKFORCE / REQUESTS
        </Typography>
        <Typography variant="h1">Availability and requests</Typography>
        <Typography color="text.secondary">
          Submit availability, time off, or a published-shift swap when your
          selected location enables it.
        </Typography>
      </div>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {pendingNotice}
      <Button disabled={busy} onClick={refresh} sx={{ alignSelf: "start" }}>
        Refresh request history
      </Button>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="h2" sx={{ mb: 2 }}>
          Request history
        </Typography>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{ mb: 2, gap: 2, flexWrap: "wrap" }}
        >
          <TextField
            select
            label="Request type"
            value={historyType}
            onChange={(event) => setHistoryType(event.target.value)}
            sx={{ minWidth: 190 }}
          >
            <MenuItem value="all">All request types</MenuItem>
            <MenuItem value="time_off_request">Time off</MenuItem>
            <MenuItem value="availability_version">
              Availability change
            </MenuItem>
            <MenuItem value="shift_swap_request">Shift swap</MenuItem>
          </TextField>
          <TextField
            select
            label="Request status"
            value={historyStatus}
            onChange={(event) => setHistoryStatus(event.target.value)}
            sx={{ minWidth: 210 }}
          >
            <MenuItem value="all">All statuses</MenuItem>
            <MenuItem value="needs_response">Needs your response</MenuItem>
            {historyStatuses.map((status) => (
              <MenuItem key={status} value={status}>
                {status.replaceAll("_", " ")}
              </MenuItem>
            ))}
          </TextField>
          {(historyType !== "all" || historyStatus !== "all") && (
            <Button
              onClick={() => {
                setHistoryType("all");
                setHistoryStatus("all");
              }}
            >
              Clear history filters
            </Button>
          )}
        </Stack>
        <Typography role="status" color="text.secondary" sx={{ mb: 2 }}>
          Showing {visibleRequests.length} of {data.requests.length} requests ·{" "}
          {data.requests.filter((request) => request.can_target_decide).length}{" "}
          need your response.
        </Typography>
        <Stack spacing={1}>
          {visibleRequests.map((request) => (
            <Paper variant="outlined" sx={{ p: 1.5 }} key={request.id}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{ justifyContent: "space-between" }}
              >
                <div>
                  <WorkforceRequestDetails request={request} />
                  <Typography color="text.secondary">
                    Status: {request.status.replaceAll("_", " ")}
                  </Typography>
                  {request.type === "shift_swap_request" && (
                    <Typography variant="body2">
                      {request.status === "submitted"
                        ? "Awaiting the replacement employee's response."
                        : request.status === "accepted"
                          ? "The replacement employee accepted. Manager approval is still required; this swap has not changed the schedule."
                          : request.status === "approved"
                            ? "The updated schedule has been published."
                            : request.status === "declined"
                              ? "The replacement employee declined."
                              : request.status === "denied"
                                ? "The manager denied this swap."
                                : ""}
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    Created{" "}
                    {formatDisplayDateTime(request.created_at, {
                      timeZone: request.timezone,
                    })}
                    {request.decided_at
                      ? ` · Decided ${formatDisplayDateTime(request.decided_at, { timeZone: request.timezone })}`
                      : ""}
                  </Typography>
                </div>
                <Stack direction="row" spacing={1}>
                  {request.can_target_decide && (
                    <>
                      <Button
                        color="inherit"
                        disabled={controlsLocked}
                        onClick={() => answerSwap(request, "target_decline")}
                      >
                        Decline
                      </Button>
                      <Button
                        variant="contained"
                        disabled={controlsLocked}
                        onClick={() => answerSwap(request, "target_accept")}
                      >
                        Accept swap
                      </Button>
                    </>
                  )}
                  {request.can_cancel && (
                    <Button
                      color="inherit"
                      disabled={controlsLocked}
                      onClick={() => cancel(request)}
                    >
                      Cancel
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Paper>
          ))}
          {data.requests.length === 0 && (
            <Typography color="text.secondary">
              No requests have been submitted.
            </Typography>
          )}
          {data.requests.length > 0 && visibleRequests.length === 0 && (
            <Typography color="text.secondary">
              No requests match these history filters.
            </Typography>
          )}
        </Stack>
      </Paper>
      {data.sites.length === 0 ? (
        <Alert severity="info">
          No eligible workforce locations are available.
        </Alert>
      ) : (
        <Paper
          variant="outlined"
          sx={{ p: 2.5 }}
          component="form"
          onSubmit={submit}
        >
          <Stack spacing={2}>
            <FormControl>
              <InputLabel id={`${fieldId}-1-label`}>Location</InputLabel>
              <Select
                labelId={`${fieldId}-1-label`}
                label="Location"
                value={siteId}
                disabled={controlsLocked}
                onChange={(e) => changeSite(e.target.value)}
              >
                {siteId && !site && (
                  <MenuItem value={siteId} disabled>
                    Previously selected location is unavailable
                  </MenuItem>
                )}
                {data.sites.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tabs
              value={tab}
              onChange={(_, value: RequestTab) => {
                if (!confirmDiscard()) return;
                resetDraft();
                setTab(value);
              }}
              variant="scrollable"
            >
              <Tab
                value="time_off"
                label="Time off"
                disabled={controlsLocked || !option.time_off_enabled}
              />
              <Tab
                value="availability"
                label="Availability"
                disabled={
                  controlsLocked || !option.availability_editing_enabled
                }
              />
              <Tab
                value="swap"
                label="Shift swap"
                disabled={controlsLocked || !option.shift_swaps_enabled}
              />
            </Tabs>
            {!canSubmitRequest && (
              <Alert severity="info">
                Requests are not enabled for this location.
              </Alert>
            )}
            {tab === "time_off" && (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  gap: 2,
                }}
              >
                <TextField
                  required
                  label={`Starts (${site?.timezone || "location time"})`}
                  disabled={controlsLocked}
                  type="datetime-local"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    setDraftDirty(true);
                  }}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  required
                  label={`Ends (${site?.timezone || "location time"})`}
                  disabled={controlsLocked}
                  type="datetime-local"
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    setDraftDirty(true);
                  }}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  select
                  label="Start clock occurrence"
                  value={startOccurrence}
                  disabled={controlsLocked}
                  onChange={(event) => {
                    setStartOccurrence(event.target.value);
                    setDraftDirty(true);
                  }}
                  helperText="Choose first or second only when this local time repeats."
                >
                  <MenuItem value="only">Only occurrence</MenuItem>
                  <MenuItem value="first">First occurrence</MenuItem>
                  <MenuItem value="second">Second occurrence</MenuItem>
                </TextField>
                <TextField
                  select
                  label="End clock occurrence"
                  value={endOccurrence}
                  disabled={controlsLocked}
                  onChange={(event) => {
                    setEndOccurrence(event.target.value);
                    setDraftDirty(true);
                  }}
                >
                  <MenuItem value="only">Only occurrence</MenuItem>
                  <MenuItem value="first">First occurrence</MenuItem>
                  <MenuItem value="second">Second occurrence</MenuItem>
                </TextField>
              </Box>
            )}
            {tab === "availability" && (
              <Stack spacing={1}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    required
                    type="date"
                    label="Effective from"
                    value={effectiveFrom}
                    onChange={(event) => {
                      setEffectiveFrom(event.target.value);
                      setDraftDirty(true);
                    }}
                    disabled={controlsLocked}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <TextField
                    type="date"
                    label="Effective through (optional)"
                    value={effectiveUntil}
                    onChange={(event) => {
                      setEffectiveUntil(event.target.value);
                      setDraftDirty(true);
                    }}
                    disabled={controlsLocked}
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: { min: effectiveFrom },
                    }}
                  />
                </Stack>
                <Typography color="text.secondary">
                  Weekly availability in {site?.timezone}. An end time at or
                  before the start continues into the next day.
                </Typography>
                {rules.map((rule, index) => (
                  <Stack
                    key={rule.day_of_week}
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{ alignItems: { sm: "center" } }}
                  >
                    <Typography sx={{ width: 100 }}>
                      {dayNames[rule.day_of_week]}
                    </Typography>
                    <Button
                      variant={rule.available ? "contained" : "outlined"}
                      color="inherit"
                      disabled={controlsLocked}
                      onClick={() => {
                        setDraftDirty(true);
                        setRules((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, available: !item.available }
                              : item,
                          ),
                        );
                      }}
                    >
                      {rule.available ? "Available" : "Unavailable"}
                    </Button>
                    <TextField
                      size="small"
                      type="time"
                      disabled={controlsLocked || !rule.available}
                      label={`${dayNames[rule.day_of_week]} start`}
                      required={rule.available}
                      slotProps={{ inputLabel: { shrink: true } }}
                      value={rule.start_time}
                      onChange={(e) => {
                        setDraftDirty(true);
                        setRules((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, start_time: e.target.value }
                              : item,
                          ),
                        );
                      }}
                    />
                    <TextField
                      size="small"
                      type="time"
                      disabled={controlsLocked || !rule.available}
                      label={`${dayNames[rule.day_of_week]} end`}
                      required={rule.available}
                      slotProps={{ inputLabel: { shrink: true } }}
                      value={rule.end_time}
                      onChange={(e) => {
                        setDraftDirty(true);
                        setRules((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, end_time: e.target.value }
                              : item,
                          ),
                        );
                      }}
                    />
                  </Stack>
                ))}
              </Stack>
            )}
            {tab === "swap" && (
              <Alert severity="info">
                The target employee must explicitly accept before any manager
                approval or automatic schedule revision.
              </Alert>
            )}
            {tab === "swap" && (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  gap: 2,
                }}
              >
                <FormControl required>
                  <InputLabel id={`${fieldId}-2-label`}>
                    Published shift
                  </InputLabel>
                  <Select
                    labelId={`${fieldId}-2-label`}
                    label="Published shift"
                    disabled={controlsLocked}
                    value={
                      publicationId && shiftId
                        ? `${publicationId}:${shiftId}`
                        : ""
                    }
                    onChange={(e) => {
                      const [publication, shift] = e.target.value.split(":");
                      setPublicationId(publication);
                      setShiftId(shift);
                      setDraftDirty(true);
                    }}
                  >
                    {publicationId &&
                      shiftId &&
                      !swapOptions?.shifts.some(
                        (shift) =>
                          shift.publication_id === publicationId &&
                          shift.shift_id === shiftId,
                      ) && (
                        <MenuItem
                          value={`${publicationId}:${shiftId}`}
                          disabled
                        >
                          Selected shift is no longer offered
                        </MenuItem>
                      )}
                    {(swapOptions?.shifts ?? []).map((shift) => (
                      <MenuItem
                        key={shift.shift_id}
                        value={`${shift.publication_id}:${shift.shift_id}`}
                      >
                        {displayInterval(
                          shift.starts_at,
                          shift.ends_at,
                          shift.timezone,
                        )}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl required>
                  <InputLabel id={`${fieldId}-3-label`}>
                    Target employee
                  </InputLabel>
                  <Select
                    labelId={`${fieldId}-3-label`}
                    label="Target employee"
                    disabled={controlsLocked}
                    value={targetEmploymentId}
                    onChange={(e) => {
                      setTargetEmploymentId(e.target.value);
                      setDraftDirty(true);
                    }}
                  >
                    {targetEmploymentId &&
                      !swapOptions?.employees.some(
                        (employee) => employee.id === targetEmploymentId,
                      ) && (
                        <MenuItem value={targetEmploymentId} disabled>
                          Selected employee is no longer eligible
                        </MenuItem>
                      )}
                    {(swapOptions?.employees ?? []).map((employee) => (
                      <MenuItem key={employee.id} value={employee.id}>
                        {employee.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            )}
            <TextField
              required
              multiline
              minRows={2}
              label="Reason"
              disabled={controlsLocked}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setDraftDirty(true);
              }}
              slotProps={{ htmlInput: { maxLength: 500 } }}
              helperText={`${reason.length}/500. Do not include patient information.`}
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={<SendIcon />}
              disabled={
                controlsLocked ||
                !canSubmitRequest ||
                !reason.trim() ||
                (tab === "time_off" &&
                  (!start ||
                    !end ||
                    (end <= start &&
                      !(
                        start.slice(0, 10) === end.slice(0, 10) &&
                        startOccurrence === "first" &&
                        endOccurrence === "second"
                      )))) ||
                (tab === "availability" &&
                  (!effectiveFrom ||
                    (effectiveUntil !== "" && effectiveUntil < effectiveFrom) ||
                    rules.some(
                      (rule) =>
                        rule.available && (!rule.start_time || !rule.end_time),
                    ))) ||
                (tab === "swap" &&
                  (!swapOptions?.shifts.some(
                    (shift) =>
                      shift.publication_id === publicationId &&
                      shift.shift_id === shiftId,
                  ) ||
                    !swapOptions?.employees.some(
                      (employee) => employee.id === targetEmploymentId,
                    )))
              }
            >
              Submit request
            </Button>
            {draftDirty && (
              <Button
                disabled={controlsLocked}
                onClick={() => {
                  if (confirmDiscard()) resetDraft();
                }}
              >
                Discard request draft
              </Button>
            )}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
