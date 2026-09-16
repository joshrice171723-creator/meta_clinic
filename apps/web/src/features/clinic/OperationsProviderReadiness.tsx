import { Alert, Button, Chip, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { loadTelehealthSettings } from "../telehealth/api";
import type {
  TelehealthEnvelope,
  TelehealthSettingsData,
} from "../telehealth/types";
import { Card, ResourceState } from "../../shared/ui";

type ProviderState = "configured" | "unavailable";

function providerState(settings: TelehealthSettingsData): {
  state: ProviderState;
  explanation: string;
} {
  if (settings.health_status === "configured") {
    return {
      state: "configured",
      explanation: settings.enabled
        ? "The most recent provider health check succeeded and new telehealth visits are enabled."
        : "The most recent provider health check succeeded, but new telehealth visits are disabled.",
    };
  }
  if (settings.health_status === "degraded") {
    return {
      state: "unavailable",
      explanation:
        "The most recent provider health check could not verify the connection.",
    };
  }
  if (settings.health_status === "disabled") {
    return {
      state: "unavailable",
      explanation: "Telehealth is disabled for this environment.",
    };
  }
  return {
    state: "unavailable",
    explanation: "The video provider configuration is incomplete.",
  };
}

function formatCheckedAt(value: string | null) {
  if (!value) return "Connection has not been checked";
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "Check time unavailable";
  return `Connection checked ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(instant)}`;
}

function formatLoadedAt(value: string) {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "Snapshot time unavailable";
  return `Status loaded ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(instant)}`;
}

function providerLabel(value: string | null) {
  if (value === "twilio") return "Twilio Video";
  if (value === "daily") return "Daily video";
  return value ? `Video provider: ${value}` : "Telehealth video";
}

export function OperationsProviderReadiness({
  canConfigureTelehealth,
}: {
  canConfigureTelehealth: boolean;
}) {
  const [response, setResponse] =
    useState<TelehealthEnvelope<TelehealthSettingsData> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(canConfigureTelehealth);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!canConfigureTelehealth) {
      setResponse(null);
      setError("");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setError("");
    setLoading(true);
    loadTelehealthSettings(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setResponse(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Provider readiness could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [canConfigureTelehealth, revision]);

  const readiness = response ? providerState(response.data) : null;
  const retry = () => setRevision((value) => value + 1);
  const readinessDetails = response && readiness && (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Chip
          label={
            readiness.state === "configured" ? "Configured" : "Unavailable"
          }
          color={readiness.state === "configured" ? "success" : "default"}
          variant="outlined"
        />
        <Chip
          label={providerLabel(response.data.provider_code)}
          variant="outlined"
        />
      </Stack>
      <Typography>{readiness.explanation}</Typography>
      <Typography variant="body2" color="text.secondary">
        {formatCheckedAt(response.data.health_checked_at)} ·{" "}
        {formatLoadedAt(response.as_of)}. Times are shown in your browser time.
      </Typography>
      <Typography variant="body2" color="text.secondary">
        “Configured” reports the server&apos;s latest provider health result.
        The response does not identify a live environment, so this page does not
        label the connection live.
      </Typography>
      <Alert severity="info">
        Payment, reminder, and Scribe workflows expose record-level outcomes,
        but no comparable operations-level readiness response. They are not
        summarized here.
      </Alert>
      <Button
        component="a"
        href="/clinic/settings/telehealth"
        variant="outlined"
        sx={{ alignSelf: "flex-start" }}
      >
        Open telehealth settings
      </Button>
    </Stack>
  );
  return (
    <Card title="Provider readiness">
      {!canConfigureTelehealth ? (
        <ResourceState
          state="blocked"
          title="Provider details unavailable"
          message="Telehealth provider details are available only to people who can configure telehealth."
        />
      ) : response && readiness && (error || loading) ? (
        <ResourceState
          state="stale"
          title={
            error ? "Provider update failed" : "Refreshing provider readiness"
          }
          message={
            error
              ? `${error} The details below are from the last successful load.`
              : "The details below are the last loaded snapshot while the update finishes."
          }
          onRetry={error ? retry : undefined}
        >
          {readinessDetails}
        </ResourceState>
      ) : error ? (
        <ResourceState state="error" message={error} onRetry={retry} />
      ) : loading || !response || !readiness ? (
        <ResourceState state="loading" message="Loading provider readiness…" />
      ) : (
        readinessDetails
      )}
    </Card>
  );
}
