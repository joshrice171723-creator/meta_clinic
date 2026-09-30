import type { Appointment } from "../../api/contracts";
import { useState } from "react";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { useResource } from "../../shared/ui";

type SchedulingResource = {
  id: number;
  name: string;
  available: boolean;
  room_id: number | null;
};

export type SchedulingResourceAvailabilityData = {
  site_id: number;
  service_offering_id: number;
  revision: number;
  mode: "unconfigured" | "not_required" | "required";
  compatible: boolean;
  reason: string | null;
  chairs: SchedulingResource[];
  equipment: SchedulingResource[];
  selected_resource_ids: number[];
};

type AvailabilityContext = {
  siteId: string;
  serviceOfferingId: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  appointmentId?: number;
  enabled?: boolean;
};

function positiveId(value: string) {
  const id = /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function localDate(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/.exec(value);
  if (!parts) return undefined;
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== Number(parts[1]) ||
    date.getMonth() + 1 !== Number(parts[2]) ||
    date.getDate() !== Number(parts[3]) ||
    date.getHours() !== Number(parts[4]) ||
    date.getMinutes() !== Number(parts[5]) ||
    date.getSeconds() !== Number(parts[6] ?? 0)
  ) return undefined;
  return date;
}

function validResources(resources: SchedulingResource[]) {
  return Array.isArray(resources) && resources.every((resource) =>
    resource && Number.isSafeInteger(resource.id) && resource.id > 0 &&
    typeof resource.name === "string" && typeof resource.available === "boolean" &&
    (resource.room_id === null ||
      (Number.isSafeInteger(resource.room_id) && resource.room_id > 0)),
  );
}

export function useSchedulingResourceAvailability({
  siteId,
  serviceOfferingId,
  roomId,
  startsAt,
  endsAt,
  appointmentId,
  enabled = true,
}: AvailabilityContext) {
  const site = positiveId(siteId);
  const offering = positiveId(serviceOfferingId);
  const room = roomId ? positiveId(roomId) : undefined;
  const start = localDate(startsAt);
  const end = localDate(endsAt);
  let inputIssue = "";
  if (!enabled) inputIssue = "Resource availability review is required before booking.";
  else if (!site || !offering) inputIssue = "Choose a site and service offering to review resource availability.";
  else if (roomId && !room) inputIssue = "Choose a valid room to review resource availability.";
  else if (appointmentId !== undefined && (!Number.isSafeInteger(appointmentId) || appointmentId <= 0)) {
    inputIssue = "A valid appointment is required to review resource availability.";
  } else if (!start || !end || end.getTime() <= start.getTime()) {
    inputIssue = "Choose valid start and end times, with the end after the start, to review resource availability.";
  }

  const canRefresh = Boolean(serviceOfferingId && !inputIssue);
  const query = new URLSearchParams();
  if (canRefresh && start && end) {
    query.set("starts_at", start.toISOString());
    query.set("ends_at", end.toISOString());
    if (room) query.set("room_id", String(room));
    if (appointmentId !== undefined) query.set("appointment_id", String(appointmentId));
  }
  const path = canRefresh
    ? `/api/clinic/facilities/${site}/resource_compatibility/services/${offering}/availability?${query}`
    : "";
  const resource = useResource<SchedulingResourceAvailabilityData>(path, {
    enabled: canRefresh,
  });
  const [invalidatedData, invalidateData] = useState<SchedulingResourceAvailabilityData>();
  const candidate = canRefresh && resource.data !== invalidatedData ? resource.data : undefined;
  const owned = candidate && candidate.site_id === site &&
    candidate.service_offering_id === offering &&
    Number.isSafeInteger(candidate.revision) && candidate.revision >= 0 &&
    ["unconfigured", "not_required", "required"].includes(candidate.mode) &&
    typeof candidate.compatible === "boolean" &&
    (candidate.reason === null || typeof candidate.reason === "string") &&
    validResources(candidate.chairs) && validResources(candidate.equipment) &&
    Array.isArray(candidate.selected_resource_ids) &&
    candidate.selected_resource_ids.every((id) => Number.isSafeInteger(id) && id > 0);
  const data = owned ? candidate : undefined;
  let issue = inputIssue || resource.error || "Resource availability review is loading.";
  if (candidate && !owned) issue = "Resource availability did not match this booking. Refresh to review again.";
  else if (data?.mode === "unconfigured") issue = data.reason || "Resource requirements are unconfigured. Configuration review is required before booking.";
  else if (data) issue = data.compatible ? "" : data.reason || "Required resources are unavailable for this booking.";
  if (!serviceOfferingId) issue = "";

  return {
    ...resource,
    data,
    issue,
    canRefresh,
    offeringSelected: Boolean(serviceOfferingId),
    refresh: () => {
      if (!canRefresh) return;
      invalidateData(resource.data);
      resource.refresh();
    },
  };
}

export function SchedulingResourceAvailability({
  resource,
}: {
  resource: ReturnType<typeof useSchedulingResourceAvailability>;
}) {
  if (!resource.offeringSelected) return null;
  const { data, issue } = resource;
  return (
    <Stack spacing={1.5}>
      <Typography component="h3" variant="subtitle1">
        Service resource availability
      </Typography>
      <Alert severity={issue ? "warning" : "info"} role="status">
        {issue || (data?.mode === "not_required"
          ? "This service has no configured chair or equipment requirements."
          : "Required resources are available for the selected time and room.")}
      </Alert>
      {data && (
        <>
          <Typography variant="body2" color="text.secondary">
            Resource requirements revision {data.revision}
          </Typography>
          {data.mode === "required" && (
            <>
              <Stack spacing={0.5}>
                <Typography variant="subtitle2">Compatible chair alternatives</Typography>
                {data.chairs.length === 0 && <Typography variant="body2">No compatible chairs returned.</Typography>}
                {data.chairs.map((chair) => (
                  <Typography key={chair.id} variant="body2">
                    {chair.name} · {chair.available ? "Available" : "Unavailable"}
                    {chair.room_id !== null ? ` · Room #${chair.room_id}` : ""}
                  </Typography>
                ))}
              </Stack>
              <Stack spacing={0.5}>
                <Typography variant="subtitle2">Required equipment</Typography>
                {data.equipment.length === 0 && <Typography variant="body2">No equipment requirements returned.</Typography>}
                {data.equipment.map((equipment) => (
                  <Typography key={equipment.id} variant="body2">
                    {equipment.name} · {equipment.available ? "Available" : "Unavailable"}
                  </Typography>
                ))}
              </Stack>
            </>
          )}
        </>
      )}
      <Typography variant="body2" color="text.secondary">
        Availability is provisional. Booking rechecks resource requirements and availability.
      </Typography>
      <Button type="button" variant="outlined" onClick={resource.refresh} disabled={!resource.canRefresh} sx={{ alignSelf: "flex-start" }}>
        Refresh availability
      </Button>
    </Stack>
  );
}

export function BookedSchedulingResources({ snapshot }: {
  snapshot: NonNullable<Appointment["service_offering_snapshot"]>["resource_compatibility"];
}) {
  if (!snapshot) return null;
  return <Typography variant="body2" color="text.secondary">
    {snapshot.mode === "not_required"
      ? "No chair or equipment required at booking"
      : `Booked resources: ${snapshot.resources.map((resource) => resource.name).join(", ")}`}
    {` · Configuration revision ${snapshot.revision}`}
  </Typography>;
}
