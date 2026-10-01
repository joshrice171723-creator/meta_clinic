import { useState } from "react";
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

type AuditEvent = {
  id: number;
  occurred_at: string;
  actor_reference: string;
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
  const query = new URLSearchParams({ page: String(page), per_page: "25" });
  if (snapshotId !== undefined) query.set("snapshot_id", String(snapshotId));
  if (action) query.set("action_code", action);
  if (outcome) query.set("outcome", outcome);
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
          label="Audit action"
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
                {code}
              </MenuItem>
            ))}
        </TextField>
        <TextField
          select
          label="Audit outcome"
          value={outcome}
          onChange={(event) => {
            setOutcome(event.target.value);
            setPage(1);
            setSnapshotId(undefined);
          }}
          size="small"
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All outcomes</MenuItem>
          {(resource.data?.filters.outcomes ?? [outcome])
            .filter(Boolean)
            .map((code) => (
              <MenuItem key={code} value={code}>
                {code}
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
      {!resource.data ? (
        <LoadState error={resource.error} onRetry={resource.refresh} />
      ) : (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Practice audit events">
              <TableHead>
                <TableRow>
                  <TableCell>
                    Occurred (clinic time · {context.practice.timezone})
                  </TableCell>
                  <TableCell>Actor reference</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Outcome</TableCell>
                  <TableCell>Policy version</TableCell>
                  <TableCell>Resource versions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {resource.data.events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      No recorded events match these filters.
                    </TableCell>
                  </TableRow>
                )}
                {resource.data.events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {auditDateTime(
                        event.occurred_at,
                        context.practice.timezone,
                      )}
                    </TableCell>
                    <TableCell sx={{ overflowWrap: "anywhere" }}>
                      {event.actor_reference}
                    </TableCell>
                    <TableCell sx={{ overflowWrap: "anywhere" }}>
                      {event.action_code}
                    </TableCell>
                    <TableCell>{event.outcome}</TableCell>
                    <TableCell sx={{ overflowWrap: "anywhere" }}>
                      {event.policy_version}
                    </TableCell>
                    <TableCell sx={{ overflowWrap: "anywhere" }}>
                      {event.resource_references.length
                        ? event.resource_references.map((reference) => (
                            <Typography key={reference} variant="body2">
                              {reference}
                            </Typography>
                          ))
                        : "No resource version recorded"}
                    </TableCell>
                  </TableRow>
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
