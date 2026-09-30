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
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{
    scope: string;
    data?: PrescriptionReconciliationWorklistContract;
    error?: string;
  }>({ scope });
  useEffect(() => {
    setState({ scope });
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();
    const path = `/api/clinic/prescription_reconciliation_worklist${siteId === null ? "" : `?site_id=${siteId}`}`;
    api<PrescriptionReconciliationWorklistContract>(path, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!active) return;
        if (
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
        setState({ scope, data });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            scope,
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
  }, [actorId, enabled, practiceId, refresh, scope, siteId]);
  if (!enabled) return null;
  const current = state.scope === scope ? state : { scope };
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
            {current.data.truncated && (
              <Alert severity="info">
                Showing the first {current.data.limit} unresolved attempts. More
                work remains outside this view.
              </Alert>
            )}
            {current.data.items.length === 0 ? (
              <Typography>
                No unresolved prescription attempts in this scope.
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
