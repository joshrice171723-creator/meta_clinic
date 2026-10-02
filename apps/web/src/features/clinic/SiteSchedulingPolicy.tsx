import { SchedulingCompatibilitySettings } from "./SchedulingCompatibilitySettings";
import { useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { SiteSchedulingPolicy, VisitType } from "../../api/contracts";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";

type PolicyResponse = {
  policy: SiteSchedulingPolicy;
  can_write: boolean;
  can_overbook: boolean;
};

export function SiteSchedulingPolicySettings({ siteId }: { siteId: number }) {
  const policyResource = useResource<PolicyResponse>(
    `/api/clinic/facilities/${siteId}/scheduling_policy`,
  );
  const types = useResource<{ visit_types: VisitType[] }>(
    "/api/clinic/facilities?type=visit_types&per_page=100",
  );
  const [recurrence, setRecurrence] = useState(false);
  const [overbook, setOverbook] = useState(false);
  const [eligibleIds, setEligibleIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!policyResource.data) return;
    setRecurrence(policyResource.data.policy.recurrence_enabled);
    setOverbook(policyResource.data.policy.overbook_enabled);
    setEligibleIds(policyResource.data.policy.eligible_visit_type_ids);
  }, [policyResource.data]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!policyResource.data) return;
    setSaving(true);
    setFeedback("");
    try {
      await api(`/api/clinic/facilities/${siteId}/scheduling_policy`, {
        method: "PATCH",
        body: {
          policy: {
            expected_revision: policyResource.data.policy.revision,
            recurrence_enabled: recurrence,
            overbook_enabled: overbook,
            eligible_visit_type_ids: eligibleIds,
          },
        },
      });
      setFeedback("Scheduling policy saved. New bookings use this revision.");
      policyResource.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Unable to save scheduling policy.",
      );
      policyResource.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, mt: 2 }}>
      <Stack
        spacing={1.5}
        component="form"
        onSubmit={(event) => void save(event)}
      >
        <Typography component="h2" variant="h6">
          Location scheduling policy
        </Typography>
        <Typography variant="body2" color="text.secondary">
          This policy applies to the selected location. Compatibility settings
          below save separately.
        </Typography>
        {policyResource.error && (
          <Alert severity="error">{policyResource.error}</Alert>
        )}
        {!policyResource.data && !policyResource.error && <LoadState />}
        {policyResource.data && (
          <>
            <Typography variant="body2" color="text.secondary">
              Site policy revision {policyResource.data.policy.revision}
              {policyResource.data.policy.effective_from
                ? ` · Effective ${new Date(policyResource.data.policy.effective_from).toLocaleString()}`
                : " · Both features are off by default"}
              {policyResource.data.policy.written_by_membership_id
                ? ` · Changed by staff #${policyResource.data.policy.written_by_membership_id}`
                : ""}
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={recurrence}
                  onChange={(event) => setRecurrence(event.target.checked)}
                  disabled={!policyResource.data.can_write || saving}
                />
              }
              label="Allow recurring appointments at this site"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={overbook}
                  onChange={(event) => setOverbook(event.target.checked)}
                  disabled={!policyResource.data.can_write || saving}
                />
              }
              label="Allow authorized staff overbook exceptions"
            />
            {overbook && (
              <>
                <Autocomplete<VisitType, true>
                  multiple
                  disableCloseOnSelect
                  disabled={!policyResource.data.can_write || saving}
                  options={(types.data?.visit_types ?? []).filter(
                    (type) => !type.retired_at,
                  )}
                  value={(types.data?.visit_types ?? []).filter((type) =>
                    eligibleIds.includes(type.id),
                  )}
                  getOptionLabel={(type) => type.code}
                  isOptionEqualToValue={(left, right) => left.id === right.id}
                  onChange={(_event, selected) =>
                    setEligibleIds(selected.map((type) => type.id))
                  }
                  renderInput={(params) => (
                    <TextField {...params} label="Eligible visit types" />
                  )}
                />
                {eligibleIds.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Choose at least one active visit type to enable saving
                    overbooking.
                  </Typography>
                )}
              </>
            )}
            <Typography variant="body2" color="text.secondary">
              Recurrence is limited to 2–12 weekly visits within 180 days.
              Overbooking requires a separate staff permission and reason;
              patient, room, hours, blocks, holds, and offers remain protected.
            </Typography>
            {feedback && (
              <Alert
                severity={
                  feedback.startsWith("Scheduling policy") ? "success" : "error"
                }
              >
                {feedback}
              </Alert>
            )}
            {policyResource.data.can_write && (
              <Button
                type="submit"
                variant="contained"
                disabled={saving || (overbook && eligibleIds.length === 0)}
                sx={{ alignSelf: "flex-start" }}
              >
                {saving ? "Saving…" : "Save scheduling policy"}
              </Button>
            )}
          </>
        )}
        <SchedulingCompatibilitySettings siteId={siteId} />
      </Stack>
    </Paper>
  );
}
