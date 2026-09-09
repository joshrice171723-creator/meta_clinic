import { useId, useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Divider,
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
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import type {
  EmploymentAdminData,
  WorkforceEmployment,
  WorkforceSite,
} from "./foundationTypes";
import { businessNow } from "../../shared/businessDate";

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
        <Button
          color={employment.membership_summary.active ? "warning" : "primary"}
          disabled={saving || (!employment.membership_summary.active && (!roleVersionId || siteIds.length === 0))}
          onClick={() =>
            void update(
              employment.membership_summary.active ? "revoke" : "restore",
            )
          }
        >
          {employment.membership_summary.active
            ? "Revoke clinic account"
            : "Restore clinic account"}
        </Button>
      </Stack>
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
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [activationToken, setActivationToken] = useState<string | null>(null);

  useEffect(() => {
    if (roleVersionId || !data) return;
    const employeeRole = data.role_options.find(
      (role) => role.role_code === "workforce-employee",
    );
    if (employeeRole) setRoleVersionId(String(employeeRole.id));
  }, [data, roleVersionId]);

  if (!data) return <LoadState error={error} />;

  const reset = () => {
    setDisplayName("");
    setJobTitle("");
    setMembershipId("");
    setRoleVersionId("");
    setEmailAddress("");
    setSiteIds([]);
    setEffectiveFrom(localDateTime());
  };
  const toggleSite = (siteId: number) =>
    setSiteIds((current) =>
      current.includes(siteId)
        ? current.filter((id) => id !== siteId)
        : [...current, siteId],
    );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    setActivationToken(null);
    try {
      const isoEffectiveFrom = new Date(effectiveFrom).toISOString();
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
        setFeedback({
          severity: "success",
          text: "The clinic account is now linked to this employee.",
        });
      } else {
        const result = await api<{
          invitation: { activation_token_once: string; expires_at: string };
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
        setActivationToken(result.invitation.activation_token_once);
        setFeedback({
          severity: "success",
          text: `Invitation created. The token expires ${new Date(result.invitation.expires_at).toLocaleString()}.`,
        });
      }
      reset();
      refresh();
    } catch (reason) {
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
      {activationToken && (
        <Alert severity="warning">
          <Typography sx={{ fontWeight: 700 }}>
            Share this activation token securely now.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            It is shown only in this response. APPly does not send it by email.
          </Typography>
          <TextField
            fullWidth
            value={activationToken}
            label="One-time activation token"
            slotProps={{ htmlInput: { readOnly: true } }}
          />
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stack component="form" spacing={2.5} onSubmit={submit}>
          <Stack spacing={0.5}>
            <Typography variant="h2">Add employee</Typography>
            <Typography variant="body2" color="text.secondary">
              A new login is created only after the employee activates the
              invitation. The employee record, access role, and workforce setup
              are completed together during activation.
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
              <InputLabel id={`${fieldId}-1-label`}>Clinic account</InputLabel>
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
      </Paper>

      {data.invitations.length > 0 && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Typography variant="h2" sx={{ mb: 2 }}>
            Pending invitations
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
    </Stack>
  );
}
