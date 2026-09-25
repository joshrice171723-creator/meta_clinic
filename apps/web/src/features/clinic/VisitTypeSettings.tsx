import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { VisitType } from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";

type VisitTypeAttempt = {
  method: "POST" | "PATCH";
  path: string;
  body: { visit_type: Record<string, unknown> };
  kind: "form" | "status";
  success: string;
};

export function VisitTypeSettings({
  canWrite,
  refreshKey = 0,
}: {
  canWrite: boolean;
  refreshKey?: number;
}) {
  const {
    data,
    error: loadError,
    refresh,
  } = useResource<{
    visit_types: VisitType[];
    can_write: boolean;
  }>("/api/clinic/facilities?type=visit_types&per_page=100", {
    retainDataOnRefresh: true,
  });
  const previousRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (previousRefreshKey.current === refreshKey) return;
    previousRefreshKey.current = refreshKey;
    refresh();
  }, [refresh, refreshKey]);
  const [dialog, setDialog] = useState<VisitType | "new" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [retryAttempt, setRetryAttempt] = useState<VisitTypeAttempt | null>(
    null,
  );
  const counts = useMemo(() => {
    const rows = data?.visit_types ?? [];
    return {
      active: rows.filter((item) => item.retired_at === null).length,
      inactive: rows.filter((item) => item.retired_at !== null).length,
    };
  }, [data]);
  const canManage = canWrite && data?.can_write === true;

  const perform = async (attempt: VisitTypeAttempt) => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await api(attempt.path, {
        method: attempt.method,
        body: attempt.body,
      });
      setRetryAttempt(null);
      setFeedback({ tone: "success", text: attempt.success });
      if (attempt.kind === "form") setDialog(null);
      refresh();
    } catch (reason) {
      if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500
      ) {
        setRetryAttempt(null);
        setFeedback({ tone: "error", text: reason.message });
      } else {
        setRetryAttempt(attempt);
        setFeedback({
          tone: "error",
          text: "The save outcome is unknown. Retry this exact change before making another one.",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const open = (visitType: VisitType | "new") => {
    setDialog(visitType);
    setName(visitType === "new" ? "" : visitType.code);
    setFeedback(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!dialog || !canManage || retryAttempt) return;
    const code = name.trim();
    if (!code) return;
    const creating = dialog === "new";
    void perform({
      method: creating ? "POST" : "PATCH",
      path: creating
        ? "/api/clinic/visit_types"
        : `/api/clinic/visit_types/${dialog.id}`,
      body: {
        visit_type: { request_key: crypto.randomUUID(), code },
      },
      kind: "form",
      success: creating ? "Visit type added." : "Visit type updated.",
    });
  };

  const setActive = (visitType: VisitType, active: boolean) => {
    if (!canManage || retryAttempt) return;
    void perform({
      method: "PATCH",
      path: `/api/clinic/visit_types/${visitType.id}`,
      body: {
        visit_type: { request_key: crypto.randomUUID(), active },
      },
      kind: "status",
      success: active
        ? `${visitType.code} is available again.`
        : `${visitType.code} is no longer available for new appointments.`,
    });
  };

  if (!data) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }}>
        {loadError ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={refresh}>
                Retry
              </Button>
            }
          >
            {loadError}
          </Alert>
        ) : (
          <Typography role="status">Loading visit types…</Typography>
        )}
      </Paper>
    );
  }

  const controlsDisabled = busy || retryAttempt !== null;
  return (
    <Stack spacing={2} sx={{ mb: 3 }}>
      {feedback && dialog === null && (
        <Alert
          severity={feedback.tone}
          action={
            retryAttempt ? (
              <Button
                color="inherit"
                size="small"
                disabled={busy}
                onClick={() => void perform(retryAttempt)}
              >
                Retry exact change
              </Button>
            ) : undefined
          }
        >
          {feedback.text}
        </Alert>
      )}
      {loadError && (
        <Alert severity="warning">
          The latest list could not be loaded. The last loaded visit types are
          shown.
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
        >
          <Box>
            <Typography variant="h2">Visit types</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {counts.active} active · {counts.inactive} inactive
            </Typography>
          </Box>
          {canManage && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              disabled={controlsDisabled}
              onClick={() => open("new")}
            >
              Add visit type
            </Button>
          )}
        </Stack>
        <Typography color="text.secondary" sx={{ mt: 2, maxWidth: 760 }}>
          These are the choices staff and patients can use when scheduling.
          Inactive visit types stay attached to existing appointments.
        </Typography>
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table aria-label="Clinic visit types">
          <TableHead>
            <TableRow>
              <TableCell>Visit type</TableCell>
              <TableCell>Status</TableCell>
              {canManage && <TableCell align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.visit_types.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 3 : 2}>
                  <Typography color="text.secondary">
                    No visit types have been added yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {data.visit_types.map((visitType) => {
              const active = visitType.retired_at === null;
              return (
                <TableRow key={visitType.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 650 }}>
                      {visitType.code}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={active ? "Active" : "Inactive"}
                    />
                  </TableCell>
                  {canManage && (
                    <TableCell align="right">
                      <Stack
                        direction="row"
                        spacing={0.5}
                        sx={{ justifyContent: "flex-end" }}
                      >
                        <Button
                          size="small"
                          startIcon={<EditOutlinedIcon />}
                          disabled={controlsDisabled}
                          onClick={() => open(visitType)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color="inherit"
                          disabled={controlsDisabled}
                          onClick={() => setActive(visitType, !active)}
                        >
                          {active ? "Deactivate" : "Activate"}
                        </Button>
                      </Stack>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog
        open={dialog !== null}
        onClose={() => {
          if (!controlsDisabled) {
            setDialog(null);
            setFeedback(null);
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={submit}>
          <DialogTitle>
            {dialog === "new" ? "Add visit type" : "Edit visit type"}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              {feedback?.tone === "error" && (
                <Alert
                  severity="error"
                  action={
                    retryAttempt?.kind === "form" ? (
                      <Button
                        color="inherit"
                        size="small"
                        disabled={busy}
                        onClick={() => void perform(retryAttempt)}
                      >
                        Retry exact change
                      </Button>
                    ) : undefined
                  }
                >
                  {feedback.text}
                </Alert>
              )}
              <TextField
                autoFocus
                fullWidth
                required
                label="Visit type name"
                value={name}
                disabled={controlsDisabled}
                onChange={(event) => setName(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 80 } }}
                helperText="Use the name staff and patients should see when scheduling."
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              type="button"
              disabled={controlsDisabled}
              onClick={() => {
                setDialog(null);
                setFeedback(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={controlsDisabled || !name.trim()}
            >
              {busy ? "Saving…" : "Save visit type"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}
