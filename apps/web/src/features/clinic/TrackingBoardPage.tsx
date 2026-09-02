import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentPasteSearchIcon from "@mui/icons-material/ContentPasteSearch";
import NoteAltIcon from "@mui/icons-material/NoteAlt";
import { useClinic } from "./Workspace";
import type { ClinicTrackingBoard } from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { LoadState } from "../../shared/ui";
import {
  CareIndicators,
  CareSummaryTrigger,
  careIndicatorGroups,
  usePatientCareSummaries,
  type CareSummaryLoadState,
} from "./CareIndicators";
import { openSoapHref, previousChartHref } from "./chartNavigation";
import { EXAMPLE_CARE_SUMMARIES } from "./trackingBoardCareFixtures";
import {
  EXAMPLE_CLOCK,
  EXAMPLE_CLINICIANS,
  EXAMPLE_VISITS,
  VISIT_STAGES,
  clinicianInitials,
  clinicianLabel,
  cliniciansForLocation,
  durationLabel,
  filterVisits,
  patientLabel,
  waitingMinutes,
  type BoardVisit,
  type ExampleClinician,
  type ExampleVitalStatus,
} from "./trackingBoardData";
import { trackingBoardVisitToBoardVisit } from "./trackingBoardApi";

const EMPTY_BOARD_VISITS: BoardVisit[] = [];

function useTrackingBoard(active = true) {
  const [state, setState] = useState<{
    data?: ClinicTrackingBoard;
    error?: string;
    stale: boolean;
  }>({ stale: false });

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      setState((current) => ({
        ...current,
        error: undefined,
        stale: Boolean(current.data),
      }));
      void api<ClinicTrackingBoard>("/api/clinic/tracking_board", {
        signal: requestController.signal,
      })
        .then((data) => {
          if (!mounted) return;
          setState({ data, stale: false });
        })
        .catch((error: unknown) => {
          if (!mounted || requestController.signal.aborted) return;
          if (error instanceof ApiError && error.status === 401) {
            window.location.replace("/login");
            return;
          }
          setState((current) => ({
            ...current,
            error:
              error instanceof Error
                ? error.message
                : "Unable to refresh the tracking board.",
            stale: Boolean(current.data),
          }));
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      mounted = false;
      controller?.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [active]);

  return state;
}

function patientTableLabel(visit: BoardVisit) {
  const last = visit.lastName.trim() || "Unknown";
  const firstInitial = visit.firstName.trim().charAt(0);
  const identity =
    visit.patientDisplayName?.trim() ||
    `${last}, ${firstInitial ? `${firstInitial}.` : "—"}`;
  const demographics = [
    visit.patientReference ? `Ref ${visit.patientReference}` : null,
    visit.age === null ? null : `${visit.age} yr`,
    visit.gender,
  ].filter(Boolean);
  return { identity, demographics: demographics.join(" · ") };
}

function vitalReadings(visit: BoardVisit) {
  const summary = visit.triage?.vitalsSummary;
  if (!summary) return null;
  const statuses = visit.triage?.vitalStatuses;
  const bp = summary.match(/BP\s+([0-9]+\/[0-9]+)/i)?.[1] ?? null;
  const hr = summary.match(/HR\s+([0-9]+)/i)?.[1] ?? null;
  const weight = summary.match(/([0-9]+(?:\.[0-9]+)?)\s*kg/i)?.[1] ?? null;
  return {
    bp: {
      value: bp ?? "—",
      status: bp ? (statuses?.bp ?? "unassessed") : "unassessed",
    },
    hr: {
      value: hr ? `${hr} bpm` : "—",
      status: hr ? (statuses?.hr ?? "unassessed") : "unassessed",
    },
    weight: {
      value: weight ? `${weight} kg` : "—",
      status: weight ? (statuses?.weight ?? "unassessed") : "unassessed",
    },
  };
}

const vitalStatusPresentation: Record<ExampleVitalStatus, { label: string }> = {
  above: { label: "Above normal limits" },
  within: { label: "Within normal limits" },
  below: { label: "Below normal limits" },
  unassessed: { label: "Not assessed" },
};

const membershipLabels = {
  member: "Member",
  nonmember: "Non-member",
  unknown: "Not verified",
};
type ColumnKey =
  "patient" | "care" | "stage" | "provider" | "reason" | "triage" | "wait";
const initialColumns: ColumnKey[] = [
  "patient",
  "care",
  "stage",
  "provider",
  "reason",
  "triage",
  "wait",
];
const initialColumnWidths: Record<ColumnKey, number> = {
  patient: 280,
  care: 180,
  stage: 105,
  provider: 110,
  reason: 175,
  triage: 190,
  wait: 105,
};
const columnMinimumWidths: Record<ColumnKey, number> = {
  patient: 220,
  care: 150,
  stage: 70,
  provider: 70,
  reason: 115,
  triage: 145,
  wait: 75,
};
const columnLabels: Record<ColumnKey, string> = {
  patient: "Patient",
  care: "Care",
  stage: "Location",
  provider: "Provider",
  reason: "Reason",
  triage: "Vitals",
  wait: "Wait",
};
function ExampleVisitRow({
  visit,
  now,
  columns,
  striped,
  assignedClinicianId,
  careSummaryState,
  timezone,
  clinicians,
  onAssignClinician,
}: {
  visit: BoardVisit;
  now: string;
  columns: ColumnKey[];
  striped: boolean;
  assignedClinicianId: string | null;
  careSummaryState: CareSummaryLoadState;
  timezone: string;
  clinicians: readonly ExampleClinician[];
  onAssignClinician: (clinicianId: string | null) => void;
}) {
  const [providerEditorOpen, setProviderEditorOpen] = useState(false);
  const [draftClinicianId, setDraftClinicianId] = useState(
    assignedClinicianId ?? "",
  );
  const stage = VISIT_STAGES.find((s) => s.id === visit.stage)!;
  const label =
    visit.patientDisplayName || patientLabel(visit.firstName, visit.lastName);
  const tableLabel = patientTableLabel(visit);
  const availableClinicians = cliniciansForLocation(
    visit.locationId,
    clinicians,
  );
  const assignedClinician = clinicians.find(
    (clinician) => clinician.id === assignedClinicianId,
  );
  const readings = vitalReadings(visit);
  const openProviderEditor = () => {
    if (visit.isSynthetic === false) return;
    setDraftClinicianId(assignedClinicianId ?? "");
    setProviderEditorOpen(true);
  };
  return (
    <TableRow
      hover
      className={`tracking-visit${striped ? " tracking-visit-alt" : ""}`}
      data-stage={visit.stage}
    >
      {columns.map((column) =>
        column === "patient" ? (
          <TableCell
            key={column}
            component="th"
            scope="row"
            data-label={columnLabels[column]}
          >
            <div className="tracking-patient">
              {visit.membership !== "unknown" && (
                <Tooltip title={membershipLabels[visit.membership]}>
                  <Chip
                    size="small"
                    label={visit.membership === "member" ? "M" : "N"}
                    className={`tracking-membership-mark tracking-membership-${visit.membership}`}
                    aria-label={membershipLabels[visit.membership]}
                  />
                </Tooltip>
              )}
              <div className="tracking-patient-details">
                <strong>{tableLabel.identity}</strong>
                {tableLabel.demographics && (
                  <Typography
                    variant="caption"
                    className="tracking-patient-demographics"
                    color="text.secondary"
                  >
                    {tableLabel.demographics}
                  </Typography>
                )}
              </div>
              <CareSummaryTrigger
                state={careSummaryState}
                patientLabel={label}
                timezone={timezone}
                href={openSoapHref(visit)}
                actionLabel={
                  visit.patientId != null && visit.encounterId != null
                    ? `Open SOAP note for ${label}`
                    : `Select chart for ${label} before opening SOAP note`
                }
              >
                <NoteAltIcon fontSize="inherit" aria-hidden="true" />
              </CareSummaryTrigger>
            </div>
          </TableCell>
        ) : column === "care" ? (
          <TableCell key={column} data-label={columnLabels[column]}>
            <CareIndicators
              state={careSummaryState}
              patientLabel={label}
              timezone={timezone}
            />
          </TableCell>
        ) : column === "stage" ? (
          <TableCell key={column} data-label={columnLabels[column]}>
            <Typography variant="body2" className="tracking-location">
              {visit.room ?? "Room unassigned"}
            </Typography>
          </TableCell>
        ) : column === "provider" ? (
          <Fragment key={column}>
            <TableCell
              className="tracking-provider-cell"
              data-label={columnLabels[column]}
            >
              {visit.isSynthetic === false ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  aria-label="Provider not recorded"
                >
                  —
                </Typography>
              ) : assignedClinician ? (
                <Tooltip title={clinicianLabel(assignedClinician)}>
                  <button
                    type="button"
                    className="tracking-provider-initials"
                    onClick={openProviderEditor}
                    aria-label={`Assigned clinician: ${clinicianLabel(assignedClinician)}. Change assignment.`}
                  >
                    {clinicianInitials(assignedClinician)}
                  </button>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  className="tracking-provider-empty"
                  onClick={openProviderEditor}
                >
                  Assign
                </button>
              )}
            </TableCell>
            {visit.isSynthetic !== false && (
              <Dialog
                className="tracking-provider-dialog"
                open={providerEditorOpen}
                onClose={() => setProviderEditorOpen(false)}
                maxWidth="xs"
                fullWidth
                aria-labelledby={`provider-dialog-title-${visit.id}`}
              >
                <DialogTitle id={`provider-dialog-title-${visit.id}`}>
                  Assign provider
                </DialogTitle>
                <DialogContent
                  sx={{ display: "grid", gap: 2, pt: "8px !important" }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {tableLabel.identity} · {visit.room ?? "Room unassigned"}
                  </Typography>
                  <Box
                    component="label"
                    htmlFor={`provider-dialog-select-${visit.id}`}
                    sx={{ fontSize: 13, fontWeight: 600, mb: -1 }}
                  >
                    Provider
                  </Box>
                  <Box
                    component="select"
                    id={`provider-dialog-select-${visit.id}`}
                    autoFocus
                    value={draftClinicianId}
                    onChange={(event) =>
                      setDraftClinicianId(event.target.value)
                    }
                    sx={{
                      width: "100%",
                      p: 1.25,
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 1,
                      bgcolor: "background.paper",
                      color: "text.primary",
                      font: "inherit",
                    }}
                  >
                    <option value="">Unassigned</option>
                    {availableClinicians.map((clinician) => (
                      <option key={clinician.id} value={clinician.id}>
                        {clinicianLabel(clinician)}
                      </option>
                    ))}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Example only — not saved
                  </Typography>
                </DialogContent>
                <DialogActions>
                  <Button onClick={() => setProviderEditorOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => {
                      onAssignClinician(draftClinicianId || null);
                      setProviderEditorOpen(false);
                    }}
                  >
                    Apply example assignment
                  </Button>
                </DialogActions>
              </Dialog>
            )}
          </Fragment>
        ) : column === "reason" ? (
          <TableCell key={column} data-label={columnLabels[column]}>
            <div className="tracking-reason">
              <div>
                {visit.appointmentType !== "Recorded visit" &&
                  visit.chiefComplaint !== visit.reason && (
                    <Typography variant="caption" color="text.secondary">
                      {visit.appointmentType}
                    </Typography>
                  )}
                <Typography
                  variant="body2"
                  aria-label={
                    visit.chiefComplaint === "Reason not recorded"
                      ? "Reason not recorded"
                      : undefined
                  }
                >
                  {visit.chiefComplaint === "Reason not recorded"
                    ? "—"
                    : visit.chiefComplaint}
                </Typography>
              </div>
              {visit.appointmentType === "Follow-up" && (
                <Tooltip title="Open most recent signed chart">
                  <a
                    href={previousChartHref(visit)}
                    className="tracking-context-link"
                    aria-label={`Open most recent signed chart for ${label}`}
                  >
                    <ContentPasteSearchIcon
                      fontSize="medium"
                      aria-hidden="true"
                    />
                  </a>
                </Tooltip>
              )}
            </div>
          </TableCell>
        ) : column === "triage" ? (
          <TableCell key={column} data-label={columnLabels[column]}>
            {readings ? (
              <Box className="tracking-vitals" aria-label="Vital signs">
                {Object.entries(readings).map(([key, reading]) => {
                  const name =
                    key === "bp"
                      ? "Blood pressure"
                      : key === "hr"
                        ? "Heart rate"
                        : "Weight";
                  const presentation = vitalStatusPresentation[reading.status];
                  return (
                    <Box
                      key={key}
                      className={`tracking-vital tracking-vital-${reading.status}`}
                      aria-label={`${name}: ${reading.value}. ${presentation.label}.`}
                      title={presentation.label}
                    >
                      <Typography variant="caption" component="span">
                        {key === "bp" ? "BP" : key === "hr" ? "HR" : "Wt"}
                      </Typography>
                      <Typography
                        variant="body2"
                        component="span"
                        className="tracking-vital-value"
                      >
                        {reading.value}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            ) : (
              <Typography variant="body2" aria-label="Vitals not recorded">
                —
              </Typography>
            )}
          </TableCell>
        ) : column === "wait" ? (
          <TableCell key={column} data-label={columnLabels[column]}>
            <Typography
              variant="body2"
              className="tracking-wait"
              sx={{ fontWeight: 600 }}
            >
              {stage.id === "unrecorded"
                ? "—"
                : stage.waiting
                  ? durationLabel(waitingMinutes(visit, now))
                  : "In care"}
            </Typography>
            <Typography
              variant="caption"
              className="tracking-flow-stage"
              color="text.secondary"
            >
              {stage.action}
            </Typography>
          </TableCell>
        ) : (
          <TableCell key={column} data-label={columnLabels[column]}>
            <Typography variant="body2">{stage.action}</Typography>
          </TableCell>
        ),
      )}
    </TableRow>
  );
}
export function TrackingBoardView({
  visits = EXAMPLE_VISITS,
  now = EXAMPLE_CLOCK,
  timezone = "UTC",
  synthetic = true,
  truncated = false,
  stale = false,
  refreshError,
  careSummaryStates,
}: {
  visits?: readonly BoardVisit[];
  now?: string;
  timezone?: string;
  synthetic?: boolean;
  truncated?: boolean;
  stale?: boolean;
  refreshError?: string;
  careSummaryStates?: Record<string, CareSummaryLoadState>;
}) {
  const [stage, setStage] = useState("all");
  const [columns, setColumns] = useState<ColumnKey[]>(
    synthetic ? initialColumns : ["patient", "care", "stage", "reason"],
  );
  const [sortBy, setSortBy] = useState<ColumnKey>("patient");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);
  const [columnWidths, setColumnWidths] =
    useState<Record<ColumnKey, number>>(initialColumnWidths);
  const [providerAssignments, setProviderAssignments] = useState<
    Record<string, string | null>
  >(() =>
    Object.fromEntries(
      visits.map((visit) => [visit.id, visit.assignedClinicianId]),
    ),
  );
  const [resizingColumn, setResizingColumn] = useState<ColumnKey | null>(null);
  const syntheticCareSummaryStates = usePatientCareSummaries(
    synthetic ? visits : EMPTY_BOARD_VISITS,
    EXAMPLE_CARE_SUMMARIES,
  );
  const resolvedCareSummaryStates =
    careSummaryStates ?? syntheticCareSummaryStates;
  const resizeState = useRef<{
    column: ColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);
  const filtered = filterVisits(visits, stage, "", "arrival", now);
  const sorted = [...filtered].sort((left, right) => {
    const value = (visit: BoardVisit) => {
      if (sortBy === "patient")
        return patientLabel(visit.firstName, visit.lastName);
      if (sortBy === "care")
        return careIndicatorGroups(
          resolvedCareSummaryStates[visit.id] ?? { status: "unlinked" },
        ).length;
      if (sortBy === "stage") return visit.room ?? "Room unassigned";
      if (sortBy === "provider") {
        const clinician = EXAMPLE_CLINICIANS.find(
          (item) => item.id === providerAssignments[visit.id],
        );
        return clinician ? clinicianLabel(clinician) : "Unassigned";
      }
      if (sortBy === "reason") return visit.chiefComplaint;
      if (sortBy === "triage") return visit.triage?.summary ?? "Not recorded";
      if (sortBy === "wait") return waitingMinutes(visit, now) ?? -1;
      return "";
    };
    const comparison =
      typeof value(left) === "number" && typeof value(right) === "number"
        ? (value(left) as number) - (value(right) as number)
        : String(value(left)).localeCompare(String(value(right)));
    return (
      (sortDirection === "asc" ? comparison : -comparison) ||
      left.id.localeCompare(right.id)
    );
  });
  const sortColumn = (column: ColumnKey) => {
    if (sortBy === column)
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortBy(column);
      setSortDirection("asc");
    }
  };
  const moveColumn = (from: ColumnKey, to: ColumnKey) => {
    if (from === to) return;
    setColumns((current) => {
      const next = [...current];
      const fromIndex = next.indexOf(from);
      const toIndex = next.indexOf(to);
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, from);
      return next;
    });
  };
  const toggleColumn = (column: ColumnKey) => {
    setColumns((current) => {
      if (current.includes(column))
        return current.length === 1
          ? current
          : current.filter((item) => item !== column);
      return initialColumns.filter(
        (item) => current.includes(item) || item === column,
      );
    });
  };
  const resizeColumnFromPointer = (
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    const current = resizeState.current;
    if (!current) return;
    const nextWidth = Math.max(
      columnMinimumWidths[current.column],
      Math.min(600, current.startWidth + event.clientX - current.startX),
    );
    setColumnWidths((widths) => ({
      ...widths,
      [current.column]: nextWidth,
    }));
  };
  const finishColumnResize = () => {
    resizeState.current = null;
    setResizingColumn(null);
  };
  const resizeColumnWithKeyboard = (column: ColumnKey, delta: number) => {
    setColumnWidths((widths) => ({
      ...widths,
      [column]: Math.max(
        columnMinimumWidths[column],
        Math.min(600, widths[column] + delta),
      ),
    }));
  };
  const tableWidth = columns.reduce(
    (total, column) => total + columnWidths[column],
    0,
  );
  const stageOptions = [{ id: "all", label: "All visits" }, ...VISIT_STAGES];
  return (
    <section className="tracking-board" aria-label="Tracking Board">
      {!synthetic && (
        <p className="tracking-data-boundary" role="status">
          Partial synthetic encounter projection — not a live complete queue.
        </p>
      )}
      {!synthetic && truncated && (
        <p className="tracking-data-warning" role="alert">
          Incomplete result: this projection is capped at 200 rows. Additional
          encounters are not shown.
        </p>
      )}
      {!synthetic && stale && (
        <p className="tracking-data-warning" role="status">
          Showing the last confirmed snapshot; wait times are frozen until a
          refresh succeeds.
        </p>
      )}
      {!synthetic && refreshError && (
        <p className="tracking-data-warning" role="alert">
          Board refresh failed: {refreshError} The last confirmed snapshot is
          still shown.
        </p>
      )}
      <div
        className="tracking-stage-filters"
        aria-label={`Filter ${synthetic ? "example visits" : "current visits"} by stage`}
      >
        {stageOptions.map((s) => (
          <button
            type="button"
            key={s.id}
            aria-pressed={stage === s.id}
            onClick={() => setStage(s.id)}
          >
            <span>{s.label}</span>
            <strong>
              {s.id === "all"
                ? visits.length
                : visits.filter((v) => v.stage === s.id).length}
            </strong>
          </button>
        ))}
      </div>
      <div className="tracking-tools">
        <div className="tracking-stage-select">
          <label htmlFor="board-stage">Visit stage</label>
          <select
            id="board-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            {stageOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} (
                {s.id === "all"
                  ? visits.length
                  : visits.filter((v) => v.stage === s.id).length}
                )
              </option>
            ))}
          </select>
        </div>
        <details className="tracking-column-selector">
          <summary>Columns</summary>
          <div role="group" aria-label="Choose tracking board columns">
            {initialColumns.map((column) => (
              <label key={column}>
                <input
                  type="checkbox"
                  checked={columns.includes(column)}
                  disabled={columns.length === 1 && columns[0] === column}
                  onChange={() => toggleColumn(column)}
                />
                {columnLabels[column]}
              </label>
            ))}
          </div>
        </details>
      </div>
      <TableContainer
        component={Paper}
        variant="outlined"
        className="tracking-table-container"
      >
        <Table
          stickyHeader
          aria-label="Clinic patient tracking board"
          className="tracking-table"
          style={{
            width: synthetic ? tableWidth : "100%",
            minWidth: tableWidth,
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            {columns.map((column) => (
              <col key={column} style={{ width: columnWidths[column] }} />
            ))}
          </colgroup>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedColumn) moveColumn(draggedColumn, column);
                    setDraggedColumn(null);
                  }}
                >
                  <div className="tracking-column-heading">
                    <TableSortLabel
                      active={sortBy === column}
                      direction={sortBy === column ? sortDirection : "asc"}
                      onClick={() => sortColumn(column)}
                    >
                      {columnLabels[column]}
                    </TableSortLabel>
                    <span
                      className="tracking-column-move"
                      draggable
                      role="button"
                      tabIndex={0}
                      aria-label={`Move ${columnLabels[column]} column`}
                      title={`Drag to move ${columnLabels[column]}`}
                      onDragStart={() => setDraggedColumn(column)}
                      onDragEnd={() => setDraggedColumn(null)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "ArrowLeft" ||
                          event.key === "ArrowRight"
                        ) {
                          event.preventDefault();
                          const index = columns.indexOf(column);
                          const target =
                            event.key === "ArrowLeft"
                              ? columns[index - 1]
                              : columns[index + 1];
                          if (target) moveColumn(column, target);
                        }
                      }}
                    >
                      ↔
                    </span>
                  </div>
                  <span
                    className={`tracking-column-resize${resizingColumn === column ? " is-resizing" : ""}`}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${columnLabels[column]} column`}
                    aria-valuemin={columnMinimumWidths[column]}
                    aria-valuemax={600}
                    aria-valuenow={columnWidths[column]}
                    tabIndex={0}
                    draggable={false}
                    onPointerDown={(
                      event: ReactPointerEvent<HTMLSpanElement>,
                    ) => {
                      event.preventDefault();
                      event.stopPropagation();
                      resizeState.current = {
                        column,
                        startX: event.clientX,
                        startWidth: columnWidths[column],
                      };
                      setResizingColumn(column);
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                    }}
                    onPointerMove={resizeColumnFromPointer}
                    onPointerUp={finishColumnResize}
                    onPointerCancel={finishColumnResize}
                    onKeyDown={(event) => {
                      if (
                        event.key === "ArrowLeft" ||
                        event.key === "ArrowRight"
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        resizeColumnWithKeyboard(
                          column,
                          event.key === "ArrowLeft" ? -10 : 10,
                        );
                      }
                    }}
                  />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((visit, index) => (
              <ExampleVisitRow
                key={visit.id}
                visit={visit}
                now={now}
                columns={columns}
                striped={index % 2 === 1}
                assignedClinicianId={providerAssignments[visit.id] ?? null}
                careSummaryState={
                  resolvedCareSummaryStates[visit.id] ?? { status: "unlinked" }
                }
                timezone={timezone}
                clinicians={EXAMPLE_CLINICIANS}
                onAssignClinician={(clinicianId) =>
                  setProviderAssignments((current) => ({
                    ...current,
                    [visit.id]: clinicianId,
                  }))
                }
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {columns.includes("triage") && (
        <div
          className="tracking-vitals-legend"
          aria-label={`${synthetic ? "Synthetic " : ""}vital status legend`}
        >
          {(["above", "within", "below"] as const).map((status) => (
            <span key={status} className={`tracking-legend-${status}`}>
              <i className="tracking-vitals-legend-swatch" aria-hidden="true" />
              {vitalStatusPresentation[status].label}
            </span>
          ))}
          <small>
            {synthetic
              ? "Synthetic display classifications — not clinical guidance"
              : "Vital status classifications are not recorded on this board"}
          </small>
        </div>
      )}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 1 }}
      >
        Select a heading to sort. Drag its ↔ control to rearrange columns, or
        focus that control and use Left/Right Arrow. Resize from any column
        border.
        {synthetic &&
          " Select a Provider control to assign or unassign an example clinician."}
      </Typography>
      {filtered.length === 0 && (
        <div className="tracking-empty">
          <h2>
            {visits.length
              ? "No visits match these filters"
              : synthetic
                ? "No example visits"
                : "No current visits"}
          </h2>
          <p>
            {visits.length
              ? "Try another stage or clear your search."
              : synthetic
                ? "An empty example is not evidence that the clinic has no waiting patients."
                : "No open encounters are currently recorded for this practice."}
          </p>
          {visits.length > 0 && (
            <button
              className="button"
              type="button"
              onClick={() => setStage("all")}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      <p className="tracking-caption">
        {synthetic
          ? "Wait = time in the current waiting stage. Queue order is not clinical priority. Membership does not change priority. Abbreviated labels can match; always confirm identity in the record before care."
          : "Open a chart from the patient row. Care icons open recorded details. Use Columns to reveal additional fields in this partial projection."}
      </p>
    </section>
  );
}
export function OverviewView({
  patientAccess,
  timezone = "UTC",
}: {
  patientAccess: boolean;
  timezone?: string;
}) {
  if (!patientAccess)
    return (
      <section>
        <h1>Clinic overview</h1>
        <p>
          Patient tracking is available to assigned patient-workspace users.
        </p>
        <a href="/clinic/operations" className="text-link">
          Open Operations →
        </a>
      </section>
    );
  return <TrackingBoardView timezone={timezone} />;
}
export function Overview({ active = true }: { active?: boolean }) {
  const clinic = useClinic();
  if (!clinic.capabilities.patients)
    return (
      <OverviewView patientAccess={false} timezone={clinic.practice.timezone} />
    );
  return <TrackingBoardPage active={active} />;
}

export function TrackingBoardPage({ active = true }: { active?: boolean }) {
  const clinic = useClinic();
  const { data, error, stale } = useTrackingBoard(active);
  const visits = useMemo(
    () => data?.visits.map(trackingBoardVisitToBoardVisit) ?? [],
    [data?.visits],
  );
  const careSummaryStates = useMemo<Record<string, CareSummaryLoadState>>(
    () =>
      Object.fromEntries(
        (data?.visits ?? []).map((visit) => [
          `encounter-${visit.encounter_id}`,
          { status: "ready", summary: visit.care_summary },
        ]),
      ),
    [data?.visits],
  );
  if (!data) return <LoadState error={error} />;
  return (
    <TrackingBoardView
      visits={visits}
      now={data.as_of}
      timezone={clinic.practice.timezone}
      synthetic={false}
      truncated={data.truncated}
      stale={stale}
      refreshError={error}
      careSummaryStates={careSummaryStates}
    />
  );
}
