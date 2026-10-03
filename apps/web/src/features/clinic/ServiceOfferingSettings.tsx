import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PublishOutlinedIcon from "@mui/icons-material/PublishOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import type { ClinicSite, VisitType } from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";
import { ServiceOfferingTextImport } from "./ServiceOfferingTextImport";
import { ServiceOfferingBulkTextImport } from "./ServiceOfferingBulkTextImport";

type BillingService = { id: number; name: string; active: boolean };
type ServiceOffering = {
  id: number;
  practice_id: number;
  name: string;
  code: string | null;
  description: string | null;
  contact_instructions: string | null;
  referral_instructions: string | null;
  referral_required: boolean;
  visit_type_id: number | null;
  billing_service_id: number | null;
  duration_minutes: number | null;
  modality: "in_person" | "video" | "either";
  booking_required: boolean;
  requires_room: boolean;
  public_visible: boolean;
  status: "draft" | "published" | "retired";
  eligible_site_ids: number[];
  eligible_clinician_ids: number[];
  lock_version: number;
};

type FormState = Omit<ServiceOffering, "id" | "practice_id" | "lock_version">;
type Attempt = {
  method: "POST" | "PATCH";
  path: string;
  body: Record<string, unknown>;
  success: string;
};

function emptyForm(visitType?: VisitType, siteIds: number[] = []): FormState {
  return {
    name: visitType?.code ?? "",
    code: null,
    description: null,
    contact_instructions: null,
    referral_instructions: null,
    referral_required: false,
    visit_type_id: visitType?.id ?? null,
    billing_service_id: null,
    duration_minutes: null,
    modality: "in_person",
    booking_required: true,
    requires_room: false,
    public_visible: false,
    eligible_site_ids: siteIds,
    eligible_clinician_ids: [],
    status: "draft",
  };
}

function formFor(offering: ServiceOffering): FormState {
  return { ...offering };
}

export function ServiceOfferingSettings({
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
    service_offerings: ServiceOffering[];
    can_write: boolean;
    eligible_clinicians: { id: number; name: string }[];
  }>("/api/clinic/service_offerings", { retainDataOnRefresh: true });
  const { data: sites } = useResource<{ sites: ClinicSite[] }>(
    "/api/clinic/facilities?type=sites&per_page=100",
  );
  const { data: visitTypes, refresh: refreshVisitTypes } = useResource<{
    visit_types: VisitType[];
  }>("/api/clinic/facilities?type=visit_types&per_page=100");
  const { data: billing } = useResource<{ services: BillingService[] }>(
    "/api/clinic/billing_services?active=true&per_page=100",
  );
  const previousRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (previousRefreshKey.current === refreshKey) return;
    previousRefreshKey.current = refreshKey;
    refreshVisitTypes();
  }, [refreshKey, refreshVisitTypes]);
  const [dialog, setDialog] = useState<ServiceOffering | "new" | null>(null);
  const [retiring, setRetiring] = useState<ServiceOffering | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [retryAttempt, setRetryAttempt] = useState<Attempt | null>(null);
  const canManage = canWrite && data?.can_write === true;
  const activeVisitTypes = useMemo(
    () =>
      (visitTypes?.visit_types ?? []).filter(
        (item) => item.retired_at === null,
      ),
    [visitTypes],
  );
  const activeSites = useMemo(
    () => (sites?.sites ?? []).filter((site) => site.status === "active"),
    [sites],
  );

  const perform = async (attempt: Attempt) => {
    if (busy || bulkImportOpen) return;
    setBusy(true);
    setFeedback(null);
    try {
      await api(attempt.path, { method: attempt.method, body: attempt.body });
      setRetryAttempt(null);
      setFeedback({ tone: "success", text: attempt.success });
      setDialog(null);
      refresh();
    } catch (reason) {
      const unconfirmed =
        retryAttempt !== null ||
        !(reason instanceof ApiError) ||
        reason.status === 408 ||
        reason.status >= 500 ||
        reason.code === "outcome_unconfirmed";
      if (
        !unconfirmed &&
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
          text:
            "The save outcome is unknown. Retry this exact change before making another one." +
            (reason instanceof ApiError ? ` ${reason.message}` : ""),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const open = (offering: ServiceOffering | "new") => {
    if (bulkImportOpen) return;
    setDialog(offering);
    setForm(
      offering === "new"
        ? emptyForm(
            activeVisitTypes.find(
              (visitType) =>
                !(data?.service_offerings ?? []).some(
                  (existing) =>
                    existing.visit_type_id === visitType.id &&
                    existing.status !== "retired",
                ),
            ) ??
              (activeVisitTypes.length === 1 ? activeVisitTypes[0] : undefined),
            activeSites.length === 1 ? [activeSites[0].id] : [],
          )
        : formFor(offering),
    );
    setFeedback(null);
    setRetryAttempt(null);
  };
  const update = (changes: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...changes }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!dialog || !canManage || retryAttempt || bulkImportOpen) return;
    const creating = dialog === "new";
    const body = {
      request_key: crypto.randomUUID(),
      name: form.name.trim(),
      code: form.code?.trim() || null,
      description: form.description?.trim() || null,
      contact_instructions: form.contact_instructions?.trim() || null,
      referral_instructions: form.referral_instructions?.trim() || null,
      referral_required: form.referral_required,
      visit_type_id: form.visit_type_id,
      billing_service_id: form.billing_service_id,
      duration_minutes: form.duration_minutes,
      modality: form.modality,
      booking_required: form.booking_required,
      requires_room: form.requires_room,
      public_visible: form.public_visible,
      site_ids: form.eligible_site_ids,
      clinician_ids: form.eligible_clinician_ids,
      ...(creating
        ? {}
        : { lock_version: (dialog as ServiceOffering).lock_version }),
    };
    void perform({
      method: creating ? "POST" : "PATCH",
      path: creating
        ? "/api/clinic/service_offerings"
        : `/api/clinic/service_offerings/${(dialog as ServiceOffering).id}`,
      body: { service_offering: body },
      success: creating
        ? "Service offering saved as a draft."
        : "Service offering updated.",
    });
  };

  const publish = (offering: ServiceOffering) => {
    if (!canManage || retryAttempt || bulkImportOpen) return;
    void perform({
      method: "POST",
      path: `/api/clinic/service_offerings/${offering.id}/publish`,
      body: {
        service_offering: {
          request_key: crypto.randomUUID(),
          lock_version: offering.lock_version,
        },
      },
      success: `${offering.name} is now available for configuration and scheduling work.`,
    });
  };

  const retire = (offering: ServiceOffering) => {
    if (!canManage || retryAttempt || bulkImportOpen) return;
    setRetiring(null);
    void perform({
      method: "POST",
      path: `/api/clinic/service_offerings/${offering.id}/retire`,
      body: {
        service_offering: {
          request_key: crypto.randomUUID(),
          lock_version: offering.lock_version,
        },
      },
      success: `${offering.name} was retired. Its catalog record remains available for historical references.`,
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
          <Typography role="status">Loading service offerings…</Typography>
        )}
      </Paper>
    );
  }

  const controlsDisabled = busy || retryAttempt !== null || bulkImportOpen;
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
          The latest list could not be loaded. The last loaded service offerings
          are shown.
        </Alert>
      )}
      {bulkImportOpen && (
        <ServiceOfferingBulkTextImport
          targets={data.service_offerings}
          canApply={canManage}
          onClose={() => {
            setBulkImportOpen(false);
            refresh();
          }}
        />
      )}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
        >
          <Box>
            <Typography variant="h2">Service offerings</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              Operational definitions are separate from billable prices and
              completed procedures.
            </Typography>
          </Box>
          {canManage && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                variant="outlined"
                disabled={
                  controlsDisabled ||
                  dialog !== null ||
                  retiring !== null ||
                  !!loadError
                }
                onClick={() => setBulkImportOpen(true)}
              >
                Import selected fields into drafts
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                disabled={controlsDisabled}
                onClick={() => open("new")}
              >
                Add service offering
              </Button>
            </Stack>
          )}
        </Stack>
        <Typography color="text.secondary" sx={{ mt: 2, maxWidth: 760 }}>
          A published offering needs a visit type, duration, and at least one
          eligible site. If it requires a room, one selected site must have a
          room configured.
        </Typography>
      </Paper>
      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{ overflowX: "auto" }}
      >
        <Table
          aria-label="Clinic service offerings"
          sx={{
            minWidth: 680,
            "& .MuiTableCell-root": { px: 2 },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 180 }}>Offering</TableCell>
              <TableCell sx={{ minWidth: 220 }}>Visit and sites</TableCell>
              <TableCell sx={{ width: 120 }}>Status</TableCell>
              {canManage && (
                <TableCell align="right" sx={{ minWidth: 220 }}>
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.service_offerings.length === 0 && (
              <TableRow>
                <TableCell colSpan={canManage ? 4 : 3}>
                  <Typography color="text.secondary">
                    No service offerings have been configured.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {data.service_offerings.map((offering) => (
              <TableRow key={offering.id}>
                <TableCell sx={{ overflowWrap: "anywhere" }}>
                  <Typography sx={{ fontWeight: 650 }}>
                    {offering.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {offering.code ?? "No code"} ·{" "}
                    {offering.duration_minutes ?? "No duration"} min
                  </Typography>
                </TableCell>
                <TableCell sx={{ overflowWrap: "anywhere" }}>
                  <Typography variant="body2">
                    {activeVisitTypes.find(
                      (item) => item.id === offering.visit_type_id,
                    )?.code ?? "No visit type"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {offering.eligible_site_ids.length} eligible site
                    {offering.eligible_site_ids.length === 1 ? "" : "s"}
                    {offering.eligible_clinician_ids.length > 0
                      ? ` · ${offering.eligible_clinician_ids.length} eligible clinician${offering.eligible_clinician_ids.length === 1 ? "" : "s"}`
                      : " · All schedulable clinicians"}
                    {offering.requires_room ? " · Room required" : ""}
                  </Typography>
                </TableCell>
                <TableCell sx={{ width: 120 }}>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${offering.status}${offering.public_visible ? " · Public page" : ""}`}
                  />
                </TableCell>
                {canManage && (
                  <TableCell align="right" sx={{ minWidth: 220 }}>
                    <Stack
                      direction="row"
                      spacing={0.5}
                      sx={{ justifyContent: "flex-end" }}
                    >
                      {offering.status !== "retired" && (
                        <Button
                          size="small"
                          startIcon={<EditOutlinedIcon />}
                          disabled={controlsDisabled}
                          onClick={() => open(offering)}
                        >
                          Edit
                        </Button>
                      )}
                      {offering.status === "draft" && (
                        <Button
                          size="small"
                          startIcon={<PublishOutlinedIcon />}
                          disabled={controlsDisabled}
                          onClick={() => publish(offering)}
                        >
                          Publish
                        </Button>
                      )}
                      {offering.status === "published" && (
                        <Button
                          size="small"
                          color="warning"
                          disabled={controlsDisabled}
                          onClick={() => setRetiring(offering)}
                        >
                          Retire
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={retiring !== null} onClose={() => setRetiring(null)}>
        <DialogTitle>Retire service offering?</DialogTitle>
        <DialogContent>
          <Typography>
            {retiring?.name} will no longer be active. Its catalog record stays
            available for historical references, but cannot be edited or
            republished here.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRetiring(null)}>Cancel</Button>
          <Button color="warning" onClick={() => retiring && retire(retiring)}>
            Retire offering
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={dialog !== null}
        onClose={() => !controlsDisabled && setDialog(null)}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={submit}>
          <DialogTitle>
            {dialog === "new"
              ? "Add service offering"
              : "Edit service offering"}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Changes here save this service offering. Publish and retire are
                separate actions in the list.
              </Typography>
              {dialog && dialog !== "new" && (
                <Typography variant="body2" color="text.secondary">
                  Saved status: {dialog.status}
                </Typography>
              )}
              {feedback && (
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
              {dialog &&
                dialog !== "new" &&
                dialog.status === "draft" &&
                canManage && (
                  <ServiceOfferingTextImport
                    key={`${dialog.id}-${dialog.lock_version}`}
                    target={dialog}
                    reservedCodes={data.service_offerings
                      .filter(
                        (offering) =>
                          offering.id !== dialog.id && offering.code !== null,
                      )
                      .map((offering) => offering.code!)}
                    disabled={
                      controlsDisabled ||
                      JSON.stringify(form) !== JSON.stringify(formFor(dialog))
                    }
                    onApply={(attempt) => void perform(attempt)}
                  />
                )}
              <FormControl fullWidth>
                <InputLabel id="offering-visit-type">Visit type</InputLabel>
                <Select
                  labelId="offering-visit-type"
                  label="Visit type"
                  value={form.visit_type_id ?? ""}
                  disabled={controlsDisabled}
                  onChange={(event) => {
                    const value = String(event.target.value);
                    const nextVisitType = activeVisitTypes.find(
                      (item) => item.id === Number(value),
                    );
                    const currentVisitType = activeVisitTypes.find(
                      (item) => item.id === form.visit_type_id,
                    );
                    const nameWasVisitType =
                      !form.name.trim() || form.name === currentVisitType?.code;
                    update({
                      visit_type_id: value === "" ? null : Number(value),
                      ...(nameWasVisitType && nextVisitType
                        ? { name: nextVisitType.code }
                        : {}),
                    });
                  }}
                >
                  <MenuItem value="">Not selected</MenuItem>
                  {activeVisitTypes.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.code}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="body2" color="text.secondary">
                Choosing a visit type fills the offering name. If this is the
                only active site, it is selected automatically below.
              </Typography>
              <TextField
                label="Offering name"
                value={form.name}
                required
                disabled={controlsDisabled}
                onChange={(event) => update({ name: event.target.value })}
                slotProps={{ htmlInput: { maxLength: 160 } }}
              />
              <TextField
                label="Internal code"
                value={form.code ?? ""}
                disabled={controlsDisabled}
                onChange={(event) =>
                  update({ code: event.target.value || null })
                }
                slotProps={{ htmlInput: { maxLength: 50 } }}
              />
              <TextField
                label="Description"
                value={form.description ?? ""}
                multiline
                minRows={2}
                disabled={controlsDisabled}
                onChange={(event) =>
                  update({ description: event.target.value || null })
                }
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
              <TextField
                label="Contact instructions"
                value={form.contact_instructions ?? ""}
                multiline
                minRows={2}
                disabled={controlsDisabled}
                onChange={(event) =>
                  update({ contact_instructions: event.target.value || null })
                }
                helperText="Optional service-specific contact steps. Published with this service when public visibility is enabled."
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.referral_required}
                    disabled={controlsDisabled}
                    onChange={(event) =>
                      update({ referral_required: event.target.checked })
                    }
                  />
                }
                label="Require a recorded referral before booking or rescheduling this service"
              />
              <TextField
                label="Referral instructions"
                value={form.referral_instructions ?? ""}
                multiline
                minRows={2}
                disabled={controlsDisabled}
                onChange={(event) =>
                  update({ referral_instructions: event.target.value || null })
                }
                helperText="Optional guidance for asking about a referral. This text does not verify referral receipt or eligibility."
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
              <FormControl fullWidth>
                <InputLabel id="offering-price">
                  Billable price reference
                </InputLabel>
                <Select
                  labelId="offering-price"
                  label="Billable price reference"
                  value={form.billing_service_id ?? ""}
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    update({
                      billing_service_id:
                        String(event.target.value) === ""
                          ? null
                          : Number(event.target.value),
                    })
                  }
                >
                  <MenuItem value="">No price reference</MenuItem>
                  {(billing?.services ?? [])
                    .filter((item) => item.active)
                    .map((item) => (
                      <MenuItem key={item.id} value={item.id}>
                        {item.name}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
              <TextField
                label="Default duration (minutes)"
                type="number"
                value={form.duration_minutes ?? ""}
                disabled={controlsDisabled}
                onChange={(event) =>
                  update({
                    duration_minutes:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
                slotProps={{ htmlInput: { min: 5, max: 1440 } }}
                helperText="Choose the visit length before publishing."
              />
              <FormControl fullWidth>
                <InputLabel id="offering-modality">Modality</InputLabel>
                <Select
                  labelId="offering-modality"
                  label="Modality"
                  value={form.modality}
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    update({
                      modality: event.target.value as FormState["modality"],
                    })
                  }
                >
                  <MenuItem value="in_person">In person</MenuItem>
                  <MenuItem value="video">Video</MenuItem>
                  <MenuItem value="either">Either</MenuItem>
                </Select>
              </FormControl>
              <Box>
                <Typography variant="subtitle2">Eligible sites</Typography>
                {(sites?.sites ?? []).map((site) => (
                  <FormControlLabel
                    key={site.id}
                    control={
                      <Checkbox
                        checked={form.eligible_site_ids.includes(site.id)}
                        disabled={controlsDisabled}
                        onChange={(event) =>
                          update({
                            eligible_site_ids: event.target.checked
                              ? [...form.eligible_site_ids, site.id]
                              : form.eligible_site_ids.filter(
                                  (id) => id !== site.id,
                                ),
                          })
                        }
                      />
                    }
                    label={site.name ?? site.code}
                  />
                ))}
              </Box>
              <Box>
                <Typography variant="subtitle2">Eligible clinicians</Typography>
                <Typography variant="body2" color="text.secondary">
                  Leave all unchecked to allow any clinician who is otherwise
                  schedulable at an eligible site.
                </Typography>
                {data.eligible_clinicians.map((clinician) => (
                  <FormControlLabel
                    key={clinician.id}
                    control={
                      <Checkbox
                        checked={form.eligible_clinician_ids.includes(
                          clinician.id,
                        )}
                        disabled={controlsDisabled}
                        onChange={(event) =>
                          update({
                            eligible_clinician_ids: event.target.checked
                              ? [...form.eligible_clinician_ids, clinician.id]
                              : form.eligible_clinician_ids.filter(
                                  (id) => id !== clinician.id,
                                ),
                          })
                        }
                      />
                    }
                    label={clinician.name}
                  />
                ))}
              </Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.public_visible}
                    disabled={controlsDisabled}
                    onChange={(event) =>
                      update({ public_visible: event.target.checked })
                    }
                  />
                }
                label="Show on public clinic page when published"
              />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                The name, description, contact and referral instructions,
                duration, and visit format appear publicly. Draft and retired
                offerings stay hidden.
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.booking_required}
                    disabled={controlsDisabled}
                    onChange={(event) =>
                      update({ booking_required: event.target.checked })
                    }
                  />
                }
                label="Booking is required"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.requires_room}
                    disabled={controlsDisabled}
                    onChange={(event) =>
                      update({ requires_room: event.target.checked })
                    }
                  />
                }
                label="A room is required"
              />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
                If selected, at least one eligible site needs a configured room.
                Room setup is above this section.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              type="button"
              onClick={() => setDialog(null)}
              disabled={controlsDisabled}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={controlsDisabled || !form.name.trim()}
            >
              {busy
                ? "Saving…"
                : dialog !== "new" && dialog?.status === "published"
                  ? "Save offering changes"
                  : "Save draft"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}
