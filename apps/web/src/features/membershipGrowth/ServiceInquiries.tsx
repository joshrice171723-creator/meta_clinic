import { useState } from "react";
import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";

type ServiceInquiry = {
  id: number;
  service_name: string;
  status: "new" | "contacted" | "closed";
  lock_version: number;
  display_name: string;
  email_address: string | null;
  phone_number: string | null;
  created_at: string;
};

export function ServiceInquiries() {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const resource = useResource<{
    inquiries: ServiceInquiry[];
    capped: boolean;
  }>("/api/clinic/service_inquiries");

  const advance = async (inquiry: ServiceInquiry) => {
    setBusyId(inquiry.id);
    setError("");
    try {
      await api(`/api/clinic/service_inquiries/${inquiry.id}`, {
        method: "PATCH",
        body: {
          inquiry: {
            status: inquiry.status === "new" ? "contacted" : "closed",
            lock_version: inquiry.lock_version,
          },
        },
      });
      resource.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to update inquiry.",
      );
      resource.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Paper component="section" variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        <Box>
          <Typography component="h2" variant="h5">
            Service inquiries
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            People who asked about a published clinic service. Contact them
            using their chosen details; an inquiry is not an appointment or
            patient record.
          </Typography>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        {!resource.data && (
          <LoadState error={resource.error} onRetry={resource.refresh} />
        )}
        {resource.data && (
          <>
            {resource.data.inquiries.length === 0 && (
              <Typography>No service inquiries yet.</Typography>
            )}
            {resource.data.inquiries.map((inquiry) => (
              <Box
                key={inquiry.id}
                sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}
              >
                <Typography sx={{ fontWeight: 600 }}>
                  {inquiry.display_name} · {inquiry.service_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {[inquiry.email_address, inquiry.phone_number]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  · {inquiry.status} ·{" "}
                  {new Date(inquiry.created_at).toLocaleString()}
                </Typography>
                {inquiry.status !== "closed" && (
                  <Button
                    size="small"
                    disabled={busyId === inquiry.id}
                    onClick={() => void advance(inquiry)}
                  >
                    {inquiry.status === "new"
                      ? "Mark contacted"
                      : "Close inquiry"}
                  </Button>
                )}
              </Box>
            ))}
            {resource.data.capped && (
              <Typography variant="caption">
                Showing the latest 100 inquiries.
              </Typography>
            )}
            <Button
              size="small"
              onClick={resource.refresh}
              sx={{ alignSelf: "flex-start" }}
            >
              Refresh inquiries
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}
