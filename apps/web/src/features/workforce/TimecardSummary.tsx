import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { Adjustment, Timecard } from "./clockTypes";
import { formatMinutes } from "./clockTypes";

export function TimecardSummary({
  card,
  corrections = [],
  actions,
}: {
  card: Timecard;
  corrections?: Adjustment[];
  actions?: React.ReactNode;
}) {
  const totals = card.snapshot.totals;
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ justifyContent: "space-between" }}
        >
          <Box>
            <Typography variant="h2">{card.employee_name}</Typography>
            <Typography color="text.secondary">
              {card.period_start} through the day before {card.period_end} ·
              version {card.version_number}
            </Typography>
          </Box>
          <Chip
            label={card.status}
            color={
              card.status === "approved"
                ? "success"
                : card.status === "submitted"
                  ? "info"
                  : "default"
            }
            sx={{ alignSelf: "start" }}
          />
        </Stack>
        {card.unresolved_exceptions.length > 0 && (
          <Alert severity="warning">
            This timecard cannot be approved or exported yet:{" "}
            {card.unresolved_exceptions.map(humanize).join(", ")}.
          </Alert>
        )}
        {corrections.map((correction) => (
          <Typography variant="body2" key={correction.id}>
            Correction #{correction.id}: {correction.reason}
            {correction.decision_reason
              ? ` · Review: ${correction.decision_reason}`
              : ""}
          </Typography>
        ))}
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 3 }}>
          <Metric label="Paid" value={formatMinutes(totals.paid_minutes)} />
          <Metric
            label="Regular"
            value={formatMinutes(totals.regular_minutes)}
          />
          <Metric
            label="Overtime"
            value={formatMinutes(totals.overtime_minutes)}
          />
          <Metric label="Raw time" value={formatMinutes(totals.raw_minutes)} />
        </Stack>
        <TableContainer>
          <Table size="small" aria-label={`Hours for ${card.employee_name}`}>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>End</TableCell>
                <TableCell align="right">Raw</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell>Exceptions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {card.snapshot.segments.map((segment) => (
                <TableRow key={segment.id}>
                  <TableCell>{segment.local_date}</TableCell>
                  <TableCell>{humanize(segment.segment_kind)}</TableCell>
                  <TableCell>
                    {new Date(segment.started_at_utc).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {new Date(segment.ended_at_utc).toLocaleString()}
                  </TableCell>
                  <TableCell align="right">
                    {formatMinutes(segment.raw_minutes)}
                  </TableCell>
                  <TableCell align="right">
                    {formatMinutes(segment.paid_minutes)}
                  </TableCell>
                  <TableCell>
                    {segment.exception_codes.map(humanize).join(", ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!card.snapshot.segments.length && (
          <Typography color="text.secondary">
            No completed work intervals are available for this period.
          </Typography>
        )}
        {actions && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            {actions}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5">{value}</Typography>
    </Box>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

export function ActionButton(props: React.ComponentProps<typeof Button>) {
  return <Button {...props} />;
}
