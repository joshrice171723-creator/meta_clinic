import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Divider,
  Pagination,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { type ReactNode, useId, useState } from "react";
import { useResource, Card, LoadState } from "../../shared/ui";
import type { StripeConnectionStatus } from "./billing/StripeConnectPanel";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";

function humanizeActivityLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function pluralActivityLabel(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`;
}

function activityCountMessage(
  count: number,
  singular: string,
  singularVerb: string,
  pluralVerb: string,
  detail: string,
) {
  const label = pluralActivityLabel(count, singular);
  const verb = count === 1 ? singularVerb : pluralVerb;
  return `${count} ${label} ${verb} ${detail}`;
}

function formatActivityTime(
  value: string | null | undefined,
  timezone: string,
) {
  if (!value) return "not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time unavailable";
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  try {
    return new Intl.DateTimeFormat(undefined, {
      ...options,
      timeZone: timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

function ActivityDetails({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Accordion
      disableGutters
      elevation={0}
      slots={{ heading: "h4" }}
      slotProps={{ transition: { timeout: 0 } }}
      sx={{ minWidth: 0, bgcolor: "transparent", "&::before": { display: "none" } }}
    >
      <AccordionSummary
        id={`${id}-header`}
        aria-controls={`${id}-content`}
        expandIcon={<ExpandMoreIcon />}
        sx={{
          color: "text.secondary",
          minHeight: 44,
          px: 0,
        }}
      >
        <Typography component="span" variant="body2">
          {label}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 0.5 }}>
        <Stack spacing={0.75} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
          {children}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

export function OperationsIntegrationInventory({
  canReadScribe = false,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  canReadBilling,
  canReadClinical,
  canReadReminders,
}: {
  canReadScribe?: boolean;
  timezone?: string;
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
  const reminderActivity = canReadReminders ? reminders.data?.report : undefined;
  const payment = useResource<StripeConnectionStatus>(
    "/api/clinic/stripe_connect",
    {
      enabled: canReadBilling,
    },
  );
  const connection = canReadBilling ? payment.data : undefined;
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
  const collectionActivity = canReadBilling ? collections.data?.report : undefined;
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
      current_revision_unresolved_count: number;
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
      current_revision_unresolved_records: {
        id: number;
        patient_id: number;
        medication_request_revision_id: number;
        encounter_id: number;
        outcome: string;
        submitted_at: string;
      }[];
      current_revision_unresolved_records_capped: boolean;
      latest_submitted_at: string | null;
    };
  }>("/api/clinic/reports/prescription_simulator_activity", {
    enabled: canReadClinical,
  });
  const activity = canReadClinical ? prescriptions.data?.report : undefined;
  const attentionItems: string[] = [];
  const reconciliationCount =
    collectionActivity?.needs_reconciliation_count ?? 0;
  if (reconciliationCount > 0) {
    attentionItems.push(
      activityCountMessage(
        reconciliationCount,
        "collection intent",
        "needs",
        "need",
        "reconciliation",
      ),
    );
  }
  const inFlightCount = collectionActivity?.in_flight_count ?? 0;
  if (inFlightCount > 0) {
    attentionItems.push(
      activityCountMessage(
        inFlightCount,
        "collection",
        "is",
        "are",
        "pending or processing",
      ),
    );
  }
  const reminderAttentionCount = reminderActivity?.needs_attention_count ?? 0;
  if (reminderAttentionCount > 0) {
    attentionItems.push(
      activityCountMessage(
        reminderAttentionCount,
        "reminder",
        "has",
        "have",
        "failed or unknown delivery",
      ),
    );
  }
  const unresolvedPrescriptionCount =
    activity?.current_revision_unresolved_count ?? 0;
  if (unresolvedPrescriptionCount > 0) {
    attentionItems.push(
      activityCountMessage(
        unresolvedPrescriptionCount,
        "current prescription request",
        "needs",
        "need",
        "outcome reconciliation",
      ),
    );
  }

  return (
    <Card id="connectors-transmissions" title="Connectors & transmissions">
      <Stack spacing={1.5}>
        {attentionItems.length > 0 && (
          <Box component="section" aria-label="Activity needing review">
            <Typography variant="subtitle2">Needs review</Typography>
            <Stack component="ul" spacing={0.25} sx={{ m: 0, pl: 2.5 }}>
              {attentionItems.map((item) => (
                <Typography component="li" variant="body2" key={item}>
                  {item}
                </Typography>
              ))}
            </Stack>
          </Box>
        )}
        {canReadScribe && <ScribeActivitySummary timezone={timezone} />}
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
                  ? ` · Last checked ${formatActivityTime(connection.last_synced_at, timezone)}`
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
                    {collectionActivity.needs_reconciliation_count > 0 ||
                    collectionActivity.in_flight_count > 0 ? (
                      <>
                        {collectionActivity.needs_reconciliation_count > 0 &&
                          activityCountMessage(
                            collectionActivity.needs_reconciliation_count,
                            "collection intent",
                            "needs",
                            "need",
                            "reconciliation",
                          )}
                        {collectionActivity.needs_reconciliation_count > 0 &&
                          collectionActivity.in_flight_count > 0 && " · "}
                        {collectionActivity.in_flight_count > 0 &&
                          activityCountMessage(
                            collectionActivity.in_flight_count,
                            "collection",
                            "is",
                            "are",
                            "pending or processing",
                          )}
                        . Check the owning invoice before another collection.
                      </>
                    ) : (
                      "No collection intents need reconciliation or remain pending or processing."
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Payment collection activity · As of{" "}
                    {formatActivityTime(collectionActivity.as_of, timezone)}
                    {collectionActivity.latest_updated_at
                      ? ` · Latest state change ${formatActivityTime(
                          collectionActivity.latest_updated_at,
                          timezone,
                        )}`
                      : " · No collection intent recorded"}
                    .
                  </Typography>
                  {collectionActivity.reconciliation_records.map(
                    (record) => (
                      <Button
                        key={record.id}
                        href={`/clinic/billing/patients?patient_id=${record.patient_id}&invoice_id=${record.invoice_id}&collection_intent_id=${record.id}`}
                        size="small"
                        sx={{ alignSelf: "flex-start" }}
                      >
                        Review invoice {record.invoice_id} · collection{" "}
                        {record.id} needing reconciliation
                      </Button>
                    ),
                  )}
                  {collectionActivity.reconciliation_records_capped && (
                    <Typography variant="caption">
                      Showing the latest 25 reconciliation records. Open Billing
                      for the rest.
                    </Typography>
                  )}
                  {collectionActivity.in_flight_records.map((record) => (
                    <Button
                      key={`in-flight-${record.id}`}
                      href={`/clinic/billing/patients?patient_id=${record.patient_id}&invoice_id=${record.invoice_id}&collection_intent_id=${record.id}`}
                      size="small"
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Review {humanizeActivityLabel(record.state).toLowerCase()}{" "}
                      collection {record.id} · invoice {record.invoice_id}
                    </Button>
                  ))}
                  {collectionActivity.in_flight_records_capped && (
                    <Typography variant="caption">
                      Showing the latest 25 pending or processing collections.
                      Open Billing for the rest.
                    </Typography>
                  )}
                  <ActivityDetails label="Recorded collection details">
                    <Typography variant="body2">
                      {collectionActivity.total} recorded online collection
                      intents. Current states:{" "}
                      {Object.entries(collectionActivity.state_counts)
                        .map(
                          ([state, count]) =>
                            `${humanizeActivityLabel(state)} ${count}`,
                        )
                        .join(" · ") || "none"}
                    </Typography>
                    {collectionActivity.requested_amounts.map((row) => (
                      <Typography variant="body2" key={row.currency}>
                        {row.currency} requested by current intent state:{" "}
                        {Object.entries(row.states)
                          .map(
                            ([state, amount]) =>
                              `${humanizeActivityLabel(state)} ${amount}`,
                          )
                          .join(" · ") || "none"}. These are requested
                        amounts, not collected or settled funds.
                      </Typography>
                    ))}
                    {collectionActivity.reconciliation_records.map((record) => (
                      <Typography variant="caption" key={`reconciliation-${record.id}`}>
                        Reconciliation record {record.id} · invoice{" "}
                        {record.invoice_id} · patient {record.patient_id} · updated{" "}
                        {formatActivityTime(record.updated_at, timezone)}
                      </Typography>
                    ))}
                    {collectionActivity.in_flight_records.map((record) => (
                      <Typography variant="caption" key={`details-${record.id}`}>
                        {humanizeActivityLabel(record.state)} record {record.id} ·
                        invoice {record.invoice_id} · patient {record.patient_id} ·
                        updated {formatActivityTime(record.updated_at, timezone)}
                      </Typography>
                    ))}
                    <Typography variant="caption" color="text.secondary">
                      Internal source: {collectionActivity.source}
                    </Typography>
                  </ActivityDetails>
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
                {reminderActivity.needs_attention_count > 0
                  ? `${activityCountMessage(
                      reminderActivity.needs_attention_count,
                      "reminder",
                      "has",
                      "have",
                      "failed or unknown delivery",
                    )}.`
                  : "No failed or unknown reminder outcomes need review."}{" "}
                Review the recorded outcome before retrying.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Reminder activity · As of{" "}
                {formatActivityTime(reminderActivity.as_of, timezone)}
                {reminderActivity.latest_state_change_at
                  ? ` · Latest state change ${formatActivityTime(
                      reminderActivity.latest_state_change_at,
                      timezone,
                    )}`
                  : " · No reminder recorded"}
                . These are local record states, not provider delivery proof.
              </Typography>
              <ActivityDetails label="Recorded reminder details">
                <Typography variant="body2">
                  {reminderActivity.total} recorded reminders. Current states:{" "}
                  {Object.entries(reminderActivity.state_counts)
                    .map(
                      ([state, count]) =>
                        `${humanizeActivityLabel(state)} ${count}`,
                    )
                    .join(" · ") || "none"}.
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Internal source: {reminderActivity.source}
                </Typography>
              </ActivityDetails>
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
                {activity.current_revision_unresolved_count > 0
                  ? `${activityCountMessage(
                      activity.current_revision_unresolved_count,
                      "current prescription request",
                      "needs",
                      "need",
                      "outcome reconciliation before another attempt",
                    )}.`
                  : "No current prescription outcomes need reconciliation."}{" "}
                {activity.current_revision_unknown_count > 0 &&
                  `${activityCountMessage(
                    activity.current_revision_unknown_count,
                    "current request revision",
                    "has",
                    "have",
                    "an unreconciled unknown attempt",
                  )}.`}{" "}
                Review the patient record before another submission.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Prescription simulator activity · As of{" "}
                {formatActivityTime(activity.as_of, timezone)}
                {activity.latest_submitted_at
                  ? ` · Latest attempt ${formatActivityTime(
                      activity.latest_submitted_at,
                      timezone,
                    )}`
                  : " · No attempt recorded"}
                .
              </Typography>
              {activity.current_revision_unresolved_records.map(
                (record) => (
                  <Button
                    key={record.id}
                    href={`/clinic/patients/${record.patient_id}/encounters/${record.encounter_id}?medication_request_revision_id=${record.medication_request_revision_id}&prescription_attempt_id=${record.id}`}
                    size="small"
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Review request revision {record.medication_request_revision_id}
                    {" · "}patient {record.patient_id}{" · "}
                    {humanizeActivityLabel(record.outcome)}
                  </Button>
                ),
              )}
              {activity.current_revision_unresolved_records_capped && (
                <Typography variant="caption">
                  Showing the latest 25 current request revisions needing
                  outcome reconciliation. Open patient records for the rest.
                </Typography>
              )}
              <ActivityDetails label="Prescription outcome counts and attempt records">
                <Typography variant="body2">
                  {activity.total} recorded local attempts;{" "}
                  {activity.unknown_outcome_count} historical attempts recorded
                  an unknown outcome;{" "}
                  {activity.latest_per_revision_unknown_count} request revisions
                  have an unknown latest attempt;{" "}
                  {activity.current_revision_unknown_count} current revisions
                  have an unreconciled unknown attempt.
                </Typography>
                <Typography variant="body2">
                  Recorded outcomes: {Object.entries(activity.outcome_counts)
                    .map(
                      ([outcome, count]) =>
                        `${humanizeActivityLabel(outcome)} ${count}`,
                    )
                    .join(" · ") || "none"}. These include earlier attempts
                  and do not identify current requests.
                </Typography>
                <Typography variant="body2">
                  Latest attempt per request revision:{" "}
                  {Object.entries(activity.latest_per_revision_outcome_counts)
                    .map(
                      ([outcome, count]) =>
                        `${humanizeActivityLabel(outcome)} ${count}`,
                    )
                    .join(" · ") || "none"}. Revisions may have been
                  superseded.
                </Typography>
                <Typography variant="body2">
                  Current request revisions by latest outcome:{" "}
                  {Object.entries(activity.current_revision_outcome_counts)
                    .map(
                      ([outcome, count]) =>
                        `${humanizeActivityLabel(outcome)} ${count}`,
                    )
                    .join(" · ") || "none"}. These are local simulator
                  records, not pharmacy responses.
                </Typography>
                {activity.current_revision_unresolved_records.map((record) => (
                  <Typography variant="caption" key={`unresolved-${record.id}`}>
                    Unresolved attempt {record.id} · patient {record.patient_id}
                    · encounter {record.encounter_id} · request revision{" "}
                    {record.medication_request_revision_id} ·{" "}
                    {humanizeActivityLabel(record.outcome)} · submitted{" "}
                    {formatActivityTime(record.submitted_at, timezone)}
                  </Typography>
                ))}
                {activity.current_revision_unknown_records.map((record) => (
                  <Typography variant="caption" key={`unknown-${record.id}`}>
                    Unknown-outcome attempt {record.id} · patient{" "}
                    {record.patient_id} · encounter {record.encounter_id} ·
                    request revision {record.medication_request_revision_id} ·
                    submitted {formatActivityTime(record.submitted_at, timezone)}
                  </Typography>
                ))}
                {activity.current_revision_unknown_records_capped && (
                  <Typography variant="caption">
                    Showing the latest 25 current request revisions with an
                    unknown outcome. Open patient records for the rest.
                  </Typography>
                )}
                {activity.current_revision_records.map((record) => (
                  <Typography variant="caption" key={`current-${record.id}`}>
                    Current attempt {record.id} · patient {record.patient_id} ·
                    encounter {record.encounter_id} · request revision{" "}
                    {record.medication_request_revision_id} ·{" "}
                    {humanizeActivityLabel(record.outcome)} · submitted{" "}
                    {formatActivityTime(record.submitted_at, timezone)}
                  </Typography>
                ))}
                {activity.current_revision_records.map((record) => (
                  <Button
                    key={`current-link-${record.id}`}
                    href={`/clinic/patients/${record.patient_id}/encounters/${record.encounter_id}?medication_request_revision_id=${record.medication_request_revision_id}&prescription_attempt_id=${record.id}`}
                    size="small"
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Open request revision {record.medication_request_revision_id}
                    {" · "}patient {record.patient_id}{" · "}
                    {humanizeActivityLabel(record.outcome)}
                  </Button>
                ))}
                {activity.current_revision_records_capped && (
                  <Typography variant="caption">
                    Showing the latest 25 current request attempts.
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  Internal source: {activity.source} · adapter: {activity.adapter}
                </Typography>
              </ActivityDetails>
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

export type ScribeActivityReport = {
  as_of: string;
  provider_configured: boolean;
  current_draft_counts: Record<string, number>;
  source_counts: Record<string, number>;
  recording_counts: Record<string, number>;
  documents_without_draft: number;
  latest_recording_update_at: string | null;
  recovery_items: Array<{
    record_type: "recording" | "source";
    id: number;
    encounter_id: number;
    status: string;
    updated_at: string;
  }>;
  recovery_pagination?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
};

export function ScribeActivitySummary(
  { timezone }: { timezone?: string } = {},
) {
  const [page, setPage] = useState(1);
  const resource = useResource<{ report: ScribeActivityReport }>(
    `/api/clinic/reports/scribe_activity?page=${page}`,
  );
  const report = resource.data?.report;
  return (
    <Stack spacing={0.75}>
      <Typography variant="h6" component="h3">
        Scribe
      </Typography>
      {!report ? (
        <>
          <LoadState error={resource.error} onRetry={resource.refresh} />
          {resource.error && page > 1 && (
            <Button size="small" onClick={() => setPage(1)}>
              Return to first unfinished Scribe page
            </Button>
          )}
        </>
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
            {report.recovery_pagination
              ? `${report.recovery_pagination.total} unfinished records need review.`
              : report.recovery_items.length > 0
                ? `Showing ${report.recovery_items.length} recent unfinished records for review.`
                : "No unfinished records were returned."}
          </Typography>
          {(report.recovery_items.length > 0 || report.recovery_pagination) && (
            <Stack spacing={0.75}>
              <Typography variant="subtitle2">
                {report.recovery_pagination
                  ? `Unfinished records (${report.recovery_pagination.total})`
                  : "Unfinished records (latest 25)"}
              </Typography>
              {report.recovery_items.map((item) => (
                <Button
                  key={`${item.record_type}-${item.id}`}
                  size="small"
                  href={`/clinic/scribe?encounter_id=${item.encounter_id}`}
                  sx={{ alignSelf: "flex-start" }}
                >
                  Open {item.record_type} {item.id} · encounter{" "}
                  {item.encounter_id} · {humanizeActivityLabel(item.status)}
                </Button>
              ))}
              <ActivityDetails label="Unfinished record details">
                {report.recovery_items.map((item) => (
                  <Typography
                    variant="caption"
                    key={`details-${item.record_type}-${item.id}`}
                  >
                    {humanizeActivityLabel(item.record_type)} {item.id} · encounter{" "}
                    {item.encounter_id} · {humanizeActivityLabel(item.status)} · updated{" "}
                    {formatActivityTime(
                      item.updated_at,
                      timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                    )}
                  </Typography>
                ))}
              </ActivityDetails>
              {report.recovery_pagination && (
                <>
                  {report.recovery_pagination.total === 0 ? (
                    <Typography variant="body2">
                      No unfinished recordings or sources.
                    </Typography>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      Page {report.recovery_pagination.page} of{" "}
                      {report.recovery_pagination.total_pages} ·{" "}
                      {report.recovery_items.length} records shown
                    </Typography>
                  )}
                  {report.recovery_pagination.total_pages > 1 && (
                    <Pagination
                      size="small"
                      count={report.recovery_pagination.total_pages}
                      page={report.recovery_pagination.page}
                      onChange={(_, nextPage) => setPage(nextPage)}
                      aria-label="Unfinished Scribe records pages"
                    />
                  )}
                </>
              )}
            </Stack>
          )}
          <ActivityDetails label="Scribe status details">
            <Typography variant="body2">
              Current approved drafts: {report.current_draft_counts.approved ?? 0}
              ; current exported drafts: {report.current_draft_counts.exported ?? 0}.
              Superseded drafts are excluded.
            </Typography>
            <Typography variant="body2">
              Draft statuses: {Object.entries(report.current_draft_counts)
                .map(([state, count]) => `${humanizeActivityLabel(state)} ${count}`)
                .join(" · ") || "none"}. Source statuses:{" "}
              {Object.entries(report.source_counts)
                .map(([state, count]) => `${humanizeActivityLabel(state)} ${count}`)
                .join(" · ") || "none"}. Recording statuses:{" "}
              {Object.entries(report.recording_counts)
                .map(([state, count]) => `${humanizeActivityLabel(state)} ${count}`)
                .join(" · ") || "none"}.
            </Typography>
          </ActivityDetails>
          <Typography variant="caption" color="text.secondary">
            Your authorized encounters only. As of{" "}
            {formatActivityTime(
              report.as_of,
              timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            )}. Last recording change:{" "}
            {formatActivityTime(
              report.latest_recording_update_at,
              timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            )}.
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
