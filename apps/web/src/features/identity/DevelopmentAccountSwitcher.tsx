import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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

const LOGIN_NAVIGATION_DEADLINE_MS = 8_000;

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
  const hostname =
    typeof window === "undefined" ? "" : window.location.hostname;
  const local =
    hostname === "localhost" ||
    hostname === "[::1]" ||
    /^127(?:\.(?:\d{1,3})){3}$/.test(hostname);
  const label =
    environment === "production"
      ? "Production"
      : environment === "test"
        ? "Test"
        : environment === "development"
          ? "Omni"
          : local
            ? "Local development"
            : null;
  if (!label) return null;
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
  onScopeChange,
  disabled,
}: {
  accounts: DevelopmentAccount[];
  portal: DevelopmentPortal;
  selectedId: string;
  onSelect: (id: string) => void;
  onScopeChange?: (scope: { practiceId: string; siteId: string }) => void;
  disabled: boolean;
}) {
  const portalDefinition = DEVELOPMENT_PORTALS[portal];
  const visibleAccounts = accounts.filter((account) =>
    portalDefinition.accountTypes.includes(account.account_type),
  );
  const selectedAccount = visibleAccounts.find(
    (account) => account.id === selectedId,
  );
  const scopedAccounts = visibleAccounts.filter((account) => account.clinic);
  const organizations = useMemo(
    () => [
      ...new Map(
        scopedAccounts.map((account) => [
          String(account.organization?.id ?? "independent"),
          account.organization?.name ?? "Independent clinics",
        ]),
      ).entries(),
    ],
    [scopedAccounts],
  );
  const [organizationId, setOrganizationId] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [siteId, setSiteId] = useState("");
  const clinics = scopedAccounts.filter(
    (account) =>
      String(account.organization?.id ?? "independent") === organizationId,
  );
  const clinicOptions = [
    ...new Map(
      clinics.map((account) => [String(account.clinic!.id), account.clinic!]),
    ).values(),
  ];
  const locations = [
    ...new Map(
      clinics
        .filter((account) => String(account.clinic?.id) === clinicId)
        .flatMap((account) => account.locations ?? [])
        .map((site) => [String(site.id), site]),
    ).values(),
  ];
  const noLocations = clinicId !== "" && locations.length === 0;
  const hierarchyAvailable = portal === "clinic" && scopedAccounts.length > 0;

  useEffect(() => {
    if (!clinicId || locations.length !== 1) return;
    const onlyLocation = String(locations[0].id);
    if (siteId === onlyLocation) return;
    setSiteId(onlyLocation);
    onScopeChange?.({ practiceId: clinicId, siteId: onlyLocation });
  }, [clinicId, locations, onScopeChange, siteId]);

  useEffect(() => {
    setOrganizationId("");
    setClinicId("");
    setSiteId("");
    onSelect("");
    onScopeChange?.({ practiceId: "", siteId: "" });
  }, [portal]);

  return (
    <Stack className="development-account-switcher" spacing={0.75}>
      {hierarchyAvailable && (
        <>
          <TextField
            select
            size="small"
            label="Organization"
            value={organizationId}
            disabled={disabled}
            onChange={(event) => {
              setOrganizationId(event.target.value);
              setClinicId("");
              setSiteId("");
              onSelect("");
              onScopeChange?.({ practiceId: "", siteId: "" });
            }}
          >
            <MenuItem value="" disabled>
              Select organization
            </MenuItem>
            {organizations.map(([id, name]) => (
              <MenuItem key={id} value={id}>
                {name} · ID {id}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Clinic"
            value={clinicId}
            disabled={disabled || !organizationId}
            onChange={(event) => {
              const nextClinicId = String(event.target.value);
              setClinicId(nextClinicId);
              setSiteId("");
              onSelect("");
              onScopeChange?.({ practiceId: nextClinicId, siteId: "" });
            }}
          >
            <MenuItem value="" disabled>
              Select clinic
            </MenuItem>
            {clinicOptions.map((clinic) => (
              <MenuItem key={clinic.id} value={String(clinic.id)}>
                {clinic.name} · ID {clinic.id}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Location"
            value={siteId}
            disabled={disabled || !clinicId || noLocations}
            onChange={(event) => {
              const nextSiteId = String(event.target.value);
              setSiteId(nextSiteId);
              onSelect("");
              onScopeChange?.({ practiceId: clinicId, siteId: nextSiteId });
            }}
          >
            <MenuItem value="" disabled>
              {noLocations ? "No accessible locations" : "Select location"}
            </MenuItem>
            {locations.map((site) => (
              <MenuItem key={site.id} value={String(site.id)}>
                {site.name || site.code} · ID {site.id}
              </MenuItem>
            ))}
          </TextField>
        </>
      )}
      <FormControl
        size="small"
        disabled={
          disabled ||
          visibleAccounts.length === 0 ||
          (hierarchyAvailable && !siteId && !noLocations)
        }
      >
        <Select
          className="development-account-select"
          value={selectedAccount?.id || ""}
          onChange={(event) => onSelect(event.target.value)}
          displayEmpty
          renderValue={() =>
            selectedAccount?.label ||
            `Select ${portalDefinition.accountLabel} account`
          }
          inputProps={{
            "aria-label": `Select ${portalDefinition.accountLabel} account`,
          }}
          sx={{ minWidth: 0, bgcolor: "background.paper" }}
        >
          <MenuItem value="" disabled>
            Select {portalDefinition.accountLabel} account
          </MenuItem>
          {(hierarchyAvailable
            ? clinics.filter(
                (account) =>
                  noLocations ||
                  account.locations?.some((site) => String(site.id) === siteId),
              )
            : visibleAccounts
          ).map((account) => (
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
  const [scope, setScope] = useState({ practiceId: "", siteId: "" });
  const requiresClinicScope =
    portal === "clinic" && accounts.some((account) => account.clinic);
  const [error, setError] = useState("");
  const [entryDestination, setEntryDestination] = useState("");
  const navigationTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (navigationTimer.current !== null)
        window.clearTimeout(navigationTimer.current);
    },
    [],
  );

  const openWorkspace = (destination: string) => {
    if (navigationTimer.current !== null)
      window.clearTimeout(navigationTimer.current);
    setEntryDestination(destination);
    setSwitching(true);
    setError("");
    navigationTimer.current = window.setTimeout(() => {
      navigationTimer.current = null;
      setSwitching(false);
      setError(
        "You're signed in, but the workspace did not open. Select Open workspace to continue without signing in again.",
      );
    }, LOGIN_NAVIGATION_DEADLINE_MS);
    try {
      window.location.assign(destination);
    } catch {
      if (navigationTimer.current !== null)
        window.clearTimeout(navigationTimer.current);
      navigationTimer.current = null;
      setSwitching(false);
      setError(
        "You're signed in, but the workspace could not open. Select Open workspace to try again without signing in again.",
      );
    }
  };

  const selectPortal = (
    _event: MouseEvent<HTMLElement>,
    nextPortal: DevelopmentPortal | null,
  ) => {
    if (!nextPortal || nextPortal === portal) return;
    setPortal(nextPortal);
    setSelectedId("");
    setEntryDestination("");
    setError("");
  };

  const logIn = async () => {
    if (entryDestination) {
      openWorkspace(entryDestination);
      return;
    }
    if (!selectedId) return;
    setSwitching(true);
    setError("");
    try {
      const result = await api<{ destination: string }>(
        "/api/development_session",
        {
          method: "POST",
          body: {
            profile: selectedId,
            portal,
            practice_id: scope.practiceId,
            site_id: scope.siteId,
          },
        },
      );
      openWorkspace(loginDestination(result.destination));
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
        disabled={switching || Boolean(entryDestination)}
        onChange={selectPortal}
        aria-label="Development sign-in destination"
      >
        {(
          Object.entries(DEVELOPMENT_PORTALS) as [
            DevelopmentPortal,
            (typeof DEVELOPMENT_PORTALS)[DevelopmentPortal],
          ][]
        ).map(([value, definition]) => (
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
          onScopeChange={setScope}
          disabled={switching || Boolean(entryDestination)}
        />
        <DevelopmentDatePicker businessDate={businessDate} />
        <Button href="/memberships" size="small" variant="outlined">
          Future patient
        </Button>
        <Button
          className="development-login-button"
          variant="contained"
          size="small"
          disabled={
            switching ||
            (!entryDestination &&
              (!selectedId || (requiresClinicScope && !scope.practiceId)))
          }
          onClick={() => void logIn()}
        >
          {switching
            ? entryDestination
              ? "Opening…"
              : "Entering…"
            : entryDestination
              ? "Open workspace"
              : "Log in"}
        </Button>
      </Stack>
      {error && (
        <Alert
          severity="error"
          action={
            entryDestination ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => openWorkspace(entryDestination)}
              >
                Open workspace
              </Button>
            ) : undefined
          }
        >
          {error}
        </Alert>
      )}
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
