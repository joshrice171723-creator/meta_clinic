import { useState } from "react";
import { Box, Stack, Tab, Tabs, Typography } from "@mui/material";
import type { PublishedPackage } from "../clinic/subscriptions/contracts";
import { MembershipCard } from "../clinic/subscriptions/MembershipCard";
export {
  membershipPrice,
  membershipTerm,
} from "../clinic/subscriptions/MembershipCard";

export function MembershipCatalog({
  catalog,
  busy,
  canPurchase,
  onChoose,
}: {
  catalog: PublishedPackage[];
  busy: boolean;
  canPurchase: boolean;
  onChoose: (plan: PublishedPackage) => void;
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
  ];
  const activeFamily = families.some((program) => program.id === familyId)
    ? familyId
    : families[0]?.id;
  const program = families.find((program) => program.id === activeFamily);
  const plans = catalog.filter((p) => p.terms.family_id === activeFamily);
  if (!catalog.length)
    return (
      <Box sx={{ py: 6 }}>
        <Typography variant="h5" component="h2">
          New memberships are on their way.
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          There are no published plans available right now. Check with your
          clinic about upcoming options.
        </Typography>
      </Box>
    );
  return (
    <Box component="section" id="memberships" sx={{ scrollMarginTop: 24 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        sx={{ justifyContent: "space-between", gap: 2, mb: 3 }}
      >
        <Box>
          <Typography variant="h2">Find your fit.</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Choose a program. Compare what’s included. Make it yours.
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
          gridTemplateColumns: {
            xs: "1fr",
            md: `repeat(${Math.min(plans.length, 3)}, minmax(0, 1fr))`,
          },
          gap: 2.5,
        }}
      >
        {plans.map((plan) => {
          return (
            <MembershipCard
              key={plan.id}
              terms={plan.terms}
              busy={busy}
              canPurchase={canPurchase}
              onChoose={() => onChoose(plan)}
            />
          );
        })}
      </Box>
      <Box
        sx={{
          py: 4,
          mt: 2,
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
          gap: 3,
        }}
      >
        {[
          [
            "01",
            "Choose your starting point",
            "Compare the services and term that fit your goals.",
          ],
          [
            "02",
            "Make it personal",
            "Pick available service options and review any added cost.",
          ],
          [
            "03",
            "Review, then join",
            "See your exact price and the clinic’s terms before confirming.",
          ],
        ].map(([n, title, description]) => (
          <Stack direction="row" spacing={2} key={n}>
            <Typography
              sx={{
                fontFamily: "Georgia, serif",
                fontSize: 26,
                color: "primary.main",
              }}
            >
              {n}
            </Typography>
            <Box>
              <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                {description}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Box>
    </Box>
  );
}
