import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { PrescriptionReconciliationWorklistContract } from "../../api/contracts";

export function PrescriptionReconciliationWorklist({
  practiceId,
  actorId,
  siteId,
  enabled,
}: {
  practiceId: number;
  actorId: number;
  siteId: number | null;
  enabled: boolean;
}) {
  const scope = `${actorId}:${practiceId}:${siteId ?? "all"}`;
  const [selection, setSelection] = useState({ scope, page: 1 });
  const page = selection.scope === scope ? selection.page : 1;
  const requestKey = `${scope}:${page}`;
  useEffect(() => setSelection({ scope, page: 1 }), [scope, enabled]);
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{
    requestKey: string;
    data?: PrescriptionReconciliationWorklistContract;
    error?: string;
  }>({ requestKey });
  useEffect(() => {
    setState({ requestKey });
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page) });
    if (siteId !== null) query.set("site_id", String(siteId));
    const path = `/api/clinic/prescription_reconciliation_worklist?${query}`;
    api<PrescriptionReconciliationWorklistContract>(path, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!active) return;
        const pagination = data.pagination;
        if (
          !pagination ||
          !Number.isSafeInteger(data.unresolved_count) ||
          data.unresolved_count < 0 ||
          !Number.isSafeInteger(pagination.page) ||
          pagination.page < 1 ||
          pagination.per_page !== 50 ||
          pagination.total !== data.unresolved_count ||
          pagination.total_pages !==
            Math.max(1, Math.ceil(data.unresolved_count / 50)) ||
          pagination.page !== Math.min(page, pagination.total_pages) ||
          data.returned_count !== data.items.length ||
          data.items.length > 50 ||
          data.schema_version !== "prescription-reconciliation-worklist-v1" ||
          data.practice_id !== practiceId ||
          data.actor_id !== actorId ||
          data.site_id !== siteId ||
          data.items.some((item) => siteId !== null && item.site_id !== siteId)
        ) {
          throw new Error(
            "The prescription worklist changed context. Refresh before reviewing it.",
          );
        }
        setState({ requestKey, data });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            requestKey,
            error:
              error instanceof Error
                ? error.message
                : "Prescription work could not be loaded.",
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [actorId, enabled, page, practiceId, refresh, requestKey, siteId]);
  if (!enabled) return null;
  const current = state.requestKey === requestKey ? state : { requestKey };
  return (
    <Paper
      component="section"
      aria-labelledby="prescription-reconciliation-heading"
      variant="outlined"
      sx={{ p: 2 }}
    >
      <Stack spacing={2}>
        <Stack
          direction="row"
          sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}
        >
          <Box>
            <Typography
              id="prescription-reconciliation-heading"
              component="h2"
              variant="subtitle1"
              sx={{ fontWeight: 750 }}
            >
              Prescription reconciliation
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Review unresolved simulated pharmacy attempts in their original
              encounter history.
            </Typography>
          </Box>
          <Button
            onClick={() => setRefresh((value) => value + 1)}
            disabled={!current.data && !current.error}
          >
            Refresh prescriptions
          </Button>
        </Stack>
        {current.error ? (
          <Alert
            severity="error"
            action={
              <Button
                color="inherit"
                onClick={() => setRefresh((value) => value + 1)}
              >
                Retry prescriptions
              </Button>
            }
          >
            {current.error} The queue has not been confirmed clear.
          </Alert>
        ) : !current.data ? (
          <CircularProgress size={24} aria-label="Loading prescription work" />
        ) : (
          <>
            <Typography variant="body2">
              {current.data.unresolved_count} unresolved ·{" "}
              {current.data.returned_count} shown · checked{" "}
              {new Date(current.data.as_of).toLocaleString()}
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", flexWrap: "wrap" }}
            >
              <Button
                disabled={current.data.pagination.page <= 1}
                onClick={() =>
                  setSelection({
                    scope,
                    page: current.data!.pagination.page - 1,
                  })
                }
              >
                Previous prescriptions
              </Button>
              <Typography variant="body2">
                Page {current.data.pagination.page} of{" "}
                {current.data.pagination.total_pages}
              </Typography>
              <Button
                disabled={
                  current.data.pagination.page >=
                  current.data.pagination.total_pages
                }
                onClick={() =>
                  setSelection({
                    scope,
                    page: current.data!.pagination.page + 1,
                  })
                }
              >
                Next prescriptions
              </Button>
            </Stack>
            {current.data.truncated && (
              <Typography variant="body2" color="text.secondary">
                More work remains outside this page. Counts and pages reflect
                current authorized records, not a frozen snapshot.
              </Typography>
            )}
            {current.data.items.length === 0 ? (
              <Typography>
                {current.data.unresolved_count === 0
                  ? "No unresolved prescription attempts in this scope."
                  : "No attempts returned on this page. Refresh to recheck current work."}
              </Typography>
            ) : (
              <TableContainer>
                <Table
                  size="small"
                  aria-label="Unresolved prescription attempts"
                  sx={{ minWidth: 680 }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>Patient / request</TableCell>
                      <TableCell>Recorded outcome</TableCell>
                      <TableCell>Responsible queue / next action</TableCell>
                      <TableCell>History</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {current.data.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Typography variant="body2">
                            {item.patient.display_name} ·{" "}
                            {item.patient.reference ??
                              `Patient #${item.patient.id}`}
                          </Typography>
                          <Typography variant="body2">
                            {item.medication_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Encounter #{item.encounter_id} · request #
                            {item.medication_request_revision_id} · revision{" "}
                            {item.version_number} · attempt #{item.id}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {item.outcome.replaceAll("_", " ")}
                          </Typography>
                          <Typography variant="caption">
                            Simulation ·{" "}
                            {new Date(item.submitted_at).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{item.owner}</Typography>
                          <Typography variant="caption">
                            {item.next_action}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Button
                            component="a"
                            href={item.href}
                            size="small"
                            aria-label={`Review attempt ${item.id} history`}
                          >
                            Review history
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            <Typography variant="caption" color="text.secondary">
              Reading this queue does not resolve an attempt. A simulated
              acceptance does not establish dispensing or delivery.
            </Typography>
          </>
        )}
      </Stack>
    </Paper>
  );
}
