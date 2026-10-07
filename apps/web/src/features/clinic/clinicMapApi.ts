import { api } from "../../api/client";
import type {
  ClinicTrackingBoard,
  ClinicWorkspaceContext,
  FacilityRoom,
  Pagination,
} from "../../api/contracts";
import { extractClinicMap } from "./clinicMapExtraction";

export function clinicMapContextKey(context: ClinicWorkspaceContext) {
  return JSON.stringify([
    context.user_id,
    context.practice.id,
    context.membership_id,
    context.current_site?.id,
    context.authorization_generation,
    context.policy_version,
    context.sites.map((site) => site.id).sort((a, b) => a - b),
    Object.entries(context.capabilities).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

export async function loadClinicMap(
  context: ClinicWorkspaceContext,
  signal: AbortSignal,
) {
  const siteId = context.current_site?.id;
  if (
    !siteId ||
    !context.capabilities.patients ||
    !context.capabilities.facilities_read
  )
    throw new Error("Select a location with room and tracking board access.");
  const readRooms = async () => {
    const rooms: FacilityRoom[] = [];
    let partial = false;
    for (let page = 1; page <= 10; page += 1) {
      const result = await api<{
        rooms: FacilityRoom[];
        pagination: Pagination;
      }>(
        `/api/clinic/facilities?type=rooms&site_id=${siteId}&per_page=100&page=${page}`,
        { signal },
      );
      if (
        !Array.isArray(result.rooms) ||
        result.pagination?.page !== page ||
        !Number.isSafeInteger(result.pagination.total_pages)
      )
        throw new Error("The room catalog could not be confirmed.");
      rooms.push(...result.rooms);
      if (page >= result.pagination.total_pages) break;
      partial = page === 10;
    }
    return { rooms, partial };
  };
  const [catalog, board] = await Promise.all([
    readRooms(),
    api<ClinicTrackingBoard>("/api/clinic/tracking_board", { signal }),
  ]);
  const confirmed = await api<ClinicWorkspaceContext>("/api/clinic/context", {
    signal,
  });
  signal.throwIfAborted();
  if (clinicMapContextKey(confirmed) !== clinicMapContextKey(context))
    throw new Error(
      "Your clinic context changed. Reopen the workspace before continuing.",
    );
  return extractClinicMap(confirmed, catalog.rooms, board, catalog.partial);
}
