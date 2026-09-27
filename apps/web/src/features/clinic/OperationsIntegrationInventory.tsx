import { Button, Divider, Stack, Typography } from "@mui/material";
import { useResource, Card, LoadState } from "../../shared/ui";
import type { StripeConnectionStatus } from "./billing/StripeConnectPanel";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";

export function OperationsIntegrationInventory({
  canReadBilling,
  canReadClinical,
}: {
  canReadBilling: boolean;
  canReadClinical: boolean;
}) {
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
      needs_reconciliation_count: number;
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
      latest_per_revision_unknown_count: number;
      latest_submitted_at: string | null;
    };
  }>("/api/clinic/reports/prescription_simulator_activity", {
    enabled: canReadClinical,
  });
  const activity = prescriptions.data?.report;

  return (
    <Card title="Integration inventory">
      <Stack spacing={1.5}>
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
                  <Typography variant="caption" color="text.secondary">
                    Source: {collectionActivity.source} · As of{" "}
                    {collectionActivity.as_of}
                    {collectionActivity.latest_updated_at
                      ? ` · Latest state change ${collectionActivity.latest_updated_at}`
                      : " · No collection intent recorded"}
                    .
                  </Typography>
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
                revisions have an unknown latest recorded attempt. Review each
                current request before retrying; this is not a count of
                unresolved patient work.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Source: {activity.source} · Adapter: {activity.adapter} · As of{" "}
                {activity.as_of}
                {activity.latest_submitted_at
                  ? ` · Latest attempt ${activity.latest_submitted_at}`
                  : " · No attempt recorded"}
                .
              </Typography>
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
