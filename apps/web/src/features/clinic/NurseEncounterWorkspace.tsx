import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type {
  ClinicalTask,
  ClinicalTaskCollection,
  EncounterDetail,
  NurseIntakeFieldDefinition,
  NurseIntakeItem,
  NurseValueState,
  NurseWorkspace,
  Patient,
} from "../../api/contracts";
import {
  api,
  ApiError,
  currentLoginDestination,
} from "../../api/client";
import { patientReferenceLabel } from "./patientReference";
import { VitalSignsEntry } from "./VitalSignsEntry";
import "./nurseWorkspace.css";

type IntakeDraft = {
  completenessState: "complete" | "incomplete" | "unknown";
  items: NurseIntakeItem[];
};

type MutationAttempt = {
  label: string;
  requestKey: string;
  clearsIntakeDraft?: boolean;
  run: () => Promise<unknown>;
};

const VALUE_STATES: NurseValueState[] = [
  "known",
  "not_recorded",
  "incomplete",
  "unable_to_obtain",
  "declined",
  "not_applicable",
  "unknown",
];

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function requestKey(prefix: string) {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${prefix}-${Date.now()}-${Math.random()}`
  );
}

function displayTime(value: string | null, timezone: string) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(parsed);
}

function emptyItem(definition: NurseIntakeFieldDefinition): NurseIntakeItem {
  return {
    id: null,
    field_code: definition.field_code,
    value_state: "not_recorded",
    value_type: definition.value_type,
    boolean_value: null,
    decimal_value: null,
    coded_value: null,
    date_value: null,
    unit_code: definition.unit_code,
  };
}

function intakeDraft(workspace: NurseWorkspace): IntakeDraft {
  const latest = workspace.intake.latest_revision;
  const recorded = new Map(
    (latest?.items ?? []).map((item) => [item.field_code, item]),
  );
  const configured = workspace.intake.field_definitions.map(
    (definition) => recorded.get(definition.field_code) ?? emptyItem(definition),
  );
  const configuredCodes = new Set(
    workspace.intake.field_definitions.map((definition) => definition.field_code),
  );
  return {
    completenessState: latest?.completeness_state ?? "incomplete",
    items: [
      ...configured,
      ...(latest?.items ?? []).filter(
        (item) => !configuredCodes.has(item.field_code),
      ),
    ],
  };
}

function mutationItems(items: NurseIntakeItem[]) {
  return items.map((item) => ({
    field_code: item.field_code,
    value_state: item.value_state,
    value_type: item.value_type,
    boolean_value: item.value_state === "known" ? item.boolean_value : null,
    decimal_value: item.value_state === "known" ? item.decimal_value : null,
    coded_value: item.value_state === "known" ? item.coded_value : null,
    date_value: item.value_state === "known" ? item.date_value : null,
    unit_code: item.unit_code,
  }));
}

function workspacePath(patientId: number, encounterId: number) {
  return `/api/clinic/patients/${patientId}/encounters/${encounterId}/nurse_workspace`;
}

function taskCollectionPath(patientId: number, encounterId: number) {
  const query = new URLSearchParams({
    patient_id: String(patientId),
    encounter_id: String(encounterId),
  });
  return `/api/clinic/clinical_tasks?${query}`;
}

function useNurseWorkspace(patientId: number, encounterId: number) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    data?: NurseWorkspace;
    error?: string;
    stale: boolean;
    refreshing: boolean;
  }>({ stale: false, refreshing: true });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({
      ...current,
      error: undefined,
      stale: Boolean(current.data),
      refreshing: true,
    }));
    void Promise.all([
      api<NurseWorkspace>(workspacePath(patientId, encounterId), {
        signal: controller.signal,
      }),
      api<ClinicalTaskCollection>(taskCollectionPath(patientId, encounterId), {
        signal: controller.signal,
      }),
    ])
      .then(([workspace, taskCollection]) => {
        if (controller.signal.aborted) return;
        if (
          workspace.patient_id !== patientId ||
          workspace.encounter_id !== encounterId ||
          taskCollection.patient_id !== patientId ||
          taskCollection.encounter_id !== encounterId
        )
          throw new Error(
            "The nurse workspace did not match the selected patient and encounter.",
          );
        setState({
          data: {
            ...workspace,
            tasks: taskCollection.tasks,
            task_templates:
              taskCollection.task_templates ?? workspace.task_templates,
          },
          stale: false,
          refreshing: false,
        });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        if (caught instanceof ApiError && caught.status === 401) {
          window.location.replace(
            `/login?next=${encodeURIComponent(currentLoginDestination())}`,
          );
          return;
        }
        setState((current) => ({
          ...current,
          error:
            caught instanceof Error
              ? caught.message
              : "The nurse workspace could not be loaded.",
          stale: Boolean(current.data),
          refreshing: false,
        }));
      });
    return () => controller.abort();
  }, [patientId, encounterId, revision]);

  return {
    ...state,
    refresh: () => setRevision((current) => current + 1),
  };
}

function IntakeValueControl({
  definition,
  item,
  disabled,
  onChange,
}: {
  definition?: NurseIntakeFieldDefinition;
  item: NurseIntakeItem;
  disabled: boolean;
  onChange: (patch: Partial<NurseIntakeItem>) => void;
}) {
  if (item.value_state !== "known") return null;
  if (item.value_type === "boolean")
    return (
      <FormControl fullWidth size="small">
        <InputLabel id={`intake-${item.field_code}-value-label`}>
          Recorded value
        </InputLabel>
        <Select
          labelId={`intake-${item.field_code}-value-label`}
          value={item.boolean_value == null ? "" : String(item.boolean_value)}
          label="Recorded value"
          disabled={disabled}
          onChange={(event) =>
            onChange({
              boolean_value:
                event.target.value === ""
                  ? null
                  : event.target.value === "true",
            })
          }
        >
          <MenuItem value="">Choose a recorded value</MenuItem>
          <MenuItem value="true">Yes</MenuItem>
          <MenuItem value="false">No</MenuItem>
        </Select>
      </FormControl>
    );
  if (item.value_type === "coded" && definition?.allowed_codes?.length)
    return (
      <FormControl fullWidth size="small">
        <InputLabel id={`intake-${item.field_code}-value-label`}>
          Recorded value
        </InputLabel>
        <Select
          labelId={`intake-${item.field_code}-value-label`}
          value={item.coded_value ?? ""}
          label="Recorded value"
          disabled={disabled}
          onChange={(event) => onChange({ coded_value: event.target.value })}
        >
          <MenuItem value="">Choose a recorded value</MenuItem>
          {definition.allowed_codes.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    );
  if (item.value_type === "coded")
    return (
      <Typography variant="body2" color="text.secondary">
        {item.coded_value
          ? `Recorded code: ${item.coded_value}`
          : "No server-approved coded choices are available."}
      </Typography>
    );
  return (
    <TextField
      fullWidth
      size="small"
      type={item.value_type === "date" ? "date" : "text"}
      inputMode={item.value_type === "decimal" ? "decimal" : undefined}
      label="Recorded value"
      value={
        item.value_type === "date"
          ? (item.date_value ?? "")
          : (item.decimal_value ?? "")
      }
      disabled={disabled}
      onChange={(event) =>
        onChange(
          item.value_type === "date"
            ? { date_value: event.target.value || null }
            : { decimal_value: event.target.value || null },
        )
      }
      slotProps={{ inputLabel: { shrink: true } }}
    />
  );
}

export function NurseEncounterWorkspace({
  patient,
  encounter,
  timezone,
}: {
  patient: Patient;
  encounter: EncounterDetail;
  timezone: string;
}) {
  const resource = useNurseWorkspace(patient.id, encounter.id);
  const workspace = resource.data;
  const [draft, setDraft] = useState<IntakeDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<MutationAttempt | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [handoffRecipient, setHandoffRecipient] = useState("");
  const [taskKind, setTaskKind] = useState("");
  const allowNavigation = useRef(false);

  useEffect(() => {
    if (!workspace || dirty) return;
    setDraft(intakeDraft(workspace));
  }, [workspace, dirty]);

  useEffect(() => {
    if (
      uncertain &&
      workspace?.confirmed_request_keys?.includes(uncertain.requestKey)
    ) {
      setNotice(`${uncertain.label} was confirmed after refresh.`);
      setUncertain(null);
    }
  }, [uncertain, workspace?.confirmed_request_keys]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty || allowNavigation.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const captureLink = (event: MouseEvent) => {
      if (!dirty || allowNavigation.current || event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        (destination.pathname === window.location.pathname &&
          destination.search === window.location.search &&
          destination.hash.startsWith("#"))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(
        `${destination.pathname}${destination.search}${destination.hash}`,
      );
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", captureLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", captureLink, true);
    };
  }, [dirty]);

  const definitions = useMemo(
    () =>
      new Map(
        (workspace?.intake.field_definitions ?? []).map((definition) => [
          definition.field_code,
          definition,
        ]),
      ),
    [workspace?.intake.field_definitions],
  );
  const allowed = (...actions: string[]) =>
    actions.some((action) => workspace?.allowed_actions.includes(action));
  const mutationBlocked = Boolean(busyLabel || uncertain);

  const execute = async (attempt: MutationAttempt, explicitRetry = false) => {
    if (busyLabel || (uncertain && !explicitRetry)) return;
    setBusyLabel(attempt.label);
    setError(null);
    setConflict(null);
    setNotice(null);
    try {
      await attempt.run();
      setUncertain(null);
      if (attempt.clearsIntakeDraft) setDirty(false);
      setNotice(`${attempt.label} saved.`);
      resource.refresh();
    } catch (caught: unknown) {
      if (
        caught instanceof ApiError &&
        caught.code === "outcome_unconfirmed"
      ) {
        setUncertain(attempt);
      } else if (caught instanceof ApiError && caught.status === 409) {
        setConflict(caught.message);
      } else {
        setError(
          caught instanceof Error
            ? caught.message
            : `${attempt.label} could not be saved.`,
        );
      }
    } finally {
      setBusyLabel(null);
    }
  };

  const updateDraftItem = (
    index: number,
    patch: Partial<NurseIntakeItem>,
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item, itemIndex) =>
              itemIndex === index ? { ...item, ...patch } : item,
            ),
          }
        : current,
    );
    setDirty(true);
    setConflict(null);
    setNotice(null);
  };

  const saveIntake = () => {
    if (!workspace || !draft) return;
    const key = requestKey("intake");
    const attempt: MutationAttempt = {
      label: "Intake revision",
      requestKey: key,
      clearsIntakeDraft: true,
      run: () =>
        api(
          `/api/clinic/patients/${patient.id}/encounters/${encounter.id}/intake_revisions`,
          {
            method: "POST",
            body: {
              intake_revision: {
                patient_id: patient.id,
                encounter_id: encounter.id,
                expected_version: workspace.intake.version,
                request_key: key,
                completeness_state: draft.completenessState,
                items: mutationItems(draft.items),
              },
            },
          },
        ),
    };
    void execute(attempt);
  };

  const requestHandoff = () => {
    if (!workspace || !handoffRecipient) return;
    const key = requestKey("handoff");
    const attempt: MutationAttempt = {
      label: "Handoff request",
      requestKey: key,
      run: () =>
        api(
          `/api/clinic/patients/${patient.id}/encounters/${encounter.id}/handoffs`,
          {
            method: "POST",
            body: {
              handoff: {
                patient_id: patient.id,
                encounter_id: encounter.id,
                expected_version: workspace.workflow.version,
                request_key: key,
                intake_revision_id:
                  workspace.intake.latest_revision?.id ?? null,
                requested_to_membership_id: Number(handoffRecipient),
              },
            },
          },
        ),
    };
    void execute(attempt);
  };

  const transitionHandoff = (
    action: "accept" | "reject" | "request_correction",
  ) => {
    if (!workspace?.handoff) return;
    const key = requestKey(`handoff-${action}`);
    const handoff = workspace.handoff;
    const attempt: MutationAttempt = {
      label: `Handoff ${label(action).toLowerCase()}`,
      requestKey: key,
      run: () =>
        api(`/api/clinic/handoffs/${handoff.id}/${action}`, {
          method: "POST",
          body: {
            handoff: {
              patient_id: patient.id,
              encounter_id: encounter.id,
              expected_version: handoff.version,
              request_key: key,
            },
          },
        }),
    };
    void execute(attempt);
  };

  const createTask = () => {
    if (!workspace || !taskKind) return;
    const template = workspace.task_templates?.find(
      (candidate) => candidate.kind === taskKind,
    );
    if (!template) return;
    const key = requestKey("clinical-task");
    const attempt: MutationAttempt = {
      label: "Clinical task",
      requestKey: key,
      run: () =>
        api("/api/clinic/clinical_tasks", {
          method: "POST",
          body: {
            clinical_task: {
              patient_id: patient.id,
              encounter_id: encounter.id,
              kind: template.kind,
              pool_code: template.pool_code,
              request_key: key,
            },
          },
        }),
    };
    void execute(attempt);
  };

  const updateTask = (
    task: ClinicalTask,
    status: "in_progress" | "completed",
  ) => {
    const key = requestKey(`clinical-task-${status}`);
    const attempt: MutationAttempt = {
      label: status === "completed" ? "Task completion" : "Task start",
      requestKey: key,
      run: () =>
        api(`/api/clinic/clinical_tasks/${task.id}`, {
          method: "PATCH",
          body: {
            clinical_task: {
              patient_id: patient.id,
              encounter_id: encounter.id,
              expected_version: task.version,
              request_key: key,
              status,
            },
          },
        }),
    };
    void execute(attempt);
  };

  const taskAllows = (task: ClinicalTask, action: string) =>
    task.allowed_actions?.includes(action) ||
    workspace?.allowed_actions.includes(action);

  const header = (
    <Paper variant="outlined" className="nurse-workspace-identity">
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
      >
        <Box>
          <Typography variant="overline">Nurse workspace</Typography>
          <Typography variant="h6" component="h2">
            {patient.display_name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {patientReferenceLabel(patient.reference) || "Reference not recorded"}
            {` · Encounter #${encounter.id}`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Chip
            variant="outlined"
            label={workspace ? label(workspace.workflow.state) : "Loading state"}
          />
          <Button href="/clinic" variant="outlined" size="small">
            Tracking Board
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );

  if (!workspace)
    return (
      <section id="nurse-workspace" aria-labelledby="nurse-workspace-title">
        {header}
        <Alert severity={resource.error ? "error" : "info"} sx={{ mt: 2 }}>
          {resource.error ?? "Loading the recorded nurse workspace…"}
        </Alert>
      </section>
    );

  if (
    workspace.patient_id !== patient.id ||
    workspace.encounter_id !== encounter.id ||
    encounter.patient_id !== patient.id
  )
    return (
      <section id="nurse-workspace">
        {header}
        <Alert severity="error" sx={{ mt: 2 }}>
          This workspace does not belong to the selected patient and encounter.
          Return to the Tracking Board and select the visit again.
        </Alert>
      </section>
    );

  const recipients = workspace.handoff_recipients ?? [];
  const taskTemplates = workspace.task_templates ?? [];

  return (
    <section id="nurse-workspace" aria-labelledby="nurse-workspace-title">
      {header}
      <Typography id="nurse-workspace-title" variant="h5" sx={{ mt: 2 }}>
        Recorded visit work
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Snapshot {displayTime(workspace.as_of, timezone)}. Values remain unknown
        or incomplete unless a committed record says otherwise.
      </Typography>

      {(workspace.stale || resource.stale || resource.error) && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={resource.refresh}>
              Reload
            </Button>
          }
          sx={{ mt: 2 }}
        >
          {resource.error
            ? `Refresh failed: ${resource.error}. The displayed record may be stale.`
            : "This workspace may be stale. Reload before acting."}
        </Alert>
      )}
      {uncertain && (
        <Alert
          severity="warning"
          sx={{ mt: 2 }}
          action={
            <Stack direction="row" spacing={1}>
              <Button color="inherit" size="small" onClick={resource.refresh}>
                Reconcile
              </Button>
              <Button
                color="inherit"
                size="small"
                onClick={() => void execute(uncertain, true)}
              >
                Retry same action
              </Button>
            </Stack>
          }
        >
          {uncertain.label} has an unconfirmed outcome. Other writes are locked
          until this exact request is reconciled; it will not retry automatically.
        </Alert>
      )}
      {conflict && (
        <Alert
          severity="warning"
          sx={{ mt: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                setDirty(false);
                setConflict(null);
                resource.refresh();
              }}
            >
              Reload saved intake
            </Button>
          }
        >
          {conflict} Your unsaved intake values remain in this window until you
          choose to reload them.
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mt: 2 }}>{notice}</Alert>}

      <Box className="nurse-workspace-layout" sx={{ mt: 2 }}>
        <Stack spacing={2} className="nurse-workspace-primary">
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="h6" component="h3">
                  Intake
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Revision {workspace.intake.latest_revision?.revision_no ?? "not recorded"}
                  {workspace.intake.latest_revision
                    ? ` · recorded ${displayTime(workspace.intake.latest_revision.recorded_at, timezone)}`
                    : ""}
                </Typography>
              </Box>
              {!draft || draft.items.length === 0 ? (
                <Alert severity="info">
                  No server-approved intake fields are available. No clinical
                  field has been inferred on this screen.
                </Alert>
              ) : (
                <>
                  <FormControl fullWidth size="small">
                    <InputLabel id="intake-completeness-label">
                      Recorded completeness
                    </InputLabel>
                    <Select
                      labelId="intake-completeness-label"
                      value={draft.completenessState}
                      label="Recorded completeness"
                      disabled={!allowed("intake.write", "intake_write") || mutationBlocked}
                      onChange={(event) => {
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                completenessState: event.target.value as IntakeDraft["completenessState"],
                              }
                            : current,
                        );
                        setDirty(true);
                      }}
                    >
                      <MenuItem value="incomplete">Incomplete</MenuItem>
                      <MenuItem value="complete">Complete</MenuItem>
                      <MenuItem value="unknown">Unknown</MenuItem>
                    </Select>
                  </FormControl>
                  <Box className="nurse-intake-fields">
                    {draft.items.map((item, index) => {
                      const definition = definitions.get(item.field_code);
                      const allowedStates =
                        definition?.allowed_states.length
                          ? definition.allowed_states
                          : [item.value_state];
                      return (
                        <Paper
                          key={item.field_code}
                          variant="outlined"
                          className="nurse-intake-field"
                        >
                          <Typography variant="subtitle2">
                            {definition?.label ?? item.field_code}
                          </Typography>
                          <FormControl fullWidth size="small">
                            <InputLabel id={`intake-${item.field_code}-state-label`}>
                              Recording state
                            </InputLabel>
                            <Select
                              labelId={`intake-${item.field_code}-state-label`}
                              value={item.value_state}
                              label="Recording state"
                              disabled={!allowed("intake.write", "intake_write") || mutationBlocked}
                              onChange={(event) =>
                                updateDraftItem(index, {
                                  value_state: event.target.value as NurseValueState,
                                })
                              }
                            >
                              {allowedStates.map((state) => (
                                <MenuItem key={state} value={state}>
                                  {label(state)}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <IntakeValueControl
                            definition={definition}
                            item={item}
                            disabled={!allowed("intake.write", "intake_write") || mutationBlocked}
                            onChange={(patch) => updateDraftItem(index, patch)}
                          />
                        </Paper>
                      );
                    })}
                  </Box>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button
                      variant="contained"
                      disabled={
                        !dirty ||
                        mutationBlocked ||
                        Boolean(conflict) ||
                        !allowed("intake.write", "intake_write")
                      }
                      onClick={saveIntake}
                    >
                      {busyLabel === "Intake revision"
                        ? "Saving…"
                        : "Save intake revision"}
                    </Button>
                    {dirty && (
                      <Button
                        variant="text"
                        disabled={mutationBlocked}
                        onClick={() => {
                          setDraft(intakeDraft(workspace));
                          setDirty(false);
                          setConflict(null);
                        }}
                      >
                        Discard local changes
                      </Button>
                    )}
                  </Stack>
                  {dirty && (
                    <Typography role="status" variant="body2" color="warning.main">
                      Unsaved intake changes. Keep this patient and encounter open
                      until the revision is confirmed.
                    </Typography>
                  )}
                </>
              )}
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="h6" component="h3">
                  Triage evidence
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Recorded state: {label(workspace.triage.state)}. This screen does
                  not calculate acuity, priority, or normal ranges.
                </Typography>
              </Box>
              {workspace.triage.evidence.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No triage evidence is recorded.
                </Typography>
              ) : (
                <Stack divider={<Divider flexItem />}>
                  {workspace.triage.evidence.map((evidence) => (
                    <Box key={evidence.id} sx={{ py: 1 }}>
                      <Typography variant="subtitle2">
                        {label(evidence.evidence_kind)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {label(evidence.evidence_state)} · {displayTime(evidence.recorded_at, timezone)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
              {allowed("triage.write", "triage_write") && (
                <VitalSignsEntry
                  key={`${patient.id}:${encounter.id}:nurse`}
                  patientId={patient.id}
                  patientName={patient.display_name}
                  encounterId={encounter.id}
                  onRecorded={() => resource.refresh()}
                />
              )}
            </Stack>
          </Paper>
        </Stack>

        <Stack spacing={2} className="nurse-workspace-secondary">
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" component="h3">
              Handoff
            </Typography>
            {workspace.handoff ? (
              <Stack spacing={1.5} sx={{ mt: 1 }}>
                <Chip
                  variant="outlined"
                  label={label(workspace.handoff.state)}
                  sx={{ alignSelf: "flex-start" }}
                />
                <Typography variant="body2" color="text.secondary">
                  Bound to intake revision {workspace.handoff.intake_revision_id ?? "not recorded"}.
                  Opening this chart does not accept the handoff.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  {allowed("handoffs.accept", "handoff.accept") && (
                    <Button
                      size="small"
                      variant="contained"
                      disabled={mutationBlocked}
                      onClick={() => transitionHandoff("accept")}
                    >
                      Accept handoff
                    </Button>
                  )}
                  {allowed("handoffs.reject", "handoff.reject") && (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={mutationBlocked}
                      onClick={() => transitionHandoff("reject")}
                    >
                      Reject
                    </Button>
                  )}
                  {allowed(
                    "handoffs.request_correction",
                    "handoff.request_correction",
                  ) && (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={mutationBlocked}
                      onClick={() => transitionHandoff("request_correction")}
                    >
                      Request correction
                    </Button>
                  )}
                </Stack>
              </Stack>
            ) : allowed("handoffs.request", "handoff.request") ? (
              recipients.length === 0 ? (
                <Alert severity="info" sx={{ mt: 1 }}>
                  No eligible handoff recipient is available. Assignment is not
                  inferred from job title, booking, or chart access.
                </Alert>
              ) : (
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="handoff-recipient-label">Recipient</InputLabel>
                    <Select
                      labelId="handoff-recipient-label"
                      value={handoffRecipient}
                      label="Recipient"
                      disabled={mutationBlocked}
                      onChange={(event) => setHandoffRecipient(event.target.value)}
                    >
                      <MenuItem value="">Choose an eligible recipient</MenuItem>
                      {recipients.map((recipient) => (
                        <MenuItem
                          key={recipient.membership_id}
                          value={String(recipient.membership_id)}
                        >
                          {recipient.display_name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="contained"
                    disabled={!handoffRecipient || mutationBlocked}
                    onClick={requestHandoff}
                  >
                    Request handoff
                  </Button>
                </Stack>
              )
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                No handoff is recorded, and no handoff action is available.
              </Typography>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" component="h3">
              Assigned work
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Task priority is displayed as recorded; it is not a clinical acuity score.
            </Typography>
            {workspace.tasks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                No tasks are recorded for this encounter.
              </Typography>
            ) : (
              <Stack divider={<Divider flexItem />} sx={{ mt: 1 }}>
                {workspace.tasks.map((task) => (
                  <Box key={task.id} sx={{ py: 1.25 }}>
                    <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
                      <Typography variant="subtitle2">{label(task.kind)}</Typography>
                      <Chip size="small" variant="outlined" label={label(task.status)} />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Recorded priority: {label(task.priority)} · Due {displayTime(task.due_at, timezone)}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      {task.status === "pending" &&
                        taskAllows(task, "clinical_tasks.start") && (
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={mutationBlocked}
                            onClick={() => updateTask(task, "in_progress")}
                          >
                            Start
                          </Button>
                        )}
                      {task.status !== "completed" &&
                        taskAllows(task, "clinical_tasks.complete") && (
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={mutationBlocked}
                            onClick={() => updateTask(task, "completed")}
                          >
                            Complete
                          </Button>
                        )}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
            {allowed("clinical_tasks.create", "clinical_tasks.write") &&
              taskTemplates.length > 0 && (
                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="task-template-label">New task</InputLabel>
                    <Select
                      labelId="task-template-label"
                      value={taskKind}
                      label="New task"
                      disabled={mutationBlocked}
                      onChange={(event) => setTaskKind(event.target.value)}
                    >
                      <MenuItem value="">Choose an approved task</MenuItem>
                      {taskTemplates.map((template) => (
                        <MenuItem key={template.kind} value={template.kind}>
                          {template.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="outlined"
                    disabled={!taskKind || mutationBlocked}
                    onClick={createTask}
                  >
                    Add task
                  </Button>
                </Stack>
              )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" component="h3">
              Chart objects
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Read-only records linked to this patient and encounter.
            </Typography>
            {workspace.chart_objects.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                No linked chart objects are recorded.
              </Typography>
            ) : (
              <Stack divider={<Divider flexItem />} sx={{ mt: 1 }}>
                {workspace.chart_objects.map((object) => (
                  <Box key={`${object.object_type}:${object.id}`} sx={{ py: 1 }}>
                    <Typography variant="subtitle2">
                      {object.href?.startsWith("/clinic/") ? (
                        <Link href={object.href}>{object.display_label}</Link>
                      ) : (
                        object.display_label
                      )}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {label(object.object_type)} · {label(object.state)} · {displayTime(object.recorded_at, timezone)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Stack>
      </Box>

      <Dialog open={Boolean(pendingHref)} onClose={() => setPendingHref(null)}>
        <DialogTitle>Leave with unsaved intake changes?</DialogTitle>
        <DialogContent>
          <Typography>
            These intake changes exist only in this window and have not been
            added to the patient record.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingHref(null)}>Keep editing</Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => {
              if (!pendingHref) return;
              allowNavigation.current = true;
              window.location.assign(pendingHref);
            }}
          >
            Discard and leave
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
