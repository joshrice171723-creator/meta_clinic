import { useEffect, useState } from "react";
import { Button } from "@mui/material";
import type {
  Encounter,
  Patient,
  PreviousSignedSoapResponse,
} from "../../api/contracts";
import { api } from "../../api/client";
import { Card, ErrorMessage, LoadState } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { useClinicNavigation } from "./clinicNavigation";
import { patientReferenceLabel } from "./patientReference";

type ChartSelectionPageProps = {
  mode: "current" | "previous";
  patientId?: string;
  encounterId?: string;
  boardVisitId?: string;
};

type ReadyState = {
  patient: Patient;
  encounters: Encounter[];
  selectedEncounter?: Encounter;
};
type SignedChart = NonNullable<PreviousSignedSoapResponse["chart"]>;
const RECENT_ENCOUNTER_LIMIT = 10;

export function recentEncounterPath(patientId: string | number) {
  return `/api/clinic/patients/${encodeURIComponent(String(patientId))}/encounters?status=open&page=1&per_page=${RECENT_ENCOUNTER_LIMIT}`;
}

function dateLabel(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "Date not recorded";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(date);
  } catch {
    return "Date not recorded";
  }
}

function encounterHref(patientId: number, encounterId: number) {
  return `/clinic/patients/${patientId}/encounters/${encounterId}`;
}

async function loadRecentEncounters(
  patientId: string,
  signal: AbortSignal,
  encounterId?: string,
) {
  if (encounterId) {
    const response = await api<{ encounter: Encounter }>(
      `/api/clinic/encounters/${encodeURIComponent(encounterId)}?patient_id=${encodeURIComponent(patientId)}`,
      { signal },
    );
    if (
      response.encounter.patient_id !== Number(patientId) ||
      response.encounter.id !== Number(encounterId)
    )
      throw new Error(
        "The returned encounter does not match the selected patient and visit.",
      );
    return [response.encounter];
  }
  const response = await api<{
    encounters: Encounter[];
    pagination: { total_pages: number };
  }>(recentEncounterPath(patientId), { signal });
  if (
    response.encounters.some(
      (encounter) =>
        encounter.patient_id !== Number(patientId) ||
        !Number.isSafeInteger(encounter.id) ||
        encounter.id <= 0 ||
        encounter.status !== "open",
    )
  )
    throw new Error("The returned open visits do not match this patient.");
  return response.encounters;
}

export function ChartSelectionPage({
  mode,
  patientId,
  encounterId,
  boardVisitId,
}: ChartSelectionPageProps) {
  const timezone = useClinic().practice.timezone;
  const { navigate } = useClinicNavigation();
  const [state, setState] = useState<
    | { status: "synthetic" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; value: ReadyState }
    | { status: "previous"; value: ReadyState; signedChart: SignedChart | null }
  >(patientId ? { status: "loading" } : { status: "synthetic" });

  useEffect(() => {
    if (!patientId) {
      setState({ status: "synthetic" });
      return;
    }
    const abort = new AbortController();
    const encodedPatientId = encodeURIComponent(patientId);
    setState({ status: "loading" });
    const patientRequest = api<{ patient: Patient }>(
      `/api/clinic/patients/${encodedPatientId}`,
      { signal: abort.signal },
    );
    const request =
      mode === "previous"
        ? Promise.all([
            patientRequest,
            api<PreviousSignedSoapResponse>(
              `/api/clinic/patients/${encodedPatientId}/previous_signed_soap${
                encounterId
                  ? `?exclude_encounter_id=${encodeURIComponent(encounterId)}`
                  : ""
              }`,
              { signal: abort.signal },
            ),
          ])
        : Promise.all([
            patientRequest,
            loadRecentEncounters(patientId, abort.signal, encounterId),
          ]);
    void request
      .then(([patientResponse, secondResponse]) => {
        if (abort.signal.aborted) return;
        if (patientResponse.patient.id !== Number(patientId))
          throw new Error(
            "The returned patient does not match the selected chart.",
          );
        if (mode === "previous") {
          const previousResponse = secondResponse as PreviousSignedSoapResponse;
          if (
            previousResponse.patient_id !== Number(patientId) ||
            previousResponse.excluded_encounter_id !==
              (encounterId ? Number(encounterId) : null)
          )
            throw new Error(
              "The signed chart search does not match this patient and encounter.",
            );
          const signedChart = previousResponse.chart;
          if (signedChart) {
            navigate(
              encounterHref(
                patientResponse.patient.id,
                signedChart.encounter_id,
              ),
              { replace: true },
            );
            return;
          }
          setState({
            status: "previous",
            value: { patient: patientResponse.patient, encounters: [] },
            signedChart,
          });
          return;
        }
        const encounters = secondResponse as Encounter[];
        const currentEncounterId = encounterId
          ? Number.isSafeInteger(Number(encounterId))
            ? Number(encounterId)
            : undefined
          : undefined;
        const selectedEncounter = encounterId
          ? encounters.find((encounter) => encounter.id === currentEncounterId)
          : undefined;
        const value = {
          patient: patientResponse.patient,
          encounters,
          selectedEncounter,
        };
        if (selectedEncounter) {
          navigate(
            encounterHref(patientResponse.patient.id, selectedEncounter.id),
            { replace: true },
          );
          return;
        }
        setState({ status: "ready", value });
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to load chart choices.",
        });
      });
    return () => abort.abort();
  }, [encounterId, mode, navigate, patientId]);

  if (
    patientId &&
    (state.status === "ready" || state.status === "previous") &&
    state.value.patient.id !== Number(patientId)
  )
    return <LoadState />;
  if (state.status === "loading") return <LoadState />;
  if (state.status === "error") return <ErrorMessage message={state.message} />;
  if (state.status === "synthetic")
    return (
      <Card title="Select chart">
        <p>
          Tracking row {boardVisitId ?? "without a visit reference"} is not
          linked to a patient record.
        </p>
        <p>
          Confirm the patient in the register before opening a chart. This row
          cannot select or display a clinical record.
        </p>
        <a className="primary-link" href="/clinic/patients">
          Open patient register →
        </a>
      </Card>
    );

  if (state.status === "previous") {
    const { patient, selectedEncounter } = state.value;
    return (
      <Card title="Most recent signed chart">
        <p>
          Patient: <strong>{patient.display_name}</strong>
          {patientReferenceLabel(patient.reference) &&
            ` · Reference: ${patientReferenceLabel(patient.reference)}`}
        </p>
        {state.signedChart ? (
          <p>
            <a
              className="primary-link"
              href={encounterHref(patient.id, state.signedChart.encounter_id)}
            >
              Open signed chart from{" "}
              {dateLabel(state.signedChart.signed_at, timezone)} →
            </a>
          </p>
        ) : (
          <p role="status">
            No signed SOAP chart was found before the current visit.
          </p>
        )}
        {selectedEncounter && (
          <p className="care-muted">
            Current encounter #{selectedEncounter.id} was excluded from this
            search.
          </p>
        )}
      </Card>
    );
  }

  const { patient, encounters, selectedEncounter } = state.value;
  return (
    <Card title="Select current chart">
      <p>
        Patient: <strong>{patient.display_name}</strong>
        {patientReferenceLabel(patient.reference) &&
          ` · Reference: ${patientReferenceLabel(patient.reference)}`}
      </p>
      <p className="care-muted">
        Showing up to {RECENT_ENCOUNTER_LIMIT} recent open visits. Resume entry
        to confirm the patient and encounter. Completed history remains
        available in the patient record.
      </p>
      {encounterId && !selectedEncounter && (
        <p role="alert">
          The requested encounter is not in these recent choices. Choose a
          listed encounter after confirming the patient identity.
        </p>
      )}
      {selectedEncounter ? (
        <p>
          <a
            className="primary-link"
            href={encounterHref(patient.id, selectedEncounter.id)}
          >
            Open current encounter chart →
          </a>
        </p>
      ) : encounters.length === 0 ? (
        <p role="status">No open visits are recorded for this patient.</p>
      ) : (
        <ul className="care-record-list">
          {encounters.map((encounter) => (
            <li key={encounter.id}>
              <div>
                <strong>Encounter #{encounter.id}</strong>
                <span>{dateLabel(encounter.started_at, timezone)}</span>
              </div>
              <span className="care-status">{encounter.status}</span>
              <Button
                component="a"
                href={encounterHref(patient.id, encounter.id)}
                size="small"
              >
                {encounter.status === "open"
                  ? "Resume entry"
                  : "View encounter"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function chartSelectionProps(search = "") {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");
  const validId = (value: string | null) =>
    value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
      ? value
      : undefined;
  return {
    mode: mode === "previous" ? ("previous" as const) : ("current" as const),
    patientId: validId(params.get("patient_id")),
    encounterId: validId(params.get("encounter_id")),
    boardVisitId: params.get("board_visit_id") ?? undefined,
  };
}
