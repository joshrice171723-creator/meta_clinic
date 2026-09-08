import type { BoardVisit } from "./trackingBoardData";

export type ChartNavigationMode = "current" | "previous";

type NavigationVisit = Pick<BoardVisit, "id"> & {
  patientId?: number | null;
  encounterId?: number | null;
};

function selectionHref(mode: ChartNavigationMode, visit: NavigationVisit) {
  const params = new URLSearchParams({
    mode,
    board_visit_id: visit.id,
  });
  if (visit.patientId != null)
    params.set("patient_id", String(visit.patientId));
  if (visit.encounterId != null)
    params.set("encounter_id", String(visit.encounterId));
  return `/clinic/chart-selection?${params.toString()}`;
}

export function openSoapHref(visit: NavigationVisit) {
  if (visit.patientId != null && visit.encounterId != null)
    return `/clinic/patients/${visit.patientId}/encounters/${visit.encounterId}`;
  return selectionHref("current", visit);
}

export function previousChartHref(visit: NavigationVisit) {
  return selectionHref("previous", visit);
}
