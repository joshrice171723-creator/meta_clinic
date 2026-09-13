import { useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Stack,
  ThemeProvider,
  Typography,
} from "@mui/material";
import { LoadState, useResource } from "../../shared/ui";
import { membershipTheme } from "../clinic/subscriptions/membershipTheme";
import type { PublicMembershipDirectoryResponse } from "./types";

export function PublicMembershipDirectory() {
  const resource = useResource<PublicMembershipDirectoryResponse>(
    "/api/public/membership_storefronts",
  );

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Find a clinic membership page";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <ThemeProvider theme={membershipTheme}>
      <Box
        component="main"
        aria-label="Find a clinic membership page"
        sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          color: "text.primary",
          px: { xs: 2, sm: 3, md: 5 },
          py: { xs: 3, md: 5 },
        }}
      >
        {!resource.data && <LoadState error={resource.error} />}
        {resource.data && (
          <Stack spacing={3} sx={{ maxWidth: 960, mx: "auto" }}>
            <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
              <Button href="/login" variant="text">
                I already have an account
              </Button>
              <Typography component="h1" variant="h2">
                Find your clinic
              </Typography>
              <Typography color="text.secondary" sx={{ maxWidth: 640 }}>
                Explore clinic membership options without an account. Choose a
                clinic to see its membership plans and decide whether to
                purchase or ask the clinic to contact you first.
              </Typography>
            </Stack>

            {resource.data.storefronts.length === 0 ? (
              <Card variant="outlined">
                <CardContent>
                  <Typography component="h2" variant="h6">
                    No public membership pages are available yet.
                  </Typography>
                  <Typography color="text.secondary" sx={{ mt: 1 }}>
                    Ask your clinic for its membership link, or contact the
                    clinic directly for help getting started.
                  </Typography>
                </CardContent>
              </Card>
            ) : (
              <Box
                component="section"
                aria-label="Clinics offering memberships"
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                  },
                }}
              >
                {resource.data.storefronts.map((storefront) => (
                  <Card
                    key={storefront.slug}
                    sx={{ display: "flex", flexDirection: "column" }}
                    variant="outlined"
                  >
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Typography component="h2" variant="h6">
                        {storefront.name}
                      </Typography>
                      <Typography color="text.secondary" sx={{ mt: 1 }}>
                        View this clinic&apos;s membership options.
                      </Typography>
                    </CardContent>
                    <CardActions sx={{ px: 2, pb: 2 }}>
                      <Button href={storefront.public_path} variant="contained">
                        View memberships
                      </Button>
                    </CardActions>
                  </Card>
                ))}
              </Box>
            )}
          </Stack>
        )}
      </Box>
    </ThemeProvider>
  );
}
