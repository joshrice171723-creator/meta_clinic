import { useId, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Checkbox,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  InputLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import { api, ApiError, csrf } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import type {
  EmploymentAdminData,
  WorkforceEmployment,
  WorkforceSite,
} from "./foundationTypes";
import { businessNow } from "../../shared/businessDate";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";

function localDateTime() {
  const current = businessNow();
  const now = new Date(
    current.getTime() - current.getTimezoneOffset() * 60_000,
  );
  return now.toISOString().slice(0, 16);
}

function roleLabel(roleCode: string) {
  return roleCode
    .replace(/^workforce-/, "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

type Feedback = { severity: "success" | "error"; text: string };

function EmploymentAccessEditor({
  employment,
  roles,
  sites,
  refresh,
  setFeedback,
}: {
  employment: WorkforceEmployment;
  roles: EmploymentAdminData["role_options"];
  sites: WorkforceSite[];
  refresh: () => void;
  setFeedback: (feedback: Feedback | null) => void;
}) {
  const activeRole = employment.roles[0];
  const [roleVersionId, setRoleVersionId] = useState(
    activeRole ? String(activeRole.role_version_id) : "",
  );
  const [siteIds, setSiteIds] = useState(
    employment.sites.filter((site) => site.active).map((site) => site.id),
  );
  const [saving, setSaving] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const toggleSite = (siteId: number) =>
    setSiteIds((current) =>
      current.includes(siteId)
        ? current.filter((id) => id !== siteId)
        : [...current, siteId],
    );
  const update = async (accountAction?: "revoke" | "restore") => {
    setSaving(true);
    setFeedback(null);
    try {
      await api(`/api/clinic/workforce/employments/${employment.id}`, {
        method: "PATCH",
        body: {
          employment: {
            role_version_id: roleVersionId,
            site_ids: siteIds,
            ...(accountAction ? { account_action: accountAction } : {}),
          },
        },
      });
      setFeedback({
        severity: "success",
        text:
          accountAction === "revoke"
            ? "The clinic account was revoked and its sessions were closed."
            : accountAction === "restore"
              ? "The clinic account was restored with the selected role and sites."
              : "Employee role and work sites updated.",
      });
      refresh();
    } catch (reason) {
      setFeedback({
        severity: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to update employee access.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={1.5} sx={{ minWidth: { md: 360 } }}>
      <FormControl size="small" fullWidth>
        <InputLabel id={`employment-${employment.id}-role-label`}>
          Access role
        </InputLabel>
        <Select
          labelId={`employment-${employment.id}-role-label`}
          label="Access role"
          value={roleVersionId}
          onChange={(event) => setRoleVersionId(event.target.value)}
        >
          {roles.map((role) => (
            <MenuItem key={role.id} value={String(role.id)}>
              {role.label || roleLabel(role.role_code)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormGroup row>
        {sites.map((site) => (
          <FormControlLabel
            key={site.id}
            control={
              <Checkbox
                size="small"
                checked={siteIds.includes(site.id)}
                onChange={() => toggleSite(site.id)}
              />
            }
            label={site.name}
          />
        ))}
      </FormGroup>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button
          variant="outlined"
          disabled={saving || !roleVersionId || siteIds.length === 0}
          onClick={() => void update()}
        >
          Save role and sites
        </Button>
      </Stack>
      <Divider />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button
          color={employment.membership_summary.active ? "warning" : "primary"}
          disabled={
            saving ||
            (!employment.membership_summary.active &&
              (!roleVersionId || siteIds.length === 0))
          }
          onClick={() =>
            employment.membership_summary.active
              ? setRevokeOpen(true)
              : void update("restore")
          }
        >
          {employment.membership_summary.active
            ? "Revoke clinic account"
            : "Restore clinic account"}
        </Button>
        {!employment.membership_summary.active &&
          employment.active_work_by_site.some(({ count }) => count > 0) && (
            <Button
              href="/clinic/work?assignment=offboarded"
              variant="outlined"
            >
              Review work needing coverage
            </Button>
          )}
      </Stack>
      <Dialog open={revokeOpen} onClose={() => setRevokeOpen(false)}>
        <DialogTitle>
          Revoke {employment.staff_member.display_name}’s clinic account?
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Typography>
              Active assigned work stays with this employee. Eligible staff can
              claim it from the clinical work queue.
            </Typography>
            <Typography variant="subtitle2">Active work by location</Typography>
            {employment.active_work_by_site.length ? (
              employment.active_work_by_site.map(({ site_id, count }) => (
                <Typography key={site_id ?? "no-site"}>
                  {sites.find((site) => site.id === site_id)?.name ??
                    employment.sites.find((site) => site.id === site_id)
                      ?.name ??
                    (site_id ? `Site ${site_id}` : "No location")}
                  : {count}
                </Typography>
              ))
            ) : (
              <Typography>No active assigned work.</Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              Counts reflect the employment list when it was loaded.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevokeOpen(false)}>Cancel</Button>
          <Button
            color="warning"
            disabled={saving}
            onClick={() => {
              setRevokeOpen(false);
              void update("revoke");
            }}
          >
            Revoke account
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export function EmploymentAdminPage() {
  const fieldId = useId();
  const { data, error, refresh } = useResource<EmploymentAdminData>(
    "/api/clinic/workforce/employments",
  );
  const [displayName, setDisplayName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [accountMode, setAccountMode] = useState<"existing" | "new">("new");
  const [membershipId, setMembershipId] = useState("");
  const [roleVersionId, setRoleVersionId] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [siteIds, setSiteIds] = useState<number[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState(localDateTime);
  const initialEffectiveFrom = useRef(effectiveFrom);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [activationToken, setActivationToken] = useState<string | null>(null);
  const [activationPath, setActivationPath] = useState<string | null>(null);
  const [setupRoleCode, setSetupRoleCode] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState<{
    mode: "existing" | "new";
    displayName: string;
    membershipId: string;
    email: string;
    roleCode: string;
    previousIds: number[];
  } | null>(null);
  const { registerBlocker } = useClinicNavigation();
  const defaultRoleId = data?.role_options.find(
    (role) => role.role_code === "workforce-employee",
  )?.id;
  const dirty = Boolean(
    displayName ||
    jobTitle ||
    emailAddress ||
    membershipId ||
    siteIds.length ||
    accountMode !== "new" ||
    effectiveFrom !== initialEffectiveFrom.current ||
    (roleVersionId && roleVersionId !== String(defaultRoleId)),
  );
  useDemoNavigationBlocker(() => ({
    blocked: saving || unconfirmed !== null,
    message: null,
  }));
  useEffect(() => {
    if (!dirty) return;
    const warning = "Discard your unsaved employee setup?";
    const unregister = registerBlocker(() => warning);
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warning;
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty, registerBlocker]);

  useEffect(() => {
    if (roleVersionId || !data) return;
    const employeeRole = data.role_options.find(
      (role) => role.role_code === "workforce-employee",
    );
    if (employeeRole) setRoleVersionId(String(employeeRole.id));
  }, [data, roleVersionId]);

  if (!data) return <LoadState error={error} />;

  const frontDeskRole = data.role_options.find(
    (role) => role.role_code === "front-desk-coordinator",
  );
  const clinicianSetupNeeded =
    setupRoleCode === "clinician" ||
    data.role_options.find((role) => String(role.id) === roleVersionId)
      ?.role_code === "clinician";
  const frontDeskTitle = /front[\s-]*desk/i.test(jobTitle);
  const reset = () => {
    setAccountMode("new");
    setDisplayName("");
    setJobTitle("");
    setMembershipId("");
    setRoleVersionId("");
    setEmailAddress("");
    setSiteIds([]);
    initialEffectiveFrom.current = localDateTime();
    setEffectiveFrom(initialEffectiveFrom.current);
  };
  const checkSavedSetup = async () => {
    if (!unconfirmed || saving) return;
    setSaving(true);
    try {
      const saved = await api<EmploymentAdminData>(
        "/api/clinic/workforce/employments",
      );
      const confirmed =
        unconfirmed.mode === "existing"
          ? saved.employments.some(
              (record) =>
                !unconfirmed.previousIds.includes(record.id) &&
                String(record.membership_summary.id) ===
                  unconfirmed.membershipId &&
                record.staff_member.display_name === unconfirmed.displayName,
            )
          : saved.invitations.some(
              (record) =>
                !unconfirmed.previousIds.includes(record.id) &&
                record.email_address.trim().toLowerCase() ===
                  unconfirmed.email &&
                record.display_name === unconfirmed.displayName &&
                record.role_code === unconfirmed.roleCode,
            );
      if (!confirmed)
        throw new Error(
          "The saved setup is not yet confirmed. Keep this page open; do not submit another setup.",
        );
      setUnconfirmed(null);
      reset();
      refresh();
      setFeedback({
        severity: "success",
        text: "Employee setup confirmed in saved records. Any one-time activation link was not recovered; review the pending invitation before another action.",
      });
    } catch (reason) {
      setFeedback({
        severity: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to confirm the saved setup.",
      });
    } finally {
      setSaving(false);
    }
  };
  const toggleSite = (siteId: number) =>
    setSiteIds((current) =>
      current.includes(siteId)
        ? current.filter((id) => id !== siteId)
        : [...current, siteId],
    );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || unconfirmed) return;
    setSaving(true);
    setFeedback(null);
    setActivationToken(null);
    setActivationPath(null);
    setSetupRoleCode(null);
    const attempt = {
      mode: accountMode,
      displayName,
      membershipId,
      email: emailAddress.trim().toLowerCase(),
      roleCode:
        data.role_options.find((role) => String(role.id) === roleVersionId)
          ?.role_code ?? "",
      previousIds: (accountMode === "existing"
        ? data.employments
        : data.invitations
      ).map((record) => record.id),
    };
    let submitted = false;
    try {
      const isoEffectiveFrom = new Date(effectiveFrom).toISOString();
      await csrf();
      submitted = true;
      if (accountMode === "existing") {
        await api("/api/clinic/workforce/employments", {
          method: "POST",
          body: {
            employment: {
              display_name: displayName,
              job_title: jobTitle,
              membership_id: membershipId,
              role_version_id: roleVersionId,
              site_ids: siteIds,
              effective_from: isoEffectiveFrom,
            },
          },
        });
        setSetupRoleCode(
          data.role_options.find((role) => String(role.id) === roleVersionId)
            ?.role_code ?? null,
        );
        setFeedback({
          severity: "success",
          text: "The clinic account is now linked to this employee.",
        });
      } else {
        const result = await api<{
          invitation: {
            activation_token_once: string;
            activation_path: string;
            expires_at: string;
          };
        }>("/api/clinic/workforce/onboarding", {
          method: "POST",
          body: {
            employee_invitation: {
              display_name: displayName,
              job_title: jobTitle,
              email_address: emailAddress,
              role_version_id: roleVersionId,
              site_ids: siteIds,
              effective_from: isoEffectiveFrom,
            },
          },
        });
        setSetupRoleCode(
          data.role_options.find((role) => String(role.id) === roleVersionId)
            ?.role_code ?? null,
        );
        setActivationToken(result.invitation.activation_token_once);
        setActivationPath(result.invitation.activation_path);
        setFeedback({
          severity: "success",
          text: `Invitation created. The token expires ${new Date(result.invitation.expires_at).toLocaleString()}.`,
        });
      }
      reset();
      refresh();
    } catch (reason) {
      if (
        submitted &&
        (!(reason instanceof ApiError) ||
          reason.status >= 500 ||
          reason.code === "outcome_unconfirmed")
      ) {
        setUnconfirmed(attempt);
      }
      setFeedback({
        severity: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to set up workforce access.",
      });
    } finally {
      setSaving(false);
    }
  };
  const revokeInvitation = async (id: number) => {
    setSaving(true);
    setFeedback(null);
    setActivationToken(null);
    setActivationPath(null);
    try {
      await api(`/api/clinic/workforce/onboarding/${id}`, {
        method: "PATCH",
        body: { employee_invitation: { action: "revoke" } },
      });
      setFeedback({
        severity: "success",
        text: "The employee invitation was revoked.",
      });
      refresh();
    } catch (reason) {
      setFeedback({
        severity: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to revoke the invitation.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.75}>
        <Typography variant="overline" color="text.secondary">
          TEAM / WORKFORCE
        </Typography>
        <Typography variant="h1">Employees</Typography>
        <Typography color="text.secondary">
          Add an employee, their clinic login access, role, work sites, and
          effective date in one place.
        </Typography>
      </Stack>
      {feedback && <Alert severity={feedback.severity}>{feedback.text}</Alert>}
      {unconfirmed && (
        <Alert
          severity="warning"
          action={
            <Button disabled={saving} onClick={() => void checkSavedSetup()}>
              Check saved employee setup
            </Button>
          }
        >
          This employee setup has an unconfirmed outcome. Account switching and
          another submission stay blocked until saved records confirm it.
        </Alert>
      )}
      {activationToken && (
        <Alert severity="warning">
          <Typography sx={{ fontWeight: 700 }}>
            Share this activation link securely now.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            It is shown only in this response. Meta Clinic does not send it by
            email. The employee will use it to set a password and activate their
            clinic login.
          </Typography>
          <Button
            component="a"
            href={activationPath ?? undefined}
            target="_blank"
            rel="noreferrer"
            sx={{ mb: 1 }}
          >
            Open employee activation
          </Button>
          <TextField
            fullWidth
            value={activationToken}
            label="One-time activation token"
            slotProps={{ htmlInput: { readOnly: true } }}
          />
          <TextField
            fullWidth
            multiline
            minRows={2}
            value={
              activationPath ? `${window.location.origin}${activationPath}` : ""
            }
            label="One-time activation link"
            sx={{ "& textarea": { overflowWrap: "anywhere" } }}
            slotProps={{ htmlInput: { readOnly: true } }}
          />
        </Alert>
      )}
      {clinicianSetupNeeded && (
        <Alert
          severity="info"
          action={
            <Button
              component="a"
              href="/clinic/facilities"
              target="_blank"
              rel="noreferrer"
              color="inherit"
              size="small"
            >
              Open Clinic Setup
            </Button>
          }
        >
          The Clinician access role does not create a scheduling profile. Once
          the account is active, open Clinic Setup to add their authorized
          account at a site and department, then set availability and add them
          to a service offering. Scheduling setup does not verify credentials.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Typography variant="h2" sx={{ mb: 2 }}>
          Current employees
        </Typography>
        <Stack spacing={0} divider={<Divider flexItem />}>
          {data.employments.map((employment) => (
            <Stack
              key={employment.id}
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              sx={{
                py: 2,
                alignItems: { md: "center" },
                justifyContent: "space-between",
              }}
            >
              <Stack spacing={0.5}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center", flexWrap: "wrap" }}
                >
                  <Typography sx={{ fontWeight: 700 }}>
                    {employment.staff_member.display_name}
                  </Typography>
                  <Chip
                    size="small"
                    color={employment.active_for_work ? "success" : "default"}
                    label={employment.active_for_work ? "Active" : "Inactive"}
                  />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {employment.membership_summary.email_address}
                </Typography>
                <Typography variant="body2">
                  {Array.from(
                    new Set(
                      employment.roles.map((role) => roleLabel(role.role_code)),
                    ),
                  ).join(", ") || "Employee"}
                </Typography>
                <Typography variant="body2">
                  {employment.sites
                    .filter((site) => site.active)
                    .map((site) => site.name)
                    .join(", ") || "No eligible sites"}
                </Typography>
              </Stack>
              <EmploymentAccessEditor
                employment={employment}
                roles={data.role_options}
                sites={data.sites}
                refresh={refresh}
                setFeedback={setFeedback}
              />
            </Stack>
          ))}
          {data.employments.length === 0 && (
            <Typography color="text.secondary">
              No employees have workforce access yet.
            </Typography>
          )}
        </Stack>
      </Paper>

      <Accordion
        expanded={setupOpen || dirty || unconfirmed !== null}
        onChange={(_, expanded) => {
          if (expanded || (!dirty && !unconfirmed)) setSetupOpen(expanded);
        }}
        disableGutters
        variant="outlined"
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls="employee-setup-content"
          id="employee-setup-header"
        >
          <Stack spacing={0.5}>
            <Typography variant="h2">Add employee</Typography>
            <Typography variant="body2" color="text.secondary">
              Open to add or link an employee and configure access.
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails id="employee-setup-content">
          <Stack
            component="form"
            spacing={2.5}
            onSubmit={submit}
            inert={unconfirmed !== null}
          >
            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                A new login is created only after the employee activates the
                invitation. The employee record, access role, and workforce
                setup are completed together during activation.
              </Typography>
            </Stack>
            <TextField
              label="Employee name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              autoComplete="name"
              slotProps={{ htmlInput: { maxLength: 120 } }}
            />
            <TextField
              label="Job title"
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              required
              slotProps={{ htmlInput: { maxLength: 120 } }}
            />
            <FormControl>
              <RadioGroup
                row
                value={accountMode}
                onChange={(event) =>
                  setAccountMode(event.target.value as "existing" | "new")
                }
              >
                <FormControlLabel
                  value="new"
                  control={<Radio />}
                  label="Create a new employee login"
                />
                <FormControlLabel
                  value="existing"
                  control={<Radio />}
                  label="Link an existing clinic login"
                />
              </RadioGroup>
            </FormControl>
            {accountMode === "existing" ? (
              <FormControl fullWidth required>
                <InputLabel id={`${fieldId}-1-label`}>
                  Clinic account
                </InputLabel>
                <Select
                  labelId={`${fieldId}-1-label`}
                  label="Clinic account"
                  value={membershipId}
                  onChange={(event) => setMembershipId(event.target.value)}
                >
                  {data.membership_options.map((membership) => (
                    <MenuItem key={membership.id} value={String(membership.id)}>
                      {membership.email_address}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <TextField
                label="Employee email"
                type="email"
                value={emailAddress}
                onChange={(event) => setEmailAddress(event.target.value)}
                required
                autoComplete="email"
              />
            )}
            <FormControl fullWidth required>
              <InputLabel id={`${fieldId}-2-label`}>Access role</InputLabel>
              <Select
                labelId={`${fieldId}-2-label`}
                label="Access role"
                value={roleVersionId}
                onChange={(event) => setRoleVersionId(event.target.value)}
              >
                {data.role_options.map((role) => (
                  <MenuItem key={role.id} value={String(role.id)}>
                    {roleLabel(role.role_code)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {frontDeskTitle &&
              frontDeskRole &&
              roleVersionId !== String(frontDeskRole.id) && (
                <Alert
                  severity="info"
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => setRoleVersionId(String(frontDeskRole.id))}
                    >
                      Use suggested role
                    </Button>
                  }
                >
                  Hiring for front desk? Start them as Front Desk Coordinator.
                </Alert>
              )}
            {data.role_options.length === 0 && (
              <Alert severity="warning">
                Your account cannot assign a workforce role. Ask a clinic access
                administrator to update your role before adding employees.
              </Alert>
            )}
            <FormControl component="fieldset" required>
              <Typography component="legend" variant="subtitle2">
                Eligible work sites
              </Typography>
              <FormGroup row>
                {data.sites.map((site) => (
                  <FormControlLabel
                    key={site.id}
                    control={
                      <Checkbox
                        checked={siteIds.includes(site.id)}
                        onChange={() => toggleSite(site.id)}
                      />
                    }
                    label={site.name}
                  />
                ))}
              </FormGroup>
            </FormControl>
            <TextField
              label="Effective from"
              type="datetime-local"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              required
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={
                accountMode === "existing" ? (
                  <LinkOutlinedIcon />
                ) : (
                  <PersonAddAltOutlinedIcon />
                )
              }
              disabled={
                saving ||
                !displayName.trim() ||
                !jobTitle.trim() ||
                !roleVersionId ||
                siteIds.length === 0 ||
                (accountMode === "existing" ? !membershipId : !emailAddress)
              }
            >
              {saving
                ? "Saving…"
                : accountMode === "existing"
                  ? "Link employee"
                  : "Create employee invitation"}
            </Button>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {data.invitations.length > 0 && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Typography variant="h2" sx={{ mb: 2 }}>
            Pending invitations
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Activation links and tokens are shown only when an invitation is
            created. If you no longer have them, revoke the invitation below,
            then create a new employee invitation.
          </Typography>
          <Stack spacing={0} divider={<Divider flexItem />}>
            {data.invitations.map((invitation) => (
              <Stack
                key={invitation.id}
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                sx={{
                  py: 2,
                  alignItems: { md: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Stack spacing={0.25}>
                  <Typography sx={{ fontWeight: 700 }}>
                    {invitation.display_name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {invitation.email_address}
                  </Typography>
                  <Typography variant="body2">
                    {roleLabel(invitation.role_code)}
                  </Typography>
                  <Typography variant="body2">
                    Expires {new Date(invitation.expires_at).toLocaleString()}
                  </Typography>
                </Stack>
                <Button
                  color="warning"
                  disabled={saving}
                  onClick={() => revokeInvitation(invitation.id)}
                >
                  Revoke invitation
                </Button>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
