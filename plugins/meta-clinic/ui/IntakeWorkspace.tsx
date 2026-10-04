import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, LinearProgress, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';

type Data = Record<string, unknown>;
type Props = {
  call: (name: string, args: Data) => Promise<Data>;
  onPrepare: (operation: string, args: Data) => Promise<void> | void;
  refreshKey: number;
  context: Data;
  onDirtyChange?: (dirty: boolean) => void;
};
type IntakeDraft = {
  status: string;
  identity_state: string;
  visit_reason_state: string;
  history_state: string;
  vitals_state: string;
};
type IntakeField = keyof IntakeDraft;
const EMPTY_DRAFT: IntakeDraft = {
  status: '', identity_state: '', visit_reason_state: '', history_state: '', vitals_state: '',
};
const STATUS_OPTIONS: Record<IntakeField, string[]> = {
  status: ['incomplete', 'ready_for_handoff', 'unable_to_complete'],
  identity_state: ['confirmed', 'not_confirmed', 'unable_to_confirm'],
  visit_reason_state: ['confirmed', 'needs_correction', 'not_recorded', 'unable_to_obtain'],
  history_state: ['reviewed', 'incomplete', 'not_recorded', 'unable_to_obtain'],
  vitals_state: ['recorded', 'incomplete', 'not_recorded', 'declined', 'unable_to_obtain', 'not_applicable'],
};
const FIELD_LABELS: Record<IntakeField, string> = {
  status: 'Intake status',
  identity_state: 'Identity',
  visit_reason_state: 'Visit reason',
  history_state: 'History review',
  vitals_state: 'Vital signs',
};
const object = (value: unknown): value is Data => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const record = (value: unknown): Data => object(value) ? value : {};
const rows = (value: unknown): Data[] => Array.isArray(value) ? value.filter(object) : [];
const text = (value: unknown): string => value == null ? '' : String(value);
const humanize = (value: unknown): string => text(value).replaceAll('_', ' ');
const backendIdStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const normalized = value.map(item => {
    if (typeof item === 'string' && /^[1-9][0-9]*$/.test(item)) return item;
    if (typeof item === 'number' && Number.isSafeInteger(item) && item > 0) return String(item);
    return null;
  });
  if (normalized.some(item => item === null)) throw new Error('An existing evidence reference is not a valid backend ID. Reload before preparing this revision.');
  return normalized as string[];
};
const patientName = (patient: Data): string => text(patient.display_name || patient.name || patient.reference || patient.id);
const when = (value: unknown): string => {
  if (!value) return 'Not recorded';
  const date = new Date(text(value));
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
};
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'The request could not be completed.';
const scopeKeyFor = (context: Data): string => [
  context.user_id, record(context.practice).id, record(context.current_site).id,
  context.authorization_generation,
].map(text).join(':');
const requestKey = (): string => globalThis.crypto.randomUUID();

function responseData(value: Data): Data {
  return object(value.data) ? value.data : value;
}

function draftFrom(workspace: Data): IntakeDraft {
  const intake = record(workspace.intake);
  return {
    status: text(intake.status),
    identity_state: text(intake.identity_state),
    visit_reason_state: text(intake.visit_reason_state),
    history_state: text(intake.history_state),
    vitals_state: text(intake.vitals_state),
  };
}

function StateField({
  field, value, disabled, onChange,
}: {
  field: IntakeField; value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  return <TextField
    select fullWidth label={FIELD_LABELS[field]} value={value} disabled={disabled}
    onChange={event => onChange(event.target.value)}
    helperText={value ? 'Use the status established by the staff review.' : 'Choose a status after reviewing this item.'}
  >
    <MenuItem value="">Not selected</MenuItem>
    {STATUS_OPTIONS[field].map(option => <MenuItem key={option} value={option}>{humanize(option)}</MenuItem>)}
  </TextField>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
    <Typography component="h3" variant="h6" sx={{ mb: 2 }}>{title}</Typography>
    {children}
  </Paper>;
}

export function IntakeWorkspace({ call, onPrepare, refreshKey, context, onDirtyChange }: Props) {
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Data[]>([]);
  const [patient, setPatient] = useState<Data | null>(null);
  const [encounters, setEncounters] = useState<Data[]>([]);
  const [encounter, setEncounter] = useState<Data | null>(null);
  const [workspace, setWorkspace] = useState<Data | null>(null);
  const [draft, setDraft] = useState<IntakeDraft>(EMPTY_DRAFT);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searched, setSearched] = useState(false);
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const sequence = useRef(0);
  const activeScope = useRef(scopeKeyFor(context));
  activeScope.current = scopeKeyFor(context);
  const dirtyRef = useRef(false);
  const preparedIntakeRef = useRef<{ expectedVersion: number; draft: IntakeDraft } | null>(null);
  const callbacks = useRef({ call, onPrepare, onDirtyChange });
  callbacks.current = { call, onPrepare, onDirtyChange };
  const scopeKey = scopeKeyFor(context);
  const patientId = text(patient?.id);
  const encounterId = text(encounter?.id);
  const locked = Boolean(busy);

  function markDirty(value: boolean) {
    dirtyRef.current = value;
    setDirty(value);
  }

  async function read(operation: string, args: Data, expected = activeScope.current): Promise<Data> {
    const result = responseData(await callbacks.current.call('meta_clinic_read', { operation, arguments: args }));
    if (expected !== activeScope.current) throw new Error('The clinic account, site, or permissions changed. Choose the patient again.');
    return result;
  }

  useEffect(() => {
    callbacks.current.onDirtyChange?.(dirty);
    if (!dirty) return;
    const preventReload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventReload);
    return () => window.removeEventListener('beforeunload', preventReload);
  }, [dirty]);
  useEffect(() => () => callbacks.current.onDirtyChange?.(false), []);

  async function searchPatients() {
    const current = ++sequence.current;
    const expected = activeScope.current;
    setBusy('Searching authorized patient records'); setError(''); setNotice(''); setSearched(false); setPatients([]);
    try {
      const result = await read('lookup_patient', { q: query.trim(), page: 1, per_page: 20 }, expected);
      if (sequence.current === current) { setPatients(rows(result.patients)); setSearched(true); }
    } catch (reason) { if (sequence.current === current) setError(errorMessage(reason)); }
    finally { if (sequence.current === current) setBusy(''); }
  }

  async function loadPatient(selected: Data) {
    const current = ++sequence.current;
    const expected = activeScope.current;
    setBusy('Loading patient encounters'); setError(''); setNotice(''); setWorkspace(null); setEncounter(null); setEncounters([]);
    setPatient(selected); setDraft(EMPTY_DRAFT); setDraftVersion(null); markDirty(false);
    preparedIntakeRef.current = null;
    try {
      const result = await read('list_encounters', { patient_id: text(selected.id), page: 1, per_page: 50 }, expected);
      if (sequence.current === current) setEncounters(rows(result.encounters));
    } catch (reason) { if (sequence.current === current) setError(errorMessage(reason)); }
    finally { if (sequence.current === current) setBusy(''); }
  }

  async function loadWorkspace(selectedEncounter: Data, resetDraft: boolean, adoptMatchingPreparedDraft = false) {
    if (!patientId) return;
    const current = ++sequence.current;
    const expected = activeScope.current;
    const selectedId = text(selectedEncounter.id);
    setBusy('Loading intake and handoff'); setError(''); setNotice('');
    try {
      const [detailResult, workspaceResult] = await Promise.all([
        read('get_encounter', { id: selectedId, patient_id: patientId }, expected),
        read('nurse_workspace', { patient_id: patientId, encounter_id: selectedId }, expected),
      ]);
      const detail = record(detailResult.encounter);
      if (text(detail.id) !== selectedId || text(detail.patient_id) !== patientId) throw new Error('The encounter response did not match the selected patient. Refresh the encounter list.');
      if (text(workspaceResult.encounter_id) !== selectedId || text(workspaceResult.patient_id) !== patientId) throw new Error('The intake workspace did not match the selected patient and encounter. Refresh and select the encounter again.');
      if (sequence.current !== current) return;
      setEncounter(detail);
      setWorkspace(workspaceResult);
      const savedIntake = record(workspaceResult.intake);
      const prepared = preparedIntakeRef.current;
      const matchesPreparedDraft = Boolean(prepared)
        && Number.isInteger(savedIntake.version)
        && Number(savedIntake.version) > prepared!.expectedVersion
        && (Object.keys(prepared!.draft) as IntakeField[]).every(field => text(savedIntake[field]) === prepared!.draft[field]);
      if (resetDraft || (adoptMatchingPreparedDraft && matchesPreparedDraft)) {
        setDraft(draftFrom(workspaceResult));
        setDraftVersion(Number.isInteger(savedIntake.version) ? Number(savedIntake.version) : 0);
        markDirty(false);
        preparedIntakeRef.current = null;
      }
    } catch (reason) { if (sequence.current === current) setError(errorMessage(reason)); }
    finally { if (sequence.current === current) setBusy(''); }
  }

  function chooseEncounter(value: string) {
    const selected = encounters.find(row => text(row.id) === value);
    if (!selected) return;
    setEncounter(selected);
    setWorkspace(null);
    setDraft(EMPTY_DRAFT);
    setDraftVersion(null);
    preparedIntakeRef.current = null;
    markDirty(false);
    void loadWorkspace(selected, true);
  }

  function navigate(action: () => void) {
    if (dirtyRef.current) setDiscardAction(() => action);
    else action();
  }

  function updateField(field: IntakeField, value: string) {
    setDraft(previous => ({ ...previous, [field]: value }));
    markDirty(true);
  }

  async function prepare(operation: string, args: Data, submittedIntakeDraft?: IntakeDraft) {
    const expected = activeScope.current;
    setBusy('Preparing a change for review'); setError(''); setNotice('');
    try {
      if (expected !== activeScope.current) throw new Error('The clinic changed. Review this action again.');
      await callbacks.current.onPrepare(operation, args);
      if (expected === activeScope.current) {
        if (submittedIntakeDraft) preparedIntakeRef.current = {
          expectedVersion: Number(args.expected_version), draft: { ...submittedIntakeDraft },
        };
        setNotice('Prepared for review. Confirm the exact values in the review dialog before the clinic record changes.');
      }
    } catch (reason) { if (expected === activeScope.current) setError(errorMessage(reason)); }
    finally { if (expected === activeScope.current) setBusy(''); }
  }

  async function prepareIntake() {
    if (!workspace || !patientId || !encounterId || draftVersion == null) return;
    if (Object.values(draft).some(value => !value)) {
      setError('Choose a status for each intake item before preparing this revision.');
      return;
    }
    const currentIntake = record(workspace.intake);
    const expectedVersion = draftVersion;
    const latestVersion = Number.isInteger(currentIntake.version) ? Number(currentIntake.version) : 0;
    if (expectedVersion !== latestVersion) {
      setError('The saved intake changed after this draft began. Reload it and review the current values before preparing another revision.');
      return;
    }
    let observationIds: string[];
    let historyReviewIds: string[];
    try {
      observationIds = backendIdStrings(currentIntake.observation_ids);
      historyReviewIds = backendIdStrings(currentIntake.history_review_ids);
    } catch (reason) {
      setError(errorMessage(reason));
      return;
    }
    await prepare('revise_nurse_intake', {
      patient_id: patientId,
      encounter_id: encounterId,
      request_key: requestKey(),
      expected_version: expectedVersion,
      ...draft,
      // Preserve only the references already attached by the backend. This view
      // does not invent or silently add clinical evidence links.
      observation_ids: observationIds,
      history_review_ids: historyReviewIds,
    }, draft);
  }

  async function prepareHandoffRequest() {
    const intake = record(workspace?.intake);
    if (!workspace || !intake.id || text(intake.status) !== 'ready_for_handoff') return;
    const visitModality = text(record(encounter?.appointment).visit_modality || encounter?.visit_modality);
    if (visitModality && visitModality !== 'video' && !encounter?.room_id) {
      setError('The backend requires a room assignment before an in-person handoff. Assign the room in the encounter workflow, then refresh here.');
      return;
    }
    await prepare('request_intake_handoff', {
      patient_id: patientId,
      encounter_id: encounterId,
      intake_revision_id: text(intake.id),
      request_key: requestKey(),
    });
  }

  async function prepareHandoffTransition(action: string) {
    const handoff = record(workspace?.handoff);
    if (!handoff.id || !Number.isInteger(handoff.version)) return;
    await prepare('transition_intake_handoff', {
      id: text(handoff.id), action, expected_version: Number(handoff.version), request_key: requestKey(),
    });
  }

  useEffect(() => {
    sequence.current++;
    setPatient(null); setPatients([]); setEncounters([]); setEncounter(null); setWorkspace(null);
    setQuery(''); setSearched(false); setDraft(EMPTY_DRAFT); setDraftVersion(null); setDiscardAction(null);
    setError(''); setNotice(''); setBusy(''); markDirty(false); preparedIntakeRef.current = null;
    return () => { sequence.current++; };
  }, [scopeKey]);

  useEffect(() => {
    if (encounter && patient) {
      void loadWorkspace(encounter, !dirtyRef.current, true);
    } else if (patient) {
      void loadPatient(patient);
    }
    // A parent refresh follows an applied review or a user-requested reload.
    // Unprepared local work stays visible; its saved version remains pinned so
    // the backend can reject it if another member changed the revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const capabilities = record(workspace?.capabilities);
  const intake = record(workspace?.intake);
  const handoff = record(workspace?.handoff);
  const savedHandoffState = text(handoff.state);
  const currentVersion = Number.isInteger(intake.version) ? Number(intake.version) : 0;
  const staleDraft = dirty && draftVersion != null && draftVersion !== currentVersion;
  const activeHandoff = ['pending', 'accepted', 'correction_requested'].includes(savedHandoffState);
  const terminalHandoff = ['rejected', 'completed', 'cancelled'].includes(savedHandoffState);
  const questionnaire = record(workspace?.questionnaire_form);
  const reviewItems = rows(workspace?.review_items);
  const evidenceOptions = rows(workspace?.evidence_options);

  return <Stack spacing={2.5}>
    <Box>
      <Typography component="h2" variant="h5">Intake and clinician handoff</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.75 }}>
        Review the encounter’s saved intake state, prepare a versioned update for approval, and follow the backend handoff state.
      </Typography>
    </Box>
    {busy && <Box aria-live="polite"><Typography variant="body2" sx={{ mb: 1 }}>{busy}…</Typography><LinearProgress /></Box>}
    {error && <Alert severity="error">{error}</Alert>}
    {notice && <Alert severity="info">{notice}</Alert>}

    <Section title="1 · Find the patient">
      <Stack component="form" direction={{ xs: 'column', sm: 'row' }} spacing={1} onSubmit={event => { event.preventDefault(); void searchPatients(); }}>
        <TextField label="Name or clinic reference" value={query} disabled={locked} fullWidth onChange={event => setQuery(event.target.value)} />
        <Button type="submit" variant="outlined" disabled={locked || query.trim().length < 2}>Find patient</Button>
      </Stack>
      {!!patients.length && <TextField select fullWidth label="Matching patients" value={patients.some(row => text(row.id) === patientId) ? patientId : ''} disabled={locked} sx={{ mt: 2 }} onChange={event => {
        const selected = patients.find(row => text(row.id) === event.target.value);
        if (selected) navigate(() => void loadPatient(selected));
      }}>
        <MenuItem value="">Select a patient</MenuItem>
        {patients.map(row => <MenuItem key={text(row.id)} value={text(row.id)}>{patientName(row)}{row.reference ? ` · ${text(row.reference)}` : ''}</MenuItem>)}
      </TextField>}
      {patient && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2, alignItems: { sm: 'center' }, flexWrap: 'wrap' }}>
        <Chip label={patientName(patient)} />
        {Boolean(patient.reference) && <Typography variant="body2" color="text.secondary">{text(patient.reference)}</Typography>}
        <Button disabled={locked} onClick={() => navigate(() => void loadPatient(patient))}>Refresh encounters</Button>
      </Stack>}
      {searched && !patients.length && <Typography role="status" color="text.secondary" sx={{ mt: 1 }}>No matching patients are available to this account. Try another name or clinic reference.</Typography>}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Search is limited to records this account can access.</Typography>
    </Section>

    {patient && <Section title="2 · Select the encounter">
      {encounters.length ? <TextField select fullWidth label="Patient encounters" value={encounterId} disabled={locked} onChange={event => navigate(() => chooseEncounter(event.target.value))}>
        <MenuItem value="">Choose an encounter</MenuItem>
        {encounters.map(row => <MenuItem key={text(row.id)} value={text(row.id)}>{when(row.started_at)} · {humanize(row.status)} · #{text(row.id)}</MenuItem>)}
      </TextField> : <Typography color="text.secondary">No encounters were returned for this patient.</Typography>}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>The list is bounded to the 50 encounters returned by the backend.</Typography>
    </Section>}

    {encounter && <>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip label={`Encounter ${encounterId}`} />
        <Chip label={humanize(encounter.status)} variant="outlined" />
        <Typography variant="body2" color="text.secondary">Started {when(encounter.started_at)}</Typography>
        <Button disabled={locked} onClick={() => navigate(() => { preparedIntakeRef.current = null; void loadWorkspace(encounter, true); })}>Reload and discard edits</Button>
      </Stack>
      {workspace && <>
        <Section title="3 · Intake review">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Each selection is a staff-entered status. Blank fields stay unselected until reviewed. The backend decides whether the saved revision meets handoff requirements.
          </Typography>
          <Stack spacing={1.5}>
            {(Object.keys(FIELD_LABELS) as IntakeField[]).map(field => <StateField
              key={field} field={field} value={draft[field]} disabled={locked || capabilities.intake_write !== true}
              onChange={value => updateField(field, value)}
            />)}
          </Stack>
          {capabilities.intake_write !== true && <Alert severity="info" sx={{ mt: 2 }}>This account can read the workspace but cannot revise intake.</Alert>}
          {staleDraft && <Alert severity="warning" sx={{ mt: 2 }}>The saved intake is now version {currentVersion}, while these edits began from version {draftVersion}. Reload and review before preparing a change.</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2, alignItems: { sm: 'center' } }}>
            <Button variant="contained" disabled={locked || !dirty || capabilities.intake_write !== true || staleDraft || Object.values(draft).some(value => !value)} onClick={() => void prepareIntake()}>
              Prepare intake revision for review
            </Button>
            {Boolean(intake.id) && <Typography variant="body2" color="text.secondary">Saved revision {text(intake.version)} · {when(intake.recorded_at)}</Typography>}
            {!intake.id && <Typography variant="body2" color="text.secondary">No intake revision is saved for this encounter yet.</Typography>}
          </Stack>
        </Section>

        <Section title="4 · Existing review and evidence">
          {questionnaire.id || questionnaire.form_id ? <Typography variant="body2" sx={{ mb: 1.5 }}>
            Backend questionnaire: {text(questionnaire.title || questionnaire.name || questionnaire.form_id)}{questionnaire.version ? ` · version ${text(questionnaire.version)}` : ''}. Detailed answers remain in the clinic’s existing questionnaire workflow.
          </Typography> : <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>No questionnaire definition was returned for this encounter.</Typography>}
          {reviewItems.length ? <Stack spacing={1}>
            {reviewItems.map((item, index) => <Stack key={text(item.id || item.key || index)} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
              <Typography sx={{ flex: 1 }}>{text(item.label || item.title || item.question_label || `Review item ${index + 1}`)}</Typography>
              {item.state != null && <Chip size="small" variant="outlined" label={humanize(item.state)} />}
              {item.status != null && <Chip size="small" label={humanize(item.status)} />}
            </Stack>)}
          </Stack> : <Typography color="text.secondary">No review items were returned.</Typography>}
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="body2">Evidence options returned: {evidenceOptions.length}. Existing linked observation references: {Array.isArray(intake.observation_ids) ? intake.observation_ids.length : 0}; history-review references: {Array.isArray(intake.history_review_ids) ? intake.history_review_ids.length : 0}.</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            This panel preserves existing evidence links but does not create, infer, or attach evidence.
          </Typography>
        </Section>

        <Section title="5 · Clinician handoff">
          <Stack spacing={1.5}>
            {Boolean(handoff.id) && <>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap' }}>
                <Chip label={humanize(handoff.state)} color={savedHandoffState === 'accepted' ? 'success' : 'default'} />
                <Typography variant="body2">Requested {when(handoff.requested_at)}</Typography>
                {Boolean(handoff.responded_at) && <Typography variant="body2">Responded {when(handoff.responded_at)}</Typography>}
                <Typography variant="body2" color="text.secondary">Handoff version {text(handoff.version)}</Typography>
              </Stack>
            </>}
            {activeHandoff ? <>
              {transitionActions(savedHandoffState, capabilities).map(action => <Button key={action} variant={action === 'accept' ? 'contained' : 'outlined'} color={action === 'reject' || action === 'cancel' ? 'warning' : 'primary'} disabled={locked} onClick={() => void prepareHandoffTransition(action)}>
                Prepare {humanize(action)} for review
              </Button>)}
              {!transitionActions(savedHandoffState, capabilities).length && <Typography color="text.secondary">No handoff transition is available to this account in the current state.</Typography>}
            </> : <>
              {!handoff.id && <Typography color="text.secondary">No handoff has been recorded for this encounter.</Typography>}
              {handoff.id && terminalHandoff && <Typography color="text.secondary">The previous handoff is {humanize(savedHandoffState)}.</Typography>}
              {handoff.id && !terminalHandoff && <Typography color="text.secondary">The backend returned an unrecognized handoff state. Refresh before taking another action.</Typography>}
              {text(intake.status) !== 'ready_for_handoff' && <Typography variant="body2">Save a backend-accepted ready intake revision before requesting handoff.</Typography>}
              {(!handoff.id || terminalHandoff) && <Button variant="contained" disabled={locked || capabilities.handoff_request !== true || !intake.id || text(intake.status) !== 'ready_for_handoff'} onClick={() => void prepareHandoffRequest()}>
                Prepare clinician handoff for review
              </Button>}
              {capabilities.handoff_request !== true && <Typography variant="caption" color="text.secondary">This account cannot request handoff.</Typography>}
            </>}
          </Stack>
        </Section>
      </>}
      {!workspace && !busy && <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => void loadWorkspace(encounter, true)}>Retry</Button>}>
        The intake and handoff workspace is not loaded. Retry to read the authorized backend state.
      </Alert>}
    </>}

    <Dialog open={Boolean(discardAction)} onClose={() => setDiscardAction(null)} aria-labelledby="intake-discard-title">
      <DialogTitle id="intake-discard-title">Discard unsubmitted intake edits?</DialogTitle>
      <DialogContent>Your selections have not been saved. Continue to another patient or encounter and discard them?</DialogContent>
      <DialogActions>
        <Button onClick={() => setDiscardAction(null)}>Keep editing</Button>
        <Button color="warning" onClick={() => {
          const action = discardAction;
          setDiscardAction(null); setDraft(EMPTY_DRAFT); setDraftVersion(null); markDirty(false); action?.();
        }}>Discard and continue</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}

function transitionActions(state: string, capabilities: Data): string[] {
  const actions: Record<string, string[]> = {
    pending: ['accept', 'reject', 'request_correction', 'cancel'],
    accepted: ['complete', 'cancel'],
    correction_requested: ['cancel'],
  };
  return (actions[state] || []).filter(action => action === 'cancel'
    ? capabilities.intake_write === true
    : capabilities.handoff_respond === true);
}
