import { useEffect, useState, type MouseEvent } from "react";
import {
  Alert,
  Button,
  FormControl,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type {
  DevelopmentAccount,
  RuntimeEnvironment,
} from "../../api/contracts";
import { api, loginDestination } from "../../api/client";

export function EnvironmentLabel({
  environment,
}: {
  environment: RuntimeEnvironment;
}) {
  const label =
    environment === "production"
      ? "Production"
      : environment === "test"
        ? "Test"
        : environment === "development"
          ? "Omni"
          : "Checking";
  return (
    <span className={`environment-label environment-${environment}`}>
      {label}
    </span>
  );
}

export function DevelopmentAccountSwitcher({
  accounts,
  portalType,
  selectedId,
  onSelect,
  disabled,
}: {
  accounts: DevelopmentAccount[];
  portalType: DevelopmentAccount["account_type"];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const visibleAccounts = accounts.filter(
    (account) => account.account_type === portalType,
  );
  const selectedAccount = visibleAccounts.find(
    (account) => account.id === selectedId,
  );
  const portalLabel =
    portalType === "patient"
      ? "patient"
      : portalType === "omni"
        ? "Omni"
        : "employee";

  return (
    <Stack className="development-account-switcher" spacing={0.75}>
      <FormControl
        size="small"
        disabled={disabled || visibleAccounts.length === 0}
      >
        <Select
          className="development-account-select"
          value={selectedAccount?.id || ""}
          onChange={(event) => onSelect(event.target.value)}
          displayEmpty
          renderValue={() =>
            selectedAccount?.label || `Select ${portalLabel} account`
          }
          inputProps={{ "aria-label": `Select ${portalLabel} account` }}
          sx={{ minWidth: 0, bgcolor: "background.paper" }}
        >
          <MenuItem value="" disabled>
            Select {portalLabel} account
          </MenuItem>
          {visibleAccounts.map((account) => (
            <MenuItem key={account.id} value={account.id}>
              {account.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {visibleAccounts.length === 0 && (
        <Typography variant="caption">
          No {portalLabel} accounts are available.
        </Typography>
      )}
    </Stack>
  );
}

export function DevelopmentDatePicker({
  businessDate,
}: {
  businessDate: string;
}) {
  const [draftDate, setDraftDate] = useState(businessDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setDraftDate(businessDate), [businessDate]);

  const save = async (date: string) => {
    setSaving(true);
    setError("");
    try {
      await api("/api/development_date", {
        method: "PATCH",
        body: { date },
      });
      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to change the app date.",
      );
      setSaving(false);
    }
  };

  return (
    <Stack className="development-date-picker" spacing={0.5}>
      <Stack
        className="development-date-row"
        direction="row"
        spacing={0.75}
        sx={{ alignItems: "center" }}
      >
        <TextField
          className="development-date-input"
          label="App date"
          type="date"
          size="small"
          value={draftDate}
          disabled={saving}
          onChange={(event) => {
            setDraftDate(event.target.value);
            setError("");
          }}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: "2000-01-01", max: "2100-12-31" },
          }}
        />
        <Button
          size="small"
          disabled={saving || !draftDate || draftDate === businessDate}
          onClick={() => void save(draftDate)}
        >
          Apply date
        </Button>
        <Button size="small" disabled={saving} onClick={() => void save("")}>
          Today
        </Button>
      </Stack>
      <Typography className="development-date-note" variant="caption">
        Changes workflow dates only. Login and permissions use real time.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

export function DevelopmentControls({
  accounts,
  activeId,
  businessDate,
  returnTo,
}: {
  accounts: DevelopmentAccount[];
  activeId?: string | null;
  businessDate: string;
  returnTo?: string | null;
}) {
  const activeAccount = accounts.find((account) => account.id === activeId);
  const [portalType, setPortalType] = useState<
    DevelopmentAccount["account_type"]
  >(activeAccount?.account_type || "patient");
  const [selectedId, setSelectedId] = useState(activeAccount?.id || "");
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  const selectPortal = (
    _event: MouseEvent<HTMLElement>,
    nextPortal: DevelopmentAccount["account_type"] | null,
  ) => {
    if (!nextPortal || nextPortal === portalType) return;
    setPortalType(nextPortal);
    setSelectedId("");
    setError("");
  };

  const logIn = async () => {
    if (!selectedId) return;
    setSwitching(true);
    setError("");
    try {
      const result = await api<{ destination: string }>(
        "/api/development_session",
        { method: "POST", body: { profile: selectedId } },
      );
      window.location.assign(
        returnTo ? loginDestination(returnTo) : result.destination,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to enter the selected account.",
      );
      setSwitching(false);
    }
  };

  return (
    <Stack className="development-controls" spacing={0.75}>
      <Stack
        className="development-portal-actions"
        direction="row"
        spacing={0.5}
      >
        <ToggleButtonGroup
          className="development-portal-toggle"
          value={portalType}
          exclusive
          size="small"
          onChange={selectPortal}
          aria-label="Portal type"
        >
          <ToggleButton value="patient">Patient portal</ToggleButton>
          <ToggleButton value="employee">Employee portal</ToggleButton>
          <ToggleButton value="omni">Omni</ToggleButton>
        </ToggleButtonGroup>
        <Button
          className="development-owner-portal-button"
          variant="outlined"
          size="small"
          href="/owner"
        >
          Owner portal
        </Button>
      </Stack>
      <Stack
        className="development-control-row"
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", flexWrap: "wrap" }}
      >
        <DevelopmentAccountSwitcher
          accounts={accounts}
          portalType={portalType}
          selectedId={selectedId}
          onSelect={setSelectedId}
          disabled={switching}
        />
        <DevelopmentDatePicker businessDate={businessDate} />
        <Button
          className="development-login-button"
          variant="contained"
          size="small"
          disabled={switching || !selectedId}
          onClick={() => void logIn()}
        >
          {switching ? "Entering…" : "Log in"}
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

export function DevelopmentToolbar({
  accounts,
  activeId,
  businessDate,
  environment,
  className = "",
}: {
  accounts: DevelopmentAccount[];
  activeId?: string | null;
  businessDate: string;
  environment: RuntimeEnvironment;
  className?: string;
}) {
  return (
    <Stack
      component="aside"
      className={`development-toolbar ${className}`.trim()}
      aria-label="Workspace tools"
      direction={{ xs: "column", lg: "row" }}
      spacing={1.5}
    >
      <Stack
        className="development-toolbar-heading"
        direction="row"
        spacing={1}
        sx={{ alignItems: "center" }}
      >
        <Typography component="h2">Workspace tools</Typography>
        <EnvironmentLabel environment={environment} />
      </Stack>
      <DevelopmentControls
        accounts={accounts}
        activeId={activeId}
        businessDate={businessDate}
      />
    </Stack>
  );
}
