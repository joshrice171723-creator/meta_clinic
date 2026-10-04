import {
  useId,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { WorkforceRequestDetails } from "./WorkforceRequestDetails";
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
  const {
    data,
    error: loadError,
    refresh,
  } = useResource<RequestData>("/api/clinic/workforce/requests");
  const attempts = useRef(new Map<string, string>());
  const [tab, setTab] = useState<RequestTab>("time_off");
  const [siteId, setSiteId] = useState("");
  const [reason, setReason] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
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
  useEffect(() => {
    if (data)
      setSiteId((value) =>
        data.sites.some((item) => item.id === value)
          ? value
          : data.sites[0]?.id || "",
      );
  }, [data]);
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
    if (activeTab && activeTab !== tab) setTab(activeTab);
  }, [activeTab, tab]);
  const changeSite = (nextSiteId: string) => {
    setSiteId(nextSiteId);
    setPublicationId("");
    setShiftId("");
    setTargetEmploymentId("");
    setError(undefined);
  };
  if (!data) return <LoadState error={loadError} onRetry={refresh} />;
  const option = site?.request_options ?? {};
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!site || !canSubmitRequest || busy) return;
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
            start_occurrence: "only",
            end_occurrence: "only",
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
    const signature = JSON.stringify([endpoint, values]);
    const key = attempts.current.get(signature) ?? requestKey(tab);
    attempts.current.set(signature, key);
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await api(`/api/clinic/workforce/${endpoint}`, {
        method: "POST",
        body: { [kind]: { ...values, idempotency_key: key } },
      });
      attempts.current.delete(signature);
      setNotice("Request saved.");
      setReason("");
      refresh();
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "Unable to save this request."} Retry with the same details to confirm this request.`,
      );
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (request: WorkforceRequest) => {
    if (busy) return;
    const signature = JSON.stringify([request.id, request.revision, "cancel"]);
    const key = attempts.current.get(signature) ?? requestKey("cancel");
    attempts.current.set(signature, key);
    setBusy(true);
    setError(undefined);
    try {
      await api(`/api/clinic/workforce/requests/${request.id}/decision`, {
        method: "POST",
        body: {
          decision: {
            decision: "cancel",
            expected_revision: request.revision,
            idempotency_key: key,
          },
        },
      });
      attempts.current.delete(signature);
      refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to cancel this request.",
      );
    } finally {
      setBusy(false);
    }
  };
  const answerSwap = async (
    request: WorkforceRequest,
    decision: "target_accept" | "target_decline",
  ) => {
    if (busy) return;
    const signature = JSON.stringify([request.id, request.revision, decision]);
    const key = attempts.current.get(signature) ?? requestKey(decision);
    attempts.current.set(signature, key);
    setBusy(true);
    setError(undefined);
    try {
      await api(`/api/clinic/workforce/requests/${request.id}/decision`, {
        method: "POST",
        body: {
          decision: {
            decision,
            expected_revision: request.revision,
            idempotency_key: key,
          },
        },
      });
      attempts.current.delete(signature);
      refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to answer this swap request.",
      );
    } finally {
      setBusy(false);
    }
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
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="h2" sx={{ mb: 2 }}>
          Request history
        </Typography>
        <Stack spacing={1}>
          {data.requests.map((request) => (
            <Paper variant="outlined" sx={{ p: 1.5 }} key={request.id}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{ justifyContent: "space-between" }}
              >
                <div>
                  <WorkforceRequestDetails request={request} />
                  <Typography color="text.secondary">
                    Status: {request.status}
                  </Typography>
                </div>
                <Stack direction="row" spacing={1}>
                  {request.can_target_decide && (
                    <>
                      <Button
                        color="inherit"
                        disabled={busy}
                        onClick={() => answerSwap(request, "target_decline")}
                      >
                        Decline
                      </Button>
                      <Button
                        variant="contained"
                        disabled={busy}
                        onClick={() => answerSwap(request, "target_accept")}
                      >
                        Accept swap
                      </Button>
                    </>
                  )}
                  {request.can_cancel && (
                    <Button
                      color="inherit"
                      disabled={busy}
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
                disabled={busy}
                onChange={(e) => changeSite(e.target.value)}
              >
                {data.sites.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tabs
              value={tab}
              onChange={(_, value) => setTab(value)}
              variant="scrollable"
            >
              <Tab
                value="time_off"
                label="Time off"
                disabled={busy || !option.time_off_enabled}
              />
              <Tab
                value="availability"
                label="Availability"
                disabled={busy || !option.availability_editing_enabled}
              />
              <Tab
                value="swap"
                label="Shift swap"
                disabled={busy || !option.shift_swaps_enabled}
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
                  label={`Starts (${site?.timezone})`}
                  disabled={busy}
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  required
                  label={`Ends (${site?.timezone})`}
                  disabled={busy}
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
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
                    onChange={(event) => setEffectiveFrom(event.target.value)}
                    disabled={busy}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <TextField
                    type="date"
                    label="Effective through (optional)"
                    value={effectiveUntil}
                    onChange={(event) => setEffectiveUntil(event.target.value)}
                    disabled={busy}
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
                      disabled={busy}
                      onClick={() =>
                        setRules((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, available: !item.available }
                              : item,
                          ),
                        )
                      }
                    >
                      {rule.available ? "Available" : "Unavailable"}
                    </Button>
                    <TextField
                      size="small"
                      type="time"
                      disabled={busy || !rule.available}
                      label={`${dayNames[rule.day_of_week]} start`}
                      required={rule.available}
                      slotProps={{ inputLabel: { shrink: true } }}
                      value={rule.start_time}
                      onChange={(e) =>
                        setRules((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, start_time: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <TextField
                      size="small"
                      type="time"
                      disabled={busy || !rule.available}
                      label={`${dayNames[rule.day_of_week]} end`}
                      required={rule.available}
                      slotProps={{ inputLabel: { shrink: true } }}
                      value={rule.end_time}
                      onChange={(e) =>
                        setRules((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, end_time: e.target.value }
                              : item,
                          ),
                        )
                      }
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
                    disabled={busy}
                    value={
                      publicationId && shiftId
                        ? `${publicationId}:${shiftId}`
                        : ""
                    }
                    onChange={(e) => {
                      const [publication, shift] = e.target.value.split(":");
                      setPublicationId(publication);
                      setShiftId(shift);
                    }}
                  >
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
                    disabled={busy}
                    value={targetEmploymentId}
                    onChange={(e) => setTargetEmploymentId(e.target.value)}
                  >
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
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 500 } }}
              helperText={`${reason.length}/500. Do not include patient information.`}
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={<SendIcon />}
              disabled={
                busy ||
                !canSubmitRequest ||
                !reason.trim() ||
                (tab === "time_off" && (!start || !end || end <= start)) ||
                (tab === "availability" &&
                  (!effectiveFrom ||
                    (effectiveUntil !== "" && effectiveUntil < effectiveFrom) ||
                    rules.some(
                      (rule) =>
                        rule.available && (!rule.start_time || !rule.end_time),
                    ))) ||
                (tab === "swap" &&
                  (!publicationId || !shiftId || !targetEmploymentId))
              }
            >
              Submit request
            </Button>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
