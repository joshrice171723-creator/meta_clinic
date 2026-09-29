import { useRef, useState } from "react";
import { Alert, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";
import type { WaitlistItem } from "../clinic/WaitlistWorkspace";

type Offer = Omit<WaitlistItem, "patient_id" | "patient_name" | "reason">;
type Reply = {
  id: number;
  action: "accept" | "decline";
  version: number;
  requestKey: string;
};
type OffersResponse = {
  entries: Offer[];
  can_accept: boolean;
  booking_requirement: string;
};

export function PatientWaitlistOffers() {
  const resource = useResource<OffersResponse>("/api/patient_portal/waitlist");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef<Reply | null>(null);
  const [callbackKey, setCallbackKey] = useState(() => crypto.randomUUID());
  const [callbackRequested, setCallbackRequested] = useState(false);
  async function reply(next: Reply) {
    if (busy) return;
    const current = attempt.current ?? next;
    attempt.current = current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ entry: Offer }>(
        `/api/patient_portal/waitlist/${current.id}`,
        {
          method: "PATCH",
          body: {
            waitlist: {
              action: current.action,
              expected_version: current.version,
              request_key: current.requestKey,
            },
          },
        },
      );
      attempt.current = null;
      setUncertain(false);
      setNotice(
        result.entry.state === "booked"
          ? "Your appointment is booked. Refresh Appointments to see the updated schedule."
          : "The offer was declined. You remain on the waitlist for another opening.",
      );
      resource.refresh();
    } catch (value) {
      const unknown = !(value instanceof ApiError) || value.status >= 500;
      if (unknown && current.action === "decline") {
        try {
          const refreshed = await api<OffersResponse>(
            "/api/patient_portal/waitlist",
          );
          const latest = refreshed.entries.find(
            (entry) => entry.id === current.id,
          );
          resource.refresh();
          if (latest?.state === "waiting") {
            attempt.current = null;
            setUncertain(false);
            setNotice(
              "The offer is no longer active. The latest status shows you remain on the waitlist for another opening.",
            );
            return;
          }
        } catch {
          // Keep the same request key available when the authoritative refresh also fails.
        }
      }
      setUncertain(unknown);
      if (!unknown) {
        attempt.current = null;
        resource.refresh();
      }
      setError(
        value instanceof Error
          ? value.message
          : "The response could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestWaitlistCallback() {
    if (busy || callbackRequested) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/patient_portal/requests", {
        method: "POST",
        body: {
          patient_portal_request: {
            request_key: callbackKey,
            request_type: "callback",
            content:
              "Please contact me about joining the waitlist for an earlier appointment.",
          },
        },
      });
      setCallbackRequested(true);
      setCallbackKey(crypto.randomUUID());
      setNotice(
        "Your request was sent to the clinic front desk. The clinic will review it and contact you about joining the waitlist.",
      );
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Your request could not be confirmed. Retry the same request.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          Waitlist and earlier openings
        </Typography>
        {resource.error && (
          <Alert
            severity="error"
            action={<Button onClick={resource.refresh}>Retry</Button>}
          >
            {resource.error}
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        {resource.data && !resource.data.can_accept && (
          <Alert severity="info">
            {resource.data.booking_requirement} You can still decline an offered
            time.
          </Alert>
        )}
        {uncertain && (
          <Alert
            severity="warning"
            action={
              <Button
                disabled={busy}
                onClick={() => attempt.current && void reply(attempt.current)}
              >
                Retry response
              </Button>
            }
          >
            Your response is not confirmed yet. Retry before choosing another
            action.
          </Alert>
        )}
        {!resource.data && !resource.error && (
          <Typography role="status">Loading offers…</Typography>
        )}
        {resource.data?.entries.length === 0 && (
          <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
            <Typography color="text.secondary">
              No waitlist entries. Request a call and the clinic can review an
              earlier-opening request with you.
            </Typography>
            <Button
              variant="outlined"
              disabled={busy || callbackRequested}
              onClick={() => void requestWaitlistCallback()}
            >
              {callbackRequested
                ? "Callback requested"
                : "Request a call about an earlier opening"}
            </Button>
          </Stack>
        )}
        {resource.data?.entries.map((entry) => (
          <Stack key={entry.id} spacing={1}>
            <Stack direction="row" spacing={1}>
              <Typography sx={{ flex: 1 }}>
                {entry.visit_type_name} · {entry.clinician_name} ·{" "}
                {entry.site_name}
              </Typography>
              <Chip size="small" label={entry.state} />
            </Stack>
            {entry.offer_starts_at && (
              <Typography>
                {new Date(entry.offer_starts_at).toLocaleString()} ·{" "}
                {entry.duration_minutes} minutes
              </Typography>
            )}
            {entry.state === "offered" && (
              <>
                <Typography variant="body2">
                  Respond before{" "}
                  {entry.offer_expires_at &&
                    new Date(entry.offer_expires_at).toLocaleString()}
                  .
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    disabled={busy || uncertain || !resource.data?.can_accept}
                    onClick={() =>
                      void reply({
                        id: entry.id,
                        action: "accept",
                        version: entry.version,
                        requestKey: crypto.randomUUID(),
                      })
                    }
                  >
                    Accept and book
                  </Button>
                  <Button
                    disabled={busy || uncertain}
                    onClick={() =>
                      void reply({
                        id: entry.id,
                        action: "decline",
                        version: entry.version,
                        requestKey: crypto.randomUUID(),
                      })
                    }
                  >
                    Decline this time
                  </Button>
                </Stack>
              </>
            )}
            {entry.state === "expired" && (
              <Typography variant="body2">
                This offer or request window has expired. Contact the clinic for
                another opening.
              </Typography>
            )}
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}
