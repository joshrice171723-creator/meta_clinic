import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  ButtonBase,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import PeopleOutlineIcon from "@mui/icons-material/PeopleAltOutlined";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import { ClinicAppearanceScope } from "./Appearance";
import clinicFloor from "./assets/clinic-floor.png";
import { formatDisplayDateTime } from "../../shared/dateTime";
import {
  CLINIC_LOCATION_CHANGED_EVENT,
  SESSION_CHANGED_EVENT,
} from "../../api/client";
import { useClinic } from "./Workspace";
import { useClinicNavigation } from "./clinicNavigation";
import { useClinicRealtimeTopic } from "./ClinicRealtime";
import { clinicMapContextKey, loadClinicMap } from "./clinicMapApi";
import type { ClinicMapScene, ClinicMapVisit } from "./clinicMapExtraction";
import "./clinicMap.css";

type Selection = { kind: "room"; id: number } | { kind: "visit"; id: number };
export function ClinicMapPage() {
  const context = useClinic();
  const key = clinicMapContextKey(context);
  const allowed =
    context.capabilities.patients === true &&
    context.capabilities.facilities_read === true &&
    !!context.current_site;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    scene: ClinicMapScene;
  }>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const [selection, setSelection] = useState<Selection>();
  const [filter, setFilter] = useState("");
  const [assignments, setAssignments] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  useEffect(() => {
    setSelection(undefined);
    setFilter("");
    setAssignments(true);
    setStatusFilter("all");
  }, [key]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const realtime = useClinicRealtimeTopic("tracking_board", reload, {
    enabled: allowed,
    fallbackIntervalMs: 30_000,
    freshnessIntervalMs: 30_000,
  });
  const accessStopped = realtime === "authorization_required";
  useEffect(() => {
    if (!snapshot) return;
    const expiry = setTimeout(() => {
      setSnapshot(undefined);
      setSelection(undefined);
      setError("This snapshot expired. Refresh to view current records.");
    }, 60_000);
    return () => clearTimeout(expiry);
  }, [snapshot]);
  useEffect(() => {
    const invalidate = () => {
      abort.current?.abort();
      setSnapshot(undefined);
      setLoading(false);
      setSelection(undefined);
      setError(
        "Clinic access or location changed. Reopen the workspace to reconnect.",
      );
    };
    window.addEventListener(SESSION_CHANGED_EVENT, invalidate);
    window.addEventListener(CLINIC_LOCATION_CHANGED_EVENT, invalidate);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, invalidate);
      window.removeEventListener(CLINIC_LOCATION_CHANGED_EVENT, invalidate);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    setSnapshot((previous) =>
      allowed && !accessStopped && previous?.key === key ? previous : undefined,
    );
    setError("");
    setLoading(allowed && !accessStopped);
    if (allowed && !accessStopped) {
      loadClinicMap(context, controller.signal)
        .then((scene) => {
          if (controller.signal.aborted) return;
          setSnapshot({ key, scene });
          setLoading(false);
          setError("");
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          controller.abort();
          setLoading(false);
          setSnapshot(undefined);
          setError(
            reason instanceof Error
              ? reason.message
              : "The clinic map could not load.",
          );
        });
    }
    return () => {
      controller.abort();
    };
    // The key includes actor, practice, location, membership, policy and capabilities.
  }, [key, revision, allowed, accessStopped]);
  const scene =
    allowed && !accessStopped && snapshot?.key === key
      ? snapshot.scene
      : undefined;
  return (
    <ClinicAppearanceScope
      preferences={{ palette: "juniper", mode: "light" }}
      systemDark={false}
    >
      <section className="clinic-map-page" aria-labelledby="clinic-map-title">
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          <div>
            <span className="clinic-map-eyebrow">
              {context.current_site?.name ||
                context.current_site?.code ||
                "Clinic"}{" "}
              / Clinic floor
            </span>
            <Typography component="h1" variant="h4" id="clinic-map-title">
              A little perspective on the day.
            </Typography>
            <Typography color="text.secondary">
              One floor.{" "}
              {scene?.rooms.filter((room) => room.kind === "physical").length ??
                "—"}{" "}
              rooms. A different way to see the flow.
            </Typography>
          </div>
          <div className="clinic-map-freshness">
            {scene && (
              <span>
                Snapshot{" "}
                <strong>
                  {formatDisplayDateTime(scene.asOf, {
                    timeZone: scene.timezone,
                  })}
                </strong>
              </span>
            )}
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              disabled={!allowed || loading || accessStopped}
              onClick={reload}
            >
              Refresh map
            </Button>
          </div>
        </Stack>
        {!allowed ? (
          <Alert severity="info">
            Select a location with room and tracking board access to open its
            clinic map.
          </Alert>
        ) : accessStopped ? (
          <Alert severity="warning">
            Clinic access changed. Reopen the workspace to reconnect.
          </Alert>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : loading && !scene ? (
          <Typography role="status">
            Loading rooms and recorded visits…
          </Typography>
        ) : null}
        {scene && (
          <ClinicMapView
            scene={scene}
            selection={selection}
            onSelect={setSelection}
            filter={filter}
            onFilter={setFilter}
            assignments={assignments}
            onAssignments={setAssignments}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            canOpenEncounter={context.capabilities.encounters === true}
          />
        )}
      </section>
    </ClinicAppearanceScope>
  );
}

export function ClinicMapView({
  scene,
  selection,
  onSelect,
  filter,
  onFilter,
  assignments,
  onAssignments,
  statusFilter,
  onStatusFilter,
  canOpenEncounter,
}: {
  scene: ClinicMapScene;
  selection?: Selection;
  onSelect: (value: Selection) => void;
  filter: string;
  onFilter: (value: string) => void;
  assignments: boolean;
  onAssignments: (value: boolean) => void;
  statusFilter: string;
  onStatusFilter: (value: string) => void;
  canOpenEncounter: boolean;
}) {
  const { navigate } = useClinicNavigation();
  const physical = scene.rooms.filter((room) => room.kind === "physical");
  const allVisits = [
    ...scene.rooms.flatMap((room) => room.visits),
    ...scene.waiting,
    ...scene.unplaced,
  ];
  const selectedVisit =
    selection?.kind === "visit"
      ? allVisits.find((visit) => visit.id === selection.id)
      : undefined;
  const selectedRoom =
    selection?.kind === "room"
      ? scene.rooms.find((room) => room.id === selection.id)
      : selectedVisit
        ? scene.rooms.find((room) => room.id === selectedVisit.roomId)
        : physical[0];
  const matches = (room: ClinicMapScene["rooms"][number]) =>
    room.label
      .toLocaleLowerCase()
      .includes(filter.trim().toLocaleLowerCase()) &&
    (statusFilter === "all" ||
      (statusFilter === "assigned"
        ? room.visits.length > 0
        : room.visits.length === 0));
  const matchingRooms = scene.rooms.filter(matches);
  const assigned = physical.filter((room) => room.visits.length > 0).length;
  const staffAssignments = scene.rooms.flatMap((room) =>
    room.visits.flatMap((visit) => [
      ...(visit.provider
        ? [
            {
              name: visit.provider,
              role: "Provider",
              room: room.label,
              visit: visit.id,
            },
          ]
        : []),
      ...(visit.intakeOwner
        ? [
            {
              name: visit.intakeOwner,
              role: "Intake owner",
              room: room.label,
              visit: visit.id,
            },
          ]
        : []),
    ]),
  );
  // ponytail: six decorative rooms per illustration; additional records use another panel and the same worklist.
  const floorGroups = Array.from(
    { length: Math.ceil(physical.length / 6) },
    (_, index) => physical.slice(index * 6, index * 6 + 6),
  );
  const anchors = [
    [43, 34],
    [60, 49],
    [77, 63],
    [25, 52],
    [43, 67],
    [60, 81],
  ];
  const visitButton = (visit: ClinicMapVisit) => (
    <Button
      key={visit.id}
      className="clinic-map-visit"
      variant="text"
      aria-pressed={selection?.kind === "visit" && selection.id === visit.id}
      onClick={() => onSelect({ kind: "visit", id: visit.id })}
    >
      {visit.reference} · {visit.stage}
    </Button>
  );
  const roomStatus = (room: ClinicMapScene["rooms"][number]) =>
    room.visits.length ? "Visit assigned" : "No visit assigned";
  return (
    <>
      {scene.partial && (
        <Alert severity="warning">
          Partial snapshot. Counts describe loaded records only.
        </Alert>
      )}
      <div className="clinic-map-summary" role="status">
        {[
          [
            assigned,
            "Rooms with visits",
            "Recorded assignments",
            <MeetingRoomOutlinedIcon />,
          ],
          [
            physical.length - assigned,
            "Rooms without visits",
            "No assignment recorded",
            <CheckOutlinedIcon />,
          ],
          [
            scene.waiting.length,
            "Waiting visits",
            "Recorded waiting stage",
            <AccessTimeOutlinedIcon />,
          ],
          [
            scene.visitCount,
            "Open visits",
            "In this snapshot",
            <PeopleOutlineIcon />,
          ],
        ].map(([count, label, note, icon]) => (
          <Paper
            variant="outlined"
            className="clinic-map-stat"
            key={String(label)}
          >
            <strong>{count}</strong>
            <div>
              <span>{label}</span>
              <small>{note}</small>
            </div>
            <span className="clinic-map-stat-icon">{icon}</span>
          </Paper>
        ))}
      </div>
      <div className="clinic-map-workspace">
        <Paper variant="outlined" className="clinic-map-floor-panel">
          <div className="clinic-map-panel-heading">
            <div>
              <span className="clinic-map-eyebrow">The space</span>
              <Typography component="h2" variant="h6">
                Clinic floor
              </Typography>
            </div>
            <span className="clinic-map-level">{scene.siteName}</span>
          </div>
          {physical.length === 0 ? (
            <div className="clinic-map-empty">
              No physical rooms are configured for this location.
            </div>
          ) : (
            floorGroups.map((rooms, groupIndex) => (
              <div
                className="clinic-map-diorama"
                key={rooms[0].id}
                aria-label={`Clinic floor, room group ${groupIndex + 1}`}
              >
                <img
                  src={clinicFloor}
                  alt=""
                  className="clinic-map-floor-art"
                />
                {rooms.map((room, index) => (
                  <ButtonBase
                    key={room.id}
                    className={`clinic-map-room${selectedRoom?.id === room.id ? " is-selected" : ""}${room.visits.length ? " has-visits" : ""}`}
                    style={{
                      left: `${anchors[index][0]}%`,
                      top: `${anchors[index][1]}%`,
                    }}
                    disabled={!matches(room)}
                    aria-pressed={selectedRoom?.id === room.id}
                    aria-label={`${room.label}, ${room.visits.length} recorded visits`}
                    onClick={() => onSelect({ kind: "room", id: room.id })}
                  >
                    <strong>
                      {String(groupIndex * 6 + index + 1).padStart(2, "0")} /{" "}
                      {room.label}
                    </strong>
                    {assignments && (
                      <span>
                        {room.visits.length
                          ? `${room.visits.length} assigned`
                          : "No visit assigned"}
                      </span>
                    )}
                  </ButtonBase>
                ))}
              </div>
            ))
          )}
          <div className="clinic-map-floor-footer">
            <span>
              <span className="clinic-map-dot" /> Visit assigned
            </span>
            <span>No assignment recorded</span>
            <span className="clinic-map-keyboard">
              Select a room · Tab + Enter
            </span>
          </div>
          <div className="clinic-map-floor-note">
            Schematic illustration · room order, furniture and physical
            occupancy are not surveyed.
          </div>
        </Paper>
        <Paper
          variant="outlined"
          className="clinic-map-detail"
          aria-labelledby="map-detail-title"
        >
          <div className="clinic-map-selected-heading">
            <div>
              <span className="clinic-map-eyebrow">
                {selectedVisit ? "Selected visit" : "Selected room"}
              </span>
              <Typography component="h2" variant="h6" id="map-detail-title">
                {selectedVisit
                  ? selectedVisit.reference
                  : selectedRoom?.label || "Explore the clinic"}
              </Typography>
            </div>
            {selectedRoom && (
              <span className="clinic-map-room-number">
                {String(scene.rooms.indexOf(selectedRoom) + 1).padStart(2, "0")}
              </span>
            )}
          </div>
          {selectedRoom && !selectedVisit && (
            <>
              <Chip
                size="small"
                variant="outlined"
                label={roomStatus(selectedRoom)}
                className={
                  selectedRoom.visits.length ? "clinic-map-assigned-tag" : ""
                }
              />
              <p className="clinic-map-detail-caption">
                {selectedRoom.kind === "physical"
                  ? "Physical room"
                  : "Telehealth resource"}{" "}
                · {scene.siteName}
              </p>
              <dl className="clinic-map-facts">
                <dt>Recorded visits</dt>
                <dd>{selectedRoom.visits.length}</dd>
                <dt>Visit stage</dt>
                <dd>
                  {selectedRoom.visits.length
                    ? [
                        ...new Set(
                          selectedRoom.visits.map((visit) => visit.stage),
                        ),
                      ].join(" · ")
                    : "No visit assigned"}
                </dd>
                <dt>Assigned staff</dt>
                <dd>
                  {[
                    ...new Set(
                      selectedRoom.visits
                        .flatMap((visit) => [visit.provider, visit.intakeOwner])
                        .filter(Boolean),
                    ),
                  ].join(", ") || "Not recorded"}
                </dd>
                <dt>Room readiness</dt>
                <dd>Not recorded</dd>
              </dl>
              <Stack sx={{ gap: 1 }}>
                {selectedRoom.visits.map(visitButton)}
              </Stack>
            </>
          )}
          {selectedVisit && (
            <>
              <Chip
                size="small"
                variant="outlined"
                label={selectedVisit.stage}
              />
              <dl className="clinic-map-facts">
                <dt>Patient</dt>
                <dd>{selectedVisit.patientName}</dd>
                <dt>Reference</dt>
                <dd>{selectedVisit.reference}</dd>
                <dt>Room</dt>
                <dd>
                  {selectedRoom?.label ||
                    (selectedVisit.roomId === null
                      ? "Not assigned"
                      : "Outside loaded catalog")}
                </dd>
                <dt>Provider</dt>
                <dd>{selectedVisit.provider || "Not assigned"}</dd>
                <dt>Intake owner</dt>
                <dd>{selectedVisit.intakeOwner || "Not recorded"}</dd>
              </dl>
              {canOpenEncounter && (
                <Button
                  variant="contained"
                  onClick={() =>
                    navigate(
                      `/clinic/patients/${selectedVisit.patientId}/encounters/${selectedVisit.id}`,
                    )
                  }
                >
                  Open encounter
                </Button>
              )}
            </>
          )}
          {!selectedRoom && !selectedVisit && (
            <Typography color="text.secondary">
              Select a room or visit to inspect its details.
            </Typography>
          )}
          <div className="clinic-map-staff">
            <Typography component="h3" variant="h6">
              Recorded staff assignments
            </Typography>
            {staffAssignments.length ? (
              staffAssignments.map((staff, index) => (
                <div
                  className="clinic-map-staff-row"
                  key={`${staff.visit}-${index}`}
                >
                  <Avatar
                    sx={{
                      width: 30,
                      height: 30,
                      fontSize: 11,
                      bgcolor: "#e9eee5",
                      color: "#334f48",
                    }}
                  >
                    {staff.name
                      .split(/\s+/)
                      .map((name) => name[0])
                      .slice(0, 2)
                      .join("")}
                  </Avatar>
                  <div>
                    <strong>{staff.name}</strong>
                    <small>{staff.role}</small>
                  </div>
                  <span>{staff.room}</span>
                </div>
              ))
            ) : (
              <p>No staff assignments recorded in these rooms.</p>
            )}
          </div>
        </Paper>
      </div>
      <Paper variant="outlined" className="clinic-map-worklist">
        <div className="clinic-map-panel-heading">
          <div>
            <span className="clinic-map-eyebrow">The companion view</span>
            <Typography component="h2" variant="h6">
              Room worklist
            </Typography>
            <p>Room order · recorded visits and assignments</p>
          </div>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
            <TextField
              size="small"
              label="Find a room"
              value={filter}
              onChange={(event) => onFilter(event.target.value)}
              sx={{ width: 160 }}
            />
            <TextField
              size="small"
              label="Show rooms"
              select
              slotProps={{ select: { native: true } }}
              value={statusFilter}
              onChange={(event) => onStatusFilter(event.target.value)}
              sx={{ width: 180 }}
            >
              <option value="all">All assignments</option>
              <option value="assigned">With visits</option>
              <option value="unassigned">Without visits</option>
            </TextField>
          </Stack>
        </div>
        <TableContainer>
          <Table size="small" aria-label="Room worklist">
            <TableHead>
              <TableRow>
                <TableCell>Room</TableCell>
                <TableCell>Recorded visits</TableCell>
                <TableCell>Visit / room status</TableCell>
                <TableCell>Assigned staff</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {matchingRooms.map((room) => (
                <TableRow key={room.id} selected={selectedRoom?.id === room.id}>
                  <TableCell component="th" scope="row">
                    <Button
                      variant="text"
                      onClick={() => onSelect({ kind: "room", id: room.id })}
                    >
                      {room.label}
                      <ArrowForwardOutlinedIcon sx={{ fontSize: 14, ml: 1 }} />
                    </Button>
                    {room.kind === "telehealth" && <small>Telehealth</small>}
                  </TableCell>
                  <TableCell>{room.visits.length}</TableCell>
                  <TableCell>
                    {room.visits.length ? (
                      <Stack sx={{ gap: 0.5 }}>
                        {room.visits.map(visitButton)}
                      </Stack>
                    ) : (
                      <Chip
                        label="No visit assigned"
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {[
                      ...new Set(
                        room.visits
                          .flatMap((visit) => [
                            visit.provider,
                            visit.intakeOwner,
                          ])
                          .filter(Boolean),
                      ),
                    ].join(", ") || "Not recorded"}
                  </TableCell>
                </TableRow>
              ))}
              {!matchingRooms.length && (
                <TableRow>
                  <TableCell colSpan={4}>
                    No rooms match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <div className="clinic-map-worklist-footer">
          <span>
            {matchingRooms.length} of {scene.rooms.length} rooms shown
          </span>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={assignments}
                onChange={(_, value) => onAssignments(value)}
              />
            }
            label="Show map assignments"
          />
        </div>
      </Paper>
      <div className="clinic-map-queues">
        <Paper variant="outlined" className="clinic-map-queue">
          <span className="clinic-map-eyebrow">Waiting area</span>
          <Typography component="h2" variant="h6">
            Waiting visits · {scene.waiting.length}
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mt: 1 }}>
            {scene.waiting.length ? (
              scene.waiting.map(visitButton)
            ) : (
              <Typography color="text.secondary">
                No waiting visits recorded.
              </Typography>
            )}
          </Stack>
        </Paper>
        <Paper variant="outlined" className="clinic-map-queue">
          <span className="clinic-map-eyebrow">Other open visits</span>
          <Typography component="h2" variant="h6">
            Without a room in this view · {scene.unplaced.length}
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mt: 1 }}>
            {scene.unplaced.length ? (
              scene.unplaced.map(visitButton)
            ) : (
              <Typography color="text.secondary">
                No other open visits in this snapshot.
              </Typography>
            )}
          </Stack>
        </Paper>
      </div>
    </>
  );
}
