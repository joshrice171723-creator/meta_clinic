import CloseIcon from "@mui/icons-material/Close";
import {
  Button,
  CircularProgress,
  IconButton,
  Typography,
} from "@mui/material";
import type { ClinicCapabilities } from "../../api/contracts";
import { useResource } from "../../shared/ui";
import { patientReferenceLabel } from "./patientReference";
import { useClinicNavigation } from "./clinicNavigation";
import "./patientContextBar.css";

type PatientIdentity = {
  id: number;
  display_name: string;
  reference?: string | null;
};

type PatientLookup = {
  patients: PatientIdentity[];
};

export function clinicPatientContextId(path: string, search: string) {
  const routePatientId = /^\/clinic\/patients\/([1-9]\d*)(?:\/|$)/.exec(
    path,
  )?.[1];
  const queryPatientId = new URLSearchParams(search).get("patient_id");
  const value = routePatientId ?? queryPatientId;
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const patientId = Number(value);
  return Number.isSafeInteger(patientId) ? patientId : null;
}

export function clearPatientContextHref(path: string, search: string) {
  if (/^\/clinic\/patients\/[1-9]\d*(?:\/|$)/.test(path))
    return "/clinic/patients";
  const params = new URLSearchParams(search);
  params.delete("patient_id");
  const nextSearch = params.toString();
  return `${path}${nextSearch ? `?${nextSearch}` : ""}`;
}

export function PatientContextBar({
  path,
  search,
  capabilities,
  practiceName = "Clinic",
  locationName = "All locations",
}: {
  path: string;
  search: string;
  capabilities: ClinicCapabilities;
  practiceName?: string;
  locationName?: string;
}) {
  const { navigate } = useClinicNavigation();
  const patientId = clinicPatientContextId(path, search);
  const encounterId = new URLSearchParams(search).get("encounter_id");
  const canReadIdentity =
    capabilities.patient_identity_read === true ||
    capabilities.patients === true;
  const canOpenPatientRecord = capabilities.patients === true;
  const canSchedule =
    capabilities.appointments === true ||
    (capabilities.appointments_read === true &&
      capabilities.appointments_book === true);
  const identity = useResource<PatientLookup>(
    `/api/clinic/patients/lookup?id=${patientId ?? ""}`,
    { enabled: patientId !== null && canReadIdentity },
  );

  if (patientId === null || !canReadIdentity) return null;
  const patient = identity.data?.patients.find((item) => item.id === patientId);
  const reference = patientReferenceLabel(patient?.reference);
  const clearHref = clearPatientContextHref(path, search);
  const clearContext = () => {
    if (
      encounterId &&
      !window.confirm(
        "Clear the current patient context? Patient record pages return to Patients; other pages retain encounter and other query context.",
      )
    )
      return;
    navigate(clearHref);
  };

  return (
    <section className="clinic-patient-context" aria-label="Current patient">
      <div className="clinic-patient-context-identity">
        <div className="clinic-patient-context-summary">
          <Typography
            className="clinic-patient-context-label"
            component="span"
            variant="caption"
          >
            Current patient
          </Typography>
          {!identity.data && !identity.error ? (
            <span className="clinic-patient-context-loading" role="status">
              <CircularProgress aria-hidden="true" size={14} />
              Loading identity…
            </span>
          ) : patient ? (
            <>
              <strong>{patient.display_name}</strong>
              {reference && (
                <Typography
                  component="span"
                  variant="caption"
                  color="text.secondary"
                >
                  Clinic reference: {reference}
                </Typography>
              )}
              <Typography
                className="clinic-patient-context-scope"
                component="span"
                variant="caption"
                color="text.secondary"
              >
                {practiceName} · {locationName}
                {encounterId
                  ? ` · URL encounter ID: ${encounterId} (unverified)`
                  : ""}
              </Typography>
            </>
          ) : (
            <span role="status">Patient identity unavailable</span>
          )}
        </div>
      </div>
      <div className="clinic-patient-context-actions">
        {identity.error && (
          <Button onClick={identity.refresh} size="small">
            Retry identity
          </Button>
        )}
        {patient && canOpenPatientRecord && (
          <Button
            component="a"
            href={`/clinic/patients/${patient.id}`}
            size="small"
            variant="text"
          >
            Open patient record
          </Button>
        )}
        {patient && canSchedule && (
          <Button
            component="a"
            href={`/clinic/schedule?patient_id=${patient.id}`}
            size="small"
            variant="text"
          >
            Schedule
          </Button>
        )}
        <IconButton
          aria-label="Clear current patient"
          onClick={clearContext}
          size="small"
        >
          <CloseIcon aria-hidden="true" fontSize="small" />
        </IconButton>
      </div>
    </section>
  );
}
