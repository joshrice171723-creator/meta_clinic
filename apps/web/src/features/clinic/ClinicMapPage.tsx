import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  ButtonBase,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
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
  useEffect(() => {
    setSelection(undefined);
    setFilter("");
    setAssignments(true);
  }, [key]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const realtime = useClinicRealtimeTopic("tracking_board", reload, {
    enabled: allowed,
    fallbackIntervalMs: 30_000,
    freshnessIntervalMs: 30_000,
  });
  const accessStopped = realtime === "authorization_required";
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
    setSnapshot(undefined);
    setError("");
    setLoading(allowed && !accessStopped);
    let expiry: ReturnType<typeof setTimeout> | undefined;
    if (allowed && !accessStopped) {
      loadClinicMap(context, controller.signal)
        .then((scene) => {
          if (controller.signal.aborted) return;
          setSnapshot({ key, scene });
          setLoading(false);
          expiry = setTimeout(() => {
            setSnapshot(undefined);
            setSelection(undefined);
            setError("This snapshot expired. Refresh to view current records.");
          }, 60_000);
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
      clearTimeout(expiry);
    };
    // The key includes actor, practice, location, membership, policy and capabilities.
  }, [key, revision, allowed, accessStopped]);
  const scene =
    allowed && !accessStopped && snapshot?.key === key
      ? snapshot.scene
      : undefined;
  return (
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
          <Typography component="h1" variant="h4" id="clinic-map-title">
            Clinic map
          </Typography>
          <Typography color="text.secondary">
            {context.current_site?.name ||
              context.current_site?.code ||
              "Choose a clinic location"}{" "}
            · 2D floor view
          </Typography>
        </div>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          disabled={!allowed || loading || accessStopped}
          onClick={reload}
        >
          Refresh map
        </Button>
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
      ) : loading ? (
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
          canOpenEncounter={context.capabilities.encounters === true}
        />
      )}
    </section>
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
  canOpenEncounter,
}: {
  scene: ClinicMapScene;
  selection?: Selection;
  onSelect: (value: Selection) => void;
  filter: string;
  onFilter: (value: string) => void;
  assignments: boolean;
  onAssignments: (value: boolean) => void;
  canOpenEncounter: boolean;
}) {
  const { navigate } = useClinicNavigation();
  const physical = scene.rooms.filter((room) => room.kind === "physical");
  const virtual = scene.rooms.filter((room) => room.kind === "telehealth");
  const match = (label: string) =>
    label.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase());
  const selectedRoom =
    selection?.kind === "room"
      ? scene.rooms.find((room) => room.id === selection.id)
      : undefined;
  const allVisits = [
    ...scene.rooms.flatMap((room) => room.visits),
    ...scene.waiting,
    ...scene.unplaced,
  ];
  const selectedVisit =
    selection?.kind === "visit"
      ? allVisits.find((visit) => visit.id === selection.id)
      : undefined;
  const visitButton = (visit: ClinicMapVisit) => (
    <Button
      key={visit.id}
      className="clinic-map-visit"
      variant="outlined"
      aria-pressed={selection?.kind === "visit" && selection.id === visit.id}
      onClick={() => onSelect({ kind: "visit", id: visit.id })}
    >
      Visit {visit.id} · {visit.stage}
    </Button>
  );
  const roomButton = (room: ClinicMapScene["rooms"][number]) => (
    <ButtonBase
      key={room.id}
      className={`clinic-map-room${selectedRoom?.id === room.id ? " is-selected" : ""}`}
      aria-pressed={selectedRoom?.id === room.id}
      aria-label={`${room.label}, ${room.visits.length} recorded visits`}
      onClick={() => onSelect({ kind: "room", id: room.id })}
    >
      <span className="clinic-map-room-heading">
        <MeetingRoomOutlinedIcon />
        <strong>{room.label}</strong>
      </span>
      <svg
        className="clinic-map-furniture"
        viewBox="0 0 160 70"
        aria-hidden="true"
      >
        <rect
          className="clinic-map-table"
          x="14"
          y="8"
          width="62"
          height="48"
          rx="6"
        />
        <rect
          className="clinic-map-pillow"
          x="20"
          y="14"
          width="18"
          height="36"
          rx="3"
        />
        <path className="clinic-map-table" d="M100 10h43v26h-43z" />
        <rect
          className="clinic-map-chair"
          x="110"
          y="43"
          width="22"
          height="18"
          rx="7"
        />
      </svg>
      <span className="clinic-map-room-count">
        {room.visits.length} recorded{" "}
        {room.visits.length === 1 ? "visit" : "visits"}
      </span>
      {assignments && (
        <span className="clinic-map-room-stages">
          {room.visits.length
            ? [...new Set(room.visits.map((visit) => visit.stage))].join(" · ")
            : "No assignment recorded"}
        </span>
      )}
      <span className="clinic-map-door" aria-hidden="true" />
    </ButtonBase>
  );
  return (
    <>
      {scene.partial && (
        <Alert severity="warning">
          Partial snapshot. Counts describe loaded records only; additional
          records may be available on the tracking board.
        </Alert>
      )}
      <div className="clinic-map-summary" role="status">
        <span>
          <strong>{physical.length}</strong> physical rooms
        </span>
        <span>
          <strong>{scene.waiting.length}</strong> waiting visits
        </span>
        <span>
          <strong>{scene.visitCount}</strong> open visits in snapshot
        </span>
        <span>
          Snapshot{" "}
          {formatDisplayDateTime(scene.asOf, { timeZone: scene.timezone })}
        </span>
      </div>
      <div className="clinic-map-workspace">
        <Paper variant="outlined" className="clinic-map-floor-panel">
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}
            className="clinic-map-toolbar"
          >
            <div>
              <Typography component="h2" variant="h6">
                {scene.siteName}
              </Typography>
              <Typography color="text.secondary">
                Schematic layout · room order, not physical coordinates
              </Typography>
            </div>
            <TextField
              label="Find a room"
              size="small"
              value={filter}
              onChange={(event) => onFilter(event.target.value)}
              sx={{ width: { xs: "100%", sm: 220 } }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={assignments}
                  onChange={(_, value) => onAssignments(value)}
                />
              }
              label="Show visit stages"
            />
          </Stack>
          <div className="clinic-map-floor" aria-label="Physical rooms">
            {physical.length === 0 ? (
              <Typography>
                No physical rooms are configured for this location.
              </Typography>
            ) : (
              physical
                .filter((room, index) => index % 2 === 0 && match(room.label))
                .map(roomButton)
            )}
            {physical.length > 0 &&
              !physical.some((room) => match(room.label)) && (
                <Typography>No rooms match this search.</Typography>
              )}
          </div>
          <div className="clinic-map-corridor" aria-hidden="true">
            Circulation / schematic
          </div>
          {physical.length > 1 && (
            <div
              className="clinic-map-floor clinic-map-south"
              aria-label="Physical rooms across the corridor"
            >
              {physical
                .filter((room, index) => index % 2 === 1 && match(room.label))
                .map(roomButton)}
            </div>
          )}
          <div className="clinic-map-queue">
            <Typography component="h2" variant="h6">
              Waiting area <Chip label={scene.waiting.length} size="small" />
            </Typography>
            <Typography color="text.secondary">
              Recorded waiting stage, without a room or provider. Physical
              presence is unknown.
            </Typography>
            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mt: 2 }}>
              {scene.waiting.length ? (
                scene.waiting.map(visitButton)
              ) : (
                <Typography>
                  No waiting visits recorded in this snapshot.
                </Typography>
              )}
            </Stack>
          </div>
        </Paper>
        <Paper
          variant="outlined"
          className="clinic-map-detail"
          aria-labelledby="map-detail-title"
        >
          <Typography component="h2" variant="h6" id="map-detail-title">
            {selectedRoom?.label ||
              (selectedVisit
                ? `Visit ${selectedVisit.id}`
                : "Explore the clinic")}
          </Typography>
          {!selectedRoom && !selectedVisit && (
            <Typography color="text.secondary">
              Select a room or waiting visit to inspect its recorded details.
            </Typography>
          )}
          {selectedRoom && (
            <>
              <Typography color="text.secondary">
                {selectedRoom.kind === "physical"
                  ? "Physical room"
                  : "Telehealth resource"}
              </Typography>
              <Typography className="clinic-map-detail-note">
                {selectedRoom.visits.length} recorded assignments. Occupancy and
                readiness are unknown.
              </Typography>
              <Stack sx={{ gap: 1 }}>
                {selectedRoom.visits.length ? (
                  selectedRoom.visits.map(visitButton)
                ) : (
                  <Typography>
                    No open visits are assigned to this room in the loaded
                    snapshot.
                  </Typography>
                )}
              </Stack>
            </>
          )}
          {selectedVisit && (
            <>
              <Typography color="text.secondary">
                {selectedVisit.stage}
              </Typography>
              <dl className="clinic-map-facts">
                <dt>Patient</dt>
                <dd>{selectedVisit.patientName}</dd>
                <dt>Reference</dt>
                <dd>{selectedVisit.reference}</dd>
                <dt>Room</dt>
                <dd>
                  {scene.rooms.find((room) => room.id === selectedVisit.roomId)
                    ?.label ||
                    (selectedVisit.roomId === null
                      ? "Not assigned"
                      : "Outside loaded room catalog")}
                </dd>
                <dt>Provider</dt>
                <dd>{selectedVisit.provider || "Not assigned"}</dd>
                <dt>Intake owner</dt>
                <dd>{selectedVisit.intakeOwner || "Not recorded"}</dd>
              </dl>
              {canOpenEncounter && (
                <Button
                  variant="contained"
                  disableElevation
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
        </Paper>
      </div>
      {virtual.length > 0 && (
        <Paper variant="outlined" className="clinic-map-resources">
          <Typography component="h2" variant="h6">
            Telehealth resources
          </Typography>
          <div className="clinic-map-virtual">
            {virtual.filter((room) => match(room.label)).map(roomButton)}
          </div>
        </Paper>
      )}
      <Paper variant="outlined" className="clinic-map-resources">
        <Typography component="h2" variant="h6">
          Other open visits · {scene.unplaced.length}
        </Typography>
        <Typography color="text.secondary">
          No recorded room in this floor view. A missing room does not establish
          arrival or waiting.
        </Typography>
        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mt: 2 }}>
          {scene.unplaced.length ? (
            scene.unplaced.map(visitButton)
          ) : (
            <Typography>
              No other open visits in the loaded snapshot.
            </Typography>
          )}
        </Stack>
      </Paper>
    </>
  );
}
