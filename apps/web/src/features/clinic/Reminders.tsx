import { useResource, Form, Field } from "../../shared/ui";
import type { PatientReminder } from "../../api/contracts";
import { Alert, Box, Chip, Paper, Stack, Typography } from "@mui/material";

type ReminderResponse = { reminders: PatientReminder[] };

export function Reminders() {
  const resource = useResource<ReminderResponse>("/api/clinic/reminders?per_page=50");
  const reminders = resource.data?.reminders || [];
  return (
    <Box sx={{ maxWidth: 1160, mx: "auto" }}>
      <Stack direction={{ xs: "column", sm: "row" }} sx={{ mb: 3, gap: 2, justifyContent: { xs: "flex-start", sm: "space-between" } }}>
        <Box>
          <Typography variant="overline" color="text.secondary">Operational communication</Typography>
          <Typography component="h1" variant="h3" sx={{ fontWeight: 700 }}>Patient reminders</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>Policy-gated, synthetic delivery only. Reminder bodies never appear in operational diagnostics.</Typography>
        </Box>
        <Paper elevation={0} sx={{ p: 2, border: "1px solid #d6e1dd", minWidth: 230 }}>
          <Typography variant="body2" color="text.secondary">Queue health</Typography>
          <Typography variant="h6">{reminders.filter((r) => ["scheduled", "queued"].includes(r.status)).length} awaiting dispatch</Typography>
          <Typography variant="caption" color="text.secondary">External providers are gated in this build.</Typography>
        </Paper>
      </Stack>
      {resource.error && <Alert severity="error">{resource.error}</Alert>}
      <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, border: "1px solid #d6e1dd", borderRadius: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Reminder worklist</Typography>
        {reminders.length === 0 && <Typography color="text.secondary">No reminders are scheduled.</Typography>}
        <Stack spacing={1.5}>
          {reminders.map((reminder) => (
            <Box key={reminder.id} sx={{ borderTop: "1px solid #e7eeeb", pt: 1.5 }}>
              <Stack direction={{ xs: "column", sm: "row" }} sx={{ gap: 1, justifyContent: { xs: "flex-start", sm: "space-between" } }}>
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>Reminder #{reminder.id} · {reminder.category.replaceAll("_", " ")}</Typography>
                  <Typography variant="body2" color="text.secondary">{reminder.local_schedule_label} · {reminder.endpoint.masked_value} · patient #{reminder.patient_id}</Typography>
                </Box>
                <Chip size="small" label={reminder.status.replaceAll("_", " ")} color={reminder.status === "delivered" ? "success" : reminder.status === "failed" ? "error" : "default"} />
              </Stack>
              {reminder.status === "failed" && <Form endpoint={`/api/clinic/reminders/${reminder.id}/retry`} submit="Retry with policy check" retryKey className="pharmacy-form-grid" onSuccess={resource.refresh} />}
            </Box>
          ))}
        </Stack>
      </Paper>
      <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, mt: 3, border: "1px solid #d6e1dd", borderRadius: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Schedule an appointment reminder</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>The server selects only a verified endpoint and generates minimum-content copy from the approved category template.</Typography>
        <Form endpoint="/api/clinic/reminders" submit="Schedule reminder" retryKey retryKeyField="reminder[request_key]" onSuccess={resource.refresh}>
          <Field name="reminder[patient_id]" label="Patient ID" type="number" min={1} />
          <Field name="reminder[appointment_id]" label="Appointment ID" type="number" min={1} />
          <Field name="reminder[category]" label="Purpose" options={[["appointment", "Appointment"], ["preparation", "Preparation"], ["follow_up", "Follow-up"]]} />
          <Field name="reminder[channel]" label="Channel" options={[["portal", "Private portal"]]} />
          <Field name="reminder[scheduled_at]" label="Scheduled time" type="datetime-local" />
        </Form>
      </Paper>
    </Box>
  );
}
