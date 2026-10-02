import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { api, ApiError, csrf } from "../../api/client";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";
import type {
  EmploymentAdminData,
  WorkforceEmployment,
} from "./foundationTypes";

type Role = EmploymentAdminData["role_options"][number];
type Change = { before: WorkforceEmployment; role: Role };
type Outcome = {
  change: Change;
  state: "saved" | "failed" | "unknown" | "pending";
  message: string;
};

export function accessSnapshot(employee: WorkforceEmployment) {
  return JSON.stringify({
    id: employee.id,
    accessRevision: employee.access_revision,
    staff: employee.staff_member,
    account: employee.membership_summary,
    status: employee.status,
    from: employee.effective_from,
    until: employee.effective_until,
    active: employee.active_for_work,
    roles: [...employee.roles].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    ),
    sites: [...employee.sites].sort((a, b) => a.id - b.id),
  });
}

export function sameRoleScope(employee: WorkforceEmployment, role: Role) {
  const scope =
    role.role_code === "workforce-location-manager" ? "site" : "practice";
  const activeSites = employee.sites.filter((site) => site.active);
  return (
    employee.active_for_work &&
    employee.membership_summary.active &&
    employee.roles.length > 0 &&
    employee.roles.every(
      (grant) =>
        grant.scope_kind === scope &&
        (scope === "practice"
          ? grant.site_id === null
          : activeSites.some((site) => site.id === grant.site_id)),
    ) &&
    (scope !== "site" ||
      activeSites.every((site) =>
        employee.roles.some((grant) => grant.site_id === site.id),
      ))
  );
}

export function roleChangeSaved(
  change: Change,
  employee: WorkforceEmployment | undefined,
) {
  if (
    !employee ||
    employee.id !== change.before.id ||
    JSON.stringify(employee.membership_summary) !==
      JSON.stringify(change.before.membership_summary) ||
    JSON.stringify(employee.staff_member) !==
      JSON.stringify(change.before.staff_member) ||
    JSON.stringify(employee.sites) !== JSON.stringify(change.before.sites) ||
    employee.status !== change.before.status ||
    employee.effective_from !== change.before.effective_from ||
    employee.effective_until !== change.before.effective_until ||
    !sameRoleScope(employee, change.role)
  )
    return false;
  return employee.roles.every(
    (grant) => grant.role_version_id === change.role.id,
  );
}

export function BulkRoleEditor({
  data,
  refresh,
  disabled = false,
  onBlockingChange,
}: {
  data: EmploymentAdminData;
  refresh: () => void;
  disabled?: boolean;
  onBlockingChange: (blocked: boolean) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [roleId, setRoleId] = useState("");
  const [review, setReview] = useState<Change[] | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { registerBlocker } = useClinicNavigation();
  const unknown = outcomes.some((result) => result.state === "unknown");
  const locked = disabled || saving || unknown;
  const role = data.role_options.find((option) => String(option.id) === roleId);
  const dirty = selected.length > 0 || review !== null;
  useEffect(() => {
    onBlockingChange(dirty || saving || unknown);
  }, [dirty, saving, unknown, onBlockingChange]);
  useDemoNavigationBlocker(() => ({
    blocked: saving || unknown,
    message: dirty ? "Discard your selected employee role changes?" : null,
  }));
  useEffect(() => {
    if (!dirty && !saving && !unknown) return;
    const message = unknown
      ? "Employee access outcome is unconfirmed. Keep this page open and check saved access."
      : "Discard your selected employee role changes?";
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
  }, [dirty, saving, unknown, registerBlocker]);

  const openReview = async () => {
    if (!role || locked || busy.current || selected.length === 0) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const fresh = await api<EmploymentAdminData>(
        "/api/clinic/workforce/employments",
      );
      if (
        !fresh.role_options.some(
          (option) => JSON.stringify(option) === JSON.stringify(role),
        )
      )
        throw new Error("Role options changed. Reload and review again.");
      const changes = selected
        .map((id) => {
          const before = data.employments.find(
            (employee) => employee.id === id,
          );
          const current = fresh.employments.find(
            (employee) => employee.id === id,
          );
          if (
            !before ||
            !current ||
            !/^[a-f0-9]{64}$/.test(current.access_revision ?? "") ||
            accessSnapshot(before) !== accessSnapshot(current) ||
            !sameRoleScope(current, role)
          )
            throw new Error(
              "Selected access changed or has a different scope. Reload and select accounts again.",
            );
          return { before: current, role };
        })
        .filter((change) => !roleChangeSaved(change, change.before));
      if (!changes.length)
        throw new Error(
          "Selected accounts already have this role version. No changes will be sent.",
        );
      setReview(changes);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to review employee access.",
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const confirm = async () => {
    if (!review || locked || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    const results: Outcome[] = review.map((change) => ({
      change,
      state: "pending",
      message: "Not attempted",
    }));
    setReview(null);
    setOutcomes(results);
    for (let index = 0; index < results.length; index += 1) {
      const change = results[index].change;
      let submitted = false;
      try {
        const fresh = await api<EmploymentAdminData>(
          "/api/clinic/workforce/employments",
        );
        const current = fresh.employments.find(
          (employee) => employee.id === change.before.id,
        );
        if (
          !current ||
          accessSnapshot(current) !== accessSnapshot(change.before) ||
          !fresh.role_options.some(
            (option) => JSON.stringify(option) === JSON.stringify(change.role),
          )
        )
          throw new Error(
            "Access or assignable roles changed after review. Reload and review again.",
          );
        await csrf();
        submitted = true;
        const response = await api<{ employment: WorkforceEmployment }>(
          `/api/clinic/workforce/employments/${change.before.id}`,
          {
            method: "PATCH",
            body: {
              employment: {
                role_version_id: change.role.id,
                expected_access_revision: change.before.access_revision,
              },
            },
          },
        );
        if (!roleChangeSaved(change, response.employment))
          throw new Error(
            "The returned account access does not confirm the reviewed change.",
          );
        results[index] = {
          change,
          state: "saved",
          message: `Saved role version ${change.role.version} (ID ${change.role.id})`,
        };
        setSelected((ids) => ids.filter((id) => id !== change.before.id));
      } catch (reason) {
        const uncertain =
          submitted &&
          (!(reason instanceof ApiError) ||
            reason.status === 408 ||
            reason.status >= 500 ||
            reason.code === "outcome_unconfirmed" ||
            reason.code === "session_changed");
        results[index] = {
          change,
          state: uncertain ? "unknown" : "failed",
          message:
            reason instanceof Error
              ? reason.message
              : "Unable to update access",
        };
        setOutcomes([...results]);
        break;
      }
      setOutcomes([...results]);
    }
    if (!results.some((result) => result.state === "unknown")) refresh();
    busy.current = false;
    setSaving(false);
  };

  const checkSaved = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const fresh = await api<EmploymentAdminData>(
        "/api/clinic/workforce/employments",
      );
      const checked = outcomes.map<Outcome>((result) => {
        if (
          result.state !== "unknown" ||
          !roleChangeSaved(
            result.change,
            fresh.employments.find(
              (employee) => employee.id === result.change.before.id,
            ),
          )
        )
          return result;
        return {
          ...result,
          state: "saved",
          message: "Reviewed role version confirmed in saved access",
        };
      });
      setOutcomes(checked);
      setSelected((ids) =>
        ids.filter(
          (id) =>
            !checked.some(
              (result) =>
                result.change.before.id === id && result.state === "saved",
            ),
        ),
      );
      if (!checked.some((result) => result.state === "unknown")) refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to check saved access.",
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="h3">Bulk role editor</Typography>
      <Typography variant="body2">
        Select individual active accounts. Work sites and existing access scope
        stay unchanged. Revoking accounts is a separate action below.
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Inactive accounts and accounts with a different access scope cannot be
        selected.
      </Typography>
      <FormControl size="small" fullWidth disabled={locked}>
        <InputLabel id="bulk-employee-role">
          Role for selected accounts
        </InputLabel>
        <Select
          labelId="bulk-employee-role"
          label="Role for selected accounts"
          value={roleId}
          onChange={(event) => {
            setRoleId(event.target.value);
            setSelected([]);
            setReview(null);
          }}
        >
          {data.role_options.map((option) => (
            <MenuItem key={option.id} value={String(option.id)}>
              {option.label} · version {option.version}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {data.employments.map((employee) => (
        <FormControlLabel
          key={employee.id}
          control={
            <Checkbox
              checked={selected.includes(employee.id)}
              disabled={
                locked ||
                !role ||
                !sameRoleScope(employee, role) ||
                outcomes.some(
                  (result) =>
                    result.change.before.id === employee.id &&
                    result.state === "saved" &&
                    result.change.role.id === role.id,
                )
              }
              onChange={(_, checked) =>
                setSelected((ids) =>
                  checked
                    ? [...ids, employee.id]
                    : ids.filter((id) => id !== employee.id),
                )
              }
            />
          }
          label={`${employee.staff_member.display_name} — ${employee.membership_summary.email_address} (account ${employee.membership_summary.id})`}
        />
      ))}
      <Button
        variant="outlined"
        disabled={locked || !role || selected.length === 0}
        onClick={() => void openReview()}
      >
        Review {selected.length} selected accounts
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      {unknown && (
        <Alert
          severity="warning"
          action={
            <Button disabled={saving} onClick={() => void checkSaved()}>
              Check saved access
            </Button>
          }
        >
          An access outcome is unconfirmed. Further changes and account
          switching are blocked. No changes are retried.
        </Alert>
      )}
      {outcomes.map((result) => (
        <Typography key={result.change.before.id} role="status" variant="body2">
          {result.change.before.staff_member.display_name} ·{" "}
          {result.change.before.membership_summary.email_address} ·{" "}
          {result.state}: {result.message}
        </Typography>
      ))}
      <Dialog
        open={review !== null}
        onClose={() => !saving && setReview(null)}
        fullWidth
        maxWidth="md"
        aria-labelledby="bulk-role-review-title"
      >
        <DialogTitle id="bulk-role-review-title">
          Review selected account role changes
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography>
              Only these {review?.length ?? 0} accounts will change. No accounts
              will be restored or revoked.
            </Typography>
            {review?.map((change) => (
              <Stack key={change.before.id} spacing={0.5}>
                <Typography sx={{ fontWeight: 700 }}>
                  {change.before.staff_member.display_name} ·{" "}
                  {change.before.membership_summary.email_address}
                </Typography>
                <Typography>
                  Employee {change.before.id} · account{" "}
                  {change.before.membership_summary.id}
                </Typography>
                <Typography>
                  Replace employment roles:{" "}
                  {change.before.roles
                    .map(
                      (grant) =>
                        `${grant.label} (version ID ${grant.role_version_id}; ${grant.scope_kind}${grant.site_id === null ? "" : ` ${grant.site_id}`})`,
                    )
                    .join(", ")}
                </Typography>
                <Typography>
                  With: {change.role.label} · version {change.role.version} (ID{" "}
                  {change.role.id}) ·{" "}
                  {change.role.role_code === "workforce-location-manager"
                    ? "existing work sites"
                    : "clinic scope"}
                </Typography>
                <Typography>
                  Work sites unchanged:{" "}
                  {change.before.sites
                    .filter((site) => site.active)
                    .map((site) => `${site.name} (${site.id})`)
                    .join(", ") || "None"}
                </Typography>
                <Typography variant="body2">
                  Replacement role permissions:{" "}
                  {change.role.permissions.join(", ") || "None"}. Other account
                  grants are unchanged.
                </Typography>
              </Stack>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReview(null)}>Back to selection</Button>
          <Button
            variant="contained"
            disabled={locked}
            onClick={() => void confirm()}
          >
            Confirm role changes for {review?.length ?? 0} accounts
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
