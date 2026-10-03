import { useId, useEffect, useRef, useState, type FormEvent } from "react";
import AddIcon from "@mui/icons-material/Add";
import PublishIcon from "@mui/icons-material/Publish";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { ApiError, api } from "../../api/client";
import { LoadState } from "../../shared/ui";
import { useClinic } from "../clinic/Workspace";
import {
  displayInterval,
  mondayIso,
  requestKey,
  type ScheduleBootstrap,
  type ScheduleDraft,
} from "./scheduleTypes";

export function ScheduleBuilderPage() {
  const fieldId = useId();
  const { current_site: currentSite, capabilities } = useClinic();
  const currentSiteId = String(currentSite?.id ?? "");
  const currentSiteIdRef = useRef(currentSiteId);
  const loadRevision = useRef(0);
  const draftLoadRevision = useRef(0);
  const [data, setData] = useState<ScheduleBootstrap>();
  const [draft, setDraft] = useState<ScheduleDraft>();
  const [error, setError] = useState<string>();
  const [workforceSettingsUnconfigured, setWorkforceSettingsUnconfigured] =
    useState(false);
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishError, setPublishError] = useState<string>();
  const [employeeId, setEmployeeId] = useState("");
  const [localStart, setLocalStart] = useState("");
  const [localEnd, setLocalEnd] = useState("");
  const [dateInputRevision, setDateInputRevision] = useState(0);
  const [editingShiftId, setEditingShiftId] = useState<string>();
  const [shiftError, setShiftError] = useState<string>();
  const [startError, setStartError] = useState<string>();
  const [endError, setEndError] = useState<string>();
  const [deleteShiftId, setDeleteShiftId] = useState<string>();
  const [roleName, setRoleName] = useState("");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");

  currentSiteIdRef.current = currentSiteId;

  const loadDraft = async (id: string, expectedSiteId: string) => {
    const revision = ++draftLoadRevision.current;
    const next = (
      await api<{ draft: ScheduleDraft }>(
        `/api/clinic/workforce/schedule-drafts/${id}`,
      )
    ).draft;
    if (
      revision !== draftLoadRevision.current ||
      currentSiteIdRef.current !== expectedSiteId ||
      next.site_id !== expectedSiteId
    )
      return undefined;
    return next;
  };

  const load = async (preferredDraftId?: string) => {
    if (!currentSiteId) return;
    const revision = ++loadRevision.current;
    const expectedSiteId = currentSiteId;
    draftLoadRevision.current += 1;
    setLoading(true);
    setError(undefined);
    setWorkforceSettingsUnconfigured(false);
    setNotice(undefined);
    setData(undefined);
    setDraft(undefined);
    setPublishOpen(false);
    setTemplateId("");
    setEmployeeId("");
    try {
      const next = await api<ScheduleBootstrap>(
        `/api/clinic/workforce/schedules?site_id=${expectedSiteId}`,
      );
      if (
        revision !== loadRevision.current ||
        currentSiteIdRef.current !== expectedSiteId ||
        next.site.id !== expectedSiteId
      )
        return;
      setData(next);
      const selectedDraftId =
        preferredDraftId ??
        (draft?.site_id === expectedSiteId ? draft.id : undefined);
      const openDraft = selectedDraftId
        ? next.drafts.find((item) => item.id === selectedDraftId)
        : next.drafts[0];
      if (openDraft) {
        const nextDraft = await loadDraft(openDraft.id, expectedSiteId);
        if (nextDraft) setDraft(nextDraft);
      }
    } catch (reason) {
      if (
        revision === loadRevision.current &&
        currentSiteIdRef.current === expectedSiteId
      ) {
        if (
          reason instanceof ApiError &&
          reason.code === "workforce_settings_unconfigured"
        ) {
          setWorkforceSettingsUnconfigured(true);
        } else {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load schedules.",
          );
        }
      }
    } finally {
      if (
        revision === loadRevision.current &&
        currentSiteIdRef.current === expectedSiteId
      )
        setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [currentSiteId]);

  if (!currentSite)
    return (
      <Alert severity="info">
        Select a clinic location to manage its workforce schedule.
      </Alert>
    );
  if (!data || data.site.id !== currentSiteId)
    return workforceSettingsUnconfigured ? (
      <Alert severity="info">
        Workforce settings are not configured for this location.{" "}
        {capabilities.workforce_settings === true ? (
          <Button href="/clinic/workforce/settings" size="small">
            Configure workforce settings
          </Button>
        ) : (
          "Ask a clinic administrator to configure them."
        )}
      </Alert>
    ) : (
      <LoadState error={error} />
    );
  const createDraft = async () => {
    if (loading || data.site.id !== currentSiteId) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await api<{ draft: ScheduleDraft }>(
        "/api/clinic/workforce/schedule-drafts",
        {
          method: "POST",
          body: {
            draft: {
              site_id: data.site.id,
              week_start_on: mondayIso(),
              timezone: data.site.timezone,
              schedule_template_id: templateId || undefined,
            },
          },
        },
      );
      setDraft(result.draft);
      setNotice("Draft created and saved.");
      await load(result.draft.id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create the draft.",
      );
    } finally {
      setBusy(false);
    }
  };
  const saveTemplate = async () => {
    if (
      loading ||
      !draft ||
      draft.site_id !== currentSiteId ||
      !templateName.trim()
    )
      return;
    setBusy(true);
    setError(undefined);
    const definitions = (draft.shifts ?? []).map((shift) => ({
      employment_id: shift.employment_id,
      day_of_week: new Date(
        `${shift.local_start.slice(0, 10)}T00:00:00Z`,
      ).getUTCDay(),
      start_time: shift.local_start.slice(11, 16),
      end_time: shift.local_end.slice(11, 16),
      start_occurrence: shift.start_occurrence ?? "only",
      end_occurrence: shift.end_occurrence ?? "only",
      role_name: shift.role_name ?? "",
      break_minutes: shift.break_minutes,
    }));
    try {
      await api("/api/clinic/workforce/schedule-templates", {
        method: "POST",
        body: {
          template: {
            site_id: data.site.id,
            name: templateName.trim(),
            timezone: draft.timezone,
            shift_definitions: definitions,
          },
        },
      });
      setTemplateName("");
      setNotice("Weekly template saved.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save this template.",
      );
    } finally {
      setBusy(false);
    }
  };
  const resetShiftEditor = () => {
    setEditingShiftId(undefined);
    setLocalStart("");
    setLocalEnd("");
    setRoleName("");
    setBreakMinutes("0");
    setShiftError(undefined);
    setStartError(undefined);
    setEndError(undefined);
    setDateInputRevision((value) => value + 1);
  };
  const saveShift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading || !draft || draft.site_id !== currentSiteId) return;
    const form = new FormData(event.currentTarget);
    const start = String(form.get("local_start") ?? "");
    const end = String(form.get("local_end") ?? "");
    const weekEnd = new Date(`${draft.week_start_on}T00:00:00Z`);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const nextWeekDate = weekEnd.toISOString().slice(0, 10);
    const validLocal = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    const nextStartError = !validLocal.test(start)
      ? "Enter a complete start date and time."
      : start.slice(0, 10) < draft.week_start_on ||
          start >= `${nextWeekDate}T00:00`
        ? `Start must fall within the week of ${draft.week_start_on}.`
        : undefined;
    const nextEndError = !validLocal.test(end)
      ? "Enter a complete end date and time."
      : end.slice(0, 10) < draft.week_start_on || end > `${nextWeekDate}T00:00`
        ? `End must fall within the week of ${draft.week_start_on}.`
        : start && end <= start
          ? "End must be later than start. Overnight shifts must end within the selected week."
          : undefined;
    setStartError(nextStartError);
    setEndError(nextEndError);
    setShiftError(undefined);
    if (nextStartError || nextEndError) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await api<{ draft: ScheduleDraft }>(
        `/api/clinic/workforce/schedule-drafts/${draft.id}/shifts`,
        {
          method: "POST",
          body: {
            shift: {
              id: editingShiftId,
              employment_id: employeeId,
              local_start: start,
              local_end: end,
              start_occurrence: "only",
              end_occurrence: "only",
              role_name: roleName,
              break_minutes: breakMinutes,
              expected_revision: draft.revision,
            },
          },
        },
      );
      setDraft(result.draft);
      resetShiftEditor();
      setNotice("Shift saved to the draft.");
    } catch (reason) {
      setShiftError(
        reason instanceof Error ? reason.message : "Unable to save the shift.",
      );
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    if (loading || !draft || draft.site_id !== currentSiteId) return;
    setBusy(true);
    setError(undefined);
    setPublishError(undefined);
    try {
      await api(`/api/clinic/workforce/schedule-drafts/${draft.id}/publish`, {
        method: "POST",
        body: {
          publication: {
            expected_revision: draft.revision,
            idempotency_key: requestKey("publish"),
          },
        },
      });
      setPublishOpen(false);
      setDraft(undefined);
      const publishedSiteId = draft.site_id;
      const publishedWeek = draft.week_start_on;
      await load();
      if (currentSiteIdRef.current === publishedSiteId)
        setNotice(
          `Schedule published for the week of ${publishedWeek}. Employees can now see their assigned shifts.`,
        );
    } catch (reason) {
      setPublishError(
        reason instanceof Error
          ? reason.message
          : "Unable to publish the schedule.",
      );
    } finally {
      setBusy(false);
    }
  };
  const editShift = (shift: NonNullable<ScheduleDraft["shifts"]>[number]) => {
    setEditingShiftId(shift.id);
    setEmployeeId(shift.employment_id);
    setLocalStart(shift.local_start);
    setLocalEnd(shift.local_end);
    setRoleName(shift.role_name ?? "");
    setBreakMinutes(String(shift.break_minutes));
    setShiftError(undefined);
    setStartError(undefined);
    setEndError(undefined);
    setDateInputRevision((value) => value + 1);
  };
  const deleteShift = async () => {
    if (loading || !draft || draft.site_id !== currentSiteId || !deleteShiftId)
      return;
    setBusy(true);
    setShiftError(undefined);
    try {
      const result = await api<{ draft: ScheduleDraft }>(
        `/api/clinic/workforce/schedule-drafts/${draft.id}/shifts/${deleteShiftId}?expected_revision=${draft.revision}`,
        { method: "DELETE" },
      );
      setDraft(result.draft);
      if (editingShiftId === deleteShiftId) resetShiftEditor();
      setDeleteShiftId(undefined);
      setNotice("Shift removed from the draft.");
    } catch (reason) {
      setShiftError(
        reason instanceof Error
          ? reason.message
          : "Unable to remove the shift.",
      );
      setDeleteShiftId(undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          WORKFORCE / SCHEDULING
        </Typography>
        <Typography variant="h1">Schedule builder</Typography>
        <Typography color="text.secondary">
          Build weekly employee shifts for {data.site.name}. Facility operating
          hours appear only as context and never define employee shifts.
        </Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {data.employments.length === 0 && (
        <Alert severity="info">
          No active employees are assigned to {data.site.name}. Assign employees
          to this location before adding shifts, or select a location with
          assigned employees.
          {capabilities.workforce_admin === true && (
            <Button href="/clinic/workforce/employees" size="small">
              Manage employees
            </Button>
          )}
        </Alert>
      )}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "center" } }}
      >
        <FormControl sx={{ minWidth: 260 }}>
          <InputLabel id={`${fieldId}-1-label`}>Draft week</InputLabel>
          <Select
            labelId={`${fieldId}-1-label`}
            label="Draft week"
            value={draft?.id ?? ""}
            disabled={busy || loading}
            onChange={(event) => {
              const expectedSiteId = currentSiteId;
              void loadDraft(event.target.value, expectedSiteId)
                .then((nextDraft) => {
                  if (nextDraft) {
                    setDraft(nextDraft);
                    resetShiftEditor();
                  }
                })
                .catch((reason: unknown) => {
                  if (currentSiteIdRef.current === expectedSiteId)
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Unable to load the selected draft.",
                    );
                });
            }}
          >
            {data.drafts.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                Week of {item.week_start_on} · revision {item.revision}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 220 }}>
          <InputLabel id={`${fieldId}-2-label`}>Starting template</InputLabel>
          <Select
            labelId={`${fieldId}-2-label`}
            label="Starting template"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            disabled={busy || loading}
          >
            <MenuItem value="">Blank schedule</MenuItem>
            {data.templates.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          disabled={busy || loading}
          onClick={createDraft}
        >
          New current-week draft
        </Button>
        {draft && (
          <Button
            variant="contained"
            startIcon={<PublishIcon />}
            disabled={busy || loading}
            onClick={() => {
              setPublishError(undefined);
              setPublishOpen(true);
            }}
          >
            Review and publish
          </Button>
        )}
      </Stack>
      {!draft ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h2">No draft selected</Typography>
          <Typography color="text.secondary">
            Create a weekly draft to begin assigning persisted shifts.
          </Typography>
        </Paper>
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell>Shift</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell align="right">Break</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(draft.shifts ?? []).map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell>{shift.employee_name}</TableCell>
                    <TableCell>
                      {displayInterval(
                        shift.starts_at,
                        shift.ends_at,
                        shift.timezone,
                      )}
                    </TableCell>
                    <TableCell>{shift.role_name || "Not specified"}</TableCell>
                    <TableCell align="right">
                      {shift.break_minutes} min
                    </TableCell>
                    <TableCell align="right">
                      <Stack
                        direction="row"
                        sx={{ justifyContent: "flex-end" }}
                        spacing={1}
                      >
                        <Button
                          size="small"
                          disabled={busy}
                          onClick={() => editShift(shift)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          disabled={busy}
                          onClick={() => setDeleteShiftId(shift.id)}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(draft.shifts ?? []).length === 0 && (
              <Box sx={{ p: 3 }}>
                <Typography color="text.secondary">
                  No shifts are saved in this draft.
                </Typography>
              </Box>
            )}
          </TableContainer>
          <Paper
            component="form"
            variant="outlined"
            sx={{ p: 2.5 }}
            onSubmit={saveShift}
          >
            <Typography variant="h2" sx={{ mb: 2 }}>
              {editingShiftId ? "Edit shift" : "Add shift"}
            </Typography>
            {shiftError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {shiftError}
              </Alert>
            )}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, minmax(0, 1fr))",
                },
                gap: 2,
              }}
            >
              <FormControl required>
                <InputLabel id={`${fieldId}-3-label`}>Employee</InputLabel>
                <Select
                  labelId={`${fieldId}-3-label`}
                  label="Employee"
                  value={employeeId}
                  disabled={data.employments.length === 0}
                  onChange={(e) => setEmployeeId(e.target.value)}
                >
                  {data.employments.map((employee) => (
                    <MenuItem value={employee.id} key={employee.id}>
                      {employee.name} · {employee.job_title}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Role on shift"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                slotProps={{ htmlInput: { maxLength: 120 } }}
              />
              <TextField
                key={`start-${dateInputRevision}`}
                name="local_start"
                label={`Starts (${draft.timezone})`}
                type="datetime-local"
                defaultValue={localStart}
                error={Boolean(startError)}
                helperText={
                  startError ??
                  `Use a date within ${draft.week_start_on} through the end of this week.`
                }
                onChange={(e) => {
                  setLocalStart(e.target.value);
                  setStartError(undefined);
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                key={`end-${dateInputRevision}`}
                name="local_end"
                label={`Ends (${draft.timezone})`}
                type="datetime-local"
                defaultValue={localEnd}
                error={Boolean(endError)}
                helperText={
                  endError ??
                  "End must be after start and within the selected week."
                }
                onChange={(e) => {
                  setLocalEnd(e.target.value);
                  setEndError(undefined);
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Unpaid break (minutes)"
                type="number"
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
                slotProps={{ htmlInput: { min: 0, max: 1440 } }}
              />
            </Box>
            <Button
              type="submit"
              variant="contained"
              sx={{ mt: 2 }}
              disabled={busy || !employeeId}
            >
              Save shift
            </Button>
            {editingShiftId && (
              <Button
                sx={{ mt: 2, ml: 1 }}
                disabled={busy}
                onClick={resetShiftEditor}
              >
                Cancel edit
              </Button>
            )}
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h2" sx={{ mb: 1 }}>
              Reuse this week
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Save the current assignments and times as a weekly template for a
              future draft.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                label="Template name"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 120 } }}
              />
              <Button
                variant="outlined"
                disabled={busy || !templateName.trim() || !draft.shifts?.length}
                onClick={saveTemplate}
              >
                Save template
              </Button>
            </Stack>
          </Paper>
        </>
      )}
      <Dialog
        open={publishOpen}
        onClose={() => !busy && setPublishOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Publish this schedule?</DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography>{`${draft?.shifts?.length ?? 0} shifts for the week of ${draft?.week_start_on ?? ""}.`}</Typography>
            <Alert severity="info">
              Publishing makes this schedule available to employees. To change
              it later, create a new draft and publish that schedule.
            </Alert>
            {publishError && <Alert severity="error">{publishError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPublishOpen(false)}>Keep editing</Button>
          <Button
            variant="contained"
            onClick={publish}
            disabled={busy || !draft?.shifts?.length}
          >
            {busy ? "Publishing…" : "Publish schedule"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(deleteShiftId)}
        onClose={() => !busy && setDeleteShiftId(undefined)}
      >
        <DialogTitle>Remove this draft shift?</DialogTitle>
        <DialogContent>
          This removes the shift from this draft. Published schedules are not
          changed.
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setDeleteShiftId(undefined)}>
            Cancel
          </Button>
          <Button color="error" disabled={busy} onClick={deleteShift}>
            Remove shift
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
