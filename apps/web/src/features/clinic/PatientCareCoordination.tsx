import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api, ApiError, SESSION_CHANGED_EVENT } from "../../api/client";
import { Card, LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { useClinicNavigation } from "./clinicNavigation";

export type CoordinationEntry = {
  name: string;
  practice: string | null;
  phone: string | null;
  address: string | null;
  identifier: string | null;
  identifier_system: string | null;
  source:
    "patient" | "caregiver" | "clinic_staff" | "external_record" | "unknown";
  source_detail: string | null;
  address_confirmed: boolean;
  reference_id: string | null;
};
type CoordinationState =
  "not_recorded" | "known" | "none" | "unknown" | "declined";
type Group = "primary_care" | "specialists" | "pharmacy";
export type CoordinationPayload = Record<
  Group,
  { state: CoordinationState; entries: CoordinationEntry[] }
>;
export type PatientCareCoordinationResponse = {
  coordination: {
    id: number | null;
    patient_id: number;
    revision: number;
    payload: CoordinationPayload;
    recorded_at: string | null;
    recorded_by_membership_id: number | null;
  };
  can_write: boolean;
  limits: Record<Group, number>;
};
type Reference = {
  reference_id: string;
  entry: CoordinationEntry;
  recorded_at: string;
};
type ReferencesResponse = {
  references: Reference[];
  limited: boolean;
  history_revision_limit: number;
};
type SaveRequest = {
  payload: CoordinationPayload;
  expected_revision: number;
  request_key: string;
};

const groups: Group[] = ["primary_care", "specialists", "pharmacy"];
const groupLabels: Record<Group, string> = {
  primary_care: "Primary care",
  specialists: "Specialists",
  pharmacy: "Preferred pharmacy",
};
const stateLabels: Record<CoordinationState, string> = {
  not_recorded: "Not recorded",
  known: "Details recorded",
  none: "None reported",
  unknown: "Unknown",
  declined: "Declined",
};
const sourceLabels: Record<CoordinationEntry["source"], string> = {
  patient: "Patient",
  caregiver: "Caregiver",
  clinic_staff: "Clinic staff",
  external_record: "Outside record",
  unknown: "Unknown",
};
const emptyEntry = (): CoordinationEntry => ({
  name: "",
  practice: null,
  phone: null,
  address: null,
  identifier: null,
  identifier_system: null,
  source: "unknown",
  source_detail: null,
  address_confirmed: false,
  reference_id: null,
});

export function PatientCareCoordination({ patientId }: { patientId: number }) {
  const clinic = useClinic();
  return (
    <CoordinationPanel
      key={`${clinic.user_id}:${clinic.practice.id}:${clinic.authorization_generation}:${patientId}`}
      patientId={patientId}
    />
  );
}

function CoordinationPanel({ patientId }: { patientId: number }) {
  const path = `/api/clinic/patients/${patientId}/care_coordination`;
  const resource = useResource<PatientCareCoordinationResponse>(path);
  const { registerBlocker } = useClinicNavigation();
  const [draft, setDraft] = useState<CoordinationPayload | null>(null);
  const [expectedRevision, setExpectedRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [sessionChanged, setSessionChanged] = useState(false);
  const pending = useRef<SaveRequest | null>(null);
  const inFlight = useRef(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    const clear = () => {
      active.current = false;
      pending.current = null;
      setDraft(null);
      setError("");
      setNotice("");
      setSessionChanged(true);
    };
    window.addEventListener(SESSION_CHANGED_EVENT, clear);
    return () => {
      active.current = false;
      window.removeEventListener(SESSION_CHANGED_EVENT, clear);
    };
  }, []);

  useEffect(() => {
    if (!draft || sessionChanged) return;
    const warning = unconfirmed
      ? "The coordination save is unresolved. Retry the same request before leaving."
      : "Care coordination has unsaved changes.";
    const unregister = registerBlocker(() => warning);
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warning;
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", warn);
    };
  }, [draft, unconfirmed, sessionChanged, registerBlocker]);

  async function save() {
    if (!draft || inFlight.current || stale || !resource.data?.can_write)
      return;
    const request = pending.current ?? {
      payload: structuredClone(draft),
      expected_revision: expectedRevision,
      request_key: crypto.randomUUID(),
    };
    pending.current = request;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<PatientCareCoordinationResponse>(path, {
        method: "POST",
        body: { care_coordination: request },
      });
      if (!active.current) return;
      if (
        result.coordination?.patient_id !== patientId ||
        result.coordination?.revision !== request.expected_revision + 1
      ) {
        throw new ApiError(
          502,
          "The saved coordination response could not be confirmed. Retry the same request.",
          "outcome_unconfirmed",
        );
      }
      pending.current = null;
      setUnconfirmed(false);
      setDraft(null);
      setNotice(
        `Care coordination revision ${result.coordination.revision} saved.`,
      );
      resource.refresh();
    } catch (reason) {
      if (!active.current) return;
      const uncertain =
        !(reason instanceof ApiError) ||
        reason.status >= 500 ||
        reason.code === "outcome_unconfirmed";
      setUnconfirmed(uncertain);
      setStale(reason instanceof ApiError && reason.code === "stale_record");
      if (!uncertain) pending.current = null;
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save care coordination.",
      );
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }

  if (sessionChanged)
    return (
      <Alert severity="warning">
        Your session changed. Reopen this patient profile.
      </Alert>
    );
  const data = resource.data;
  const disabled = busy || unconfirmed || stale;
  return (
    <Card title="Care coordination">
      {notice && <Alert severity="success">{notice}</Alert>}
      {!data ? (
        <>
          <LoadState error={resource.error} />
          {resource.error && (
            <Button onClick={resource.refresh}>Reload coordination</Button>
          )}
        </>
      ) : (
        <>
          <Stack spacing={2}>
            {groups.map((group) => (
              <Box key={group}>
                <Typography component="h3" variant="subtitle1">
                  {groupLabels[group]}
                </Typography>
                <Typography variant="body2">
                  {stateLabels[data.coordination.payload[group].state]}
                </Typography>
                {data.coordination.payload[group].entries.map(
                  (entry, index) => (
                    <EntrySummary key={index} entry={entry} />
                  ),
                )}
              </Box>
            ))}
            {data.coordination.recorded_at && (
              <Typography variant="body2" color="text.secondary">
                Revision {data.coordination.revision} · Recorded{" "}
                {new Date(data.coordination.recorded_at).toLocaleString()}
              </Typography>
            )}
            {data.can_write && (
              <Button
                variant="outlined"
                onClick={() => {
                  setDraft(structuredClone(data.coordination.payload));
                  setExpectedRevision(data.coordination.revision);
                  pending.current = null;
                  setStale(false);
                  setUnconfirmed(false);
                  setError("");
                  setNotice("");
                }}
              >
                Edit care coordination
              </Button>
            )}
          </Stack>
          <Dialog
            open={Boolean(draft)}
            onClose={() => {
              if (!busy && !unconfirmed) setDiscardOpen(true);
            }}
            fullWidth
            maxWidth="md"
            aria-labelledby="coordination-title"
          >
            <DialogTitle id="coordination-title">Care coordination</DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Record patient-reported providers and pharmacy details. Saved
                revisions remain in the patient’s history.
              </Typography>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              {unconfirmed && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  The save outcome is unconfirmed. Keep these details unchanged
                  and retry the same request.
                </Alert>
              )}
              {stale && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Another revision was saved. Your edits are still shown here.
                  Reload the saved record before making another change.
                </Alert>
              )}
              <Stack spacing={3}>
                {draft &&
                  groups.map((group) => (
                    <Box key={group}>
                      <Typography component="h3" variant="h6" sx={{ mb: 1 }}>
                        {groupLabels[group]}
                      </Typography>
                      <TextField
                        select
                        fullWidth
                        label={`${groupLabels[group]} status`}
                        value={draft[group].state}
                        disabled={disabled}
                        onChange={(event) => {
                          const state = event.target.value as CoordinationState;
                          setDraft({
                            ...draft,
                            [group]: {
                              state,
                              entries:
                                state === "known"
                                  ? draft[group].entries.length
                                    ? draft[group].entries
                                    : [emptyEntry()]
                                  : [],
                            },
                          });
                        }}
                      >
                        {Object.entries(stateLabels).map(([value, label]) => (
                          <MenuItem key={value} value={value}>
                            {label}
                          </MenuItem>
                        ))}
                      </TextField>
                      {draft[group].entries.map((entry, index) => (
                        <Box key={index} sx={{ mt: 2 }}>
                          <CoordinationEntryEditor
                            entry={entry}
                            path={path}
                            pharmacy={group === "pharmacy"}
                            disabled={disabled}
                            onChange={(next) =>
                              setDraft({
                                ...draft,
                                [group]: {
                                  ...draft[group],
                                  entries: draft[group].entries.map(
                                    (current, i) =>
                                      i === index ? next : current,
                                  ),
                                },
                              })
                            }
                          />
                          {group === "specialists" &&
                            draft[group].entries.length > 1 && (
                              <Button
                                disabled={disabled}
                                onClick={() =>
                                  setDraft({
                                    ...draft,
                                    [group]: {
                                      ...draft[group],
                                      entries: draft[group].entries.filter(
                                        (_, i) => i !== index,
                                      ),
                                    },
                                  })
                                }
                              >
                                Remove specialist {index + 1}
                              </Button>
                            )}
                          <Divider sx={{ mt: 2 }} />
                        </Box>
                      ))}
                      {group === "specialists" &&
                        draft[group].state === "known" && (
                          <Button
                            disabled={
                              disabled ||
                              draft[group].entries.length >=
                                data.limits.specialists
                            }
                            onClick={() =>
                              setDraft({
                                ...draft,
                                [group]: {
                                  ...draft[group],
                                  entries: [
                                    ...draft[group].entries,
                                    emptyEntry(),
                                  ],
                                },
                              })
                            }
                          >
                            Add specialist
                          </Button>
                        )}
                    </Box>
                  ))}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button
                disabled={busy || unconfirmed}
                onClick={() => setDiscardOpen(true)}
              >
                {stale ? "Reload saved record" : "Cancel"}
              </Button>
              <Button
                variant="contained"
                disabled={busy || stale}
                onClick={() => void save()}
              >
                {busy
                  ? "Saving…"
                  : unconfirmed
                    ? "Retry same save"
                    : "Save coordination"}
              </Button>
            </DialogActions>
          </Dialog>
          <Dialog
            open={discardOpen && Boolean(draft)}
            onClose={() => setDiscardOpen(false)}
            aria-labelledby="discard-coordination-title"
          >
            <DialogTitle id="discard-coordination-title">
              Discard unsaved coordination edits?
            </DialogTitle>
            <DialogContent>
              Your edits will be discarded. The saved patient record will be
              reloaded.
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDiscardOpen(false)}>
                Keep editing
              </Button>
              <Button
                onClick={() => {
                  setDraft(null);
                  setDiscardOpen(false);
                  setStale(false);
                  setError("");
                  resource.refresh();
                }}
              >
                Discard edits and reload
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Card>
  );
}

function EntrySummary({ entry }: { entry: CoordinationEntry }) {
  return (
    <Box sx={{ mt: 1, overflowWrap: "anywhere" }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {entry.name}
        {entry.practice ? ` · ${entry.practice}` : ""}
      </Typography>
      <Typography variant="body2">
        Phone: {entry.phone || "Not recorded"}
      </Typography>
      <Typography variant="body2">
        Address: {entry.address || "Not recorded"} ·{" "}
        {entry.address_confirmed ? "Confirmed" : "Not confirmed"}
      </Typography>
      {entry.identifier && (
        <Typography variant="body2">
          {entry.identifier_system}: {entry.identifier}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        Source: {sourceLabels[entry.source]}
        {entry.source_detail ? ` · ${entry.source_detail}` : ""}
      </Typography>
    </Box>
  );
}

function CoordinationEntryEditor({
  entry,
  path,
  pharmacy,
  disabled,
  onChange,
}: {
  entry: CoordinationEntry;
  path: string;
  pharmacy: boolean;
  disabled: boolean;
  onChange: (entry: CoordinationEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [references, setReferences] = useState<ReferencesResponse | null>(null);
  const [searchError, setSearchError] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchRevision, setSearchRevision] = useState(0);
  useEffect(() => {
    if (disabled) return;
    const abort = new AbortController();
    setReferences(null);
    setSearchError("");
    setLoading(true);
    const timer = window.setTimeout(() => {
      void api<ReferencesResponse>(
        `${path}/references?kind=${pharmacy ? "pharmacy" : "provider"}&q=${encodeURIComponent(query)}`,
        { signal: abort.signal },
      )
        .then((result) => {
          if (!abort.signal.aborted) setReferences(result);
        })
        .catch(() => {
          if (!abort.signal.aborted)
            setSearchError(
              "Recorded references could not be loaded. Retry or use Other manual entry.",
            );
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [path, pharmacy, query, disabled, searchRevision]);
  const manual: Reference = {
    reference_id: "manual",
    entry: emptyEntry(),
    recorded_at: "",
  };
  const selected = entry.reference_id
    ? { reference_id: entry.reference_id, entry, recorded_at: "" }
    : manual;
  const options = [manual, ...(references?.references ?? [])];
  if (
    entry.reference_id &&
    !options.some((item) => item.reference_id === entry.reference_id)
  )
    options.push(selected);
  const fields: {
    key:
      | "name"
      | "practice"
      | "phone"
      | "address"
      | "identifier"
      | "identifier_system"
      | "source_detail";
    label: string;
    limit: number;
  }[] = [
    {
      key: "name",
      label: pharmacy ? "Pharmacy name" : "Provider name",
      limit: 200,
    },
    ...(!pharmacy
      ? [{ key: "practice" as const, label: "Practice", limit: 200 }]
      : []),
    { key: "phone", label: "Phone", limit: 80 },
    { key: "address", label: "Address", limit: 1000 },
    {
      key: "identifier_system",
      label: "Identifier system (if known)",
      limit: 200,
    },
    { key: "identifier", label: "Identifier (if known)", limit: 200 },
    { key: "source_detail", label: "Source details (optional)", limit: 500 },
  ];
  return (
    <Stack spacing={2}>
      <Autocomplete<Reference>
        options={options}
        value={selected}
        loading={loading}
        disabled={disabled}
        filterOptions={(items) => items}
        isOptionEqualToValue={(left, right) =>
          left.reference_id === right.reference_id
        }
        getOptionLabel={(item) =>
          item.reference_id === "manual"
            ? "Other — enter manually"
            : [item.entry.name, item.entry.practice, item.entry.address]
                .filter(Boolean)
                .join(" · ")
        }
        onInputChange={(_, value, reason) => {
          if (reason === "input" || reason === "clear")
            setQuery(value.slice(0, 100));
        }}
        onChange={(_, option) => {
          setQuery("");
          if (!option || option.reference_id === "manual")
            onChange({ ...entry, reference_id: null });
          else
            onChange({
              ...option.entry,
              reference_id: option.reference_id,
              address_confirmed: false,
            });
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={`Search recorded ${pharmacy ? "pharmacies" : "providers"}`}
            helperText="Previously recorded for this patient. Confirm copied details before saving."
          />
        )}
      />
      {searchError && (
        <Alert
          severity="warning"
          action={
            <Button
              disabled={disabled}
              onClick={() => setSearchRevision((value) => value + 1)}
            >
              Retry search
            </Button>
          }
        >
          {searchError}
        </Alert>
      )}
      {references?.limited && (
        <Typography variant="body2" color="text.secondary">
          Showing up to 25 matches from the latest{" "}
          {references.history_revision_limit} revisions. Narrow the search or
          enter details manually.
        </Typography>
      )}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 2,
        }}
      >
        {fields.map((field) => (
          <TextField
            key={field.key}
            label={field.label}
            value={entry[field.key] ?? ""}
            disabled={disabled}
            required={field.key === "name"}
            multiline={field.key === "address" || field.key === "source_detail"}
            slotProps={{ htmlInput: { maxLength: field.limit } }}
            onChange={(event) =>
              onChange({
                ...entry,
                [field.key]: event.target.value,
                reference_id:
                  field.key === "source_detail" ? entry.reference_id : null,
                address_confirmed:
                  field.key === "address" || field.key === "name"
                    ? false
                    : entry.address_confirmed,
              })
            }
          />
        ))}
        <TextField
          select
          label="Information source"
          value={entry.source}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...entry,
              source: event.target.value as CoordinationEntry["source"],
            })
          }
        >
          {Object.entries(sourceLabels).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <FormControlLabel
        control={
          <Checkbox
            checked={entry.address_confirmed}
            disabled={disabled || !entry.address?.trim()}
            onChange={(_, checked) =>
              onChange({ ...entry, address_confirmed: checked })
            }
          />
        }
        label="Address confirmed for this provider or pharmacy"
      />
    </Stack>
  );
}
