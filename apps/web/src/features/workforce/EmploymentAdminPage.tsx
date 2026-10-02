import {
  useId,
  useEffect,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
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
import { BulkRoleEditor, sameRoleScope } from "./BulkRoleEditor";

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
  onBlockingChange,
}: {
  employment: WorkforceEmployment;
  roles: EmploymentAdminData["role_options"];
  sites: WorkforceSite[];
  refresh: () => void;
  setFeedback: (feedback: Feedback | null) => void;
  onBlockingChange: (id: number, blocked: boolean) => void;
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
  const [revokeAcknowledged, setRevokeAcknowledged] = useState(false);
  const [accessUnknown, setAccessUnknown] = useState(false);
  const [unknownAction, setUnknownAction] = useState<
    "revoke" | "restore" | "edit"
  >("edit");
  const { registerBlocker } = useClinicNavigation();
  const previousAccess = useRef({
    roleVersionId: String(activeRole?.role_version_id ?? ""),
    siteIds: employment.sites
      .filter((site) => site.active)
      .map((site) => site.id),
  });
  useEffect(() => {
    if (saving || accessUnknown) return;
    const nextRoleId = String(employment.roles[0]?.role_version_id ?? "");
    const nextSiteIds = employment.sites
      .filter((site) => site.active)
      .map((site) => site.id);
    const previous = previousAccess.current;
    const previousSites = JSON.stringify([...previous.siteIds].sort());
    if (
      previous.roleVersionId === nextRoleId &&
      previousSites === JSON.stringify([...nextSiteIds].sort())
    )
      return;
    // Refresh clean drafts without replacing pending/unknown work or a user edit.
    if (
      roleVersionId === previous.roleVersionId &&
      JSON.stringify([...siteIds].sort()) === previousSites
    ) {
      setRoleVersionId(nextRoleId);
      setSiteIds(nextSiteIds);
    }
    previousAccess.current = { roleVersionId: nextRoleId, siteIds: nextSiteIds };
  }, [
    employment.roles,
    employment.sites,
    roleVersionId,
    siteIds,
    saving,
    accessUnknown,
  ]);
  const changed =
    roleVersionId !== String(activeRole?.role_version_id ?? "") ||
    JSON.stringify([...siteIds].sort()) !==
      JSON.stringify(
        employment.sites
          .filter((site) => site.active)
          .map((site) => site.id)
          .sort(),
      );
  useEffect(() => {
    onBlockingChange(employment.id, changed || saving || accessUnknown);
  }, [employment.id, changed, saving, accessUnknown, onBlockingChange]);
  const checkAccess = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const fresh = await api<EmploymentAdminData>(
        "/api/clinic/workforce/employments",
      );
      const saved = fresh.employments.find(
        (record) =>
          record.id === employment.id &&
          record.membership_summary.id === employment.membership_summary.id &&
          record.membership_summary.email_address ===
            employment.membership_summary.email_address,
      );
      const role = roles.find((option) => String(option.id) === roleVersionId);
      const confirmed =
        unknownAction === "revoke"
          ? saved &&
            !saved.membership_summary.active &&
            saved.status === "inactive" &&
            saved.roles.length === 0
          : role &&
            saved &&
            sameRoleScope(saved, role) &&
            saved.roles.every((grant) => grant.role_version_id === role.id) &&
            JSON.stringify(
              saved.sites
                .filter((site) => site.active)
                .map((site) => site.id)
                .sort(),
            ) === JSON.stringify([...siteIds].sort());
      if (!confirmed)
        throw new Error(
          "Saved access does not yet confirm this action. Do not repeat it.",
        );
      setAccessUnknown(false);
      setFeedback({
        severity: "success",
        text: "Employee access confirmed in saved records.",
      });
      refresh();
    } catch (reason) {
      setFeedback({
        severity: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to confirm saved access.",
      });
    } finally {
      setSaving(false);
    }
  };
  useDemoNavigationBlocker(() => ({
    blocked: saving || accessUnknown,
    message: changed ? "Discard unsaved employee access changes?" : null,
  }));
  useEffect(() => {
    if (!changed && !saving && !accessUnknown) return;
    const message = accessUnknown
      ? "Employee access outcome is unconfirmed. Keep this page open and check saved access."
      : "Discard unsaved employee access changes?";
    const unregister = registerBlocker(() => message);
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [changed, saving, accessUnknown, registerBlocker]);
  const toggleSite = (siteId: number) =>
    setSiteIds((current) =>
      current.includes(siteId)
        ? current.filter((id) => id !== siteId)
        : [...current, siteId],
    );
  const update = async (accountAction?: "revoke" | "restore") => {
    if (saving || accessUnknown) return;
    setSaving(true);
    setFeedback(null);
    let submitted = false;
    try {
      await csrf();
      submitted = true;
      await api(`/api/clinic/workforce/employments/${employment.id}`, {
        method: "PATCH",
        body: {
          employment:
            accountAction === "revoke"
              ? { account_action: "revoke" }
              : {
                  role_version_id: roleVersionId,
                  ...(accountAction
                    ? {}
                    : { expected_access_revision: employment.access_revision }),
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
      if (
        submitted &&
        (!(reason instanceof ApiError) ||
          reason.status === 408 ||
          reason.status >= 500 ||
          reason.code === "outcome_unconfirmed" ||
          reason.code === "session_changed")
      ) {
        setUnknownAction(accountAction ?? "edit");
        setAccessUnknown(true);
      }
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
      {accessUnknown && (
        <Alert
          severity="warning"
          action={
            <Button disabled={saving} onClick={() => void checkAccess()}>
              Check saved access
            </Button>
          }
        >
          Employee access outcome is unconfirmed. Do not repeat this change.
          Account switching is blocked until saved access confirms it.
        </Alert>
      )}
      <Stack spacing={1.5} inert={saving || accessUnknown}>
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
                ? (setRevokeAcknowledged(false), setRevokeOpen(true))
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
                {employment.membership_summary.email_address} · account{" "}
                {employment.membership_summary.id} · employee {employment.id}
              </Typography>
              <Typography>
                The login will be deactivated, clinic access and all active
                account role grants revoked, and active sessions closed. Pending
                employee invitations will be revoked. This does not delete the
                employee or reassign their work.
              </Typography>
              <Typography>
                Active assigned work stays with this employee. Eligible staff
                can claim it from the clinical work queue.
              </Typography>
              <Typography variant="subtitle2">
                Active work by location
              </Typography>
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
              <FormControlLabel
                control={
                  <Checkbox
                    checked={revokeAcknowledged}
                    onChange={(_, checked) => setRevokeAcknowledged(checked)}
                  />
                }
                label={`I intend to revoke clinic access for ${employment.membership_summary.email_address}`}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRevokeOpen(false)}>Cancel</Button>
            <Button
              color="warning"
              disabled={saving || !revokeAcknowledged}
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
    </Stack>
  );
}

export function EmploymentAdminPage() {
  const fieldId = useId();
  const { data, error, refresh } = useResource<EmploymentAdminData>(
    "/api/clinic/workforce/employments",
    { retainDataOnRefresh: true },
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
  const [setupOpen, setSetupOpen] = useState(false);
  const [bulkAccessBlocked, setBulkAccessBlocked] = useState(false);
  const [invitationToRevoke, setInvitationToRevoke] = useState<
    EmploymentAdminData["invitations"][number] | null
  >(null);
  const [invitationRevokeAcknowledged, setInvitationRevokeAcknowledged] =
    useState(false);
  const [individualAccessBlocked, setIndividualAccessBlocked] = useState<
    Record<number, boolean>
  >({});
  const accessBlockingChanged = useCallback(
    (id: number, blocked: boolean) =>
      setIndividualAccessBlocked((current) =>
        current[id] === blocked ? current : { ...current, [id]: blocked },
      ),
    [],
  );
  const [activationToken, setActivationToken] = useState<string | null>(null);
  const [activationPath, setActivationPath] = useState<string | null>(null);
  const [setupRoleCode, setSetupRoleCode] = useState<string | null>(null);
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
          reason.status === 408 ||
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
        <BulkRoleEditor
          data={data}
          refresh={refresh}
          disabled={
            saving ||
            unconfirmed !== null ||
            dirty ||
            Object.values(individualAccessBlocked).some(Boolean)
          }
          onBlockingChange={setBulkAccessBlocked}
        />
        <Divider sx={{ my: 2 }} />
        <Stack
          spacing={0}
          divider={<Divider flexItem />}
          inert={bulkAccessBlocked}
        >
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
                key={employment.id}
                employment={employment}
                roles={data.role_options}
                sites={data.sites}
                refresh={refresh}
                setFeedback={setFeedback}
                onBlockingChange={accessBlockingChanged}
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
            inert={unconfirmed !== null || bulkAccessBlocked}
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
                  disabled={saving || bulkAccessBlocked}
                  onClick={() => {
                    setInvitationRevokeAcknowledged(false);
                    setInvitationToRevoke(invitation);
                  }}
                >
                  Revoke invitation
                </Button>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}
      <Dialog
        open={invitationToRevoke !== null}
        onClose={() => setInvitationToRevoke(null)}
        aria-labelledby="revoke-invitation-title"
      >
        <DialogTitle id="revoke-invitation-title">
          Revoke this employee invitation?
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Typography>
              {invitationToRevoke?.display_name} ·{" "}
              {invitationToRevoke?.email_address} · invitation{" "}
              {invitationToRevoke?.id}
            </Typography>
            <Typography>
              The invitation code and activation link will stop working. The
              employee will need a new invitation to activate this login.
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={invitationRevokeAcknowledged}
                  onChange={(_, checked) =>
                    setInvitationRevokeAcknowledged(checked)
                  }
                />
              }
              label="I intend to revoke this employee invitation"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvitationToRevoke(null)}>Cancel</Button>
          <Button
            color="warning"
            disabled={
              saving || bulkAccessBlocked || !invitationRevokeAcknowledged
            }
            onClick={() => {
              if (!invitationToRevoke) return;
              const id = invitationToRevoke.id;
              setInvitationToRevoke(null);
              void revokeInvitation(id);
            }}
          >
            Confirm invitation revoke
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
