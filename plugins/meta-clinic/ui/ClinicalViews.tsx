import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip,
  CircularProgress, Divider, MenuItem, Pagination, Paper, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import './clinical-views.css';

type Data = Record<string, unknown>;
type View = 'vitals' | 'rooms' | 'billing';
type Call = (name: string, args?: Data) => Promise<Data>;
type Patient = { id: string | number; display_name?: string; name?: string; first_name?: string; last_name?: string; reference?: string };
type Props = {
  view: View;
  context: Data;
  call: Call;
  refreshKey: number;
  initialResult?: Data;
};

const isObject = (value: unknown): value is Data => !!value && typeof value === 'object' && !Array.isArray(value);
const asRows = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const asText = (value: unknown, fallback = 'Not recorded') => value === null || value === undefined || value === '' ? fallback : String(value);
const asPanel = (value: Data | undefined): Data | null => isObject(value?.panel) ? value.panel : null;
const patientLabel = (patient: Patient) => patient.display_name || patient.name || [patient.first_name, patient.last_name].filter(Boolean).join(' ') || patient.reference || `Patient ${patient.id}`;
const fmtDate = (value: unknown) => {
  if (typeof value !== 'string' || !value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};
const fmtAmount = (amount: unknown, currency: unknown) => {
  if (amount === null || amount === undefined || amount === '') return 'Not recorded';
  const raw = String(amount);
  const code = typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : '';
  return code ? `${raw} ${code}` : raw;
};
const contextSiteId = (context: Data) => {
  const site = context.current_site;
  return isObject(site) && (typeof site.id === 'string' || typeof site.id === 'number') ? site.id : undefined;
};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';

function currentEnvelope(result: Data | undefined, view: View) {
  return result && result.summary && result.panel && isObject(result.panel) && result.panel.view === view ? result : undefined;
}

function AboutRecords({ note, items = [] }: { note?: string; items?: string[] }) {
  const uniqueItems = [...new Set(items.filter(Boolean))];
  if (!note && !uniqueItems.length) return null;
  return <Accordion variant="outlined" disableGutters>
    <AccordionSummary>About these records</AccordionSummary>
    <AccordionDetails>
      {note && <Typography variant="body2" color="text.secondary">{note}</Typography>}
      {!!uniqueItems.length && <Box component="ul" className="clinical-gap-list" sx={{ mt: note ? 1 : 0 }}>
        {uniqueItems.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
      </Box>}
    </AccordionDetails>
  </Accordion>;
}

function PatientPicker({
  call, selectedId, onSelect, disabled, allowAll = false,
}: { call: Call; selectedId: string; onSelect: (id: string, label: string) => void; disabled: boolean; allowAll?: boolean }) {
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const sequence = useRef(0);
  const selected = patients.find(patient => String(patient.id) === selectedId);

  useEffect(() => () => { sequence.current++; }, []);

  const searchPatients = async (event?: FormEvent) => {
    event?.preventDefault();
    const term = query.trim();
    if (term.length < 2 || busy || disabled) return;
    const request = ++sequence.current;
    setBusy(true); setError(''); setPatients([]); setSearched(false);
    try {
      const result = await call('meta_clinic_read', { operation: 'lookup_patient', arguments: { q: term, per_page: 20, page: 1 } });
      if (request !== sequence.current) return;
      const data = isObject(result.data) ? result.data : result;
      setPatients(asRows<Patient>(data.patients));
      setSearched(true);
    } catch (cause) {
      if (request === sequence.current) setError(errorMessage(cause));
    } finally { if (request === sequence.current) setBusy(false); }
  };

  return <Paper variant="outlined" className="clinical-picker">
    <Stack component="form" direction={{ xs: 'column', sm: 'row' }} spacing={1.5} onSubmit={searchPatients}>
      <TextField
        size="small" label="Find a patient" placeholder="Search by name or clinic reference"
        value={query} onChange={event => setQuery(event.target.value)} disabled={disabled || busy}
        helperText="Search the patients available to your current clinic account."
        slotProps={{ htmlInput: { maxLength: 120 } }} fullWidth
      />
      <Button type="submit" variant="outlined" disabled={disabled || busy || query.trim().length < 2}>
        {busy ? <CircularProgress size={18} aria-label="Searching patients" /> : 'Search'}
      </Button>
    </Stack>
    {!!error && <Alert severity="error" sx={{ mt: 1.5 }} action={<Button color="inherit" size="small" onClick={() => void searchPatients()}>Retry</Button>}>{error}</Alert>}
    {searched && !patients.length && !error && <Typography role="status" variant="body2" sx={{ mt: 1.5 }} color="text.secondary">No patients matched that search in the current clinic.</Typography>}
    {!!patients.length && <TextField
      select fullWidth size="small" sx={{ mt: 2 }} label="Select patient" value={selectedId}
      onChange={event => { const patient = patients.find(item => String(item.id) === event.target.value); if (patient) onSelect(String(patient.id), patientLabel(patient)); else if (allowAll && event.target.value === '') onSelect('', ''); }}
    >
      {allowAll && <MenuItem value="">Clinic billing overview</MenuItem>}
      {patients.map(patient => <MenuItem key={String(patient.id)} value={String(patient.id)}>{patientLabel(patient)}</MenuItem>)}
    </TextField>}
    {selectedId && !selected && <Typography variant="body2" sx={{ mt: 1.5 }} color="text.secondary">Selected patient reference: {selectedId}</Typography>}
    {selected && <Typography variant="body2" sx={{ mt: 1.5 }} color="text.secondary">Selected: {patientLabel(selected)}</Typography>}
  </Paper>;
}

type PlotPoint = { x: number; y: number; label: string; value: number };
type TrendSeries = { name: string; color: string; points: Array<{ at: string; value: number }> };
function TrendChart({
  title, unit, series,
}: { title: string; unit: string; series: TrendSeries[] }) {
  const usableSeries = series.map(item => ({ ...item, points: item.points.filter(point => Number.isFinite(Date.parse(point.at)) && Number.isFinite(point.value)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)) }));
  const values = usableSeries.flatMap(item => item.points.map(point => point.value));
  const times = usableSeries.flatMap(item => item.points.map(point => Date.parse(point.at)));
  if (!values.length) return <Paper variant="outlined" className="clinical-chart">
    <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 650 }}>{title}</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No numeric measurements were returned for this chart.</Typography>
  </Paper>;
  const low = Math.min(...values), high = Math.max(...values), span = Math.max(high - low, Math.abs(high) * 0.08, 1);
  const min = low - span * 0.2, max = high + span * 0.2;
  const firstTime = Math.min(...times), lastTime = Math.max(...times);
  const width = 720, height = 220, padX = 38, padY = 20;
  const makePoints = (points: Array<{ at: string; value: number }>): PlotPoint[] => points.map(point => ({
    x: firstTime === lastTime ? width / 2 : padX + ((Date.parse(point.at) - firstTime) / (lastTime - firstTime)) * (width - 2 * padX),
    y: height - padY - ((point.value - min) / (max - min || 1)) * (height - 2 * padY),
    label: fmtDate(point.at), value: point.value,
  }));
  return <Paper variant="outlined" className="clinical-chart">
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Typography component="h3" variant="subtitle1" sx={{ mr: 'auto', fontWeight: 650 }}>{title}</Typography>
      {usableSeries.map(item => <Chip key={item.name} size="small" variant="outlined" label={`${item.name} · ${unit}`} sx={{ borderColor: item.color }} />)}
    </Stack>
    <Box sx={{ width: '100%', overflowX: 'auto', mt: 1 }}>
      <svg className="clinical-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} recorded measurements in ${unit}`}>
        {[0, 1, 2, 3].map(tick => { const y = padY + tick * ((height - 2 * padY) / 3); const value = max - tick * ((max - min) / 3); return <g key={tick}>
          <line x1={padX} x2={width - padX} y1={y} y2={y} className="clinical-chart-grid" />
          <text x={padX - 7} y={y + 4} textAnchor="end" className="clinical-chart-axis">{value.toFixed(0)}</text>
        </g>; })}
        {usableSeries.map(item => { const points = makePoints(item.points); return <g key={item.name}>
          {points.map((point, index) => <circle key={`${item.name}-${index}`} cx={point.x} cy={point.y} r="4" fill={item.color}>
            <title>{`${item.name}: ${point.value} ${unit}, ${point.label}`}</title>
          </circle>)}
        </g>; })}
        <text x={padX} y={height - 2} className="clinical-chart-axis">{fmtDate(new Date(firstTime).toISOString())}</text>
        <text x={width - padX} y={height - 2} textAnchor="end" className="clinical-chart-axis">{fmtDate(new Date(lastTime).toISOString())}</text>
      </svg>
    </Box>
    <Typography variant="caption" color="text.secondary">Recorded values shown as returned by the clinic. Chart scale fits this result and is not a clinical reference range.</Typography>
  </Paper>;
}

function VitalsPanel({ data }: { data: Data }) {
  const readings = asRows<Data>(data.readings);
  const pressures = asRows<Data>(data.blood_pressure);
  const heartRows = readings.filter(row => row.code === 'vital-heart-rate');
  const validPoint = (at: unknown, value: unknown) => {
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at)) || value === null || value === undefined || value === '') return undefined;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? { at, value: numeric } : undefined;
  };
  const unitLabel = (row: Data) => typeof row.unit_label === 'string' && row.unit_label.trim() ? row.unit_label.trim() : typeof row.unit_code === 'string' && row.unit_code.trim() ? row.unit_code.trim() : '';
  const heartGroups = new Map<string, Array<{ at: string; value: number }>>();
  for (const row of heartRows) {
    const unit = unitLabel(row), point = validPoint(row.observed_at, row.numeric_value);
    if (!unit || !point) continue;
    const points = heartGroups.get(unit) || [];
    points.push(point); heartGroups.set(unit, points);
  }
  const pressureGroups = new Map<string, { systolic: Array<{ at: string; value: number }>; diastolic: Array<{ at: string; value: number }> }>();
  for (const row of pressures) {
    const unit = unitLabel(row), at = row.observed_at;
    if (!unit) continue;
    const systolicPoint = validPoint(at, row.systolic), diastolicPoint = validPoint(at, row.diastolic);
    if (!systolicPoint && !diastolicPoint) continue;
    const group = pressureGroups.get(unit) || { systolic: [], diastolic: [] };
    if (systolicPoint) group.systolic.push(systolicPoint);
    if (diastolicPoint) group.diastolic.push(diastolicPoint);
    pressureGroups.set(unit, group);
  }
  const gaps = asRows<unknown>(data.gaps).map(item => String(item));
  const chartNotes = [
    heartGroups.size > 1 || pressureGroups.size > 1 ? 'Returned units differ; measurements are separated into charts by their recorded unit.' : '',
    [...heartGroups.values()].reduce((count, points) => count + points.length, 0) < heartRows.length ? 'Some heart-rate measurements were not graphed because timestamps, numeric values, or units were missing or invalid.' : '',
    [...pressureGroups.values()].reduce((count, group) => count + group.systolic.length + group.diastolic.length, 0) < pressures.length * 2 ? 'Some blood-pressure components were not graphed because timestamps, numeric values, or units were missing or invalid.' : '',
  ].filter(Boolean);
  return <Stack spacing={2}>
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Chip size="small" label={`${readings.length} returned measurements`} variant="outlined" />
      {isObject(data.pagination) && <Chip size="small" label={`Page ${asText(data.pagination.page)} of ${asText(data.pagination.total_pages)}`} variant="outlined" />}
      {!!pressures.length && <Chip size="small" label={`${pressures.length} blood pressure pairs`} variant="outlined" />}
    </Stack>
    <div className="clinical-chart-grid-layout">
      {[...heartGroups.entries()].map(([unit, points]) => <TrendChart key={`heart-${unit}`} title="Heart rate" unit={unit} series={[{ name: 'Heart rate', color: '#237867', points }]} />)}
      {[...pressureGroups.entries()].map(([unit, pair]) => <TrendChart key={`bp-${unit}`} title="Blood pressure" unit={unit} series={[
        { name: 'Systolic', color: '#2f6e9b', points: pair.systolic },
        { name: 'Diastolic', color: '#9a5a24', points: pair.diastolic },
      ]} />)}
    </div>
    <Paper variant="outlined" className="clinical-history">
      <Typography component="h3" variant="subtitle1" sx={{ p: 2, fontWeight: 650 }}>Recorded history</Typography>
      {!readings.length && !pressures.length ? <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>No measurements were returned for this patient.</Typography> : <TableContainer>
        <Table size="small" aria-label="Recorded vital measurements">
          <TableHead><TableRow><TableCell>Measurement</TableCell><TableCell>Value</TableCell><TableCell>Observed</TableCell><TableCell>Recorded</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
          <TableBody>
            {readings.map((row, index) => <TableRow key={String(row.id ?? index)}>
              <TableCell>{asText(row.display_label || row.label || row.code, 'Recorded measurement')}</TableCell>
              <TableCell>{row.numeric_value !== null && row.numeric_value !== undefined ? `${row.numeric_value} ${asText(row.unit_label, '')}`.trim() : `Value not recorded${row.value_kind ? ` (${String(row.value_kind)})` : ''}`}</TableCell>
              <TableCell>{fmtDate(row.observed_at)}</TableCell><TableCell>{fmtDate(row.recorded_at)}</TableCell><TableCell>{asText(row.status, 'Source status not returned')}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </TableContainer>}
    </Paper>
    <AboutRecords items={[...gaps, ...chartNotes]} />
  </Stack>;
}

function RoomsPanel({ data }: { data: Data }) {
  const rooms = asRows<Data>(data.rooms);
  const gaps = asRows<unknown>(data.gaps).map(item => String(item));
  return <Stack spacing={2}>
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Chip size="small" variant="outlined" label={`${rooms.length} rooms returned`} />
      <Chip size="small" variant="outlined" label={`Snapshot ${fmtDate(data.board_as_of)}`} />
      {data.board_truncated === true && <Chip size="small" color="warning" label="List may be incomplete" />}
    </Stack>
    {!rooms.length ? <Paper variant="outlined" className="clinical-empty"><Typography variant="h6">No rooms returned</Typography><Typography variant="body2" color="text.secondary">The clinic did not return room records for this location.</Typography></Paper> : <div className="clinical-room-grid">
      {rooms.map((room, index) => {
        const visits = asRows<Data>(room.visits);
        return <Paper variant="outlined" className="clinical-room-card" key={String(room.id ?? index)}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 650 }}>{asText(room.code, `Room ${index + 1}`)}</Typography>
            <Chip size="small" variant="outlined" label={asText(room.kind, 'Type not recorded')} />
          </Stack>
          <Divider sx={{ my: 1.5 }} />
          <dl className="clinical-room-facts">
            <dt>Room status</dt><dd>{asText(room.status)}</dd>
            <dt>Visits listed</dt><dd>{visits.length}</dd>
          </dl>
          {!!visits.length && <Stack spacing={1} sx={{ mt: 1.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Recorded visits</Typography>
            {visits.map((visit, visitIndex) => <Box key={String(visit.encounter_id ?? visitIndex)} className="clinical-visit-row">
              <Typography variant="body2">Encounter {asText(visit.encounter_id)}</Typography>
              <Typography variant="caption" color="text.secondary">{asText(visit.status)} · {asText(visit.operational_state)} · {fmtDate(visit.started_at)}</Typography>
            </Box>)}
          </Stack>}
        </Paper>;
      })}
    </div>}
    <AboutRecords note="Only room fields and encounter states returned by the clinic are shown. This view does not indicate that a room is ready or available." items={gaps} />
  </Stack>;
}

function BillingPanel({ data }: { data: Data }) {
  const invoices = asRows<Data>(data.invoices);
  const insurance = isObject(data.insurance) ? data.insurance : {};
  const coverage = asRows<Data>(insurance.coverage);
  const requests = [...asRows<Data>(insurance.eligibility), ...asRows<Data>(insurance.claims), ...asRows<Data>(insurance.authorizations), ...asRows<Data>(insurance.reconciliations)];
  const gaps = [...asRows<unknown>(data.gaps), ...asRows<unknown>(insurance.gaps)].map(item => String(item));
  return <Stack spacing={2}>
    <Paper variant="outlined" className="clinical-history">
      <Typography component="h3" variant="subtitle1" sx={{ p: 2, fontWeight: 650 }}>Invoices</Typography>
      {!invoices.length ? <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>No invoice records were returned for this selection.</Typography> : <TableContainer>
        <Table size="small" aria-label="Clinic invoice records"><TableHead><TableRow><TableCell>Invoice</TableCell><TableCell>State</TableCell><TableCell>Total</TableCell><TableCell>Allocated</TableCell><TableCell>Credit</TableCell><TableCell>Balance</TableCell><TableCell>Updated</TableCell></TableRow></TableHead>
          <TableBody>{invoices.map((invoice, index) => <TableRow key={String(invoice.id ?? index)}>
            <TableCell>{asText(invoice.id)}</TableCell><TableCell>{asText(invoice.status)}</TableCell>
            <TableCell>{fmtAmount(invoice.total_amount, invoice.currency)}</TableCell><TableCell>{fmtAmount(invoice.allocated_amount, invoice.currency)}</TableCell>
            <TableCell>{fmtAmount(invoice.credit_amount, invoice.currency)}</TableCell><TableCell>{fmtAmount(invoice.balance_amount, invoice.currency)}</TableCell>
            <TableCell>{fmtDate(invoice.updated_at || invoice.created_at)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </TableContainer>}
    </Paper>
    <Paper variant="outlined" className="clinical-history">
      <Typography component="h3" variant="subtitle1" sx={{ p: 2, fontWeight: 650 }}>Coverage on file</Typography>
      {!coverage.length ? <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>{insurance.enabled === false ? 'Coverage records are not enabled for this clinic.' : 'No coverage records were returned.'}</Typography> : <TableContainer>
        <Table size="small" aria-label="Clinic coverage records"><TableHead><TableRow><TableCell>Recorded state</TableCell><TableCell>Effective from</TableCell><TableCell>Effective through</TableCell><TableCell>Observed</TableCell><TableCell>Recorded</TableCell></TableRow></TableHead>
          <TableBody>{coverage.map((item, index) => <TableRow key={String(item.id ?? index)}>
            <TableCell>{asText(item.status)}</TableCell><TableCell>{asText(item.starts_on)}</TableCell><TableCell>{asText(item.ends_on)}</TableCell><TableCell>{asText(item.observed_on)}</TableCell><TableCell>{fmtDate(item.recorded_at)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </TableContainer>}
    </Paper>
    {!!requests.length && <Paper variant="outlined" className="clinical-history">
      <Typography component="h3" variant="subtitle1" sx={{ p: 2, fontWeight: 650 }}>Recorded requests</Typography>
      <TableContainer><Table size="small" aria-label="Recorded billing requests"><TableHead><TableRow><TableCell>Type</TableCell><TableCell>State</TableCell><TableCell>Source</TableCell><TableCell>Service date</TableCell><TableCell>Recorded</TableCell></TableRow></TableHead>
        <TableBody>{requests.map((request, index) => <TableRow key={String(request.id ?? index)}>
          <TableCell>{asText(request.kind)}</TableCell><TableCell>{asText(request.latest_state || request.state)}</TableCell><TableCell>{asText(request.latest_source || request.source)}</TableCell><TableCell>{asText(request.service_date)}</TableCell><TableCell>{fmtDate(request.recorded_at)}</TableCell>
        </TableRow>)}</TableBody>
      </Table></TableContainer>
    </Paper>}
    <AboutRecords
      note="These are recorded clinic billing and coverage workflow states. This view does not contact an insurer or confirm payment."
      items={[...(insurance.limitation ? [String(insurance.limitation)] : []), ...gaps]}
    />
  </Stack>;
}

export function ClinicalViews({ view, context, call, refreshKey, initialResult }: Props) {
  const [result, setResult] = useState<Data | undefined>(() => currentEnvelope(initialResult, view));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [page, setPage] = useState(1);
  const requestSequence = useRef(0);
  const requestArguments = useRef<Data>({});
  const previousRefreshKey = useRef(refreshKey);
  const siteId = contextSiteId(context);
  const title = view === 'vitals' ? 'Vitals & chart' : view === 'rooms' ? 'Clinic rooms' : 'Billing overview';
  useEffect(() => () => { requestSequence.current++; }, []);

  useEffect(() => {
    requestSequence.current++;
    setBusy(false);
    const next = currentEnvelope(initialResult, view);
    if (!next) {
      setResult(undefined);
      requestArguments.current = {};
      setPatientId(''); setPatientName(''); setPage(1);
      return;
    }
    setResult(next);
    const args = isObject(next.arguments) ? next.arguments : {};
    const panelData = isObject(next.panel) ? next.panel : {};
    const filters: Data = {};
    for (const key of ['patient_id', 'encounter_id', 'site_id']) {
      const value = args[key] ?? panelData[key];
      if (typeof value === 'string' || typeof value === 'number') filters[key] = String(value);
    }
    requestArguments.current = filters;
    setPatientId(typeof filters.patient_id === 'string' ? filters.patient_id : '');
    setPatientName('');
    setPage(Number.isInteger(Number(args.page)) && Number(args.page) > 0 ? Number(args.page) : 1);
  }, [initialResult, view]);

  useEffect(() => {
    if (previousRefreshKey.current === refreshKey) return;
    previousRefreshKey.current = refreshKey;
    void loadPanel(page);
    // refreshKey is the parent's explicit refresh signal; context scope is captured by the parent key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const loadPanel = async (requestedPage = 1) => {
    const request = ++requestSequence.current;
    setBusy(true); setError('');
    const arguments_: Data = { ...requestArguments.current };
    if (view === 'rooms' && arguments_.site_id === undefined && siteId !== undefined) arguments_.site_id = String(siteId);
    arguments_.page = requestedPage;
    arguments_.per_page = 20;
    try {
      const response = await call('meta_clinic_panel', { view, arguments: arguments_ });
      if (request === requestSequence.current) setResult(response);
    } catch (cause) {
      if (request === requestSequence.current) setError(errorMessage(cause));
    } finally { if (request === requestSequence.current) setBusy(false); }
  };

  const loadExistingSelection = () => void loadPanel(page);
  const panel = asPanel(result);
  const handlePatientSelect = (id: string, label: string) => {
    setPatientId(id); setPatientName(label); setPage(1); setResult(undefined);
    const filters = { ...requestArguments.current };
    delete filters.encounter_id;
    if (id) filters.patient_id = id;
    else delete filters.patient_id;
    requestArguments.current = filters;
    void loadPanel(1);
  };

  return <Stack className="clinical-view" spacing={2.5}>
    <Stack className="clinical-view-heading" direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}>
      <Box sx={{ mr: 'auto' }}>
        <Typography component="h2" variant="h5">{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {view === 'vitals' ? 'Review measurements recorded by the clinic.' : view === 'rooms' ? 'Review rooms and encounter states recorded for your clinic location.' : 'Review invoice and coverage workflow records.'}
        </Typography>
      </Box>
      <Button variant="outlined" disabled={busy} onClick={loadExistingSelection}>{busy ? <CircularProgress size={18} aria-label="Loading panel" /> : 'Refresh'}</Button>
    </Stack>

    {(view === 'vitals' || view === 'billing') && <PatientPicker call={call} selectedId={patientId} onSelect={handlePatientSelect} disabled={busy} allowAll={view === 'billing'} />}
    {patientName && patientId && <Typography variant="body2" color="text.secondary">Current patient: {patientName}</Typography>}
    {!result && !busy && !error && <Paper variant="outlined" className="clinical-empty">
      <Typography variant="h6">{view === 'vitals' ? 'Choose a patient to view recorded measurements' : view === 'rooms' ? 'Room status is ready to load' : 'Billing records are ready to load'}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {view === 'vitals' ? 'Search for a patient available to your account, then select the record.' : view === 'rooms' ? 'Load the room and encounter records for the current clinic location.' : 'Load the clinic billing summary, or select a patient to narrow the records.'}
      </Typography>
      {view !== 'vitals' && <Button sx={{ mt: 2 }} variant="contained" onClick={loadExistingSelection}>Load {view === 'rooms' ? 'room status' : 'billing records'}</Button>}
    </Paper>}
    {error && <Alert severity="error" action={<Button color="inherit" size="small" disabled={busy} onClick={loadExistingSelection}>Retry</Button>}>{error}</Alert>}
    {busy && <Stack role="status" direction="row" spacing={1.5} sx={{ alignItems: 'center' }}><CircularProgress size={18} /><Typography variant="body2">Loading {title.toLowerCase()}…</Typography></Stack>}
    {result && !panel && <Alert severity="warning">The clinic response did not include a {view} panel. Refresh to request the current view.</Alert>}
    {panel && !busy && <>
      {view === 'vitals' && <VitalsPanel data={panel} />}
      {view === 'rooms' && <RoomsPanel data={panel} />}
      {view === 'billing' && <BillingPanel data={panel} />}
      {isObject(panel.pagination) && Number(panel.pagination.total_pages) > 1 && <Stack direction="row" spacing={2} sx={{ justifyContent: 'center', alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary">Page {asText(panel.pagination.page)} of {asText(panel.pagination.total_pages)}</Typography>
        <Pagination
          count={Number(panel.pagination.total_pages)} page={Math.max(1, Number(panel.pagination.page) || page)}
          onChange={(_event, nextPage) => { setPage(nextPage); void loadPanel(nextPage); }}
          disabled={busy} size="small" color="primary" aria-label={`Pages of ${title.toLowerCase()}`}
        />
      </Stack>}
      <Divider />
      <Typography variant="caption" color="text.secondary">{asText(result?.summary && isObject(result.summary) ? result.summary.title : title)} · {asText(result?.summary && isObject(result.summary) ? result.summary.row_count : undefined, 'Count not provided')} records returned</Typography>
    </>}
  </Stack>;
}
