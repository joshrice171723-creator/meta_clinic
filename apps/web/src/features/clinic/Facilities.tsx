import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import type {
  ClinicSite,
  SiteHourException,
  SiteOperatingHour,
} from "../../api/contracts";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { VisitTypeSettings } from "./VisitTypeSettings";
import { useClinic } from "./Workspace";
import { PracticeFeatureSettings } from "./PracticeFeatureSettings";
import { ClinicianSetup } from "./ClinicianSetup";

const days = [
  [0, "Sunday"],
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
] as const;

type EditableHour = Omit<SiteOperatingHour, "id"> & { id?: number };
type EditableException = Omit<SiteHourException, "id"> & { id?: number };
type EditableSite = Omit<
  ClinicSite,
  "name" | "status" | "operating_hours" | "hour_exceptions"
> & {
  name: string;
  status: NonNullable<ClinicSite["status"]>;
  operating_hours: EditableHour[];
  hour_exceptions: EditableException[];
};

const defaultHours = (): EditableHour[] =>
  days.map(([day]) => ({
    day_of_week: day,
    closed: day === 0 || day === 6,
    open_time: day === 0 || day === 6 ? null : "08:00",
    close_time: day === 0 || day === 6 ? null : "17:00",
  }));

const emptySite = (): EditableSite => ({
  id: 0,
  code: "",
  name: "",
  status: "active",
  timezone_override: null,
  address_line1: null,
  address_line2: null,
  city: null,
  state: null,
  postal_code: null,
  country: "US",
  phone: null,
  contact_name: null,
  contact_email: null,
  operating_hours: defaultHours(),
  hour_exceptions: [],
});

function address(
  site: Pick<ClinicSite, "address_line1" | "city" | "state" | "postal_code">,
) {
  return [site.address_line1, site.city, site.state, site.postal_code]
    .filter(Boolean)
    .join(", ");
}

function siteForm(site: ClinicSite): EditableSite {
  return {
    ...site,
    name: site.name ?? site.code,
    status: site.status ?? "draft",
    operating_hours:
      site.operating_hours?.length === 7
        ? site.operating_hours.map((hour) => ({ ...hour }))
        : defaultHours(),
    hour_exceptions: (site.hour_exceptions ?? []).map((item) => ({ ...item })),
  };
}

export function Facilities() {
  const { capabilities, current_site: currentSite, practice } = useClinic();
  const { data, error, refresh } = useResource<{ sites: ClinicSite[] }>(
    "/api/clinic/facilities?type=sites&detail=true&per_page=100",
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<EditableSite>(emptySite);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const selected = useMemo(
    () => data?.sites.find((site) => site.id === selectedId),
    [data, selectedId],
  );

  useEffect(() => {
    if (!data) return;
    if (creating) return;
    if (selectedId === null) {
      const first = data.sites[0];
      if (first) {
        setSelectedId(first.id);
        setDraft(siteForm(first));
      }
    } else if (selected) setDraft(siteForm(selected));
  }, [creating, data, selected, selectedId]);

  if (!data) return <LoadState error={error} />;

  const canWrite = capabilities.facilities_write === true;
  const update = (changes: Partial<EditableSite>) =>
    setDraft((current) => ({ ...current, ...changes }));
  const hours = draft.operating_hours;
  const exceptions = draft.hour_exceptions;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const body = {
      site: {
        code: draft.code,
        name: draft.name,
        status: draft.status,
        timezone_override: draft.timezone_override ?? "",
        address_line1: draft.address_line1 ?? "",
        address_line2: draft.address_line2 ?? "",
        city: draft.city ?? "",
        state: draft.state ?? "",
        postal_code: draft.postal_code ?? "",
        country: draft.country ?? "US",
        phone: draft.phone ?? "",
        contact_name: draft.contact_name ?? "",
        contact_email: draft.contact_email ?? "",
        operating_hours: hours,
        hour_exceptions: exceptions,
      },
    };
    try {
      const result = await api<{ id?: number; site: ClinicSite }>(
        selectedId && !creating
          ? `/api/clinic/facilities/${selectedId}`
          : "/api/clinic/facilities",
        { method: selectedId && !creating ? "PATCH" : "POST", body },
      );
      setFeedback({ tone: "success", text: "Facility profile saved." });
      setCreating(false);
      setSelectedId(result.site.id);
      setDraft(siteForm(result.site));
      refresh();
    } catch (reason) {
      setFeedback({
        tone: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to save this facility.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="facilities-page">
      <Stack spacing={1} sx={{ mb: 3 }}>
        <Typography variant="overline" color="text.secondary">
          OPERATIONS / CLINIC SETUP
        </Typography>
        <Typography variant="h1">Clinic setup</Typography>
        <Typography color="text.secondary">
          Define the clinic model and intended services, then configure visit
          types, locations, and operating hours for implementation handoff.
          Storage cabinets, quarantine, and returns remain in Inventory.
        </Typography>
      </Stack>
      {feedback && (
        <Alert severity={feedback.tone} sx={{ mb: 2 }}>
          {feedback.text}
        </Alert>
      )}
      <PracticeFeatureSettings
        canWrite={capabilities.clinic_setup_write === true}
      />
      <VisitTypeSettings canWrite={canWrite} />
      {capabilities.clinic_setup_write && <ClinicianSetup />}
      <div className="facilities-layout">
        <Paper variant="outlined" className="facilities-list">
          <Stack
            direction="row"
            sx={{
              mb: 1,
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography variant="h2">Sites</Typography>
            {canWrite && (
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => {
                  setCreating(true);
                  setSelectedId(null);
                  setDraft(emptySite());
                  setFeedback(null);
                }}
              >
                Add site
              </Button>
            )}
          </Stack>
          {data.sites.length === 0 && (
            <Typography color="text.secondary">
              {currentSite
                ? "No facility sites have been recorded."
                : "Select a clinic location from the sidebar to view its profile."}
            </Typography>
          )}
          <Stack
            component="ul"
            spacing={0.5}
            sx={{ listStyle: "none", m: 0, p: 0 }}
          >
            {data.sites.map((site) => (
              <li key={site.id}>
                <Button
                  fullWidth
                  variant={
                    !creating && selectedId === site.id ? "contained" : "text"
                  }
                  color="inherit"
                  onClick={() => {
                    setCreating(false);
                    setSelectedId(site.id);
                  }}
                  sx={{
                    justifyContent: "flex-start",
                    textAlign: "left",
                    py: 1.25,
                  }}
                >
                  <span>
                    <strong>{site.name ?? site.code}</strong>
                    <br />
                    <small>
                      {site.code} · {(site.status ?? "draft").replace("_", " ")}
                    </small>
                  </span>
                </Button>
              </li>
            ))}
          </Stack>
        </Paper>
        <Paper
          variant="outlined"
          component="form"
          onSubmit={submit}
          className="facility-form"
        >
          <Stack spacing={2.5}>
            <Stack spacing={0.5}>
              <Typography variant="h2">
                {selectedId ? "Facility profile" : "Add facility site"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                This profile is used for site identity, delivery context and
                regular operating hours. It does not control appointment
                availability.
              </Typography>
            </Stack>
            <div className="facility-form-grid">
              <TextField
                label="Facility name"
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
                required
                slotProps={{ htmlInput: { maxLength: 120 } }}
              />
              <TextField
                label="Site code"
                value={draft.code}
                onChange={(e) => update({ code: e.target.value })}
                required
                slotProps={{ htmlInput: { maxLength: 80 } }}
                helperText="Stable internal code, such as MAIN."
              />
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  label="Status"
                  value={draft.status}
                  onChange={(e) =>
                    update({
                      status: e.target.value as NonNullable<
                        ClinicSite["status"]
                      >,
                    })
                  }
                >
                  <MenuItem value="draft">Draft</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="temporarily_closed">
                    Temporarily closed
                  </MenuItem>
                  <MenuItem value="retired">Retired</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Timezone"
                value={draft.timezone_override ?? ""}
                onChange={(e) =>
                  update({ timezone_override: e.target.value || null })
                }
                placeholder="America/Chicago"
                helperText={`Leave blank to use the practice timezone (${practice.timezone}).`}
              />
            </div>
            <section>
              <Typography variant="h3" sx={{ mb: 1 }}>
                Address and contact
              </Typography>
              <div className="facility-form-grid">
                <TextField
                  label="Address line 1"
                  value={draft.address_line1 ?? ""}
                  onChange={(e) =>
                    update({ address_line1: e.target.value || null })
                  }
                  autoComplete="address-line1"
                  required
                />
                <TextField
                  label="Address line 2"
                  value={draft.address_line2 ?? ""}
                  onChange={(e) =>
                    update({ address_line2: e.target.value || null })
                  }
                  autoComplete="address-line2"
                />
                <TextField
                  label="City"
                  value={draft.city ?? ""}
                  onChange={(e) => update({ city: e.target.value || null })}
                  autoComplete="address-level2"
                  required
                />
                <TextField
                  label="State"
                  value={draft.state ?? ""}
                  onChange={(e) => update({ state: e.target.value || null })}
                  autoComplete="address-level1"
                  required
                />
                <TextField
                  label="Postal code"
                  value={draft.postal_code ?? ""}
                  onChange={(e) =>
                    update({ postal_code: e.target.value || null })
                  }
                  autoComplete="postal-code"
                  required
                />
                <TextField
                  label="Country"
                  value={draft.country ?? "US"}
                  onChange={(e) =>
                    update({ country: e.target.value.toUpperCase() || null })
                  }
                  slotProps={{ htmlInput: { maxLength: 2 } }}
                  autoComplete="country"
                  required
                />
                <TextField
                  label="Main phone"
                  value={draft.phone ?? ""}
                  onChange={(e) => update({ phone: e.target.value || null })}
                  autoComplete="tel"
                />
                <TextField
                  label="Point of contact"
                  value={draft.contact_name ?? ""}
                  onChange={(e) =>
                    update({ contact_name: e.target.value || null })
                  }
                />
                <TextField
                  label="Contact email"
                  type="email"
                  value={draft.contact_email ?? ""}
                  onChange={(e) =>
                    update({ contact_email: e.target.value || null })
                  }
                  autoComplete="email"
                />
              </div>
              {address(draft) && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  Delivery address preview: {address(draft)}
                </Typography>
              )}
            </section>
            <section>
              <Typography variant="h3" sx={{ mb: 1 }}>
                Regular operating hours
              </Typography>
              <Stack spacing={1}>
                {days.map(([day, label]) => {
                  const hour = hours.find(
                    (item) => item.day_of_week === day,
                  ) ?? {
                    day_of_week: day,
                    closed: true,
                    open_time: null,
                    close_time: null,
                  };
                  const changeHour = (changes: Partial<EditableHour>) =>
                    update({
                      operating_hours: hours.map((item) =>
                        item.day_of_week === day
                          ? { ...item, ...changes }
                          : item,
                      ),
                    });
                  return (
                    <div className="facility-hours-row" key={day}>
                      <Typography sx={{ width: 110 }}>{label}</Typography>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={hour.closed}
                            onChange={(e) =>
                              changeHour({
                                closed: e.target.checked,
                                open_time: e.target.checked
                                  ? null
                                  : (hour.open_time ?? "08:00"),
                                close_time: e.target.checked
                                  ? null
                                  : (hour.close_time ?? "17:00"),
                              })
                            }
                          />
                        }
                        label="Closed"
                      />
                      <TextField
                        label="Opens"
                        type="time"
                        size="small"
                        disabled={hour.closed}
                        value={hour.open_time ?? ""}
                        onChange={(e) =>
                          changeHour({ open_time: e.target.value })
                        }
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <TextField
                        label="Closes"
                        type="time"
                        size="small"
                        disabled={hour.closed}
                        value={hour.close_time ?? ""}
                        onChange={(e) =>
                          changeHour({ close_time: e.target.value })
                        }
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    </div>
                  );
                })}
              </Stack>
            </section>
            <section>
              <Stack spacing={1}>
                {exceptions.map((item, index) => {
                  const change = (changes: Partial<EditableException>) =>
                    update({
                      hour_exceptions: exceptions.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, ...changes } : row,
                      ),
                    });
                  return (
                    <div
                      className="facility-hours-row"
                      key={`${item.date}-${index}`}
                    >
                      <TextField
                        label="Date"
                        type="date"
                        size="small"
                        value={item.date}
                        onChange={(e) => change({ date: e.target.value })}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={item.closed}
                            onChange={(e) =>
                              change({
                                closed: e.target.checked,
                                open_time: e.target.checked
                                  ? null
                                  : (item.open_time ?? "08:00"),
                                close_time: e.target.checked
                                  ? null
                                  : (item.close_time ?? "17:00"),
                              })
                            }
                          />
                        }
                        label="Closed"
                      />
                      <TextField
                        label="Opens"
                        type="time"
                        size="small"
                        disabled={item.closed}
                        value={item.open_time ?? ""}
                        onChange={(e) => change({ open_time: e.target.value })}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <TextField
                        label="Closes"
                        type="time"
                        size="small"
                        disabled={item.closed}
                        value={item.close_time ?? ""}
                        onChange={(e) => change({ close_time: e.target.value })}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <TextField
                        label="Reason"
                        size="small"
                        value={item.reason ?? ""}
                        onChange={(e) => change({ reason: e.target.value })}
                      />
                      <Button
                        type="button"
                        color="inherit"
                        onClick={() =>
                          update({
                            hour_exceptions: exceptions.filter(
                              (_, rowIndex) => rowIndex !== index,
                            ),
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </Stack>
            </section>
            <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
              <Button
                type="submit"
                variant="contained"
                disabled={
                  !canWrite ||
                  saving ||
                  !draft.name.trim() ||
                  !draft.code.trim()
                }
                startIcon={<SaveOutlinedIcon />}
              >
                {saving ? "Saving…" : "Save facility"}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </div>
    </div>
  );
}
