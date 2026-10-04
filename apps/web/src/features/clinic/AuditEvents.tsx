import { Fragment, useState } from "react";
import {
  Alert,
  Button,
  MenuItem,
  Paper,
  Pagination,
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
import { LoadState, useResource } from "../../shared/ui";
import type { Pagination as PageInfo } from "../../api/contracts";
import { useClinic } from "./Workspace";
function auditDateTime(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "Not recorded";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return "Not recorded";
  }
}

// Display labels never replace the immutable audit values used for filtering.
function auditLabel(value: string) {
  const words = value.replace(/[._-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Not recorded";
}

function auditAction(code: string) {
  const parts = code.split(".");
  const operation = parts.pop() ?? "";
  const verbs: Record<string, string> = {
    read: "View",
    show: "View",
    index: "List",
    create: "Create",
    update: "Update",
    destroy: "Delete",
    export: "Export",
    download: "Download",
    approve: "Approve",
    reject: "Reject",
  };
  return verbs[operation] && parts.length
    ? `${verbs[operation]} ${parts.join(" ").replace(/[_-]+/g, " ")}`
    : auditLabel(code);
}

function auditActor(reference: string) {
  if (/^user:\d+$/.test(reference)) return `Account ${reference.slice(5)}`;
  if (reference === "anonymous") return "Unauthenticated visitor";
  if (reference.startsWith("system:")) return "System activity";
  return "Recorded actor";
}

const outcomeHelp: Record<string, string> = {
  attempted: "An attempt was recorded; completion is not implied.",
  denied: "The request was denied.",
  prepared: "Preparation was recorded; completion is not implied.",
  committed: "The change was recorded.",
  released:
    "A release was recorded; the action and details identify its context.",
  failed:
    "The action reported a failure. Review its details before retrying elsewhere.",
};

type AuditEvent = {
  id: number;
  occurred_at: string;
  actor_reference: string;
  actor_display_name?: string | null;
  action_code: string;
  outcome: string;
  policy_version: string;
  resource_references: string[];
};
type AuditResponse = {
  events: AuditEvent[];
  pagination: PageInfo;
  snapshot_id: number;
  filters: { action_codes: string[]; outcomes: string[] };
};

export function AuditEvents() {
  const {
    practice,
    user_id,
    current_site,
    authorization_generation,
    capabilities,
  } = useClinic();
  const scope = JSON.stringify([
    practice.id,
    user_id,
    current_site?.id,
    authorization_generation,
    capabilities,
  ]);
  return <ScopedAuditEvents key={scope} />;
}

function ScopedAuditEvents() {
  const context = useClinic();
  const [page, setPage] = useState(1);
  const [snapshotId, setSnapshotId] = useState<number>();
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState("");
  const [dateDraft, setDateDraft] = useState({ from: "", to: "" });
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [dateError, setDateError] = useState<string>();
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null);
  const selectOutcome = (value: string) => {
    setOutcome(value);
    setPage(1);
    setSnapshotId(undefined);
    setExpandedEvent(null);
  };
  const query = new URLSearchParams({ page: String(page), per_page: "25" });
  if (snapshotId !== undefined) query.set("snapshot_id", String(snapshotId));
  if (action) query.set("action_code", action);
  if (outcome) query.set("outcome", outcome);
  if (dateRange.from) query.set("from", dateRange.from);
  if (dateRange.to) query.set("to", dateRange.to);
  const resource = useResource<AuditResponse>(
    `/api/clinic/audit_events?${query}`,
    { enabled: context.capabilities.roles },
  );
  if (!context.capabilities.roles)
    return (
      <Alert severity="info">
        Practice audit review requires clinic administration permission.
      </Alert>
    );
  return (
    <Stack spacing={2}>
      <Typography component="h1" variant="h5">
        Practice audit
      </Typography>
      <Typography color="text.secondary">
        Recorded activity for {context.practice.name}. Events and resource
        references are read-only.
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField
          select
          label="Action"
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
            setSnapshotId(undefined);
          }}
          size="small"
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">All actions</MenuItem>
          {(resource.data?.filters.action_codes ?? [action])
            .filter(Boolean)
            .map((code) => (
              <MenuItem key={code} value={code}>
                {auditAction(code)}
              </MenuItem>
            ))}
        </TextField>
        <TextField
          select
          label="Outcome"
          value={outcome}
          onChange={(event) => {
            selectOutcome(event.target.value);
          }}
          size="small"
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All outcomes</MenuItem>
          {(resource.data?.filters.outcomes ?? [outcome])
            .filter(Boolean)
            .map((code) => (
              <MenuItem key={code} value={code}>
                {auditLabel(code)}
              </MenuItem>
            ))}
        </TextField>
        <Button
          onClick={() => {
            setPage(1);
            setSnapshotId(undefined);
            resource.refresh();
          }}
        >
          Refresh audit
        </Button>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <Button aria-pressed={outcome === ""} onClick={() => selectOutcome("")}>
          All outcomes
        </Button>
        {(resource.data?.filters.outcomes ?? []).includes("denied") && (
          <Button
            aria-pressed={outcome === "denied"}
            onClick={() => selectOutcome("denied")}
          >
            Denied requests
          </Button>
        )}
        {(resource.data?.filters.outcomes ?? []).includes("failed") && (
          <Button
            aria-pressed={outcome === "failed"}
            onClick={() => selectOutcome("failed")}
          >
            Failed actions
          </Button>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {outcomeHelp[outcome] ??
          "Outcomes describe the recorded event, not completion of an entire workflow. Open details for the original values."}
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField
          type="date"
          label="From (clinic date)"
          value={dateDraft.from}
          onChange={(event) => {
            setDateDraft((current) => ({
              ...current,
              from: event.target.value,
            }));
            setDateError(undefined);
          }}
          size="small"
          error={Boolean(dateError)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          type="date"
          label="Through (clinic date)"
          value={dateDraft.to}
          onChange={(event) => {
            setDateDraft((current) => ({ ...current, to: event.target.value }));
            setDateError(undefined);
          }}
          size="small"
          error={Boolean(dateError)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button
          onClick={() => {
            const from = Date.parse(`${dateDraft.from}T00:00:00Z`);
            const to = Date.parse(`${dateDraft.to}T00:00:00Z`);
            if (
              !/^\d{4}-\d{2}-\d{2}$/.test(dateDraft.from) ||
              !/^\d{4}-\d{2}-\d{2}$/.test(dateDraft.to) ||
              !Number.isFinite(from) ||
              !Number.isFinite(to) ||
              new Date(from).toISOString().slice(0, 10) !== dateDraft.from ||
              new Date(to).toISOString().slice(0, 10) !== dateDraft.to ||
              dateDraft.from.startsWith("0000") ||
              dateDraft.to.startsWith("0000")
            ) {
              setDateError("Choose both dates.");
              return;
            }
            if (to < from || (to - from) / 86_400_000 >= 366) {
              setDateError("Choose an ordered range of at most 366 days.");
              return;
            }
            setDateRange({ ...dateDraft });
            setDateError(undefined);
            setPage(1);
            setSnapshotId(undefined);
            setExpandedEvent(null);
          }}
        >
          Apply dates
        </Button>
        <Button
          onClick={() => {
            setDateDraft({ from: "", to: "" });
            setDateRange({ from: "", to: "" });
            setDateError(undefined);
            setPage(1);
            setSnapshotId(undefined);
            setExpandedEvent(null);
          }}
        >
          Clear dates
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {dateRange.from
          ? `Showing ${dateRange.from} through ${dateRange.to}, inclusive`
          : "Showing all recorded dates"}
        {` in ${context.practice.timezone}. Date ranges are limited to 366 days.`}
      </Typography>
      {dateError && <Alert severity="error">{dateError}</Alert>}
      {(dateDraft.from !== dateRange.from || dateDraft.to !== dateRange.to) && (
        <Alert severity="info">Date changes have not been applied.</Alert>
      )}
      {!resource.data ? (
        <LoadState error={resource.error} onRetry={resource.refresh} />
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Practice audit events">
              <Typography
                component="caption"
                variant="body2"
                color="text.secondary"
                sx={{ captionSide: "top", px: 1.5, py: 1 }}
              >
                Names reflect current profiles. Original actor references are in
                Details.
              </Typography>
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Who</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Outcome</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {resource.data.events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      No recorded events match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {resource.data.events.map((event) => (
                  <Fragment key={event.id}>
                    <TableRow
                      hover
                      selected={expandedEvent === event.id}
                      sx={{ "& > td": { py: 0.5 } }}
                    >
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {auditDateTime(
                          event.occurred_at,
                          context.practice.timezone,
                        )}
                      </TableCell>
                      <TableCell sx={{ overflowWrap: "anywhere" }}>
                        {event.actor_display_name ||
                          auditActor(event.actor_reference)}
                      </TableCell>
                      <TableCell>{auditAction(event.action_code)}</TableCell>
                      <TableCell>{auditLabel(event.outcome)}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          aria-label={`${expandedEvent === event.id ? "Hide" : "Show"} audit event ${event.id} details`}
                          aria-expanded={expandedEvent === event.id}
                          aria-controls={
                            expandedEvent === event.id
                              ? `audit-details-${event.id}`
                              : undefined
                          }
                          onClick={() =>
                            setExpandedEvent(
                              expandedEvent === event.id ? null : event.id,
                            )
                          }
                        >
                          {expandedEvent === event.id
                            ? "Hide details"
                            : "Details"}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expandedEvent === event.id && (
                      <TableRow id={`audit-details-${event.id}`}>
                        <TableCell colSpan={5}>
                          <Stack
                            spacing={0.5}
                            sx={{
                              minWidth: 0,
                              maxWidth: "100%",
                              overflowX: "auto",
                            }}
                          >
                            <Typography variant="body2">
                              {outcomeHelp[event.outcome] ??
                                "Outcome meaning is not defined here; original values are retained below."}
                            </Typography>
                            <Typography variant="body2">
                              Event: {event.id}
                            </Typography>
                            <Typography variant="body2">
                              Current display name:{" "}
                              {event.actor_display_name || "Name unavailable"}
                            </Typography>
                            <Typography variant="body2">
                              Recorded actor reference: {event.actor_reference}
                            </Typography>
                            <Typography variant="body2">
                              Action: {event.action_code}
                            </Typography>
                            <Typography variant="body2">
                              Outcome: {event.outcome}
                            </Typography>
                            <Typography variant="body2">
                              Recorded at: {event.occurred_at}
                            </Typography>
                            <Typography variant="body2">
                              Authorization policy: {event.policy_version}
                            </Typography>
                            <Typography variant="body2">
                              Original record references
                            </Typography>
                            <Stack sx={{ maxWidth: "100%", overflowX: "auto" }}>
                              {event.resource_references.length ? (
                                event.resource_references.map(
                                  (reference, index) => (
                                    <Typography
                                      key={`${reference}-${index}`}
                                      variant="body2"
                                      sx={{ whiteSpace: "nowrap" }}
                                    >
                                      {reference}
                                    </Typography>
                                  ),
                                )
                              ) : (
                                <Typography variant="body2">
                                  No linked record version was recorded.
                                </Typography>
                              )}
                            </Stack>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {resource.data.pagination.total_pages > 1 && (
            <Pagination
              count={resource.data.pagination.total_pages}
              page={page}
              onChange={(_, nextPage) => {
                setSnapshotId(resource.data!.snapshot_id);
                setPage(nextPage);
              }}
              aria-label="Practice audit pages"
            />
          )}
        </>
      )}
    </Stack>
  );
}
