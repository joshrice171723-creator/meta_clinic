import { useId } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import CheckRounded from "@mui/icons-material/CheckRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import type { PackageTerms } from "./contracts";
import { subscriptionMoney } from "./contracts";
import { PackageCard } from "./PackageCard";

export const membershipPrice = (amount: string, currency: string) =>
  subscriptionMoney(amount, currency).replace(/^USD /, "$");
export const membershipTerm = (terms: PackageTerms) =>
  `${terms.duration} ${terms.duration === 1 ? terms.duration_unit.replace(/s$/, "") : terms.duration_unit}`;

/** The storefront and unsaved catalog preview intentionally share every card element. */
export function MembershipCard({
  terms: t,
  busy = false,
  canPurchase = true,
  onChoose,
  draftPreview = false,
}: {
  terms: PackageTerms;
  busy?: boolean;
  canPurchase?: boolean;
  onChoose?: () => void;
  draftPreview?: boolean;
}) {
  const cardId = useId();

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
    (c) => c.mode !== "included" && !/^0(?:\.0+)?$/.test(c.price_adjustment),
  );
  return (
    <Box
      component="article"

      sx={{
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "12px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflowWrap: "anywhere",
      }}
    >
      <Box
        sx={{
          p: 3,
          bgcolor: "action.hover",
          borderBottom: "1px solid",
          borderColor: "divider",
          minHeight: { md: 168 },
        }}
      >
        <Typography component="h3" variant="h5" sx={{ fontWeight: 600 }}>
          {t.package_name || (draftPreview ? "Membership name" : "")}
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
              fontSize: 36,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              lineHeight: 1.35,
              overflowWrap: "anywhere",
            }}
          >
            {draftPreview && !/^\d+(?:\.\d{1,2})?$/.test(t.amount)
              ? "Enter a base price"
              : membershipPrice(t.amount, t.currency)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {membershipTerm(t)} per membership term ·{" "}
            {t.renewal === "manual" ? "manual renewal" : "no renewal"}
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          fullWidth
          endIcon={<ArrowForwardRounded />}
          disabled={busy || draftPreview}
          onClick={onChoose}
        >
          {canPurchase
            ? `Choose ${t.package_name || (draftPreview ? "Membership name" : "")}`
            : `Explore ${t.package_name || (draftPreview ? "Membership name" : "")}`}
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
                  {c.description && (
                    <Typography variant="body2" color="text.secondary">
                      {c.description}
                    </Typography>
                  )}
                  {c.eligibility_review && (
                    <Typography variant="body2">
                      Clinic review required before payment
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    {c.quantity} included per{" "}
                    {c.frequency === "term" ? "membership term" : c.frequency}
                  </Typography>
                </Box>
              </Stack>
            ))}
            {groups.map((group) => {
              const c = t.components.find(
                (c) => c.mode.startsWith("choose_") && c.group === group,
              )!;
              return (
                <Stack component="li" direction="row" spacing={1.2} key={group}>
                  <CheckRounded sx={{ color: "primary.main", fontSize: 20 }} />
                  <Box>
                    <Typography sx={{ fontSize: 15, fontWeight: 500 }}>
                      {group || "Personalize your services"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Choose {c.min === c.max ? c.min : `${c.min}–${c.max}`} ·
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
              {optional.length === 1 ? "add-on" : "add-ons"} available to
              personalize your plan.
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
            aria-controls={`plan-details-${cardId}`}
            id={`plan-summary-${cardId}`}
            sx={{ px: 0 }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              All services & membership terms
            </Typography>
          </AccordionSummary>
          <AccordionDetails
            id={`plan-details-${cardId}`}
            sx={{ px: 0, "& > .MuiPaper-root": { border: 0, p: 0 } }}
          >
            <PackageCard terms={t} />
          </AccordionDetails>
        </Accordion>
      </Stack>
    </Box>
  );
}
