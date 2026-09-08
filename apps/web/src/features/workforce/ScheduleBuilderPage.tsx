import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { api } from "../../api/client";
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
  const { current_site: currentSite } = useClinic();
  const currentSiteId = String(currentSite?.id ?? "");
  const currentSiteIdRef = useRef(currentSiteId);
  const loadRevision = useRef(0);
  const draftLoadRevision = useRef(0);
  const [data, setData] = useState<ScheduleBootstrap>();
  const [draft, setDraft] = useState<ScheduleDraft>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [localStart, setLocalStart] = useState("");
  const [localEnd, setLocalEnd] = useState("");
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

  const load = async () => {
    if (!currentSiteId) return;
    const revision = ++loadRevision.current;
    const expectedSiteId = currentSiteId;
    draftLoadRevision.current += 1;
    setLoading(true);
    setError(undefined);
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
      const openDraft =
        draft?.site_id === expectedSiteId
          ? next.drafts.find((item) => item.id === draft.id)
          : next.drafts[0];
      if (openDraft) {
        const nextDraft = await loadDraft(openDraft.id, expectedSiteId);
        if (nextDraft) setDraft(nextDraft);
      }
    } catch (reason) {
      if (
        revision === loadRevision.current &&
        currentSiteIdRef.current === expectedSiteId
      )
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load schedules.",
        );
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
    return <LoadState error={error} />;
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
      await load();
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
  const saveShift = async (event: FormEvent) => {
    event.preventDefault();
    if (loading || !draft || draft.site_id !== currentSiteId) return;
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
              employment_id: employeeId,
              local_start: localStart,
              local_end: localEnd,
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
      setLocalStart("");
      setLocalEnd("");
      setRoleName("");
      setNotice("Shift saved to the draft.");
    } catch (reason) {
      setError(
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
      setNotice(
        "Schedule published. Employees can now see their assigned shifts.",
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to publish the schedule.",
      );
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
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "center" } }}
      >
        <FormControl sx={{ minWidth: 260 }}>
          <InputLabel>Draft week</InputLabel>
          <Select
            label="Draft week"
            value={draft?.id ?? ""}
            disabled={busy || loading}
            onChange={(event) => {
              const expectedSiteId = currentSiteId;
              void loadDraft(event.target.value, expectedSiteId)
                .then((nextDraft) => {
                  if (nextDraft) setDraft(nextDraft);
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
          <InputLabel>Starting template</InputLabel>
          <Select
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
            onClick={() => setPublishOpen(true)}
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
          <Paper
            component="form"
            variant="outlined"
            sx={{ p: 2.5 }}
            onSubmit={saveShift}
          >
            <Typography variant="h2" sx={{ mb: 2 }}>
              Add shift
            </Typography>
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
                <InputLabel>Employee</InputLabel>
                <Select
                  label="Employee"
                  value={employeeId}
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
                required
                label={`Starts (${draft.timezone})`}
                type="datetime-local"
                value={localStart}
                onChange={(e) => setLocalStart(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                required
                label={`Ends (${draft.timezone})`}
                type="datetime-local"
                value={localEnd}
                onChange={(e) => setLocalEnd(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText="An earlier end time is treated as overnight."
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
              disabled={busy || !employeeId || !localStart || !localEnd}
            >
              Save shift
            </Button>
          </Paper>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell>Shift</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell align="right">Break</TableCell>
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
            <Typography>
              {draft?.shifts?.length ?? 0} shifts for the week of{" "}
              {draft?.week_start_on}.
            </Typography>
            <Alert severity="info">
              Publishing creates an immutable version. Later changes create and
              publish another version; this one is retained.
            </Alert>
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
    </Stack>
  );
}
