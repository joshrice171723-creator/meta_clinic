import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { api, ApiError } from "../../api/client";
import { Card, LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";

type Purpose =
  | "treatment"
  | "privacy_notice"
  | "product_counseling"
  | "ai_recording"
  | "marketing";
type Decision = "" | "recorded" | "declined" | "revoked";
type Source = "patient" | "staff_recorded_external_evidence";
type Evidence = {
  id: number;
  purpose: Purpose;
  revision: number;
  decision: Exclude<Decision, "">;
  document_reference: string;
  document_version: string;
  source: Source;
  evidence_reference: string | null;
  occurred_on: string;
  product: string | null;
  source_document_id: number | null;
  recorded_at: string;
  recorded_by_membership_id: number;
};
type DocumentOption = {
  id: number;
  category_id: number;
  object_version: string;
  media_type: string;
  created_at: string;
};
type Response = {
  intake_consents: Record<Purpose, Evidence | null>;
  can_write: boolean;
  purposes: Purpose[];
  evidence_options: { source_documents: DocumentOption[] };
};
type Form = {
  decision: Decision;
  source: Source;
  document_reference: string;
  document_version: string;
  occurred_on: string;
  evidence_reference: string;
  product: string;
  source_document_id: string;
};

const labels: Record<Purpose, string> = {
  treatment: "Treatment",
  privacy_notice: "Privacy notice",
  product_counseling: "Product counseling",
  ai_recording: "AI recording",
  marketing: "Marketing",
};
const blankForm = (): Form => ({
  decision: "",
  source: "patient",
  document_reference: "",
  document_version: "",
  occurred_on: "",
  evidence_reference: "",
  product: "",
  source_document_id: "",
});
const fromEvidence = (evidence: Evidence | null): Form =>
  evidence
    ? {
        decision: "",
        source: evidence.source,
        document_reference: evidence.document_reference,
        document_version: evidence.document_version,
        occurred_on: evidence.occurred_on,
        evidence_reference: evidence.evidence_reference ?? "",
        product: evidence.product ?? "",
        source_document_id: evidence.source_document_id?.toString() ?? "",
      }
    : blankForm();

export function IntakeConsentEvidence({ patientId }: { patientId: number }) {
  const clinic = useClinic();
  return (
    <IntakeConsentEvidencePanel
      key={`${clinic.user_id}:${clinic.practice.id}:${clinic.authorization_generation}:${patientId}`}
      patientId={patientId}
    />
  );
}

function IntakeConsentEvidencePanel({ patientId }: { patientId: number }) {
  const path = `/api/clinic/patients/${patientId}/intake_consents`;
  const resource = useResource<Response>(path);
  if (!resource.data && !resource.error) return <LoadState />;
  if (resource.error || !resource.data)
    return (
      <>
        <LoadState error={resource.error} />
        <Button onClick={resource.refresh}>Reload consent evidence</Button>
      </>
    );
  return (
    <Stack spacing={2} aria-label="Intake consent evidence">
      <Typography variant="h6">Consent evidence</Typography>
      <Typography variant="body2" color="text.secondary">
        Record each purpose separately. No evidence recorded is not a universal
        consent gate.
      </Typography>
      {resource.data.purposes.map((purpose) => (
        <ConsentPurpose
          key={purpose}
          purpose={purpose}
          current={resource.data!.intake_consents[purpose]}
          documents={resource.data!.evidence_options.source_documents}
          canWrite={resource.data!.can_write}
          path={path}
          refresh={resource.refresh}
        />
      ))}
    </Stack>
  );
}

function ConsentPurpose({
  purpose,
  current,
  documents,
  canWrite,
  path,
  refresh,
}: {
  purpose: Purpose;
  current: Evidence | null;
  documents: DocumentOption[];
  canWrite: boolean;
  path: string;
  refresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<Form>(() => fromEvidence(current));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const requestKeys = useRef(new Map<string, string>());
  useEffect(() => {
    setForm(fromEvidence(current));
    requestKeys.current.clear();
  }, [current?.id, current?.revision]);
  const update = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const payload = {
    decision: form.decision,
    document_reference: form.document_reference,
    document_version: form.document_version,
    source: form.source,
    evidence_reference: form.evidence_reference || null,
    occurred_on: form.occurred_on,
    product: form.product || null,
    source_document_id: form.source_document_id
      ? Number(form.source_document_id)
      : null,
  };
  const signature = JSON.stringify(payload);
  const save = async () => {
    if (!form.decision) {
      setMessage("Choose the recorded decision before saving.");
      return;
    }
    const requestKey =
      requestKeys.current.get(signature) ?? crypto.randomUUID();
    requestKeys.current.set(signature, requestKey);
    setSaving(true);
    setMessage("");
    try {
      await api(path, {
        method: "POST",
        body: {
          intake_consent: {
            purpose,
            expected_revision: current?.revision ?? 0,
            request_key: requestKey,
            payload,
          },
        },
      });
      requestKeys.current.clear();
      setMessage(`${labels[purpose]} evidence recorded.`);
      setExpanded(false);
      refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setMessage(
          "This evidence changed elsewhere. Current evidence was refreshed; review your preserved entries before trying again.",
        );
        refresh();
      } else
        setMessage(
          error instanceof Error
            ? error.message
            : "Evidence could not be recorded.",
        );
    } finally {
      setSaving(false);
    }
  };
  const disabled = saving || !canWrite;
  return (
    <Card title={labels[purpose]}>
      <Accordion
        disableGutters
        expanded={expanded}
        onChange={(_, value) => !saving && setExpanded(value)}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls={`${purpose}-evidence`}
          id={`${purpose}-evidence-header`}
        >
          <Stack spacing={0.5}>
            <Typography variant="subtitle1">{labels[purpose]}</Typography>
            <Typography variant="body2" color="text.secondary">
              {current
                ? `${current.decision} · version ${current.revision} · ${current.occurred_on}`
                : "No evidence recorded."}
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails id={`${purpose}-evidence`}>
          <Stack spacing={2}>
            {message && (
              <Alert
                severity={message.endsWith("recorded.") ? "success" : "error"}
              >
                {message}
              </Alert>
            )}
            {canWrite && (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  gap: 2,
                }}
              >
                <TextField
                  select
                  required
                  disabled={disabled}
                  name="decision"
                  label="Recorded decision"
                  value={form.decision}
                  onChange={(event) =>
                    update("decision", event.target.value as Decision)
                  }
                >
                  <MenuItem value="">Choose a decision</MenuItem>
                  {["recorded", "declined", "revoked"].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  required
                  disabled={disabled}
                  name="source"
                  label="Evidence source"
                  value={form.source}
                  onChange={(event) =>
                    update("source", event.target.value as Source)
                  }
                >
                  <MenuItem value="patient">Patient-reported</MenuItem>
                  <MenuItem value="staff_recorded_external_evidence">
                    Staff-recorded external evidence
                  </MenuItem>
                </TextField>
                <TextField
                  required
                  disabled={disabled}
                  name="document_reference"
                  label="Document reference"
                  value={form.document_reference}
                  slotProps={{ htmlInput: { maxLength: 200 } }}
                  onChange={(event) =>
                    update("document_reference", event.target.value)
                  }
                />
                <TextField
                  required
                  disabled={disabled}
                  name="document_version"
                  label="Document version"
                  value={form.document_version}
                  slotProps={{ htmlInput: { maxLength: 200 } }}
                  onChange={(event) =>
                    update("document_version", event.target.value)
                  }
                />
                <TextField
                  required
                  disabled={disabled}
                  name="occurred_on"
                  type="date"
                  label="Evidence date"
                  value={form.occurred_on}
                  slotProps={{ inputLabel: { shrink: true } }}
                  onChange={(event) =>
                    update("occurred_on", event.target.value)
                  }
                />
                <TextField
                  disabled={disabled}
                  name="evidence_reference"
                  label="External evidence reference"
                  value={form.evidence_reference}
                  helperText="Required for recorded acceptance unless an existing patient document is linked."
                  slotProps={{ htmlInput: { maxLength: 1000 } }}
                  onChange={(event) =>
                    update("evidence_reference", event.target.value)
                  }
                />
                <TextField
                  disabled={disabled}
                  name="product"
                  label="Product (optional)"
                  value={form.product}
                  slotProps={{ htmlInput: { maxLength: 200 } }}
                  onChange={(event) => update("product", event.target.value)}
                />
                <TextField
                  select
                  disabled={disabled}
                  name="source_document_id"
                  label="Existing patient document (optional)"
                  value={form.source_document_id}
                  onChange={(event) =>
                    update("source_document_id", event.target.value)
                  }
                >
                  <MenuItem value="">No linked document</MenuItem>
                  {documents.map((document) => (
                    <MenuItem
                      key={document.id}
                      value={document.id}
                    >{`Document ${document.id} · version ${document.object_version}`}</MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="contained"
                  disabled={disabled}
                  onClick={() => void save()}
                >
                  {saving ? "Recording…" : "Record evidence"}
                </Button>
              </Box>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Card>
  );
}
