import {
  Alert,
  Box,
  Button,
  Divider,
  Drawer,
  Stack,
  Typography,
} from "@mui/material";
import { useTelehealthVisit } from "./useTelehealthVisit";

function value(value: string | null | undefined) {
  return value?.trim() || "Not available";
}

export function VisitPreparationDrawer({
  visitId,
  open,
  onClose,
}: {
  visitId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const resource = useTelehealthVisit("staff", open ? visitId : null);
  const visit = resource.response?.data;
  const canReadPreparation = resource.response?.allowed_actions.includes(
    "telehealth.view_preparation",
  );
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: "100%", sm: 440 }, p: 2 } } }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="h5">Visit preparation</Typography>
          <Typography variant="body2" color="text.secondary">
            Administrative preparation for this video visit.
          </Typography>
        </Box>
        {resource.refreshing && !visit && (
          <Typography role="status">Loading visit preparation…</Typography>
        )}
        {resource.error && (
          <Alert
            severity="error"
            action={
              <Button onClick={() => void resource.refresh()}>Try again</Button>
            }
          >
            {resource.error}
          </Alert>
        )}
        {visit && (
          <>
            <Divider />
            <div>
              <Typography variant="subtitle2">Patient</Typography>
              <Typography>{visit.appointment.patient.display_name}</Typography>
            </div>
            <div>
              <Typography variant="subtitle2">Readiness</Typography>
              <Typography>
                {visit.preparation.complete
                  ? "Preparation complete"
                  : "Preparation needed"}
              </Typography>
              {visit.preparation.reasons.length > 0 && (
                <Box component="ul" sx={{ my: 0.5, pl: 2.5 }}>
                  {visit.preparation.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </Box>
              )}
            </div>
            <div>
              <Typography variant="subtitle2">Device check</Typography>
              <Typography variant="body2">
                {visit.preparation.device_results
                  ? `Camera ${visit.preparation.device_results.camera.replaceAll("_", " ")}; microphone ${visit.preparation.device_results.microphone.replaceAll("_", " ")}; speaker ${visit.preparation.device_results.speaker.replaceAll("_", " ")}.`
                  : "No device result is recorded."}
              </Typography>
            </div>
            {canReadPreparation ? (
              <>
                <div>
                  <Typography variant="subtitle2">
                    Patient-reported callback
                  </Typography>
                  <Typography>
                    {value(visit.preparation.callback_phone)}
                  </Typography>
                </div>
                <div>
                  <Typography variant="subtitle2">
                    Patient-reported location
                  </Typography>
                  <Typography>
                    {visit.preparation.location
                      ? [
                          visit.preparation.location.address_line1,
                          visit.preparation.location.unit,
                          visit.preparation.location.city,
                          visit.preparation.location.region_code,
                          visit.preparation.location.postal_code,
                          visit.preparation.location.country_code,
                        ]
                          .filter(Boolean)
                          .join(", ")
                      : "Not available"}
                  </Typography>
                </div>
              </>
            ) : (
              <Alert severity="info">
                Location and callback details are restricted for this role.
              </Alert>
            )}
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: "wrap" }}
            >
              <Button
                variant="contained"
                href={`/clinic/telehealth/${visit.public_id}`}
              >
                Review visit
              </Button>
              <Button
                href={`/clinic/schedule?appointment_id=${visit.appointment.id}`}
              >
                Open appointment
              </Button>
              <Button
                href={`/clinic/reminders?telehealth_visit_id=${visit.public_id}`}
              >
                Send visit reminder
              </Button>
              <Button
                href={`/clinic/messages?telehealth_visit_id=${visit.public_id}`}
              >
                Request clinician assistance
              </Button>
            </Stack>
          </>
        )}
        <Button onClick={onClose}>Close</Button>
      </Stack>
    </Drawer>
  );
}
