import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { LoadState } from "../../shared/ui";
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

export function EmployeeRequestsPage() {
  const [data, setData] = useState<RequestData>();
  const [tab, setTab] = useState<"time_off" | "availability" | "swap">(
    "time_off",
  );
  const [siteId, setSiteId] = useState("");
  const [reason, setReason] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
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
  const load = () =>
    api<RequestData>("/api/clinic/workforce/requests")
      .then((next) => {
        setData(next);
        setSiteId((value) => value || next.sites[0]?.id || "");
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Unable to load requests."),
      );
  useEffect(() => {
    void load();
  }, []);
  const site = useMemo(
    () => data?.sites.find((item) => item.id === siteId),
    [data, siteId],
  );
  const swapOptions = useMemo(
    () => data?.swap_options.find((item) => item.site_id === siteId),
    [data, siteId],
  );
  const changeSite = (nextSiteId: string) => {
    setSiteId(nextSiteId);
    setPublicationId("");
    setShiftId("");
    setTargetEmploymentId("");
    setError(undefined);
  };
  if (!data) return <LoadState error={error} />;
  const option = site?.request_options ?? {};
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!site) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      if (tab === "time_off")
        await api("/api/clinic/workforce/time-off-requests", {
          method: "POST",
          body: {
            time_off: {
              site_id: site.id,
              local_start: start,
              local_end: end,
              start_occurrence: "only",
              end_occurrence: "only",
              timezone: site.timezone,
              reason,
              idempotency_key: requestKey("time-off"),
            },
          },
        });
      if (tab === "availability")
        await api("/api/clinic/workforce/availability", {
          method: "POST",
          body: {
            availability: {
              site_id: site.id,
              effective_from: mondayIso(),
              timezone: site.timezone,
              weekly_rules: rules,
              reason,
              idempotency_key: requestKey("availability"),
            },
          },
        });
      if (tab === "swap")
        await api("/api/clinic/workforce/shift-swap-requests", {
          method: "POST",
          body: {
            shift_swap: {
              site_id: site.id,
              schedule_publication_id: publicationId,
              offered_shift_public_id: shiftId,
              target_employment_id: targetEmploymentId,
              reason,
              idempotency_key: requestKey("swap"),
            },
          },
        });
      setNotice("Request saved.");
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save this request.");
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (request: WorkforceRequest) => {
    setBusy(true);
    setError(undefined);
    try {
      await api(`/api/clinic/workforce/requests/${request.id}/decision`, {
        method: "POST",
        body: {
          decision: {
            decision: "cancel",
            expected_revision: request.revision,
            idempotency_key: requestKey("cancel"),
          },
        },
      });
      await load();
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
    setBusy(true);
    setError(undefined);
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
      await load();
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
              <InputLabel>Location</InputLabel>
              <Select
                label="Location"
                value={siteId}
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
                disabled={!option.time_off_enabled}
              />
              <Tab
                value="availability"
                label="Availability"
                disabled={!option.availability_editing_enabled}
              />
              <Tab
                value="swap"
                label="Shift swap"
                disabled={!option.shift_swaps_enabled}
              />
            </Tabs>
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
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  required
                  label={`Ends (${site?.timezone})`}
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Box>
            )}
            {tab === "availability" && (
              <Stack spacing={1}>
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
                      disabled={!rule.available}
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
                      disabled={!rule.available}
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
                  <InputLabel>Published shift</InputLabel>
                  <Select
                    label="Published shift"
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
                  <InputLabel>Target employee</InputLabel>
                  <Select
                    label="Target employee"
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
                !reason.trim() ||
                (tab === "time_off" && (!start || !end)) ||
                (tab === "availability" &&
                  (rules.every((rule) => !rule.available) ||
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
                  <Typography sx={{ fontWeight: 700 }}>
                    {request.type.replaceAll("_", " ")}
                  </Typography>
                  <Typography color="text.secondary">
                    {request.reason} · {request.status}
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
    </Stack>
  );
}
