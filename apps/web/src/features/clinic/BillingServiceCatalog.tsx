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
  MenuItem,
  Paper,
  Stack,
  Switch,
  FormControlLabel,
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
import { api, ApiError } from "../../api/client";
import { LoadState, Pager } from "../../shared/ui";
import { type BillingService } from "./InvoiceLineEditor";
import { useClinic } from "./Workspace";

type ServiceForm = {
  name: string;
  code: string;
  description: string;
  unit_amount: string;
  currency: string;
  active: boolean;
};
const emptyForm = (): ServiceForm => ({
  name: "",
  code: "",
  description: "",
  unit_amount: "",
  currency: "USD",
  active: true,
});
const formFor = (service: BillingService): ServiceForm => ({
  name: service.name,
  code: service.code ?? "",
  description: service.description ?? "",
  unit_amount: service.unit_amount,
  currency: service.currency,
  active: service.active,
});
type ServiceIndex = {
  services: BillingService[];
  pagination: { page: number; per_page: number; total: number };
  can_manage: boolean;
};
type SaveAttempt = {
  method: "POST" | "PATCH";
  path: string;
  payload: Record<string, unknown>;
};
function initialPage() {
  const page = Number(new URLSearchParams(window.location.search).get("page"));
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}
function initialQuery() {
  return new URLSearchParams(window.location.search).get("q") ?? "";
}
function initialActive(): "true" | "false" {
  return new URLSearchParams(window.location.search).get("active") === "false"
    ? "false"
    : "true";
}

export function BillingServiceCatalog() {
  const { capabilities } = useClinic();
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState<"true" | "false">(initialActive);
  const [page, setPage] = useState(initialPage);
  const [result, setResult] = useState<ServiceIndex>();
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<BillingService | "new" | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const [notice, setNotice] = useState("");
  const saveAttempt = useRef<SaveAttempt | null>(null);
  const [revision, setRevision] = useState(0);
  const canManage =
    capabilities.billing_catalog_manage === true && result?.can_manage === true;
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api<ServiceIndex>(
      `/api/clinic/billing_services?page=${page}&per_page=25&active=${active}${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch(
        (reason: unknown) =>
          !controller.signal.aborted &&
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load clinic services.",
          ),
      );
    return () => controller.abort();
  }, [active, page, query, revision]);
  const open = (service: BillingService | "new") => {
    saveAttempt.current = null;
    setRetryPending(false);
    setDialog(service);
    setForm(service === "new" ? emptyForm() : formFor(service));
    setNotice("");
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!dialog || !canManage) return;
    setSaving(true);
    setError("");
    try {
      const attempt =
        saveAttempt.current ??
        (() => {
          const key = crypto.randomUUID();
          const payload = {
            request_key: key,
            name: form.name.trim(),
            code: form.code.trim() || null,
            description: form.description.trim() || null,
            unit_amount: form.unit_amount.trim(),
            currency: form.currency.trim().toUpperCase(),
            active: form.active,
            ...(dialog === "new" ? {} : { lock_version: dialog.lock_version }),
          };
          const next: SaveAttempt = {
            method: dialog === "new" ? "POST" : "PATCH",
            path:
              dialog === "new"
                ? "/api/clinic/billing_services"
                : `/api/clinic/billing_services/${dialog.id}`,
            payload,
          };
          saveAttempt.current = next;
          return next;
        })();
      await api(attempt.path, {
        method: attempt.method,
        body: { service: attempt.payload },
      });
      saveAttempt.current = null;
      setRetryPending(false);
      setDialog(null);
      setNotice(dialog === "new" ? "Service added." : "Service updated.");
      setRevision((current) => current + 1);
    } catch (reason) {
      if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500
      ) {
        saveAttempt.current = null;
        setRetryPending(false);
        setError(
          reason.status === 409
            ? "This service changed before your update. Reload the catalog and reopen it before trying again."
            : reason.message,
        );
      } else {
        setRetryPending(true);
        setError(
          "The save outcome is unknown. Retry this exact request before changing the service.",
        );
      }
    } finally {
      setSaving(false);
    }
  };
  if (!result && !error) return <LoadState />;
  return (
    <Box sx={{ maxWidth: 1180, mx: "auto", p: { xs: 2, md: 3 } }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            BILLING / SERVICES
          </Typography>
          <Typography variant="h1">One-off service catalog</Typography>
          <Typography color="text.secondary">
            Maintain standard charges for individual invoice lines. Membership
            programs, services, tiers and published versions have a separate
            catalog.
          </Typography>
          <Button
            href="/clinic/subscriptions"
            variant="outlined"
            sx={{ mt: 1.5 }}
          >
            Open membership catalog
          </Button>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            sx={{ justifyContent: "space-between" }}
          >
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField
                label="Search services"
                size="small"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
              <TextField
                select
                label="Status"
                size="small"
                value={active}
                onChange={(event) => {
                  setActive(event.target.value as typeof active);
                  setPage(1);
                }}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="true">Active</MenuItem>
                <MenuItem value="false">Inactive</MenuItem>
              </TextField>
            </Stack>
            {canManage && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => open("new")}
              >
                Add service
              </Button>
            )}
          </Stack>
        </Paper>
        <TableContainer component={Paper} variant="outlined">
          <Table aria-label="Clinic services">
            <TableHead>
              <TableRow>
                <TableCell>Service</TableCell>
                <TableCell>Code</TableCell>
                <TableCell>Standard charge</TableCell>
                <TableCell>Status</TableCell>
                {canManage && <TableCell align="right">Action</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {result?.services.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 5 : 4}>
                    <Typography color="text.secondary">
                      No services match these filters.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {result?.services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }}>
                      {service.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Service #{service.id} · Catalog version{" "}
                      {service.lock_version}
                    </Typography>
                    {service.description && (
                      <Typography variant="body2" color="text.secondary">
                        {service.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{service.code || "—"}</TableCell>
                  <TableCell>
                    {service.currency} {service.unit_amount}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={service.active ? "Active" : "Inactive"}
                      color={service.active ? "success" : "default"}
                      variant="outlined"
                    />
                  </TableCell>
                  {canManage && (
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<EditOutlinedIcon />}
                        onClick={() => open(service)}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="body2" color="text.secondary">
          Invoice lines selected from this catalog use the selected service
          version. Catalog edits do not rewrite recorded invoice descriptions or
          charges.
        </Typography>
        {result && (
          <Pager
            page={result.pagination.page}
            total={result.pagination.total}
            size={result.pagination.per_page}
            path={`/clinic/billing/services?active=${active}${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}`}
          />
        )}
      </Stack>
      <Dialog
        open={dialog !== null}
        onClose={() => {
          if (!saving) {
            saveAttempt.current = null;
            setRetryPending(false);
            setDialog(null);
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={(event) => void save(event)}>
          <DialogTitle>
            {dialog === "new" ? "Add service" : "Edit service"}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              {dialog !== "new" && dialog && (
                <Typography variant="body2" color="text.secondary">
                  Service #{dialog.id} · Catalog version {dialog.lock_version}
                </Typography>
              )}
              <TextField
                label="Service name"
                required
                value={form.name}
                disabled={retryPending}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                slotProps={{ htmlInput: { maxLength: 160 } }}
              />
              <TextField
                label="Code"
                value={form.code}
                disabled={retryPending}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value })
                }
                slotProps={{ htmlInput: { maxLength: 80 } }}
              />
              <TextField
                label="Description"
                value={form.description}
                multiline
                disabled={retryPending}
                minRows={2}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                slotProps={{ htmlInput: { maxLength: 1000 } }}
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Standard charge"
                  required
                  inputMode="decimal"
                  value={form.unit_amount}
                  disabled={retryPending}
                  onChange={(event) =>
                    setForm({ ...form, unit_amount: event.target.value })
                  }
                  fullWidth
                />
                <TextField
                  label="Currency"
                  required
                  value={form.currency}
                  disabled={retryPending}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      currency: event.target.value.toUpperCase(),
                    })
                  }
                  slotProps={{ htmlInput: { maxLength: 3 } }}
                  sx={{ width: { sm: 150 } }}
                />
              </Stack>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.active}
                    disabled={retryPending}
                    onChange={(event) =>
                      setForm({ ...form, active: event.target.checked })
                    }
                  />
                }
                label="Available for new invoice lines"
              />
              <Typography variant="body2" color="text.secondary">
                Inactive services stay on existing invoices but cannot be chosen
                for new invoice lines.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialog(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? "Saving…" : "Save service"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
