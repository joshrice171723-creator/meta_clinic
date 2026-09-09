import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api, ApiError, formBody } from "../../api/client";
import type { Encounter, Pagination, Patient } from "../../api/contracts";
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
      />
    );
  return (
    <>
      <p className="eyebrow">PATIENTS</p>
      <h1>Patient directory</h1>
      <a className="text-link" href="/clinic">
        Return to tracking board →
      </a>
      {clinic.capabilities.patient_identity_read === true && <PatientLookup />}
      <Card title="Patient directory">
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
      {clinic.capabilities.patients_write && (
        <Card title="Register a patient">
          <PatientRegistrationForm
            onSuccess={createdPath("/clinic/patients")}
          />
        </Card>
      )}
    </>
  );
}

function PatientLookup() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const normalizedQuery = query.trim();
  const canSearch = normalizedQuery.length >= 2;
  const lookupQuery =
    canSearch && debouncedQuery === normalizedQuery ? debouncedQuery : null;

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedQuery(normalizedQuery),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [normalizedQuery]);

  return (
    <Card title="Find an existing patient">
      <Stack spacing={1.5}>
        <Typography color="text.secondary">
          Search by name or clinic reference before registering a new patient.
        </Typography>
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
          helperText="Enter at least 2 characters. Results are limited to 25 matching records."
        />
        {!canSearch && normalizedQuery.length > 0 && (
          <Typography color="text.secondary" role="status">
            Enter at least 2 characters to search.
          </Typography>
        )}
        {canSearch && !lookupQuery && (
          <Typography color="text.secondary" role="status">
            Updating search…
          </Typography>
        )}
        {lookupQuery && <PatientLookupResults query={lookupQuery} />}
      </Stack>
    </Card>
  );
}

function PatientLookupResults({ query }: { query: string }) {
  const lookup = useResource<{ patients: Patient[]; pagination: Pagination }>(
    `/api/clinic/patients/lookup?q=${encodeURIComponent(query)}&page=1&per_page=25`,
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

  return (
    <Stack
      component="ul"
      spacing={1}
      sx={{ listStyle: "none", m: 0, p: 0 }}
      aria-label="Matching patients"
    >
      {lookup.data.patients.map((patient) => (
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
            <Typography sx={{ fontWeight: 600 }}>
              {patient.display_name}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Clinic reference:{" "}
              {patientReferenceLabel(patient.reference) ?? "Not recorded"}
            </Typography>
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
      {lookup.data.pagination.total > lookup.data.patients.length && (
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
}: {
  canEditRegistration: boolean;
  canInvitePortal: boolean;
  notes?: LegacyNote[];
  onRegistrationSaved: () => void;
  patient: Patient;
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
              {invitation.purpose === "recovery" ? "Recovery" : "Activation"} link
              created for {invitation.email_address}. It expires at{" "}
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
              APPly has not sent it automatically.
            </Typography>
          </>
        )}
        <Button
          disabled={busy || !currentEmail}
          onClick={() => void createInvitation()}
          variant="contained"
        >
          {busy ? "Creating…" : invitation ? "Replace one-time link" : "Create one-time link"}
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
    date_of_birth: d?.date_of_birth ?? "",
    sex: d?.sex ?? "",
    primary_language: d?.primary_language ?? "",
    interpreter_required: d?.interpreter_required ? "true" : "false",
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

function PatientFields({ values }: { values: RegistrationValues }) {
  return (
    <>
      <Field
        name="clinic_patient[date_of_birth]"
        label="Date of birth"
        type="date"
        required={false}
        value={values.date_of_birth}
      />
      <Field
        name="clinic_patient[sex]"
        label="Sex"
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
        label="Primary language"
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
          ["false", "No"],
          ["true", "Yes"],
        ]}
      />
      <Field
        name="clinic_patient[contact_type]"
        label="Contact type"
        required={false}
        value={values.contact_type}
        options={["phone", "email"]}
      />
      <Field
        name="clinic_patient[contact_value]"
        label="Phone or email"
        required={false}
        value={values.contact_value}
        maxLength={320}
      />
      <Field
        name="clinic_patient[preferred]"
        label="Preferred contact"
        required={false}
        value={values.preferred}
        options={[
          ["false", "No"],
          ["true", "Yes"],
        ]}
      />
      <Field
        name="clinic_patient[preferred_contact_method]"
        label="Preferred contact method"
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
    </>
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
    const values = formBody(new FormData(form)).clinic_patient as RegistrationValues;
    const officialValues = {
      ...values,
      request_key: requestKey.current,
      ...(patient?.updated_at ? { expected_updated_at: patient.updated_at } : {}),
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

  return (
    <Box
      component="form"
      className="pharmacy-form-grid"
      onInput={(event) => queueAutosave(event.currentTarget)}
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
        try {
          const result = await api<Record<string, unknown>>(
            patient
              ? `/api/clinic/patients/${patient.id}`
              : "/api/clinic/patients",
            { method: patient ? "PATCH" : "POST", body: pending.body },
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
          }
          setOutcomeUnconfirmed(unknown);
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
      <fieldset disabled={busy || outcomeUnconfirmed}>
        <Field
          name="clinic_patient[display_name]"
          label="Patient display name"
          value={initialValues.display_name}
          maxLength={120}
        />
        {(!patient?.reference || patientReferenceLabel(patient.reference)) && (
          <Field
            name="clinic_patient[reference]"
            label="Clinic reference"
            value={initialValues.reference}
            maxLength={32}
          />
        )}
        {patient?.reference && !patientReferenceLabel(patient.reference) && (
          <input
            type="hidden"
            name="clinic_patient[reference]"
            value={initialValues.reference}
          />
        )}
        <PatientFields values={initialValues} />
      </fieldset>
      {workingDraft.status === "saving" && (
        <Typography role="status">Saving working copy…</Typography>
      )}
      {workingDraft.status === "saved" && dirty && (
        <Typography color="text.secondary" role="status">
          Working copy saved.
        </Typography>
      )}
      {(workingDraft.status === "error" || workingDraft.status === "conflict") && (
        <Alert
          severity="error"
          action={
            workingDraft.status === "error" ? (
              <Button onClick={() => void workingDraft.save(lastSnapshot.current)}>
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
      <Button type="submit" variant="contained" disabled={busy}>
        {busy
          ? "Saving…"
          : outcomeUnconfirmed
            ? "Retry same request"
            : patient
              ? "Save registration details"
              : "Register patient"}
      </Button>
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
    })[unit] ?? unit;
  return (
    <div className="care-grid">
      <Card title="Demographics">
        <dl className="care-observations">
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
              {d?.interpreter_required ? " · Interpreter required" : ""}
            </dd>
          </div>
        </dl>
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
