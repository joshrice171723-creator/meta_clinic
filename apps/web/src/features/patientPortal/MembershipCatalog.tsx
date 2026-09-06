import { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import CheckRounded from "@mui/icons-material/CheckRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import type {
  PackageTerms,
  PublishedPackage,
} from "../clinic/subscriptions/contracts";
import { subscriptionMoney } from "../clinic/subscriptions/contracts";
import { PackageCard } from "../clinic/subscriptions/PackageCard";
import { patientPortalLabel, patientPortalTerms } from "./patientPortalLabels";

export const membershipPrice = (amount: string, currency: string) =>
  subscriptionMoney(amount, currency).replace(/^USD /, "$");
export const membershipTerm = (terms: PackageTerms) =>
  `${terms.duration} ${terms.duration === 1 ? terms.duration_unit.replace(/s$/, "") : terms.duration_unit}`;

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
        patientPortalLabel(p.terms.family_name),
      ]),
    ).entries(),
  ];
  // Start with the first program offering a tier comparison; keep every program accessible.
  const activeFamily = families.some(([id]) => id === familyId)
    ? familyId
    : (catalog.find(
        (p) =>
          catalog.filter((other) => other.terms.family_id === p.terms.family_id)
            .length > 1,
      )?.terms.family_id ?? families[0]?.[0]);
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
        {families.map(([id, name]) => (
          <Tab
            key={id}
            id={`program-${id}`}
            aria-controls={`program-panel-${id}`}
            value={id}
            label={name}
          />
        ))}
      </Tabs>
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
          const t = patientPortalTerms(plan.terms);
          const included = t.components.filter((c) => c.mode === "included");
          const optional = t.components.filter((c) => c.mode === "optional");
          const groups = [
            ...new Set(
              t.components
                .filter((c) => c.mode.startsWith("choose_"))
                .map((c) => c.group),
            ),
          ];
          const adjustable = t.components.some(
            (c) =>
              c.mode !== "included" && !/^0(?:\.0+)?$/.test(c.price_adjustment),
          );
          return (
            <Box
              component="article"
              key={plan.id}
              sx={{
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 3,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  p: 3,
                  bgcolor: "#eaf0e6",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  minHeight: { md: 168 },
                }}
              >
                <Typography
                  component="h3"
                  variant="h5"
                  sx={{ fontWeight: 600 }}
                >
                  {t.package_name}
                </Typography>
                <Typography
                  sx={{
                    mt: 1.5,
                    color: "text.secondary",
                    fontSize: 15,
                    lineHeight: 1.6,
                  }}
                >
                  {t.description}
                </Typography>
              </Box>
              <Stack spacing={2.5} sx={{ p: 3, flex: 1 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    {adjustable ? "Base membership price" : "Membership price"}
                  </Typography>
                  <Typography
                    component="p"
                    sx={{
                      fontSize: 42,
                      fontWeight: 600,
                      letterSpacing: "-0.055em",
                      lineHeight: 1.35,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {membershipPrice(t.amount, t.currency)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    for a {membershipTerm(t)} term · no automatic renewal
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  endIcon={<ArrowForwardRounded />}
                  disabled={busy}
                  onClick={() => onChoose(plan)}
                >
                  {canPurchase
                    ? `Choose ${t.package_name}`
                    : `Explore ${t.package_name}`}
                </Button>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 600, mb: 2 }}>
                    What’s included
                  </Typography>
                  <Stack
                    component="ul"
                    spacing={2}
                    sx={{ listStyle: "none", p: 0, m: 0 }}
                  >
                    {included.map((c) => (
                      <Stack
                        component="li"
                        direction="row"
                        key={c.service_id}
                        spacing={1.2}
                      >
                        <CheckRounded
                          sx={{ color: "primary.main", fontSize: 20, mt: 0.25 }}
                        />
                        <Box>
                          <Typography sx={{ fontSize: 15, fontWeight: 500 }}>
                            {c.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {c.quantity} included per{" "}
                            {c.frequency === "term"
                              ? "membership term"
                              : c.frequency}
                          </Typography>
                        </Box>
                      </Stack>
                    ))}
                    {groups.map((group) => {
                      const c = t.components.find(
                        (c) =>
                          c.mode.startsWith("choose_") && c.group === group,
                      )!;
                      return (
                        <Stack
                          component="li"
                          direction="row"
                          spacing={1.2}
                          key={group}
                        >
                          <CheckRounded
                            sx={{ color: "primary.main", fontSize: 20 }}
                          />
                          <Box>
                            <Typography sx={{ fontSize: 15, fontWeight: 500 }}>
                              {group || "Personalize your services"}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Choose{" "}
                              {c.min === c.max ? c.min : `${c.min}–${c.max}`} ·
                              review options and any added cost next
                            </Typography>
                          </Box>
                        </Stack>
                      );
                    })}
                    {!included.length && !groups.length && (
                      <Typography component="li" variant="body2">
                        Build your membership from the available services.
                      </Typography>
                    )}
                  </Stack>
                  {!!optional.length && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mt: 2.5,
                        pt: 2,
                        borderTop: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      {optional.length} optional{" "}
                      {optional.length === 1 ? "add-on" : "add-ons"} available
                      to personalize your plan.
                    </Typography>
                  )}
                  {t.eligibility_review && (
                    <Chip
                      label="Clinic review before payment"
                      size="small"
                      sx={{
                        mt: 2,
                        height: "auto",
                        "& .MuiChip-label": { whiteSpace: "normal", py: 0.5 },
                      }}
                    />
                  )}
                </Box>
                <Accordion
                  disableGutters
                  elevation={0}
                  sx={{
                    "&:before": { display: "none" },
                    borderTop: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreRounded />}
                    aria-controls={`plan-details-${plan.id}`}
                    id={`plan-summary-${plan.id}`}
                    sx={{ px: 0 }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      All services & membership terms
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails
                    id={`plan-details-${plan.id}`}
                    sx={{ px: 0, "& > .MuiPaper-root": { border: 0, p: 0 } }}
                  >
                    <PackageCard terms={t} />
                  </AccordionDetails>
                </Accordion>
              </Stack>
            </Box>
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
