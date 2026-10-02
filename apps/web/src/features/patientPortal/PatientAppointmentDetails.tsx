import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { ConfirmableAppointment } from "./PatientAppointmentConfirmation";

export function PatientAppointmentDetails({
  appointment,
}: {
  appointment: ConfirmableAppointment;
}) {
  return (
    <Accordion variant="outlined" disableGutters>
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        aria-label={`Record details for appointment ${appointment.id}`}
      >
        <Typography>Appointment record details</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={0.5} sx={{ overflowWrap: "anywhere" }}>
          <Typography>Appointment reference: {appointment.id}</Typography>
          <Typography>
            Location:{" "}
            {appointment.site
              ? `${appointment.site.name} · Code ${appointment.site.code} · Reference ${appointment.site.id}`
              : "Not recorded"}
          </Typography>
          <Typography>
            Room:{" "}
            {appointment.room
              ? `${appointment.room.code} · Reference ${appointment.room.id}`
              : "Not recorded"}
          </Typography>
          <Typography>
            Visit type:{" "}
            {appointment.visit_type
              ? `${appointment.visit_type.code} · Reference ${appointment.visit_type.id}`
              : "Not recorded"}
          </Typography>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
