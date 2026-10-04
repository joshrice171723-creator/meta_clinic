import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, LinearProgress, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import './care-journey.css';

type Data = Record<string, unknown>;
type Props = { call: (name: string, args: Data) => Promise<Data>; onPrepare: (operation: string, args: Data) => Promise<void> | void; onDirtyChange?: (dirty: boolean) => void; refreshKey: number; context: Data };
type Read = (operation: string, args: Data) => Promise<Data>;
type Review = (operation: string, args: Data, guard?: () => Promise<void>) => Promise<void>;
const object = (value: unknown): value is Data => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const data = (value: unknown): Data => object(value) ? value : {};
const rows = (value: unknown): Data[] => Array.isArray(value) ? value.filter(object) : [];
const text = (value: unknown) => value == null ? '' : String(value);
const label = (value: unknown) => text(value).replaceAll('_', ' ');
const id = (value: unknown) => text(value);
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';
const patientLabel = (patient: Data) => text(patient.display_name || patient.name || patient.reference || patient.id);
const when = (value: unknown) => { const date = new Date(text(value)); return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString(); };
const sections = ['subjective', 'objective', 'assessment', 'plan'] as const;
const scope = (context: Data) => [context.user_id, data(context.practice).id, data(context.current_site).id, context.authorization_generation].map(text).join(':');

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Paper variant="outlined" className="care-journey__section"><Typography component="h3" variant="h6" sx={{ mb: 2 }}>{title}</Typography>{children}</Paper>;
}

export function CareJourney({ call, onPrepare, onDirtyChange, refreshKey, context }: Props) {
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Data[]>([]);
  const [searched, setSearched] = useState(false);
  const [patient, setPatient] = useState<Data | null>(null);
  const [appointments, setAppointments] = useState<Data[]>([]);
  const [encounters, setEncounters] = useState<Data[]>([]);
  const [encounter, setEncounter] = useState<Data | null>(null);
  const [resources, setResources] = useState<Data>({});
  const [resourceErrors, setResourceErrors] = useState<Data>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtySections = useRef(new Set<string>());
  const sequence = useRef(0);
  const activeScope = useRef(scope(context));
  activeScope.current = scope(context);
  const callbacks = useRef({ call, onPrepare, onDirtyChange }); callbacks.current = { call, onPrepare, onDirtyChange };
  const capabilities = data(context.capabilities);
  const scopeKey = scope(context);
  const patientId = id(patient?.id);
  const encounterId = id(encounter?.id);
  function clearDirty() { dirtySections.current.clear(); setDirty(false); }
  function sectionDirty(section: string, changed: boolean) {
    if (changed) dirtySections.current.add(section); else dirtySections.current.delete(section);
    setDirty(dirtySections.current.size > 0);
  }
  useEffect(() => {
    callbacks.current.onDirtyChange?.(dirty);
    if (!dirty) return;
    const preventReload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventReload);
    return () => window.removeEventListener('beforeunload', preventReload);
  }, [dirty]);
  useEffect(() => () => callbacks.current.onDirtyChange?.(false), []);

  const read: Read = async (operation, args) => {
    const expected = activeScope.current;
    const result = await callbacks.current.call('meta_clinic_read', { operation, arguments: args });
    if (expected !== activeScope.current) throw new Error('The clinic account or location changed. Select the patient again.');
    return object(result.data) ? result.data : result;
  };

  const review: Review = async (operation, args, guard) => {
    const expected = activeScope.current;
    setBusy('Preparing review'); setError(''); setNotice('');
    try {
      if (guard) await guard();
      if (expected !== activeScope.current) throw new Error('The clinic changed. Review this action again.');
      await callbacks.current.onPrepare(operation, args);
      if (expected === activeScope.current) setNotice('Prepared for review. Apply the exact values in the review dialog to save.');
    } catch (reason) { if (expected === activeScope.current) setError(errorText(reason)); }
    finally { if (expected === activeScope.current) setBusy(''); }
  };

  async function search() {
    const current = ++sequence.current;
    setBusy('Finding patients'); setError(''); setPatients([]); setSearched(false);
    try {
      const result = await read('lookup_patient', { q: query.trim(), page: 1, per_page: 20 });
      if (sequence.current === current) { setPatients(rows(result.patients)); setSearched(true); }
    } catch (reason) { if (sequence.current === current) setError(errorText(reason)); }
    finally { if (sequence.current === current) setBusy(''); }
  }

  async function loadPatient(selected: Data, preserveEncounter = false) {
    const current = ++sequence.current;
    setBusy('Loading patient visits'); setError(''); setNotice('');
    if (!preserveEncounter) { setEncounter(null); setResources({}); setResourceErrors({}); clearDirty(); }
    setPatient(selected); setAppointments([]); setEncounters([]);
    const results = await Promise.allSettled([
      read('list_appointments', { patient_id: id(selected.id), page: 1, per_page: 50 }),
      read('list_encounters', { patient_id: id(selected.id), page: 1, per_page: 50 }),
    ]);
    if (current !== sequence.current) return;
    const messages: string[] = [];
    if (results[0].status === 'fulfilled') setAppointments(rows(results[0].value.appointments)); else messages.push(`Appointments: ${errorText(results[0].reason)}`);
    if (results[1].status === 'fulfilled') setEncounters(rows(results[1].value.encounters)); else messages.push(`Encounters: ${errorText(results[1].reason)}`);
    setError(messages.join(' ')); setBusy('');
  }

  async function loadEncounter(selectedId: string, reset = false) {
    if (!patientId) return;
    const current = ++sequence.current;
    setBusy('Loading encounter'); setError(''); setNotice('');
    if (reset) { setResources({}); setResourceErrors({}); clearDirty(); }
    try {
      const detail = await read('get_encounter', { id: selectedId, patient_id: patientId });
      const selected = data(detail.encounter);
      if (id(selected.patient_id) !== patientId || id(selected.id) !== selectedId) throw new Error('The returned encounter does not match the selected patient.');
      if (sequence.current !== current) return;
      setEncounter(selected);
      const requests: [string, string, Data][] = [
        ['vitals', 'vital_sign_dictionary', { patient_id: patientId, encounter_id: selectedId }],
        ['observations', 'patient_observations', { patient_id: patientId, encounter_id: selectedId, page: 1, per_page: 50 }],
        ['follow_up', 'encounter_follow_up', { encounter_id: selectedId }],
        ['completion', 'encounter_completion', { id: selectedId, patient_id: patientId }],
      ];
      if (capabilities.notes_read === true) {
        requests.push(['templates', 'note_templates', { encounter_id: selectedId }]);
        const soap = rows(selected.notes).find(note => note.note_kind === 'soap');
        if (soap) requests.push(['note', 'get_encounter_note', { id: id(soap.id) }]);
        else requests.push(['notes', 'encounter_notes', { encounter_id: selectedId }]);
      }
      if (capabilities.billing_read === true || capabilities.billing === true) {
        requests.push(['invoices', 'patient_invoices', { patient_id: patientId, encounter_id: selectedId, page: 1, per_page: 20 }]);
        requests.push(['services', 'billing_services', { active: 'true', page: 1, per_page: 50 }]);
      }
      const results = await Promise.allSettled(requests.map(([, operation, args]) => read(operation, args)));
      if (sequence.current !== current) return;
      const next: Data = {}; const failures: Data = {};
      results.forEach((result, index) => { if (result.status === 'fulfilled') next[requests[index][0]] = result.value; else failures[requests[index][0]] = errorText(result.reason); });
      setResources(previous => reset ? next : { ...previous, ...next }); setResourceErrors(failures);
    } catch (reason) { if (current === sequence.current) setError(errorText(reason)); }
    finally { if (current === sequence.current) setBusy(''); }
  }

  useEffect(() => {
    sequence.current++; setPatient(null); setPatients([]); setAppointments([]); setEncounters([]); setEncounter(null); setResources({}); setResourceErrors({}); setQuery(''); clearDirty(); setDiscard(null); setError(''); setBusy('');
    return () => { sequence.current++; };
  }, [scopeKey]);
  useEffect(() => { if (encounterId) void loadEncounter(encounterId); else if (patient) void loadPatient(patient, true); }, [refreshKey]);
  function navigate(action: () => void) { if (dirty) setDiscard(() => action); else action(); }
  const locked = Boolean(busy);
  const note = data(data(resources.note).note);
  const common = { patientId, encounterId, read, review, locked };
  const draft = (section: string) => ({ markDirty: () => sectionDirty(section, true), markClean: () => sectionDirty(section, false) });

  return <Stack className="care-journey" spacing={3}>
    <Box><Typography component="h2" variant="h5">Care through the clinic day</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Find a patient, open the visit, record documentation, and review the handoff to follow-up and checkout.</Typography></Box>
    {busy && <Box aria-live="polite"><Typography variant="body2" sx={{ mb: 1 }}>{busy}…</Typography><LinearProgress /></Box>}
    {error && <Alert severity="error">{error}</Alert>}{notice && <Alert severity="info">{notice}</Alert>}
    <Section title="1 · Choose the patient">
      <Stack component="form" direction={{ xs: 'column', sm: 'row' }} spacing={1} onSubmit={event => { event.preventDefault(); void search(); }}><TextField label="Find by name or clinic reference" value={query} disabled={locked} fullWidth onChange={event => setQuery(event.target.value)} /><Button type="submit" variant="outlined" disabled={locked || query.trim().length < 2}>Find patient</Button></Stack>
      {!!patients.length && <TextField select fullWidth label="Matching patients" value={patients.some(row => id(row.id) === patientId) ? patientId : ''} disabled={locked} sx={{ mt: 2 }} onChange={event => { const selected = patients.find(row => id(row.id) === event.target.value); if (selected) navigate(() => void loadPatient(selected)); }}><MenuItem value="">Select a patient</MenuItem>{patients.map(row => <MenuItem key={id(row.id)} value={id(row.id)}>{patientLabel(row)}{row.reference ? ` · ${row.reference}` : ''}</MenuItem>)}</TextField>}
      {patient && <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: 'center', flexWrap: 'wrap' }}><Chip label={patientLabel(patient)} /><Typography variant="body2" color="text.secondary">{text(patient.reference)}</Typography><Button disabled={locked} onClick={() => void loadPatient(patient, true)}>Refresh visits</Button></Stack>}
      <Typography variant="caption" color="text.secondary">Search returns up to 20 matches. Refine the term to find the correct record.</Typography>
      {searched && !patients.length && <Typography role="status" color="text.secondary">No matching patients are available to this account. Try another name or clinic reference.</Typography>}
    </Section>
    {patient && <Section title="2 · Open the visit">
      {!appointments.length && <Typography color="text.secondary">No appointments returned for this patient.</Typography>}
      {appointments.map(appointment => <div className="care-journey__visit" key={id(appointment.id)}><Box><Typography variant="subtitle2">{when(appointment.starts_at)}</Typography><Typography variant="body2" color="text.secondary">{label(appointment.status)}{appointment.room_code ? ` · ${appointment.room_code}` : ''}{appointment.reason ? ` · ${appointment.reason}` : ''}</Typography>{appointment.needs_setup === true && <Typography color="warning.main" variant="body2">Setup needed: {Array.isArray(appointment.setup_missing) ? appointment.setup_missing.map(text).join(', ') : 'Review appointment setup'}</Typography>}</Box>{appointment.encounter_id ? <Button disabled={locked} onClick={() => navigate(() => void loadEncounter(id(appointment.encounter_id), true))}>Open encounter</Button> : ['scheduled', 'confirmed'].includes(text(appointment.status)) && <Button disabled={locked || capabilities.encounters !== true || appointment.needs_setup === true} onClick={() => void review('start_encounter', { patient_id: patientId, appointment_id: id(appointment.id) }, async () => { const current = data((await read('get_appointment', { id: id(appointment.id) })).appointment); if (id(current.patient_id) !== patientId || current.encounter_id || current.status !== appointment.status || current.updated_at !== appointment.updated_at) throw new Error('The appointment changed. Refresh visits before starting it.'); })}>Review visit start</Button>}</div>)}
      <TextField select fullWidth label="Patient encounters" value={encounterId} disabled={locked} sx={{ mt: 2 }} onChange={event => navigate(() => void loadEncounter(event.target.value, true))}><MenuItem value="">Choose an encounter</MenuItem>{[...encounters, ...(encounter && !encounters.some(row => id(row.id) === encounterId) ? [encounter] : [])].map(row => <MenuItem key={id(row.id)} value={id(row.id)}>{when(row.started_at)} · {label(row.status)}</MenuItem>)}</TextField>
      <Typography variant="caption" color="text.secondary">Showing up to 50 appointments and encounters. Starting a scheduled visit creates or opens its backend encounter.</Typography>
    </Section>}
    {encounter && <>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}><Chip label={`Encounter ${encounterId}`} /><Chip label={label(encounter.status)} variant="outlined" /><Typography variant="body2">Started {when(encounter.started_at)}</Typography><Button disabled={locked} onClick={() => void loadEncounter(encounterId)}>Refresh encounter</Button><Button disabled={locked} onClick={() => navigate(() => void loadEncounter(encounterId, true))}>Reload and discard edits</Button></Stack>
      {Object.entries(resourceErrors).map(([key, value]) => <Alert key={key} severity="warning">{label(key)}: {text(value)}. Other available steps remain open.</Alert>)}
      <Section title="3 · Record vital signs">{resources.vitals ? <VitalsForm {...common} {...draft("vitals")} locked={locked || Boolean(resourceErrors.vitals)} dictionary={data(resources.vitals)} observations={rows(data(resources.observations).observations)} patient={patient!} /> : <Typography color="text.secondary">Vital-sign fields are unavailable for this account or encounter.</Typography>}</Section>
      <Section title="4 · Document the visit">{resources.templates && (note.id || (!resourceErrors.note && !resourceErrors.notes)) ? <SoapForm {...common} {...draft("soap")} locked={locked || Boolean(resourceErrors.note || resourceErrors.notes || resourceErrors.templates)} note={note} templates={rows(data(resources.templates).templates)} allowed={capabilities.notes_write === true} /> : <Typography color="text.secondary">Note details are unavailable for this account or encounter. Continue with its permitted workflow steps.</Typography>}</Section>
      <Section title="5 · Follow-up and completion">{Boolean(resources.follow_up) && <FollowUpForm {...common} {...draft("follow_up")} locked={locked || Boolean(resourceErrors.follow_up)} payload={data(resources.follow_up)} allowed={capabilities.encounters === true} />}{Boolean(resources.completion) && <CompletionForm {...common} {...draft("completion")} locked={locked || Boolean(resourceErrors.completion)} payload={data(resources.completion)} />}</Section>
      <Section title="6 · Checkout">{resources.invoices ? <CheckoutForm {...common} {...draft("checkout")} locked={locked || Boolean(resourceErrors.invoices || resourceErrors.services)} encounter={encounter} invoices={rows(data(resources.invoices).invoices)} services={rows(data(resources.services).services)} allowed={capabilities.billing_invoice_draft === true || capabilities.billing_write === true} /> : <Typography color="text.secondary">Billing records are unavailable for this account.</Typography>}</Section>
    </>}
    <Dialog open={Boolean(discard)} onClose={() => setDiscard(null)} aria-labelledby="care-discard-title"><DialogTitle id="care-discard-title">Discard unsubmitted edits?</DialogTitle><DialogContent>Your form edits have not been saved. Continue to reload the backend records and discard these edits.</DialogContent><DialogActions><Button onClick={() => setDiscard(null)}>Keep editing</Button><Button color="warning" onClick={() => { const next = discard; setDiscard(null); clearDirty(); next?.(); }}>Discard and continue</Button></DialogActions></Dialog>
  </Stack>;
}

type FormProps = { patientId: string; encounterId: string; read: Read; review: Review; locked: boolean; markDirty: () => void; markClean: () => void };

function VitalsForm({ patientId, encounterId, read, review, locked, markDirty, dictionary, observations, patient }: FormProps & { dictionary: Data; observations: Data[]; patient: Data }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<Record<string, string>>({});
  const [observedAt, setObservedAt] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const key = useRef({ signature: '', value: '' });
  const fields = rows(dictionary.fields);
  const readings = fields.filter(field => Boolean(values[text(field.code)]?.trim())).map(field => ({ code: text(field.code), value: values[text(field.code)].trim(), unit_code: units[text(field.code)] || (rows(field.units).length === 1 ? text(rows(field.units)[0].code) : '') }));
  const writable = dictionary.can_write === true;
  function vitalRequestKey() {
    const signature = JSON.stringify({ patientId, encounterId, dictionary_version: dictionary.dictionary_version, observedAt, readings });
    if (key.current.signature !== signature) key.current = { signature, value: crypto.randomUUID() };
    return key.current.value;
  }
  return <Stack spacing={2}>
    {!!observations.length && <div className="care-journey__observations">{observations.filter(row => row.value_kind !== 'group').map(row => <Box key={id(row.id)}><Typography variant="subtitle2">{text(row.display_label || row.code)}</Typography><Typography variant="body2">{text(row.numeric_value ?? row.text_value ?? row.coded_value ?? row.missing_reason) || 'Value absent'} {text(row.unit_label || row.unit_code)}</Typography><Typography variant="caption" color="text.secondary">{when(row.observed_at)}</Typography></Box>)}</div>}
    <Typography variant="caption" color="text.secondary">Recorded values shown from one page of up to 50 observations. Units and fields below come from dictionary {text(dictionary.dictionary_version)}.</Typography>
    {!writable && <Alert severity="info">Vital-sign entry requires an open encounter and this account’s observation permission.</Alert>}
    <div className="care-journey__vital-fields">{fields.map(field => { const code = text(field.code); const options = rows(field.units); return <Stack key={code} direction="row" spacing={1}><TextField label={text(field.label)} value={values[code] || ''} disabled={locked || !writable} slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 30 } }} onChange={event => { setValues(current => ({ ...current, [code]: event.target.value })); markDirty(); }} /><TextField select label="Unit" value={units[code] || (options.length === 1 ? text(options[0].code) : '')} disabled={locked || !writable} sx={{ minWidth: 100 }} onChange={event => { setUnits(current => ({ ...current, [code]: event.target.value })); markDirty(); }}><MenuItem value="">Choose unit</MenuItem>{options.map(unit => <MenuItem value={text(unit.code)} key={text(unit.code)}>{text(unit.label)}</MenuItem>)}</TextField></Stack>; })}</div>
    <TextField type="datetime-local" label="Observed at" value={observedAt} disabled={locked || !writable} slotProps={{ inputLabel: { shrink: true } }} onChange={event => { setObservedAt(event.target.value); markDirty(); }} />
    <FormControlLabel control={<Checkbox checked={confirmed} disabled={locked || !writable} onChange={event => { setConfirmed(event.target.checked); markDirty(); }} />} label={`I confirmed these readings belong to ${patientLabel(patient)}.`} />
    <Button variant="outlined" disabled={locked || !writable || !confirmed || !observedAt || !readings.length || readings.some(reading => !reading.unit_code || !/^[+-]?\d+(?:\.\d+)?$/.test(reading.value))} onClick={() => void review('record_vital_signs', { patient_id: patientId, encounter_id: encounterId, request_key: vitalRequestKey(), dictionary_version: text(dictionary.dictionary_version), observed_at: new Date(observedAt).toISOString(), confirmed_patient: true, readings }, async () => { const fresh = await read('vital_sign_dictionary', { patient_id: patientId, encounter_id: encounterId }); if (fresh.can_write !== true || fresh.dictionary_version !== dictionary.dictionary_version) throw new Error('The encounter or vital dictionary changed. Refresh before recording.'); })}>Review vital signs</Button>
  </Stack>;
}

function SoapForm({ encounterId, read, review, locked, markDirty, markClean, note, templates, allowed }: FormProps & { note: Data; templates: Data[]; allowed: boolean }) {
  const body = data(data(note.current_revision).body);
  const [templateId, setTemplateId] = useState(text(note.current_template_id));
  const [content, setContent] = useState<Data>(data(body.sections));
  const [instructions, setInstructions] = useState(text(body.patient_instructions));
  const [edited, setEdited] = useState(false);
  const [baseRevision, setBaseRevision] = useState(note.latest_revision);
  const template = templates.find(row => text(row.id) === templateId);
  useEffect(() => {
    const returnedBody = data(data(note.current_revision).body);
    const returnedSections = data(returnedBody.sections);
    const matchesDraft = Boolean(note.id) && templateId === text(note.current_template_id)
      && template?.version === note.current_template_version
      && sections.every(section => text(content[section]) === text(returnedSections[section]))
      && instructions === text(returnedBody.patient_instructions);
    if (!edited || matchesDraft) {
      setTemplateId(text(note.current_template_id));
      if (sections.some(section => text(content[section]) !== text(returnedSections[section]))) setContent(returnedSections);
      setInstructions(text(returnedBody.patient_instructions)); setBaseRevision(note.latest_revision);
      setEdited(false); markClean();
    }
  }, [note.id, note.latest_revision, note.current_revision, note.current_template_id, note.current_template_version, templateId, template?.version, content, instructions, edited]);
  const signed = note.current_revision_signed === true;
  const stale = edited && note.latest_revision !== baseRevision;
  const edit = () => { setEdited(true); markDirty(); };
  return <Stack spacing={2}>
    {signed && <Alert severity="info">This note revision is signed. Its content is read only; corrections and signing use the full clinical workflow.</Alert>}
    {stale && <Alert severity="warning">A newer revision was returned. Your text is retained; reload and discard edits before preparing another revision.</Alert>}
    <Typography variant="body2" color="text.secondary">{note.id ? `Note ${note.id} · revision ${note.latest_revision}` : 'No SOAP note was returned for this encounter.'}</Typography>
    <TextField select label="Note template" value={templateId} disabled={locked || signed || !allowed} onChange={event => { setTemplateId(event.target.value); edit(); }}><MenuItem value="">Choose a backend template</MenuItem>{templates.map(row => <MenuItem key={text(row.id)} value={text(row.id)}>{text(row.label)} · version {text(row.version)}</MenuItem>)}</TextField>
    {template && <><Alert severity="info">{text(template.caution || template.source_label)}</Alert><Button disabled={locked || signed || !allowed} onClick={() => { setContent(data(template.sections)); edit(); }}>Use template text for review</Button></>}
    <div className="care-journey__soap">{sections.map(section => <TextField key={section} multiline minRows={4} label={label(section)} value={text(content[section])} disabled={locked || signed || !allowed} slotProps={{ htmlInput: { maxLength: 50000 } }} onChange={event => { setContent(current => ({ ...current, [section]: event.target.value })); edit(); }} />)}</div>
    <TextField multiline minRows={2} label="Draft patient instructions" value={instructions} disabled={locked || signed || !allowed} slotProps={{ htmlInput: { maxLength: 5000 } }} onChange={event => { setInstructions(event.target.value); edit(); }} />
    <Typography variant="body2" color="text.secondary">Saving creates an unsigned draft revision. Instructions entered here are not signed or transmitted.</Typography>
    <Button variant="outlined" disabled={locked || signed || stale || !allowed || !template} onClick={() => {
      const args = { ...(note.id ? { id: id(note.id), expected_revision: Number(baseRevision) } : { encounter_id: encounterId, note_kind: 'soap' }), template_id: templateId, template_version: Number(template?.version), ...Object.fromEntries(sections.map(section => [section, text(content[section])])), patient_instructions: instructions, request_key: crypto.randomUUID() };
      void review(note.id ? 'revise_soap_draft' : 'create_soap_draft', args, async () => {
        const current = rows((await read('encounter_notes', { encounter_id: encounterId })).notes).find(row => row.note_kind === 'soap');
        if (note.id ? !current || id(current.id) !== id(note.id) || current.latest_revision !== baseRevision || current.current_revision_signed === true : Boolean(current)) throw new Error('The SOAP note changed. Refresh the encounter before reviewing this draft.');
      });
    }}>{note.id ? 'Review draft revision' : 'Review new SOAP draft'}</Button>
  </Stack>;
}

function FollowUpForm({ encounterId, read, review, locked, markDirty, markClean, payload, allowed }: FormProps & { payload: Data; allowed: boolean }) {
  const recorded = data(payload.follow_up); const options = data(payload.options);
  const [status, setStatus] = useState(text(recorded.recorded_status));
  const [plan, setPlan] = useState(text(recorded.plan));
  const [appointmentId, setAppointmentId] = useState(id(data(recorded.follow_up_appointment).id));
  const [assignee, setAssignee] = useState(id(recorded.assigned_to_membership_id));
  const [dueAt, setDueAt] = useState('');
  const [baseVersion, setBaseVersion] = useState(Number(recorded.version ?? 0));
  const [baseId, setBaseId] = useState(id(recorded.id));
  const baseDueAt = useRef(text(recorded.due_at));
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    const expectedDue = status === 'needed' ? dueAt || baseDueAt.current : '';
    const matchesDue = status === 'arranged' || (expectedDue
      ? new Date(expectedDue).getTime() === new Date(text(recorded.due_at)).getTime()
      : !recorded.due_at);
    const matchesDraft = Boolean(recorded.id) && status === text(recorded.recorded_status)
      && plan === text(recorded.plan) && assignee === id(recorded.assigned_to_membership_id)
      && (status !== 'arranged' || appointmentId === id(data(recorded.follow_up_appointment).id)) && matchesDue;
    if (!edited || matchesDraft) {
      setStatus(text(recorded.recorded_status)); setPlan(text(recorded.plan));
      setAppointmentId(id(data(recorded.follow_up_appointment).id)); setAssignee(id(recorded.assigned_to_membership_id));
      setBaseVersion(Number(recorded.version ?? 0)); setBaseId(id(recorded.id));
      baseDueAt.current = text(recorded.due_at); setDueAt(''); setEdited(false); markClean();
    }
  }, [recorded.id, recorded.version, status, plan, appointmentId, assignee, dueAt, edited]);
  const edit = () => { setEdited(true); markDirty(); };
  const stale = baseVersion !== Number(recorded.version ?? 0) || baseId !== id(recorded.id);
  return <Stack spacing={2} sx={{ mb: 3 }}>
    <Typography component="h4" variant="subtitle1">Follow-up disposition</Typography>
    {Boolean(recorded.id) && <Typography variant="body2" color="text.secondary">Recorded: {label(recorded.status)} · version {text(recorded.version)}{recorded.due_at ? ` · due ${when(recorded.due_at)}` : ''}</Typography>}
    {stale && <Alert severity="warning">The follow-up changed. Your inputs are retained; reload before preparing another disposition.</Alert>}
    <TextField select label="Follow-up decision" value={['not_required', 'needed', 'arranged'].includes(status) ? status : ''} disabled={locked || !allowed} onChange={event => { setStatus(event.target.value); edit(); }}><MenuItem value="">Choose a disposition</MenuItem>{['not_required', 'needed', 'arranged'].map(value => <MenuItem key={value} value={value}>{label(value)}</MenuItem>)}</TextField>
    <TextField label="Follow-up plan" multiline minRows={2} value={plan} disabled={locked || !allowed} slotProps={{ htmlInput: { maxLength: 4000 } }} onChange={event => { setPlan(event.target.value); edit(); }} />
    {status === 'arranged' && <TextField select label="Arranged appointment" value={appointmentId} disabled={locked || !allowed} onChange={event => { setAppointmentId(event.target.value); edit(); }}><MenuItem value="">Choose an eligible appointment</MenuItem>{rows(options.follow_up_appointments).map(row => <MenuItem key={id(row.id)} value={id(row.id)}>{when(row.starts_at)} · {label(row.status)}</MenuItem>)}</TextField>}
    <TextField select label="Follow-up owner" value={assignee} disabled={locked || !allowed} onChange={event => { setAssignee(event.target.value); edit(); }}><MenuItem value="">No individual assignment</MenuItem>{rows(options.eligible_assignees).map(row => <MenuItem key={id(row.membership_id)} value={id(row.membership_id)}>{text(row.label)}</MenuItem>)}</TextField>
    {status === 'needed' && <TextField type="datetime-local" label="Due at (optional)" value={dueAt} disabled={locked || !allowed} slotProps={{ inputLabel: { shrink: true } }} helperText={recorded.due_at ? `Existing due time: ${when(recorded.due_at)}` : 'Choose only when the clinic plan specifies a due time.'} onChange={event => { setDueAt(event.target.value); edit(); }} />}
    <Button variant="outlined" disabled={locked || !allowed || stale || !['not_required', 'needed', 'arranged'].includes(status) || (status !== 'not_required' && !plan.trim()) || (status === 'arranged' && !appointmentId)} onClick={() => void review('record_encounter_follow_up', { encounter_id: encounterId, expected_version: baseVersion, status, plan, ...(status === 'arranged' ? { follow_up_appointment_id: appointmentId } : {}), ...(assignee ? { assigned_to_membership_id: assignee } : {}), ...(status === 'needed' && (dueAt || recorded.due_at) ? { due_at: dueAt ? new Date(dueAt).toISOString() : recorded.due_at } : {}), request_key: crypto.randomUUID() }, async () => { const fresh = data((await read('encounter_follow_up', { encounter_id: encounterId })).follow_up); if (Number(fresh.version ?? 0) !== baseVersion || id(fresh.id) !== baseId) throw new Error('The follow-up changed. Refresh before reviewing it.'); })}>Review follow-up disposition</Button>
  </Stack>;
}

function CompletionForm({ patientId, encounterId, read, review, locked, markDirty, payload }: FormProps & { payload: Data }) {
  const options = data(payload.options); const evidence = data(payload.evidence); const followUp = data(evidence.follow_up);
  const [disposition, setDisposition] = useState(''); const [instructions, setInstructions] = useState(''); const [education, setEducation] = useState(''); const [reviewed, setReviewed] = useState(false); const [exception, setException] = useState('');
  const tasks = rows(evidence.open_tasks); const events = rows(evidence.education_events); const signed = data(evidence.signed_instruction);
  const values = (value: unknown) => Array.isArray(value) ? value.map(text) : [];
  useEffect(() => { setReviewed(false); }, [JSON.stringify(evidence)]);
  const exceptionNeeded = disposition && (disposition !== 'completed_as_planned' || instructions === 'unable_to_complete' || education === 'unable_to_complete');
  if (payload.can_complete !== true) return <Alert severity="info">Encounter completion is unavailable for this account or the encounter is already completed. Checkout status: {label(data(evidence.checkout).status)}.</Alert>;
  return <Stack spacing={2}>
    <Divider /><Typography component="h4" variant="subtitle1">Review encounter completion</Typography>
    {!followUp.id && <Alert severity="info">Record a follow-up disposition before completing the encounter.</Alert>}
    <Typography variant="body2">Follow-up: {followUp.id ? `${label(followUp.status)} · version ${followUp.version}` : 'Not recorded'}. Signed instruction evidence: {signed.revision_id ? `revision ${signed.revision_no}` : 'None returned'}. Education events: {events.length}.</Typography>
    {!!tasks.length && <Box component="ul" sx={{ m: 0, pl: 3 }}>{tasks.map(task => <li key={id(task.id)}><Typography variant="body2">{label(task.task_kind)} · {label(task.state)} · {label(task.pool_code)}{task.assigned_to_membership_id ? ` · membership ${task.assigned_to_membership_id}` : ' · no individual assignment'}{task.due_at ? ` · due ${when(task.due_at)}` : ''}</Typography></li>)}</Box>}
    <div className="care-journey__completion-fields">{[
      ['Disposition', disposition, setDisposition, values(options.disposition_codes)],
      ['Instructions status', instructions, setInstructions, values(options.instructions_statuses)],
      ['Education status', education, setEducation, values(options.education_statuses)],
    ].map(([title, value, setValue, available]) => <TextField key={String(title)} select label={String(title)} value={String(value)} disabled={locked} onChange={event => { (setValue as (next: string) => void)(event.target.value); markDirty(); }}><MenuItem value="">Choose a status</MenuItem>{(available as string[]).map(option => <MenuItem key={option} value={option} disabled={(title === 'Instructions status' && option === 'provided' && !signed.revision_id) || (title === 'Education status' && (option === 'recorded' ? !events.length : Boolean(events.length)))}>{label(option)}</MenuItem>)}</TextField>)}</div>
    <TextField label="Completion exception note" multiline minRows={2} required={Boolean(exceptionNeeded)} value={exception} disabled={locked} slotProps={{ htmlInput: { maxLength: 2000 } }} onChange={event => { setException(event.target.value); markDirty(); }} />
    <FormControlLabel control={<Checkbox checked={reviewed} disabled={locked} onChange={event => { setReviewed(event.target.checked); markDirty(); }} />} label="I reviewed unfinished work, ownership, follow-up and completion evidence." />
    <Typography variant="body2" color="text.secondary">Completion retains open follow-up and tasks. It does not sign notes, send instructions or collect payment.</Typography>
    <Button variant="outlined" disabled={locked || !followUp.id || !disposition || !instructions || !education || !reviewed || (instructions === 'provided' && !signed.revision_id) || (education === 'recorded' ? !events.length : Boolean(events.length)) || (Boolean(exceptionNeeded) && !exception.trim())} onClick={() => void review('complete_encounter', {
      id: encounterId, patient_id: patientId, request_key: crypto.randomUUID(), disposition_code: disposition, instructions_status: instructions, education_status: education,
      follow_up_id: id(followUp.id), follow_up_version: Number(followUp.version), expected_follow_up_state: text(followUp.status), ...(instructions === 'provided' ? { instruction_note_revision_id: id(signed.revision_id) } : {}),
      expected_education_event_ids: events.map(event => id(event.id)), expected_open_task_versions: tasks.map(task => `${task.id}:${task.version}`), open_work_reviewed: true, ...(exception ? { exception_note: exception } : {}),
    }, async () => { const fresh = await read('encounter_completion', { id: encounterId, patient_id: patientId }); if (fresh.can_complete !== true || JSON.stringify(fresh.evidence) !== JSON.stringify(evidence)) throw new Error('Completion evidence changed. Refresh and review the current work before completing.'); })}>Review encounter completion</Button>
  </Stack>;
}

function CheckoutForm({ patientId, encounterId, read, review, locked, markDirty, encounter, invoices, services, allowed }: FormProps & { encounter: Data; invoices: Data[]; services: Data[]; allowed: boolean }) {
  const [serviceId, setServiceId] = useState(''); const [quantity, setQuantity] = useState('');
  const selected = services.find(service => id(service.id) === serviceId);
  const ready = encounter.status === 'completed' && Boolean(encounter.ended_at);
  const existing = invoices.some(invoice => invoice.status !== 'void');
  return <Stack spacing={2}>
    {!ready && <Alert severity="info">Complete the encounter before starting checkout.</Alert>}
    {invoices.map(invoice => <Box key={id(invoice.id)}><Typography variant="subtitle2">Invoice {id(invoice.id)} · {label(invoice.status)}</Typography><Typography variant="body2" color="text.secondary">Total {text(invoice.total_amount)} {text(invoice.currency)} · balance {text(invoice.balance_amount)}</Typography></Box>)}
    {!existing && <><TextField select label="Billing service" value={serviceId} disabled={locked || !ready || !allowed} onChange={event => { setServiceId(event.target.value); markDirty(); }}><MenuItem value="">Choose an active service</MenuItem>{services.filter(service => service.active === true).map(service => <MenuItem key={id(service.id)} value={id(service.id)}>{text(service.name)} · {text(service.unit_amount)} {text(service.currency)}</MenuItem>)}</TextField><TextField label="Quantity" value={quantity} disabled={locked || !ready || !allowed} slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 30 } }} onChange={event => { setQuantity(event.target.value); markDirty(); }} /><Button variant="outlined" disabled={locked || !ready || !allowed || !selected || !/^[0-9]+(?:\.[0-9]+)?$/.test(quantity) || !/[1-9]/.test(quantity)} onClick={() => void review('draft_invoice', { patient_id: patientId, encounter_id: encounterId, currency: text(selected?.currency), request_key: crypto.randomUUID(), lines: [{ billing_service_id: serviceId, service_lock_version: Number(selected?.lock_version), quantity }] }, async () => { const currentEncounter = data((await read('get_encounter', { id: encounterId, patient_id: patientId })).encounter); if (currentEncounter.status !== 'completed' || !currentEncounter.ended_at) throw new Error('The encounter is not completed. Refresh before checkout.'); const fresh = rows((await read('billing_services', { active: 'true', q: text(selected?.name), page: 1, per_page: 100 })).services).find(service => id(service.id) === serviceId); if (!fresh || fresh.lock_version !== selected?.lock_version || fresh.currency !== selected?.currency) throw new Error('The billing service changed. Refresh before reviewing the invoice.'); const currentInvoices = rows((await read('patient_invoices', { patient_id: patientId, encounter_id: encounterId, page: 1, per_page: 20 })).invoices); if (currentInvoices.some(invoice => invoice.status !== 'void')) throw new Error('An invoice now exists for this encounter. Refresh checkout before continuing.'); })}>Review draft invoice</Button></>}
    <Typography variant="body2" color="text.secondary">Service prices and currencies come from the backend catalog. This prepares one unposted invoice line. No payment or claim is sent.</Typography>
  </Stack>;
}
