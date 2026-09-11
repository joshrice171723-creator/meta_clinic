import {
  Box,
  Button,
  Chip,
  Stack,
  ThemeProvider,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useResource, LoadState } from "../../../shared/ui";
import { MembershipCatalog } from "../../patientPortal/MembershipCatalog";
import { membershipTheme } from "./membershipTheme";
import type { PublishedPackage } from "./contracts";

type StorefrontPreview = {
  practice_name: string;
  catalog: PublishedPackage[];
};

export function PatientStorefrontPreview() {
  const resource = useResource<StorefrontPreview>(
    "/api/clinic/subscription_catalog/storefront_preview",
  );

  return (
    <ThemeProvider theme={membershipTheme}>
      <Box
        component="main"
        aria-label="Patient storefront preview"
        sx={{
          minHeight: "100%",
          bgcolor: "background.default",
          color: "text.primary",
          p: { xs: 2, md: 4 },
        }}
      >
        {!resource.data && <LoadState error={resource.error} />}
        {resource.data && (
          <Stack spacing={3} sx={{ maxWidth: 1200, mx: "auto" }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              sx={{
                justifyContent: "space-between",
                gap: 2,
                alignItems: { sm: "center" },
              }}
            >
              <Button
                href="/clinic/subscriptions"
                startIcon={<ArrowBackIcon />}
                sx={{ alignSelf: "flex-start" }}
              >
                Back to catalog
              </Button>
              <Chip label="Staff preview · published plans only" size="small" />
            </Stack>
            <Stack
              direction="row"
              sx={{ justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}
            >
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 20 }}>
                  {resource.data.practice_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Your membership. Your wellbeing.
                </Typography>
              </Box>
              <Stack
                component="nav"
                aria-label="Patient portal preview"
                direction="row"
                sx={{ gap: { xs: 0.5, sm: 2 }, flexWrap: "wrap" }}
              >
                <Button href="#memberships">Explore plans</Button>
                <Button disabled>My memberships</Button>
                <Button disabled>Billing</Button>
              </Stack>
            </Stack>
            <Box
              component="section"
              sx={{
                bgcolor: "#203f34",
                color: "#f6f7ed",
                borderRadius: 3,
                px: { xs: 3, md: 6 },
                py: { xs: 4, md: 5.5 },
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1.25fr 0.75fr" },
                alignItems: "center",
                gap: 4,
              }}
            >
              <Typography
                component="h1"
                sx={{
                  fontFamily: "Georgia, serif",
                  fontSize: { xs: 42, sm: 56, md: 64 },
                  lineHeight: 1.05,
                  letterSpacing: "-0.045em",
                  maxWidth: 600,
                }}
              >
                A little more care.
                <br />
                <Box component="span" sx={{ color: "#d9e6b8" }}>
                  A lot more you.
                </Box>
              </Typography>
              <Box>
                <Typography
                  sx={{
                    color: "#e0e8de",
                    fontSize: 18,
                    lineHeight: 1.65,
                    maxWidth: 380,
                  }}
                >
                  Make room for your wellbeing with a membership built around
                  the services that matter to you.
                </Typography>
                <Button
                  href="#memberships"
                  variant="contained"
                  size="large"
                  sx={{
                    mt: 3,
                    bgcolor: "#d9e6b8",
                    color: "#203f34",
                    "&:hover": { bgcolor: "#e7efd1" },
                  }}
                >
                  Find my membership
                </Button>
                <Typography variant="body2" sx={{ mt: 1.5, color: "#e0e8de" }}>
                  Clear inclusions. Your choice of plan.
                </Typography>
              </Box>
            </Box>
            <MembershipCatalog
              catalog={resource.data.catalog}
              busy={false}
              canPurchase={false}
              onChoose={() => {}}
            />
          </Stack>
        )}
      </Box>
    </ThemeProvider>
  );
}
