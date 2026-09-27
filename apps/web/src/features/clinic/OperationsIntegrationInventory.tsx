import { Button, Divider, Stack, Typography } from "@mui/material";
import { useResource, Card, LoadState } from "../../shared/ui";
import type { StripeConnectionStatus } from "./billing/StripeConnectPanel";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";

export function OperationsIntegrationInventory({
  canReadScribe = false,
  canReadBilling,
  canReadClinical,
  canReadReminders,
}: {
  canReadScribe?: boolean;
  canReadBilling: boolean;
  canReadClinical: boolean;
  canReadReminders: boolean;
}) {
  const reminders = useResource<{
    report: {
      source: string;
      as_of: string;
      total: number;
      state_counts: Record<string, number>;
      needs_attention_count: number;
      latest_state_change_at: string | null;
    };
  }>("/api/clinic/reports/reminder_delivery_activity", {
    enabled: canReadReminders,
  });
  const reminderActivity = reminders.data?.report;
  const payment = useResource<StripeConnectionStatus>(
    "/api/clinic/stripe_connect",
    {
      enabled: canReadBilling,
    },
  );
  const connection = payment.data;
  const simulated = connection?.source === "local_membership_payment_simulator";
  const collections = useResource<{
    report: {
      source: string;
      as_of: string;
      total: number;
      state_counts: Record<string, number>;
      requested_amounts: {
        currency: string;
        states: Record<string, string>;
      }[];
      needs_reconciliation_count: number;
      reconciliation_records: {
        id: number;
        patient_id: number;
        invoice_id: number;
        updated_at: string;
      }[];
      reconciliation_records_capped: boolean;
      in_flight_count: number;
      in_flight_records: {
        id: number;
        patient_id: number;
        invoice_id: number;
        state: string;
        updated_at: string;
      }[];
      in_flight_records_capped: boolean;
      latest_updated_at: string | null;
    };
  }>("/api/clinic/reports/payment_collection_activity", {
    enabled: canReadBilling,
  });
  const collectionActivity = collections.data?.report;
  const prescriptions = useResource<{
    report: {
      source: string;
      adapter: string;
      as_of: string;
      total: number;
      unknown_outcome_count: number;
      outcome_counts: Record<string, number>;
      latest_per_revision_outcome_counts: Record<string, number>;
      latest_per_revision_unknown_count: number;
      current_revision_unknown_count: number;
      current_revision_outcome_counts: Record<string, number>;
      current_revision_records: {
        id: number;
        patient_id: number;
        medication_request_revision_id: number;
        encounter_id: number;
        outcome: string;
        submitted_at: string;
      }[];
      current_revision_records_capped: boolean;
      current_revision_unknown_records: {
        id: number;
        patient_id: number;
        medication_request_revision_id: number;
        encounter_id: number;
        outcome: string;
        submitted_at: string;
      }[];
      current_revision_unknown_records_capped: boolean;
      latest_submitted_at: string | null;
    };
  }>("/api/clinic/reports/prescription_simulator_activity", {
    enabled: canReadClinical,
  });
  const activity = prescriptions.data?.report;

  return (
    <Card title="Integration inventory">
      <Stack spacing={1.5}>
        {canReadScribe && <ScribeActivitySummary />}
        <Stack spacing={0.75}>
          <Typography variant="h6" component="h3">
            Payments
          </Typography>
          {!canReadBilling ? (
            <Typography variant="body2">
              Payment connection details require billing access.
            </Typography>
          ) : !connection ? (
            <LoadState error={payment.error} onRetry={payment.refresh} />
          ) : (
            <>
              <IntegrationStatusBadge
                status={
                  simulated
                    ? "simulated"
                    : connection.configured
                      ? "configured"
                      : "unavailable"
                }
              />
              <Typography variant="body2">
                {simulated
                  ? "Membership payment events use the local simulator; no external processor was contacted."
                  : connection.charges_enabled
                    ? "The clinic sandbox reports charges enabled. Review payout state and the last connection check in Billing."
                    : "Card collection is not enabled for this clinic. Review the connection in Billing."}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Source: clinic payment connection status
                {connection.last_synced_at
                  ? ` · Last checked ${connection.last_synced_at}`
                  : " · No check time recorded"}
                . Status does not prove a live charge or payout.
              </Typography>
              {!collectionActivity ? (
                <LoadState
                  error={collections.error}
                  onRetry={collections.refresh}
                />
              ) : (
                <>
                  <Typography variant="body2">
                    {collectionActivity.total} recorded online collection
                    intents · {collectionActivity.state_counts.pending ?? 0}{" "}
                    pending · {collectionActivity.state_counts.processing ?? 0}{" "}
                    processing · {collectionActivity.needs_reconciliation_count}{" "}
                    need reconciliation. Review those records before another
                    collection.
                  </Typography>
                  <Typography variant="body2">
                    Current states:{" "}
                    {Object.entries(collectionActivity.state_counts)
                      .map(
                        ([state, count]) =>
                          `${state.replaceAll("_", " ")} ${count}`,
                      )
                      .join(" · ")}
                    .
                  </Typography>
                  {collectionActivity.requested_amounts.map((row) => (
                    <Typography variant="body2" key={row.currency}>
                      {row.currency} requested by current intent state:{" "}
                      {Object.entries(row.states)
                        .map(
                          ([state, amount]) =>
                            `${state.replaceAll("_", " ")} ${amount}`,
                        )
                        .join(" · ")}
                      . These are requested amounts, not collected or settled
                      funds.
                    </Typography>
                  ))}
                  <Typography variant="caption" color="text.secondary">
                    Source: {collectionActivity.source} · As of{" "}
                    {collectionActivity.as_of}
                    {collectionActivity.latest_updated_at
                      ? ` · Latest state change ${collectionActivity.latest_updated_at}`
                      : " · No collection intent recorded"}
                    .
                  </Typography>
                  {collectionActivity.reconciliation_records.map((record) => (
                    <Button
                      key={record.id}
                      href={`/clinic/billing/patients?patient_id=${record.patient_id}&invoice_id=${record.invoice_id}&collection_intent_id=${record.id}`}
                      size="small"
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Review collection {record.id} · invoice{" "}
                      {record.invoice_id}
                    </Button>
                  ))}
                  {collectionActivity.reconciliation_records_capped && (
                    <Typography variant="caption">
                      Showing the latest 25 reconciliation records. Open Billing
                      for the rest.
                    </Typography>
                  )}
                  <Typography variant="body2">
                    {collectionActivity.in_flight_count} pending or processing
                    collections. Check the owning invoice before starting
                    another payment.
                  </Typography>
                  {collectionActivity.in_flight_records.map((record) => (
                    <Button
                      key={`in-flight-${record.id}`}
                      href={`/clinic/billing/patients?patient_id=${record.patient_id}&invoice_id=${record.invoice_id}&collection_intent_id=${record.id}`}
                      size="small"
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Review {record.state} collection {record.id} · invoice{" "}
                      {record.invoice_id}
                    </Button>
                  ))}
                  {collectionActivity.in_flight_records_capped && (
                    <Typography variant="caption">
                      Showing the latest 25 pending or processing collections.
                      Open Billing for the rest.
                    </Typography>
                  )}
                </>
              )}
              <Button
                href="/clinic/billing"
                size="small"
                sx={{ alignSelf: "flex-start" }}
              >
                Open payment setup and recovery
              </Button>
            </>
          )}
        </Stack>
        <Divider />
        <Stack spacing={0.75}>
          <Typography variant="h6" component="h3">
            Reminders
          </Typography>
          {!canReadReminders ? (
            <Typography variant="body2">
              Reminder delivery details require reminder access.
            </Typography>
          ) : !reminderActivity ? (
            <LoadState error={reminders.error} onRetry={reminders.refresh} />
          ) : (
            <>
              <Typography variant="body2">
                {reminderActivity.total} recorded reminders ·{" "}
                {reminderActivity.state_counts.delivered ?? 0} delivered ·{" "}
                {reminderActivity.state_counts.failed ?? 0} failed ·{" "}
                {reminderActivity.state_counts.delivery_unknown ?? 0} with
                unknown delivery. Review failed or unknown outcomes before
                retrying.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Source: {reminderActivity.source} · As of{" "}
                {reminderActivity.as_of}
                {reminderActivity.latest_state_change_at
                  ? ` · Latest state change ${reminderActivity.latest_state_change_at}`
                  : " · No reminder recorded"}
                . These are local record states, not provider delivery proof.
              </Typography>
              {reminderActivity.needs_attention_count > 0 && (
                <Button
                  href="/clinic/reminders?view=attention"
                  size="small"
                  sx={{ alignSelf: "flex-start" }}
                >
                  Review {reminderActivity.needs_attention_count} failed or
                  unknown reminders
                </Button>
              )}
            </>
          )}
        </Stack>
        <Divider />
        <Stack spacing={0.75}>
          <Typography variant="h6" component="h3">
            Prescriptions
          </Typography>
          <IntegrationStatusBadge
            status="simulated"
            label="Local transmission simulator"
          />
          <Typography variant="body2">
            Prescription attempts and their outcomes are stored on the
            medication request. A local simulated acceptance is not a network
            transmission or pharmacy acknowledgment.
          </Typography>
          {!canReadClinical ? (
            <Typography variant="body2">
              Attempt activity requires clinic-wide clinical record access.
            </Typography>
          ) : !activity ? (
            <LoadState
              error={prescriptions.error}
              onRetry={prescriptions.refresh}
            />
          ) : (
            <>
              <Typography variant="body2">
                {activity.total} recorded local attempts ·{" "}
                {activity.unknown_outcome_count} attempts recorded an unknown
                outcome historically ·{" "}
                {activity.latest_per_revision_unknown_count} medication request
                revisions have an unknown latest recorded attempt ·{" "}
                {activity.current_revision_unknown_count} current revisions have
                an unreconciled unknown attempt. Review each request before
                retrying.
              </Typography>
              <Typography variant="body2">
                Recorded outcomes:{" "}
                {Object.entries(activity.outcome_counts)
                  .map(
                    ([outcome, count]) =>
                      `${outcome.replaceAll("_", " ")} ${count}`,
                  )
                  .join(" · ") || "none"}
                . These include earlier attempts and do not identify current
                requests.
              </Typography>
              <Typography variant="body2">
                Latest attempt per request revision:{" "}
                {Object.entries(activity.latest_per_revision_outcome_counts)
                  .map(
                    ([outcome, count]) =>
                      `${outcome.replaceAll("_", " ")} ${count}`,
                  )
                  .join(" · ") || "none"}
                . Revisions may have been superseded.
              </Typography>
              <Typography variant="body2">
                Current request revisions by latest outcome:{" "}
                {Object.entries(activity.current_revision_outcome_counts)
                  .map(
                    ([outcome, count]) =>
                      `${outcome.replaceAll("_", " ")} ${count}`,
                  )
                  .join(" · ") || "none"}
                . These are local simulator records, not pharmacy responses.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Source: {activity.source} · Adapter: {activity.adapter} · As of{" "}
                {activity.as_of}
                {activity.latest_submitted_at
                  ? ` · Latest attempt ${activity.latest_submitted_at}`
                  : " · No attempt recorded"}
                .
              </Typography>
              {activity.current_revision_unknown_records.map((record) => (
                <Button
                  key={record.id}
                  href={`/clinic/patients/${record.patient_id}/encounters/${record.encounter_id}?medication_request_revision_id=${record.medication_request_revision_id}&prescription_attempt_id=${record.id}`}
                  size="small"
                  sx={{ alignSelf: "flex-start" }}
                >
                  Review patient record · request revision{" "}
                  {record.medication_request_revision_id} ·{" "}
                  {record.outcome.replaceAll("_", " ")}
                </Button>
              ))}
              {activity.current_revision_unknown_records_capped && (
                <Typography variant="caption">
                  Showing the latest 25 current request revisions with
                  unreconciled unknown attempts. Open patient records for the
                  rest.
                </Typography>
              )}
              {activity.current_revision_records.map((record) => (
                <Button
                  key={`current-${record.id}`}
                  href={`/clinic/patients/${record.patient_id}/encounters/${record.encounter_id}?medication_request_revision_id=${record.medication_request_revision_id}&prescription_attempt_id=${record.id}`}
                  size="small"
                  sx={{ alignSelf: "flex-start" }}
                >
                  Current request revision{" "}
                  {record.medication_request_revision_id}
                  {" · "}
                  {record.outcome.replaceAll("_", " ")}
                </Button>
              ))}
              {activity.current_revision_records_capped && (
                <Typography variant="caption">
                  Showing the latest 25 current request attempts. Open patient
                  records for the rest.
                </Typography>
              )}
            </>
          )}
          <Typography variant="caption" color="text.secondary">
            Open the patient record to review an outcome before another
            submission. Network onboarding and response mapping remain open.
          </Typography>
          <Button
            href="/clinic/patients"
            size="small"
            sx={{ alignSelf: "flex-start" }}
          >
            Open patient records
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}

type ScribeActivityReport = {
  as_of: string;
  provider_configured: boolean;
  current_draft_counts: Record<string, number>;
  source_counts: Record<string, number>;
  recording_counts: Record<string, number>;
  documents_without_draft: number;
  latest_recording_update_at: string | null;
};

function ScribeActivitySummary() {
  const resource = useResource<{ report: ScribeActivityReport }>(
    "/api/clinic/reports/scribe_activity",
  );
  const report = resource.data?.report;
  return (
    <Stack spacing={0.75}>
      <Typography variant="h6" component="h3">
        Scribe
      </Typography>
      {!report ? (
        <LoadState error={resource.error} onRetry={resource.refresh} />
      ) : (
        <>
          <Typography variant="body2">
            Audio transcription:{" "}
            {report.provider_configured
              ? "configuration present"
              : "unavailable"}
            . Provider connectivity has not been checked by this report.
          </Typography>
          <Typography variant="body2">
            {report.current_draft_counts.draft ?? 0} drafts awaiting review;{" "}
            {report.current_draft_counts.in_review ?? 0} in review;{" "}
            {report.documents_without_draft} documents without a draft.
          </Typography>
          <Typography variant="body2">
            {report.recording_counts.interrupted ?? 0} interrupted recordings;{" "}
            {report.recording_counts.recording ?? 0} recordings still open;{" "}
            {report.source_counts.incomplete ?? 0} incomplete sources.
          </Typography>
          <Typography variant="body2">
            Current approved drafts: {report.current_draft_counts.approved ?? 0}
            ; current exported drafts:{" "}
            {report.current_draft_counts.exported ?? 0}. Superseded drafts are
            excluded.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Your authorized encounters only. As of {report.as_of}. Last
            recording change: {report.latest_recording_update_at ?? "none"}.
            Recording counts describe capture state, not transcription success.
            Review the encounter before retrying.
          </Typography>
          <Button
            size="small"
            onClick={resource.refresh}
            sx={{ alignSelf: "flex-start" }}
          >
            Refresh scribe activity
          </Button>
          <Button
            size="small"
            href="/clinic/scribe"
            sx={{ alignSelf: "flex-start" }}
          >
            Open scribe workspace
          </Button>
        </>
      )}
      <Divider />
    </Stack>
  );
}
