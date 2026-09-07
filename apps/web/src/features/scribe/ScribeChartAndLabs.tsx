import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { LabReport } from "../clinic/PatientLabReports";

type ClinicalEncounter = {
  id: number;
  occurred_at?: string | null;
  started_at?: string | null;
  status: string;
  version?: number;
};
type Props = {
  scribeEncounterId: number;
  patientId: number;
  clinicalEncounterId?: number | null;
  expectedVersion: number;
  labSelections: { lab_report_version_id: number }[];
  canBind: boolean;
  canSelectLabs: boolean;
  hasUnsavedReview: boolean;
  onChanged: () => void;
};

export function ScribeChartAndLabs({
  scribeEncounterId,
  patientId,
  clinicalEncounterId,
  expectedVersion,
  labSelections,
  canBind,
  canSelectLabs,
  hasUnsavedReview,
  onChanged,
}: Props) {
  const [encounters, setEncounters] = useState<ClinicalEncounter[]>([]);
  const [reports, setReports] = useState<LabReport[]>([]);
  const [selectedEncounter, setSelectedEncounter] = useState("");
  const [selectedLabs, setSelectedLabs] = useState<number[]>(
    labSelections.map((item) => item.lab_report_version_id),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const selectionKey = labSelections
    .map((item) => item.lab_report_version_id)
    .sort((left, right) => left - right)
    .join(",");
  useEffect(() => {
    setSelectedLabs(
      selectionKey ? selectionKey.split(",").map((value) => Number(value)) : [],
    );
  }, [scribeEncounterId, selectionKey]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<{ encounters: ClinicalEncounter[] }>(
        `/api/clinic/patients/${patientId}/encounters`,
        { signal: controller.signal },
      ),
      api<{ reports: LabReport[] }>(
        `/api/clinic/patients/${patientId}/lab_reports?page=1&per_page=100`,
        { signal: controller.signal },
      ),
    ])
      .then(([encounterResult, reportResult]) => {
        if (!controller.signal.aborted) {
          setEncounters(encounterResult.encounters);
          setReports(reportResult.reports);
        }
      })
      .catch(
        (reason: unknown) =>
          !controller.signal.aborted &&
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load chart and lab context.",
          ),
      );
    return () => controller.abort();
  }, [patientId, refresh]);
  const bind = async () => {
    if (!selectedEncounter || hasUnsavedReview) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/clinic/scribe/encounters/${scribeEncounterId}/bind_clinical_encounter`,
        {
          method: "POST",
          body: {
            clinical_encounter: {
              clinical_encounter_id: Number(selectedEncounter),
              expected_version: expectedVersion,
            },
          },
        },
      );
      setRefresh((current) => current + 1);
      onChanged();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to bind the clinical encounter.",
      );
    } finally {
      setBusy(false);
    }
  };
  const saveLabs = async () => {
    if (hasUnsavedReview) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/clinic/scribe/encounters/${scribeEncounterId}/lab_selections`,
        {
          method: "POST",
          body: {
            lab_selections: {
              lab_report_version_ids: selectedLabs,
              expected_version: expectedVersion,
            },
          },
        },
      );
      setRefresh((current) => current + 1);
      onChanged();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save lab selections.",
      );
    } finally {
      setBusy(false);
    }
  };
  const eligibleReports = reports.filter(
    (report) =>
      report.current_version.reviewed_at &&
      ["final", "amended", "corrected"].includes(report.current_version.status),
  );
  const eligibleIds = new Set(
    eligibleReports.map((report) => report.current_version.id),
  );
  const staleSelections = labSelections.filter(
    (selection) => !eligibleIds.has(selection.lab_report_version_id),
  );
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Box>
          <Typography variant="subtitle1">Chart and labs</Typography>
          <Typography variant="body2" color="text.secondary">
            Bind this scribe session to one recorded clinical encounter and
            choose reviewed lab versions as note context.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The encounter list shows the most recent recorded encounters.
          </Typography>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        {hasUnsavedReview && (
          <Alert severity="warning">
            Save or discard note edits before changing chart or lab context.
          </Alert>
        )}
        <TextField
          select
          label="Clinical encounter"
          value={selectedEncounter || String(clinicalEncounterId ?? "")}
          onChange={(event) => setSelectedEncounter(event.target.value)}
          disabled={!canBind || busy || hasUnsavedReview}
        >
          <MenuItem value="">Choose encounter</MenuItem>
          {encounters.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              #{item.id} · {item.status} ·{" "}
              {item.occurred_at || item.started_at || "Date not recorded"}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="outlined"
          disabled={!canBind || !selectedEncounter || busy || hasUnsavedReview}
          onClick={() => void bind()}
        >
          Bind encounter
        </Button>
        <Stack spacing={0.5}>
          {staleSelections.length > 0 && (
            <Alert severity="warning">
              A selected lab version is no longer current or eligible. Review
              the current version and select it before saving.
            </Alert>
          )}
          {eligibleReports.map((report) => (
            <FormControlLabel
              key={report.id}
              control={
                <Checkbox
                  checked={selectedLabs.includes(report.current_version.id)}
                  disabled={!canSelectLabs || busy || hasUnsavedReview}
                  onChange={(event) =>
                    setSelectedLabs((current) =>
                      event.target.checked
                        ? [...current, report.current_version.id]
                        : current.filter(
                            (id) => id !== report.current_version.id,
                          ),
                    )
                  }
                />
              }
              label={`${report.current_version.title} · ${report.current_version.status} · reviewed`}
            />
          ))}
        </Stack>
        <Button
          variant="outlined"
          disabled={
            !canSelectLabs ||
            busy ||
            hasUnsavedReview ||
            staleSelections.length > 0
          }
          onClick={() => void saveLabs()}
        >
          Save lab selections
        </Button>
      </Stack>
    </Paper>
  );
}
