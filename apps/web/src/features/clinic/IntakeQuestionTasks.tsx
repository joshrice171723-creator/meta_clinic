import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { api, ApiError, SESSION_CHANGED_EVENT } from "../../api/client";
import type {
  ClinicalTask,
  ClinicalTaskMutationReceipt as TaskReceipt,
  IntakeQuestionTaskSource,
  IntakeQuestionTaskLink,
  IntakeQuestionTasksProjection as Projection,
} from "../../api/contracts";
import { IntakeSourceAnswer } from "./IntakeAnswerProvenance";

type Assignee = {membership_id: number; label: string};
type LinkBody = {
  request_key: string;
  intake_revision_id: number;
  question_id: string;
  task_id?: number;
  expected_task_version?: number;
  task_kind?: ClinicalTask["task_kind"];
  pool_code?: ClinicalTask["pool_code"];
};
type TaskAction = "claim" | "assign" | "accept_transfer" | "reject_transfer" | "start" | "complete" | "cancel" | "reopen";
type TaskBody = {
  action: TaskAction;
  request_key: string;
  expected_version: number;
  assignee_membership_id?: number;
  resolution_code?: string;
};
type Attempt = {
  context: string;
  actorMembershipId: number;
  uncertain: boolean;
} & ({ kind: "link"; body: LinkBody } | { kind: "task"; taskId: number; body: TaskBody });
const taskKinds: ClinicalTask["task_kind"][] = ["intake", "patient_call", "record_request", "staff_request", "result_follow_up", "order_execution", "handoff"];
const activeStates = ["open", "claimed", "in_progress", "on_hold"];
const label = (value: string) => value.replaceAll("_", " ");
const sourceKey = (source: IntakeQuestionTaskSource) => `${source.intake_revision_id}:${source.question_id}`;
const uncertainFailure = (reason: unknown) => !(reason instanceof ApiError) || reason.status === 408 || reason.status >= 500 || reason.code === "session_changed" || reason.code === "outcome_unconfirmed";

function OriginalQuestionAnswer({ source }: {source: IntakeQuestionTaskSource}) {
  return <Accordion>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="body2">Original linked answer</Typography></AccordionSummary>
    <AccordionDetails><Stack spacing={1}>
      {source.source_available ? <>
        <Typography variant="caption">Original form {source.source_form_id ?? "unavailable"} · questionnaire version {source.source_questionnaire_version ?? "unavailable"} · intake source revision {source.source_revision_version ?? "unavailable"}</Typography>
        <Typography variant="caption">Original recorder {source.source_recorded_by_membership_id != null ? `membership #${source.source_recorded_by_membership_id}` : "unavailable"} · recording time {source.source_recorded_at ?? "unavailable"}</Typography>
        <IntakeSourceAnswer answer={source.source_answer ?? undefined} question={source.source_question ?? undefined} />
      </> : <Alert severity="warning">Original source content is unavailable. The recorded revision reference remains preserved.</Alert>}
    </Stack></AccordionDetails>
  </Accordion>;
}

export function IntakeQuestionTasks({ patientId, encounterId, tasks, writable, disabled, onChanged }: {
  patientId: number;
  encounterId: number;
  tasks: ClinicalTask[];
  writable: boolean;
  disabled: boolean;
  onChanged: () => void;
}) {
  const context = `${patientId}:${encounterId}`;
  const currentContext = useRef(context);
  currentContext.current = context;
  const generation = useRef(0);
  const loadSequence = useRef(0);
  const attempt = useRef<Attempt | null>(null);
  const inFlight = useRef<Attempt | null>(null);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [source, setSource] = useState<IntakeQuestionTaskSource | null>(null);
  const [existingTask, setExistingTask] = useState<ClinicalTask | null>(null);
  const [mode, setMode] = useState("existing");
  const [taskKind, setTaskKind] = useState<ClinicalTask["task_kind"] | "">("");
  const [pool, setPool] = useState<ClinicalTask["pool_code"] | "">("");
  const [assignee, setAssignee] = useState<Assignee | null>(null);
  const [resolution, setResolution] = useState("completed");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const path = `/api/clinic/patients/${patientId}/encounters/${encounterId}/intake_question_tasks`;
  const owned = (current: Attempt, epoch: number) => currentContext.current === current.context && generation.current === epoch && attempt.current === current;
  const accept = () => {
    attempt.current = null;
    setUnknown(false);
    setError("");
    setNotice("Saved task action acknowledged.");
    onChanged();
  };
  const matchesLink = (link: IntakeQuestionTaskLink, body: LinkBody, actorId: number) => link.recorded_by_membership_id === actorId && Number.isSafeInteger(link.task_id) && link.task_id > 0 && link.request_key === body.request_key && link.intake_revision_id === body.intake_revision_id && link.question_id === body.question_id && (body.task_id === undefined || link.task_id === body.task_id) && Number.isSafeInteger(link.id) && link.id > 0;
  const matchesTask = (task: ClinicalTask, receipt: TaskReceipt | undefined, current: Extract<Attempt, {kind: "task"}>) => {
    if (task.id !== current.taskId || task.patient_id !== patientId || task.encounter_id !== encounterId || !receipt) return false;
    if (receipt.request_key !== current.body.request_key || receipt.operation_code !== `operations.clinical_task.${current.body.action}` || receipt.resource_id !== current.taskId || receipt.actor_membership_id !== current.actorMembershipId || !/^\d+$/.test(receipt.resource_version)) return false;
    const recordedVersion = Number(receipt.resource_version);
    return Number.isSafeInteger(recordedVersion) && recordedVersion >= current.body.expected_version && recordedVersion <= current.body.expected_version + 1;
  };

  async function load() {
    const epoch = generation.current;
    const expectedContext = context;
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const result = await api<Projection>(path);
      if (currentContext.current !== expectedContext || generation.current !== epoch || loadSequence.current !== sequence) return;
      if (result.patient_id !== patientId || result.encounter_id !== encounterId || !Array.isArray(result.sources) || !Array.isArray(result.links) || !Array.isArray(result.tasks) || !Array.isArray(result.eligible_assignees) || !Number.isSafeInteger(result.actor_membership_id) || result.actor_membership_id <= 0 || result.tasks.some((task) => task.patient_id !== patientId || task.encounter_id !== encounterId)) throw new Error("The task projection did not match this encounter.");
      setProjection(result);
      if (!attempt.current) setExistingTask((selected) => selected ? result.tasks.find((task) => task.id === selected.id && task.source_type === "manual" && !task.source_managed) ?? null : null);
      const pending = attempt.current;
      if (!pending) setError("");
      if (pending?.uncertain && pending.kind === "link") {
        const receipt = result.links.find((link) => matchesLink(link, pending.body, pending.actorMembershipId));
        if (receipt && result.tasks.some((task) => task.id === receipt.task_id)) accept();
        else setError("Saved links do not acknowledge the captured request. Its outcome remains unknown; retry the same request.");
      }
    } catch (reason) {
      if (currentContext.current === expectedContext && generation.current === epoch && loadSequence.current === sequence) setError(reason instanceof Error ? reason.message : "Task links could not be loaded.");
    } finally {
      if (currentContext.current === expectedContext && generation.current === epoch && loadSequence.current === sequence) setLoading(false);
    }
  }

  useEffect(() => {
    generation.current += 1;
    attempt.current = null;
    inFlight.current = null;
    setProjection(null);
    setSource(null);
    setExistingTask(null);
    setAssignee(null);
    setTaskKind("");
    setPool("");
    setMode("existing");
    setBusy(false);
    setUnknown(false);
    setError("");
    setNotice("");
    void load();
    const clearSession = () => {
      generation.current += 1;
      attempt.current = null;
      inFlight.current = null;
      setProjection(null);
      setSource(null);
      setExistingTask(null);
      setAssignee(null);
      setTaskKind("");
      setPool("");
      setMode("existing");
      setResolution("completed");
      setBusy(false);
      setUnknown(false);
      setNotice("");
      setError("The session changed. Reopen the encounter under the current session.");
    };
    window.addEventListener(SESSION_CHANGED_EVENT, clearSession);
    return () => { generation.current += 1; attempt.current = null; inFlight.current = null; window.removeEventListener(SESSION_CHANGED_EVENT, clearSession); };
    // This protected projection is scoped to the patient and encounter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, encounterId]);

  const previousTasks = useRef(tasks);
  useEffect(() => {
    if (previousTasks.current !== tasks) {
      previousTasks.current = tasks;
      if (!inFlight.current) void load();
    }
    // Parent workspace refreshes return current authorized task records.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  async function submit(current: Attempt) {
    if (inFlight.current || disabled || !writable || current.context !== context) return;
    const epoch = generation.current;
    attempt.current = current;
    inFlight.current = current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (current.kind === "link") {
        const result = await api<{patient_id: number; encounter_id: number; task: ClinicalTask; link: IntakeQuestionTaskLink}>(path, { method: "POST", body: {question_task: current.body} });
        if (!owned(current, epoch)) return;
        if (result.patient_id !== patientId || result.encounter_id !== encounterId || !result.link || !matchesLink(result.link, current.body, current.actorMembershipId) || result.task?.id !== result.link.task_id || result.task.patient_id !== patientId || result.task.encounter_id !== encounterId) throw new ApiError(502, "The response did not acknowledge this question/task request.", "outcome_unconfirmed");
      } else {
        const result = await api<{task: ClinicalTask; task_receipt?: TaskReceipt}>(`/api/clinic/clinical_tasks/${current.taskId}`, {method: "PATCH", body: {task: current.body}});
        if (!owned(current, epoch)) return;
        if (!result.task || !matchesTask(result.task, result.task_receipt, current)) throw new ApiError(502, "The task receipt did not acknowledge the captured request.", "outcome_unconfirmed");
      }
      accept();
      void load();
    } catch (reason) {
      if (!owned(current, epoch)) return;
      if (current.uncertain || uncertainFailure(reason)) {
        current.uncertain = true;
        setUnknown(true);
        setError("The original task request remains unacknowledged. Its captured body and key are preserved; retry the same request or check saved links.");
      } else {
        attempt.current = null;
        setError(reason instanceof Error ? reason.message : "The task action was rejected.");
      }
    } finally {
      if (inFlight.current === current && generation.current === epoch) { inFlight.current = null; setBusy(false); }
    }
  }

  function linkQuestion() {
    if (!projection || !source?.source_available || attempt.current || (!existingTask && mode === "existing")) return;
    if (mode === "new" && (!taskKind || !pool)) return;
    const selectedTask = existingTask && taskRecords.find((task) => task.id === existingTask.id && task.source_type === "manual" && !task.source_managed);
    if (mode === "existing" && !selectedTask) return;
    const body: LinkBody = {request_key: crypto.randomUUID(), intake_revision_id: source.intake_revision_id, question_id: source.question_id, ...(mode === "existing" ? {task_id: selectedTask!.id, expected_task_version: selectedTask!.version} : {task_kind: taskKind as ClinicalTask["task_kind"], pool_code: pool as ClinicalTask["pool_code"]})};
    void submit({kind: "link", context, actorMembershipId: projection.actor_membership_id, uncertain: false, body});
  }
  function transition(task: ClinicalTask, action: TaskAction) {
    if (attempt.current || !projection) return;
    const membershipId = assignee?.membership_id;
    if (action === "assign" && (membershipId === undefined || !Number.isSafeInteger(membershipId) || membershipId <= 0)) { setError("Select an authorized active staff member."); return; }
    void submit({kind: "task", context, actorMembershipId: projection.actor_membership_id, uncertain: false, taskId: task.id, body: {action, request_key: crypto.randomUUID(), expected_version: task.version, ...(action === "assign" ? {assignee_membership_id: membershipId} : {}), ...(action === "complete" ? {resolution_code: resolution} : {})}});
  }
  const taskRecords = (projection?.tasks ?? tasks).filter((task) => task.patient_id === patientId && task.encounter_id === encounterId);
  const manualTasks = taskRecords.filter((task) => task.source_type === "manual" && !task.source_managed);
  const hasNewerRevision = (selected: IntakeQuestionTaskSource) => selected.intake_version !== null && (projection?.sources ?? []).some((candidate) => candidate.question_id === selected.question_id && candidate.intake_version !== null && candidate.intake_version > selected.intake_version!);
  const historicalNotice = "A newer saved revision has follow-up details for this question. This historical source and task remain preserved. Deliberately select the newer revision for new work; tasks are not automatically reopened.";
  const locked = disabled || !writable || busy || unknown || loading;
  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>Question follow-up tasks ({projection?.links.length ?? 0})</Typography></AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">Choose a saved question and revision, then deliberately link or create a manual encounter task. The recorded answer and follow-up details remain unchanged. Assignment and transfer acknowledgment use the existing task workflow.</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {notice && <Alert severity="success">{notice}</Alert>}
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Button onClick={() => void load()} disabled={busy || loading}>Check saved links</Button>
            {unknown && <Button variant="contained" disabled={busy || loading || disabled || !writable} onClick={() => { if (attempt.current) void submit(attempt.current); }}>Retry same request</Button>}
          </Stack>
          {unknown && <Alert severity="warning">The original request is unresolved. New task actions and source selection are locked. Checking links can acknowledge a matching link receipt; task transitions require their exact retry acknowledgment.</Alert>}
          <Autocomplete options={(projection?.sources ?? []).filter((item) => item.source_available)} value={source} disabled={locked} isOptionEqualToValue={(option, value) => sourceKey(option) === sourceKey(value)} getOptionLabel={(option) => `${option.question_label} · intake revision ${option.intake_version} · #${option.intake_revision_id}`} onChange={(_, value) => setSource(value)} renderInput={(params) => <TextField {...params} label="Saved question and revision" />} />
          {source && <Stack spacing={0.5}>
            <Typography variant="body2">Original answer state: {label(source.source_answer_state)} · source revision {source.source_revision_version}</Typography>
            <Typography variant="body2" sx={{whiteSpace: "pre-wrap"}}>Reason: {source.reason}</Typography>
            <Typography variant="body2" sx={{whiteSpace: "pre-wrap"}}>Next action: {source.next_action}</Typography>
            {hasNewerRevision(source) && <Alert severity="info">{historicalNotice}</Alert>}
            <OriginalQuestionAnswer key={sourceKey(source)} source={source} />
          </Stack>}
          {writable && <Stack spacing={1.5}>
            <TextField select label="Task linkage" value={mode} disabled={locked} onChange={(event) => setMode(event.target.value)}>
              <MenuItem value="existing">Link an existing manual task</MenuItem><MenuItem value="new">Create a new unassigned manual task</MenuItem>
            </TextField>
            {mode === "existing" ? <Autocomplete options={manualTasks} value={existingTask} disabled={locked} isOptionEqualToValue={(option, value) => option.id === value.id} getOptionLabel={(task) => `Task #${task.id} · ${label(task.task_kind)} · ${label(task.state)}`} onChange={(_, value) => setExistingTask(value)} renderInput={(params) => <TextField {...params} label="Manual encounter task" />} /> : <Stack direction={{xs: "column", sm: "row"}} spacing={1}>
              <TextField select label="Task kind" value={taskKind} disabled={locked} onChange={(event) => setTaskKind(event.target.value as ClinicalTask["task_kind"])} fullWidth><MenuItem value="">Choose task kind</MenuItem>{taskKinds.map((kind) => <MenuItem key={kind} value={kind}>{label(kind)}</MenuItem>)}</TextField>
              <TextField select label="Task pool" value={pool} disabled={locked} onChange={(event) => setPool(event.target.value as ClinicalTask["pool_code"])} fullWidth><MenuItem value="">Choose task pool</MenuItem>{["clinical", "front_desk", "records"].map((value) => <MenuItem key={value} value={value}>{label(value)}</MenuItem>)}</TextField>
            </Stack>}
            <Button variant="outlined" disabled={locked || !source?.source_available || (mode === "existing" && !existingTask) || (mode === "new" && (!taskKind || !pool))} onClick={linkQuestion}>{mode === "existing" ? "Link selected question to task" : "Create and link unassigned task"}</Button>
            <Autocomplete options={projection?.eligible_assignees ?? []} value={assignee} disabled={locked} isOptionEqualToValue={(option, value) => option.membership_id === value.membership_id} getOptionLabel={(option) => option.label} onChange={(_, value) => setAssignee(value)} renderInput={(params) => <TextField {...params} label="Staff member for requested transfer" helperText="Choose an authorized active staff member. The recipient must acknowledge the transfer." />} />
            <TextField select label="Completion resolution" value={resolution} disabled={locked} onChange={(event) => setResolution(event.target.value)}>{["completed", "unable_to_complete", "no_action_needed", "superseded"].map((value) => <MenuItem key={value} value={value}>{label(value)}</MenuItem>)}</TextField>
          </Stack>}
          {!loading && projection?.sources.length === 0 && <Alert severity="info">No saved per-question follow-up details are available. Save a reason and next action with the intake before linking a task.</Alert>}
          {projection?.links.map((link) => {
            const task = taskRecords.find((record) => record.id === link.task_id);
            const manual = task?.source_type === "manual" && !task.source_managed;
            const active = task && activeStates.includes(task.state);
            const actorId = projection?.actor_membership_id;
            const owns = task?.assigned_to_membership_id === actorId;
            const recipient = task?.pending_assignee_membership_id === actorId;
            const blocked = !!task?.waiting_reason || !!task?.waiting_on_task_ids?.length;
            const canClaim = task && active && (!task.assigned_to_membership_id || owns || task.owner_unavailable) && (!(task.state === "claimed" || task.state === "in_progress") || task.owner_unavailable);
            return <Accordion key={link.id}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>{link.question_label} · intake {link.intake_version ?? "unavailable"} · task #{link.task_id} · {task ? label(task.state) : "unavailable"}</Typography></AccordionSummary>
              <AccordionDetails><Stack spacing={1}>
                <Typography variant="body2">Immutable link #{link.id} · revision #{link.intake_revision_id} · question {link.question_id} · source revision {link.source_revision_version ?? "unavailable"} · answer state {label(link.source_answer_state)}</Typography>
                {!link.source_available && <Alert severity="warning">The immutable revision reference is recorded, but its source content is unavailable. No answer or follow-up detail is inferred.</Alert>}
                {link.source_available && <Typography variant="body2" sx={{whiteSpace: "pre-wrap"}}>Reason: {link.reason}</Typography>}
                {link.source_available && <Typography variant="body2" sx={{whiteSpace: "pre-wrap"}}>Next action: {link.next_action}</Typography>}
                {hasNewerRevision(link) && <Alert severity="info">{historicalNotice}</Alert>}
                <OriginalQuestionAnswer key={sourceKey(link)} source={link} />
                <Typography variant="caption">Linked by membership #{link.recorded_by_membership_id} at {link.recorded_at}</Typography>
                {task ? <>
                  <Typography variant="body2">{label(task.task_kind)} · {label(task.pool_code)} pool · owner {task.assigned_to_membership_id ? `#${task.assigned_to_membership_id}` : "unassigned"} · version {task.version}</Typography>
                  {task.pending_assignee_membership_id && <Alert severity="info">Transfer awaiting acknowledgment by membership #{task.pending_assignee_membership_id}.</Alert>}
                  {task.owner_unavailable && <Alert severity="warning">The recorded owner is unavailable. An authorized staff member may claim this work.</Alert>}
                  {task.waiting_reason && <Alert severity="info">{task.waiting_reason}</Alert>}
                  {task.assignment_exception && <Alert severity="warning">{task.assignment_exception}</Alert>}
                  {task.resolution_code && <Typography variant="body2">Resolution: {label(task.resolution_code)}</Typography>}
                  {writable && manual && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {active && <><Button disabled={locked || !canClaim} onClick={() => transition(task, "claim")}>Claim</Button><Button disabled={locked || !assignee || assignee.membership_id === task.assigned_to_membership_id || assignee.membership_id === task.pending_assignee_membership_id} onClick={() => transition(task, "assign")}>Request transfer</Button></>}
                    {active && task.pending_assignee_membership_id && <><Button disabled={locked || !recipient} onClick={() => transition(task, "accept_transfer")}>Acknowledge transfer</Button><Button disabled={locked || !recipient} onClick={() => transition(task, "reject_transfer")}>Decline transfer</Button></>}
                    {task.state === "claimed" && <Button disabled={locked || !owns || blocked} onClick={() => transition(task, "start")}>Start</Button>}
                    {["claimed", "in_progress"].includes(task.state) && <Button disabled={locked || !owns || blocked} onClick={() => transition(task, "complete")}>Complete with selected resolution</Button>}
                    {active && <Button disabled={locked} onClick={() => transition(task, "cancel")}>Cancel task</Button>}
                    {task.state === "cancelled" && <Button disabled={locked} onClick={() => transition(task, "reopen")}>Reopen to unassigned pool</Button>}
                  </Stack>}
                  <Typography variant="caption">Server authority checks apply to each action. A reopened task returns to its pool and must be claimed again.</Typography>
                  <Typography variant="subtitle2">Recorded task history</Typography>
                  {(task.history ?? []).map((event) => <Typography key={event.id} variant="body2">{label(event.action)} · membership #{event.actor_membership_id} · task version {event.task_version} · {event.recorded_at}</Typography>)}
                  {!task.history?.length && <Typography variant="body2">No task events are available in this projection.</Typography>}
                </> : <Alert severity="warning">This linked task is unavailable in the authorized encounter projection. The immutable source link remains recorded.</Alert>}
              </Stack></AccordionDetails>
            </Accordion>;
          })}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
