import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import { api, ApiError } from "../../api/client";
import { isDemoFrame } from "../demo/frame";
import type {
  ClinicAssessmentCode,
  ClinicServiceCode,
  ClinicType,
  PracticeFeatures,
  ServiceDisablePreview,
  ServiceDisableImpact,
} from "../../api/contracts";
import { LoadState, useResource } from "../../shared/ui";
import { useClinicNavigation } from "./clinicNavigation";

const clinicTypes: Array<{
  code: ClinicType;
  label: string;
  description: string;
}> = [
  {
    code: "weight_loss",
    label: "Weight loss",
    description:
      "Initial and follow-up intake, explicit visit types, goals and weight history. Choose services separately.",
  },
  {
    code: "primary_care",
    label: "Primary care",
    description:
      "General outpatient care with longitudinal patient relationships.",
  },
  {
    code: "membership_primary_care",
    label: "Membership primary care",
    description: "Primary care with a recurring membership or package model.",
  },
  {
    code: "urgent_care",
    label: "Urgent care / same-day",
    description: "Episodic, walk-in, or short-notice ambulatory care.",
  },
  {
    code: "specialty_outpatient",
    label: "Specialty outpatient",
    description:
      "A focused ambulatory specialty with clinic-specific workflows.",
  },
  {
    code: "behavioral_health",
    label: "Behavioral health",
    description: "Outpatient behavioral-health services and follow-up.",
  },
  {
    code: "custom_ambulatory",
    label: "Custom ambulatory clinic",
    description: "A clinic model that needs an implementation-specific design.",
  },
];

const services: Array<{
  code: ClinicServiceCode;
  label: string;
  description: string;
  readiness:
    | "Base workflow"
    | "Hardening required"
    | "Implementation required"
    | "Configured intent";
}> = [
  {
    code: "telehealth",
    label: "Telehealth visits",
    description: "Remote visit preparation, visit access, and reconciliation.",
    readiness: "Base workflow",
  },
  {
    code: "prescription_preparation",
    label: "Prescription preparation",
    description:
      "Clinician-reviewed prescriptions and outside-pharmacy destinations. Connection remains separate.",
    readiness: "Base workflow",
  },
  {
    code: "take_home_fulfillment",
    label: "Take-home medication handover",
    description:
      "Selected stock, lots, partial handover and correction. No medication is selected automatically.",
    readiness: "Base workflow",
  },
  {
    code: "external_lab_coordination",
    label: "External lab coordination",
    description: "Orders, results review, follow-up, and outside-lab handoff.",
    readiness: "Base workflow",
  },
  {
    code: "minor_office_procedures",
    label: "Minor office procedures",
    description:
      "Procedure planning and documentation for routine office care.",
    readiness: "Base workflow",
  },
  {
    code: "in_office_medications",
    label: "In-office medication administration",
    description:
      "Ordered medication selection, administration, exceptions, and inventory linkage.",
    readiness: "Hardening required",
  },
  {
    code: "vaccinations",
    label: "Vaccinations",
    description:
      "Vaccine-specific administration, lot, VIS, and follow-up records.",
    readiness: "Hardening required",
  },
  {
    code: "point_of_care_testing",
    label: "Point-of-care testing",
    description:
      "Specimen, result, device, quality, and required lab-profile controls.",
    readiness: "Hardening required",
  },
  {
    code: "infusions",
    label: "Infusions",
    description:
      "Timed administration, monitoring, access site, and reaction workflows.",
    readiness: "Implementation required",
  },
  {
    code: "controlled_medications",
    label: "Controlled-medication handling",
    description:
      "Separate authority, inventory, count, witness, and exception controls.",
    readiness: "Implementation required",
  },
  {
    code: "patient_supplied_medications",
    label: "Patient-supplied medications",
    description:
      "Custody, identity, storage, authorization, and administration controls.",
    readiness: "Implementation required",
  },
  {
    code: "psychiatric_evaluation",
    label: "Psychiatric evaluation",
    description:
      "Configured service intent; clinic-approved evaluation protocols remain explicit.",
    readiness: "Configured intent",
  },
  {
    code: "adhd_evaluation",
    label: "ADHD evaluation",
    description:
      "Configured service intent; no evaluation or diagnostic protocol is selected automatically.",
    readiness: "Configured intent",
  },
  {
    code: "medication_management",
    label: "Medication management",
    description:
      "Configured service intent; existing medication records retain their recorded authority.",
    readiness: "Configured intent",
  },
  {
    code: "therapy_referral_coordination",
    label: "Therapy referral coordination",
    description:
      "Configured service intent; existing referrals and follow-up remain recorded separately.",
    readiness: "Configured intent",
  },
  {
    code: "urgent_clinical_follow_up",
    label: "Urgent clinical follow-up",
    description:
      "Configured service intent; urgency, ownership and response rules require clinic-approved protocols.",
    readiness: "Configured intent",
  },
  {
    code: "individual_therapy",
    label: "Individual therapy",
    description:
      "Available in the behavioral-health profile. Uses a separate originator-only private note; routine care stays in the ordinary chart.",
    readiness: "Hardening required",
  },
];

const assessments: Array<{
  code: ClinicAssessmentCode;
  label: string;
  description: string;
}> = [
  {
    code: "depression",
    label: "Depression",
    description: "Clinic-approved depression screening protocol.",
  },
  {
    code: "anxiety",
    label: "Anxiety",
    description: "Clinic-approved anxiety screening protocol.",
  },
  {
    code: "alcohol_use",
    label: "Alcohol use",
    description: "Clinic-approved alcohol-use screening protocol.",
  },
  {
    code: "tobacco_use",
    label: "Tobacco use",
    description: "Clinic-approved tobacco-use screening protocol.",
  },
  {
    code: "social_needs",
    label: "Social needs",
    description: "Clinic-approved social-needs assessment protocol.",
  },
  {
    code: "fall_risk",
    label: "Fall risk",
    description: "Clinic-approved fall-risk assessment protocol.",
  },
  {
    code: "functional_status",
    label: "Functional status",
    description: "Clinic-approved functional-status assessment protocol.",
  },
  {
    code: "psychiatry_assessment",
    label: "Psychiatry assessment",
    description:
      "Clinic-approved psychiatry assessment protocol; no instrument or scoring rule is chosen automatically.",
  },
  {
    code: "cognitive_status",
    label: "Cognitive status",
    description: "Clinic-approved cognitive-status assessment protocol.",
  },
];

function isScopeRemovalImpact(value: unknown): value is ServiceDisableImpact {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.status === "string" &&
    [
      "available",
      "partial",
      "restricted",
      "not_mapped",
      "unavailable",
    ].includes(row.status) &&
    typeof row.change_kind === "string" &&
    ["gated", "intent_only", "unmapped"].includes(row.change_kind) &&
    typeof row.effect === "string" &&
    typeof row.resolution === "string" &&
    (row.resolution_path === null || typeof row.resolution_path === "string") &&
    Array.isArray(row.limits) &&
    row.limits.every((limit) => typeof limit === "string") &&
    Array.isArray(row.metrics) &&
    row.metrics.every((value: unknown) => {
      if (value === null || typeof value !== "object") return false;
      const metric = value as Record<string, unknown>;
      const validCount =
        typeof metric.count === "number" &&
        Number.isFinite(metric.count) &&
        metric.count >= 0;
      return (
        typeof metric.key === "string" &&
        typeof metric.label === "string" &&
        typeof metric.note === "string" &&
        typeof metric.required === "boolean" &&
        typeof metric.status === "string" &&
        [
          "available",
          "restricted",
          "unknown",
          "unavailable",
          "not_applicable",
        ].includes(metric.status) &&
        (metric.status === "available"
          ? validCount
          : metric.count === null || validCount)
      );
    })
  );
}

function ScopeRemovalImpact({
  label,
  impact,
}: {
  label: string;
  impact: ServiceDisableImpact;
}) {
  return (
    <Stack spacing={0.5}>
      <Typography sx={{ fontWeight: 700 }}>{label}</Typography>
      <Typography variant="caption">
        {impact.change_kind === "gated"
          ? "Existing feature gate"
          : impact.change_kind === "intent_only"
            ? "Configured intent; no domain gate claimed"
            : "Consumer mapping unavailable"}
        {" · "}
        {impact.status.replaceAll("_", " ")}
      </Typography>
      <Typography variant="body2">{impact.effect}</Typography>
      {impact.metrics.map((metric) => (
        <Stack key={metric.key} spacing={0.25}>
          <Typography variant="body2">
            {metric.label}:{" "}
            {metric.status === "available" && typeof metric.count === "number"
              ? metric.count
              : metric.status === "not_applicable"
                ? "not applicable"
                : `unknown (${metric.status === "restricted" ? "requires domain access" : metric.status === "unavailable" ? "temporarily unavailable" : "not evaluated"})`}
            {metric.required ? " · required for this review" : ""}
          </Typography>
          {metric.note && (
            <Typography variant="caption" color="text.secondary">
              {metric.note}
            </Typography>
          )}
        </Stack>
      ))}
      {impact.limits.map((limit, index) => (
        <Typography key={index} variant="body2" color="text.secondary">
          {limit}
        </Typography>
      ))}
      <Typography variant="body2">{impact.resolution}</Typography>
      {impact.resolution_path && (
        <Button size="small" href={impact.resolution_path}>
          Open authorized domain
        </Button>
      )}
    </Stack>
  );
}

function sameSelection<T extends string>(left: T[], right: T[]) {
  return (
    left.length === right.length && left.every((code) => right.includes(code))
  );
}

type SavedFeatureChoices = {
  revision: number;
  effective_from: string;
  clinic_type: ClinicType;
  service_scope: ClinicServiceCode[];
  assessment_scope: ClinicAssessmentCode[];
  insurance_workflows: boolean;
};

function FeatureHistory({
  siteId,
  current,
  onApply,
}: {
  siteId: number | null;
  current: PracticeFeatures;
  onApply: (saved: SavedFeatureChoices) => void;
}) {
  const history = useResource<{
    versions: SavedFeatureChoices[];
    capped: boolean;
  }>(
    `/api/clinic/practice_features/history${siteId ? `?site_id=${siteId}` : ""}`,
  );
  const [revision, setRevision] = useState("");
  const saved = history.data?.versions.find(
    (version) => String(version.revision) === revision,
  );
  const protectedChange =
    current.finalized &&
    saved &&
    (saved.clinic_type !== current.clinic_type ||
      saved.insurance_workflows !== current.insurance_workflows_enabled ||
      saved.service_scope.some(
        (service) => !(current.selected_services ?? []).includes(service),
      ));

  return (
    <Stack spacing={1}>
      <Typography variant="h3">Saved profile choices</Typography>
      <Typography variant="body2" color="text.secondary">
        Load an earlier version into this form, review it, then use Save{" "}
        {siteId ? "location" : "clinic"} profile. Current permissions and
        protected-profile rules still apply.
      </Typography>
      {!history.data && (
        <LoadState error={history.error} onRetry={history.refresh} />
      )}
      {history.data && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <TextField
            select
            label="Saved revision"
            value={revision}
            onChange={(event) => setRevision(event.target.value)}
            sx={{ minWidth: 220 }}
          >
            {history.data.versions
              .filter((version) => version.revision !== current.revision)
              .map((version) => (
                <MenuItem
                  key={version.revision}
                  value={String(version.revision)}
                >
                  Revision {version.revision} ·{" "}
                  {new Date(version.effective_from).toLocaleString()}
                </MenuItem>
              ))}
          </TextField>
          <Button
            disabled={!saved || !!protectedChange}
            onClick={() => saved && onApply(saved)}
          >
            Load choices into form
          </Button>
        </Stack>
      )}
      {protectedChange && (
        <Alert severity="warning">
          This saved version changes a protected part of the finalized profile.
        </Alert>
      )}
      {history.data?.capped && (
        <Typography variant="caption">
          Showing the latest 25 revisions.
        </Typography>
      )}
    </Stack>
  );
}

export function PracticeFeatureSettings({
  canWrite,
  siteId = null,
  onProfileSaved,
}: {
  canWrite: boolean;
  siteId?: number | null;
  onProfileSaved?: (finalized: boolean) => void;
}) {
  const hash = window.location.hash;
  const siteQuery = siteId ? `?site_id=${siteId}` : "";
  const { data, error, refresh } = useResource<{ features: PracticeFeatures }>(
    `/api/clinic/practice_features${siteQuery}`,
  );
  const { registerBlocker } = useClinicNavigation();
  const [clinicType, setClinicType] = useState<ClinicType | "">("");
  const [serviceScope, setServiceScope] = useState<ClinicServiceCode[]>([]);
  const [assessmentScope, setAssessmentScope] = useState<
    ClinicAssessmentCode[]
  >([]);
  const [insuranceEnabled, setInsuranceEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewFinalizedChanges, setReviewFinalizedChanges] = useState(false);
  const request = useRef<{ signature: string; key: string } | null>(null);
  const [preview, setPreview] = useState<{
    signature: string;
    data: ServiceDisablePreview;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [uncertain, setUncertain] = useState<{
    signature: string;
    body: Record<string, unknown>;
    finalized: boolean;
  } | null>(null);
  const mutationLocked = useRef(false);
  mutationLocked.current = saving || uncertain !== null;
  const previewGeneration = useRef(0);
  const scopeGeneration = useRef(0);
  const scopeRef = useRef(siteId);
  scopeRef.current = siteId;
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const features = data?.features;
  useEffect(() => {
    if (!features || mutationLocked.current) return;
    setClinicType(
      features.clinic_type ?? (siteId ? "" : features.recommended_clinic_type),
    );
    setServiceScope(features.service_scope);
    setAssessmentScope(features.assessment_scope);
    setInsuranceEnabled(features.insurance_workflows_enabled);
  }, [features]);

  useEffect(() => {
    scopeGeneration.current += 1;
    setReviewFinalizedChanges(window.location.hash === "#assessment-setup");
    previewGeneration.current += 1;
    setPreview(null);
    setPreviewing(false);
    setUncertain(null);
    request.current = null;
    setSaving(false);
    setFeedback(null);
  }, [siteId]);
  useEffect(() => {
    if (hash === "#assessment-setup") setReviewFinalizedChanges(true);
  }, [hash]);
  useEffect(() => {
    if (hash === "#assessment-setup" && features)
      document
        .getElementById("assessment-setup")
        ?.scrollIntoView({ block: "start" });
  }, [features, reviewFinalizedChanges, hash]);
  const signature = JSON.stringify([
    clinicType,
    serviceScope,
    assessmentScope,
    insuranceEnabled,
    features?.revision,
    siteId,
  ]);
  const signatureRef = useRef(signature);
  signatureRef.current = signature;

  const changed = useMemo(
    () =>
      features !== undefined &&
      (clinicType !==
        (features.clinic_type ??
          (siteId ? "" : features.recommended_clinic_type)) ||
        !sameSelection(serviceScope, features.service_scope) ||
        !sameSelection(assessmentScope, features.assessment_scope) ||
        insuranceEnabled !== features.insurance_workflows_enabled),
    [
      assessmentScope,
      clinicType,
      features,
      insuranceEnabled,
      serviceScope,
      siteId,
    ],
  );

  useEffect(() => {
    if (!changed && !saving && !uncertain) return;
    const warning = uncertain
      ? "This profile save is unconfirmed. Leaving discards its exact retry request."
      : saving
        ? "This location profile is saving. Leave before its outcome is confirmed?"
        : "This location profile has unsaved changes. Leave and discard them?";
    const unregister = registerBlocker(() => warning);
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", warn);
    };
  }, [changed, saving, uncertain, registerBlocker]);

  if (!features) return <LoadState error={error} />;
  const serviceOptions = clinicType
    ? (features.service_options_by_specialty?.[clinicType] ?? [])
    : [];
  const assessmentOptions = clinicType
    ? (features.assessment_options_by_specialty?.[clinicType] ?? [])
    : [];
  const visibleServices = services.filter(
    (service) =>
      serviceOptions.includes(service.code) ||
      serviceScope.includes(service.code),
  );
  const visibleAssessments = assessments.filter(
    (assessment) =>
      assessmentOptions.includes(assessment.code) ||
      assessmentScope.includes(assessment.code),
  );

  if (features.finalized && !reviewFinalizedChanges && !saving && !uncertain) {
    const clinicTypeLabel = clinicTypes.find(
      (option) => option.code === features.clinic_type,
    )?.label;
    const selectedServices = features.service_scope
      .map((code) => services.find((service) => service.code === code)?.label)
      .filter((label): label is string => Boolean(label));
    const selectedAssessments = features.assessment_scope
      .map(
        (code) =>
          assessments.find((assessment) => assessment.code === code)?.label,
      )
      .filter((label): label is string => Boolean(label));

    return (
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{
              justifyContent: "space-between",
              alignItems: { sm: "center" },
            }}
          >
            <Typography variant="h2">
              {siteId ? "Location" : "Clinic"} profile
            </Typography>
            <Chip size="small" color="success" label="Setup finalized" />
          </Stack>
          <Alert severity="info">
            Setup finalized
            {features.finalized_at
              ? ` ${new Date(features.finalized_at).toLocaleString()}`
              : ""}
            . Clinic type and insurance workflow remain protected. Authorized
            service and assessment changes remain available through the
            supported change review below.
          </Alert>
          {feedback && <Alert severity={feedback.tone}>{feedback.text}</Alert>}

          <Stack spacing={1.5}>
            <Typography variant="subtitle1">Current settings</Typography>
            <Stack spacing={1}>
              <Typography>
                <strong>
                  {siteId ? "Location specialty" : "Clinic type"}:
                </strong>{" "}
                {clinicTypeLabel ??
                  (siteId ? "Inherited from clinic profile" : "Not configured")}
              </Typography>
              <Typography>
                <strong>Planned services:</strong>{" "}
                {selectedServices.length
                  ? selectedServices.join(", ")
                  : "None selected"}
              </Typography>
              <Typography id="assessment-setup">
                <strong>Screening and assessment:</strong>{" "}
                {!features.assessment_configured
                  ? "Not explicitly configured"
                  : selectedAssessments.length
                    ? selectedAssessments.join(", ")
                    : "None selected"}
              </Typography>
              <FormControlLabel
                disabled
                control={
                  <Switch checked={features.insurance_workflows_enabled} />
                }
                label={`This ${siteId ? "location" : "clinic"} uses insurance workflows`}
              />
              <Typography variant="body2" color="text.secondary">
                Insurance workflows are protected after setup is finalized.
              </Typography>
            </Stack>
          </Stack>

          {features.starter_profile && (
            <Stack spacing={1}>
              <Typography variant="subtitle1">Configured starter</Typography>
              <Typography variant="body2">
                {features.starter_profile.id ?? "Starter profile"}
                {features.starter_profile.version !== undefined
                  ? ` ┬╖ revision ${features.starter_profile.version}`
                  : ""}
              </Typography>
              {features.starter_profile.visits &&
                Object.values(features.starter_profile.visits).map((visit) => (
                  <Typography key={visit.visit_type_id} variant="body2">
                    {visit.name} ┬╖ {visit.form_id} ┬╖ visit type{" "}
                    {visit.visit_type_id}
                  </Typography>
                ))}
            </Stack>
          )}

          <Divider />
          <Stack spacing={1}>
            <Typography variant="subtitle1">Supported change routes</Typography>
            <Typography variant="body2" color="text.secondary">
              {features.change_handoff ??
                "These setup choices are finalized. Contact Meta Clinic to review a capability change; unsupported transitions require a scoped FDE assignment."}
            </Typography>
          </Stack>
          {canWrite && (
            <Button
              variant="outlined"
              onClick={() => setReviewFinalizedChanges(true)}
            >
              Review supported profile changes
            </Button>
          )}
          {!canWrite && (
            <Typography variant="body2">
              This profile is read-only for your role.
            </Typography>
          )}
          <Alert severity="info">
            Intended service scope does not grant clinical authority, verify
            credentials, or establish readiness for patient care.
          </Alert>
        </Stack>
      </Paper>
    );
  }

  const disabling =
    (features.finalized === true &&
      features.service_scope.some(
        (service) => !serviceScope.includes(service),
      )) ||
    (features.assessment_configured === true &&
      features.assessment_scope.some(
        (assessment) => !assessmentScope.includes(assessment),
      ));
  const currentPreview = preview?.signature === signature ? preview.data : null;
  const editingLocked = saving || uncertain !== null;
  const saveDisabledReason = !canWrite
    ? "Your access does not allow location profile changes."
    : !clinicType
      ? "Choose a clinic type before saving."
      : saving
        ? "The profile is saving."
        : uncertain
          ? "Reconcile the original profile save before making another change."
          : disabling && currentPreview?.review_complete !== true
            ? "Review scope consequences below before saving removed services or assessment categories. You can also restore the removed selections."
            : !changed && features.configured
              ? "Make a profile change to enable Save."
              : null;
  const reviewConsequences = async () => {
    const generation = ++previewGeneration.current;
    setPreview(null);
    setPreviewing(true);
    setFeedback(null);
    const query = new URLSearchParams({
      preview_service_change: "1",
      assessment_scope_present: "1",
      expected_revision: String(features.revision),
    });
    if (siteId) query.set("site_id", String(siteId));
    for (const service of serviceScope)
      query.append("service_scope[]", service);
    for (const assessment of assessmentScope)
      query.append("assessment_scope[]", assessment);
    try {
      const result = await api<{ preview: ServiceDisablePreview }>(
        `/api/clinic/practice_features?${query}`,
      );
      if (
        generation !== previewGeneration.current ||
        signatureRef.current !== signature
      )
        return;
      if (
        result.preview.site_id !== siteId ||
        result.preview.revision !== features.revision
      )
        throw new Error(
          "The preview belongs to a different profile. Review again.",
        );
      const impact = result.preview;
      if (
        impact.coverage !== "source_backed_references" ||
        typeof impact.review_complete !== "boolean" ||
        typeof impact.impact_digest !== "string" ||
        !impact.impact_digest ||
        !Array.isArray(impact.services) ||
        !Array.isArray(impact.assessments) ||
        !Array.isArray(impact.limitations) ||
        !impact.limitations.every((limit) => typeof limit === "string") ||
        typeof impact.preservation !== "string" ||
        !impact.services.every(
          (row) => isScopeRemovalImpact(row) && typeof row.service === "string",
        ) ||
        !impact.assessments.every(
          (row) =>
            isScopeRemovalImpact(row) && typeof row.assessment === "string",
        ) ||
        (impact.review_complete &&
          [...impact.services, ...impact.assessments].some(
            (row) =>
              row.metrics.length === 0 ||
              row.metrics.some(
                (metric) =>
                  metric.required &&
                  !["available", "not_applicable"].includes(metric.status),
              ),
          )) ||
        (features.finalized &&
          features.service_scope.some(
            (service) =>
              !serviceScope.includes(service) &&
              !impact.services.some((row) => row.service === service),
          )) ||
        (features.assessment_configured &&
          features.assessment_scope.some(
            (assessment) =>
              !assessmentScope.includes(assessment) &&
              !impact.assessments.some((row) => row.assessment === assessment),
          ))
      )
        throw new Error(
          "The impact response is incomplete. Restore the removed selections or refresh the review; this scope removal cannot be saved.",
        );
      setPreview({ signature, data: impact });
    } catch (reason) {
      if (
        generation !== previewGeneration.current ||
        signatureRef.current !== signature
      )
        return;
      setFeedback({
        tone: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to review scope consequences. Try again.",
      });
    } finally {
      if (generation === previewGeneration.current) setPreviewing(false);
    }
  };

  const setupSteps = [
    {
      label: "Choose a clinic type",
      complete: siteId
        ? features.site_specialty_configured === true
        : features.clinic_type !== null,
    },
    { label: "Save the service profile", complete: features.configured },
    {
      label: "Review screening scope",
      complete: features.assessment_configured,
    },
    {
      label: `Finalize ${siteId ? "location" : "clinic"} setup`,
      complete: features.finalized === true,
    },
  ];
  const completedSetupSteps = setupSteps.filter((step) => step.complete).length;
  const nextSetupStepIndex = setupSteps.findIndex((step) => !step.complete);
  const nextSetupStep = setupSteps[nextSetupStepIndex];

  const toggleService = (code: ClinicServiceCode, selected: boolean) => {
    if (!canWrite || editingLocked) return;
    setServiceScope((current) =>
      selected
        ? [...current, code].filter(
            (item, index, all) => all.indexOf(item) === index,
          )
        : current.filter((item) => item !== code),
    );
    setFeedback(null);
  };
  const toggleAssessment = (code: ClinicAssessmentCode, selected: boolean) => {
    if (!canWrite || editingLocked) return;
    setAssessmentScope((current) =>
      selected
        ? [...current, code].filter(
            (item, index, all) => all.indexOf(item) === index,
          )
        : current.filter((item) => item !== code),
    );
    setFeedback(null);
  };
  const applyRecommendation = () => {
    setClinicType(features.recommended_clinic_type);
    setServiceScope(features.recommended_service_scope);
    setAssessmentScope(features.recommended_assessment_scope);
    setInsuranceEnabled(false);
    setFeedback(null);
  };
  const save = async (finalize = false, retry = false) => {
    if (!retry && !clinicType) return;
    if (uncertain && !retry) return;
    if (!retry && disabling && currentPreview?.review_complete !== true) return;
    setSaving(true);
    setFeedback(null);
    const writeSignature = JSON.stringify([
      signature,
      finalize,
      currentPreview?.impact_digest,
    ]);
    if (!retry && request.current?.signature !== writeSignature)
      request.current = { signature: writeSignature, key: crypto.randomUUID() };
    const attempt =
      retry && uncertain
        ? uncertain
        : {
            signature: writeSignature,
            finalized: finalize,
            body: {
              ...(siteId ? { site_id: siteId } : {}),
              clinic_type: clinicType,
              service_scope: [...serviceScope],
              assessment_scope: [...assessmentScope],
              insurance_workflows_enabled: insuranceEnabled,
              expected_revision: features.revision,
              request_key: request.current!.key,
              finalize,
              ...(disabling
                ? { expected_impact_digest: currentPreview!.impact_digest }
                : {}),
            },
          };
    const attemptSite = siteId;
    const attemptGeneration = scopeGeneration.current;
    try {
      await api("/api/clinic/practice_features", {
        method: "PUT",
        body: { features: attempt.body },
      });
      if (
        scopeRef.current !== attemptSite ||
        scopeGeneration.current !== attemptGeneration
      )
        return;
      setUncertain(null);
      setPreview(null);
      request.current = null;
      setFeedback({
        tone: "success",
        text: attempt.finalized
          ? "Setup finalized. Clinic-managed settings remain available."
          : `${siteId ? "Location" : "Clinic"} profile saved.`,
      });
      onProfileSaved?.(attempt.finalized);
      refresh();
    } catch (reason) {
      if (
        scopeRef.current !== attemptSite ||
        scopeGeneration.current !== attemptGeneration
      )
        return;
      const rejected =
        reason instanceof ApiError &&
        reason.code !== "outcome_unconfirmed" &&
        [400, 401, 403, 404, 409, 422].includes(reason.status);
      setUncertain(rejected ? null : attempt);
      if (rejected) {
        setPreview(null);
        request.current = null;
      }
      setFeedback({
        tone: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to save the clinic profile.",
      });
    } finally {
      if (
        scopeRef.current === attemptSite &&
        scopeGeneration.current === attemptGeneration
      )
        setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
      <Stack spacing={3}>
        <Stack spacing={1}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{
              justifyContent: "space-between",
              alignItems: { sm: "center" },
            }}
          >
            <div>
              <Typography variant="h2">
                {siteId ? "Location specialty" : "Clinic type"} and service
                scope
              </Typography>
            </div>
            <Chip
              size="small"
              color={features.configured ? "success" : "warning"}
              label={
                features.configured
                  ? `${siteId ? "Location" : "Clinic"} profile revision ${features.revision}`
                  : "Setup not saved"
              }
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {`This panel saves the ${siteId ? "location" : "clinic"} profile. Service offerings are configured separately below.`}
          </Typography>
          <Typography color="text.secondary">
            An Implementation Specialist (FDE) starts with the Meta Clinic base
            and tailors this profile with the clinic team before handoff.
          </Typography>
          {siteId && !features.site_specialty_configured && (
            <Alert severity="warning">
              Choose and save an explicit specialty for this location before
              assigning patients here.
            </Alert>
          )}
          <Alert severity="info">
            This records intended service scope. It does not grant clinical
            authority, verify credentials, or prove that a selected workflow is
            ready for patient care.
          </Alert>
          {!canWrite && (
            <Alert severity="warning">
              This profile is read-only for your role. A clinic administrator or
              Implementation Specialist can revise it.
            </Alert>
          )}
          {feedback && <Alert severity={feedback.tone}>{feedback.text}</Alert>}
          {features.finalized && (
            <Alert severity="info">
              {`Setup finalized ${features.finalized_at ? new Date(features.finalized_at).toLocaleString() : ""}. ${features.change_handoff ?? ""}`}
            </Alert>
          )}
          {clinicType === "weight_loss" && (
            <Alert severity="info">
              {features.starter_profile?.id
                ? "Applied weight-management starter, revision " +
                  features.starter_profile.version
                : "Preview: applying Weight loss creates an initial visit and a follow-up visit with distinct intake forms and goal/weight context."}{" "}
              Membership offers remain drafts until you supply and publish their
              terms. No medication, laboratory panel, price or follow-up
              interval is selected for you.
            </Alert>
          )}
          {features.starter_profile?.visits &&
            Object.values(features.starter_profile.visits).map((visit) => (
              <Typography key={visit.visit_type_id} variant="body2">
                {visit.name} · {visit.form_id} · visit type{" "}
                {visit.visit_type_id}
              </Typography>
            ))}
        </Stack>
        <Stack spacing={1}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ justifyContent: "space-between", alignItems: "baseline" }}
          >
            <Typography variant="subtitle1">Setup progress</Typography>
            <Typography color="text.secondary" variant="body2">
              {`${completedSetupSteps} of ${setupSteps.length} steps complete`}
            </Typography>
          </Stack>
          <LinearProgress
            aria-label="Clinic setup progress"
            value={(completedSetupSteps / setupSteps.length) * 100}
            variant="determinate"
          />
          <Typography color="text.secondary" variant="body2">
            {nextSetupStep
              ? `Next: ${nextSetupStep.label}.`
              : `${siteId ? "Location" : "Clinic"} profile setup is complete. Workforce settings are managed separately under Workforce.`}
          </Typography>
          <Stack component="ol" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
            {setupSteps.map((step, index) => (
              <li key={step.label}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ justifyContent: "space-between", alignItems: "center" }}
                >
                  <Typography variant="body2">{step.label}</Typography>
                  <Chip
                    size="small"
                    color={
                      step.complete
                        ? "success"
                        : index === nextSetupStepIndex
                          ? "primary"
                          : "default"
                    }
                    label={
                      step.complete
                        ? "Done"
                        : index === nextSetupStepIndex
                          ? "Next"
                          : "Later"
                    }
                  />
                </Stack>
              </li>
            ))}
          </Stack>
        </Stack>

        <FormControl
          disabled={!canWrite || editingLocked || features.finalized}
        >
          <FormLabel id="clinic-type-label">
            1. {siteId ? "Location specialty" : "Clinic type"}
          </FormLabel>
          <RadioGroup
            aria-labelledby="clinic-type-label"
            value={clinicType}
            onChange={(event) => {
              const specialty = event.target.value as ClinicType;
              setClinicType(specialty);
              setServiceScope((selected) =>
                selected.filter((code) =>
                  features.service_options_by_specialty?.[specialty]?.includes(
                    code,
                  ),
                ),
              );
              setAssessmentScope((selected) =>
                selected.filter((code) =>
                  features.assessment_options_by_specialty?.[
                    specialty
                  ]?.includes(code),
                ),
              );
              setFeedback(null);
            }}
            sx={{
              display: "grid",
              gridTemplateColumns: { md: "repeat(2, minmax(0, 1fr))" },
              gap: 1,
              mt: 1,
            }}
          >
            {clinicTypes.map((option) => (
              <Paper
                key={option.code}
                variant="outlined"
                sx={{ px: 1.5, py: 0.5 }}
              >
                <FormControlLabel
                  value={option.code}
                  control={<Radio />}
                  label={
                    <Stack spacing={0.25} sx={{ py: 0.75 }}>
                      <Typography sx={{ fontWeight: 700 }}>
                        {option.label}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {option.description}
                      </Typography>
                    </Stack>
                  }
                  sx={{ alignItems: "flex-start", m: 0, width: "100%" }}
                />
              </Paper>
            ))}
          </RadioGroup>
        </FormControl>

        <Divider />

        <FormControl disabled={!canWrite || editingLocked}>
          <FormLabel component="legend">
            {`2. Services this ${siteId ? "location" : "clinic"} intends to provide`}
          </FormLabel>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, mb: 1 }}
          >
            Choose every planned service. Readiness labels show the current
            software work still required; they are not clinical approvals.
          </Typography>
          <Stack spacing={1}>
            {visibleServices.map((service) => {
              const hardening = service.readiness === "Hardening required";
              const implementation =
                service.readiness === "Implementation required" ||
                service.readiness === "Configured intent";
              const incompatible = !serviceOptions.includes(service.code);
              return (
                <Paper
                  key={service.code}
                  variant="outlined"
                  sx={{ px: 1.5, py: 0.75 }}
                >
                  <FormControlLabel
                    data-demo-next={
                      isDemoFrame() &&
                      !features.finalized &&
                      service.code === "telehealth" &&
                      !serviceScope.includes(service.code)
                        ? "true"
                        : undefined
                    }
                    control={
                      <Checkbox
                        disabled={
                          editingLocked ||
                          !canWrite ||
                          (features.finalized &&
                            !features.selected_services?.includes(
                              service.code,
                            )) ||
                          (incompatible && !serviceScope.includes(service.code))
                        }
                        checked={serviceScope.includes(service.code)}
                        onChange={(event) =>
                          toggleService(service.code, event.target.checked)
                        }
                      />
                    }
                    label={
                      <Stack spacing={0.35} sx={{ py: 0.5 }}>
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ alignItems: "center", flexWrap: "wrap" }}
                        >
                          <Typography sx={{ fontWeight: 700 }}>
                            {service.label}
                          </Typography>
                          {incompatible && (
                            <Chip
                              size="small"
                              color="warning"
                              label="Unavailable for this specialty"
                            />
                          )}
                          <Chip
                            size="small"
                            variant="outlined"
                            color={
                              implementation
                                ? "default"
                                : hardening
                                  ? "warning"
                                  : "success"
                            }
                            label={service.readiness}
                          />
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {service.description}
                        </Typography>
                      </Stack>
                    }
                    sx={{ alignItems: "flex-start", m: 0, width: "100%" }}
                  />
                </Paper>
              );
            })}
          </Stack>
        </FormControl>

        <Divider />

        <FormControl
          id="assessment-setup"
          disabled={!canWrite || editingLocked}
        >
          <FormLabel component="legend">
            3. Screening and assessment scope
          </FormLabel>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, mb: 1 }}
          >
            Select only categories backed by a clinic-approved instrument,
            visit-type rule, responsible role, scoring rule, and follow-up
            protocol. No category is required by default.
          </Typography>
          {!features.assessment_configured && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              Assessment scope has not been explicitly reviewed for this clinic.
              Saving the profile with no selections records that no universal
              screening is configured.
            </Alert>
          )}
          <Stack spacing={1}>
            {visibleAssessments.map((assessment) => (
              <Paper
                key={assessment.code}
                variant="outlined"
                sx={{ px: 1.5, py: 0.75 }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      disabled={
                        !assessmentOptions.includes(assessment.code) &&
                        !assessmentScope.includes(assessment.code)
                      }
                      checked={assessmentScope.includes(assessment.code)}
                      onChange={(event) =>
                        toggleAssessment(assessment.code, event.target.checked)
                      }
                    />
                  }
                  label={
                    <Stack spacing={0.35} sx={{ py: 0.5 }}>
                      <Typography sx={{ fontWeight: 700 }}>
                        {assessment.label}
                      </Typography>
                      {!assessmentOptions.includes(assessment.code) && (
                        <Typography variant="caption" color="warning.main">
                          Unavailable for this specialty; remove from the
                          current profile.
                        </Typography>
                      )}
                      <Typography variant="body2" color="text.secondary">
                        {assessment.description}
                      </Typography>
                    </Stack>
                  }
                  sx={{ alignItems: "flex-start", m: 0, width: "100%" }}
                />
              </Paper>
            ))}
          </Stack>
        </FormControl>

        <Divider />

        <Stack spacing={1}>
          <Typography variant="h3">4. Payment model</Typography>
          <FormControlLabel
            disabled={
              !canWrite || editingLocked || features.finalized || isDemoFrame()
            }
            control={
              <Switch
                checked={insuranceEnabled}
                onChange={(_, checked) => {
                  setInsuranceEnabled(checked);
                  setFeedback(null);
                }}
              />
            }
            label={`This ${siteId ? "location" : "clinic"} uses insurance workflows`}
          />
          {features.finalized && (
            <Typography variant="body2" color="text.secondary">
              Insurance workflows are protected after setup is finalized.
            </Typography>
          )}
          {isDemoFrame() ? (
            <Typography variant="body2" color="text.secondary">
              Cash-based care with memberships and direct patient payments.
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Cash prices, estimates, invoices, receipts, card payments,
              refunds, credits, packages, and memberships remain part of the
              base. Turn insurance on only when the clinic needs coverage,
              eligibility, prior authorization, claims, remittance, denials, and
              payer balances.
            </Typography>
          )}
        </Stack>

        {disabling && (
          <Stack spacing={1}>
            <Alert severity="warning">
              Review the consequences before removing service or assessment
              scope.
              {siteId === null &&
                " Locations with their own saved profiles keep those settings."}
            </Alert>
            <Button
              disabled={!canWrite || editingLocked || previewing}
              onClick={() => void reviewConsequences()}
            >
              {previewing
                ? "Reviewing consequences…"
                : currentPreview
                  ? "Refresh consequences review"
                  : "Review scope consequences"}
            </Button>
            <Button
              disabled={!canWrite || editingLocked}
              onClick={() => {
                setServiceScope((selected) => [
                  ...new Set([...selected, ...features.service_scope]),
                ]);
                setAssessmentScope((selected) => [
                  ...new Set([...selected, ...features.assessment_scope]),
                ]);
                setPreview(null);
                setFeedback(null);
              }}
            >
              Restore removed selections
            </Button>
            {currentPreview && (
              <Paper
                variant="outlined"
                aria-label="Scope-removal consequences"
                sx={{ p: 2 }}
              >
                <Stack spacing={2}>
                  <Typography variant="h3">
                    Scope-removal consequences
                  </Typography>
                  <Typography variant="caption">
                    Profile revision {currentPreview.revision} · reviewed{" "}
                    {new Date(currentPreview.generated_at).toLocaleString()}
                  </Typography>
                  <Alert
                    severity={
                      currentPreview.review_complete === true
                        ? "info"
                        : "warning"
                    }
                  >
                    {currentPreview.review_complete === true
                      ? "Required source-backed references were evaluated for this profile change. This does not establish clinical or operational acceptance."
                      : "The required impact review is incomplete. This scope removal cannot be saved. Restore the affected selections to save independent settings, or obtain authorized domain review and refresh the preview."}
                  </Alert>
                  {currentPreview.services.map((impact) => (
                    <ScopeRemovalImpact
                      key={`service:${impact.service}`}
                      label={
                        services.find(
                          (service) => service.code === impact.service,
                        )?.label ?? impact.service
                      }
                      impact={impact}
                    />
                  ))}
                  {currentPreview.assessments.map((impact) => (
                    <ScopeRemovalImpact
                      key={`assessment:${impact.assessment}`}
                      label={
                        assessments.find(
                          (assessment) => assessment.code === impact.assessment,
                        )?.label ?? impact.assessment
                      }
                      impact={impact}
                    />
                  ))}
                  {currentPreview.limitations.map((limit, index) => (
                    <Typography
                      key={`limit:${index}`}
                      variant="body2"
                      color="text.secondary"
                    >
                      {limit}
                    </Typography>
                  ))}
                  <Typography variant="body2">
                    {currentPreview.preservation}
                  </Typography>
                </Stack>
              </Paper>
            )}
          </Stack>
        )}
        {uncertain && (
          <Alert severity="warning">
            The save outcome is unknown. Your original request is retained and
            editing is paused.
            <Button disabled={saving} onClick={() => void save(false, true)}>
              Retry original profile save
            </Button>
          </Alert>
        )}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
        >
          {!features.finalized && (
            <Button
              type="button"
              color="inherit"
              startIcon={<AutoFixHighOutlinedIcon />}
              disabled={!canWrite || editingLocked || features.finalized}
              onClick={applyRecommendation}
            >
              Use recommended starting scope
            </Button>
          )}
          {!features.finalized && features.configured && (
            <Button
              id="clinic-setup-finalize"
              data-demo-next
              disabled={!canWrite || editingLocked || changed}
              onClick={() => void save(true)}
            >
              Finalize {siteId ? "location" : "clinic"} setup
            </Button>
          )}
          <Button
            type="button"
            variant="contained"
            data-demo-next
            startIcon={<SaveOutlinedIcon />}
            disabled={saveDisabledReason !== null}
            aria-describedby="profile-save-status"
            onClick={() => void save()}
          >
            {saving
              ? "Saving profile…"
              : `Save ${siteId ? "location" : "clinic"} profile`}
          </Button>
        </Stack>
        {saveDisabledReason && (
          <Typography
            id="profile-save-status"
            variant="body2"
            color="text.secondary"
            role="status"
          >
            {saveDisabledReason}
          </Typography>
        )}
        {canWrite && !editingLocked && features.revision > 1 && (
          <FeatureHistory
            key={siteId ?? "clinic"}
            siteId={siteId}
            current={features}
            onApply={(saved) => {
              setClinicType(saved.clinic_type);
              setServiceScope(saved.service_scope);
              setAssessmentScope(saved.assessment_scope);
              setInsuranceEnabled(saved.insurance_workflows);
              setFeedback(null);
            }}
          />
        )}
      </Stack>
    </Paper>
  );
}
