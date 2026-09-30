import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, SESSION_CHANGED_EVENT } from "../../api/client";
import { useResource } from "../../shared/ui";

type Resource = {
  id: number;
  name: string;
  kind: "chair" | "equipment";
  room_id: number | null;
  active: boolean;
  version: number;
};
type Policy = {
  service_offering_id: number;
  revision: number;
  mode: "not_required" | "required";
  chair_ids: number[];
  equipment_ids: number[];
};
type CompatibilityData = {
  can_write: boolean;
  resources: Resource[];
  rooms: { id: number; code: string }[];
  service_offerings: { id: number; name: string }[];
  policies: Policy[];
};
type Editor =
  | {
      type: "resource";
      id: number | null;
      expectedVersion: number;
      name: string;
      kind: Resource["kind"];
      roomId: number | null;
      active: boolean;
      stale: boolean;
    }
  | {
      type: "policy";
      id: number;
      name: string;
      expectedRevision: number;
      mode: Policy["mode"] | "";
      chairIds: number[];
      equipmentIds: number[];
      stale: boolean;
    };
type Attempt = {
  method: "POST" | "PATCH" | "PUT";
  path: string;
  body: Record<string, unknown>;
};

// Remount transient state immediately when the owning site changes.
export function SchedulingCompatibilitySettings({
  siteId,
}: {
  siteId: number;
}) {
  const currentSite = useRef(siteId);
  currentSite.current = siteId;
  return (
    <SiteCompatibilitySettings
      key={siteId}
      siteId={siteId}
      isCurrentSite={() => currentSite.current === siteId}
    />
  );
}

function SiteCompatibilitySettings({
  siteId,
  isCurrentSite,
}: {
  siteId: number;
  isCurrentSite: () => boolean;
}) {
  const path = `/api/clinic/facilities/${siteId}/resource_compatibility`;
  const {
    data,
    error: loadError,
    refresh,
  } = useResource<CompatibilityData>(path, { retainDataOnRefresh: true });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState<Attempt | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success" | "warning";
    text: string;
  } | null>(null);
  const [sessionChanged, setSessionChanged] = useState(false);
  const [awaitingReload, setAwaitingReload] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const reloadBaseline = useRef<CompatibilityData | undefined>(undefined);
  const sessionInvalid = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const invalidate = () => {
      sessionInvalid.current = true;
      setSessionChanged(true);
      setEditor(null);
      setRetryAttempt(null);
      setFeedback(null);
    };
    window.addEventListener(SESSION_CHANGED_EVENT, invalidate);
    return () => {
      mounted.current = false;
      window.removeEventListener(SESSION_CHANGED_EVENT, invalidate);
    };
  }, []);

  useEffect(() => {
    if (data && data !== reloadBaseline.current) setAwaitingReload(false);
  }, [data]);

  const canManage = data?.can_write === true && !sessionChanged;
  const locked = busy || retryAttempt !== null || awaitingReload;
  const editorDisabled = locked || !canManage;
  const activeContext = () =>
    mounted.current && isCurrentSite() && !sessionInvalid.current;
  const reload = () => {
    reloadBaseline.current = data;
    setAwaitingReload(true);
    refresh();
  };

  const perform = async (attempt: Attempt) => {
    if (!activeContext() || !canManage || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await api(attempt.path, { method: attempt.method, body: attempt.body });
      if (!activeContext()) return;
      setRetryAttempt(null);
      setEditor(null);
      setFeedback({ tone: "success", text: "Scheduling compatibility saved." });
      reload();
    } catch (reason) {
      if (!activeContext()) return;
      if (reason instanceof ApiError && reason.code === "session_changed") {
        sessionInvalid.current = true;
        setSessionChanged(true);
        setEditor(null);
        setRetryAttempt(null);
      } else if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        reason.status !== 408 &&
        reason.code !== "outcome_unconfirmed"
      ) {
        setRetryAttempt(null);
        setFeedback({ tone: "error", text: reason.message });
        if (reason.status === 409) {
          setEditor((current) => current && { ...current, stale: true });
          reload();
        }
      } else {
        setRetryAttempt(attempt);
        setFeedback({
          tone: "error",
          text: "The save outcome is unknown. Retry this exact change before making another change. Your inputs are retained.",
        });
      }
    } finally {
      inFlight.current = false;
      if (activeContext()) setBusy(false);
    }
  };

  const openResource = (resource?: Resource) => {
    if (!canManage || locked) return;
    setFeedback(null);
    setEditor({
      type: "resource",
      id: resource?.id ?? null,
      expectedVersion: resource?.version ?? 0,
      name: resource?.name ?? "",
      kind: resource?.kind ?? "chair",
      roomId: resource?.room_id ?? null,
      active: resource?.active ?? true,
      stale: false,
    });
  };

  const openPolicy = (service: { id: number; name: string }) => {
    if (!canManage || locked) return;
    const policy = data?.policies.find(
      (item) => item.service_offering_id === service.id,
    );
    setFeedback(null);
    setEditor({
      type: "policy",
      id: service.id,
      name: service.name,
      expectedRevision: policy?.revision ?? 0,
      mode: policy?.mode ?? "",
      chairIds: [...(policy?.chair_ids ?? [])],
      equipmentIds: [...(policy?.equipment_ids ?? [])],
      stale: false,
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!editor || editorDisabled || editor.stale || !activeContext()) return;
    const requestKey = crypto.randomUUID();
    if (editor.type === "resource") {
      if (!editor.name.trim()) return;
      void perform({
        method: editor.id === null ? "POST" : "PATCH",
        path: editor.id === null ? path : `${path}/resources/${editor.id}`,
        body: {
          resource: {
            name: editor.name.trim(),
            kind: editor.kind,
            room_id: editor.roomId,
            request_key: requestKey,
            ...(editor.id === null
              ? {}
              : {
                  active: editor.active,
                  expected_version: editor.expectedVersion,
                }),
          },
        },
      });
    } else {
      if (
        !editor.mode ||
        (editor.mode === "required" &&
          editor.chairIds.length + editor.equipmentIds.length === 0)
      )
        return;
      void perform({
        method: "PUT",
        path: `${path}/services/${editor.id}`,
        body: {
          compatibility: {
            expected_revision: editor.expectedRevision,
            mode: editor.mode,
            chair_ids: editor.mode === "required" ? editor.chairIds : [],
            equipment_ids:
              editor.mode === "required" ? editor.equipmentIds : [],
            request_key: requestKey,
          },
        },
      });
    }
  };

  const reviewLatest = () => {
    if (!editor || !data || editorDisabled) return;
    if (editor.type === "resource") {
      const current = data.resources.find((item) => item.id === editor.id);
      if (!current) return;
      setEditor({ ...editor, expectedVersion: current.version, stale: false });
    } else {
      const current = data.policies.find(
        (item) => item.service_offering_id === editor.id,
      );
      setEditor({
        ...editor,
        expectedRevision: current?.revision ?? 0,
        stale: false,
      });
    }
    setFeedback({
      tone: "warning",
      text: "Your unsaved inputs are retained against the latest version. Review them before saving again.",
    });
  };

  const resourceLabel = (id: number) => {
    const resource = data?.resources.find((item) => item.id === id);
    return resource
      ? `${resource.name}${resource.active ? "" : " (retired)"}`
      : `Unavailable resource #${id}`;
  };
  const policySummary = (policy?: Policy) => {
    if (!policy) return "Unconfigured";
    if (policy.mode === "not_required") return "No chair or equipment required";
    const chairs = policy.chair_ids.map(resourceLabel).join(", ");
    const equipment = policy.equipment_ids.map(resourceLabel).join(", ");
    return [
      chairs && `One chair: ${chairs}`,
      equipment && `All equipment: ${equipment}`,
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const feedbackAlert = feedback && (
    <Alert
      severity={feedback.tone}
      action={
        retryAttempt ? (
          <Button
            color="inherit"
            size="small"
            disabled={busy || !canManage}
            onClick={() => void perform(retryAttempt)}
          >
            Retry exact change
          </Button>
        ) : undefined
      }
    >
      {feedback.text}
    </Alert>
  );

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={1}>
          <Typography variant="h2">Scheduling compatibility</Typography>
          <Typography color="text.secondary">
            Site #{siteId} · Configure chairs, equipment, and the services they
            support. Suitability is recorded only from your selections.
          </Typography>
        </Stack>
      </Paper>
      {sessionChanged && (
        <Alert severity="warning">
          Your session changed. Reopen these settings before continuing.
        </Alert>
      )}
      {!editor && feedbackAlert}
      {loadError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={reload} disabled={busy}>
              Reload
            </Button>
          }
        >
          {loadError} Your unsaved inputs remain in the editor.
        </Alert>
      )}
      {!data && !loadError && (
        <Typography role="status">Loading scheduling compatibility…</Typography>
      )}
      {awaitingReload && data && (
        <Typography role="status">
          Reloading the saved configuration…
        </Typography>
      )}
      {data && !sessionChanged && (
        <>
          {!data.can_write && (
            <Alert severity="info">
              You can view this site's configuration. Editing access is required
              to save changes.
            </Alert>
          )}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              sx={{
                justifyContent: "space-between",
                alignItems: { sm: "center" },
              }}
            >
              <Typography variant="h3">Chairs and equipment</Typography>
              {canManage && (
                <Button
                  variant="outlined"
                  disabled={locked}
                  onClick={() => openResource()}
                >
                  Add resource
                </Button>
              )}
            </Stack>
          </Paper>
          <TableContainer component={Paper} variant="outlined">
            <Table
              aria-label={`Resources at site ${siteId}`}
              sx={{ minWidth: 600 }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>Resource</TableCell>
                  <TableCell>Room</TableCell>
                  <TableCell>Status</TableCell>
                  {canManage && <TableCell>Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.resources.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canManage ? 4 : 3}>
                      No chairs or equipment have been configured.
                    </TableCell>
                  </TableRow>
                )}
                {data.resources.map((resource) => (
                  <TableRow key={resource.id}>
                    <TableCell sx={{ overflowWrap: "anywhere" }}>
                      <Typography>{resource.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {resource.kind} · Version {resource.version}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {resource.room_id === null
                        ? "No fixed room"
                        : (data.rooms.find(
                            (room) => room.id === resource.room_id,
                          )?.code ?? `Unavailable room #${resource.room_id}`)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={resource.active ? "Active" : "Retired"}
                      />
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <Button
                          disabled={locked}
                          onClick={() => openResource(resource)}
                        >
                          Edit{resource.active ? " / retire" : " / reactivate"}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h3">Service compatibility</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Choose one available chair from the compatible alternatives. Every
              selected equipment item is required. Unconfigured services have no
              saved compatibility decision.
            </Typography>
          </Paper>
          <TableContainer component={Paper} variant="outlined">
            <Table
              aria-label={`Service compatibility at site ${siteId}`}
              sx={{ minWidth: 600 }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>Service</TableCell>
                  <TableCell>Saved configuration</TableCell>
                  {canManage && <TableCell>Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.service_offerings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canManage ? 3 : 2}>
                      No service offerings are available at this site.
                    </TableCell>
                  </TableRow>
                )}
                {data.service_offerings.map((service) => {
                  const policy = data.policies.find(
                    (item) => item.service_offering_id === service.id,
                  );
                  return (
                    <TableRow key={service.id}>
                      <TableCell sx={{ overflowWrap: "anywhere" }}>
                        {service.name}
                      </TableCell>
                      <TableCell sx={{ overflowWrap: "anywhere" }}>
                        <Typography>{policySummary(policy)}</Typography>
                        {policy && (
                          <Typography variant="body2" color="text.secondary">
                            Revision {policy.revision}
                          </Typography>
                        )}
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <Button
                            disabled={locked}
                            onClick={() => openPolicy(service)}
                          >
                            {policy ? "Edit compatibility" : "Configure"}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
      <Dialog
        open={editor !== null}
        onClose={() => !locked && setEditor(null)}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={submit}>
          <DialogTitle>
            {editor?.type === "resource"
              ? editor.id === null
                ? "Add scheduling resource"
                : "Edit scheduling resource"
              : "Configure service compatibility"}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography color="text.secondary">
                Site #{siteId} · Unsaved changes
              </Typography>
              {feedbackAlert}
              {loadError && (
                <Alert
                  severity="warning"
                  action={
                    <Button color="inherit" disabled={busy} onClick={reload}>
                      Reload
                    </Button>
                  }
                >
                  The latest configuration could not be loaded. Reload to resume
                  saving.
                </Alert>
              )}
              {editor?.stale && (
                <Alert
                  severity="warning"
                  action={
                    <Button
                      color="inherit"
                      disabled={editorDisabled}
                      onClick={reviewLatest}
                    >
                      Use latest version
                    </Button>
                  }
                >
                  This configuration changed before your save. Your inputs are
                  retained. Review the latest saved configuration below, then
                  use its version to save your draft.
                </Alert>
              )}
              {editor?.type === "resource" && (
                <>
                  <Typography variant="body2" color="text.secondary">
                    {editor.id === null
                      ? "New resource"
                      : `Editing version ${editor.expectedVersion}`}
                  </Typography>
                  {editor.stale &&
                    data &&
                    (() => {
                      const latest = data.resources.find(
                        (item) => item.id === editor.id,
                      );
                      return (
                        <Typography variant="body2">
                          Latest saved resource:{" "}
                          {latest
                            ? `${latest.name} · ${latest.kind} · ${latest.active ? "Active" : "Retired"} · ${latest.room_id === null ? "No fixed room" : (data.rooms.find((room) => room.id === latest.room_id)?.code ?? `Room #${latest.room_id}`)} · Version ${latest.version}`
                            : "Unavailable"}
                        </Typography>
                      );
                    })()}
                  <TextField
                    label="Resource name"
                    value={editor.name}
                    required
                    disabled={editorDisabled}
                    onChange={(event) =>
                      setEditor({ ...editor, name: event.target.value })
                    }
                  />
                  <TextField
                    select
                    label="Resource kind"
                    value={editor.kind}
                    disabled={editorDisabled}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        kind: event.target.value as Resource["kind"],
                      })
                    }
                  >
                    <MenuItem value="chair">Chair</MenuItem>
                    <MenuItem value="equipment">Equipment</MenuItem>
                  </TextField>
                  <TextField
                    select
                    label="Fixed room"
                    value={editor.roomId ?? ""}
                    disabled={editorDisabled}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        roomId:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                    helperText="Leave unassigned when the resource has no fixed room."
                  >
                    <MenuItem value="">No fixed room</MenuItem>
                    {(data?.rooms ?? []).map((room) => (
                      <MenuItem key={room.id} value={room.id}>
                        {room.code}
                      </MenuItem>
                    ))}
                    {editor.roomId !== null &&
                      !data?.rooms.some(
                        (room) => room.id === editor.roomId,
                      ) && (
                        <MenuItem value={editor.roomId} disabled>
                          Unavailable room #{editor.roomId}
                        </MenuItem>
                      )}
                  </TextField>
                  {editor.id !== null && (
                    <TextField
                      select
                      label="Resource status"
                      value={editor.active ? "active" : "retired"}
                      disabled={editorDisabled}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          active: event.target.value === "active",
                        })
                      }
                      helperText="Retirement keeps historical references and existing service selections. Reactivate to make the resource available again."
                    >
                      <MenuItem value="active">Active</MenuItem>
                      <MenuItem value="retired">Retired</MenuItem>
                    </TextField>
                  )}
                </>
              )}
              {editor?.type === "policy" && (
                <>
                  <Typography sx={{ fontWeight: 650 }}>
                    {editor.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {editor.expectedRevision === 0
                      ? "No saved policy · Unconfigured"
                      : `Editing revision ${editor.expectedRevision}`}
                  </Typography>
                  {editor.stale && (
                    <Typography variant="body2">
                      Latest saved configuration:{" "}
                      {policySummary(
                        data?.policies.find(
                          (item) => item.service_offering_id === editor.id,
                        ),
                      )}
                    </Typography>
                  )}
                  <TextField
                    select
                    label="Chair and equipment requirement"
                    value={editor.mode}
                    required
                    disabled={editorDisabled}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        mode: event.target.value as Policy["mode"],
                      })
                    }
                  >
                    <MenuItem value="" disabled>
                      Choose a requirement
                    </MenuItem>
                    <MenuItem value="not_required">
                      No chair or equipment required
                    </MenuItem>
                    <MenuItem value="required">
                      Compatible resources required
                    </MenuItem>
                  </TextField>
                  {editor.mode === "required" && (
                    <>
                      <ResourceChoices
                        kind="chair"
                        label="Compatible chair alternatives"
                        ids={editor.chairIds}
                        resources={data?.resources ?? []}
                        disabled={editorDisabled}
                        onChange={(chairIds) =>
                          setEditor({ ...editor, chairIds })
                        }
                        helperText="Scheduling must use one available chair from these alternatives."
                      />
                      <ResourceChoices
                        kind="equipment"
                        label="Required equipment"
                        ids={editor.equipmentIds}
                        resources={data?.resources ?? []}
                        disabled={editorDisabled}
                        onChange={(equipmentIds) =>
                          setEditor({ ...editor, equipmentIds })
                        }
                        helperText="Scheduling must use every selected equipment item."
                      />
                      {editor.chairIds.length + editor.equipmentIds.length ===
                        0 && (
                        <Alert severity="warning">
                          Select at least one chair or equipment item to save a
                          required policy.
                        </Alert>
                      )}
                    </>
                  )}
                  {editor.mode === "not_required" && (
                    <Typography color="text.secondary">
                      Saving this decision records no chair or equipment
                      requirement for this service at this site.
                    </Typography>
                  )}
                </>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button disabled={locked} onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={
                editorDisabled ||
                !editor ||
                editor.stale ||
                (editor.type === "resource"
                  ? !editor.name.trim()
                  : !editor.mode ||
                    (editor.mode === "required" &&
                      editor.chairIds.length + editor.equipmentIds.length ===
                        0))
              }
            >
              {busy ? "Saving…" : "Save configuration"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}

function ResourceChoices({
  kind,
  label,
  ids,
  resources,
  disabled,
  onChange,
  helperText,
}: {
  kind: Resource["kind"];
  label: string;
  ids: number[];
  resources: Resource[];
  disabled: boolean;
  onChange: (ids: number[]) => void;
  helperText: string;
}) {
  const options = resources
    .filter((resource) => resource.kind === kind)
    .map((resource) => resource.id);
  for (const id of ids) if (!options.includes(id)) options.push(id);
  return (
    <Autocomplete
      multiple
      disableCloseOnSelect
      options={options}
      value={ids}
      disabled={disabled}
      getOptionLabel={(id) => {
        const resource = resources.find(
          (item) => item.id === id && item.kind === kind,
        );
        return resource
          ? `${resource.name}${resource.active ? "" : " (retired)"}`
          : `Unavailable ${kind} #${id}`;
      }}
      getOptionDisabled={(id) =>
        !resources.some(
          (item) => item.id === id && item.kind === kind && item.active,
        )
      }
      onChange={(_event, selected) => onChange(selected)}
      renderInput={(params) => (
        <TextField {...params} label={label} helperText={helperText} />
      )}
    />
  );
}
