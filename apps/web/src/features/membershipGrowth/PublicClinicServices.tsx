import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  ThemeProvider,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { publicPageTheme } from "./publicPageTheme";

type ClinicServicesResponse = {
  practice: {
    name: string;
    slug: string;
    headline: string | null;
    intro: string | null;
    accent: string | null;
    logo_path: string | null;
  };
  membership_path: string | null;
  services: Array<{
    id: number;
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
  const [serviceId, setServiceId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [outreachConsent, setOutreachConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [received, setReceived] = useState(false);
  const requestKey = useRef<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    requestKey.current ||= crypto.randomUUID();
    try {
      await api(
        `/api/public/clinic_services/${encodeURIComponent(slug)}/inquiries`,
        {
          method: "POST",
          body: {
            inquiry: {
              service_offering_id: Number(serviceId),
              display_name: displayName,
              email_address: emailAddress,
              phone_number: phoneNumber,
              outreach_consent: outreachConsent,
              request_key: requestKey.current,
            },
          },
        },
      );
      setReceived(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The request could not be confirmed. Try again without changing your details.",
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!resource.data) return;
    const previousTitle = document.title;
    document.title = `${resource.data.practice.name} services`;
    return () => {
      document.title = previousTitle;
    };
  }, [resource.data]);

  return (
    <ThemeProvider theme={publicPageTheme(resource.data?.practice.accent)}>
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
            {resource.data.practice.logo_path && (
              <Box
                component="img"
                src={resource.data.practice.logo_path}
                alt={`${resource.data.practice.name} logo`}
                sx={{
                  maxWidth: 240,
                  maxHeight: 96,
                  objectFit: "contain",
                  alignSelf: "flex-start",
                }}
              />
            )}
            <Typography component="h1" variant="h2">
              {resource.data.practice.name}
            </Typography>
            <Typography component="h2" variant="h4">
              Services
            </Typography>
            {resource.data.practice.headline && (
              <Typography variant="h5">
                {resource.data.practice.headline}
              </Typography>
            )}
            {resource.data.practice.intro && (
              <Typography color="text.secondary">
                {resource.data.practice.intro}
              </Typography>
            )}
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
            {resource.data.services.length > 0 && (
              <Card
                component="section"
                variant="outlined"
                sx={{ maxWidth: 640 }}
              >
                <CardContent>
                  <Typography component="h2" variant="h5" gutterBottom>
                    Ask about a service
                  </Typography>
                  {received ? (
                    <Alert severity="success">
                      Your request was received. The clinic can contact you
                      using the details you provided.
                    </Alert>
                  ) : (
                    <Stack
                      component="form"
                      spacing={2}
                      onSubmit={(event) => void submit(event)}
                    >
                      <TextField
                        select
                        required
                        label="Service"
                        value={serviceId}
                        onChange={(event) => setServiceId(event.target.value)}
                      >
                        {resource.data.services.map((service) => (
                          <MenuItem key={service.id} value={service.id}>
                            {service.name}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        required
                        label="Your name"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        slotProps={{ htmlInput: { maxLength: 120 } }}
                      />
                      <TextField
                        type="email"
                        label="Email address"
                        value={emailAddress}
                        onChange={(event) =>
                          setEmailAddress(event.target.value)
                        }
                        slotProps={{ htmlInput: { maxLength: 320 } }}
                      />
                      <TextField
                        type="tel"
                        label="Phone number"
                        value={phoneNumber}
                        onChange={(event) => setPhoneNumber(event.target.value)}
                        slotProps={{ htmlInput: { maxLength: 40 } }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        Provide an email address or phone number so the clinic
                        can reply.
                      </Typography>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={outreachConsent}
                            onChange={(_, checked) =>
                              setOutreachConsent(checked)
                            }
                            required
                          />
                        }
                        label={`I agree that ${resource.data.practice.name} may contact me about this service request.`}
                      />
                      {error && (
                        <Alert severity="error">
                          {error} If the result is uncertain, submit again
                          without changing your details.
                        </Alert>
                      )}
                      <Button
                        type="submit"
                        variant="contained"
                        disabled={
                          busy ||
                          !serviceId ||
                          !displayName.trim() ||
                          (!emailAddress.trim() && !phoneNumber.trim()) ||
                          !outreachConsent
                        }
                        sx={{ alignSelf: "flex-start" }}
                      >
                        {busy ? "Sending…" : "Ask the clinic"}
                      </Button>
                    </Stack>
                  )}
                </CardContent>
              </Card>
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
