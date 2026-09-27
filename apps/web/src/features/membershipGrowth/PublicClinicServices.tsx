import { useEffect } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  ThemeProvider,
  Typography,
} from "@mui/material";
import { LoadState, useResource } from "../../shared/ui";
import { membershipTheme } from "../clinic/subscriptions/membershipTheme";

type ClinicServicesResponse = {
  practice: { name: string; slug: string };
  membership_path: string | null;
  services: Array<{
    name: string;
    description: string | null;
    duration_minutes: number | null;
    modality: "in_person" | "video" | "either";
  }>;
};

export function PublicClinicServices({ slug }: { slug: string }) {
  const resource = useResource<ClinicServicesResponse>(
    `/api/public/clinic_services/${encodeURIComponent(slug)}`,
  );

  useEffect(() => {
    if (!resource.data) return;
    const previousTitle = document.title;
    document.title = `${resource.data.practice.name} services`;
    return () => {
      document.title = previousTitle;
    };
  }, [resource.data]);

  return (
    <ThemeProvider theme={membershipTheme}>
      <Box
        component="main"
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
            <Typography component="h1" variant="h2">
              {resource.data.practice.name}
            </Typography>
            <Typography component="h2" variant="h4">
              Services
            </Typography>
            {resource.data.services.length === 0 ? (
              <Typography color="text.secondary">
                No services are currently listed. Contact the clinic for its
                current offerings.
              </Typography>
            ) : (
              <Box
                component="section"
                aria-label="Clinic services"
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                  },
                }}
              >
                {resource.data.services.map((service, index) => (
                  <Card key={`${service.name}-${index}`} variant="outlined">
                    <CardContent>
                      <Typography component="h3" variant="h6">
                        {service.name}
                      </Typography>
                      {service.description && (
                        <Typography color="text.secondary" sx={{ mt: 1 }}>
                          {service.description}
                        </Typography>
                      )}
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 1.5 }}
                      >
                        {service.modality === "either"
                          ? "In person or video"
                          : service.modality === "video"
                            ? "Video visit"
                            : "In-person visit"}
                        {service.duration_minutes
                          ? ` · ${service.duration_minutes} minutes`
                          : ""}
                      </Typography>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}
            {resource.data.membership_path && (
              <Button
                href={resource.data.membership_path}
                sx={{ alignSelf: "flex-start" }}
              >
                View membership options
              </Button>
            )}
          </Stack>
        )}
      </Box>
    </ThemeProvider>
  );
}
