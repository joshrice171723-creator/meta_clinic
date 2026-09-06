import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { useClinic } from "../clinic/Workspace";
import type { Adjustment, Timecard } from "./clockTypes";
import { AdjustmentDialog } from "./AdjustmentDialog";
import { TimecardSummary } from "./TimecardSummary";

export function TimecardReviewPage() {
  const clinic = useClinic();
  const [siteId, setSiteId] = useState(
    String(clinic.current_site?.id ?? clinic.sites[0]?.id ?? ""),
  );
  const [cards, setCards] = useState<Timecard[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [correctionCard, setCorrectionCard] = useState<Timecard | null>(null);
  const [decisionReasons, setDecisionReasons] = useState<
    Record<number, string>
  >({});

  useEffect(() => {
    if (!siteId) return;
    const abort = new AbortController();
    setError("");
    const query = `?site_id=${encodeURIComponent(siteId)}`;
    Promise.all([
      api<{ timecards: Timecard[] }>(
        `/api/clinic/workforce/timecards${query}`,
        { signal: abort.signal },
      ),
      api<{ adjustments: Adjustment[] }>(
        `/api/clinic/workforce/adjustments${query}`,
        { signal: abort.signal },
      ),
    ])
      .then(([timecardData, adjustmentData]) => {
        if (!abort.signal.aborted) {
          setCards(timecardData.timecards);
          setAdjustments(adjustmentData.adjustments);
        }
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load timecard review.",
          );
      });
    return () => abort.abort();
  }, [siteId, revision]);

  const latestCards = useMemo(() => {
    const found = new Map<string, Timecard>();
    cards.forEach((card) => {
      const key = `${card.employment_id}:${card.period_start}`;
      if (!found.has(key)) found.set(key, card);
    });
    return [...found.values()];
  }, [cards]);

  async function approve(card: Timecard) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/clinic/workforce/timecards/${card.id}/approve`, {
        method: "POST",
        body: { lock_version: card.lock_version },
      });
      setNotice(
        `${card.employee_name}'s timecard was approved as an immutable version.`,
      );
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to approve the timecard.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decide(
    adjustment: Adjustment,
    decision: "approved" | "denied",
  ) {
    const decisionReason = decisionReasons[adjustment.id]?.trim();
    if (!decisionReason) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/clinic/workforce/adjustments/${adjustment.id}/decide`, {
        method: "POST",
        body: {
          decision,
          decision_reason: decisionReason,
          lock_version: adjustment.lock_version,
        },
      });
      setNotice(`Correction request ${decision}.`);
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to decide the correction request.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          TEAM / WORKFORCE
        </Typography>
        <Typography variant="h1">Timecard review</Typography>
        <Typography color="text.secondary">
          Review location-scoped hours, resolve exceptions, and approve only
          current calculated versions.
        </Typography>
      </Box>
      <TextField
        select
        label="Location"
        value={siteId}
        onChange={(event) => setSiteId(event.target.value)}
        sx={{ maxWidth: 360 }}
      >
        {clinic.sites.map((site) => (
          <MenuItem key={site.id} value={String(site.id)}>
            {site.name || site.code}
          </MenuItem>
        ))}
      </TextField>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {adjustments
        .filter((adjustment) => adjustment.status === "submitted")
        .map((adjustment) => (
          <Paper variant="outlined" sx={{ p: 2 }} key={adjustment.id}>
            <Stack spacing={1}>
              <Typography variant="h3">
                Correction request #{adjustment.id}
              </Typography>
              <Typography>{adjustment.reason}</Typography>
              <Typography variant="body2" color="text.secondary">
                {adjustment.correction_type.replaceAll("_", " ")} · submitted{" "}
                {new Date(adjustment.requested_at).toLocaleString()}
              </Typography>
              <TextField
                label="Decision reason"
                value={decisionReasons[adjustment.id] ?? ""}
                onChange={(event) =>
                  setDecisionReasons((current) => ({
                    ...current,
                    [adjustment.id]: event.target.value,
                  }))
                }
                multiline
                minRows={2}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  disabled={busy || !decisionReasons[adjustment.id]?.trim()}
                  onClick={() => void decide(adjustment, "approved")}
                >
                  Approve correction
                </Button>
                <Button
                  color="warning"
                  disabled={busy || !decisionReasons[adjustment.id]?.trim()}
                  onClick={() => void decide(adjustment, "denied")}
                >
                  Deny
                </Button>
              </Stack>
            </Stack>
          </Paper>
        ))}
      {latestCards.map((card) => (
        <TimecardSummary
          key={card.id}
          card={card}
          actions={
            <>
              <Button
                variant="contained"
                disabled={
                  busy ||
                  card.status !== "submitted" ||
                  card.unresolved_exceptions.length > 0
                }
                onClick={() => void approve(card)}
              >
                Approve timecard
              </Button>
              <Button
                disabled={busy || card.status === "superseded"}
                onClick={() => setCorrectionCard(card)}
              >
                Add manager correction
              </Button>
            </>
          }
        />
      ))}
      {!latestCards.length && (
        <Alert severity="info">
          No calculated timecards are available for this location.
        </Alert>
      )}
      {correctionCard && (
        <AdjustmentDialog
          card={correctionCard}
          siteId={Number(siteId)}
          open={true}
          onClose={() => setCorrectionCard(null)}
          onSaved={() => {
            setNotice("Manager correction submitted for review.");
            setRevision((value) => value + 1);
          }}
        />
      )}
    </Stack>
  );
}
