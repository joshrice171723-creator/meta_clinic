import { useMemo, useState } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  FormGroup,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

type DecisionOption = { id: string; label: string };
type Decision = {
  id: string;
  area: string;
  title: string;
  current: string;
  question: string;
  inputs: string[];
  options: DecisionOption[];
};

const decisions: Decision[] = [
  {
    id: "weight_intake",
    area: "Care journey",
    title: "Weight-management intake scope",
    current:
      "The M1–M12 reference journey has durable primitives, but the detailed intake, evidence/consent, clarification ownership, and shorter follow-up form remain partial.",
    question:
      "What must the first completed weight-management journey capture, and what belongs only in follow-up?",
    inputs: [
      "The initial visit types and whether intake is patient-entered, staff-assisted, or both.",
      "Which facts need confirmation, which need clinical review, and who owns unresolved answers.",
      "The minimum follow-up facts that indicate change without recreating the initial intake.",
    ],
    options: [
      {
        id: "initial",
        label: "Build the complete initial intake across M1–M10.",
      },
      {
        id: "confirmation",
        label:
          "Add distinct patient/staff confirmation and clinician-review states (M11).",
      },
      {
        id: "follow_up",
        label: "Add a shorter, change-focused follow-up form (M12).",
      },
      {
        id: "clarification",
        label:
          "Create owned clarification/support work for unknown or conflicting answers.",
      },
    ],
  },
  {
    id: "clinical_governance",
    area: "Care journey",
    title: "Clinical review, signing, and exception authority",
    current:
      "The product records provenance and revision history, but it cannot infer which roles may review, sign, approve exceptions, or treat an AI-assisted draft as final.",
    question:
      "Which named roles may collect information, review it, sign it, and approve clinical or financial exceptions?",
    inputs: [
      "Role names, scope by clinic/site, and whether a delegated role can act under a clinician's review.",
      "The exact action being approved: note signature, medication decision, result follow-up, refund, or another exception.",
      "The required evidence, handoff, correction path, and what remains blocked when the approver is unavailable.",
    ],
    options: [
      {
        id: "staff_capture",
        label:
          "Staff may collect and confirm information but may not provide clinical approval.",
      },
      {
        id: "named_clinician",
        label:
          "Require a named eligible clinician for clinical review and signature.",
      },
      {
        id: "exceptions",
        label:
          "Require a recorded named approver for clinical or financial exceptions.",
      },
      {
        id: "ai_boundary",
        label:
          "Keep AI-assisted content as a draft until a human reviewer records approval.",
      },
    ],
  },
  {
    id: "assessments_and_services",
    area: "Care journey",
    title: "Reusable assessments and service offerings",
    current:
      "The app has chart fields and configurable clinic scope, but no selected reusable-instrument model or service-offering catalog linking clinic, sites, eligibility, availability, and booking requirements.",
    question:
      "Which assessments and services are worth modeling now, and which should stay unconfigured?",
    inputs: [
      "The exact instrument, publisher/version, permitted use, scoring method, and reviewer for each assessment.",
      "The first services offered, eligible sites, visit types, booking/referral requirements, and contact channel.",
      "Whether the clinic wants data capture only or a structured workflow with review and follow-up ownership.",
    ],
    options: [
      {
        id: "no_instruments",
        label: "Do not productize any standardized assessment yet.",
      },
      {
        id: "selected_instruments",
        label:
          "Model only explicitly named, versioned instruments with response provenance.",
      },
      {
        id: "service_catalog",
        label:
          "Build a structured service-offering catalog for the first clinic profile.",
      },
      {
        id: "scope_only",
        label:
          "Keep service selection as implementation scope until each workflow is hardened.",
      },
    ],
  },
  {
    id: "medication_immunization_testing",
    area: "Care journey",
    title:
      "Medication administration, immunizations, and point-of-care testing",
    current:
      "Medication administration needs its failing verification repaired. Immunization records are not administration-grade, and point-of-care testing is only a configured scope flag until site authority and test policy are recorded.",
    question:
      "Which of these care workflows should be built for the first clinic, and what policy evidence must gate them?",
    inputs: [
      "The intended services, clinic sites, eligible roles, and whether administration occurs on-site.",
      "For immunizations: required CVX/MVX, lot, expiry, dose, route/site, vaccinator, facility, VIS, and inventory-link rules.",
      "For testing: applicable certificate/status, test catalog and complexity, effective dates, and state-specific restrictions.",
    ],
    options: [
      {
        id: "repair_med_admin",
        label:
          "Repair medication-administration verification before expanding that workflow.",
      },
      {
        id: "immunization",
        label:
          "Build administration-grade immunization documentation and lot traceability.",
      },
      {
        id: "no_immunization",
        label:
          "Keep immunization administration unavailable for the first clinic.",
      },
      {
        id: "poc_testing",
        label:
          "Build a fail-closed point-of-care testing authority gate after the policy inputs are supplied.",
      },
    ],
  },
  {
    id: "availability_policy",
    area: "Scheduling",
    title: "Availability, resource capacity, and reservation recovery",
    current:
      "Appointments and calendar views exist, but availability is not a separate Schedule/Slot-like concept. Recurrence and overbooking are explicitly not configured.",
    question:
      "What should count as available, held, booked, blocked, expired, or overbooked for the first clinic?",
    inputs: [
      "Which resources constrain booking: clinician, room, site, equipment, service, or visit type.",
      "Planning horizon, timezone/DST treatment, operating-hours exceptions, and hold expiration rules.",
      "The recovery behavior for an expired offer, interrupted booking, duplicate request, and a capacity conflict.",
    ],
    options: [
      {
        id: "slot_foundation",
        label:
          "Build a bounded internal availability/hold/booking model without advanced recurrence.",
      },
      {
        id: "no_overbook",
        label:
          "Keep overbooking unavailable until an owner approves a specific policy.",
      },
      {
        id: "resource_capacity",
        label:
          "Model capacity for explicitly selected clinicians, rooms, and visit types.",
      },
      {
        id: "reservation_recovery",
        label: "Require explicit reservation expiry and staff recovery states.",
      },
    ],
  },
  {
    id: "schedule_exceptions",
    area: "Scheduling",
    title: "Closures, absences, buffers, recurrence, and cancellation",
    current:
      "Timezone, capacity, conflict, cancellation, and site-assignment guards exist; owners have not approved policy for recurrence exceptions, overbooking, buffers, provider absence, or closure exceptions.",
    question:
      "Which scheduling exceptions are allowed for the first clinic, and who can create or override them?",
    inputs: [
      "Holiday/closure source, provider-absence process, minimum notice, and who can change availability.",
      "Whether buffers vary by visit type, clinician, room, or service.",
      "Whether recurring appointments are needed now and how changes/cancellations should affect future occurrences.",
    ],
    options: [
      {
        id: "closures",
        label:
          "Support staff-recorded closures and provider absences with an audit trail.",
      },
      {
        id: "buffers",
        label:
          "Configure explicit buffers for selected visit types or resources.",
      },
      {
        id: "no_recurrence",
        label: "Keep recurrence unavailable for the initial release.",
      },
      {
        id: "bounded_recurrence",
        label: "Authorize a separately specified bounded recurrence policy.",
      },
    ],
  },
  {
    id: "cash_estimates",
    area: "Billing",
    title: "Cash-pay estimates and Good Faith Estimates",
    current:
      "Cash prices, invoices, receipts, and transactions exist, but the advertised estimates capability has no patient estimate model or workflow. An invoice or price list is not an estimate.",
    question:
      "What estimate workflow should the product support for the first clinic?",
    inputs: [
      "Whether the clinic needs a general self-pay estimate, a Good Faith Estimate workflow, or both.",
      "Required fields, who authors/reviews it, when it is delivered, its revision/correction rules, and delivery method.",
      "Applicable jurisdiction, service types, amount calculation source, retention requirement, and patient-support escalation.",
    ],
    options: [
      {
        id: "self_pay_estimate",
        label:
          "Build a general self-pay estimate workflow with versioned line items.",
      },
      {
        id: "gfe",
        label:
          "Build a Good Faith Estimate workflow after legal/policy review supplies the required contract.",
      },
      {
        id: "no_estimate",
        label: "Keep estimates out of scope; retain prices and invoices only.",
      },
      {
        id: "human_review",
        label:
          "Require named staff review before any estimate is issued to a patient.",
      },
    ],
  },
  {
    id: "tax_receipts",
    area: "Billing",
    title: "Tax, receipt, correction, and reconciliation ownership",
    current:
      "The cash-pay core has bounded local ledger work, but receipt policy, accounting/tax treatment, correction governance, and reconciliation ownership remain open human decisions.",
    question:
      "Who owns financial policy and what rules must the app enforce before a clinic uses it?",
    inputs: [
      "Tax jurisdiction and service treatment, receipt content/version, numbering, delivery, and retention requirements.",
      "Who can correct, reopen, refund, void, or reconcile a discrepancy, and what evidence they must record.",
      "The relationship between clinic records, accounting systems, and the customer-facing support path.",
    ],
    options: [
      {
        id: "financial_owner",
        label:
          "Name a financial-policy owner for tax, receipts, corrections, and reconciliation.",
      },
      {
        id: "manager_reconciliation",
        label:
          "Require manager review for cash-drawer discrepancies and corrections.",
      },
      {
        id: "receipt_policy",
        label:
          "Define a versioned receipt policy before receipt delivery is enabled.",
      },
      {
        id: "accounting_handoff",
        label:
          "Document the accounting handoff and explicitly retain Meta Clinic as the operational ledger.",
      },
    ],
  },
  {
    id: "lab_data",
    area: "Data and reporting",
    title: "Computable laboratory result data",
    current:
      "Orders, specimens, immutable report versions, review, and follow-up exist. Result rows still use mostly free text rather than a selected coded/typed contract.",
    question:
      "Which lab-result semantics should be required for the first clinic's results?",
    inputs: [
      "The first result types and accepted external sources.",
      "Code systems and versions, typed result categories, UCUM unit/display policy, interpretations, and reference-range source.",
      "Specimen coding and whether performer/issuing organization identity is available from the report.",
    ],
    options: [
      {
        id: "coded_results",
        label:
          "Add code system/version, typed values, interpretations, and structured ranges.",
      },
      {
        id: "ucum",
        label:
          "Store UCUM codes plus display values; do not infer clinical conversions.",
      },
      {
        id: "limited_results",
        label:
          "Limit the first implementation to explicitly selected lab result types.",
      },
      {
        id: "free_text",
        label:
          "Keep results as reviewed free text until a source-specific contract is approved.",
      },
    ],
  },
  {
    id: "reporting_exports",
    area: "Data and reporting",
    title:
      "Reporting catalog, export permissions, retention, and reconciliation",
    current:
      "There are domain reports, aggregate owner totals, lineage, and a read-only iCalendar export, but no consolidated report catalog, retention/PHI contract, export-permission policy, or named reconciliation owner.",
    question:
      "What reports and exports are allowed, who may access them, and how are they governed?",
    inputs: [
      "The first reports, their business purpose, source records, freshness, filters, timezone, and expected totals.",
      "Row-level access rules, export formats, provenance, delivery channel, and who reconciles mismatches.",
      "Retention, deletion, legal-hold, and sensitive-data handling requirements for every report/export.",
    ],
    options: [
      {
        id: "catalog",
        label: "Build a bounded report catalog for named first-use cases.",
      },
      {
        id: "aggregate_only",
        label:
          "Keep owner-level reporting aggregate-only unless a separate permission contract is approved.",
      },
      {
        id: "no_exports",
        label:
          "Keep exports disabled except the existing read-only calendar export.",
      },
      {
        id: "export_policy",
        label:
          "Authorize exports only after retention, access, provenance, and reconciliation ownership are recorded.",
      },
    ],
  },
  {
    id: "privacy_security",
    area: "Privacy and operations",
    title: "Privacy, security, incident, and deletion ownership",
    current:
      "No source change establishes privacy, security, incident-response, deletion, or release acceptance. These require named owners and controlled evidence.",
    question:
      "Who owns each operational safeguard, and what evidence is required before a pilot?",
    inputs: [
      "Named owner for privacy, security, incident response, backup/restore, access review, retention/deletion, and vulnerability handling.",
      "Data classification, approved environments, logging/analytics boundary, and how a suspected incident is escalated.",
      "The tabletop, access-review, restore, and sign-off evidence expected before a pilot decision.",
    ],
    options: [
      {
        id: "owners",
        label:
          "Assign named owners for privacy, security, incidents, access review, and deletion.",
      },
      {
        id: "tabletop",
        label:
          "Require controlled incident and restore tabletops before pilot review.",
      },
      {
        id: "access_review",
        label:
          "Require periodic access-review and revocation evidence for each clinic.",
      },
      {
        id: "no_pilot",
        label:
          "Keep pilot/release unavailable until the required evidence is accepted.",
      },
    ],
  },
  {
    id: "identity_support",
    area: "Privacy and operations",
    title: "Patient access, recovery, step-up, and support ownership",
    current:
      "Portal workflows are bounded, but invitation, step-up authentication, recovery/revocation, support response expectations, and after-hours boundaries are not fully approved. The current step-up endpoint is intentionally unavailable.",
    question:
      "What patient-access recovery and support experience is the clinic willing to operate?",
    inputs: [
      "Who verifies identity during invitation, recovery, step-up, and revocation; and what evidence they require.",
      "Supported channels, hours, response objective, escalation owner, and the boundary between support and medical advice.",
      "The recovery path for an unavailable delivery channel, suspected account compromise, and a locked-out patient.",
    ],
    options: [
      {
        id: "support_owner",
        label:
          "Name a clinic support owner and service boundary for portal access.",
      },
      {
        id: "recovery_policy",
        label:
          "Approve an identity-recovery and revocation policy before expanding self-service recovery.",
      },
      {
        id: "step_up",
        label:
          "Specify the cases that require step-up authentication and the allowed verification method.",
      },
      {
        id: "limited_portal",
        label:
          "Keep the portal limited to already-supported access paths until support policy is accepted.",
      },
    ],
  },
  {
    id: "accessibility_release",
    area: "Readiness",
    title: "Accessibility, pilot, and release acceptance",
    current:
      "Focused browser checks cover route load, some narrow-layout behavior, and visible names. Screen-reader output, contrast, true zoom, modal/error-state walkthroughs, broader role actions, and pilot/release criteria are still open.",
    question:
      "What evidence should be required before a limited pilot or release decision?",
    inputs: [
      "Required devices, browsers, roles, and representative workflows for the first clinic.",
      "Accessibility acceptance scope: keyboard, screen reader, contrast, 200% text zoom, 400% browser zoom, modals, loading/stale/error states.",
      "Pilot population, support coverage, stop conditions, rollback path, accepting reviewer, and final go/no-go authority.",
    ],
    options: [
      {
        id: "accessibility_pass",
        label:
          "Run a dedicated WCAG-oriented acceptance pass before pilot review.",
      },
      {
        id: "role_matrix",
        label:
          "Require fresh permitted/denied-action evidence for every pilot role and site.",
      },
      {
        id: "pilot_plan",
        label:
          "Define pilot scope, stop conditions, support coverage, rollback, and accepting reviewer.",
      },
      {
        id: "release_gate",
        label:
          "Require explicit human go/no-go approval; a passing build is not enough.",
      },
    ],
  },
];

export type DecisionAnswers = Record<string, string[]>;
export type DecisionContext = Record<"clinic" | "owner" | "goal", string>;

const emptyAnswers = (): DecisionAnswers =>
  Object.fromEntries(decisions.map((decision) => [decision.id, []]));

export function buildDecisionBrief(
  answers: DecisionAnswers,
  notes: Record<string, string>,
  context: DecisionContext,
) {
  const lines = [
    "# Meta Clinic decision response",
    "",
    `- Clinic/profile: ${context.clinic.trim() || "Not specified"}`,
    `- Decision owner: ${context.owner.trim() || "Not specified"}`,
    `- Intended next milestone: ${context.goal.trim() || "Not specified"}`,
    "- Scope: non-vendor product, policy, and acceptance decisions only.",
    "",
  ];
  for (const decision of decisions) {
    const selected = new Set(answers[decision.id] ?? []);
    const labels = decision.options
      .filter((option) => selected.has(option.id))
      .map((option) => option.label);
    lines.push(`## ${decision.title}`, "");
    if (labels.length) lines.push(...labels.map((label) => `- ${label}`));
    else lines.push("- No answer recorded.");
    if (notes[decision.id]?.trim())
      lines.push(`- Notes: ${notes[decision.id].trim()}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function FounderDecisionWorkspace() {
  const [answers, setAnswers] = useState<DecisionAnswers>(emptyAnswers);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [context, setContext] = useState<DecisionContext>({
    clinic: "",
    owner: "",
    goal: "",
  });
  const [copied, setCopied] = useState(false);
  const answeredCount = decisions.filter(
    (decision) => (answers[decision.id] ?? []).length > 0,
  ).length;
  const brief = useMemo(
    () => buildDecisionBrief(answers, notes, context),
    [answers, notes, context],
  );

  const toggle = (decisionId: string, optionId: string, checked: boolean) => {
    setAnswers((current) => {
      const selected = new Set(current[decisionId] ?? []);
      if (checked) selected.add(optionId);
      else selected.delete(optionId);
      return { ...current, [decisionId]: [...selected] };
    });
    setCopied(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const reset = () => {
    setAnswers(emptyAnswers());
    setNotes({});
    setContext({ clinic: "", owner: "", goal: "" });
    setCopied(false);
  };

  return (
    <Box
      component="main"
      sx={{
        bgcolor: "#f5f7f4",
        color: "#20352f",
        minHeight: "100vh",
        py: { xs: 3, sm: 5 },
      }}
    >
      <Stack
        spacing={3}
        sx={{ maxWidth: 1080, mx: "auto", px: { xs: 2, sm: 3 } }}
      >
        <Box>
          <Typography
            variant="overline"
            sx={{ color: "#52655e", fontWeight: 700 }}
          >
            Meta Clinic · founder decision workspace
          </Typography>
          <Typography
            component="h1"
            variant="h1"
            sx={{ mt: 0.5, maxWidth: 780 }}
          >
            Decide the work that code cannot responsibly guess.
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 820 }}>
            This page excludes vendor selection and connection work. It collects
            the human policy, ownership, and acceptance choices needed to turn
            the remaining product gaps into bounded builds.
          </Typography>
        </Box>

        <Alert severity="info">
          Your choices stay only in this browser tab. Nothing is saved to Meta
          Clinic. Use the copy-ready response at the end to send your decisions
          back.
        </Alert>

        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <Box>
              <Typography component="h2" variant="h2">
                Decision context
              </Typography>
              <Typography
                color="text.secondary"
                variant="body2"
                sx={{ mt: 0.5 }}
              >
                These optional details let the generated response identify the
                decision without exposing any patient data.
              </Typography>
            </Box>
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: { md: "repeat(3, minmax(0, 1fr))" },
              }}
            >
              {(
                [
                  ["clinic", "Clinic or reference profile"],
                  ["owner", "Decision owner"],
                  ["goal", "Intended next milestone"],
                ] as const
              ).map(([field, label]) => (
                <TextField
                  key={field}
                  label={label}
                  value={context[field]}
                  onChange={(event) => {
                    setContext((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }));
                    setCopied(false);
                  }}
                />
              ))}
            </Box>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }} aria-label="Decision progress">
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            sx={{ alignItems: { sm: "center" } }}
          >
            <Chip
              label={`${answeredCount} of ${decisions.length} decision areas answered`}
              color={answeredCount ? "primary" : "default"}
            />
            <LinearProgress
              aria-label={`${answeredCount} of ${decisions.length} decision areas answered`}
              variant="determinate"
              value={(answeredCount / decisions.length) * 100}
              sx={{ flex: 1, minWidth: 180 }}
            />
            <Button
              color="inherit"
              startIcon={<RestartAltIcon />}
              onClick={reset}
            >
              Clear answers
            </Button>
          </Stack>
        </Paper>

        <Stack spacing={1.5}>
          {decisions.map((decision, index) => {
            const selected = new Set(answers[decision.id] ?? []);
            return (
              <Accordion
                key={decision.id}
                defaultExpanded={index === 0}
                disableGutters
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  aria-controls={`${decision.id}-content`}
                  id={`${decision.id}-header`}
                >
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{ alignItems: { sm: "center" }, pr: 1 }}
                  >
                    <Chip
                      label={decision.area}
                      size="small"
                      variant="outlined"
                    />
                    <Typography component="h2" variant="h2">
                      {decision.title}
                    </Typography>
                    {selected.size > 0 && (
                      <Chip
                        label={`${selected.size} selected`}
                        size="small"
                        color="primary"
                      />
                    )}
                  </Stack>
                </AccordionSummary>
                <AccordionDetails id={`${decision.id}-content`}>
                  <Stack spacing={2.5}>
                    <Box>
                      <Typography variant="subtitle2">
                        What is true today
                      </Typography>
                      <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                        {decision.current}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2">
                        Decision needed
                      </Typography>
                      <Typography sx={{ mt: 0.5, fontWeight: 650 }}>
                        {decision.question}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2">
                        Information to have before deciding
                      </Typography>
                      <Box
                        component="ul"
                        sx={{
                          color: "text.secondary",
                          m: 0,
                          mt: 0.75,
                          pl: 2.5,
                        }}
                      >
                        {decision.inputs.map((input) => (
                          <li key={input}>{input}</li>
                        ))}
                      </Box>
                    </Box>
                    <Divider />
                    <Box>
                      <Typography
                        id={`${decision.id}-answers`}
                        variant="subtitle2"
                      >
                        Select every direction you want reflected in the
                        implementation brief
                      </Typography>
                      <FormGroup
                        aria-labelledby={`${decision.id}-answers`}
                        sx={{ mt: 0.5 }}
                      >
                        {decision.options.map((option) => (
                          <FormControlLabel
                            key={option.id}
                            control={
                              <Checkbox
                                checked={selected.has(option.id)}
                                onChange={(event) =>
                                  toggle(
                                    decision.id,
                                    option.id,
                                    event.target.checked,
                                  )
                                }
                              />
                            }
                            label={option.label}
                            sx={{
                              alignItems: "flex-start",
                              my: 0.25,
                              "& .MuiFormControlLabel-label": { pt: "9px" },
                            }}
                          />
                        ))}
                      </FormGroup>
                    </Box>
                    <TextField
                      label="Context, constraints, or a different answer"
                      multiline
                      minRows={2}
                      value={notes[decision.id] ?? ""}
                      onChange={(event) => {
                        setNotes((current) => ({
                          ...current,
                          [decision.id]: event.target.value,
                        }));
                        setCopied(false);
                      }}
                      helperText="This is included verbatim in the copy-ready response. Do not enter patient, credential, or other sensitive data."
                    />
                  </Stack>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Stack>

        <Paper
          component="section"
          variant="outlined"
          sx={{ p: { xs: 2, sm: 3 }, mb: 3 }}
          aria-labelledby="response-title"
        >
          <Stack spacing={2}>
            <Box>
              <Typography component="h2" variant="h2" id="response-title">
                Copy-ready response
              </Typography>
              <Typography
                color="text.secondary"
                variant="body2"
                sx={{ mt: 0.5 }}
              >
                This is generated from your selections and notes. You can edit
                it before sending it back.
              </Typography>
            </Box>
            <TextField
              aria-label="Generated decision response"
              multiline
              minRows={18}
              maxRows={30}
              value={brief}
              onChange={() => undefined}
              slotProps={{ input: { readOnly: true } }}
            />
            <Stack
              direction={{ xs: "column-reverse", sm: "row" }}
              spacing={1}
              sx={{ justifyContent: "space-between" }}
            >
              <Typography
                role="status"
                color={copied ? "success.main" : "text.secondary"}
                variant="body2"
              >
                {copied
                  ? "Copied. Paste this into your reply."
                  : "Select answers above, then copy the response."}
              </Typography>
              <Button
                variant="contained"
                startIcon={<ContentCopyIcon />}
                onClick={() => void copy()}
              >
                Copy decision response
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
