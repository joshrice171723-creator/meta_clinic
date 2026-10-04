import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api, ApiError } from "../../api/client";
import type { Patient } from "../../api/contracts";
import { businessTimeAfter } from "../../shared/businessDate";
import { useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { useClinicNavigation } from "./clinicNavigation";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";
import { WaitlistAvailability } from "./WaitlistAvailability";
import { ClinicEmptyState } from "./ClinicEmptyState";
import { WeeklyCapacityRules } from "./WeeklyCapacityRules";
import type {
  OperationalPolicyResponse,
  RecordedBlockCategory,
} from "./operationalPolicyContracts";

type Option = { id: number; name: string };
export type WaitlistItem = {
  id: number;
  patient_id: number;
  patient_name: string;
  site_id: number;
  site_name: string;
  clinician_id: number;
  clinician_name: string;
  visit_type_id: number;
  visit_type_name: string;
  earliest_at: string;
  latest_at: string;
  duration_minutes: number;
  state: string;
  version: number;
  reason?: string;
  offer_starts_at: string | null;
  offer_ends_at: string | null;
  offer_expires_at: string | null;
  appointment_id: number | null;
};
type Queue = {
  entries: WaitlistItem[];
  total: number;
  ranking: string;
  sites: (Option & { available_visit_type_ids: number[] })[];
  clinicians: Option[];
  visit_types: Option[];
  cancellations: {
    id: number;
    status: "cancelled" | "no_show";
    site_id: number;
    clinician_id: number;
    starts_at: string;
    ends_at: string;
  }[];
};
type SiteAvailability = {
  site_id: number;
  site_name: string;
  timezone: string;
  operating_hours: {
    day_of_week: number;
    closed: boolean;
    open_time: string | null;
    close_time: string | null;
  }[];
  hour_exceptions: {
    date: string;
    closed: boolean;
    open_time: string | null;
    close_time: string | null;
    reason: string | null;
  }[];
};
type Rule = {
  id: number;
  site_id: number;
  clinician_id: number;
  kind: string;
  weekday: number | null;
  start_minute: number | null;
  end_minute: number | null;
  starts_at: string | null;
  ends_at: string | null;
  reason: string;
  version: number;
  reason_category?: RecordedBlockCategory;
};
type AffectedAppointment = {
  id: number;
  site_id: number;
  starts_at: string;
  ends_at: string;
  status: string;
};
type Attempt = { path: string; body: unknown; label?: string };
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
function localInput(value: string) {
  const date = new Date(value);
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
function localDatePart(value: string) {
  return value.slice(0, 10);
}
function localTimePart(value: string) {
  return value.slice(11, 16);
}

function displayWaitlistTime(value: string) {
  const time = new Date(value);
  if (Number.isNaN(time.valueOf())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(time);
}

export function WaitlistWorkspace() {
  const { capabilities } = useClinic();
  const { registerBlocker } = useClinicNavigation();
  const queue = useResource<Queue>("/api/clinic/waitlist");
  const capacity = useResource<{
    rules: Rule[];
    timezone: string;
    site_availability: SiteAvailability[];
    can_block: boolean;
  }>("/api/clinic/capacity");
  const [patientQuery, setPatientQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [site, setSite] = useState("");
  const policy = useResource<OperationalPolicyResponse>(
    `/api/clinic/facilities/${site}/operational_policy`,
    { enabled: site !== "" && capabilities.facilities_write === true },
  );
  const currentPolicy =
    policy.data?.policy.site_id === Number(site)
      ? policy.data.policy
      : undefined;
  const [categoryChoice, setCategoryChoice] = useState<{
    site: string;
    revision: number;
    key: string;
  } | null>(null);
  const categoryKey =
    currentPolicy &&
    categoryChoice &&
    categoryChoice.site === site &&
    categoryChoice.revision === currentPolicy.revision &&
    currentPolicy.block_categories.some(
      (entry) => entry.key === categoryChoice.key,
    )
      ? categoryChoice.key
      : "";
  const categoryRequired = (currentPolicy?.block_categories.length ?? 0) > 0;
  const blockPolicyReady =
    currentPolicy !== undefined &&
    !policy.error &&
    (!categoryRequired || categoryKey !== "");
  const [clinician, setClinician] = useState("");
  const [visitType, setVisitType] = useState("");
  const availableVisitTypes =
    queue.data?.visit_types.filter((type) =>
      queue.data?.sites
        .find((item) => String(item.id) === site)
        ?.available_visit_type_ids?.includes(type.id),
    ) ?? [];
  useEffect(() => {
    if (!uncertain) setVisitType("");
  }, [site]);
  const [earliest, setEarliest] = useState("");
  const [latest, setLatest] = useState("");
  const [duration, setDuration] = useState("30");
  const [reason, setReason] = useState("");
  const [offer, setOffer] = useState<{
    entry: WaitlistItem;
    startsDate: string;
    startsTime: string;
    expiresDate: string;
    expiresTime: string;
    startsAt?: string;
  } | null>(null);
  const offerHeading = useRef<HTMLHeadingElement>(null);
  const revealOffer = useRef(false);
  useEffect(() => {
    if (!revealOffer.current || !offerHeading.current) return;
    revealOffer.current = false;
    offerHeading.current.focus({ preventScroll: true });
    offerHeading.current.scrollIntoView({ block: "start" });
  }, [offer]);
  const [kind, setKind] = useState("weekly");
  const [weekday, setWeekday] = useState("1");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [capacityReason, setCapacityReason] = useState("");
  const capacityEditor = useRef<HTMLHeadingElement>(null);
  const revealCapacity = useRef(false);
  const [capacityDraftRevision, setCapacityDraftRevision] = useState(0);
  useEffect(() => {
    if (!revealCapacity.current || !capacityEditor.current) return;
    revealCapacity.current = false;
    capacityEditor.current.focus({ preventScroll: true });
    capacityEditor.current.scrollIntoView({ block: "center" });
  }, [capacityDraftRevision]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [affectedAppointments, setAffectedAppointments] = useState<
    AffectedAppointment[]
  >([]);
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  useEffect(() => {
    const warning = () =>
      attempt.current
        ? "A waitlist or capacity change is pending or unconfirmed. Retry the exact request before leaving."
        : null;
    const unregister = registerBlocker(warning, { preventNavigation: true });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const message = warning();
      if (!message) return;
      event.preventDefault();
      event.returnValue = message;
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [registerBlocker]);
  useDemoNavigationBlocker(() => ({
    blocked: attempt.current !== null,
    message: attempt.current
      ? "A waitlist or capacity change is pending or unconfirmed. Retry the exact request before leaving."
      : null,
  }));
  const canBook =
    capabilities.appointments_book === true ||
    capabilities.appointments === true;
  const disabled = busy || uncertain;

  useEffect(() => {
    // A fresh location/revision always requires a fresh explicit choice.
    // Uncertain mutations retain their original body independently of this draft.
    setCategoryChoice(null);
  }, [site, currentPolicy?.revision]);

  useEffect(() => {
    let active = true;
    if (patientQuery.trim().length < 2) {
      setPatients([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void api<{ patients: Patient[] }>(
        `/api/clinic/patients/lookup?q=${encodeURIComponent(patientQuery.trim())}&per_page=20`,
      )
        .then((value) => {
          if (active) setPatients(value.patients);
        })
        .catch((value) => {
          if (active) {
            setPatients([]);
            setError(
              value instanceof Error ? value.message : "Patient search failed.",
            );
          }
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [patientQuery]);

  async function submit(next: Attempt) {
    if (busy) return;
    const current = attempt.current ?? next;
    attempt.current = current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<{
        rule?: Rule;
        affected_appointments?: AffectedAppointment[];
      }>(current.path, { method: "POST", body: current.body });
      attempt.current = null;
      setUncertain(false);
      setOffer(null);
      const affected =
        current.path === "/api/clinic/capacity" && saved.rule?.kind === "block"
          ? (saved.affected_appointments ?? [])
          : [];
      setAffectedAppointments(affected);
      setNotice(
        affected.length > 0
          ? "Blocked time saved. Review the appointments that still overlap it."
          : `${current.label ? `${current.label}: saved` : "Saved"}. The queue is refreshing from the clinic records.`,
      );
      queue.refresh();
      capacity.refresh();
    } catch (value) {
      const unknown =
        uncertain ||
        !(value instanceof ApiError) ||
        value.status === 408 ||
        value.status >= 500 ||
        value.code === "outcome_unconfirmed";
      setUncertain(unknown);
      if (!unknown) {
        attempt.current = null;
        if (current.path === "/api/clinic/capacity") {
          policy.refresh();
          setCategoryChoice(null);
        }
      }
      setError(
        `${current.label ? `${current.label}: ` : ""}${value instanceof Error ? value.message : "The save outcome is unknown."}`,
      );
    } finally {
      setBusy(false);
    }
  }
  function transition(entry: WaitlistItem, action: string, extra = {}) {
    return submit({
      path: `/api/clinic/waitlist/${entry.id}/transition`,
      body: {
        waitlist: {
          action,
          expected_version: entry.version,
          request_key: crypto.randomUUID(),
          ...extra,
        },
      },
    });
  }
  function createEntry() {
    if (
      !patient ||
      !earliest ||
      !latest ||
      !availableVisitTypes.some((type) => String(type.id) === visitType)
    )
      return;
    void submit({
      path: "/api/clinic/waitlist",
      body: {
        waitlist: {
          patient_id: patient.id,
          site_id: site,
          clinician_id: clinician,
          visit_type_id: visitType,
          earliest_at: new Date(earliest).toISOString(),
          latest_at: new Date(latest).toISOString(),
          duration_minutes: duration,
          reason,
          request_key: crypto.randomUUID(),
        },
      },
    });
  }
  function createRule() {
    if (disabled || !site || !clinician) return;
    if (
      kind === "block" &&
      (!blockPolicyReady || !blockStart || !blockEnd || !capacityReason.trim())
    )
      return;
    const minutes = (value: string) => {
      const [hours, minute] = value.split(":").map(Number);
      return hours * 60 + minute;
    };
    const values =
      kind === "weekly"
        ? {
            weekday,
            start_minute: minutes(startTime),
            end_minute: minutes(endTime),
          }
        : {
            starts_at: new Date(blockStart).toISOString(),
            ends_at: new Date(blockEnd).toISOString(),
            reason_category_key: categoryKey || null,
            operational_policy_revision: currentPolicy!.revision,
          };
    void submit({
      path: "/api/clinic/capacity",
      label:
        kind === "weekly"
          ? `${days[Number(weekday)]} hours ${startTime}–${endTime}`
          : "Blocked time",
      body: {
        capacity: {
          site_id: site,
          clinician_id: clinician,
          kind,
          ...values,
          reason: capacityReason,
          request_key: crypto.randomUUID(),
        },
      },
    });
  }
  function chooseOffer(entry: WaitlistItem, starts = "") {
    const defaultExpiration = businessTimeAfter(4 * 3_600_000).valueOf();
    const expiration = starts
      ? Math.min(new Date(starts).valueOf(), defaultExpiration)
      : defaultExpiration;
    revealOffer.current = true;
    setOffer({
      entry,
      startsAt: starts || undefined,
      startsDate: starts ? localDatePart(localInput(starts)) : "",
      startsTime: starts ? localTimePart(localInput(starts)) : "",
      expiresDate: localDatePart(
        localInput(new Date(expiration).toISOString()),
      ),
      expiresTime: localTimePart(
        localInput(new Date(expiration).toISOString()),
      ),
    });
  }
  function deactivateRule(rule: Rule) {
    void submit({
      path: `/api/clinic/capacity/${rule.id}/deactivate`,
      label: `Deactivate rule #${rule.id}`,
      body: { capacity: { expected_version: rule.version } },
    });
  }
  function addWeeklyHours(siteId: number, clinicianId: number, day: number) {
    setSite(String(siteId));
    setClinician(String(clinicianId));
    setWeekday(String(day));
    setKind("weekly");
    revealCapacity.current = true;
    setCapacityDraftRevision((value) => value + 1);
  }
  const selector = (
    label: string,
    value: string,
    change: (value: string) => void,
    options: Option[],
  ) => (
    <TextField
      select
      size="small"
      fullWidth
      label={label}
      value={value}
      onChange={(event) => change(event.target.value)}
      disabled={disabled}
      sx={{ minWidth: 0 }}
      slotProps={{
        select: { displayEmpty: true },
        inputLabel: { shrink: true },
      }}
    >
      <MenuItem value="" disabled>
        Choose a {label.toLowerCase()}
      </MenuItem>
      {options.map((option) => (
        <MenuItem key={option.id} value={String(option.id)}>
          {option.name}
        </MenuItem>
      ))}
    </TextField>
  );
  return (
    <Stack spacing={2}>
      <Typography variant="h1" component="h1">
        Capacity and waitlist
      </Typography>
      <Typography color="text.secondary">
        Offer an opening to a waiting patient, hold it until the deadline, then
        book or release it. Expired offers stop holding capacity automatically.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {affectedAppointments.length > 0 && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" href="/clinic/schedule">
              Open schedule
            </Button>
          }
        >
          {affectedAppointments.length} existing appointment
          {affectedAppointments.length === 1 ? "" : "s"} remain scheduled inside
          this block. The block did not cancel or move them. Review appointment{" "}
          {affectedAppointments.map((item) => `#${item.id}`).join(", ")}.
        </Alert>
      )}
      {uncertain && (
        <Alert
          severity="warning"
          action={
            <Button
              disabled={busy}
              onClick={() => attempt.current && void submit(attempt.current)}
            >
              Retry same request
            </Button>
          }
        >
          The outcome is unconfirmed. Retry the same request before making
          another change.
        </Alert>
      )}
      {queue.error && (
        <Alert
          severity="error"
          action={<Button onClick={queue.refresh}>Retry</Button>}
        >
          {queue.error}
        </Alert>
      )}
      {!queue.data && !queue.error && (
        <Typography role="status">Loading waitlist…</Typography>
      )}
      {queue.data && (
        <>
          {queue.data.total > queue.data.entries.length && (
            <Alert severity="info">
              Showing the first {queue.data.entries.length} of{" "}
              {queue.data.total} entries.
            </Alert>
          )}
          <Typography variant="h6" component="h2">
            Waiting patients
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {queue.data.ranking}
          </Typography>
          {queue.data.entries.length === 0 && (
            <ClinicEmptyState
              title="No waiting patients"
              description="Waitlist requests and any available offers appear here."
            />
          )}
          {queue.data.cancellations.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Typography variant="h6" component="h2">
                  Released openings
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Cancelled and no-show appointments are available for matching
                  waitlist offers below.
                </Typography>
                {queue.data.cancellations.map((slot) => (
                  <Typography key={slot.id} variant="body2">
                    {slot.status === "no_show" ? "No-show" : "Cancelled"} ·{" "}
                    {displayWaitlistTime(slot.starts_at)} –{" "}
                    {displayWaitlistTime(slot.ends_at)}
                  </Typography>
                ))}
              </Stack>
            </Paper>
          )}
          {queue.data.entries.map((entry, rank) => (
            <Paper key={entry.id} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1}>
                  <Typography sx={{ flex: 1, fontWeight: 600 }}>
                    {rank + 1}. {entry.patient_name}
                  </Typography>
                  <Chip label={entry.state} size="small" />
                </Stack>
                <Typography>
                  {entry.site_name} · {entry.clinician_name} ·{" "}
                  {entry.visit_type_name} · {entry.duration_minutes} min
                </Typography>
                <Typography variant="body2">
                  Requested {displayWaitlistTime(entry.earliest_at)} –{" "}
                  {displayWaitlistTime(entry.latest_at)}
                </Typography>
                {entry.offer_starts_at && (
                  <Typography variant="body2">
                    Offer: {displayWaitlistTime(entry.offer_starts_at)} ·
                    expires{" "}
                    {entry.offer_expires_at &&
                      displayWaitlistTime(entry.offer_expires_at)}
                  </Typography>
                )}
                {canBook && (
                  <Stack
                    direction="row"
                    spacing={1}
                    useFlexGap
                    sx={{ flexWrap: "wrap" }}
                  >
                    {["waiting", "expired"].includes(entry.state) && (
                      <Button
                        variant="contained"
                        disabled={disabled}
                        onClick={() => chooseOffer(entry)}
                      >
                        Offer a time
                      </Button>
                    )}
                    {entry.state === "offered" && (
                      <>
                        <Button
                          variant="contained"
                          disabled={disabled}
                          onClick={() =>
                            void transition(entry, "accept", {
                              patient_accepted: true,
                            })
                          }
                        >
                          Record patient acceptance and book
                        </Button>
                        <Button
                          variant="outlined"
                          disabled={disabled}
                          onClick={() => void transition(entry, "release")}
                        >
                          Release offer
                        </Button>
                      </>
                    )}
                    {entry.state === "expired" && (
                      <Button
                        disabled={disabled}
                        onClick={() => void transition(entry, "requeue")}
                      >
                        Return to waiting
                      </Button>
                    )}
                    <Button
                      disabled={disabled}
                      color="error"
                      variant="outlined"
                      onClick={() => void transition(entry, "cancel")}
                    >
                      Remove from waitlist
                    </Button>
                  </Stack>
                )}
                {canBook && ["waiting", "expired"].includes(entry.state) && (
                  <WaitlistAvailability
                    key={`${entry.id}:${entry.version}`}
                    entry={entry}
                    disabled={disabled}
                    onChoose={(starts) => chooseOffer(entry, starts)}
                  />
                )}
                {canBook &&
                  ["waiting", "expired"].includes(entry.state) &&
                  queue.data?.cancellations
                    .filter(
                      (slot) =>
                        slot.site_id === entry.site_id &&
                        slot.clinician_id === entry.clinician_id &&
                        new Date(slot.starts_at) >=
                          new Date(entry.earliest_at) &&
                        new Date(slot.starts_at).valueOf() +
                          entry.duration_minutes * 60_000 <=
                          Math.min(
                            new Date(slot.ends_at).valueOf(),
                            new Date(entry.latest_at).valueOf(),
                          ),
                    )
                    .map((slot) => (
                      <Button
                        key={slot.id}
                        disabled={disabled}
                        variant="outlined"
                        onClick={() => chooseOffer(entry, slot.starts_at)}
                      >
                        Use{" "}
                        {slot.status === "no_show" ? "no-show" : "cancelled"}{" "}
                        opening: {displayWaitlistTime(slot.starts_at)}
                      </Button>
                    ))}
              </Stack>
            </Paper>
          ))}
          {offer && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Typography
                  ref={offerHeading}
                  component="h2"
                  variant="h6"
                  tabIndex={-1}
                  sx={{ scrollMarginBlock: 2 }}
                >
                  Offer to {offer.entry.patient_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Date and time fields use{" "}
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                </Typography>
                <TextField
                  type="date"
                  label="Offer date"
                  value={offer.startsDate}
                  disabled={disabled}
                  onChange={(event) =>
                    setOffer({
                      ...offer,
                      startsDate: event.target.value,
                      startsAt: undefined,
                    })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  type="time"
                  label="Offer time"
                  value={offer.startsTime}
                  disabled={disabled}
                  onChange={(event) =>
                    setOffer({
                      ...offer,
                      startsTime: event.target.value,
                      startsAt: undefined,
                    })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  type="date"
                  label="Accept-before date"
                  value={offer.expiresDate}
                  disabled={disabled}
                  onChange={(event) =>
                    setOffer({ ...offer, expiresDate: event.target.value })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  type="time"
                  label="Accept-before time"
                  value={offer.expiresTime}
                  disabled={disabled}
                  onChange={(event) =>
                    setOffer({ ...offer, expiresTime: event.target.value })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <Typography variant="body2">
                  The offer appears in the patient's portal. Staff can also
                  record the patient's acceptance. No email or text is sent by
                  this action. Accept before is the deadline for responding; it
                  must be after the current time and no later than the offered
                  start.
                </Typography>
                <Button
                  variant="contained"
                  disabled={
                    disabled ||
                    !offer.startsDate ||
                    !offer.startsTime ||
                    !offer.expiresDate ||
                    !offer.expiresTime
                  }
                  onClick={() =>
                    void transition(offer.entry, "offer", {
                      starts_at:
                        offer.startsAt ??
                        new Date(
                          `${offer.startsDate}T${offer.startsTime}`,
                        ).toISOString(),
                      expires_at: new Date(
                        `${offer.expiresDate}T${offer.expiresTime}`,
                      ).toISOString(),
                    })
                  }
                >
                  Hold time and publish offer
                </Button>
                <Button disabled={disabled} onClick={() => setOffer(null)}>
                  Cancel
                </Button>
              </Stack>
            </Paper>
          )}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Typography variant="h6" component="h2">
                Location and clinician
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Used when adding a waitlist request or capacity rule.
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "minmax(0, 1fr)",
                    sm: "repeat(2, minmax(0, 1fr))",
                  },
                  gap: 2,
                  maxWidth: 640,
                }}
              >
                {selector("Location", site, setSite, queue.data.sites)}
                {selector(
                  "Clinician",
                  clinician,
                  setClinician,
                  queue.data.clinicians,
                )}
              </Box>
            </Stack>
          </Paper>
          {canBook && (
            <Accordion
              disableGutters
              elevation={0}
              variant="outlined"
              slotProps={{
                heading: { component: "h2" },
                transition: { unmountOnExit: false },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                id="waitlist-add-header"
                aria-controls="waitlist-add-content"
                sx={{ minHeight: 44 }}
              >
                <Typography component="span" variant="h6">
                  Add a patient to the waitlist
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 2, pt: 0 }}>
                <Stack spacing={2}>
                  <Autocomplete
                    size="small"
                    options={patients}
                    value={patient}
                    onChange={(_, value) => setPatient(value)}
                    onInputChange={(_, value) => setPatientQuery(value)}
                    getOptionLabel={(item) =>
                      `${item.display_name} · ${item.reference}`
                    }
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    disabled={disabled}
                    renderInput={(params) => (
                      <TextField {...params} label="Find patient" />
                    )}
                  />
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "minmax(0, 1fr)",
                        sm: "repeat(2, minmax(0, 1fr))",
                        xl: "repeat(4, minmax(0, 1fr))",
                      },
                      gap: 2,
                    }}
                  >
                    {selector(
                      "Visit type",
                      visitType,
                      setVisitType,
                      availableVisitTypes,
                    )}
                    <TextField
                      size="small"
                      label="Duration (minutes)"
                      type="number"
                      value={duration}
                      disabled={disabled}
                      onChange={(event) => setDuration(event.target.value)}
                      slotProps={{ htmlInput: { min: 5, max: 240 } }}
                    />
                    <TextField
                      size="small"
                      label="Earliest time"
                      type="datetime-local"
                      value={earliest}
                      disabled={disabled}
                      onChange={(event) => setEarliest(event.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                    <TextField
                      size="small"
                      label="Latest end"
                      type="datetime-local"
                      value={latest}
                      disabled={disabled}
                      onChange={(event) => setLatest(event.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </Box>
                  <TextField
                    size="small"
                    label="Scheduling reason or preferences"
                    value={reason}
                    disabled={disabled}
                    onChange={(event) => setReason(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 500 } }}
                  />
                  <Button
                    variant="contained"
                    sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}
                    disabled={
                      disabled ||
                      !patient ||
                      !site ||
                      !clinician ||
                      !visitType ||
                      !availableVisitTypes.some(
                        (type) => String(type.id) === visitType,
                      ) ||
                      !earliest ||
                      !latest
                    }
                    onClick={createEntry}
                  >
                    Add to waitlist
                  </Button>
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Typography variant="h6" component="h2">
                Provider capacity
              </Typography>
              {capacity.error && (
                <Alert severity="error">{capacity.error}</Alert>
              )}
              <Typography variant="body2">
                Provider templates use{" "}
                {capacity.data?.timezone ?? "clinic time"} and site hours use
                each site's timezone. The server checks both before booking or
                offering a time. Blocks apply to the clinician across sites.
              </Typography>
              {capacity.data?.site_availability.map((siteAvailability) => (
                <Box key={siteAvailability.site_id}>
                  <Typography>
                    {siteAvailability.site_name} · {siteAvailability.timezone}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {siteAvailability.operating_hours.length === 0
                      ? "No site hours configured; provider capacity remains the active constraint."
                      : siteAvailability.operating_hours
                          .map((item) =>
                            item.closed
                              ? `${days[item.day_of_week]} closed`
                              : `${days[item.day_of_week]} ${item.open_time}–${item.close_time}`,
                          )
                          .join(" · ")}
                  </Typography>
                  {siteAvailability.hour_exceptions.map((item) => (
                    <Typography
                      key={item.date}
                      variant="body2"
                      color="text.secondary"
                    >
                      {item.date}:{" "}
                      {item.closed
                        ? "closed"
                        : `${item.open_time}–${item.close_time}`}{" "}
                      {item.reason || "schedule exception"}
                    </Typography>
                  ))}
                </Box>
              ))}
              {capacity.data && (
                <WeeklyCapacityRules
                  rules={capacity.data.rules}
                  sites={queue.data.sites}
                  clinicians={queue.data.clinicians}
                  canWrite={capabilities.facilities_write === true}
                  disabled={disabled}
                  onAdd={addWeeklyHours}
                  onDeactivate={deactivateRule}
                />
              )}
              {capacity.data?.rules
                .filter((rule) => rule.kind !== "weekly")
                .map((rule) => (
                  <Box key={rule.id}>
                    <Typography>
                      {
                        queue.data?.clinicians.find(
                          (item) => item.id === rule.clinician_id,
                        )?.name
                      }{" "}
                      ·{" "}
                      {
                        queue.data?.sites.find(
                          (item) => item.id === rule.site_id,
                        )?.name
                      }
                      :{" "}
                      {`${displayWaitlistTime(rule.starts_at!)} – ${displayWaitlistTime(rule.ends_at!)}`}{" "}
                      {rule.reason}
                    </Typography>
                    {rule.kind === "block" && (
                      <Typography variant="body2" color="text.secondary">
                        {rule.reason_category?.state === "recorded"
                          ? `Recorded category: ${rule.reason_category.label} · Policy revision ${rule.reason_category.policy_revision}`
                          : rule.reason_category?.state === "not_recorded"
                            ? "Structured category not recorded."
                            : "Recorded structured category unavailable."}
                      </Typography>
                    )}
                    {capabilities.facilities_write && (
                      <Button
                        disabled={disabled}
                        onClick={() => deactivateRule(rule)}
                      >
                        Deactivate rule
                      </Button>
                    )}
                  </Box>
                ))}
              {capabilities.facilities_write && (
                <>
                  <Typography
                    variant="subtitle1"
                    component="h3"
                    ref={capacityEditor}
                    tabIndex={-1}
                  >
                    New capacity rule
                  </Typography>
                  <TextField
                    select
                    size="small"
                    label="Rule type"
                    value={kind}
                    disabled={disabled}
                    onChange={(event) => setKind(event.target.value)}
                  >
                    <MenuItem value="weekly">Weekly hours</MenuItem>
                    <MenuItem
                      value="block"
                      disabled={!capacity.data?.can_block}
                    >
                      Blocked time
                    </MenuItem>
                  </TextField>
                  <Typography variant="body2">
                    {site && clinician ? (
                      <>
                        New rule for{" "}
                        {queue.data.sites.find(
                          (item) => item.id === Number(site),
                        )?.name ?? "Location unavailable"}{" "}
                        ·{" "}
                        {queue.data.clinicians.find(
                          (item) => item.id === Number(clinician),
                        )?.name ?? "Clinician unavailable"}
                        . Changes apply only after Save capacity rule.
                      </>
                    ) : (
                      "Choose a location and clinician above before saving a capacity rule."
                    )}
                  </Typography>
                  {kind === "weekly" ? (
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "minmax(0, 1fr)",
                          sm: "repeat(3, minmax(0, 1fr))",
                        },
                        gap: 2,
                        maxWidth: 720,
                      }}
                    >
                      <TextField
                        select
                        size="small"
                        label="Day"
                        value={weekday}
                        disabled={disabled}
                        onChange={(event) => setWeekday(event.target.value)}
                      >
                        {days.map((day, index) => (
                          <MenuItem key={day} value={String(index)}>
                            {day}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        size="small"
                        type="time"
                        label="Start"
                        value={startTime}
                        disabled={disabled}
                        onChange={(event) => setStartTime(event.target.value)}
                      />
                      <TextField
                        size="small"
                        type="time"
                        label="End"
                        value={endTime}
                        disabled={disabled}
                        onChange={(event) => setEndTime(event.target.value)}
                      />
                    </Box>
                  ) : (
                    <Stack spacing={2}>
                      <Alert severity="info">
                        A block prevents new bookings. Existing appointments
                        stay scheduled and must be reviewed separately after
                        saving.
                      </Alert>
                      {!site && (
                        <Typography>
                          Select a location to load its block categories.
                        </Typography>
                      )}
                      {site && policy.error && (
                        <Alert
                          severity="error"
                          action={
                            <Button
                              disabled={disabled}
                              onClick={policy.refresh}
                            >
                              Retry policy
                            </Button>
                          }
                        >
                          Block category policy unavailable: {policy.error} New
                          blocks require a successful policy read. Weekly hours
                          remain available.
                        </Alert>
                      )}
                      {site && !currentPolicy && !policy.error && (
                        <Typography role="status">
                          Loading block category policy…
                        </Typography>
                      )}
                      {currentPolicy && !policy.error && (
                        <>
                          <Typography variant="body2" color="text.secondary">
                            Location policy revision {currentPolicy.revision}
                          </Typography>
                          {categoryRequired ? (
                            <TextField
                              select
                              size="small"
                              label="Block reason category"
                              value={categoryKey}
                              disabled={disabled}
                              onChange={(event) =>
                                setCategoryChoice({
                                  site,
                                  revision: currentPolicy.revision,
                                  key: event.target.value,
                                })
                              }
                              helperText="Choose a configured category explicitly. A site or policy revision change clears the choice."
                            >
                              <MenuItem value="">Choose category</MenuItem>
                              {currentPolicy.block_categories.map((entry) => (
                                <MenuItem key={entry.key} value={entry.key}>
                                  {entry.label}
                                </MenuItem>
                              ))}
                            </TextField>
                          ) : (
                            <Typography variant="body2">
                              No structured block categories configured. The
                              free-text reason remains required.
                            </Typography>
                          )}
                        </>
                      )}
                      <TextField
                        size="small"
                        type="datetime-local"
                        label="Block starts"
                        value={blockStart}
                        disabled={disabled}
                        onChange={(event) => setBlockStart(event.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <TextField
                        size="small"
                        type="datetime-local"
                        label="Block ends"
                        value={blockEnd}
                        disabled={disabled}
                        onChange={(event) => setBlockEnd(event.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    </Stack>
                  )}
                  <TextField
                    size="small"
                    label="Capacity reason"
                    value={capacityReason}
                    disabled={disabled}
                    onChange={(event) => setCapacityReason(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 500 } }}
                  />
                  <Button
                    variant="contained"
                    sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}
                    disabled={
                      disabled ||
                      !site ||
                      !clinician ||
                      (kind === "block" &&
                        (!capacity.data?.can_block ||
                          !blockPolicyReady ||
                          !blockStart ||
                          !blockEnd ||
                          !capacityReason.trim()))
                    }
                    onClick={createRule}
                  >
                    Save capacity rule
                  </Button>
                </>
              )}
            </Stack>
          </Paper>
        </>
      )}
    </Stack>
  );
}
