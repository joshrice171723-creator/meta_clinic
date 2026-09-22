import { Box, Stack, Typography } from "@mui/material";
import type { ComponentProps } from "react";
import {
  IntakeQuestions,
  intakeFieldVisible,
} from "../patientPortal/IntakeQuestions";

// Presentation only: the server still owns questions, visibility and requiredness.
const sections: Record<string, Array<{ title: string; fields: string[] }>> = {
  today_visit: [
    {
      title: "Visit reason & goals",
      fields: [
        "visit_reason",
        "care_reasons",
        "care_reasons_other_detail",
        "goals",
        "treatment_preferences",
      ],
    },
    { title: "Symptoms & changes", fields: ["symptoms", "changes"] },
    {
      title: "Personal expectations",
      fields: ["weight_goal_preference", "desired_weight", "goal_timeline"],
    },
  ],
  patient_coordination: [
    { title: "Care needs", fields: ["care_needs"] },
    {
      title: "Visit location",
      fields: ["telehealth_location", "telehealth_physical_location"],
    },
  ],
  safety_history: [
    { title: "Medicines & allergies", fields: ["medications", "allergies"] },
    {
      title: "Health history",
      fields: [
        "history",
        "family_history",
        "history_changes",
        "change_details",
      ],
    },
  ],
  prior_approaches: [
    { title: "Previous approaches", fields: ["prior_approaches"] },
    { title: "Procedures & barriers", fields: ["procedures", "barriers"] },
  ],
  measurements: [
    { title: "Height", fields: ["height"] },
    { title: "Weight", fields: ["weight"] },
  ],
  reproductive_product_safety: [
    {
      title: "Treatment context",
      fields: ["treatment_product_class", "product_safety_review"],
    },
    {
      title: "Reproductive context",
      fields: [
        "pregnancy_status",
        "pregnancy_plans",
        "breastfeeding_status",
        "contraception_context",
      ],
    },
  ],
  nutrition_support: [
    {
      title: "Nutrition & eating",
      fields: [
        "nutrition_pattern",
        "beverage_pattern",
        "eating_concern",
        "nutrition_support",
        "habits",
      ],
    },
    {
      title: "Sensitive support",
      fields: [
        "mental_health_support",
        "substance_use_context",
        "instrument_status",
      ],
    },
  ],
  activity_sleep_barriers: [
    {
      title: "Activity & sleep",
      fields: ["activity_capacity", "activity_pattern", "sleep_quality"],
    },
    {
      title: "Access & support",
      fields: [
        "transportation_access",
        "food_access",
        "caregiving_support",
        "social_support",
        "barrier_support_route",
      ],
    },
  ],
  records_consent_admin: [
    {
      title: "Records & coverage",
      fields: [
        "outside_records_state",
        "lab_context_state",
        "coverage_context",
        "prior_authorization_state",
      ],
    },
    {
      title: "Consent & privacy",
      fields: [
        "treatment_consent_state",
        "telehealth_consent_state",
        "privacy_location_state",
        "disclosure_state",
      ],
    },
  ],
  confirmation_clinician_review: [
    { title: "Patient confirmation", fields: ["patient_confirmation_state"] },
    {
      title: "Outstanding review",
      fields: ["unresolved_item_state", "review_owner"],
    },
  ],
  follow_up_change: [
    {
      title: "Progress & treatment",
      fields: [
        "follow_up_context",
        "change_since_last_visit",
        "treatment_response",
        "treatment_tolerability",
      ],
    },
    {
      title: "Support & next contact",
      fields: [
        "access_status",
        "support_status",
        "follow_up_plan_state",
        "next_contact_window",
        "follow_up_questions",
      ],
    },
  ],
};

export function StaffIntakeSections({
  sectionId,
  ...props
}: ComponentProps<typeof IntakeQuestions> & { sectionId: string }) {
  const definitions = props.definitions ?? props.fields;
  const visible = props.fields.filter((field) =>
    intakeFieldVisible(field, props.answers, definitions),
  );
  const groups = (sections[sectionId] ?? []).map((group) => ({
    title: group.title,
    fields: visible.filter((field) => group.fields.includes(field.id)),
  }));
  const grouped = new Set(
    groups.flatMap((group) => group.fields.map((field) => field.id)),
  );
  const remaining = visible.filter((field) => !grouped.has(field.id));
  if (remaining.length)
    groups.push({ title: "Additional details", fields: remaining });
  const populatedGroups = groups.filter((group) => group.fields.length);
  const columns = [
    populatedGroups.slice(0, 1),
    populatedGroups.slice(1),
  ].filter((column) => column.length);

  return (
    <Box
      sx={{
        containerType: "inline-size",
        "& .MuiInputLabel-root": {
          position: "static",
          transform: "none",
          maxWidth: "100%",
          whiteSpace: "normal",
          fontSize: "0.875rem",
          fontWeight: 500,
          mb: 0.75,
        },
        "& .MuiOutlinedInput-notchedOutline legend": { display: "none" },
        "& .MuiInputBase-root": { fontSize: "0.875rem" },
      }}
    >
      <Box
        sx={{
          display: "grid",
          gap: 2.5,
          alignItems: "start",
          gridTemplateColumns: "minmax(0, 1fr)",
          "@container (min-width: 640px)": {
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          },
        }}
      >
        {columns.map((column) => (
          <Stack key={column[0].title} spacing={2.5} sx={{ minWidth: 0 }}>
            {column.map((group) => (
              <Box
                key={group.title}
                component="section"
                aria-label={group.title}
                sx={{
                  pt: 2,
                  borderTop: 1,
                  borderColor: "divider",
                  minWidth: 0,
                }}
              >
                <Stack spacing={2.5}>
                  <Typography component="h4" variant="h6">
                    {group.title}
                  </Typography>
                  <IntakeQuestions
                    {...props}
                    fields={group.fields}
                    definitions={definitions}
                    layout="stack"
                  />
                </Stack>
              </Box>
            ))}
          </Stack>
        ))}
      </Box>
    </Box>
  );
}
