import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Paper,
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
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api, ApiError, formBody } from "../../api/client";
import type {
  Encounter,
  Pagination,
  Patient,
  PatientActivityHistory,
} from "../../api/contracts";
import {
  Card,
  createdPath,
  Field,
  LoadState,
  Pager,
  useResource,
} from "../../shared/ui";
import { PatientSupport } from "./CareFlow";
import { PatientClinicalHistory } from "./PatientClinicalHistory";
import { PatientCareCoordination } from "./PatientCareCoordination";
import { IntakeConsentEvidence } from "./IntakeConsentEvidence";
import { useClinic } from "./Workspace";
import { useClinicNavigation } from "./clinicNavigation";
import { patientReferenceLabel } from "./patientReference";
import { PatientLabReports } from "./PatientLabReports";
import { useWorkingDraft } from "./useWorkingDraft";

type LegacyNote = {
  id: number;
  body: string;
  author_id: number;
  created_at: string;
};

function currentPage() {
  if (typeof window === "undefined") return 1;
  const page = Number(new URLSearchParams(window.location.search).get("page"));
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function Patients({ id }: { id?: string }) {
  const clinic = useClinic();
  const page = currentPage();
  const { data, error, refresh } = useResource<{
    patients?: Patient[];
    patient?: Patient;
    activity_history?: PatientActivityHistory;
    notes?: LegacyNote[];
    pagination?: Pagination;
  }>(`/api/clinic/patients${id ? `/${id}` : `?page=${page}`}`);
  if (!data) return <LoadState error={error} />;
  if (data.patient)
    return (
      <PatientRecord
        canInvitePortal={clinic.capabilities.patient_portal_invite === true}
        key={data.patient.id}
        canEditRegistration={clinic.capabilities.patients_write}
        notes={data.notes}
        onRegistrationSaved={refresh}
        patient={data.patient}
        activityHistory={data.activity_history}
      />
    );
  return (
    <>
      <p className="eyebrow">PATIENTS</p>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
      >
        <h1>Patient directory</h1>
        {clinic.capabilities.patients_write && (
          <Button component="a" href="/clinic/patients/new" variant="contained">
            Register patient
          </Button>
        )}
      </Stack>
      <a className="text-link" href="/clinic">
        Return to tracking board →
      </a>
      <Card title="Patient directory">
        {clinic.capabilities.patient_identity_read === true && (
          <>
            <PatientLookup />
            <Divider sx={{ my: 3 }} />
            <Typography component="h2" variant="h6" sx={{ mb: 0.5 }}>
              All patients
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Browse the patients registered at this location.
            </Typography>
          </>
        )}
        {data.patients?.length === 0 ? (
          <p>No patients are registered at this location yet.</p>
        ) : (
          <div className="clinic-table-wrap">
            <table className="care-table">
              <caption className="sr-only">
                Patients registered at this location
              </caption>
              <thead>
                <tr>
                  <th scope="col">Patient</th>
                  <th scope="col">Clinic reference</th>
                  <th scope="col">Date of birth</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Record</th>
                </tr>
              </thead>
              <tbody>
                {data.patients?.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.display_name}</strong>
                    </td>
                    <td>
                      {patientReferenceLabel(p.reference) ?? "Not recorded"}
                    </td>
                    <td>{p.date_of_birth ?? "Not recorded"}</td>
                    <td>{p.phone_hint ?? "Not recorded"}</td>
                    <td>
                      <a href={`/clinic/patients/${p.id}`}>Open patient</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.pagination && (
          <Pager
            page={data.pagination.page}
            total={data.pagination.total}
            size={data.pagination.per_page}
            path="/clinic/patients"
          />
        )}
      </Card>
    </>
  );
}

export function PatientRegistrationPage() {
  const clinic = useClinic();

  return (
    <>
      <p className="eyebrow">PATIENTS</p>
      <Stack spacing={1} sx={{ mb: 3 }}>
        <h1>Register a patient</h1>
        <Box
          sx={{
            backgroundColor: "primary.main",
            borderRadius: 2,
            color: "primary.contrastText",
            maxWidth: 760,
            p: { sm: 2.5, xs: 2 },
          }}
        >
          <Typography sx={{ fontWeight: 700 }}>Guided registration</Typography>
          <Typography variant="body2">
            Complete and save each section before continuing. The patient record
            is created only when you finish registration.
          </Typography>
        </Box>
        <a className="text-link" href="/clinic/patients">
          Return to patient directory
        </a>
      </Stack>
      {clinic.capabilities.patients_write ? (
        <Box sx={{ maxWidth: 960, minWidth: 0 }}>
          <Card title="Patient registration">
            <PatientRegistrationForm
              onSuccess={createdPath("/clinic/patients")}
            />
          </Card>
        </Box>
      ) : (
        <Alert severity="error">
          You do not have permission to register a patient.
        </Alert>
      )}
    </>
  );
}

function PatientLookup() {
  const [query, setQuery] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const normalizedQuery = query.trim();
  const phoneDigits = phone.replace(/\D/g, "");
  const validName = normalizedQuery.length >= 2;
  const validDob = /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth);
  const validPhone = phoneDigits.length >= 7 && phoneDigits.length <= 15;
  const canSearch = validName || validDob || validPhone;
  const search = new URLSearchParams();
  if (validName) search.set("q", normalizedQuery);
  if (validDob) search.set("date_of_birth", dateOfBirth);
  if (validPhone) search.set("phone", phoneDigits);
  const signature = search.toString();
  const lookupQuery =
    canSearch && debouncedSearch === signature ? signature : null;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(signature), 300);
    return () => window.clearTimeout(timer);
  }, [signature]);

  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography component="h2" variant="h6" sx={{ mb: 0.5 }}>
          Find an existing patient
        </Typography>
        <Typography color="text.secondary">
          Search by name or clinic reference, birth date, or phone number.
        </Typography>
      </Box>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            lg: "minmax(0, 1.7fr) minmax(11rem, 0.8fr) minmax(13rem, 1fr)",
            md: "repeat(2, minmax(0, 1fr))",
            xs: "1fr",
          },
        }}
      >
        <TextField
          fullWidth
          label="Patient name or clinic reference"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          slotProps={{
            htmlInput: { maxLength: 100 },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon aria-hidden="true" />
                </InputAdornment>
              ),
            },
          }}
          helperText="At least 2 characters"
        />
        <TextField
          fullWidth
          label="Date of birth"
          type="date"
          value={dateOfBirth}
          onChange={(event) => setDateOfBirth(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          fullWidth
          label="Phone number"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          slotProps={{ htmlInput: { inputMode: "tel", maxLength: 24 } }}
          helperText="Use the complete number on the patient record"
        />
      </Box>
      {!canSearch && (normalizedQuery.length > 0 || dateOfBirth || phone) && (
        <Typography color="text.secondary" role="status">
          Enter at least 2 name/reference characters, a complete birth date, or
          a complete phone number.
        </Typography>
      )}
      {canSearch && !lookupQuery && (
        <Typography color="text.secondary" role="status">
          Updating search…
        </Typography>
      )}
      {lookupQuery && <PatientLookupResults search={lookupQuery} />}
    </Stack>
  );
}

function PatientLookupResults({ search }: { search: string }) {
  const lookup = useResource<{ patients: Patient[]; pagination: Pagination }>(
    `/api/clinic/patients/lookup?${search}&page=1&per_page=25`,
  );

  if (!lookup.data && !lookup.error)
    return (
      <Typography color="text.secondary" role="status">
        Finding matching patients…
      </Typography>
    );
  if (lookup.error)
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" onClick={lookup.refresh} size="small">
            Retry
          </Button>
        }
      >
        {lookup.error}
      </Alert>
    );
  if (!lookup.data?.patients.length)
    return (
      <Typography color="text.secondary">
        No matching patients were found. You can still register a new patient
        below.
      </Typography>
    );

  const data = lookup.data;

  return (
    <Stack
      component="ul"
      spacing={1}
      sx={{ listStyle: "none", m: 0, p: 0 }}
      aria-label="Matching patients"
    >
      {data.patients.map((patient) => (
        <Box
          component="li"
          key={patient.id}
          sx={{
            alignItems: { sm: "center" },
            border: "1px solid",
            borderColor: "divider",
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            gap: 1,
            justifyContent: "space-between",
            p: 1.5,
          }}
        >
          <Box>
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ alignItems: "center", flexWrap: "wrap" }}
            >
              <Typography sx={{ fontWeight: 600 }}>
                {patient.display_name}
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                color={data.pagination.total > 1 ? "warning" : "default"}
                label={
                  data.pagination.total > 1
                    ? "Possible duplicate"
                    : "Candidate match"
                }
              />
            </Stack>
            <Typography color="text.secondary" variant="body2">
              Clinic reference:{" "}
              {patientReferenceLabel(patient.reference) ?? "Not recorded"}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Date of birth: {patient.date_of_birth || "Not recorded"} · Phone:{" "}
              {patient.phone_hint || "Not recorded"}
            </Typography>
            {data.pagination.total > 1 && (
              <Typography color="warning.main" variant="caption">
                Compare the identity details before opening or registering
                another record.
              </Typography>
            )}
          </Box>
          <Button
            component="a"
            href={`/clinic/patients/${patient.id}`}
            variant="outlined"
          >
            Open patient
          </Button>
        </Box>
      ))}
      {data.pagination.total > data.patients.length && (
        <Box component="li">
          <Typography color="text.secondary" variant="body2">
            More than 25 matches were found. Use a more specific name or clinic
            reference.
          </Typography>
        </Box>
      )}
    </Stack>
  );
}

function PatientRecord({
  canEditRegistration,
  canInvitePortal,
  notes,
  onRegistrationSaved,
  patient,
  activityHistory,
}: {
  canEditRegistration: boolean;
  canInvitePortal: boolean;
  notes?: LegacyNote[];
  onRegistrationSaved: () => void;
  patient: Patient;
  activityHistory?: PatientActivityHistory;
}) {
  const { registerBlocker } = useClinicNavigation();
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationDirty, setRegistrationDirty] = useState(false);
  const [discardPending, setDiscardPending] = useState(false);
  const registrationDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!registrationOpen || !registrationDirty) return;
    const unregister = registerBlocker(
      () => "Unsaved registration changes will be lost. Leave this patient?",
    );
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [registerBlocker, registrationDirty, registrationOpen]);
  const closeRegistration = () => {
    if (registrationDialogRef.current?.querySelector("fieldset[disabled]"))
      return;
    if (registrationDirty) setDiscardPending(true);
    else setRegistrationOpen(false);
  };
  const reference = patientReferenceLabel(patient.reference);
  return (
    <>
      <a href="/clinic/patients">← Patients</a>
      <h1>{patient.display_name}</h1>
      {reference && <p>Reference: {reference}</p>}
      <ActiveEncounterAction patientId={patient.id} />
      {canInvitePortal && <PatientPortalInvitation patient={patient} />}
      {canEditRegistration && (
        <>
          <Button onClick={() => setRegistrationOpen(true)} variant="outlined">
            Edit registration
          </Button>
          <Dialog
            fullWidth
            maxWidth="md"
            onClose={closeRegistration}
            open={registrationOpen}
          >
            <DialogTitle>Edit registration details</DialogTitle>
            <DialogContent ref={registrationDialogRef}>
              <div
                onChange={() => {
                  if (!registrationDirty) setRegistrationDirty(true);
                }}
              >
                <PatientRegistrationForm
                  patient={patient}
                  onSuccess={() => {
                    setRegistrationDirty(false);
                    setDiscardPending(false);
                    setRegistrationOpen(false);
                    onRegistrationSaved();
                  }}
                />
              </div>
              {discardPending && (
                <Alert
                  action={
                    <>
                      <Button
                        color="inherit"
                        onClick={() => setDiscardPending(false)}
                        size="small"
                      >
                        Keep editing
                      </Button>
                      <Button
                        color="inherit"
                        onClick={() => {
                          if (
                            registrationDialogRef.current?.querySelector(
                              "fieldset[disabled]",
                            )
                          )
                            return;
                          setDiscardPending(false);
                          setRegistrationDirty(false);
                          setRegistrationOpen(false);
                        }}
                        size="small"
                      >
                        Discard changes
                      </Button>
                    </>
                  }
                  severity="warning"
                  sx={{ mt: 2 }}
                >
                  You have unsaved registration changes.
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={closeRegistration}>Cancel</Button>
            </DialogActions>
          </Dialog>
        </>
      )}
      <PatientDetails patient={patient} />
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography component="h2" variant="subtitle1">
            Patient activity
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
            Authorized record activity, newest first. This view shows version
            metadata only, without previous field values or clinical content. It
            follows the patient’s lineage across registration, membership,
            payment, scheduling, encounters, notes, invoices, and reminders;
            sources you cannot access are called out instead of appearing empty.
          </Typography>
          {!activityHistory ? (
            <Alert severity="info">Patient activity is unavailable.</Alert>
          ) : (
            <Stack spacing={2}>
              <Box>
                <Typography component="h3" variant="subtitle2">
                  Sources checked
                </Typography>
                <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 3 }}>
                  {activityHistory.coverage.map((source) => (
                    <Typography
                      component="li"
                      key={source.source}
                      variant="body2"
                    >
                      {source.label}:{" "}
                      {source.status === "included"
                        ? "Included"
                        : source.status === "not_authorized"
                          ? "Not available with your access"
                          : "Not included in this timeline"}
                    </Typography>
                  ))}
                </Stack>
              </Box>
              {activityHistory.entries.length === 0 ? (
                <Typography>
                  No activity events were returned from the included sources.
                  This does not mean the patient has no activity or that
                  excluded sources contain none.
                </Typography>
              ) : (
                <Stack component="ol" spacing={2} sx={{ m: 0, pl: 3 }}>
                  {activityHistory.entries.map((entry) => (
                    <Box component="li" key={entry.id}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {entry.section} ·{" "}
                        {entry.event === "create"
                          ? "Created"
                          : entry.event === "update"
                            ? "Updated"
                            : entry.event}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {entry.occurred_at
                          ? new Date(entry.occurred_at).toLocaleString()
                          : "Time not recorded"}
                        {" · "}
                        {entry.actor_reference
                          ? `Actor reference: ${entry.actor_reference}`
                          : "Actor not recorded"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Record: {entry.record_type.split("::").pop()} #
                        {entry.record_id}
                      </Typography>
                      <Typography variant="body2">
                        {entry.changed_fields.length
                          ? `Fields: ${entry.changed_fields.map((field) => field.replaceAll("_", " ")).join(", ")}`
                          : "Record version updated"}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
              {activityHistory.has_more && (
                <Typography variant="body2">
                  Showing the latest 25 events from included sources. Older
                  version metadata remains in the audit record.
                </Typography>
              )}
            </Stack>
          )}
        </AccordionDetails>
      </Accordion>
      <PatientSupport patientId={patient.id} />
      <Card title="Legacy unsigned drafts">
        <p>These drafts are not encounter notes and cannot be signed.</p>
        {notes?.map((n) => (
          <article className="care-legacy-note" key={n.id}>
            <p className="preserve-lines">{n.body}</p>
            <small>
              Account {n.author_id} · {n.created_at} (UTC) · Unsigned draft
            </small>
          </article>
        ))}
        {notes?.length === 0 && <p>No draft entries.</p>}
      </Card>
    </>
  );
}

type PortalInvitation = {
  activation_path: string;
  email_address: string;
  expires_at: string;
  identity_id: number;
  purpose: "activation" | "recovery";
  status: string;
};

function PatientPortalInvitation({ patient }: { patient: Patient }) {
  const currentEmail = patient.contacts?.find(
    (contact) => contact.contact_type === "email" && !contact.effective_until,
  )?.contact_value;
  const [invitation, setInvitation] = useState<PortalInvitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const activationUrl = invitation
    ? `${window.location.origin}${invitation.activation_path}`
    : "";

  const createInvitation = async () => {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const result = await api<{ invitation: PortalInvitation }>(
        "/api/clinic/patient_portal/invitations",
        {
          method: "POST",
          body: {
            patient_portal_invitation: { patient_id: patient.id },
          },
        },
      );
      setInvitation(result.invitation);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create patient portal access.",
      );
    } finally {
      setBusy(false);
    }
  };

  const copyInvitation = async () => {
    try {
      await navigator.clipboard.writeText(activationUrl);
      setCopied(true);
      setError("");
    } catch {
      setError("Copy failed. Select the complete link and copy it manually.");
    }
  };

  return (
    <Card title="Patient portal access">
      <Stack spacing={1.5}>
        <Typography color="text.secondary">
          Create a one-time link for the current patient email. It activates new
          access or securely resets an existing password, and expires after 30
          minutes.
        </Typography>
        {currentEmail ? (
          <Typography>
            Current email: <strong>{currentEmail}</strong>
          </Typography>
        ) : (
          <Alert severity="warning">
            Record a current patient email in registration before creating
            portal access.
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {invitation && (
          <>
            <Alert severity="success">
              {invitation.purpose === "recovery" ? "Recovery" : "Activation"}{" "}
              link created for {invitation.email_address}. It expires at{" "}
              {new Date(invitation.expires_at).toLocaleString()}.
            </Alert>
            <TextField
              aria-label={`Patient portal ${invitation.purpose} link`}
              fullWidth
              slotProps={{ htmlInput: { readOnly: true } }}
              value={activationUrl}
            />
            <Button onClick={() => void copyInvitation()} variant="outlined">
              {copied ? "Link copied" : `Copy ${invitation.purpose} link`}
            </Button>
            <Typography color="text.secondary" variant="body2">
              Share this link only through a clinic-approved secure channel.
              Meta Clinic has not sent it automatically.
            </Typography>
          </>
        )}
        <Button
          disabled={busy || !currentEmail}
          onClick={() => void createInvitation()}
          variant="contained"
        >
          {busy
            ? "Creating…"
            : invitation
              ? "Replace one-time link"
              : "Create one-time link"}
        </Button>
      </Stack>
    </Card>
  );
}

function ActiveEncounterAction({ patientId }: { patientId: number }) {
  const { data, error } = useResource<{
    encounters: Encounter[];
  }>(`/api/clinic/patients/${patientId}/encounters?status=open&per_page=1`);
  if (!data && !error)
    return (
      <Card title="Active visit">
        <p>Checking for an open visit…</p>
      </Card>
    );
  if (error)
    return (
      <Card title="Active visit">
        <p>Unable to check for an open visit.</p>
      </Card>
    );
  const encounter = data?.encounters[0];
  if (!encounter)
    return (
      <Card title="Active visit">
        <p>No open visit is recorded.</p>
      </Card>
    );
  return (
    <Card title="Active visit">
      <p>
        An open visit started {new Date(encounter.started_at).toLocaleString()}.
      </p>
      <Button
        component="a"
        href={`/clinic/patients/${patientId}/encounters/${encounter.id}`}
        variant="contained"
      >
        Open visit
      </Button>
    </Card>
  );
}

type RegistrationValues = Record<string, string>;
type RegistrationDraft = {
  body: { clinic_patient: RegistrationValues };
  requestKey: string;
  pending: boolean;
  outcomeUnconfirmed: boolean;
};
type RegistrationPatient = Patient & { updated_at?: string };

type AddressParts = {
  address_line1: string;
  address_line2: string;
  address_city: string;
  address_state: string;
  address_postal_code: string;
};

const registrationFormOnlyFields = [
  "address_line1",
  "address_line2",
  "address_city",
  "address_state",
  "address_postal_code",
  "primary_address_original",
] as const;

export function registrationApiValues(values: RegistrationValues) {
  const submitted = { ...values };
  registrationFormOnlyFields.forEach((field) => delete submitted[field]);
  return submitted;
}

function splitAddress(value: string): AddressParts {
  const empty = {
    address_line1: "",
    address_line2: "",
    address_city: "",
    address_state: "",
    address_postal_code: "",
  };
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const last = parts.at(-1)?.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!last || parts.length < 3) return { ...empty, address_line1: value };
  return {
    address_line1: parts[0] ?? "",
    address_line2: parts.length > 3 ? parts.slice(1, -2).join(", ") : "",
    address_city: parts.at(-2) ?? "",
    address_state: last[1],
    address_postal_code: last[2],
  };
}

function formatAddress(values: RegistrationValues): string {
  const line1 = values.address_line1?.trim() ?? "";
  const line2 = values.address_line2?.trim() ?? "";
  const city = values.address_city?.trim() ?? "";
  const state = values.address_state?.trim().toUpperCase() ?? "";
  const postal = values.address_postal_code?.trim() ?? "";
  return [line1, line2, city, [state, postal].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

function registrationValues(patient?: RegistrationPatient): RegistrationValues {
  const d = patient?.demographics;
  const latestContact =
    patient?.contacts?.find((contact) => contact.preferred) ??
    patient?.contacts?.[0];
  const latestEmergency = patient?.emergency_contacts?.[0];
  const latestSocial = patient?.social_histories?.[0];
  const c = latestContact?.effective_until ? undefined : latestContact;
  const e = latestEmergency?.effective_until ? undefined : latestEmergency;
  const s = latestSocial?.effective_until ? undefined : latestSocial;
  const p = patient?.communication_preference;
  return {
    display_name: patient?.display_name ?? "",
    reference: patient?.reference ?? "",
    legal_name: d?.legal_name ?? patient?.display_name ?? "",
    preferred_name: d?.preferred_name ?? "",
    primary_address: patient?.primary_address?.formatted ?? "",
    ...splitAddress(patient?.primary_address?.formatted ?? ""),
    date_of_birth: d?.date_of_birth ?? "",
    sex: d?.sex ?? "",
    primary_language: d?.primary_language ?? "",
    interpreter_required:
      d?.interpreter_required == null
        ? "unknown"
        : d.interpreter_required
          ? "true"
          : "false",
    contact_type: c?.contact_type ?? "phone",
    contact_value: c?.contact_value ?? "",
    preferred: c?.preferred ? "true" : "false",
    preferred_contact_method: p?.preferred_contact_method ?? "portal",
    appointment_reminders_consent: p?.appointment_reminders_consent
      ? "true"
      : "false",
    general_communications_consent: p?.general_communications_consent
      ? "true"
      : "false",
    emergency_name: e?.name ?? "",
    emergency_relationship: e?.relationship ?? "",
    emergency_phone: e?.phone ?? "",
    permission_to_contact: e?.permission_to_contact ? "true" : "false",
    tobacco_use: s?.tobacco_use ?? "",
    alcohol_use: s?.alcohol_use ?? "",
    exercise_habits: s?.exercise_habits ?? "",
    diet: s?.diet ?? "",
    occupation: s?.occupation ?? "",
    living_situation: s?.living_situation ?? "",
    relevant_social_factors: s?.relevant_social_factors ?? "",
  };
}

const registrationFieldLabels: Array<[string, string]> = [
  ["display_name", "Patient display name"],
  ["reference", "Clinic reference"],
  ["legal_name", "Legal name"],
  ["preferred_name", "Name to use"],
  ["primary_address", "Current address"],
  ["date_of_birth", "Date of birth"],
  ["sex", "Sex"],
  ["primary_language", "Primary language"],
  ["interpreter_required", "Interpreter required"],
  ["contact_type", "Contact type"],
  ["contact_value", "Phone or email"],
  ["preferred", "Preferred contact"],
  ["preferred_contact_method", "Preferred contact method"],
  ["appointment_reminders_consent", "Appointment reminders consent"],
  ["general_communications_consent", "General communications consent"],
  ["emergency_name", "Emergency contact name"],
  ["emergency_relationship", "Emergency contact relationship"],
  ["emergency_phone", "Emergency contact phone"],
  ["permission_to_contact", "Permission to contact"],
  ["tobacco_use", "Tobacco use"],
  ["alcohol_use", "Alcohol use"],
  ["exercise_habits", "Exercise habits"],
  ["diet", "Diet"],
  ["occupation", "Occupation"],
  ["living_situation", "Living situation"],
  ["relevant_social_factors", "Relevant social factors"],
];

function registrationDisplayValue(value: string | undefined) {
  if (!value) return "Not recorded";
  if (value === "true") return "Yes";
  if (value === "false") return "No";
  return value;
}

function RegistrationConflictReview({
  local,
  latest,
}: {
  local: RegistrationValues;
  latest: RegistrationPatient;
}) {
  const saved = registrationValues(latest);
  const differences = registrationFieldLabels.filter(
    ([field]) => (local[field] ?? "") !== (saved[field] ?? ""),
  );
  return (
    <Alert severity="warning">
      <Stack spacing={1.5}>
        <Typography sx={{ fontWeight: 700 }}>
          This patient changed while you were editing. Your entries are still in
          the form.
        </Typography>
        <Typography variant="body2">
          The latest saved values are shown beside your edits. Review them
          before saving again.
        </Typography>
        {differences.length ? (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Registration conflict comparison">
              <TableHead>
                <TableRow>
                  <TableCell>Field</TableCell>
                  <TableCell>Your retained edit</TableCell>
                  <TableCell>Latest saved value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {differences.map(([field, label]) => (
                  <TableRow key={field}>
                    <TableCell component="th" scope="row">
                      {label}
                    </TableCell>
                    <TableCell>
                      {registrationDisplayValue(local[field])}
                    </TableCell>
                    <TableCell>
                      {registrationDisplayValue(saved[field])}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body2">
            The saved version changed without changing the displayed fields.
          </Typography>
        )}
      </Stack>
    </Alert>
  );
}

function PatientFields({
  values,
  onSaveSection,
  onCompletionChange,
}: {
  values: RegistrationValues;
  onSaveSection: (form: HTMLFormElement) => Promise<boolean>;
  onCompletionChange: (complete: boolean) => void;
}) {
  const [expanded, setExpanded] = useState("demographics");
  const [unlocked, setUnlocked] = useState(0);
  const accordionSx = {
    "&.Mui-disabled": { backgroundColor: "action.disabledBackground" },
    "&.Mui-expanded": { borderColor: "primary.main" },
    "&:before": { display: "none" },
    border: "1px solid",
    borderColor: "divider",
    borderRadius: "8px !important",
    overflow: "hidden",
  };
  const summarySx = {
    "& .MuiAccordionSummary-content": { my: 1.5 },
    backgroundColor: "action.hover",
    minHeight: 72,
    px: { sm: 2.5, xs: 2 },
  };
  const detailsSx = {
    backgroundColor: "background.default",
    px: { sm: 2.5, xs: 2 },
    py: 2.5,
  };
  const continueSection = async (
    event: MouseEvent<HTMLButtonElement>,
    step: number,
    next: string | null,
  ) => {
    const form = event.currentTarget.form;
    if (!form || !form.reportValidity()) return;
    if (!(await onSaveSection(form))) return;
    setUnlocked(step + 1);
    if (next) setExpanded(next);
    else onCompletionChange(true);
  };

  return (
    <Stack spacing={1}>
      <Accordion
        expanded={expanded === "demographics"}
        disableGutters
        onChange={(_event, open) => setExpanded(open ? "demographics" : "")}
        sx={accordionSx}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={summarySx}>
          <Box>
            <Typography sx={{ fontWeight: 700 }}>Demographics</Typography>
            <Typography variant="body2" color="text.secondary">
              Date of birth, administrative sex, language, and interpreter needs
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={detailsSx}>
          <Box className="pharmacy-form-grid">
            <Field
              name="clinic_patient[date_of_birth]"
              label="Date of birth"
              type="date"
              required={false}
              value={values.date_of_birth}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ gridColumn: { xs: "1", md: "1 / -1" } }}
            >
              Leave this blank when the patient does not know or declines to
              provide a date of birth. Do not guess; the record will show it as
              unknown until the patient provides it.
            </Typography>
            <Field
              name="clinic_patient[sex]"
              label="Administrative sex"
              required
              value={values.sex}
              options={[
                ["", "Select sex"],
                ["female", "Female"],
                ["male", "Male"],
                ["intersex", "Intersex"],
                ["unknown", "Unknown"],
              ]}
            />
            <Field
              name="clinic_patient[primary_language]"
              label="Preferred language"
              required={false}
              value={values.primary_language}
              maxLength={80}
            />
            <Field
              name="clinic_patient[interpreter_required]"
              label="Interpreter required"
              required={false}
              value={values.interpreter_required}
              options={[
                ["unknown", "Unknown"],
                ["false", "No"],
                ["true", "Yes"],
              ]}
            />
          </Box>
          <Button
            onClick={(event) => void continueSection(event, 0, "contact")}
            sx={{ mt: 2 }}
            type="button"
            variant="outlined"
          >
            Save and continue
          </Button>
        </AccordionDetails>
      </Accordion>
      <Accordion
        disabled={unlocked < 1}
        expanded={expanded === "contact"}
        disableGutters
        onChange={(_event, open) => setExpanded(open ? "contact" : "")}
        sx={accordionSx}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={summarySx}>
          <Box>
            <Typography sx={{ fontWeight: 700 }}>
              Contact details and communication preferences
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Primary contact point, preferred method, and consent
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={detailsSx}>
          <Box className="pharmacy-form-grid">
            <Field
              name="clinic_patient[contact_type]"
              label="Primary contact type"
              required={false}
              value={values.contact_type}
              options={["phone", "email"]}
            />
            <Field
              name="clinic_patient[contact_value]"
              label="Primary contact detail"
              required={false}
              value={values.contact_value}
              maxLength={320}
            />
            <Field
              name="clinic_patient[preferred]"
              label="Use as preferred contact point"
              required={false}
              value={values.preferred}
              options={[
                ["false", "No"],
                ["true", "Yes"],
              ]}
            />
            <Field
              name="clinic_patient[preferred_contact_method]"
              label="Preferred communication method"
              required={false}
              value={values.preferred_contact_method}
              options={["portal", "text", "phone", "email"]}
            />
            <Field
              name="clinic_patient[appointment_reminders_consent]"
              label="Appointment reminders consent"
              required={false}
              value={values.appointment_reminders_consent}
              options={[
                ["false", "No"],
                ["true", "Yes"],
              ]}
            />
            <Field
              name="clinic_patient[general_communications_consent]"
              label="General communications consent"
              required={false}
              value={values.general_communications_consent}
              options={[
                ["false", "No"],
                ["true", "Yes"],
              ]}
            />
          </Box>
          <Button
            onClick={(event) => void continueSection(event, 1, "emergency")}
            sx={{ mt: 2 }}
            type="button"
            variant="outlined"
          >
            Save and continue
          </Button>
        </AccordionDetails>
      </Accordion>
      <Accordion
        disabled={unlocked < 2}
        expanded={expanded === "emergency"}
        disableGutters
        onChange={(_event, open) => setExpanded(open ? "emergency" : "")}
        sx={accordionSx}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={summarySx}>
          <Box>
            <Typography sx={{ fontWeight: 700 }}>Emergency contact</Typography>
            <Typography variant="body2" color="text.secondary">
              Optional contact and permission details
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={detailsSx}>
          <Box className="pharmacy-form-grid">
            <Field
              name="clinic_patient[emergency_name]"
              label="Emergency contact name"
              required={false}
              value={values.emergency_name}
              maxLength={320}
            />
            <Field
              name="clinic_patient[emergency_relationship]"
              label="Emergency contact relationship"
              required={false}
              value={values.emergency_relationship}
              maxLength={320}
            />
            <Field
              name="clinic_patient[emergency_phone]"
              label="Emergency contact phone"
              required={false}
              value={values.emergency_phone}
              maxLength={320}
            />
            <Field
              name="clinic_patient[permission_to_contact]"
              label="Permission to contact"
              required={false}
              value={values.permission_to_contact}
              options={[
                ["false", "No"],
                ["true", "Yes"],
              ]}
            />
          </Box>
          <Button
            onClick={(event) => void continueSection(event, 2, "clinical")}
            sx={{ mt: 2 }}
            type="button"
            variant="outlined"
          >
            Save and continue
          </Button>
        </AccordionDetails>
      </Accordion>
      <Accordion
        disabled={unlocked < 3}
        expanded={expanded === "clinical"}
        disableGutters
        onChange={(_event, open) => setExpanded(open ? "clinical" : "")}
        sx={accordionSx}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={summarySx}>
          <Box>
            <Typography sx={{ fontWeight: 700 }}>
              Optional clinical context
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Complete during clinical intake when relevant; this is not
              required to register the patient
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={detailsSx}>
          <Box className="pharmacy-form-grid">
            {(
              [
                "tobacco_use",
                "alcohol_use",
                "exercise_habits",
                "diet",
                "occupation",
                "living_situation",
                "relevant_social_factors",
              ] as const
            ).map((name) => (
              <Field
                key={name}
                name={`clinic_patient[${name}]`}
                label={name.replaceAll("_", " ")}
                type="textarea"
                required={false}
                value={values[name]}
                maxLength={2000}
              />
            ))}
          </Box>
          <Button
            onClick={(event) => void continueSection(event, 3, null)}
            sx={{ mt: 2 }}
            type="button"
            variant="outlined"
          >
            Save section
          </Button>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}

export function PatientRegistrationForm({
  patient,
  onSuccess,
}: {
  patient?: Patient;
  onSuccess?: (result: Record<string, unknown> | undefined) => void;
}) {
  const workingDraft = useWorkingDraft<RegistrationDraft>({
    kind: patient ? "patient_update" : "registration",
    patientId: patient?.id,
  });
  const preserved = useRef<RegistrationDraft | null | undefined>(undefined);
  if (!workingDraft.ready)
    return workingDraft.error ? (
      <Alert
        severity="error"
        action={<Button onClick={workingDraft.reload}>Retry recovery</Button>}
      >
        {workingDraft.error}
      </Alert>
    ) : (
      <LoadState />
    );

  return (
    <PatientRegistrationEditor
      patient={patient as RegistrationPatient | undefined}
      initialDraft={preserved.current ?? workingDraft.restored}
      workingDraft={workingDraft}
      onReloadDraft={(snapshot) => {
        preserved.current = snapshot;
        workingDraft.reload();
      }}
      onSuccess={onSuccess}
    />
  );
}

function PatientRegistrationEditor({
  patient,
  initialDraft,
  workingDraft,
  onReloadDraft,
  onSuccess,
}: {
  patient?: RegistrationPatient;
  initialDraft: RegistrationDraft | null;
  workingDraft: ReturnType<typeof useWorkingDraft<RegistrationDraft>>;
  onReloadDraft: (snapshot: RegistrationDraft) => void;
  onSuccess?: (result: Record<string, unknown> | undefined) => void;
}) {
  const { registerBlocker } = useClinicNavigation();
  const initialValues = useMemo(
    () => initialDraft?.body.clinic_patient ?? registrationValues(patient),
    [initialDraft, patient],
  );
  const requestKey = useRef(initialDraft?.requestKey || crypto.randomUUID());
  const expectedUpdatedAt = useRef(patient?.updated_at);
  const attempt = useRef<RegistrationDraft | null>(
    initialDraft?.pending ? initialDraft : null,
  );
  const lastSnapshot = useRef<RegistrationDraft>(
    initialDraft ?? {
      body: { clinic_patient: initialValues },
      requestKey: requestKey.current,
      pending: false,
      outcomeUnconfirmed: false,
    },
  );
  const autosaveTimer = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);
  const [dirty, setDirty] = useState(Boolean(initialDraft));
  const [busy, setBusy] = useState(false);
  const [outcomeUnconfirmed, setOutcomeUnconfirmed] = useState(
    Boolean(initialDraft?.pending),
  );
  const [error, setError] = useState("");
  const [registrationConflict, setRegistrationConflict] = useState<{
    latest: RegistrationPatient;
    local: RegistrationValues;
  } | null>(null);
  const [sectionsComplete, setSectionsComplete] = useState(false);

  useEffect(() => {
    if (!dirty && !attempt.current) return;
    const unregister = registerBlocker(() =>
      attempt.current
        ? "The registration save is unresolved. Retry the exact request before leaving."
        : "This registration has saved working changes that are not on the patient record yet.",
    );
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty, outcomeUnconfirmed, registerBlocker]);
  useEffect(
    () => () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    },
    [],
  );

  const snapshotFrom = (form: HTMLFormElement): RegistrationDraft => {
    const values = formBody(new FormData(form))
      .clinic_patient as RegistrationValues;
    const structuredAddress = formatAddress(values);
    const officialAddress =
      structuredAddress || values.primary_address_original || "";
    const officialValues = {
      ...values,
      primary_address: officialAddress,
      request_key: requestKey.current,
      ...(expectedUpdatedAt.current
        ? { expected_updated_at: expectedUpdatedAt.current }
        : {}),
    };
    return {
      body: { clinic_patient: officialValues },
      requestKey: requestKey.current,
      pending: false,
      outcomeUnconfirmed: false,
    };
  };
  const queueAutosave = (form: HTMLFormElement) => {
    const snapshot = snapshotFrom(form);
    lastSnapshot.current = snapshot;
    setDirty(true);
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = undefined;
      void workingDraft.save(snapshot);
    }, 500);
  };
  const saveSection = async (form: HTMLFormElement) => {
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = undefined;
    }
    const snapshot = snapshotFrom(form);
    lastSnapshot.current = snapshot;
    setDirty(true);
    setBusy(true);
    setError("");
    const saved = await workingDraft.save(snapshot);
    setBusy(false);
    if (!saved) {
      setError(
        "This section could not be saved. Keep this page open and retry before continuing.",
      );
    }
    return saved;
  };

  return (
    <Box
      component="form"
      onInput={(event) => {
        setSectionsComplete(false);
        queueAutosave(event.currentTarget);
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (inFlight.current) return;
        const form = event.currentTarget;
        inFlight.current = true;
        if (autosaveTimer.current) {
          window.clearTimeout(autosaveTimer.current);
          autosaveTimer.current = undefined;
        }
        const current = attempt.current ?? snapshotFrom(event.currentTarget);
        const pending = { ...current, pending: true };
        lastSnapshot.current = pending;
        if (!(await workingDraft.save(pending))) {
          inFlight.current = false;
          setError(
            "The working copy could not be saved. Keep this page open and retry before saving the patient record.",
          );
          return;
        }
        attempt.current = pending;
        setBusy(true);
        setError("");
        setRegistrationConflict(null);
        try {
          const result = await api<Record<string, unknown>>(
            patient
              ? `/api/clinic/patients/${patient.id}`
              : "/api/clinic/patients",
            {
              method: patient ? "PATCH" : "POST",
              body: {
                clinic_patient: registrationApiValues(
                  pending.body.clinic_patient,
                ),
              },
            },
          );
          if (!(await workingDraft.clear())) {
            setOutcomeUnconfirmed(true);
            setError(
              "The patient record was saved, but its working copy could not be cleared. Retry the same request to finish recovery.",
            );
            return;
          }
          attempt.current = null;
          requestKey.current = crypto.randomUUID();
          form.reset();
          flushSync(() => {
            setDirty(false);
            setOutcomeUnconfirmed(false);
            setBusy(false);
          });
          onSuccess?.(result);
        } catch (reason) {
          const unknown =
            !(reason instanceof ApiError) ||
            reason.status === 408 ||
            reason.status >= 500 ||
            reason.code === "outcome_unconfirmed";
          if (unknown) {
            const unresolved = { ...pending, outcomeUnconfirmed: true };
            attempt.current = unresolved;
            lastSnapshot.current = unresolved;
            await workingDraft.save(unresolved);
          } else {
            attempt.current = null;
            requestKey.current = crypto.randomUUID();
            const editable = {
              ...pending,
              body: {
                clinic_patient: {
                  ...pending.body.clinic_patient,
                  request_key: requestKey.current,
                },
              },
              requestKey: requestKey.current,
              pending: false,
              outcomeUnconfirmed: false,
            };
            lastSnapshot.current = editable;
            await workingDraft.save(editable);
            if (
              patient &&
              reason instanceof ApiError &&
              reason.code === "stale_record"
            ) {
              try {
                const refreshed = await api<{ patient: RegistrationPatient }>(
                  `/api/clinic/patients/${patient.id}`,
                );
                if (refreshed.patient.id !== patient.id)
                  throw new Error(
                    "The latest patient record did not match this registration.",
                  );
                if (!refreshed.patient.updated_at)
                  throw new Error(
                    "The latest patient version could not be confirmed.",
                  );
                expectedUpdatedAt.current = refreshed.patient.updated_at;
                const rebased = {
                  ...editable,
                  body: {
                    clinic_patient: {
                      ...editable.body.clinic_patient,
                      expected_updated_at: refreshed.patient.updated_at,
                    },
                  },
                };
                lastSnapshot.current = rebased;
                await workingDraft.save(rebased);
                setRegistrationConflict({
                  latest: refreshed.patient,
                  local: pending.body.clinic_patient,
                });
              } catch (refreshError) {
                setError(
                  refreshError instanceof Error
                    ? `The record changed, and the latest version could not be loaded: ${refreshError.message}`
                    : "The record changed, and the latest version could not be loaded.",
                );
              }
            }
          }
          setOutcomeUnconfirmed(unknown);
          if (!(reason instanceof ApiError && reason.code === "stale_record"))
            setError(
              unknown
                ? "The registration outcome is unknown. Retry this exact request to reconcile it."
                : reason instanceof Error
                  ? reason.message
                  : "The patient record could not be saved.",
            );
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      }}
    >
      <Stack spacing={1.5}>
        <Box
          component="fieldset"
          disabled={busy || outcomeUnconfirmed}
          sx={{ border: 0, m: 0, p: 0 }}
        >
          <Stack spacing={1.5}>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>Patient identity</Typography>
              <Typography variant="body2" color="text.secondary">
                Capture the names staff use to identify the patient.{" "}
                {patient
                  ? "The clinic reference is assigned once and stays fixed for reliable lookup."
                  : "Use a stable clinic reference staff can use for reliable lookup."}
              </Typography>
            </Box>
            <Box className="pharmacy-form-grid">
              <Field
                name="clinic_patient[display_name]"
                label="Name shown in chart"
                value={initialValues.display_name}
                maxLength={120}
                description="The name staff see in schedules, queues, and the chart."
                owner="registration staff"
              />
              <Field
                name="clinic_patient[legal_name]"
                label="Legal name (if different)"
                required={false}
                value={initialValues.legal_name}
                maxLength={160}
                description="Use only when it differs from the chart name."
                owner="registration staff"
              />
              <Field
                name="clinic_patient[preferred_name]"
                label="Preferred name"
                required={false}
                value={initialValues.preferred_name}
                maxLength={160}
                description="How the patient asks to be addressed."
                owner="registration staff"
              />
              {(!patient?.reference ||
                patientReferenceLabel(patient.reference)) && (
                <Field
                  name="clinic_patient[reference]"
                  label={
                    patient
                      ? "Clinic reference (system assigned)"
                      : "Clinic reference"
                  }
                  value={initialValues.reference}
                  maxLength={32}
                  readOnly={Boolean(patient)}
                  description={
                    patient
                      ? "This identifier is fixed after registration."
                      : "Use a stable clinic reference for reliable lookup."
                  }
                  owner="clinic system"
                />
              )}
              {patient?.reference &&
                !patientReferenceLabel(patient.reference) && (
                  <input
                    type="hidden"
                    name="clinic_patient[reference]"
                    value={initialValues.reference}
                  />
                )}
            </Box>
            <Box className="pharmacy-form-grid">
              <Field
                name="clinic_patient[address_line1]"
                label="Street address"
                required={false}
                value={initialValues.address_line1}
                autoComplete="address-line1"
                maxLength={200}
                description="Used for correspondence and patient identity checks."
                owner="registration staff"
              />
              <Field
                name="clinic_patient[address_line2]"
                label="Apartment, suite, or unit"
                required={false}
                value={initialValues.address_line2}
                autoComplete="address-line2"
                maxLength={100}
              />
              <Field
                name="clinic_patient[address_city]"
                label="City"
                required={false}
                value={initialValues.address_city}
                autoComplete="address-level2"
                maxLength={100}
              />
              <Field
                name="clinic_patient[address_state]"
                label="State"
                required={false}
                value={initialValues.address_state}
                autoComplete="address-level1"
                maxLength={2}
              />
              <Field
                name="clinic_patient[address_postal_code]"
                label="ZIP code"
                required={false}
                value={initialValues.address_postal_code}
                autoComplete="postal-code"
                maxLength={10}
              />
            </Box>
            <input
              type="hidden"
              name="clinic_patient[primary_address_original]"
              value={initialValues.primary_address}
            />
            <Typography variant="body2" color="text.secondary">
              Registration covers identity, contact, address, language, and
              communication needs. Record symptoms and other clinical history in
              the visit intake.
            </Typography>
            <PatientFields
              values={initialValues}
              onCompletionChange={setSectionsComplete}
              onSaveSection={saveSection}
            />
          </Stack>
        </Box>
        {registrationConflict && (
          <RegistrationConflictReview
            latest={registrationConflict.latest}
            local={registrationConflict.local}
          />
        )}
        {workingDraft.status === "saving" && (
          <Typography role="status">Saving working copy…</Typography>
        )}
        {workingDraft.status === "saved" && dirty && (
          <Typography color="text.secondary" role="status">
            Working copy saved.
          </Typography>
        )}
        {(workingDraft.status === "error" ||
          workingDraft.status === "conflict") && (
          <Alert
            severity="error"
            action={
              workingDraft.status === "error" ? (
                <Button
                  onClick={() => void workingDraft.save(lastSnapshot.current)}
                >
                  Retry working-copy save
                </Button>
              ) : (
                <Button onClick={() => onReloadDraft(lastSnapshot.current)}>
                  Reload version and keep my edits
                </Button>
              )
            }
          >
            {workingDraft.error}
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <Button
          type="submit"
          variant="contained"
          disabled={busy || (!patient && !sectionsComplete)}
        >
          {busy
            ? "Saving…"
            : outcomeUnconfirmed
              ? "Retry same request"
              : patient
                ? "Save registration details"
                : "Register patient"}
        </Button>
      </Stack>
    </Box>
  );
}

function PatientDetails({ patient }: { patient: Patient }) {
  const d = patient.demographics;
  const vitalLabel = (code: string) =>
    ({
      "vital-systolic-bp": "Systolic blood pressure",
      "vital-diastolic-bp": "Diastolic blood pressure",
      "vital-heart-rate": "Heart rate",
      "vital-respiratory-rate": "Respiratory rate",
      "vital-oxygen-saturation": "Oxygen saturation",
      "vital-temperature": "Temperature",
      "vital-weight": "Weight",
      "vital-height": "Height",
      "vital-bmi": "Body mass index",
      "vital-pain-score": "Pain score",
    })[code] ?? "Vital sign";
  const vitalUnit = (unit: string) =>
    ({
      "mm[Hg]": "mmHg",
      "/min": "per minute",
      "%": "%",
      Cel: "°C",
      "[degF]": "°F",
      kg: "kg",
      "[lb_av]": "lb",
      cm: "cm",
      "[in_i]": "in",
      "kg/m2": "kg/m²",
      "{score}": "0–10",
    })[unit] ?? unit;
  return (
    <div className="care-grid">
      <Card title="Demographics">
        <dl className="care-observations">
          <div>
            <dt>Legal name</dt>
            <dd>{d?.legal_name || patient.display_name}</dd>
          </div>
          <div>
            <dt>Name to use</dt>
            <dd>{d?.preferred_name || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Date of birth</dt>
            <dd>{d?.date_of_birth || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Sex</dt>
            <dd>{sexLabel(d?.sex)}</dd>
          </div>
          <div>
            <dt>Language</dt>
            <dd>
              {d?.primary_language || "Not recorded"}
              {d?.interpreter_required == null
                ? " · Interpreter need unknown"
                : d.interpreter_required
                  ? " · Interpreter required"
                  : " · No interpreter requested"}
            </dd>
          </div>
        </dl>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Current address:{" "}
          {patient.primary_address?.formatted || "Not recorded"}
        </Typography>
      </Card>
      <Card title="Registration contacts">
        <p>
          {patient.contacts
            ?.map((c) => `${c.contact_type}: ${c.contact_value}`)
            .join(" · ") || "No contact recorded."}
        </p>
        <p>
          {patient.emergency_contacts?.[0]
            ? `Emergency: ${patient.emergency_contacts[0].name} (${patient.emergency_contacts[0].relationship})`
            : "No emergency contact recorded."}
        </p>
        <p>
          Reminder delivery uses a separately verified delivery endpoint. Review
          that endpoint before scheduling a message.
        </p>
      </Card>
      <Card title="Communication preferences">
        <p>
          {patient.communication_preference?.preferred_contact_method ||
            "Not recorded"}
        </p>
        <p>
          Reminders:{" "}
          {patient.communication_preference?.appointment_reminders_consent
            ? "Consented"
            : "Not consented"}{" "}
          · General:{" "}
          {patient.communication_preference?.general_communications_consent
            ? "Consented"
            : "Not consented"}
        </p>
      </Card>
      <Card title="Lifestyle and social history">
        <p>
          {patient.social_histories?.[0]
            ? "Current social history recorded."
            : "Not recorded."}
        </p>
      </Card>
      <Card title="Vital-sign history">
        <p>
          {patient.vital_signs?.length
            ? patient.vital_signs
                .map((v) => {
                  const label = vitalLabel(v.code);
                  const value = v.numeric_value ?? "Not recorded";
                  const unit = vitalUnit(v.unit_code);
                  return `${label}: ${value}${unit ? ` ${unit}` : ""}`;
                })
                .join(" · ")
            : "No vital-sign observations recorded."}
        </p>
      </Card>
      <PatientCareCoordination patientId={patient.id} />
      <IntakeConsentEvidence patientId={patient.id} />
      <PatientClinicalHistory patientId={patient.id} />
      <PatientLabReports
        patientId={patient.id}
        patientName={patient.display_name}
      />
    </div>
  );
}

function sexLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    female: "Female",
    male: "Male",
    intersex: "Intersex",
    unknown: "Unknown",
    not_recorded: "Not recorded",
  };
  return labels[value ?? ""] ?? "Not recorded";
}
