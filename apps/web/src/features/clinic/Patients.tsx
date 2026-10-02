import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
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
import { clinicDateTime, PatientSupport } from "./CareFlow";
import { PatientClinicalHistory } from "./PatientClinicalHistory";
import { PatientCareCoordination } from "./PatientCareCoordination";
import { IntakeConsentEvidence } from "./IntakeConsentEvidence";
import { useClinic } from "./Workspace";
import { useClinicNavigation } from "./clinicNavigation";
import { patientReferenceLabel } from "./patientReference";
import { PatientLabReports } from "./PatientLabReports";
import { PatientDocumentProvenance } from "./PatientDocumentProvenance";
import { useWorkingDraft } from "./useWorkingDraft";
import { registrationLanguageSuggestions } from "./registrationLanguageSuggestions";
import { useRegistrationDialogViewport } from "./registrationDialogViewport";

type LegacyNote = {
  id: number;
  body: string;
  author_id: number;
  created_at: string;
};

type PortalAccess = {
  status: "invited" | "active" | "revoked";
  invitation_expires_at: string | null;
  activated_at: string | null;
  invitation_open: boolean;
};

function currentPage() {
  if (typeof window === "undefined") return 1;
  const page = Number(new URLSearchParams(window.location.search).get("page"));
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function Patients({ id }: { id?: string }) {
  const clinic = useClinic();
  const page = currentPage();
  const requestedSiteId =
    typeof window === "undefined"
      ? null
      : Number(new URLSearchParams(window.location.search).get("site_id"));
  const selectedSite = clinic.sites.find((site) => site.id === requestedSiteId);
  const siteQuery = selectedSite ? `&site_id=${selectedSite.id}` : "";
  const { data, error, refresh } = useResource<{
    patients?: Patient[];
    patient?: Patient;
    activity_history?: PatientActivityHistory;
    notes?: LegacyNote[];
    portal_access?: PortalAccess | null;
    pagination?: Pagination;
  }>(`/api/clinic/patients${id ? `/${id}` : `?page=${page}${siteQuery}`}`);
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
        portalAccess={data.portal_access}
        activityHistory={data.activity_history}
      />
    );
  return (
    <>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1}
        sx={{
          alignItems: { md: "center" },
          justifyContent: "space-between",
          mb: 2,
        }}
      >
        <Typography component="h1" variant="h4">
          Patient directory
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Button component="a" href="/clinic" sx={{ minHeight: 44 }}>
            Return to tracking board
          </Button>
          {clinic.capabilities.patients_write && (
            <Button
              component="a"
              href="/clinic/patients/new"
              variant="contained"
              sx={{ minHeight: 44 }}
            >
              Register patient
            </Button>
          )}
        </Stack>
      </Stack>
      <Card title="Find and browse patients">
        {clinic.capabilities.patient_identity_read === true && (
          <>
            <PatientLookup />
            <Divider sx={{ my: 2 }} />
          </>
        )}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{
            alignItems: { sm: "center" },
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <Box>
            <Typography component="h2" variant="h6">
              {selectedSite ? `${selectedSite.name} patients` : "All patients"}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {selectedSite
                ? `Browse patients assigned to ${selectedSite.name}.`
                : "Browse patients registered at this clinic."}
            </Typography>
          </Box>
          <TextField
            select
            label="Primary location"
            size="small"
            value={selectedSite?.id ?? ""}
            onChange={(event) =>
              window.location.assign(
                event.target.value
                  ? `/clinic/patients?site_id=${event.target.value}`
                  : "/clinic/patients",
              )
            }
            sx={{ width: { xs: "100%", sm: 240 }, flexShrink: 0 }}
          >
            <MenuItem value="">All clinic patients</MenuItem>
            {clinic.sites.map((site) => (
              <MenuItem key={site.id} value={site.id}>
                {site.name || site.code}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        {data.patients?.length === 0 ? (
          <p>
            {selectedSite
              ? "No patients are assigned to this location yet."
              : "No patients are registered at this clinic yet."}
          </p>
        ) : (
          <div className="clinic-table-wrap">
            <table className="care-table">
              <caption className="sr-only">
                {selectedSite
                  ? `Patients assigned to ${selectedSite.name}`
                  : "Patients registered at this clinic"}
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
            path={`/clinic/patients${selectedSite ? `?site_id=${selectedSite.id}` : ""}`}
          />
        )}
      </Card>
    </>
  );
}

export function PatientRegistrationPage() {
  const clinic = useClinic();
  const [identityReviewed, setIdentityReviewed] = useState(false);
  const [submittedIdentity, setSubmittedIdentity] =
    useState<RegistrationValues | null>(null);
  const [reviewedIdentity, setReviewedIdentity] = useState<string | null>(null);
  const canLookupIdentity = clinic.capabilities.patient_identity_read === true;

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
          {canLookupIdentity && !identityReviewed ? (
            <Card title="Check for an existing patient">
              <Stack spacing={2}>
                <Alert severity="info">
                  Search before creating a chart. Compare the identity details
                  with the person in front of you; a similar name alone does not
                  establish that two records belong to the same person.
                </Alert>
                <PatientLookup onProceed={() => setIdentityReviewed(true)} />
              </Stack>
            </Card>
          ) : (
            <Stack spacing={2}>
              {submittedIdentity && (
                <Card title="Review the submitted identity">
                  <PatientSubmittedIdentityReview
                    values={submittedIdentity}
                    onEdit={() => setSubmittedIdentity(null)}
                    onProceed={() => {
                      flushSync(() => {
                        setReviewedIdentity(
                          registrationIdentitySignature(submittedIdentity),
                        );
                        setSubmittedIdentity(null);
                      });
                      (
                        document.getElementById(
                          "patient-registration-form",
                        ) as HTMLFormElement | null
                      )?.requestSubmit();
                    }}
                  />
                </Card>
              )}
              {!canLookupIdentity && (
                <Alert severity="warning">
                  Your role cannot search patient identities here. Follow your
                  clinic&apos;s identity-check procedure before creating a
                  record.
                </Alert>
              )}
              <Card title="Patient registration">
                <Box sx={{ display: submittedIdentity ? "none" : undefined }}>
                  <PatientRegistrationForm
                    onSuccess={createdPath("/clinic/patients")}
                    reviewedIdentity={reviewedIdentity}
                    onIdentityReviewRequired={
                      canLookupIdentity ? setSubmittedIdentity : undefined
                    }
                  />
                </Box>
              </Card>
            </Stack>
          )}
        </Box>
      ) : (
        <Alert severity="error">
          You do not have permission to register a patient.
        </Alert>
      )}
    </>
  );
}

function PatientLookup({ onProceed }: { onProceed?: () => void } = {}) {
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
      {lookupQuery && (
        <PatientLookupResults
          key={lookupQuery}
          search={lookupQuery}
          onProceed={onProceed}
        />
      )}
    </Stack>
  );
}

export function PatientLookupResults({
  search,
  onProceed,
}: {
  search: string;
  onProceed?: () => void;
}) {
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
      <Stack spacing={1.5}>
        <Typography color="text.secondary">
          No matching patients were found. Check the information you entered
          before creating a new record.
        </Typography>
        {onProceed && (
          <Button onClick={onProceed} variant="contained">
            Continue to registration
          </Button>
        )}
      </Stack>
    );

  const data = lookup.data;

  return (
    <Stack spacing={2}>
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
                Clinic reference: {patient.reference?.trim() || "Not recorded"}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                Date of birth: {patient.date_of_birth || "Not recorded"} ·
                Phone: {patient.phone_hint || "Not recorded"}
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
              More than 25 matches were found. Use a more specific name or
              clinic reference.
            </Typography>
          </Box>
        )}
      </Stack>
      {onProceed && (
        <Stack spacing={1}>
          <Alert severity="warning">
            If this person matches a record above, open that patient. Continue
            only when staff have confirmed this is a different person.
          </Alert>
          <Button onClick={onProceed} variant="outlined">
            Register a separate patient
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

function PatientSubmittedIdentityReview({
  values,
  onEdit,
  onProceed,
  correction,
}: {
  values: RegistrationValues;
  correction?: { patientId: number; before: RegistrationValues };
  onEdit: () => void;
  onProceed: () => void;
}) {
  const searches = registrationIdentitySearches(values);
  const searchSignature = searches.join("|");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    patients: Patient[];
    incomplete: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!searches.length) return;
    const abort = new AbortController();
    setResult(null);
    Promise.all(
      searches.map((search) =>
        api<{ patients: Patient[]; pagination: Pagination }>(
          `/api/clinic/patients/lookup?${search}&page=1&per_page=100`,
          { signal: abort.signal },
        ),
      ),
    )
      .then((responses) => {
        if (abort.signal.aborted) return;
        setResult({
          patients: Array.from(
            new Map(
              responses
                .flatMap((response) => response.patients)
                .filter((patient) => patient.id !== correction?.patientId)
                .map((patient) => [patient.id, patient]),
            ).values(),
          ),
          incomplete: responses.some(
            (response) => response.pagination.total > response.patients.length,
          ),
        });
      })
      .catch((reason: unknown) => {
        if (abort.signal.aborted) return;
        setResult({
          patients: [],
          incomplete: false,
          error:
            reason instanceof Error
              ? reason.message
              : "The identity check could not be completed.",
        });
      });
    return () => abort.abort();
  }, [searchSignature, revision, correction?.patientId]);

  return (
    <Stack spacing={1.5}>
      {correction && (
        <TableContainer>
          <Table size="small" aria-label="Identity correction comparison">
            <TableHead>
              <TableRow>
                <TableCell>Identity field</TableCell>
                <TableCell>Currently saved</TableCell>
                <TableCell>Proposed correction</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {registrationIdentityFields.map(([field, label]) => (
                <TableRow key={field}>
                  <TableCell component="th" scope="row">
                    {label}
                  </TableCell>
                  <TableCell>
                    {correction.before[field] || "Not recorded"}
                  </TableCell>
                  <TableCell>{values[field] || "Not recorded"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Alert severity="info">
        {correction
          ? "Review the correction for this patient before saving: "
          : "Review the identity entered in registration before creating a chart: "}
        {values.display_name || "Name not entered"} · DOB{" "}
        {values.date_of_birth || "not recorded"} · clinic reference{" "}
        {values.reference || "not entered"}.
      </Alert>
      {!searches.length && (
        <Alert severity="warning">
          Enter at least two name or reference characters, a complete birth
          date, or a complete phone number before registering.
        </Alert>
      )}
      {searches.length > 0 && !result && (
        <Typography role="status">Checking the submitted identity…</Typography>
      )}
      {result?.error && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => setRevision((value) => value + 1)}>
              Retry
            </Button>
          }
        >
          {result.error}
        </Alert>
      )}
      {result && !result.error && (
        <>
          {result.patients.length ? (
            <Stack
              component="ul"
              spacing={1}
              sx={{ listStyle: "none", m: 0, p: 0 }}
            >
              {result.patients.map((patient) => (
                <Box
                  component="li"
                  key={patient.id}
                  sx={{ border: "1px solid", borderColor: "divider", p: 1.5 }}
                >
                  <Typography sx={{ fontWeight: 600 }}>
                    {patient.display_name}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Clinic reference:{" "}
                    {patientReferenceLabel(patient.reference) ?? "Not recorded"}{" "}
                    · DOB {patient.date_of_birth || "Not recorded"} · Phone{" "}
                    {patient.phone_hint || "Not recorded"}
                  </Typography>
                  <Button
                    component="a"
                    href={`/clinic/patients/${patient.id}`}
                    variant="outlined"
                  >
                    Open patient
                  </Button>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography>
              {correction
                ? "No other matching patients were found for the proposed identity."
                : "No matching patients were found for the submitted details."}
            </Typography>
          )}
          {result.incomplete && (
            <Alert severity="warning">
              A search returned more than 100 records. Narrow the identity
              details before{" "}
              {correction ? "saving this correction" : "registering"}.
            </Alert>
          )}
          {!result.incomplete && (
            <Alert severity="warning">
              {correction
                ? "Keep editing if another record might belong to this person. Save only after confirming the correction belongs to this patient and any matches are different people. This action does not merge or relink records."
                : "Open an existing record if it belongs to this person. Register a separate patient only after confirming these are different people."}
            </Alert>
          )}
        </>
      )}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Button onClick={onEdit} variant="outlined">
          Edit registration details
        </Button>
        <Button
          disabled={!result || Boolean(result.error) || result.incomplete}
          onClick={onProceed}
          variant="contained"
        >
          {correction
            ? "Save identity correction"
            : "Register a separate patient"}
        </Button>
      </Stack>
    </Stack>
  );
}

function PatientRecord({
  canEditRegistration,
  canInvitePortal,
  notes,
  onRegistrationSaved,
  patient,
  portalAccess,
  activityHistory,
}: {
  canEditRegistration: boolean;
  canInvitePortal: boolean;
  notes?: LegacyNote[];
  onRegistrationSaved: () => void;
  patient: Patient;
  portalAccess?: PortalAccess | null;
  activityHistory?: PatientActivityHistory;
}) {
  const { registerBlocker } = useClinicNavigation();
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [registrationDirty, setRegistrationDirty] = useState(false);
  const [discardPending, setDiscardPending] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [mergeReason, setMergeReason] = useState("");
  const [mergeError, setMergeError] = useState("");
  const [mergeBusy, setMergeBusy] = useState(false);
  const registrationDialogRef = useRef<HTMLDivElement>(null);
  const registrationAnchorRef = useRef<HTMLButtonElement>(null);
  const registrationDialogInsets = useRegistrationDialogViewport(
    registrationOpen,
    registrationAnchorRef,
  );
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
    if (
      registrationDialogRef.current?.querySelector(
        'form[data-registration-saving="true"]',
      )
    )
      return;
    if (
      registrationDialogRef.current?.querySelector(
        'form[data-registration-pending="true"]',
      )
    ) {
      // Closing is not discarding: the exact attempt remains in its private
      // working copy and is recovered when this editor is opened again.
      setDiscardPending(false);
      setRegistrationOpen(false);
      return;
    }
    if (registrationDirty) setDiscardPending(true);
    else setRegistrationOpen(false);
  };
  const reference = patientReferenceLabel(patient.reference);
  return (
    <>
      <Stack spacing={1} sx={{ mb: 2 }}>
        <Button
          component="a"
          href="/clinic/patients"
          sx={{ alignSelf: "flex-start", minHeight: 44 }}
        >
          Patients
        </Button>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              md: "minmax(0, 1fr) minmax(18rem, 24rem)",
            },
            gap: 2,
            alignItems: "start",
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">
              Patient record
            </Typography>
            <Typography
              component="h1"
              variant="h4"
              sx={{ mb: 1, overflowWrap: "anywhere" }}
            >
              {patient.display_name}
            </Typography>
            <Stack spacing={0.25}>
              <Typography variant="body2">
                Clinic reference: {reference ?? "Not recorded"}
              </Typography>
              <Typography variant="body2">
                Date of birth:{" "}
                {patient.demographics?.date_of_birth ||
                  patient.date_of_birth ||
                  "Not recorded"}
              </Typography>
            </Stack>
          </Box>
          <ActiveEncounterAction patientId={patient.id} />
        </Box>
      </Stack>
      {canInvitePortal && (
        <PatientPortalInvitation
          patient={patient}
          portalAccess={portalAccess}
        />
      )}
      {canEditRegistration && (
        <>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            <Button
              ref={registrationAnchorRef}
              onClick={() => setRegistrationOpen(true)}
              variant="outlined"
            >
              Edit registration
            </Button>
            <Button
              color="warning"
              onClick={() => setMergeOpen(true)}
              variant="outlined"
            >
              Merge duplicate
            </Button>
          </Stack>
          <Dialog
            container={() =>
              registrationAnchorRef.current?.closest<HTMLElement>(
                ".clinic-theme",
              ) ??
              registrationAnchorRef.current?.ownerDocument.body ??
              null
            }
            sx={{
              ...registrationDialogInsets,
              "& .MuiDialog-paper": {
                m: { xs: 1.5, sm: 3 },
                width: { xs: "calc(100% - 24px)", sm: "calc(100% - 48px)" },
                maxHeight: { xs: "calc(100% - 24px)", sm: "calc(100% - 48px)" },
              },
            }}
            fullWidth
            maxWidth="md"
            onClose={closeRegistration}
            open={registrationOpen}
            aria-labelledby="patient-registration-dialog-title"
          >
            <DialogTitle
              id="patient-registration-dialog-title"
              sx={{ flexShrink: 0 }}
            >
              Edit registration details
            </DialogTitle>
            <DialogContent
              dividers
              ref={registrationDialogRef}
              sx={{
                minHeight: 0,
                overflowY: "auto",
                "& .form-field-hint": { display: "grid", gap: 0.25 },
                "& .form-field-hint > span": { display: "block" },
              }}
            >
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
                              'form[data-registration-saving="true"], form[data-registration-pending="true"]',
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
            <DialogActions sx={{ flexShrink: 0, p: 2 }}>
              <Button onClick={closeRegistration}>Cancel</Button>
            </DialogActions>
          </Dialog>
          <Dialog
            fullWidth
            maxWidth="sm"
            open={mergeOpen}
            onClose={() => !mergeBusy && setMergeOpen(false)}
          >
            <DialogTitle>Merge duplicate patient</DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ pt: 1 }}>
                <Alert severity="warning">
                  This hides {patient.display_name} as the duplicate. Confirm
                  the canonical patient ID from the patient directory. A
                  duplicate with linked activity must be reconciled before it
                  can be merged. Registration details stay on the hidden record;
                  copy anything needed to the canonical chart first.
                </Alert>
                <TextField
                  label="Canonical patient ID"
                  value={mergeTarget}
                  onChange={(event) =>
                    setMergeTarget(event.target.value.replace(/\D/g, ""))
                  }
                  required
                />
                <TextField
                  label="Merge reason"
                  value={mergeReason}
                  onChange={(event) => setMergeReason(event.target.value)}
                  multiline
                  required
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                />
                {mergeError && <Alert severity="error">{mergeError}</Alert>}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={mergeBusy} onClick={() => setMergeOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={mergeBusy || !mergeTarget || !mergeReason.trim()}
                color="warning"
                variant="contained"
                onClick={async () => {
                  setMergeBusy(true);
                  setMergeError("");
                  try {
                    const result = await api<{ canonical_patient_id: number }>(
                      `/api/clinic/patients/${patient.id}/merge`,
                      {
                        method: "POST",
                        body: {
                          merge: {
                            target_patient_id: mergeTarget,
                            reason: mergeReason.trim(),
                          },
                        },
                      },
                    );
                    window.location.assign(
                      `/clinic/patients/${result.canonical_patient_id}`,
                    );
                  } catch (reason) {
                    setMergeError(
                      reason instanceof Error
                        ? reason.message
                        : "Unable to merge this duplicate patient.",
                    );
                    setMergeBusy(false);
                  }
                }}
              >
                {mergeBusy ? "Merging…" : "Merge duplicate"}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
      <PatientDetails
        patient={patient}
        onCoordinationSaved={onRegistrationSaved}
      />
      <Typography component="h2" variant="h6" sx={{ mt: 2, mb: 1 }}>
        History and source records
      </Typography>
      <Accordion>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          id="patient-activity-heading"
          aria-controls="patient-activity-content"
          sx={{ minHeight: 44 }}
        >
          <Typography component="span" variant="subtitle1">
            Patient activity
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
            Authorized record activity, newest first. This view shows version
            and revision metadata only, without previous field values or
            clinical content. It follows the patient’s lineage across
            registration, care coordination, membership, payment, scheduling,
            encounters, notes, invoices, and reminders; sources you cannot
            access are called out instead of appearing empty.
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
                    <Box component="li" key={`${entry.source}:${entry.id}`}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {entry.section} ·{" "}
                        {entry.event === "create"
                          ? "Created"
                          : entry.event === "update"
                            ? "Updated"
                            : entry.event === "recorded"
                              ? "Recorded"
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
                          : entry.event === "recorded"
                            ? "Revision recorded"
                            : "Record version updated"}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
              {activityHistory.has_more && (
                <Typography variant="body2">
                  Showing the latest 25 events from included sources. Older
                  activity metadata remains in the underlying records.
                </Typography>
              )}
            </Stack>
          )}
        </AccordionDetails>
      </Accordion>
      <PatientDocumentProvenance patientId={patient.id} />
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
  status: PortalAccess["status"];
};

function PatientPortalInvitation({
  patient,
  portalAccess,
}: {
  patient: Patient;
  portalAccess?: PortalAccess | null;
}) {
  const currentEmail = patient.contacts?.find(
    (contact) => contact.contact_type === "email" && !contact.effective_until,
  )?.contact_value;
  const [expanded, setExpanded] = useState(false);
  const [invitation, setInvitation] = useState<PortalInvitation | null>(null);
  const [currentAccess, setCurrentAccess] = useState(portalAccess);
  useEffect(() => setCurrentAccess(portalAccess), [portalAccess]);
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
      setCurrentAccess({
        status: result.invitation.status,
        invitation_expires_at: result.invitation.expires_at,
        activated_at: portalAccess?.activated_at ?? null,
        invitation_open: result.invitation.purpose === "activation",
      });
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
    <Accordion
      expanded={expanded || busy || Boolean(error)}
      onChange={(_event, nextExpanded) => {
        if (!busy && !error) setExpanded(nextExpanded);
      }}
      slotProps={{
        heading: { component: "h2" },
        transition: { unmountOnExit: false },
      }}
      sx={{ mb: 2 }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        id="patient-portal-access-heading"
        aria-controls="patient-portal-access-content"
        sx={{ minHeight: 44 }}
      >
        <Typography component="span" variant="subtitle1">
          Patient portal access
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.5}>
          {currentAccess?.status === "active" ? (
            <Alert severity="success">
              Portal access is linked to this patient record.
              {currentAccess.activated_at &&
                ` Activated ${new Date(currentAccess.activated_at).toLocaleString()}.`}
            </Alert>
          ) : currentAccess?.status === "invited" ? (
            <Alert
              severity={currentAccess.invitation_open ? "info" : "warning"}
            >
              {currentAccess.invitation_open
                ? "A portal invitation is pending for this patient record."
                : "The previous portal invitation expired. Create a new link if access is still needed."}
            </Alert>
          ) : currentAccess?.status === "revoked" ? (
            <Alert severity="warning">
              Previous portal access was revoked for this patient record.
            </Alert>
          ) : (
            <Alert severity="info">
              No portal account is linked to this patient record.
            </Alert>
          )}
          <Typography color="text.secondary">
            Create a one-time link for the current patient email. It activates
            new access or securely resets an existing password, and expires
            after 30 minutes.
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
      </AccordionDetails>
    </Accordion>
  );
}

function ActiveEncounterAction({ patientId }: { patientId: number }) {
  const timezone = useClinic().practice.timezone;
  const { data, error, refresh } = useResource<{
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
        <p>Unable to check for an open visit: {error}</p>
        <Button onClick={refresh}>Retry open visit lookup</Button>
      </Card>
    );
  const encounter = data?.encounters[0];
  if (
    encounter &&
    (encounter.patient_id !== patientId ||
      !Number.isSafeInteger(encounter.id) ||
      encounter.id <= 0 ||
      encounter.status !== "open")
  )
    return (
      <Card title="Active visit">
        <Alert severity="error">
          The returned visit does not match this patient or is no longer open.
          Reload the visit list before continuing.
        </Alert>
        <Button onClick={refresh}>Reload visits</Button>
      </Card>
    );
  if (!encounter)
    return (
      <Card title="Active visit">
        <p>No open visit is recorded.</p>
      </Card>
    );
  return (
    <Card title="Active visit">
      <p>
        Open encounter #{encounter.id}, started{" "}
        {clinicDateTime(encounter.started_at, timezone)}. Confirm the patient and
        encounter when resuming.
      </p>
      <Button
        component="a"
        href={`/clinic/patients/${patientId}/encounters/${encounter.id}`}
        variant="contained"
      >
        Resume entry
      </Button>
    </Card>
  );
}

type RegistrationValues = Record<string, string>;

const registrationIdentityFields = [
  ["display_name", "Name shown in chart"],
  ["legal_name", "Legal name"],
  ["preferred_name", "Preferred name"],
  ["reference", "Clinic reference"],
  ["date_of_birth", "Date of birth"],
  ["contact_type", "Contact type"],
  ["contact_value", "Contact value"],
] as const;

export function registrationIdentitySignature(values: RegistrationValues) {
  return JSON.stringify(
    registrationIdentityFields.map(
      ([field]) => values[field]?.trim().toLocaleLowerCase() ?? "",
    ),
  );
}

function registrationIdentityCorrectionSignature(values: RegistrationValues) {
  return JSON.stringify(
    registrationIdentityFields.map(([field]) => values[field] ?? ""),
  );
}

export function registrationIdentityCorrectionRequired(
  values: RegistrationValues,
  baseline: RegistrationValues,
  reviewedIdentity: string | null,
  exactRetry: boolean,
) {
  return (
    !exactRetry &&
    registrationIdentityCorrectionSignature(values) !==
      registrationIdentityCorrectionSignature(baseline) &&
    registrationIdentityCorrectionSignature(values) !== reviewedIdentity
  );
}

export function registrationIdentityReviewRequired(
  values: RegistrationValues,
  reviewedIdentity: string | null | undefined,
  exactRetry: boolean,
) {
  return (
    !exactRetry && registrationIdentitySignature(values) !== reviewedIdentity
  );
}

export function registrationIdentitySearches(values: RegistrationValues) {
  const searches = new Set<string>();
  ["display_name", "legal_name", "preferred_name", "reference"].forEach(
    (field) => {
      const query = values[field]?.trim();
      if (query && query.length >= 2) {
        searches.add(new URLSearchParams({ q: query }).toString());
      }
    },
  );
  if (/^\d{4}-\d{2}-\d{2}$/.test(values.date_of_birth ?? "")) {
    searches.add(
      new URLSearchParams({ date_of_birth: values.date_of_birth }).toString(),
    );
  }
  if (values.contact_type === "phone") {
    const phone = (values.contact_value ?? "").replace(/\D/g, "");
    if (phone.length >= 7 && phone.length <= 15) {
      searches.add(new URLSearchParams({ phone }).toString());
    }
  }
  return Array.from(searches);
}
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

export function registrationContactError(values: RegistrationValues) {
  const value = values.contact_value?.trim() ?? "";
  if (!value) return "";

  if (values.contact_type === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? ""
      : "Enter a valid email address.";
  }

  const digits = value.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15 ? "" : "Enter a valid phone number.";
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

function RegistrationLanguageField({
  initialValue,
  onSelectionChange,
}: {
  initialValue: string;
  onSelectionChange: (form: HTMLFormElement) => void;
}) {
  const [language, setLanguage] = useState(initialValue);
  const input = useRef<HTMLInputElement>(null);
  return (
    <Autocomplete
      freeSolo
      options={registrationLanguageSuggestions}
      value={language || null}
      inputValue={language}
      onInputChange={(_event, value, reason) => {
        if (reason === "input" || reason === "clear") setLanguage(value);
      }}
      onChange={(_event, value) => {
        flushSync(() => setLanguage(value ?? ""));
        if (input.current?.form) onSelectionChange(input.current.form);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          inputRef={input}
          name="clinic_patient[primary_language]"
          label="Preferred language"
          helperText="Search suggestions or enter the patient's language in their own words."
          slotProps={{
            ...params.slotProps,
            htmlInput: { ...params.slotProps.htmlInput, maxLength: 80 },
          }}
        />
      )}
    />
  );
}

function PatientFields({
  values,
  onSaveSection,
  onCompletionChange,
  onFieldChange,
}: {
  values: RegistrationValues;
  onSaveSection: (form: HTMLFormElement) => Promise<boolean>;
  onCompletionChange: (complete: boolean) => void;
  onFieldChange: (form: HTMLFormElement) => void;
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
            <RegistrationLanguageField
              initialValue={values.primary_language}
              onSelectionChange={onFieldChange}
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
  reviewedIdentity,
  onIdentityReviewRequired,
}: {
  patient?: Patient;
  onSuccess?: (result: Record<string, unknown> | undefined) => void;
  reviewedIdentity?: string | null;
  onIdentityReviewRequired?: (values: RegistrationValues) => void;
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
      reviewedIdentity={reviewedIdentity}
      onIdentityReviewRequired={onIdentityReviewRequired}
    />
  );
}

function PatientRegistrationEditor({
  patient,
  initialDraft,
  workingDraft,
  onReloadDraft,
  onSuccess,
  reviewedIdentity,
  onIdentityReviewRequired,
}: {
  patient?: RegistrationPatient;
  initialDraft: RegistrationDraft | null;
  workingDraft: ReturnType<typeof useWorkingDraft<RegistrationDraft>>;
  onReloadDraft: (snapshot: RegistrationDraft) => void;
  onSuccess?: (result: Record<string, unknown> | undefined) => void;
  reviewedIdentity?: string | null;
  onIdentityReviewRequired?: (values: RegistrationValues) => void;
}) {
  const { registerBlocker } = useClinicNavigation();
  const initialValues = useMemo(
    () => initialDraft?.body.clinic_patient ?? registrationValues(patient),
    [initialDraft, patient],
  );
  const requestKey = useRef(initialDraft?.requestKey || crypto.randomUUID());
  const expectedUpdatedAt = useRef(patient?.updated_at);
  const formRef = useRef<HTMLFormElement>(null);
  const identityBaseline = useRef(registrationValues(patient));
  const reviewedCorrection = useRef<string | null>(null);
  const [identityCorrection, setIdentityCorrection] =
    useState<RegistrationValues | null>(null);
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
  const completed = useRef(false);
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
    const officialAddress = structuredAddress;
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
      data-registration-saving={busy || inFlight.current}
      data-registration-pending={Boolean(attempt.current)}
      ref={formRef}
      id={patient ? undefined : "patient-registration-form"}
      onInput={(event) => {
        setSectionsComplete(false);
        queueAutosave(event.currentTarget);
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (inFlight.current || completed.current) return;
        const form = event.currentTarget;
        inFlight.current = true;
        if (autosaveTimer.current) {
          window.clearTimeout(autosaveTimer.current);
          autosaveTimer.current = undefined;
        }
        const current = attempt.current ?? snapshotFrom(event.currentTarget);
        const previouslyUnconfirmed =
          outcomeUnconfirmed || Boolean(attempt.current?.outcomeUnconfirmed);
        const contactError = registrationContactError(
          current.body.clinic_patient,
        );
        if (contactError) {
          setError(contactError);
          event.currentTarget
            .querySelector<HTMLInputElement>(
              '[name="clinic_patient[contact_value]"]',
            )
            ?.focus();
          inFlight.current = false;
          return;
        }
        if (
          !patient &&
          onIdentityReviewRequired &&
          registrationIdentityReviewRequired(
            current.body.clinic_patient,
            reviewedIdentity,
            Boolean(attempt.current),
          )
        ) {
          lastSnapshot.current = current;
          if (!(await workingDraft.save(current))) {
            setError(
              "The working copy could not be saved. Keep this page open and retry the identity review.",
            );
          } else {
            setDirty(true);
            setError("");
            onIdentityReviewRequired(current.body.clinic_patient);
          }
          inFlight.current = false;
          return;
        }
        if (
          patient &&
          registrationIdentityCorrectionRequired(
            current.body.clinic_patient,
            identityBaseline.current,
            reviewedCorrection.current,
            Boolean(attempt.current),
          )
        ) {
          lastSnapshot.current = current;
          if (!(await workingDraft.save(current))) {
            setError(
              "The working copy could not be saved. Keep this page open and retry the identity review.",
            );
          } else {
            setDirty(true);
            setError("");
            setIdentityCorrection(current.body.clinic_patient);
          }
          inFlight.current = false;
          return;
        }
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
          completed.current = true;
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
            previouslyUnconfirmed ||
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
                identityBaseline.current = registrationValues(
                  refreshed.patient,
                );
                reviewedCorrection.current = null;
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
          if (
            unknown ||
            !(reason instanceof ApiError && reason.code === "stale_record")
          )
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
              onFieldChange={(form) => {
                setSectionsComplete(false);
                queueAutosave(form);
              }}
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
          disabled={
            busy ||
            completed.current ||
            (!patient && !sectionsComplete && !outcomeUnconfirmed)
          }
        >
          {busy
            ? "Saving…"
            : outcomeUnconfirmed
              ? "Retry same request"
              : patient
                ? "Save registration details"
                : "Register patient"}
        </Button>
        <Dialog
          open={Boolean(identityCorrection)}
          onClose={() => setIdentityCorrection(null)}
          fullWidth
          maxWidth="md"
          aria-labelledby="identity-correction-title"
        >
          <DialogTitle id="identity-correction-title">
            Review identity correction
          </DialogTitle>
          <DialogContent>
            {patient && identityCorrection && (
              <PatientSubmittedIdentityReview
                values={identityCorrection}
                correction={{
                  patientId: patient.id,
                  before: identityBaseline.current,
                }}
                onEdit={() => setIdentityCorrection(null)}
                onProceed={() => {
                  reviewedCorrection.current =
                    registrationIdentityCorrectionSignature(identityCorrection);
                  setIdentityCorrection(null);
                  formRef.current?.requestSubmit();
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </Stack>
    </Box>
  );
}

function PatientDetails({
  patient,
  onCoordinationSaved,
}: {
  patient: Patient;
  onCoordinationSaved: () => void;
}) {
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
      <PatientCareCoordination
        patientId={patient.id}
        onSaved={onCoordinationSaved}
      />
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
