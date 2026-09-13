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

type DevelopmentPortal = "owner" | "launch" | "patient" | "clinic";

const DEVELOPMENT_PORTALS: Record<
  DevelopmentPortal,
  {
    accountTypes: DevelopmentAccount["account_type"][];
    accountLabel: string;
    label: string;
  }
> = {
  owner: { accountTypes: ["omni"], accountLabel: "owner", label: "Owner" },
  launch: { accountTypes: ["omni"], accountLabel: "launch", label: "Launch" },
  patient: {
    accountTypes: ["patient"],
    accountLabel: "patient",
    label: "Patient",
  },
  clinic: {
    accountTypes: ["employee", "omni"],
    accountLabel: "clinic team",
    label: "Clinic",
  },
};

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
  portal,
  selectedId,
  onSelect,
  disabled,
}: {
  accounts: DevelopmentAccount[];
  portal: DevelopmentPortal;
  selectedId: string;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const portalDefinition = DEVELOPMENT_PORTALS[portal];
  const visibleAccounts = accounts.filter(
    (account) => portalDefinition.accountTypes.includes(account.account_type),
  );
  const selectedAccount = visibleAccounts.find(
    (account) => account.id === selectedId,
  );

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
            selectedAccount?.label || `Select ${portalDefinition.accountLabel} account`
          }
          inputProps={{
            "aria-label": `Select ${portalDefinition.accountLabel} account`,
          }}
          sx={{ minWidth: 0, bgcolor: "background.paper" }}
        >
          <MenuItem value="" disabled>
            Select {portalDefinition.accountLabel} account
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
          No {portalDefinition.accountLabel} accounts are available.
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
  initialPortal = "clinic",
}: {
  accounts: DevelopmentAccount[];
  activeId?: string | null;
  businessDate: string;
  initialPortal?: DevelopmentPortal;
}) {
  const activeAccount = accounts.find((account) => account.id === activeId);
  const [portal, setPortal] = useState<DevelopmentPortal>(initialPortal);
  const [selectedId, setSelectedId] = useState(activeAccount?.id || "");
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  const selectPortal = (
    _event: MouseEvent<HTMLElement>,
    nextPortal: DevelopmentPortal | null,
  ) => {
    if (!nextPortal || nextPortal === portal) return;
    setPortal(nextPortal);
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
        { method: "POST", body: { profile: selectedId, portal } },
      );
      window.location.assign(loginDestination(result.destination));
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
      <ToggleButtonGroup
        className="development-portal-toggle"
        value={portal}
        exclusive
        size="small"
        onChange={selectPortal}
        aria-label="Development sign-in destination"
      >
        {(Object.entries(DEVELOPMENT_PORTALS) as [
          DevelopmentPortal,
          (typeof DEVELOPMENT_PORTALS)[DevelopmentPortal],
        ][]).map(([value, definition]) => (
          <ToggleButton key={value} value={value}>
            {definition.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Stack
        className="development-control-row"
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", flexWrap: "wrap" }}
      >
        <DevelopmentAccountSwitcher
          accounts={accounts}
          portal={portal}
          selectedId={selectedId}
          onSelect={setSelectedId}
          disabled={switching}
        />
        <DevelopmentDatePicker businessDate={businessDate} />
        <Button href="/memberships" size="small" variant="outlined">
          Future patient
        </Button>
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
        initialPortal="clinic"
      />
    </Stack>
  );
}
