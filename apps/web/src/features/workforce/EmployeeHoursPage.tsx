import { useMemo, useState } from "react";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import type { Timecard } from "./clockTypes";
import { AdjustmentDialog, type CorrectionSite } from "./AdjustmentDialog";
import { TimecardSummary } from "./TimecardSummary";

export function EmployeeHoursPage() {
  const {
    data,
    error: loadError,
    refresh,
  } = useResource<{
    timecards: Timecard[];
    correction_sites: CorrectionSite[];
  }>("/api/clinic/workforce/timecards?view=self");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [correctionCard, setCorrectionCard] = useState<Timecard | null>(null);

  const latestCards = useMemo(() => {
    const found = new Map<string, Timecard>();
    data?.timecards.forEach((card) => {
      if (!found.has(card.period_start)) found.set(card.period_start, card);
    });
    return [...found.values()];
  }, [data]);

  async function calculate() {
    if (busy || !data) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/clinic/workforce/timecards/calculate", {
        method: "POST",
        body: {},
      });
      setNotice(
        "Current hours recalculated from saved punches and approved corrections.",
      );
      refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to calculate current hours.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(card: Timecard) {
    if (busy || !data || card.workflow?.can_submit !== true) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/clinic/workforce/timecards/${card.id}/submit`, {
        method: "POST",
        body: { lock_version: card.lock_version },
      });
      setNotice("Timecard submitted for review.");
      refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to submit this timecard.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!data)
    return (
      <Stack spacing={2}>
        {notice && <Alert severity="success">{notice}</Alert>}
        <LoadState error={loadError} onRetry={refresh} />
      </Stack>
    );

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { sm: "flex-end" } }}
      >
        <Box>
          <Typography variant="overline" color="text.secondary">
            WORKFORCE
          </Typography>
          <Typography variant="h1">My hours</Typography>
          <Typography color="text.secondary">
            Saved punches are shown exactly; rounding and paid-break rules are
            shown separately in each calculated period.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshOutlinedIcon />}
          disabled={busy}
          onClick={() => void calculate()}
        >
          Recalculate current week
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {latestCards.map((card) => (
        <TimecardSummary
          key={card.id}
          card={card}
          actions={
            <>
              <Button
                disabled={
                  busy ||
                  card.workflow?.can_submit !== true ||
                  card.unresolved_exceptions.length > 0
                }
                variant="contained"
                onClick={() => void submit(card)}
              >
                Submit for review
              </Button>
              <Button
                disabled={busy || card.status === "superseded"}
                onClick={() => setCorrectionCard(card)}
              >
                Request correction
              </Button>
            </>
          }
        />
      ))}
      {!latestCards.length && (
        <Alert severity="info">
          No calculated timecards yet. Recalculate the current week after your
          first saved clock action.
        </Alert>
      )}
      {correctionCard && (
        <AdjustmentDialog
          card={correctionCard}
          sites={data.correction_sites}
          open={true}
          onClose={() => setCorrectionCard(null)}
          onSaved={() => {
            setNotice("Correction request submitted.");
            refresh();
          }}
        />
      )}
    </Stack>
  );
}
