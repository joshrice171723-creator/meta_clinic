import { useId, useState } from "react";
import {
  Alert,
  Button,
  FormControl,
  InputLabel,
  ListSubheader,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";
import type {
  DevelopmentAccount,
  RuntimeEnvironment,
} from "../../api/contracts";
import { api } from "../../api/client";

export function EnvironmentLabel({
  environment,
}: {
  environment: RuntimeEnvironment;
}) {
  const label =
    environment === "production"
      ? "Production"
      : environment === "test"
        ? "Test environment"
        : environment === "development"
          ? "Development environment"
          : "Checking environment";
  return (
    <span className={`environment-label environment-${environment}`}>
      {label}
    </span>
  );
}

export function DevelopmentAccountSwitcher({
  accounts,
  activeId,
}: {
  accounts: DevelopmentAccount[];
  activeId?: string | null;
}) {
  const labelId = useId();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const employeeAccounts = accounts.filter(
    (account) => account.account_type === "employee",
  );
  const customerAccounts = accounts.filter(
    (account) => account.account_type === "customer",
  );

  const switchAccount = async (event: SelectChangeEvent<string>) => {
    const profile = event.target.value;
    if (!profile || profile === activeId) return;
    setSwitching(true);
    setError("");
    try {
      const result = await api<{ destination: string }>(
        "/api/development_session",
        { method: "POST", body: { profile } },
      );
      window.location.assign(result.destination);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to switch development accounts.",
      );
      setSwitching(false);
    }
  };

  return (
    <Stack className="development-account-switcher" spacing={0.75}>
      <FormControl size="small" disabled={switching || accounts.length === 0}>
        <InputLabel id={labelId}>Active account</InputLabel>
        <Select
          labelId={labelId}
          label="Active account"
          value={activeId || ""}
          onChange={switchAccount}
          displayEmpty={false}
          sx={{ minWidth: 260, bgcolor: "background.paper" }}
        >
          <MenuItem value="" disabled>
            Choose an account
          </MenuItem>
          {employeeAccounts.length > 0 && (
            <ListSubheader>Employee portal</ListSubheader>
          )}
          {employeeAccounts.map((account) => (
            <MenuItem key={account.id} value={account.id}>
              {account.label} — {account.email_address}
            </MenuItem>
          ))}
          {customerAccounts.length > 0 && (
            <ListSubheader>Customer portal</ListSubheader>
          )}
          {customerAccounts.map((account) => (
            <MenuItem key={account.id} value={account.id}>
              {account.label} — {account.email_address}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {switching && (
        <Typography variant="caption" role="status">
          Switching account…
        </Typography>
      )}
      {accounts.length === 0 && (
        <Typography variant="caption">
          No prepared development accounts are available.
        </Typography>
      )}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

export function DevelopmentDatePicker({
  businessDate,
}: {
  businessDate: string;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
          : "Unable to change the development date.",
      );
      setSaving(false);
    }
  };

  return (
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <TextField
          label="App date"
          type="date"
          size="small"
          value={businessDate}
          disabled={saving}
          onChange={(event) => void save(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button size="small" disabled={saving} onClick={() => void save("")}>
          Use today
        </Button>
      </Stack>
      <Typography variant="caption">
        Uses the real current time with this date.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

export function DevelopmentControls({
  accounts,
  activeId,
  businessDate,
}: {
  accounts: DevelopmentAccount[];
  activeId?: string | null;
  businessDate: string;
}) {
  return (
    <Stack
      className="development-controls"
      direction={{ xs: "column", md: "row" }}
      spacing={1.5}
      sx={{ alignItems: { xs: "stretch", md: "flex-start" } }}
    >
      <DevelopmentAccountSwitcher accounts={accounts} activeId={activeId} />
      <DevelopmentDatePicker businessDate={businessDate} />
    </Stack>
  );
}
