import { Stack, Typography } from "@mui/material";
import {
  formatDisplayDate,
  formatDisplayDateTime,
} from "../../shared/dateTime";
import type { WorkforceRequest } from "./scheduleTypes";

const requestLabels = {
  availability_version: "Availability change",
  time_off_request: "Time off",
  shift_swap_request: "Shift swap",
};
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function WorkforceRequestDetails({
  request,
}: {
  request: WorkforceRequest;
}) {
  return (
    <Stack spacing={0.75}>
      <Typography variant="h3">
        {request.employee_name || "Employee name unavailable"} ·{" "}
        {requestLabels[request.type]}
      </Typography>
      <Typography color="text.secondary">
        {request.site_name || "Location name unavailable"}
        {request.timezone ? ` · ${request.timezone}` : ""}
      </Typography>
      {request.type === "availability_version" ? (
        <>
          <Typography>
            Effective {formatDisplayDate(request.effective_from)}
            {request.effective_until
              ? ` through ${formatDisplayDate(request.effective_until)}`
              : " · no end date"}
          </Typography>
          {(request.weekly_rules ?? []).map((rule, index) => (
            <Typography variant="body2" key={`${rule.day_of_week}:${index}`}>
              {days[rule.day_of_week]}:{" "}
              {rule.available === false
                ? "Unavailable"
                : `${rule.start_time}–${rule.end_time}${rule.end_time <= rule.start_time ? " (next day)" : ""}`}
            </Typography>
          ))}
        </>
      ) : (
        <Typography>
          {request.starts_at && request.ends_at && request.timezone
            ? `${formatDisplayDateTime(request.starts_at, { timeZone: request.timezone })} – ${formatDisplayDateTime(request.ends_at, { timeZone: request.timezone })}`
            : "Requested time is unavailable."}
        </Typography>
      )}
      {request.type === "shift_swap_request" && (
        <>
          <Typography>
            Requested replacement:{" "}
            {request.target_employee_name || "Employee name unavailable"}
          </Typography>
          {request.role_name && (
            <Typography>Shift role: {request.role_name}</Typography>
          )}
          {request.target_reason && (
            <Typography>Employee response: {request.target_reason}</Typography>
          )}
        </>
      )}
      <Typography>Reason: {request.reason}</Typography>
      {request.decision_reason && (
        <Typography>Review reason: {request.decision_reason}</Typography>
      )}
    </Stack>
  );
}
