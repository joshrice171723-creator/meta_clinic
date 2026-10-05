import { useId, useEffect, useRef, useState, type FormEvent } from "react";
import AddIcon from "@mui/icons-material/Add";
import PublishIcon from "@mui/icons-material/Publish";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";
import {
  displayInterval,
  mondayIso,
  requestKey,
  type ScheduleBootstrap,
  type ScheduleDraft,
} from "./scheduleTypes";

type PublicationAttempt = {
  draftId: string;
  revision: number;
  siteId: string;
  siteName: string;
  weekStart: string;
  key: string;
};

type ScheduleValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  draft: Pick<ScheduleDraft, "id" | "site_id" | "revision" | "status">;
};

export function ScheduleBuilderPage() {
  const fieldId = useId();
  const { current_site: currentSite, capabilities } = useClinic();
  const { registerBlocker } = useClinicNavigation();
  const currentSiteId = String(currentSite?.id ?? "");
  const currentSiteIdRef = useRef(currentSiteId);
  const loadRevision = useRef(0);
  const draftLoadRevision = useRef(0);
  const validationRevision = useRef(0);
  const validationRequest = useRef<AbortController | null>(null);
  const draftRef = useRef<ScheduleDraft | undefined>(undefined);
  const publicationAttempts = useRef(new Map<string, PublicationAttempt>());
  const [unconfirmedPublications, setUnconfirmedPublications] = useState(0);
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
  const [validation, setValidation] = useState<ScheduleValidation>();
  const [validationError, setValidationError] = useState<string>();
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationStale, setValidationStale] = useState(false);
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
  const [weekStart, setWeekStart] = useState(() => mondayIso());
  const [editorDirty, setEditorDirty] = useState(false);
  const [startOccurrence, setStartOccurrence] = useState("only");
  const [endOccurrence, setEndOccurrence] = useState("only");

  const resetShiftEditor = () => {
    setEditingShiftId(undefined);
    setEmployeeId("");
    setLocalStart("");
    setLocalEnd("");
    setRoleName("");
    setBreakMinutes("0");
    setStartOccurrence("only");
    setEndOccurrence("only");
    setShiftError(undefined);
    setStartError(undefined);
    setEndError(undefined);
    setEditorDirty(false);
    setDateInputRevision((value) => value + 1);
  };
  const confirmDiscard = () =>
    !editorDirty || window.confirm("Discard unsaved shift changes?");
  useDemoNavigationBlocker(() => ({
    blocked: busy,
    message:
      unconfirmedPublications > 0
        ? "Schedule publication is unconfirmed. Leaving loses the saved retry."
        : editorDirty
          ? "Discard unsaved shift changes?"
          : null,
  }));
  useEffect(() => {
    if (!editorDirty && !busy && !unconfirmedPublications) return;
    const message = busy
      ? "A schedule action is still saving."
      : unconfirmedPublications > 0
        ? "Schedule publication is unconfirmed. Leaving loses the saved retry."
        : "Discard unsaved shift changes?";
    const unregister = registerBlocker(() => message, {
      preventNavigation: busy,
    });
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [editorDirty, busy, unconfirmedPublications, registerBlocker]);

  currentSiteIdRef.current = currentSiteId;
  draftRef.current = draft;

  const clearPublishValidation = () => {
    validationRequest.current?.abort();
    validationRequest.current = null;
    validationRevision.current += 1;
    setValidation(undefined);
    setValidationError(undefined);
    setValidationLoading(false);
    setValidationStale(false);
  };

  const closePublishDialog = () => {
    clearPublishValidation();
    setPublishOpen(false);
  };

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
    clearPublishValidation();
    setLoading(true);
    setError(undefined);
    setWorkforceSettingsUnconfigured(false);
    setNotice(undefined);
    setData(undefined);
    setDraft(undefined);
    setPublishOpen(false);
    setDeleteShiftId(undefined);
    resetShiftEditor();
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
      const openDraft =
        next.drafts.find((item) => item.id === selectedDraftId) ??
        next.drafts[0];
      if (openDraft && (next.permissions.manage || next.permissions.publish)) {
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
    return () => {
      loadRevision.current += 1;
      draftLoadRevision.current += 1;
      validationRequest.current?.abort();
      validationRequest.current = null;
      validationRevision.current += 1;
    };
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
      <LoadState error={error} onRetry={() => void load()} />
    );
  const canManage = data.permissions.manage;
  const canPublish = data.permissions.publish;
  const validationMatchesDraft = Boolean(
    validation?.valid &&
      draft &&
      data.site.id === currentSiteId &&
      validation.draft.id === draft.id &&
      validation.draft.site_id === draft.site_id &&
      validation.draft.site_id === currentSiteId &&
      validation.draft.revision === draft.revision &&
      validation.draft.status === draft.status,
  );
  const validateDraft = async () => {
    const expectedDraft = draftRef.current;
    if (
      busy ||
      loading ||
      !canPublish ||
      !expectedDraft ||
      expectedDraft.site_id !== currentSiteId ||
      data.site.id !== currentSiteId
    )
      return;
    const revision = ++validationRevision.current;
    validationRequest.current?.abort();
    const controller = new AbortController();
    validationRequest.current = controller;
    setValidation(undefined);
    setValidationError(undefined);
    setValidationLoading(true);
    setValidationStale(false);
    try {
      const result = await api<ScheduleValidation>(
        `/api/clinic/workforce/schedule-drafts/${expectedDraft.id}/validate`,
        { method: "POST", signal: controller.signal },
      );
      const currentDraft = draftRef.current;
      if (
        controller.signal.aborted ||
        revision !== validationRevision.current ||
        currentSiteIdRef.current !== expectedDraft.site_id ||
        !currentDraft ||
        currentDraft.id !== expectedDraft.id ||
        currentDraft.site_id !== expectedDraft.site_id ||
        currentDraft.revision !== expectedDraft.revision ||
        currentDraft.status !== expectedDraft.status
      )
        return;
      if (
        result.draft.id !== expectedDraft.id ||
        result.draft.site_id !== expectedDraft.site_id ||
        result.draft.revision !== expectedDraft.revision ||
        result.draft.status !== expectedDraft.status
      ) {
        setValidationStale(true);
        setValidationError(
          "This draft changed while it was checked. Refresh saved schedules before publishing.",
        );
        return;
      }
      setValidation(result);
    } catch (reason) {
      if (!controller.signal.aborted && revision === validationRevision.current)
        setValidationError(
          reason instanceof Error
            ? reason.message
            : "Unable to validate the schedule.",
        );
    } finally {
      if (!controller.signal.aborted && revision === validationRevision.current)
        setValidationLoading(false);
    }
  };
  const hasRepeatedHourOnlyShift = (draft?.shifts ?? []).some(
    (shift) =>
      shift.local_start.slice(0, 10) === shift.local_end.slice(0, 10) &&
      shift.local_end <= shift.local_start,
  );
  const validWeek =
    /^\d{4}-\d{2}-\d{2}$/.test(weekStart) &&
    new Date(`${weekStart}T00:00:00Z`).getUTCDay() === 1;
  const refreshSavedDraft = () => {
    if (!draft || !confirmDiscard()) return;
    const draftId = draft.id;
    closePublishDialog();
    void load(draftId);
  };
  const createDraft = async () => {
    if (
      busy ||
      loading ||
      !canManage ||
      !validWeek ||
      data.site.id !== currentSiteId ||
      !confirmDiscard()
    )
      return;
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
              week_start_on: weekStart,
              timezone: data.site.timezone,
              schedule_template_id: templateId || undefined,
            },
          },
        },
      );
      if (currentSiteIdRef.current !== result.draft.site_id) return;
      await load(result.draft.id);
      if (currentSiteIdRef.current === result.draft.site_id)
        setNotice("Draft created and saved.");
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
      busy ||
      loading ||
      !canManage ||
      !draft ||
      draft.site_id !== currentSiteId ||
      !templateName.trim() ||
      !confirmDiscard()
    )
      return;
    if (hasRepeatedHourOnlyShift) {
      setError(
        "A shift that ends within the repeated clock hour cannot be reused as a weekly template. Keep that shift in its dated schedule.",
      );
      return;
    }
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
      await load();
      if (currentSiteIdRef.current === data.site.id)
        setNotice("Weekly template saved.");
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
  const saveShift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      busy ||
      loading ||
      !canManage ||
      !draft ||
      draft.site_id !== currentSiteId
    )
      return;
    const form = new FormData(event.currentTarget);
    const start = String(form.get("local_start") ?? "");
    const end = String(form.get("local_end") ?? "");
    const weekEnd = new Date(`${draft.week_start_on}T00:00:00Z`);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const nextWeekDate = weekEnd.toISOString().slice(0, 10);
    const validLocal = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    const repeatedClockOrder =
      start.slice(0, 10) === end.slice(0, 10) &&
      startOccurrence === "first" &&
      endOccurrence === "second";
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
        : start && end <= start && !repeatedClockOrder
          ? "End must follow start. For a repeated clock hour, choose first start and second end. Overnight shifts need the next date within this week."
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
              start_occurrence: startOccurrence,
              end_occurrence: endOccurrence,
              role_name: roleName,
              break_minutes: breakMinutes,
              expected_revision: draft.revision,
            },
          },
        },
      );
      if (currentSiteIdRef.current !== result.draft.site_id) return;
      clearPublishValidation();
      setDraft(result.draft);
      setData(
        (current) =>
          current && {
            ...current,
            drafts: current.drafts.map((item) =>
              item.id === result.draft.id ? result.draft : item,
            ),
          },
      );
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
  const publish = async (savedAttempt?: PublicationAttempt) => {
    if (
      busy ||
      loading ||
      !canPublish ||
      (savedAttempt
        ? savedAttempt.siteId !== currentSiteId
        : !draft || draft.site_id !== currentSiteId || !validationMatchesDraft) ||
      editorDirty
    )
      return;
    const attempt =
      savedAttempt ||
      (draft &&
        (publicationAttempts.current.get(`${draft.id}:${draft.revision}`) || {
          draftId: draft.id,
          revision: draft.revision,
          siteId: draft.site_id,
          siteName: data.site.name,
          weekStart: draft.week_start_on,
          key: requestKey("publish"),
        }));
    if (!attempt) return;
    setBusy(true);
    setError(undefined);
    setPublishError(undefined);
    const signature = `${attempt.draftId}:${attempt.revision}`;
    const recovering = publicationAttempts.current.has(signature);
    publicationAttempts.current.set(signature, attempt);
    setUnconfirmedPublications(publicationAttempts.current.size);
    try {
      await api(
        `/api/clinic/workforce/schedule-drafts/${attempt.draftId}/publish`,
        {
          method: "POST",
          body: {
            publication: {
              expected_revision: attempt.revision,
              idempotency_key: attempt.key,
            },
          },
        },
      );
      publicationAttempts.current.delete(signature);
      setUnconfirmedPublications(publicationAttempts.current.size);
      if (currentSiteIdRef.current !== attempt.siteId) return;
      closePublishDialog();
      setDraft(undefined);
      const publishedSiteId = attempt.siteId;
      const publishedWeek = attempt.weekStart;
      await load();
      if (currentSiteIdRef.current === publishedSiteId)
        setNotice(
          `Schedule published for the week of ${publishedWeek}. Employee schedules now use this version.`,
        );
    } catch (reason) {
      if (
        !recovering &&
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        ![408, 429].includes(reason.status) &&
        !["outcome_unconfirmed", "session_changed"].includes(reason.code ?? "")
      ) {
        publicationAttempts.current.delete(signature);
        setUnconfirmedPublications(publicationAttempts.current.size);
      }
      setPublishError(
        reason instanceof Error
          ? reason.message
          : "Unable to publish the schedule.",
      );
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to confirm schedule publication.",
      );
    } finally {
      setBusy(false);
    }
  };
  const editShift = (shift: NonNullable<ScheduleDraft["shifts"]>[number]) => {
    if (busy || loading || !canManage || !confirmDiscard()) return;
    setEditingShiftId(shift.id);
    setEmployeeId(shift.employment_id);
    setLocalStart(shift.local_start);
    setLocalEnd(shift.local_end);
    setRoleName(shift.role_name ?? "");
    setBreakMinutes(String(shift.break_minutes));
    setStartOccurrence(shift.start_occurrence ?? "only");
    setEndOccurrence(shift.end_occurrence ?? "only");
    setEditorDirty(false);
    setShiftError(undefined);
    setStartError(undefined);
    setEndError(undefined);
    setDateInputRevision((value) => value + 1);
  };
  const deleteShift = async () => {
    if (
      busy ||
      loading ||
      !canManage ||
      !draft ||
      draft.site_id !== currentSiteId ||
      !deleteShiftId
    )
      return;
    setBusy(true);
    setShiftError(undefined);
    try {
      const result = await api<{ draft: ScheduleDraft }>(
        `/api/clinic/workforce/schedule-drafts/${draft.id}/shifts/${deleteShiftId}?expected_revision=${draft.revision}`,
        { method: "DELETE" },
      );
      if (currentSiteIdRef.current !== result.draft.site_id) return;
      clearPublishValidation();
      setDraft(result.draft);
      setData(
        (current) =>
          current && {
            ...current,
            drafts: current.drafts.map((item) =>
              item.id === result.draft.id ? result.draft : item,
            ),
          },
      );
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
          Build and review weekly employee shifts for {data.site.name}.
          Employees see the published schedule.
        </Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {unconfirmedPublications > 0 && !busy && (
        <Alert severity="warning">
          A publication outcome is unconfirmed. Saved retries preserve the
          original draft and revision even after refreshing or selecting another
          draft. Return to the original location to recover its publication.
          <Stack spacing={1} sx={{ mt: 1 }}>
            {[...publicationAttempts.current.entries()].map(
              ([signature, attempt]) => (
                <Stack
                  key={signature}
                  direction={{ xs: "column", sm: "row" }}
                  sx={{ gap: 1, flexWrap: "wrap" }}
                >
                  <Button
                    disabled={
                      loading ||
                      editorDirty ||
                      !canPublish ||
                      attempt.siteId !== currentSiteId
                    }
                    onClick={() => void publish(attempt)}
                  >
                    Retry week of {attempt.weekStart} at {attempt.siteName} ·
                    revision {attempt.revision}
                  </Button>
                  <Button
                    color="inherit"
                    disabled={loading}
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Stop retrying this publication? It may already be saved. Review published schedules at the original location before publishing again.",
                        )
                      )
                        return;
                      publicationAttempts.current.delete(signature);
                      setUnconfirmedPublications(
                        publicationAttempts.current.size,
                      );
                    }}
                  >
                    Stop retrying this publication
                  </Button>
                </Stack>
              ),
            )}
          </Stack>
        </Alert>
      )}
      {canManage && data.employments.length === 0 && (
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
      {(canManage || canPublish) && (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          useFlexGap
          sx={{ alignItems: { sm: "center" }, flexWrap: "wrap" }}
        >
          <FormControl sx={{ minWidth: 260 }}>
            <InputLabel id={`${fieldId}-1-label`} shrink>
              Draft week
            </InputLabel>
            <Select
              labelId={`${fieldId}-1-label`}
              label="Draft week"
              displayEmpty
              value={draft?.id ?? ""}
              disabled={busy || loading || data.drafts.length === 0}
              onChange={(event) => {
                if (!confirmDiscard()) return;
                const expectedSiteId = currentSiteId;
                const revision = draftLoadRevision.current + 1;
                clearPublishValidation();
                setLoading(true);
                setError(undefined);
                setNotice(undefined);
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
                  })
                  .finally(() => {
                    if (
                      revision === draftLoadRevision.current &&
                      currentSiteIdRef.current === expectedSiteId
                    )
                      setLoading(false);
                  });
              }}
            >
              <MenuItem value="" disabled>
                No draft selected
              </MenuItem>
              {data.drafts.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  Week of {item.week_start_on} · revision {item.revision}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {canManage && (
            <>
              <TextField
                type="date"
                label="New draft week starting"
                value={weekStart}
                disabled={busy || loading}
                error={Boolean(weekStart && !validWeek)}
                helperText="Choose a Monday."
                onChange={(event) => setWeekStart(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <FormControl sx={{ minWidth: 220 }}>
                <InputLabel id={`${fieldId}-2-label`} shrink>
                  Starting template
                </InputLabel>
                <Select
                  labelId={`${fieldId}-2-label`}
                  label="Starting template"
                  displayEmpty
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
                disabled={busy || loading || !validWeek}
                onClick={createDraft}
              >
                Create draft
              </Button>
            </>
          )}
          {draft && canPublish && (
            <Button
              variant="contained"
              startIcon={<PublishIcon />}
              disabled={busy || loading || editorDirty}
              onClick={() => {
                setPublishError(undefined);
                setPublishOpen(true);
                void validateDraft();
              }}
            >
              Review and publish
            </Button>
          )}
        </Stack>
      )}
      <Button
        disabled={busy || loading}
        sx={{ alignSelf: "flex-start" }}
        onClick={() => {
          if (confirmDiscard()) void load();
        }}
      >
        Refresh saved schedules
      </Button>
      {editorDirty && (
        <Alert severity="info">
          Save or cancel the shift changes before publishing.
        </Alert>
      )}
      {!draft && (canManage || canPublish) ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h2">No draft selected</Typography>
          <Typography color="text.secondary">
            {canManage
              ? "Create a weekly draft to begin assigning shifts."
              : "No draft is available for publication review."}
          </Typography>
        </Paper>
      ) : draft ? (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell>Shift</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell align="right">Break</TableCell>
                  {canManage && <TableCell align="right">Actions</TableCell>}
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
                    {canManage && (
                      <TableCell align="right">
                        <Stack
                          direction="row"
                          sx={{ justifyContent: "flex-end" }}
                          spacing={1}
                        >
                          <Button
                            size="small"
                            disabled={busy || loading}
                            onClick={() => editShift(shift)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            disabled={busy || loading}
                            onClick={() => {
                              setDeleteShiftId(shift.id);
                            }}
                          >
                            Delete
                          </Button>
                        </Stack>
                      </TableCell>
                    )}
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
          {canManage && (
            <>
              <Paper
                component="form"
                variant="outlined"
                sx={{ p: 2.5 }}
                onSubmit={saveShift}
                onChange={() => setEditorDirty(true)}
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
                      disabled={
                        busy || loading || data.employments.length === 0
                      }
                      onChange={(e) => {
                        setEmployeeId(e.target.value);
                        setEditorDirty(true);
                      }}
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
                    disabled={busy || loading}
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    slotProps={{ htmlInput: { maxLength: 120 } }}
                  />
                  <TextField
                    key={`start-${dateInputRevision}`}
                    name="local_start"
                    disabled={busy || loading}
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
                    disabled={busy || loading}
                    label={`Ends (${draft.timezone})`}
                    type="datetime-local"
                    defaultValue={localEnd}
                    error={Boolean(endError)}
                    helperText={
                      endError ??
                      "End must follow start in this timezone and remain within the selected week."
                    }
                    onChange={(e) => {
                      setLocalEnd(e.target.value);
                      setEndError(undefined);
                    }}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <TextField
                    select
                    label="Start clock occurrence"
                    value={startOccurrence}
                    disabled={busy || loading}
                    onChange={(event) => {
                      setStartOccurrence(event.target.value);
                      setEditorDirty(true);
                    }}
                    helperText="Choose first or second only when the clock repeats this time."
                  >
                    <MenuItem value="only">Time occurs once</MenuItem>
                    <MenuItem value="first">First occurrence</MenuItem>
                    <MenuItem value="second">Second occurrence</MenuItem>
                  </TextField>
                  <TextField
                    select
                    label="End clock occurrence"
                    value={endOccurrence}
                    disabled={busy || loading}
                    onChange={(event) => {
                      setEndOccurrence(event.target.value);
                      setEditorDirty(true);
                    }}
                    helperText="Choose first or second only when the clock repeats this time."
                  >
                    <MenuItem value="only">Time occurs once</MenuItem>
                    <MenuItem value="first">First occurrence</MenuItem>
                    <MenuItem value="second">Second occurrence</MenuItem>
                  </TextField>
                  <TextField
                    label="Unpaid break (minutes)"
                    disabled={busy || loading}
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
                  disabled={busy || loading || !employeeId}
                >
                  Save shift
                </Button>
                {(editingShiftId || editorDirty) && (
                  <Button
                    sx={{ mt: 2, ml: 1 }}
                    disabled={busy || loading}
                    onClick={() => {
                      if (confirmDiscard()) resetShiftEditor();
                    }}
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
                  Save the current assignments and times as a weekly template
                  for a future draft.
                </Typography>
                {hasRepeatedHourOnlyShift && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    This draft contains a shift within the repeated clock hour.
                    Keep it in the dated schedule; its times cannot be reused as
                    a weekly template.
                  </Alert>
                )}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <TextField
                    label="Template name"
                    disabled={busy || loading}
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 120 } }}
                  />
                  <Button
                    variant="outlined"
                    disabled={
                      busy ||
                      loading ||
                      editorDirty ||
                      hasRepeatedHourOnlyShift ||
                      !templateName.trim() ||
                      !draft.shifts?.length
                    }
                    onClick={saveTemplate}
                  >
                    Save template
                  </Button>
                </Stack>
              </Paper>
            </>
          )}
        </>
      ) : null}
      <Stack spacing={1}>
        <Typography variant="h2">Published schedules</Typography>
        {!data.publications.length && (
          <Typography color="text.secondary">
            No published schedule is available for this location.
          </Typography>
        )}
        {data.publications.map((publication) => (
          <Accordion key={publication.id} variant="outlined" disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>
                Week of {publication.week_start_on} · version{" "}
                {publication.version} · {publication.shifts.length} shifts
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  {publication.timezone}
                </Typography>
                {publication.shifts.map((shift) => (
                  <Typography key={shift.id} variant="body2">
                    {shift.employee_name} ·{" "}
                    {displayInterval(
                      shift.starts_at,
                      shift.ends_at,
                      shift.timezone,
                    )}
                    {shift.role_name ? ` · ${shift.role_name}` : ""}
                  </Typography>
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>
      <Dialog
        open={publishOpen}
        onClose={() => !busy && closePublishDialog()}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Publish this schedule?</DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography>{`${draft?.shifts?.length ?? 0} shifts for the week of ${draft?.week_start_on ?? ""}.`}</Typography>
            <Alert severity="info">
              Publishing replaces the currently published schedule for this
              location and week. To change it later, create a new draft and
              publish that schedule.
            </Alert>
            {draft?.shifts?.length === 0 && (
              <Alert severity="warning">
                This week will have no assigned shifts. Any previously published
                shifts for this location and week will no longer appear on
                employee schedules. Earlier publications are retained.
              </Alert>
            )}
            {validationLoading && (
              <Alert severity="info">Checking saved schedule conflicts…</Alert>
            )}
            {validationError && <Alert severity="error">{validationError}</Alert>}
            {validation && !validation.valid && (
              <Alert severity="error">
                <Typography sx={{ fontWeight: 600 }}>
                  Resolve these conflicts before publishing.
                </Typography>
                {validation.errors.map((message) => (
                  <Typography key={message} variant="body2">
                    {message}
                  </Typography>
                ))}
              </Alert>
            )}
            {validation?.valid && (
              <Alert severity="success">No blocking schedule conflicts found.</Alert>
            )}
            {validation?.warnings?.length ? (
              <Alert severity="warning">
                <Typography sx={{ fontWeight: 600 }}>
                  Review these warnings before publishing.
                </Typography>
                {validation.warnings.map((message) => (
                  <Typography key={message} variant="body2">
                    {message}
                  </Typography>
                ))}
              </Alert>
            ) : null}
            {publishError && <Alert severity="error">{publishError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={closePublishDialog}>
            Keep editing
          </Button>
          {validationStale && (
            <Button disabled={busy || loading} onClick={refreshSavedDraft}>
              Refresh saved draft
            </Button>
          )}
          <Button
            disabled={
              busy ||
              loading ||
              validationLoading ||
              validationStale ||
              !draft ||
              editorDirty
            }
            onClick={() => void validateDraft()}
          >
            {validationLoading ? "Checking…" : "Recheck"}
          </Button>
          <Button
            variant="contained"
            onClick={() => void publish()}
            disabled={
              busy ||
              loading ||
              validationLoading ||
              !draft ||
              editorDirty ||
              !canPublish ||
              !validationMatchesDraft
            }
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
