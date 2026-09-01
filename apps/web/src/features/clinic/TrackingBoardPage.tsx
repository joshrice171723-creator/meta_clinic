import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Box,
  Chip,
  Collapse,
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
import {
  EXAMPLE_CLOCK,
  EXAMPLE_VISITS,
  VISIT_STAGES,
  durationLabel,
  elapsedMinutes,
  filterVisits,
  patientLabel,
  waitingMinutes,
  type BoardVisit,
} from "./trackingBoardData";

function patientTableLabel(visit: BoardVisit) {
  const last = visit.lastName.trim() || "Unknown";
  const firstInitial = visit.firstName.trim().charAt(0);
  const identity = `${last}, ${firstInitial ? `${firstInitial}.` : "—"}`;
  const demographics = [
    visit.age === null ? "Age not recorded" : `${visit.age} yr`,
    visit.gender ?? "Gender not recorded",
  ];
  return { identity, demographics: demographics.join(" · ") };
}

function vitalReadings(visit: BoardVisit) {
  const summary = visit.triage?.vitalsSummary;
  if (!summary) return null;
  const bp = summary.match(/BP\s+([0-9]+\/[0-9]+)/i)?.[1] ?? null;
  const hr = summary.match(/HR\s+([0-9]+)/i)?.[1] ?? null;
  const weight = summary.match(/([0-9]+(?:\.[0-9]+)?)\s*kg/i)?.[1] ?? null;
  const [systolic, diastolic] = (bp ?? "").split("/").map(Number);
  const heartRate = Number(hr);
  return {
    bp: bp ? { value: bp, normal: systolic < 120 && diastolic < 80 } : null,
    hr: hr
      ? { value: `${hr} bpm`, normal: heartRate >= 60 && heartRate <= 100 }
      : null,
    weight: weight ? { value: `${weight} kg`, normal: null } : null,
  };
}

const membershipLabels = {
  member: "Member",
  nonmember: "Non-member",
  unknown: "Not verified",
};
type ColumnKey =
  "patient" | "stage" | "reason" | "triage" | "membership" | "wait";
const initialColumns: ColumnKey[] = [
  "patient",
  "stage",
  "reason",
  "triage",
  "membership",
  "wait",
];
const MIN_COLUMN_WIDTH = 110;
const initialColumnWidths: Record<ColumnKey, number> = {
  patient: 180,
  stage: 190,
  reason: 180,
  triage: 220,
  membership: 150,
  wait: 170,
};
const columnLabels: Record<ColumnKey, string> = {
  patient: "Patient",
  stage: "Location",
  reason: "Reason",
  triage: "Vitals",
  membership: "Membership",
  wait: "Wait",
};
function ExampleVisitRow({
  visit,
  now,
  columns,
  striped,
}: {
  visit: BoardVisit;
  now: string;
  columns: ColumnKey[];
  striped: boolean;
}) {
  const [soapOpen, setSoapOpen] = useState(false);
  const stage = VISIT_STAGES.find((s) => s.id === visit.stage)!;
  const label = patientLabel(visit.firstName, visit.lastName);
  const tableLabel = patientTableLabel(visit);
  return (
    <>
      <TableRow
        hover
        className={`tracking-visit${striped ? " tracking-visit-alt" : ""}`}
        data-stage={visit.stage}
      >
        {columns.map((column) =>
          column === "patient" ? (
            <TableCell key={column} component="th" scope="row">
              <button
                type="button"
                className="tracking-patient"
                aria-expanded={soapOpen}
                aria-controls={soapOpen ? `soap-${visit.id}` : undefined}
                onClick={() => setSoapOpen(!soapOpen)}
                aria-label={`${soapOpen ? "Hide" : "Open"} SOAP note for ${label}`}
              >
                <strong>{tableLabel.identity}</strong>
                <span aria-hidden="true">
                  {soapOpen ? (
                    "−"
                  ) : (
                    <Tooltip title="Open SOAP Note">
                      <NoteAltIcon fontSize="medium" />
                    </Tooltip>
                  )}
                </span>
              </button>
              <Typography
                variant="caption"
                sx={{ display: "block" }}
                color="text.secondary"
              >
                {tableLabel.demographics}
              </Typography>
            </TableCell>
          ) : column === "stage" ? (
            <TableCell key={column}>
              <Chip
                size="small"
                label={stage.label}
                color={visit.stage === "ready" ? "warning" : "default"}
              />
              <Typography
                variant="caption"
                sx={{ display: "block" }}
                color="text.secondary"
              >
                {visit.room ?? "Room unassigned"}
              </Typography>
            </TableCell>
          ) : column === "reason" ? (
            <TableCell key={column}>
              <Typography variant="caption" color="text.secondary">
                {visit.appointmentType}:
              </Typography>
              <Typography variant="body2">{visit.chiefComplaint}</Typography>
              {visit.appointmentType === "Follow-up" && (
                <Tooltip title="Previous Visit">
                  <button
                    type="button"
                    className="tracking-context-link"
                    aria-label="Previous Visit"
                  >
                    <ContentPasteSearchIcon
                      fontSize="medium"
                      aria-hidden="true"
                    />
                  </button>
                </Tooltip>
              )}
              {visit.appointmentType === "Establish Care" && (
                <Tooltip title="Intake Information">
                  <button
                    type="button"
                    className="tracking-context-link"
                    aria-label="Intake Information"
                  >
                    <ContentPasteSearchIcon
                      fontSize="medium"
                      aria-hidden="true"
                    />
                  </button>
                </Tooltip>
              )}
            </TableCell>
          ) : column === "triage" ? (
            <TableCell key={column}>
              {vitalReadings(visit) ? (
                <Box className="tracking-vitals" aria-label="Vital signs">
                  {Object.entries(vitalReadings(visit)!).map(
                    ([key, reading]) => (
                      <Box
                        key={key}
                        className={`tracking-vital tracking-vital-${reading?.normal === null ? "unassessed" : reading?.normal ? "normal" : "alert"}`}
                      >
                        <Typography variant="caption" component="span">
                          {key === "bp" ? "BP" : key === "hr" ? "HR" : "Wt"}
                        </Typography>
                        <Typography variant="body2" component="span">
                          {reading?.value ?? "—"}
                        </Typography>
                      </Box>
                    ),
                  )}
                </Box>
              ) : (
                <Typography variant="body2">Not recorded</Typography>
              )}
            </TableCell>
          ) : column === "membership" ? (
            <TableCell key={column}>
              <Chip
                size="small"
                label={membershipLabels[visit.membership]}
                color={
                  visit.membership === "member"
                    ? "success"
                    : visit.membership === "unknown"
                      ? "default"
                      : "warning"
                }
              />
            </TableCell>
          ) : column === "wait" ? (
            <TableCell key={column}>
              <Typography variant="caption" color="text.secondary">
                Waiting for
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {stage.waiting
                  ? durationLabel(waitingMinutes(visit, now))
                  : "In care"}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 0.5 }}
              >
                {stage.action}
              </Typography>
              <Typography variant="body2">
                {durationLabel(elapsedMinutes(visit.arrivedAt, now))} total
              </Typography>
            </TableCell>
          ) : (
            <TableCell key={column}>
              <Typography variant="body2">{stage.action}</Typography>
            </TableCell>
          ),
        )}
      </TableRow>
      <TableRow className={striped ? "tracking-detail-row-alt" : undefined}>
        <TableCell colSpan={columns.length} sx={{ p: 0, border: 0 }}>
          <Collapse in={soapOpen} timeout="auto" unmountOnExit>
            <Box
              id={`soap-${visit.id}`}
              className="tracking-detail"
              sx={{
                p: 2,
                display: "grid",
                gap: 2,
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              }}
            >
              <div>
                <Typography variant="subtitle2">SOAP note</Typography>
                <Typography variant="body2">
                  SOAP note workspace for this encounter.
                </Typography>
                <Typography variant="body2">
                  Example only. No note is created, signed, or saved from this
                  board.
                </Typography>
              </div>
              <div>
                <Typography variant="subtitle2">Next step</Typography>
                <Typography variant="body2">{stage.action}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Example only. Opening this row does not accept a handoff,
                  change a visit, sign a note or send a prescription.
                </Typography>
              </div>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}
export function TrackingBoardView({
  visits = EXAMPLE_VISITS,
  now = EXAMPLE_CLOCK,
}: {
  visits?: readonly BoardVisit[];
  now?: string;
}) {
  const [stage, setStage] = useState("all");
  const [query, setQuery] = useState("");
  const [columns, setColumns] = useState<ColumnKey[]>(initialColumns);
  const [sortBy, setSortBy] = useState<ColumnKey>("patient");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);
  const [columnWidths, setColumnWidths] =
    useState<Record<ColumnKey, number>>(initialColumnWidths);
  const [resizingColumn, setResizingColumn] = useState<ColumnKey | null>(null);
  const resizeState = useRef<{
    column: ColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);
  const filtered = filterVisits(visits, stage, query, "arrival", now);
  const sorted = [...filtered].sort((left, right) => {
    const value = (visit: BoardVisit) => {
      if (sortBy === "patient")
        return patientLabel(visit.firstName, visit.lastName);
      if (sortBy === "stage")
        return (
          VISIT_STAGES.find((item) => item.id === visit.stage)?.label ?? ""
        );
      if (sortBy === "reason") return visit.chiefComplaint;
      if (sortBy === "triage") return visit.triage?.summary ?? "Not recorded";
      if (sortBy === "membership") return membershipLabels[visit.membership];
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
  useEffect(() => {
    if (!resizingColumn) return;
    const handlePointerMove = (event: PointerEvent) => {
      const current = resizeState.current;
      if (!current) return;
      const nextWidth = Math.max(
        MIN_COLUMN_WIDTH,
        current.startWidth + event.clientX - current.startX,
      );
      setColumnWidths((widths) => ({
        ...widths,
        [current.column]: nextWidth,
      }));
    };
    const handlePointerUp = () => {
      resizeState.current = null;
      setResizingColumn(null);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [resizingColumn]);
  const resizeColumnWithKeyboard = (column: ColumnKey, delta: number) => {
    setColumnWidths((widths) => ({
      ...widths,
      [column]: Math.max(MIN_COLUMN_WIDTH, widths[column] + delta),
    }));
  };
  return (
    <section className="tracking-board" aria-labelledby="tracking-title">
      <div className="tracking-heading">
        <div>
          <p className="eyebrow">OVERVIEW · PATIENT FLOW</p>
          <h1 id="tracking-title">Tracking board</h1>
        </div>
        <a href="/clinic/patients" className="text-link">
          Patient directory ↗
        </a>
      </div>
      <div
        className="tracking-stage-filters"
        aria-label="Filter example visits by stage"
      >
        {[{ id: "all", label: "All visits" }, ...VISIT_STAGES].map((s) => (
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
            {[{ id: "all", label: "All visits" }, ...VISIT_STAGES].map((s) => (
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
        <div className="tracking-search">
          <label htmlFor="board-search">Find on board</label>
          <input
            id="board-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Patient label, visit ID, room or owner"
          />
        </div>
        <p role="status" aria-live="polite">
          {filtered.length} of {visits.length} example visits
        </p>
      </div>
      <TableContainer
        component={Paper}
        variant="outlined"
        className="tracking-table-container"
      >
        <Table
          stickyHeader
          aria-label="Clinic patient tracking board"
          sx={{
            minWidth: columns.reduce(
              (total, column) => total + columnWidths[column],
              0,
            ),
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
                  tabIndex={0}
                  draggable
                  aria-label={`${columnLabels[column]} column. Click to sort; drag to move.`}
                  onDragStart={() => setDraggedColumn(column)}
                  onDragEnd={() => setDraggedColumn(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedColumn) moveColumn(draggedColumn, column);
                    setDraggedColumn(null);
                  }}
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
                  <TableSortLabel
                    active={sortBy === column}
                    direction={sortBy === column ? sortDirection : "asc"}
                    onClick={() => sortColumn(column)}
                  >
                    {columnLabels[column]}
                  </TableSortLabel>
                  {sortBy === column && (
                    <Typography
                      variant="caption"
                      component="span"
                      sx={{ display: "block", opacity: 0.65 }}
                    >
                      ↔ Drag to move
                    </Typography>
                  )}
                  <span
                    className={`tracking-column-resize${resizingColumn === column ? " is-resizing" : ""}`}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${columnLabels[column]} column`}
                    aria-valuemin={MIN_COLUMN_WIDTH}
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
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 1 }}
      >
        Select a column heading to sort. Drag headings to rearrange the table;
        use Left/Right Arrow when a heading is focused.
      </Typography>
      {filtered.length === 0 && (
        <div className="tracking-empty">
          <h2>
            {visits.length
              ? "No visits match these filters"
              : "No example visits"}
          </h2>
          <p>
            {visits.length
              ? "Try another stage or clear your search."
              : "An empty example is not evidence that the clinic has no waiting patients."}
          </p>
          {visits.length > 0 && (
            <button
              className="button"
              type="button"
              onClick={() => {
                setQuery("");
                setStage("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      <p className="tracking-caption">
        Wait = time in the current waiting stage; “in clinic” = time since
        arrival. Queue order is not clinical priority. Membership does not
        change priority. Abbreviated labels can match; always confirm identity
        in the record before care.
      </p>
    </section>
  );
}
export function OverviewView({ patientAccess }: { patientAccess: boolean }) {
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
  return <TrackingBoardView />;
}
export function Overview() {
  return <OverviewView patientAccess={useClinic().capabilities.patients} />;
}
