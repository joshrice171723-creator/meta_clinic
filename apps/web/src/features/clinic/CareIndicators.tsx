import { useEffect, useState, type ElementType, type ReactNode } from "react";
import {
  Badge,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import AccessibilityNewOutlinedIcon from "@mui/icons-material/AccessibilityNewOutlined";
import MasksOutlinedIcon from "@mui/icons-material/MasksOutlined";
import MedicalInformationOutlinedIcon from "@mui/icons-material/MedicalInformationOutlined";
import MedicationOutlinedIcon from "@mui/icons-material/MedicationOutlined";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import TranslateOutlinedIcon from "@mui/icons-material/TranslateOutlined";
import { api } from "../../api/client";
import type { PatientCareSummary } from "../../api/contracts";

type SummaryVisit = {
  id: string;
  patientId?: number | null;
  encounterId?: number | null;
};

export type CareSummaryLoadState =
  | { status: "unlinked" }
  | { status: "not_applicable" }
  | { status: "loading" }
  | { status: "ready"; summary: PatientCareSummary }
  | { status: "error" };

type CareDetail = { primary: string; secondary?: string };
type CareIndicatorGroup = {
  key:
    | "allergies"
    | "medications"
    | "communication"
    | "access"
    | "precautions"
    | "conditions"
    | "review";
  label: string;
  icon: ElementType;
  details: CareDetail[];
};

const stateLabels: Record<string, string> = {
  current_list_confirmed: "Current list confirmed",
  none_reported: "None reported",
  follow_up_needed: "Follow-up needed",
  unable_to_obtain: "Unable to obtain",
  not_reviewed: "Not reviewed",
  not_recorded: "Not recorded",
};

function words(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function careSummaryPath(visit: SummaryVisit) {
  if (visit.patientId == null) return null;
  const base = `/api/clinic/patients/${encodeURIComponent(String(visit.patientId))}/care_summary`;
  return visit.encounterId == null
    ? base
    : `${base}?encounter_id=${encodeURIComponent(String(visit.encounterId))}`;
}

export function recordedDateLabel(
  value: string | null | undefined,
  timezone = "UTC",
) {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "Date not recorded";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeZone: timezone,
    }).format(date);
  } catch {
    return "Date not recorded";
  }
}

function recordedOn(value: string | null | undefined, timezone: string) {
  return `Recorded ${recordedDateLabel(value, timezone)}`;
}

function detail(primary: string, secondary?: string | null): CareDetail {
  return { primary, ...(secondary ? { secondary } : {}) };
}

function reviewDetails(summary: PatientCareSummary, timezone: string) {
  const labels = {
    allergies: "Allergies",
    medications: "Medications",
    care_needs: "Care needs",
  };
  const collectionStates = {
    allergies: summary.allergies.state,
    medications: summary.medications.state,
    care_needs: summary.care_needs.state,
  };
  const availableTopics = Object.keys(labels) as (keyof typeof labels)[];
  const requestedTopics = new Set(summary.review_needed_topics ?? []);
  const topics = availableTopics.filter((topic) => {
    const reviewState = summary.reviews[topic].state;
    return (
      requestedTopics.has(topic) ||
      collectionStates[topic] === "not_recorded" ||
      reviewState === "not_reviewed" ||
      reviewState === "follow_up_needed" ||
      reviewState === "unable_to_obtain"
    );
  });
  const displayedTopics = topics.length ? topics : availableTopics;
  return displayedTopics.map((topic) => {
    const review = summary.reviews[topic];
    const date = review.reviewed_at
      ? ` · ${recordedDateLabel(review.reviewed_at, timezone)}`
      : "";
    return detail(
      labels[topic],
      `${stateLabels[review.state] ?? words(review.state)}${date}`,
    );
  });
}

export function careIndicatorGroups(
  state: CareSummaryLoadState,
  timezone = "UTC",
): CareIndicatorGroup[] {
  if (state.status === "unlinked")
    return [
      {
        key: "review",
        label: "Care summary unavailable",
        icon: PendingActionsOutlinedIcon,
        details: [
          detail(
            "Select the patient chart",
            "No linked care summary is available.",
          ),
        ],
      },
    ];
  if (state.status === "error")
    return [
      {
        key: "review",
        label: "Care summary could not be loaded",
        icon: PendingActionsOutlinedIcon,
        details: [
          detail(
            "Summary unavailable",
            "Open the patient chart before relying on the concern summary.",
          ),
        ],
      },
    ];
  if (state.status !== "ready") return [];

  const { summary } = state;
  const groups: CareIndicatorGroup[] = [];
  if (summary.allergies.items.length)
    groups.push({
      key: "allergies",
      label: "Allergies",
      icon: ReportProblemOutlinedIcon,
      details: summary.allergies.items.map((item) =>
        detail(
          item.allergen,
          `${item.reaction || "Reaction not recorded"} · ${recordedOn(item.recorded_at, timezone)}`,
        ),
      ),
    });
  if (summary.medications.items.length)
    groups.push({
      key: "medications",
      label: "Medications",
      icon: MedicationOutlinedIcon,
      details: summary.medications.items.map((item) => {
        const directions = [item.dose, item.route, item.frequency]
          .filter(Boolean)
          .join(" · ");
        return detail(
          item.medication,
          `${directions || "Directions not recorded"} · ${recordedOn(item.recorded_at, timezone)}`,
        );
      }),
    });
  if (
    summary.communication.interpreter_required === true ||
    summary.communication.needs.length
  )
    groups.push({
      key: "communication",
      label: "Communication needs",
      icon: TranslateOutlinedIcon,
      details: [
        ...(summary.communication.interpreter_required === true
          ? [
              detail(
                "Interpreter required",
                summary.communication.primary_language ||
                  "Primary language not recorded",
              ),
            ]
          : []),
        ...summary.communication.needs.map((item) =>
          detail(
            item.description,
            `${item.instructions || words(item.code)} · ${recordedOn(item.recorded_at, timezone)}`,
          ),
        ),
      ],
    });
  const accessNeeds = summary.care_needs.items.filter(
    (item) => item.category !== "communication",
  );
  if (accessNeeds.length)
    groups.push({
      key: "access",
      label: "Access and care needs",
      icon: AccessibilityNewOutlinedIcon,
      details: accessNeeds.map((item) =>
        detail(
          item.description,
          `${item.instructions || words(item.category)} · ${recordedOn(item.recorded_at, timezone)}`,
        ),
      ),
    });
  if (summary.precautions.items.length)
    groups.push({
      key: "precautions",
      label: "Encounter precautions",
      icon: MasksOutlinedIcon,
      details: summary.precautions.items.map((item) =>
        detail(
          words(item.type),
          `${words(item.evidence_status)} · ${item.instructions || "Instructions not recorded"} · ${recordedOn(item.recorded_at, timezone)}`,
        ),
      ),
    });
  if (summary.current_care_conditions.items.length)
    groups.push({
      key: "conditions",
      label: "Current-care conditions",
      icon: MedicalInformationOutlinedIcon,
      details: summary.current_care_conditions.items.map((item) =>
        detail(
          item.condition,
          `${item.instruction || "Care instruction not recorded"} · ${recordedOn(item.recorded_at, timezone)}`,
        ),
      ),
    });
  const incomplete = [
    summary.allergies.state,
    summary.medications.state,
    summary.care_needs.state,
  ].includes("not_recorded");
  if (summary.review_needed === true || incomplete)
    groups.push({
      key: "review",
      label: "Review needed",
      icon: PendingActionsOutlinedIcon,
      details: reviewDetails(summary, timezone),
    });
  return groups;
}

export function usePatientCareSummaries(
  visits: readonly SummaryVisit[],
  exampleSummaries: Readonly<Record<string, PatientCareSummary>> = {},
) {
  const [states, setStates] = useState<Record<string, CareSummaryLoadState>>(
    () =>
      Object.fromEntries(
        visits.map((visit) => [
          visit.id,
          exampleSummaries[visit.id]
            ? ({
                status: "ready",
                summary: exampleSummaries[visit.id],
              } as const)
            : careSummaryPath(visit)
              ? ({ status: "loading" } as const)
              : ({ status: "unlinked" } as const),
        ]),
      ),
  );

  useEffect(() => {
    const abort = new AbortController();
    const next = Object.fromEntries(
      visits.map((visit) => [
        visit.id,
        exampleSummaries[visit.id]
          ? ({ status: "ready", summary: exampleSummaries[visit.id] } as const)
          : careSummaryPath(visit)
            ? ({ status: "loading" } as const)
            : ({ status: "unlinked" } as const),
      ]),
    );
    setStates(next);
    for (const visit of visits) {
      if (exampleSummaries[visit.id]) continue;
      const path = careSummaryPath(visit);
      if (!path) continue;
      void api<PatientCareSummary>(path, { signal: abort.signal })
        .then((summary) => {
          if (abort.signal.aborted) return;
          setStates((current) => ({
            ...current,
            [visit.id]: { status: "ready", summary },
          }));
        })
        .catch(() => {
          if (abort.signal.aborted) return;
          setStates((current) => ({
            ...current,
            [visit.id]: { status: "error" },
          }));
        });
    }
    return () => abort.abort();
  }, [exampleSummaries, visits]);

  return states;
}

export function CareSummaryTrigger({
  href,
  actionLabel,
  children,
}: {
  state: CareSummaryLoadState;
  patientLabel: string;
  timezone?: string;
  href: string;
  actionLabel: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className="tracking-chart-action" aria-label={actionLabel}>
      {children}
    </a>
  );
}

export function CareIndicators({
  state,
  patientLabel,
  timezone = "UTC",
}: {
  state: CareSummaryLoadState;
  patientLabel: string;
  timezone?: string;
}) {
  const groups = careIndicatorGroups(state, timezone);
  const [open, setOpen] = useState<{
    group: CareIndicatorGroup;
  } | null>(null);
  const openGroup = (group: CareIndicatorGroup) => {
    setOpen((current) => (current?.group.key === group.key ? null : { group }));
  };

  // A missing link or failed request is actionable context, not an empty
  // concern list. Keep ordinary, successfully loaded/no-concern cells empty.
  if (!groups.length) return null;

  const popoverId = open
    ? `care-indicator-${patientLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${open.group.key}`
    : undefined;
  const unavailable = state.status === "unlinked" || state.status === "error";
  return (
    <Box
      className="tracking-care-indicators"
      aria-label={`Care indicators for ${patientLabel}`}
      role={unavailable ? "status" : undefined}
    >
      {groups.map((group) => {
        const Icon = group.icon;
        const expanded = open?.group.key === group.key;
        const controlLabel = unavailable
          ? `${group.label} for ${patientLabel}. Show details`
          : `${group.label}: ${group.details.length}. Show details for ${patientLabel}`;
        return (
          <Tooltip key={group.key} title={controlLabel}>
            <IconButton
              size="small"
              className={`tracking-care-icon tracking-care-${group.key}${unavailable ? " tracking-care-status" : ""}`}
              aria-label={controlLabel}
              aria-haspopup="dialog"
              aria-expanded={expanded}
              aria-controls={expanded ? popoverId : undefined}
              onClick={() => openGroup(group)}
            >
              <Badge
                badgeContent={
                  group.details.length > 1 ? group.details.length : null
                }
                color="primary"
                overlap="circular"
              >
                <Icon fontSize="small" aria-hidden="true" />
              </Badge>
            </IconButton>
          </Tooltip>
        );
      })}
      <Dialog
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby={popoverId}
      >
        {open && (
          <>
            <DialogTitle id={popoverId}>
              {open.group.label}
              <Typography variant="body2" color="text.secondary">
                {patientLabel}
              </Typography>
            </DialogTitle>
            <DialogContent>
              <Box component="ul" sx={{ m: 0, pl: 2.25 }}>
                {open.group.details.map((item, index) => (
                  <Box
                    component="li"
                    key={`${item.primary}-${index}`}
                    sx={{ mb: 0.75 }}
                  >
                    <Typography variant="body2">{item.primary}</Typography>
                    {item.secondary && (
                      <Typography variant="caption" color="text.secondary">
                        {item.secondary}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOpen(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
