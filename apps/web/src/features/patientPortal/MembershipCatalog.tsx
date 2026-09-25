import { useState } from "react";
import { Box, Stack, Tab, Tabs, Typography } from "@mui/material";
import type { PublishedPackage } from "../clinic/subscriptions/contracts";
import { MembershipCard } from "../clinic/subscriptions/MembershipCard";
import { patientPortalLabel } from "./patientPortalLabels";

function patientFacingTerms(terms: PublishedPackage["terms"]) {
  return {
    ...terms,
    family_name: patientPortalLabel(terms.family_name) || "Membership",
    package_name: patientPortalLabel(terms.package_name) || "Selected plan",
    tier: patientPortalLabel(terms.tier),
    description: patientPortalLabel(terms.description),
    terms: patientPortalLabel(terms.terms),
    components: terms.components.map((component) => ({
      ...component,
      name: patientPortalLabel(component.name) || "Included service",
      description: patientPortalLabel(component.description),
      group: patientPortalLabel(component.group),
    })),
  };
}
export {
  membershipPrice,
  membershipTerm,
} from "../clinic/subscriptions/MembershipCard";

export function MembershipCatalog({
  catalog,
  busy,
  canPurchase,
  onChoose,
  actionLabel,
  onContact,
}: {
  catalog: PublishedPackage[];
  busy: boolean;
  canPurchase: boolean;
  onChoose: (plan: PublishedPackage) => void;
  actionLabel?: string;
  onContact?: (plan: PublishedPackage) => void;
}) {
  const [familyId, setFamilyId] = useState<number | null>(null);
  const families = [
    ...new Map(
      catalog.map((p) => [
        p.terms.family_id,
        p.program || {
          id: p.terms.family_id,
          name: p.terms.family_name,
          description: "",
          display_order: 0,
        },
      ]),
    ).values(),
  ].map((program) => ({
    ...program,
    name: patientPortalLabel(program.name) || "Membership program",
    description: patientPortalLabel(program.description),
  }));
  const activeFamily = families.some((program) => program.id === familyId)
    ? familyId
    : families[0]?.id;
  const program = families.find((program) => program.id === activeFamily);
  const plans = catalog.filter((p) => p.terms.family_id === activeFamily);
  if (!catalog.length)
    return (
      <Box
        component="section"
        id="memberships"
        sx={{ mt: 3, pt: 4, borderTop: "1px solid", borderColor: "divider" }}
      >
        <Typography variant="h5" component="h3">
          Available memberships
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Your clinic has not published a membership that is available to join
          at this time.
        </Typography>
      </Box>
    );
  return (
    <Box
      component="section"
      id="memberships"
      sx={{
        mt: 3,
        pt: 4,
        borderTop: "1px solid",
        borderColor: "divider",
        scrollMarginTop: 24,
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        sx={{ justifyContent: "space-between", gap: 2, mb: 3 }}
      >
        <Box>
          <Typography variant="h5" component="h3">
            Available memberships
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Compare the plans and services your clinic currently offers.
          </Typography>
        </Box>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ alignSelf: { md: "flex-end" } }}
        >
          Your selections and exact total are reviewed before you commit.
        </Typography>
      </Stack>
      <Tabs
        value={activeFamily}
        onChange={(_, value: number) => setFamilyId(value)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label="Membership programs"
        sx={{
          mb: 3,
          borderBottom: "1px solid",
          borderColor: "divider",
          "& .MuiTab-root": { px: 2.5, minHeight: 56, fontSize: 15 },
        }}
      >
        {families.map(({ id, name }) => (
          <Tab
            key={id}
            id={`program-${id}`}
            aria-controls={`program-panel-${id}`}
            value={id}
            label={name}
          />
        ))}
      </Tabs>
      {program?.description && (
        <Typography
          color="text.secondary"
          sx={{ mb: 3, whiteSpace: "pre-wrap" }}
        >
          {program.description}
        </Typography>
      )}
      <Box
        role="tabpanel"
        id={`program-panel-${activeFamily}`}
        aria-labelledby={`program-${activeFamily}`}
        sx={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
          gap: 2.5,
        }}
      >
        {plans.map((plan) => {
          const terms = patientFacingTerms(plan.terms);
          return (
            <MembershipCard
              key={plan.id}
              terms={terms}
              busy={busy}
              canPurchase={canPurchase}
              onChoose={() => onChoose(plan)}
              actionLabel={actionLabel}
              onContact={onContact ? () => onContact(plan) : undefined}
            />
          );
        })}
      </Box>
    </Box>
  );
}
