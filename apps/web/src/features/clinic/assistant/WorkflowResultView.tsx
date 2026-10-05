import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { WorkflowProposal, WorkflowResult } from "./workflowTypes";

function readable(value: unknown): string {
  if (value === null || value === undefined || value === "")
    return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value))
    return value.map(readable).join(", ") || "None recorded";
  if (typeof value === "object") return "Details unavailable";
  return String(value);
}

function isIdentifierLabel(label: string) {
  return /\bid\b|identifier|record key/i.test(label);
}

export function WorkflowResultView({ result }: { result: WorkflowResult }) {
  const [copyStatus, setCopyStatus] = useState("");
  const rowCount = result.sections.reduce(
    (count, section) => count + (section.rows?.length ?? 0),
    0,
  );
  const summary = [
    result.title,
    ...result.sections.flatMap((section) =>
      (section.fields ?? [])
        .filter((field) => !isIdentifierLabel(field.label))
        .map((field) => `${field.label}: ${readable(field.value)}`),
    ),
    ...(rowCount
      ? [`${rowCount} displayed ${rowCount === 1 ? "row" : "rows"}.`]
      : []),
  ].join("\n");
  return (
    <Stack spacing={2}>
      <Typography component="h3" variant="subtitle1">
        {result.title}
      </Typography>
      <Alert
        severity={result.status === "receipt" ? "success" : "info"}
        role="status"
      >
        {result.status === "receipt"
          ? "Confirmed and saved by the clinic."
          : "Clinic information retrieved."}
        {rowCount > 0 &&
          ` ${rowCount} ${rowCount === 1 ? "row" : "rows"} displayed below.`}
        {result.confirmed_at &&
          ` Saved ${new Date(result.confirmed_at).toLocaleString()}.`}
      </Alert>
      {result.sections.map((section, index) => (
        <Paper
          variant="outlined"
          key={`${section.title || "section"}-${index}`}
          sx={{ p: 1.5, minWidth: 0 }}
        >
          {section.title && (
            <Typography component="h4" variant="subtitle2" sx={{ mb: 1 }}>
              {section.title}
            </Typography>
          )}
          {!!section.fields?.length && (
            <Box component="dl" className="clinic-assistant__workflow-fields">
              {section.fields
                .filter((field) => !isIdentifierLabel(field.label))
                .map((field, fieldIndex) => (
                  <Box component="div" key={`${field.label}-${fieldIndex}`}>
                    <Typography
                      component="dt"
                      variant="caption"
                      color="text.secondary"
                    >
                      {field.label}
                    </Typography>
                    <Typography component="dd" variant="body2">
                      {readable(field.value)}
                    </Typography>
                  </Box>
                ))}
            </Box>
          )}
          {!!section.columns?.filter(
            (column) =>
              !isIdentifierLabel(column.key) &&
              !isIdentifierLabel(column.label),
          ).length && (
            <Box sx={{ overflowX: "auto", maxWidth: "100%" }}>
              <Table size="small" aria-label={section.title || result.title}>
                <TableHead>
                  <TableRow>
                    {section.columns
                      .filter(
                        (column) =>
                          !isIdentifierLabel(column.key) &&
                          !isIdentifierLabel(column.label),
                      )
                      .map((column) => (
                        <TableCell key={column.key}>{column.label}</TableCell>
                      ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(section.rows ?? []).map((row, rowIndex) => (
                    <TableRow key={`row-${rowIndex}`}>
                      {section.columns
                        ?.filter(
                          (column) =>
                            !isIdentifierLabel(column.key) &&
                            !isIdentifierLabel(column.label),
                        )
                        .map((column) => (
                          <TableCell key={column.key}>
                            {readable(row[column.key])}
                          </TableCell>
                        ))}
                    </TableRow>
                  ))}
                  {!section.rows?.length && (
                    <TableRow>
                      <TableCell
                        colSpan={
                          section.columns?.filter(
                            (column) =>
                              !isIdentifierLabel(column.key) &&
                              !isIdentifierLabel(column.label),
                          ).length
                        }
                      >
                        No records returned.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          )}
        </Paper>
      ))}
      <Button
        sx={{ alignSelf: "flex-start" }}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(summary);
            setCopyStatus("Summary copied.");
          } catch {
            setCopyStatus(
              "Couldn’t copy the summary. Select the result text to copy it manually.",
            );
          }
        }}
      >
        Copy summary
      </Button>
      {copyStatus && (
        <Typography variant="body2" role="status">
          {copyStatus}
        </Typography>
      )}
      {result.source_path?.startsWith("/") &&
        !result.source_path.startsWith("//") && (
          <Link
            href={result.source_path}
            underline="hover"
            sx={{ alignSelf: "flex-start" }}
          >
            Open in clinic workspace
          </Link>
        )}
    </Stack>
  );
}

export function WorkflowProposalReview({
  proposal,
  expired,
  now,
  busy,
  error,
  onConfirm,
  onReadback,
  suggestedLabels = [],
}: {
  proposal: WorkflowProposal;
  expired: boolean;
  now: number;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onReadback: () => void;
  suggestedLabels?: string[];
}) {
  const secondsLeft = Math.max(
    0,
    Math.ceil((Date.parse(proposal.expires_at) - now) / 1000),
  );
  const expiringSoon = !expired && secondsLeft <= 60;
  const comparisons = proposal.preview.filter(
    (item) =>
      Object.prototype.hasOwnProperty.call(item, "before") &&
      !isIdentifierLabel(item.label),
  );
  return (
    <Paper variant="outlined" className="clinic-assistant__workflow-review">
      <Typography component="h3" variant="subtitle1">
        {proposal.title || "Review change"}
      </Typography>
      <Alert
        severity={expired || expiringSoon ? "warning" : "info"}
        role="status"
      >
        {expired
          ? "This review expired. Prepare the change again."
          : expiringSoon
            ? "This review expires in less than a minute. Check the values before confirming, or prepare a fresh review."
            : "Review these exact values. Nothing is saved until you confirm."}
      </Alert>
      {comparisons.length > 0 && (
        <Box sx={{ overflowX: "auto" }}>
          <Table
            size="small"
            aria-label="Changes before and after confirmation"
          >
            <TableHead>
              <TableRow>
                <TableCell>Change</TableCell>
                <TableCell>Current</TableCell>
                <TableCell>After confirmation</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {comparisons.map((item, index) => (
                <TableRow key={`${item.label}-${index}`}>
                  <TableCell component="th" scope="row">
                    {item.label}
                  </TableCell>
                  <TableCell>{readable(item.before)}</TableCell>
                  <TableCell>{readable(item.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
      <Box component="dl" className="clinic-assistant__workflow-fields">
        {proposal.preview
          .filter(
            (item) =>
              !isIdentifierLabel(item.label) &&
              !Object.prototype.hasOwnProperty.call(item, "before") &&
              !comparisons.some((change) => change.label === item.label),
          )
          .map((item, index) => (
            <Box component="div" key={`${item.label}-${index}`}>
              <Typography
                component="dt"
                variant="caption"
                color="text.secondary"
              >
                {item.label}
              </Typography>
              <Typography component="dd" variant="body2">
                {readable(item.value)}
              </Typography>
              {suggestedLabels.includes(item.label) && (
                <Chip
                  size="small"
                  variant="outlined"
                  label="Filled by assistant"
                />
              )}
            </Box>
          ))}
      </Box>
      <Typography variant="caption" color="text.secondary">
        Expires {new Date(proposal.expires_at).toLocaleString()}
      </Typography>
      {error && (
        <Alert severity="warning">
          {error} Check the saved result before trying again.
        </Alert>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button
          variant="contained"
          disabled={busy || expired || !!error}
          onClick={onConfirm}
        >
          {busy ? "Confirming…" : "Confirm and save"}
        </Button>
        {error && (
          <Button disabled={busy} onClick={onReadback}>
            Check result
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
