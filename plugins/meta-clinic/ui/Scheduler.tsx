import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, ButtonBase, Checkbox, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Drawer,
  FormControlLabel, MenuItem, Stack, Switch, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import './scheduler.css';

type Data = Record<string, any>;
type Props = {
  connection: Data;
  context: Data;
  call: (name: string, arguments_: Data) => Promise<Data>;
  onPrepare: (operation: string, arguments_: Data) => Promise<void>;
  onRecord: (record: Data) => void;
  refreshKey?: number;
};
type Calendar = {
  key: string; days: Data[]; clinicians: Data[]; rooms: Data[];
  timezone: string; asOf: string; receivedAt: number;
  capacityConfigured: boolean; failures: Array<{ date: string; message: string }>;
};
type Draft = {
  key: string; mode: 'book' | 'reschedule'; slot: Data; siteId: string; timezone: string;
  patient: Data | null; appointment?: Data; visitTypeId: string; offeringId: string;
  roomId: string; modality: 'in_person' | 'video'; reason: string;
};
type Options = { key: string; clinicians: Data[]; rooms: Data[]; visitTypes: Data[]; offerings: Data[]; video: Data | null; issues: string[] };

const isObject = (value: unknown): value is Data => !!value && typeof value === 'object' && !Array.isArray(value);
const array = (value: any): Data[] => Array.isArray(value) ? value.filter(isObject) : [];
const sameId = (left: any, right: any) => left !== null && left !== undefined && right !== null && right !== undefined && String(left) === String(right);
const recordName = (record?: Data | null, fallback = 'Name not recorded'): string => record?.display_name || record?.name || record?.label || record?.code || record?.reference || fallback;
const words = (value: any): string => String(value || 'Not recorded').replace(/_/g, ' ').replace(/^\w/, letter => letter.toUpperCase());
const message = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed. Please try again.';
const parseInstant = (value: any) => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;
const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const shiftDay = (day: string, amount: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
const monday = (day: string) => shiftDay(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
function validZone(zone: any): zone is string {
  if (typeof zone !== 'string' || !zone) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); return true; } catch { return false; }
}
function localParts(instant: string | number, zone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  const fields = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { date: `${fields.year}-${fields.month}-${fields.day}`, minute: Number(fields.hour) * 60 + Number(fields.minute) };
}
const timeLabel = (instant: any, zone: string, withZone = false) => Number.isFinite(parseInstant(instant)) ? new Date(instant).toLocaleTimeString(undefined, { timeZone: zone, hour: 'numeric', minute: '2-digit', ...(withZone ? { timeZoneName: 'short' } : {}) }) : 'Time not recorded';
const fullTime = (instant: any, zone: string) => Number.isFinite(parseInstant(instant)) ? new Date(instant).toLocaleString(undefined, { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'Time not recorded';
const durationOf = (slot: Data) => (parseInstant(slot.ends_at) - parseInstant(slot.starts_at)) / 60000;
const slotKey = (slot: Data) => `${parseInstant(slot.starts_at)}:${parseInstant(slot.ends_at)}:${slot.clinician_id}`;
const unique = (items: Data[]) => [...new Map(items.map(item => [String(item.id), item])).values()];
const TRANSITIONS: Record<string, string[]> = { scheduled: ['confirmed', 'cancelled', 'no_show'], confirmed: ['cancelled', 'completed', 'no_show'], no_show: [], completed: [], cancelled: [] };

function Details({ entries }: { entries: Array<[string, any]> }) {
  return <dl className="scheduler-details">{entries.map(([name, value]) => <React.Fragment key={name}><dt>{name}</dt><dd>{value === null || value === undefined || value === '' ? 'Not recorded' : String(value)}</dd></React.Fragment>)}</dl>;
}
function validCalendar(data: any, siteId: string, date: string, duration: number) {
  if (!isObject(data) || !sameId(data.site_id, siteId) || data.month !== date.slice(0, 7) || !validZone(data.timezone) || !Number.isFinite(parseInstant(data.as_of))) throw new Error('The calendar response did not match this location or include a usable time zone. Refresh the calendar.');
  if (data.duration_minutes !== duration || !Array.isArray(data.days)) throw new Error('The calendar response did not match the selected duration. Refresh the calendar.');
  const day = data.days.find((item: Data) => item.date === date);
  if (!day || !Array.isArray(day.appointments) || !Array.isArray(day.slots) || !Array.isArray(day.holds)) throw new Error('The calendar did not return the requested day. Refresh the calendar.');
  if (day.appointments.some((appointment: Data) => !sameId(appointment.site_id, siteId))) throw new Error('An appointment belongs to another location. Refresh the calendar before continuing.');
  if (day.slots.some((slot: Data) => !Number.isFinite(parseInstant(slot.starts_at)) || !Number.isFinite(parseInstant(slot.ends_at)) || durationOf(slot) !== duration || !slot.clinician_id || !Array.isArray(slot.room_ids) || localParts(slot.starts_at, data.timezone).date !== date)) throw new Error('Some available times could not be verified. Refresh the calendar before booking.');
  return { ...day, loaded: true };
}

// Compare recorded intervals and place overlaps side by side, without priority ranking.
function tracks(items: Data[], date: string, timezone: string) {
  const positioned = items.filter(item => Number.isFinite(parseInstant(item.starts_at)) && Number.isFinite(parseInstant(item.ends_at))).map(item => {
    const start = localParts(item.starts_at, timezone), end = localParts(item.ends_at, timezone);
    const first = start.date < date ? 0 : start.minute;
    const last = end.date > date ? 1440 : Math.max(first + 15, end.minute);
    return { item, start: first, end: Math.min(1440, last), track: 0, count: 1 };
  }).sort((left, right) => left.start - right.start || left.end - right.end);
  let ends: number[] = [], group: typeof positioned = [], boundary = -1;
  const finish = () => group.forEach(item => { item.count = Math.max(1, ends.length); });
  for (const event of positioned) {
    if (event.start >= boundary) { finish(); ends = []; group = []; }
    let track = ends.findIndex(end => end <= event.start);
    if (track < 0) track = ends.length;
    ends[track] = event.end; event.track = track; group.push(event); boundary = Math.max(...ends);
  }
  finish();
  return positioned;
}

export function Scheduler({ connection, context, call, onPrepare, onRecord, refreshKey = 0 }: Props) {
  const callbacks = useRef({ call, onPrepare, onRecord }); callbacks.current = { call, onPrepare, onRecord };
  const scope = [connection?.connected, connection?.actor?.id, context?.user_id, context?.practice?.id || connection?.practice?.id, context?.current_site?.id || connection?.site?.id, context?.authorization_generation].join(':');
  const currentScope = useRef(scope); currentScope.current = scope;
  const sites = array(context?.sites), currentSite = context?.current_site || connection?.site;
  const [siteId, setSiteId] = useState(String(currentSite?.id || ''));
  const selectedSite = sites.find(site => sameId(site.id, siteId)) || (sameId(currentSite?.id, siteId) ? currentSite : null);
  const initialZone = validZone(selectedSite?.timezone_override || context?.practice?.timezone) ? selectedSite?.timezone_override || context?.practice?.timezone : 'UTC';
  const initialDay = typeof connection?.business_date === 'string' && validDay(connection.business_date) ? connection.business_date : localParts(Date.now(), initialZone).date;
  const [date, setDate] = useState(initialDay), [view, setView] = useState<'day' | 'week'>('week');
  const [durationText, setDurationText] = useState('30'), [clinicianId, setClinicianId] = useState(''), [showAvailability, setShowAvailability] = useState(true);
  const [calendar, setCalendar] = useState<Calendar | null>(null), [loading, setLoading] = useState(false), [calendarError, setCalendarError] = useState(''), [reload, setReload] = useState(0);
  const [detail, setDetail] = useState<Data | null>(null), [detailBusy, setDetailBusy] = useState(false), [detailError, setDetailError] = useState('');
  const [rescheduling, setRescheduling] = useState<Data | null>(null), [slotPicker, setSlotPicker] = useState<Data[] | null>(null), [slotLimit, setSlotLimit] = useState(40);
  const [draft, setDraft] = useState<Draft | null>(null), [bookingOpen, setBookingOpen] = useState(false), [options, setOptions] = useState<Options | null>(null), [optionsBusy, setOptionsBusy] = useState(false), [optionsReload, setOptionsReload] = useState(0);
  const [patientQuery, setPatientQuery] = useState(''), [patients, setPatients] = useState<Data[]>([]), [patientBusy, setPatientBusy] = useState(false), [patientError, setPatientError] = useState('');
  const [resources, setResources] = useState<{ key: string; data: Data } | null>(null), [resourceBusy, setResourceBusy] = useState(false), [resourceError, setResourceError] = useState(''), [resourceReload, setResourceReload] = useState(0);
  const [formBusy, setFormBusy] = useState(false), [formError, setFormError] = useState(''), [preparedNotice, setPreparedNotice] = useState('');
  const [transition, setTransition] = useState(''), [cancelAcknowledged, setCancelAcknowledged] = useState(false), [transitionBusy, setTransitionBusy] = useState(false), [showAllAgenda, setShowAllAgenda] = useState(false);
  const calendarSeq = useRef(0), detailSeq = useRef(0), optionsSeq = useRef(0), searchSeq = useRef(0), resourceSeq = useRef(0), alive = useRef(true);
  const duration = Number(durationText), validDuration = Number.isInteger(duration) && duration >= 5 && duration <= 240;
  const dates = useMemo(() => validDay(date) ? (view === 'week' ? Array.from({ length: 7 }, (_, i) => shiftDay(monday(date), i)) : [date]) : [], [date, view]);
  const calendarKey = `${scope}|${siteId}|${dates.join(',')}|${duration}|${reload}|${refreshKey}`;
  const data = calendar?.key === calendarKey ? calendar : null;
  const timezone = data?.timezone || initialZone;
  const capabilities = context?.capabilities || {};
  const canBook = capabilities.appointments_book === true;
  const canTransition = capabilities.appointments_status_transition === true;
  const businessTime = data ? parseInstant(data.asOf) + (Date.now() - data.receivedAt) : Date.now();
  const read = useCallback(async (operation: string, args: Data = {}) => {
    const requestedScope = currentScope.current;
    const envelope = await callbacks.current.call('meta_clinic_read', { operation, arguments: args });
    if (!alive.current || currentScope.current !== requestedScope) throw new Error('The clinic or account changed. Reload this view.');
    if (!('data' in envelope)) throw new Error('The connector returned no records. Try again.');
    return envelope.data;
  }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; calendarSeq.current++; detailSeq.current++; optionsSeq.current++; searchSeq.current++; resourceSeq.current++; }; }, []);
  useEffect(() => {
    detailSeq.current++; optionsSeq.current++; searchSeq.current++; resourceSeq.current++;
    setSiteId(String(currentSite?.id || '')); setCalendar(null); setDetail(null); setRescheduling(null); setDraft(null); setBookingOpen(false); setSlotPicker(null); setOptions(null); setPatients([]); setPatientQuery(''); setResources(null); setFormError(''); setPreparedNotice('');
    setFormBusy(false); setTransitionBusy(false); setDetailBusy(false); setOptionsBusy(false); setResourceBusy(false); setPatientBusy(false);
  }, [scope]);
  useEffect(() => { detailSeq.current++; optionsSeq.current++; searchSeq.current++; resourceSeq.current++; setClinicianId(''); setDetail(null); setRescheduling(null); setDraft(null); setBookingOpen(false); setSlotPicker(null); setPreparedNotice(''); setDetailBusy(false); setFormBusy(false); setTransitionBusy(false); }, [siteId]);
  useEffect(() => { setDetail(null); setDraft(null); setBookingOpen(false); setRescheduling(null); setSlotPicker(null); setPreparedNotice(''); }, [refreshKey]);
  useEffect(() => {
    const token = ++calendarSeq.current;
    if (!connection?.connected || !siteId || !dates.length || !validDuration) { setCalendar(null); setLoading(false); return; }
    setLoading(true); setCalendarError(''); setCalendar(null);
    const requestedScope = scope;
    void Promise.allSettled(dates.map(day => read('schedule_calendar', { site_id: siteId, date: day, period: 'day', duration_minutes: duration }).then(response => ({ response, day: validCalendar(response, siteId, day, duration) })))).then(results => {
      if (!alive.current || token !== calendarSeq.current || currentScope.current !== requestedScope) return;
      const days: Data[] = [], clinicians: Data[] = [], rooms: Data[] = [], failures: Calendar['failures'] = [];
      let zone = '', asOf = '', capacityConfigured = true;
      results.forEach((result, index) => {
        if (result.status === 'rejected') { failures.push({ date: dates[index], message: message(result.reason) }); days.push({ date: dates[index], loaded: false, appointments: [], holds: [], slots: [] }); return; }
        const { response, day } = result.value;
        if (zone && zone !== response.timezone) { failures.push({ date: dates[index], message: 'The location time zone changed during loading. Refresh the calendar.' }); days.push({ date: dates[index], loaded: false, appointments: [], holds: [], slots: [] }); return; }
        zone = response.timezone; asOf = !asOf || parseInstant(response.as_of) < parseInstant(asOf) ? response.as_of : asOf;
        capacityConfigured = capacityConfigured && response.capacity_configured === true;
        days.push(day); clinicians.push(...array(response.clinicians)); rooms.push(...array(response.rooms));
      });
      if (!zone) { setCalendarError(failures[0]?.message || 'The calendar could not be loaded.'); setCalendar(null); }
      else setCalendar({ key: calendarKey, days, clinicians: unique(clinicians), rooms: unique(rooms), timezone: zone, asOf, receivedAt: Date.now(), capacityConfigured, failures });
      setLoading(false);
    });
    return () => { calendarSeq.current++; };
  }, [calendarKey, read]);

  const allAppointments = data ? unique(data.days.flatMap(day => array(day.appointments))).filter(appointment => !clinicianId || sameId(appointment.booked_clinician_id, clinicianId)) : [];
  const allSlots: Data[] = data ? data.days.flatMap(day => array(day.slots).map((slot): Data => ({ ...slot, date: day.date, site_id: siteId }))).filter(slot => (!clinicianId || sameId(slot.clinician_id, clinicianId)) && parseInstant(slot.starts_at) > businessTime) : [];
  const clinicianName = (id: any) => recordName(data?.clinicians.find(clinician => sameId(clinician.id, id)) || options?.clinicians.find(clinician => sameId(clinician.id, id)), id ? 'Clinician name not recorded' : 'Unassigned');
  const roomName = (id: any) => recordName(data?.rooms.find(room => sameId(room.id, id)) || options?.rooms.find(room => sameId(room.id, id)), 'Room not recorded');
  const lanes = useMemo<Data[]>(() => {
    if (!data) return [];
    if (view === 'week') return data.days.map(day => ({ key: day.date, title: dateLabel(day.date), subtitle: `${array(day.appointments).filter(appointment => !clinicianId || sameId(appointment.booked_clinician_id, clinicianId)).length} appointments`, day, clinician: clinicianId }));
    const day = data.days[0], activeIds = [...new Set([...array(day.appointments).map(appointment => String(appointment.booked_clinician_id || '')), ...array(day.slots).map(slot => String(slot.clinician_id)), ...array(day.holds).map(hold => String(hold.clinician_id))])];
    const ids = clinicianId ? [clinicianId] : activeIds.length ? activeIds : [''];
    return ids.map(id => ({ key: `${day.date}:${id}`, title: id ? recordName(data.clinicians.find(clinician => sameId(clinician.id, id)), 'Clinician name not recorded') : 'Unassigned', subtitle: dateLabel(day.date), day, clinician: id, dayLane: true }));
  }, [data, view, clinicianId]);
  const bounds = useMemo(() => {
    if (!data) return { first: 8 * 60, last: 18 * 60 };
    const intervals = data.days.flatMap(day => [...array(day.appointments), ...array(day.holds), ...(showAvailability ? array(day.slots) : [])].filter(item => Number.isFinite(parseInstant(item.starts_at)) && Number.isFinite(parseInstant(item.ends_at))).map(item => ({ date: day.date, item })));
    const starts = intervals.map(({ item }) => localParts(item.starts_at, data.timezone).minute);
    const ends = intervals.map(({ date: day, item }) => { const end = localParts(item.ends_at, data.timezone); return end.date > day ? 1440 : end.minute; });
    return { first: Math.max(0, Math.min(8 * 60, ...starts.map(minute => Math.floor(minute / 60) * 60))), last: Math.min(1440, Math.max(18 * 60, ...ends.map(minute => Math.ceil(minute / 60) * 60))) };
  }, [data, showAvailability]);
  const gridHeight = (bounds.last - bounds.first) / 60 * 80;

  const openAppointment = async (appointment: Data) => {
    const token = ++detailSeq.current; setDetail(appointment); setDetailBusy(true); setDetailError(''); setTransition(''); setCancelAcknowledged(false);
    try {
      const result = await read('get_appointment', { id: String(appointment.id) });
      if (token !== detailSeq.current || !alive.current) return;
      if (!result?.appointment || !sameId(result.appointment.id, appointment.id) || !sameId(result.appointment.site_id, siteId)) throw new Error('The appointment detail did not match the selected location. Refresh the calendar.');
      setDetail({ ...appointment, ...result.appointment,
        ...(sameId(appointment.booked_clinician_id, result.appointment.booked_clinician_id) ? {} : { clinician_name: null }),
        ...(sameId(appointment.room_id, result.appointment.room_id) ? {} : { room_name: null }),
        ...(sameId(appointment.visit_type_id, result.appointment.visit_type_id) ? {} : { visit_type_name: null }),
      });
    } catch (error) { if (token === detailSeq.current && alive.current) setDetailError(message(error)); }
    finally { if (token === detailSeq.current && alive.current) setDetailBusy(false); }
  };
  const chooseSlot = (slot: Data) => {
    if (!data || loading || !canBook || !sameId(slot.site_id, siteId) || parseInstant(slot.starts_at) <= businessTime) return;
    const original = rescheduling;
    setDraft({ key: crypto.randomUUID(), mode: original ? 'reschedule' : 'book', slot, siteId, timezone: data.timezone, patient: original?.patient || null, appointment: original || undefined,
      visitTypeId: String(original?.visit_type_id || ''), offeringId: String(original?.service_offering_id || ''), roomId: original?.room_id && slot.room_ids.some((id: any) => sameId(id, original.room_id)) ? String(original.room_id) : '', modality: original?.visit_modality === 'video' ? 'video' : 'in_person', reason: original?.reason || '' });
    setPatientQuery(''); setPatients([]); setFormError(''); setPreparedNotice(''); setBookingOpen(true); setSlotPicker(null); setRescheduling(null);
  };
  const optionsKey = draft ? `${scope}|${draft.key}|${optionsReload}` : '';
  useEffect(() => {
    const token = ++optionsSeq.current;
    if (!draft || !bookingOpen) return;
    setOptionsBusy(true); setOptions(null);
    const jobs = [
      ['clinicians', 'booking_clinicians', { site_id: draft.siteId, per_page: 100 }],
      ['visitTypes', 'facilities', { type: 'visit_types', site_id: draft.siteId, available_only: 'true', per_page: 100 }],
      ['rooms', 'facilities', { type: 'rooms', site_id: draft.siteId, per_page: 100 }],
      ['offerings', 'booking_service_offerings', { status: 'published' }],
      ['video', 'telehealth_booking_options', { site_id: draft.siteId }],
    ] as const;
    void Promise.allSettled(jobs.map(async ([name, operation, args]) => ({ name, data: await read(operation, args) }))).then(results => {
      if (!alive.current || token !== optionsSeq.current) return;
      const next: Options = { key: optionsKey, clinicians: [], rooms: [], visitTypes: [], offerings: [], video: null, issues: [] };
      results.forEach((result, index) => {
        if (result.status === 'rejected') { next.issues.push(`${words(jobs[index][0])}: ${message(result.reason)}`); return; }
        const { name, data: value } = result.value;
        if (name === 'clinicians') next.clinicians = array(value?.clinicians);
        if (name === 'visitTypes') next.visitTypes = array(value?.visit_types).filter(type => !type.retired_at);
        if (name === 'rooms') next.rooms = array(value?.rooms).filter(room => sameId(room.site_id, draft.siteId));
        if (name === 'offerings') next.offerings = array(value?.service_offerings).filter(offering => offering.status === 'published' && Array.isArray(offering.available_site_ids) && offering.available_site_ids.some((id: any) => sameId(id, draft.siteId)));
        if (name === 'video') next.video = isObject(value?.data) ? value.data : isObject(value) ? value : null;
        if (['clinicians', 'visitTypes', 'rooms'].includes(name) && value?.pagination?.next_page) next.issues.push(`${words(name)}: more records are available in the full clinic. These choices show the first returned page.`);
      });
      setOptions(next); setOptionsBusy(false);
    });
    return () => { optionsSeq.current++; };
  }, [optionsKey, bookingOpen, read]);
  useEffect(() => {
    const token = ++searchSeq.current;
    setPatientError('');
    if (!bookingOpen || !draft || draft.mode !== 'book' || patientQuery.trim().length < 2) { setPatients([]); setPatientBusy(false); return; }
    setPatientBusy(true);
    const timer = window.setTimeout(() => {
      void read('lookup_patient', { q: patientQuery.trim(), per_page: 25 }).then(response => { if (alive.current && token === searchSeq.current) setPatients(array(response?.patients)); }).catch(error => { if (alive.current && token === searchSeq.current) { setPatients([]); setPatientError(message(error)); } }).finally(() => { if (alive.current && token === searchSeq.current) setPatientBusy(false); });
    }, 300);
    return () => { window.clearTimeout(timer); searchSeq.current++; };
  }, [patientQuery, bookingOpen, draft?.key, read]);
  const offering = options?.offerings.find(item => sameId(item.id, draft?.offeringId));
  const resourceKey = draft?.offeringId ? `${scope}|${draft.key}|${draft.offeringId}|${draft.roomId}|${draft.modality}|${resourceReload}` : '';
  const resourceArgs = (value: Draft): Data => ({ site_id: value.siteId, offering_id: value.offeringId, starts_at: value.slot.starts_at, ends_at: value.slot.ends_at, ...(value.modality === 'in_person' && value.roomId ? { room_id: value.roomId } : {}), ...(value.appointment ? { appointment_id: String(value.appointment.id) } : {}) });
  const validateResources = (response: any, value: Draft) => {
    if (!isObject(response) || !sameId(response.site_id, value.siteId) || !sameId(response.service_offering_id, value.offeringId) || !Number.isInteger(response.revision) || response.revision < 0 || !['unconfigured', 'not_required', 'required'].includes(response.mode) || typeof response.compatible !== 'boolean') throw new Error('Resource availability did not match this booking. Check availability again.');
    if (response.mode === 'unconfigured' || !response.compatible) throw new Error(response.reason || 'The service resources are unavailable or need configuration. Choose another service or time.');
    return response;
  };
  useEffect(() => {
    const token = ++resourceSeq.current;
    setResources(null); setResourceError('');
    if (!draft || !bookingOpen || !draft.offeringId) { setResourceBusy(false); return; }
    setResourceBusy(true);
    void read('booking_resource_availability', resourceArgs(draft)).then(response => {
      const verified = validateResources(response, draft);
      if (alive.current && token === resourceSeq.current) setResources({ key: resourceKey, data: verified });
    }).catch(error => { if (alive.current && token === resourceSeq.current) setResourceError(message(error)); }).finally(() => { if (alive.current && token === resourceSeq.current) setResourceBusy(false); });
    return () => { resourceSeq.current++; };
  }, [resourceKey, bookingOpen, read]);

  const selectedVisitType = options?.visitTypes.find(type => sameId(type.id, draft?.visitTypeId));
  const chosenClinician = options?.clinicians.find(clinician => sameId(clinician.id, draft?.slot.clinician_id));
  const availableRooms = draft && options ? options.rooms.filter(room => room.kind === 'physical' && draft.slot.room_ids.some((id: any) => sameId(id, room.id))) : [];
  const requiresRoom = !!offering?.requires_room || !!(draft?.mode === 'reschedule' && draft.appointment?.room_id && draft.modality === 'in_person' && sameId(draft.siteId, draft.appointment.site_id));
  const videoAllowed = !!(draft && options?.video?.enabled === true && options.video.allowed_modalities?.includes('video') && array(options.video.visit_type_rules).some(rule => sameId(rule.visit_type_id, draft.visitTypeId) && rule.enabled === true && (rule.site_id === null || sameId(rule.site_id, draft.siteId))));
  const offeringIssue = (candidate: Data, value: Draft) => {
    if (candidate.visit_type_id && !sameId(candidate.visit_type_id, value.visitTypeId)) return 'Requires its configured visit type';
    if (Number(candidate.duration_minutes) !== durationOf(value.slot)) return `Requires ${candidate.duration_minutes} minutes`;
    if (!Array.isArray(candidate.eligible_clinician_ids) || !candidate.eligible_clinician_ids.some((id: any) => sameId(id, value.slot.clinician_id))) return 'Not available with this clinician';
    if (candidate.modality !== 'either' && candidate.modality !== value.modality) return `Requires ${words(candidate.modality)}`;
    if (candidate.requires_room && value.modality === 'in_person' && !value.roomId) return 'Choose an available room';
    return '';
  };
  const changeDraft = (patch: Partial<Draft>) => { setDraft(value => value ? { ...value, ...patch } : value); setFormError(''); setPreparedNotice(''); };
  const prepareBooking = async () => {
    if (!draft || formBusy || !canBook) return;
    const value = draft, requestedScope = scope;
    setFormBusy(true); setFormError('');
    try {
      if (!options || options.key !== optionsKey || optionsBusy || !chosenClinician || !selectedVisitType) throw new Error('Choose a verified clinician and an available visit type. Retry loading the booking choices if needed.');
      if (!value.patient?.id) throw new Error('Search for and choose a patient before continuing.');
      if (value.modality === 'video' && !videoAllowed) throw new Error('Video visits are not available for this location and visit type. Choose a supported format.');
      if (value.modality === 'in_person' && requiresRoom && !value.roomId) throw new Error('Choose an available room for this visit.');
      if (value.roomId && value.modality === 'in_person' && !availableRooms.some(room => sameId(room.id, value.roomId))) throw new Error('Choose a room returned for this available time.');
      if (value.offeringId && (!offering || offeringIssue(offering, value))) throw new Error(offering ? offeringIssue(offering, value) : 'The selected service is no longer available. Reload booking choices.');
      const day = localParts(value.slot.starts_at, value.timezone).date;
      const currentCalendar = await read('schedule_calendar', { site_id: value.siteId, date: day, period: 'day', duration_minutes: durationOf(value.slot) });
      const verifiedDay = validCalendar(currentCalendar, value.siteId, day, durationOf(value.slot));
      const currentSlot = verifiedDay.slots.find((slot: Data) => slotKey(slot) === slotKey(value.slot));
      if (!currentSlot || parseInstant(value.slot.starts_at) <= parseInstant(currentCalendar.as_of)) throw new Error('This time is no longer available. Refresh the calendar and choose another time.');
      if (value.modality === 'in_person' && value.roomId && !currentSlot.room_ids.some((id: any) => sameId(id, value.roomId))) throw new Error('The selected room is no longer available. Choose another room or time.');
      let revision: number | undefined;
      if (value.offeringId) revision = validateResources(await read('booking_resource_availability', resourceArgs(value)), value).revision;
      const args: Data = { starts_at: currentSlot.starts_at, ends_at: currentSlot.ends_at, site_id: value.siteId, booked_clinician_id: String(currentSlot.clinician_id), visit_type_id: value.visitTypeId, visit_modality: value.modality, request_key: crypto.randomUUID(), ...(value.modality === 'in_person' && value.roomId ? { room_id: value.roomId } : {}), ...(value.offeringId ? { service_offering_id: value.offeringId, expected_resource_revision: revision } : {}) };
      if (value.mode === 'book') {
        const patientResult = await read('lookup_patient', { id: String(value.patient.id) });
        if (!array(patientResult?.patients).some(patient => sameId(patient.id, value.patient!.id))) throw new Error('The selected patient could not be verified. Search for the patient again.');
        args.patient_id = String(value.patient.id); if (value.reason.trim()) args.reason = value.reason.trim();
      } else {
        const latest = (await read('get_appointment', { id: String(value.appointment?.id) }))?.appointment;
        if (!latest || !sameId(latest.id, value.appointment?.id) || latest.updated_at !== value.appointment?.updated_at || latest.status !== value.appointment?.status) throw new Error('The appointment changed while you were choosing a time. Reopen it and review the current record before rescheduling.');
        if (!['scheduled', 'confirmed'].includes(latest.status) || latest.encounter_id || parseInstant(latest.starts_at) <= parseInstant(currentCalendar.as_of)) throw new Error('Only an upcoming appointment that has not started can be rescheduled.');
        args.id = String(latest.id); args.expected_updated_at = latest.updated_at;
      }
      if (requestedScope !== currentScope.current || !alive.current) return;
      await callbacks.current.onPrepare(value.mode === 'book' ? 'book_appointment' : 'reschedule_appointment', args);
      if (alive.current && requestedScope === currentScope.current) { setBookingOpen(false); setPreparedNotice('The change is ready for review. Apply it in the review dialog to save it.'); }
    } catch (error) { if (alive.current && requestedScope === currentScope.current) setFormError(message(error)); }
    finally { if (alive.current && requestedScope === currentScope.current) setFormBusy(false); }
  };
  const prepareTransition = async () => {
    if (!detail || !transition || transitionBusy || !canTransition) return;
    const appointment = detail, target = transition, requestedScope = scope;
    setTransitionBusy(true); setDetailError('');
    try {
      if (target === 'cancelled' && !cancelAcknowledged) throw new Error('Acknowledge the cancellation message behavior before continuing.');
      const current = (await read('get_appointment', { id: String(appointment.id) }))?.appointment;
      if (!current || !sameId(current.id, appointment.id) || !sameId(current.site_id, siteId) || current.status !== appointment.status) throw new Error('The appointment changed. Refresh its details before preparing a status change.');
      if (!TRANSITIONS[current.status]?.includes(target)) throw new Error('This status change is no longer available.');
      if (['cancelled', 'no_show'].includes(target) && current.encounter_id) throw new Error('A visit has started. Review the encounter in the full clinic before changing this appointment.');
      if (target === 'completed' && current.encounter_id && !current.encounter_ended_at) throw new Error('Complete the encounter before completing its appointment.');
      await callbacks.current.onPrepare('transition_appointment', { id: String(current.id), to: target, expected_status: current.status, ...(target === 'cancelled' ? { cancellation_message_acknowledged: true } : {}) });
      if (alive.current && requestedScope === currentScope.current) { setDetail(null); setPreparedNotice('The status change is ready for review. Apply it in the review dialog to save it.'); }
    } catch (error) { if (alive.current && requestedScope === currentScope.current) setDetailError(message(error)); }
    finally { if (alive.current && requestedScope === currentScope.current) setTransitionBusy(false); }
  };
  const beginReschedule = () => {
    if (!detail || detailBusy || detailError) return;
    const minutes = durationOf(detail);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) { setDetailError('This appointment duration needs the full clinic rescheduling workflow. The calendar offers intervals of 5–240 minutes.'); return; }
    setDurationText(String(minutes)); setRescheduling(detail); setDetail(null); setShowAvailability(true); setClinicianId(''); setPreparedNotice('');
  };
  const rangeLabel = dates.length ? view === 'week' ? `${dateLabel(dates[0], { month: 'long', day: 'numeric' })} – ${dateLabel(dates[6], { month: 'long', day: 'numeric', year: 'numeric' })}` : dateLabel(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Choose a date';
  const draftRooms = draft?.modality === 'video' ? [] : availableRooms;
  const validResource = resources?.key === resourceKey ? resources.data : null;
  const detailClinician = detail?.clinician_name || clinicianName(detail?.booked_clinician_id);
  const transitionOptions = detail ? (TRANSITIONS[detail.status] || []).filter(target => !(target === 'no_show' && parseInstant(detail.starts_at) > businessTime) && !(['cancelled', 'no_show'].includes(target) && detail.encounter_id) && !(target === 'completed' && detail.encounter_id && !detail.encounter_ended_at)) : [];
  const invalidTimes = allAppointments.filter(appointment => !Number.isFinite(parseInstant(appointment.starts_at)) || !Number.isFinite(parseInstant(appointment.ends_at))).length;

  return <section className="scheduler" aria-label="Clinic calendar">
    <div className="scheduler-toolbar"><div><Typography component="h2" variant="h5">{rangeLabel}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{recordName(selectedSite, 'Choose a location')} · {data ? timezone : 'Time zone loads with the calendar'}</Typography></div><div className="scheduler-controls"><Button variant="outlined" disabled={loading || !validDay(date)} aria-label={`Previous ${view}`} onClick={() => setDate(shiftDay(date, view === 'week' ? -7 : -1))}>Previous</Button><Button disabled={loading} onClick={() => setDate(data ? localParts(data.asOf, data.timezone).date : initialDay)}>Today</Button><Button variant="outlined" disabled={loading || !validDay(date)} aria-label={`Next ${view}`} onClick={() => setDate(shiftDay(date, view === 'week' ? 7 : 1))}>Next</Button><ToggleButtonGroup exclusive size="small" value={view} onChange={(_event, next) => next && setView(next)} aria-label="Calendar view"><ToggleButton value="day">Day</ToggleButton><ToggleButton value="week">Week</ToggleButton></ToggleButtonGroup><Button variant="contained" disabled={!canBook || loading || !allSlots.length} onClick={() => { setSlotLimit(40); setSlotPicker(allSlots); }}>Choose booking time</Button></div></div>
    {preparedNotice && <Alert severity="info" sx={{ mb: 2 }} onClose={() => setPreparedNotice('')}>{preparedNotice}</Alert>}
    {rescheduling && <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => setRescheduling(null)}>Stop choosing</Button>}>Choose a new available time for {recordName(rescheduling.patient, 'the selected patient')}. The appointment stays at its recorded time until the reviewed change is applied.</Alert>}
    {draft && !bookingOpen && <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}><Typography variant="body2" color="text.secondary">An unsaved {draft.mode === 'book' ? 'booking' : 'reschedule'} is available.</Typography><Button onClick={() => { setBookingOpen(true); setPreparedNotice(''); }}>Resume form</Button><Button onClick={() => { setDraft(null); setPreparedNotice(''); }}>Discard form</Button></Stack>}
    <div className="scheduler-calendar"><div className="scheduler-filters"><TextField label="Location" select size="small" value={siteId} sx={{ minWidth: 190 }} onChange={event => setSiteId(event.target.value)} disabled={loading || formBusy}><MenuItem value=""><em>Choose a location</em></MenuItem>{unique([...sites, ...(currentSite ? [currentSite] : [])]).map(site => <MenuItem value={String(site.id)} key={String(site.id)}>{recordName(site, 'Location name not recorded')}</MenuItem>)}</TextField><TextField label="Date" type="date" size="small" value={date} onChange={event => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} disabled={loading} /><TextField label="Clinician" select size="small" sx={{ minWidth: 180 }} value={clinicianId} onChange={event => setClinicianId(event.target.value)} disabled={loading || !data}><MenuItem value="">All clinicians</MenuItem>{data?.clinicians.map(clinician => <MenuItem key={String(clinician.id)} value={String(clinician.id)}>{recordName(clinician, 'Clinician name not recorded')}</MenuItem>)}</TextField><TextField label="Visit length (minutes)" type="number" size="small" sx={{ width: 170 }} value={durationText} onChange={event => setDurationText(event.target.value)} slotProps={{ htmlInput: { min: 5, max: 240, step: 5 } }} disabled={loading || !!rescheduling} /><FormControlLabel control={<Switch checked={showAvailability} onChange={event => setShowAvailability(event.target.checked)} />} label="Show available times" /><Button disabled={loading || !siteId || !validDuration} onClick={() => setReload(value => value + 1)}>Refresh</Button></div>
      {!validDuration && <Alert severity="info" sx={{ m: 2 }}>Choose a whole number of minutes from 5 to 240 to load availability.</Alert>}
      {!validDay(date) && <Alert severity="info" sx={{ m: 2 }}>Choose a valid calendar date to load appointments and availability.</Alert>}
      {!siteId && <Box sx={{ p: 5, textAlign: 'center' }}><Typography>Choose a clinic location to load its calendar.</Typography></Box>}
      {loading && <Stack direction="row" spacing={2} sx={{ alignItems: 'center', p: 4 }} role="status"><CircularProgress size={24} /><Typography>Loading {view === 'week' ? 'seven days of recorded appointments and availability' : 'recorded appointments and availability'}…</Typography></Stack>}
      {calendarError && <Alert severity="error" sx={{ m: 2 }} action={<Button color="inherit" onClick={() => setReload(value => value + 1)}>Retry</Button>}>{calendarError}</Alert>}
      {data && <>
        {!!data.failures.length && <Alert severity="warning" sx={{ m: 2 }} action={<Button color="inherit" onClick={() => setReload(value => value + 1)}>Retry days</Button>}>Some days could not be loaded. {data.failures.map(failure => `${dateLabel(failure.date)}: ${failure.message}`).join(' ')}</Alert>}
        {!data.capacityConfigured && <Alert severity="info" sx={{ m: 2 }}>Availability rules are not configured for this location. Recorded appointments remain visible; blank times do not establish availability.</Alert>}
        {!!invalidTimes && <Alert severity="warning" sx={{ m: 2 }}>{invalidTimes} recorded appointments have unusable times. Review them in the appointment list below.</Alert>}
        <div className="scheduler-scroll"><div className="scheduler-grid" style={{ '--lane-count': lanes.length } as React.CSSProperties}>
          <div className="scheduler-column-title scheduler-time-title"><Typography variant="body2" color="text.secondary">Time</Typography></div>{lanes.map(lane => <div key={lane.key} className="scheduler-column-title"><Typography variant="subtitle2" sx={{ fontWeight: 650 }}>{lane.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{lane.day.loaded ? lane.subtitle : 'Unavailable'}</Typography></div>)}
          <div className="scheduler-time-axis" style={{ height: gridHeight }}>{Array.from({ length: (bounds.last - bounds.first) / 60 }, (_, index) => <div className="scheduler-time-label" key={index} style={{ top: index * 80 }}>{((bounds.first / 60 + index) % 12) || 12}:00 {bounds.first / 60 + index < 12 ? 'AM' : 'PM'}</div>)}</div>
          {lanes.map(lane => {
            const owned = (item: Data, field: string) => lane.dayLane ? sameId(item[field] || '', lane.clinician) || (!item[field] && !lane.clinician) : !lane.clinician || sameId(item[field], lane.clinician);
            const appointments = array(lane.day.appointments).filter(item => owned(item, 'booked_clinician_id'));
            const holds = array(lane.day.holds).filter(item => owned(item, 'clinician_id'));
            const events = tracks([...appointments.map(item => ({ ...item, kind: 'appointment' })), ...holds.map(item => ({ ...item, kind: 'hold' }))], lane.day.date, timezone);
            const slots = showAvailability ? allSlots.filter(slot => slot.date === lane.day.date && owned(slot, 'clinician_id')) : [];
            const groups = [...new Map(slots.map(slot => [String(parseInstant(slot.starts_at)), [] as Data[]])).entries()].map(([key]) => ({ key, items: slots.filter(slot => String(parseInstant(slot.starts_at)) === key) }));
            const eventLeft = showAvailability && slots.length ? 35 : 3, eventWidth = 100 - eventLeft - 3;
            return <div className="scheduler-lane" key={lane.key} style={{ height: gridHeight }} aria-label={`${lane.title} calendar`}>
              {!lane.day.loaded && <div className="scheduler-day-unavailable">This day could not be loaded.</div>}
              {groups.map(group => <ButtonBase className="scheduler-slot" key={group.key} disabled={!canBook || loading} style={{ top: (localParts(group.items[0].starts_at, timezone).minute - bounds.first) / 60 * 80, left: '3%', width: events.length ? '29%' : '92%', height: 30 }} aria-label={`Book ${dateLabel(lane.day.date)} at ${timeLabel(group.items[0].starts_at, timezone, true)}. ${group.items.length === 1 ? clinicianName(group.items[0].clinician_id) : `${group.items.length} clinicians available`}. ${duration} minutes.`} onClick={() => group.items.length === 1 ? chooseSlot(group.items[0]) : (setSlotLimit(40), setSlotPicker(group.items))}><span>{timeLabel(group.items[0].starts_at, timezone)} · Available{group.items.length > 1 ? ` (${group.items.length})` : ''}</span></ButtonBase>)}
              {events.map(event => {
                const item = event.item, style = { top: (event.start - bounds.first) / 60 * 80, height: Math.max(30, (event.end - event.start) / 60 * 80 - 3), left: `${eventLeft + eventWidth * event.track / event.count}%`, width: `calc(${eventWidth / event.count}% - 3px)` };
                if (item.kind === 'hold') return <div className="scheduler-hold" key={`hold:${item.id}`} style={style}><strong>Held time</strong><div>{timeLabel(item.starts_at, timezone)}–{timeLabel(item.ends_at, timezone)}</div>{item.patient_name && <div>{item.patient_name}</div>}<div>Expires {timeLabel(item.expires_at, timezone)}</div></div>;
                return <ButtonBase className={`scheduler-event ${item.status === 'cancelled' || item.status === 'no_show' ? 'cancelled' : ''} ${item.conflict ? 'conflict' : ''}`} key={`appointment:${item.id}`} style={style} onClick={() => void openAppointment(item)} aria-label={`Open ${recordName(item.patient, 'appointment')}, ${timeLabel(item.starts_at, timezone, true)}, ${words(item.status)}${item.conflict ? ', recorded schedule conflict' : ''}`}><span className="scheduler-event-title">{recordName(item.patient, 'Patient name not recorded')}</span><span className="scheduler-event-time">{timeLabel(item.starts_at, timezone)}–{timeLabel(item.ends_at, timezone)}</span><span className="scheduler-event-status">{words(item.calendar_status || item.status)}</span>{!lane.dayLane && <span>{item.clinician_name || clinicianName(item.booked_clinician_id)}</span>}{item.conflict && <span>Schedule conflict</span>}</ButtonBase>;
              })}
            </div>;
          })}
        </div></div>
        <div className="scheduler-calendar-footer"><span>Recorded appointments</span><span>Dashed times: backend availability</span><span>Held times remain reserved</span><span>Generated {fullTime(data.asOf, timezone)}</span>{!canBook && <span>This account cannot book appointments.</span>}</div>
        <div className="scheduler-agenda"><Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}><Typography component="h3" variant="h6">Appointments in this view</Typography><Typography variant="body2" color="text.secondary">{allAppointments.length} returned</Typography></Stack>{!allAppointments.length && <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>{data.failures.length ? 'No appointments were returned by the loaded days. Unavailable days are incomplete.' : 'No appointments are recorded for this view.'}</Typography>}{allAppointments.slice(0, showAllAgenda ? undefined : 12).map(appointment => <div className="scheduler-agenda-row" key={String(appointment.id)}><Box><Typography sx={{ fontWeight: 600 }}>{recordName(appointment.patient, 'Patient name not recorded')}</Typography><Typography variant="body2" color="text.secondary">{fullTime(appointment.starts_at, timezone)} · {appointment.clinician_name || clinicianName(appointment.booked_clinician_id)} · {words(appointment.status)}</Typography></Box><Button onClick={() => void openAppointment(appointment)}>Open appointment</Button></div>)}{allAppointments.length > 12 && <Button sx={{ mt: 1 }} onClick={() => setShowAllAgenda(value => !value)}>{showAllAgenda ? 'Show fewer' : `Show all ${allAppointments.length} appointments`}</Button>}</div>
      </>}
    </div>

    <Drawer anchor="right" open={!!detail} onClose={() => { if (!transitionBusy) { detailSeq.current++; setDetail(null); } }}><div className="scheduler-drawer-content">{detail && <><Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}><div><Typography component="h2" variant="h5">{recordName(detail.patient, 'Appointment details')}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{detail.patient?.reference || 'Patient reference not recorded'}</Typography></div><Button disabled={transitionBusy} onClick={() => { detailSeq.current++; setDetail(null); }}>Close</Button></Stack><Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 2, mb: 2 }}><Chip variant="outlined" label={words(detail.status)} />{detail.conflict && <Chip variant="outlined" label="Schedule conflict" />}{detailBusy && <CircularProgress size={18} />}</Stack>{detailError && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" disabled={detailBusy} onClick={() => void openAppointment(detail)}>Reload</Button>}>{detailError}</Alert>}<Details entries={[
      ['Starts', fullTime(detail.starts_at, timezone)], ['Ends', fullTime(detail.ends_at, timezone)], ['Location', recordName(selectedSite, 'Not recorded')], ['Clinician', detailClinician], ['Room', detail.room_name || detail.room_code || (detail.room_id ? roomName(detail.room_id) : 'Not assigned')], ['Visit type', detail.visit_type_name || detail.service_offering_snapshot?.name || options?.visitTypes.find(type => sameId(type.id, detail.visit_type_id))?.code || 'Not recorded'], ['Format', words(detail.visit_modality)], ['Reason', detail.reason], ['Encounter', detail.encounter_id ? words(detail.encounter_status || 'Started') : 'Not started'], ['Last changed', fullTime(detail.updated_at, timezone)],
    ]} /><Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', mt: 3 }}><Button variant="outlined" disabled={detailBusy || !!detailError || !canBook || !['scheduled', 'confirmed'].includes(detail.status) || !!detail.encounter_id || parseInstant(detail.starts_at) <= businessTime} onClick={beginReschedule}>Choose new time</Button><Button disabled={detailBusy || !!detailError} onClick={() => callbacks.current.onRecord(detail)}>Share with chat</Button><Button disabled={detailBusy} onClick={() => void openAppointment(detail)}>Refresh details</Button></Stack>{detail.needs_setup && <Alert severity="info" sx={{ mt: 2 }}>This appointment needs setup: {array(detail.setup_missing).length ? detail.setup_missing.join(', ') : Array.isArray(detail.setup_missing) ? detail.setup_missing.map(words).join(', ') : 'review in the full clinic'}.</Alert>}
      {canTransition && transitionOptions.length > 0 && <Box sx={{ mt: 4 }}><Typography component="h3" variant="h6" sx={{ mb: 2 }}>Update status</Typography><TextField select fullWidth label="Next status" value={transition} onChange={event => { setTransition(event.target.value); setCancelAcknowledged(false); }} disabled={detailBusy || transitionBusy || !!detailError}><MenuItem value=""><em>Choose a status</em></MenuItem>{transitionOptions.map(status => <MenuItem key={status} value={status}>{words(status)}</MenuItem>)}</TextField>{transition === 'cancelled' && <FormControlLabel sx={{ mt: 2, alignItems: 'flex-start' }} control={<Checkbox checked={cancelAcknowledged} onChange={event => setCancelAcknowledged(event.target.checked)} />} label="I understand that cancelling does not send a patient message automatically." />}<Button variant="contained" sx={{ mt: 2 }} disabled={detailBusy || transitionBusy || !!detailError || !transition || (transition === 'cancelled' && !cancelAcknowledged)} onClick={() => void prepareTransition()}>{transitionBusy ? 'Preparing review…' : 'Review status change'}</Button></Box>}
    </>}</div></Drawer>

    <Dialog open={slotPicker !== null} onClose={() => setSlotPicker(null)} fullWidth maxWidth="md" aria-labelledby="scheduler-slot-title"><DialogTitle id="scheduler-slot-title">{rescheduling ? 'Choose a new appointment time' : 'Choose an available appointment time'}</DialogTitle><DialogContent dividers><Typography variant="body2" color="text.secondary" className="scheduler-picker-intro">{duration}-minute intervals · {recordName(selectedSite, 'Selected location')} · {timezone}. Availability is checked again before review and when the server saves the appointment.</Typography><div className="scheduler-slot-list">{slotPicker?.slice(0, slotLimit).map(slot => <ButtonBase className="scheduler-slot-choice" key={slotKey(slot)} onClick={() => chooseSlot(slot)} disabled={!canBook || loading || parseInstant(slot.starts_at) <= businessTime}><Typography sx={{ fontWeight: 650 }}>{dateLabel(slot.date)} · {timeLabel(slot.starts_at, timezone, true)}</Typography><Typography variant="body2" sx={{ mt: 0.5 }}>{clinicianName(slot.clinician_id)}</Typography><Typography variant="body2" color="text.secondary">Until {timeLabel(slot.ends_at, timezone)} · {slot.room_ids.length} rooms available</Typography></ButtonBase>)}</div>{!slotPicker?.length && <Typography color="text.secondary">No available times were returned for this view. Change the date, clinician, or visit length.</Typography>}{slotPicker && slotPicker.length > slotLimit && <Button sx={{ mt: 2 }} onClick={() => setSlotLimit(limit => limit + 40)}>Show more times ({slotPicker.length - slotLimit} remaining)</Button>}</DialogContent><DialogActions><Button onClick={() => setSlotPicker(null)}>Close</Button></DialogActions></Dialog>

    <Dialog open={bookingOpen && !!draft} onClose={() => !formBusy && setBookingOpen(false)} fullWidth maxWidth="md" aria-labelledby="scheduler-book-title"><DialogTitle id="scheduler-book-title">{draft?.mode === 'reschedule' ? 'Reschedule appointment' : 'Book appointment'}</DialogTitle><DialogContent dividers>{draft && <Stack spacing={3}><Details entries={[
      ['Location', recordName(selectedSite, 'Not recorded')], ['Starts', fullTime(draft.slot.starts_at, draft.timezone)], ['Ends', fullTime(draft.slot.ends_at, draft.timezone)], ['Duration', `${durationOf(draft.slot)} minutes`], ['Clinician', recordName(chosenClinician, clinicianName(draft.slot.clinician_id))], ...(draft.mode === 'reschedule' ? [['Original time', fullTime(draft.appointment?.starts_at, draft.timezone)] as [string, any]] : []),
    ]} />{optionsBusy && <Stack direction="row" spacing={1} role="status" sx={{ alignItems: 'center' }}><CircularProgress size={18} /><Typography variant="body2">Loading clinic booking choices…</Typography></Stack>}{!!options?.issues.length && <Alert severity="warning" action={<Button color="inherit" disabled={optionsBusy} onClick={() => setOptionsReload(value => value + 1)}>Retry choices</Button>}>{options.issues.join(' ')}</Alert>}{formError && <Alert severity="error">{formError}</Alert>}
      <div className="scheduler-booking-fields">{draft.mode === 'book' ? <Autocomplete className="scheduler-booking-wide" options={unique([...(draft.patient ? [draft.patient] : []), ...patients])} value={draft.patient} inputValue={patientQuery} loading={patientBusy} disabled={formBusy} isOptionEqualToValue={(option, value) => sameId(option.id, value.id)} getOptionLabel={option => `${recordName(option, 'Patient name not recorded')}${option.reference ? ` · ${option.reference}` : ''}`} onInputChange={(_event, value, reason) => { if (reason === 'input' || reason === 'clear') { setPatientQuery(value); if (reason === 'input') changeDraft({ patient: null }); } }} onChange={(_event, value) => { changeDraft({ patient: value }); setPatientQuery(value ? `${recordName(value)}${value.reference ? ` · ${value.reference}` : ''}` : ''); }} noOptionsText={patientQuery.trim().length < 2 ? 'Enter at least two characters to search' : patientError || 'No patients matched this name'} renderInput={params => <TextField {...params} label="Patient" required helperText={patientError || 'Search recorded patient names, then choose the matching reference.'} error={!!patientError} />} /> : <TextField className="scheduler-booking-wide" label="Patient" fullWidth value={`${recordName(draft.patient, 'Patient name not recorded')}${draft.patient?.reference ? ` · ${draft.patient.reference}` : ''}`} slotProps={{ input: { readOnly: true } }} />}
        <TextField select fullWidth label="Visit type" required value={draft.visitTypeId} disabled={formBusy || optionsBusy} onChange={event => changeDraft({ visitTypeId: event.target.value, offeringId: draft.mode === 'reschedule' && draft.appointment?.service_offering_id ? draft.offeringId : '' })}><MenuItem value=""><em>Choose a visit type</em></MenuItem>{options?.visitTypes.map(type => <MenuItem key={String(type.id)} value={String(type.id)}>{words(type.code || type.name)}</MenuItem>)}</TextField>
        <TextField select fullWidth label="Visit format" value={draft.modality} disabled={formBusy || optionsBusy} onChange={event => changeDraft({ modality: event.target.value as Draft['modality'], roomId: event.target.value === 'video' ? '' : draft.roomId })}><MenuItem value="in_person">In person</MenuItem><MenuItem value="video" disabled={!videoAllowed}>Video{!videoAllowed ? ' · unavailable for this visit type' : ''}</MenuItem></TextField>
        <TextField className="scheduler-booking-wide" select fullWidth label="Service offering" value={draft.offeringId} disabled={formBusy || optionsBusy} helperText="Published services use their recorded duration, clinician, visit type, format, and resource requirements." onChange={event => { const selected = options?.offerings.find(item => sameId(item.id, event.target.value)); changeDraft({ offeringId: event.target.value, ...(selected?.visit_type_id ? { visitTypeId: String(selected.visit_type_id) } : {}), ...(selected?.modality === 'in_person' || selected?.modality === 'video' ? { modality: selected.modality, ...(selected.modality === 'video' ? { roomId: '' } : {}) } : {}) }); }}>
          {!(draft.mode === 'reschedule' && draft.appointment?.service_offering_id) && <MenuItem value="">Visit-type booking (no service offering)</MenuItem>}{options?.offerings.map(item => { const durationMismatch = Number(item.duration_minutes) !== durationOf(draft.slot), providerMismatch = !item.eligible_clinician_ids?.some((id: any) => sameId(id, draft.slot.clinician_id)); return <MenuItem key={String(item.id)} value={String(item.id)} disabled={durationMismatch || providerMismatch}>{recordName(item)} · {item.duration_minutes} min{durationMismatch ? ' · change calendar visit length' : providerMismatch ? ' · another clinician required' : ''}</MenuItem>; })}
        </TextField>
        <TextField select fullWidth label="Room" value={draft.roomId} required={draft.modality === 'in_person' && requiresRoom} disabled={formBusy || optionsBusy || draft.modality === 'video'} helperText={draft.modality === 'video' ? 'Video visits use no physical room.' : 'Only rooms returned for this interval are offered.'} onChange={event => changeDraft({ roomId: event.target.value })}>{!requiresRoom && <MenuItem value="">No room selected</MenuItem>}{requiresRoom && !draft.roomId && <MenuItem value=""><em>Choose an available room</em></MenuItem>}{draftRooms.map(room => <MenuItem key={String(room.id)} value={String(room.id)}>{recordName(room, 'Room name not recorded')}</MenuItem>)}</TextField>
        <TextField label="Clinician" fullWidth value={recordName(chosenClinician, clinicianName(draft.slot.clinician_id))} slotProps={{ input: { readOnly: true } }} helperText="The clinician belongs to the selected available time." />
        {draft.mode === 'book' && <TextField className="scheduler-booking-wide" label="Visit reason" value={draft.reason} onChange={event => changeDraft({ reason: event.target.value })} multiline minRows={3} fullWidth disabled={formBusy} slotProps={{ htmlInput: { maxLength: 500 } }} helperText="Optional · up to 500 characters" />}
      </div>
      {draft.offeringId && <Box>{resourceBusy && <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><CircularProgress size={18} /><Typography variant="body2">Checking service resources…</Typography></Stack>}{resourceError && <Alert severity="warning" action={<Button color="inherit" disabled={resourceBusy} onClick={() => setResourceReload(value => value + 1)}>Check again</Button>}>{resourceError}</Alert>}{validResource && <><Typography variant="subtitle2">{validResource.mode === 'not_required' ? 'This service requires no chair or equipment reservation.' : 'Required resources are available for this interval.'}</Typography><Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>{[...array(validResource.chairs), ...array(validResource.equipment)].map(resource => <Chip key={String(resource.id)} variant="outlined" label={`${resource.name} · ${resource.available ? 'Available' : 'Unavailable'}`} />)}</Stack></>}</Box>}
      <Typography variant="body2" color="text.secondary">Review prepares the exact request. Availability and permissions are checked by the server when you apply it; preparation does not reserve a time.</Typography>
    </Stack>}</DialogContent><DialogActions><Button disabled={formBusy} onClick={() => setBookingOpen(false)}>Keep form for later</Button><Button disabled={formBusy} onClick={() => { setDraft(null); setBookingOpen(false); setFormError(''); }}>Discard form</Button><Button variant="contained" disabled={formBusy || optionsBusy || !canBook || !draft?.patient || !chosenClinician || !selectedVisitType || !!(draft?.offeringId && (!validResource || resourceBusy || resourceError))} onClick={() => void prepareBooking()}>{formBusy ? 'Checking and preparing…' : 'Review appointment'}</Button></DialogActions></Dialog>
  </section>;
}
