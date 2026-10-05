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
import { api } from "../../api/client";
import { isDemoFrame } from "../demo/frame";
import type {
  ClinicAssessmentCode,
  ClinicServiceCode,
  ClinicType,
  PracticeFeatures,
} from "../../api/contracts";
import { LoadState, useResource } from "../../shared/ui";

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
  readiness: "Base workflow" | "Hardening required" | "Implementation required";
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
    code: "cognitive_status",
    label: "Cognitive status",
    description: "Clinic-approved cognitive-status assessment protocol.",
  },
];

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
        Load an earlier version into this form, review it, then use Save clinic
        profile. Current permissions and protected-profile rules still apply.
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
  const siteQuery = siteId ? `?site_id=${siteId}` : "";
  const { data, error, refresh } = useResource<{ features: PracticeFeatures }>(
    `/api/clinic/practice_features${siteQuery}`,
  );
  const [clinicType, setClinicType] = useState<ClinicType>("primary_care");
  const [serviceScope, setServiceScope] = useState<ClinicServiceCode[]>([]);
  const [assessmentScope, setAssessmentScope] = useState<
    ClinicAssessmentCode[]
  >([]);
  const [insuranceEnabled, setInsuranceEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const request = useRef<{ signature: string; key: string } | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const features = data?.features;
  useEffect(() => {
    if (!features) return;
    setClinicType(features.clinic_type ?? features.recommended_clinic_type);
    setServiceScope(features.service_scope);
    setAssessmentScope(features.assessment_scope);
    setInsuranceEnabled(features.insurance_workflows_enabled);
  }, [features]);

  const changed = useMemo(
    () =>
      features !== undefined &&
      (clinicType !==
        (features.clinic_type ?? features.recommended_clinic_type) ||
        !sameSelection(serviceScope, features.service_scope) ||
        !sameSelection(assessmentScope, features.assessment_scope) ||
        insuranceEnabled !== features.insurance_workflows_enabled),
    [assessmentScope, clinicType, features, insuranceEnabled, serviceScope],
  );

  if (!features) return <LoadState error={error} />;

  const toggleService = (code: ClinicServiceCode, selected: boolean) => {
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
  const save = async (finalize = false) => {
    setSaving(true);
    setFeedback(null);
    const signature = JSON.stringify([
      clinicType,
      serviceScope,
      assessmentScope,
      insuranceEnabled,
      features.revision,
      siteId,
      finalize,
    ]);
    if (request.current?.signature !== signature)
      request.current = { signature, key: crypto.randomUUID() };
    try {
      await api("/api/clinic/practice_features", {
        method: "PUT",
        body: {
          features: {
            ...(siteId ? { site_id: siteId } : {}),
            clinic_type: clinicType,
            service_scope: serviceScope,
            assessment_scope: assessmentScope,
            insurance_workflows_enabled: insuranceEnabled,
            expected_revision: features.revision,
            request_key: request.current.key,
            finalize,
          },
        },
      });
      setFeedback({
        tone: "success",
        text: finalize
          ? "Setup finalized. Clinic-managed settings remain available."
          : "Clinic profile saved. The selected starter forms and visit types are ready to configure.",
      });
      onProfileSaved?.(finalize);
      refresh();
    } catch (reason) {
      setFeedback({
        tone: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to save the clinic profile.",
      });
    } finally {
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
              <Typography variant="overline" color="text.secondary">
                IMPLEMENTATION PROFILE
              </Typography>
              <Typography variant="h2">
                Clinic type and service scope
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
          <Typography color="text.secondary">
            An Implementation Specialist (FDE) starts with the Meta Clinic base
            and tailors this profile with the clinic team before handoff.
          </Typography>
          {siteId && !features.site_specialty_configured && (
            <Alert severity="warning">
              This location currently inherits its clinic profile. Choose and
              save a location specialty before assigning patients here.
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
              Setup finalized {features.finalized_at}. {features.change_handoff}
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

        <FormControl disabled={!canWrite || saving || features.finalized}>
          <FormLabel id="clinic-type-label">
            1. {siteId ? "Location specialty" : "Clinic type"}
          </FormLabel>
          <RadioGroup
            aria-labelledby="clinic-type-label"
            value={clinicType}
            onChange={(event) => {
              setClinicType(event.target.value as ClinicType);
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

        <FormControl disabled={!canWrite || saving}>
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
            {services.map((service) => {
              const hardening = service.readiness === "Hardening required";
              const implementation =
                service.readiness === "Implementation required";
              const therapyRequiresBehavioralHealth =
                service.code === "individual_therapy" &&
                clinicType !== "behavioral_health";
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
                          (features.finalized &&
                            !features.selected_services?.includes(
                              service.code,
                            )) ||
                          (therapyRequiresBehavioralHealth &&
                            !serviceScope.includes(service.code))
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

        <FormControl disabled={!canWrite || saving}>
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
            {assessments.map((assessment) => (
              <Paper
                key={assessment.code}
                variant="outlined"
                sx={{ px: 1.5, py: 0.75 }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
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
          {isDemoFrame() ? (
            <Typography variant="body2" color="text.secondary">
              Cash-based care with memberships and direct patient payments.
            </Typography>
          ) : (
            <>
              <FormControlLabel
                disabled={!canWrite || saving || features.finalized}
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
              <Typography variant="body2" color="text.secondary">
                Cash prices, estimates, invoices, receipts, card payments,
                refunds, credits, packages, and memberships remain part of the
                base. Turn insurance on only when the clinic needs coverage,
                eligibility, prior authorization, claims, remittance, denials,
                and payer balances.
              </Typography>
            </>
          )}
        </Stack>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
        >
          <Button
            type="button"
            color="inherit"
            startIcon={<AutoFixHighOutlinedIcon />}
            disabled={!canWrite || saving || features.finalized}
            onClick={applyRecommendation}
          >
            Use recommended starting scope
          </Button>
          {!features.finalized && features.configured && (
            <Button
              id="clinic-setup-finalize"
              data-demo-next
              disabled={!canWrite || saving || changed}
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
            disabled={!canWrite || saving || (!changed && features.configured)}
            onClick={() => void save()}
          >
            {saving ? "Saving profile…" : "Save clinic profile"}
          </Button>
        </Stack>
        {canWrite && features.revision > 1 && (
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
