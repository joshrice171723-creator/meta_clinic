import type {
  ClinicTrackingBoard,
  ClinicWorkspaceContext,
  FacilityRoom,
} from "../../api/contracts";

export type ClinicMapVisit = {
  id: number;
  patientId: number;
  patientName: string;
  reference: string;
  roomId: number | null;
  stage: string;
  provider: string | null;
  intakeOwner: string | null;
  waiting: boolean;
};
export type ClinicMapScene = {
  siteId: number;
  siteName: string;
  timezone: string;
  asOf: string;
  partial: boolean;
  rooms: {
    id: number;
    label: string;
    kind: FacilityRoom["kind"];
    visits: ClinicMapVisit[];
  }[];
  waiting: ClinicMapVisit[];
  unplaced: ClinicMapVisit[];
  visitCount: number;
};

// This projection contains no transport, storage, layout coordinates or workflow writes.
export function extractClinicMap(
  context: ClinicWorkspaceContext,
  rooms: readonly FacilityRoom[],
  board: ClinicTrackingBoard,
  roomsPartial = false,
): ClinicMapScene {
  const site = context.current_site;
  if (!site || !context.sites.some((item) => item.id === site.id))
    throw new Error("Select an authorized clinic location to view its floor.");
  if (!context.capabilities.patients || !context.capabilities.facilities_read)
    throw new Error(
      "Room and tracking board access are required for the clinic map.",
    );
  if (
    board.schema_version !== "tracking-board-v2" ||
    !Array.isArray(board.visits) ||
    !Number.isFinite(Date.parse(board.as_of))
  )
    throw new Error(
      "The clinic snapshot could not be confirmed. Refresh to reconnect.",
    );
  const catalog = [
    ...new Map(
      rooms
        .filter((room) => room.site_id === site.id)
        .map((room) => [room.id, room]),
    ).values(),
  ].sort(
    (a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true }) || a.id - b.id,
  );
  const seen = new Set<number>();
  const visits: ClinicMapVisit[] = [];
  for (const row of board.visits) {
    const encounter = row.encounter;
    if (
      row.row_type !== "encounter" ||
      !encounter ||
      encounter.status !== "open" ||
      encounter.ended_at ||
      String(encounter.site_id) !== String(site.id) ||
      !Number.isFinite(Date.parse(encounter.started_at)) ||
      Date.parse(encounter.started_at) > Date.parse(board.as_of) ||
      seen.has(encounter.id)
    )
      continue;
    seen.add(encounter.id);
    const stage = row.nurse_workflow?.stage;
    visits.push({
      id: encounter.id,
      patientId: row.patient_id,
      patientName: row.patient.display_name,
      reference: row.patient.reference,
      roomId: encounter.room_id,
      stage:
        stage === "waiting"
          ? "Waiting"
          : stage === "intake"
            ? "Intake"
            : stage === "ready"
              ? "Ready for provider"
              : stage === "clinician"
                ? "With provider"
                : "Stage not recorded",
      provider: row.provider?.display_name ?? null,
      intakeOwner:
        row.intake_ownership?.state === "claimed"
          ? row.intake_ownership.owner.display_name
          : null,
      waiting:
        stage === "waiting" && encounter.room_id === null && !row.provider,
    });
  }
  const roomIds = new Set(catalog.map((room) => room.id));
  return {
    siteId: site.id,
    siteName: site.name || site.code,
    timezone: site.timezone_override || context.practice.timezone,
    asOf: board.as_of,
    partial: board.truncated || roomsPartial,
    rooms: catalog.map((room) => ({
      id: room.id,
      label: room.code,
      kind: room.kind,
      visits: visits.filter((visit) => visit.roomId === room.id),
    })),
    waiting: visits.filter((visit) => visit.waiting),
    unplaced: visits.filter(
      (visit) =>
        !visit.waiting && (visit.roomId === null || !roomIds.has(visit.roomId)),
    ),
    visitCount: visits.length,
  };
}
