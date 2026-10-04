import {
  Alert,
  Box,
  Button,
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
  return (
    <Stack spacing={2}>
      <Typography component="h3" variant="subtitle1">
        {result.title}
      </Typography>
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
      {(result.status === "receipt" || result.receipt_id) && (
        <Alert severity="success">
          {result.status === "receipt"
            ? "Change confirmed and saved. The clinic returned its receipt."
            : "Read receipt recorded by the clinic."}
        </Alert>
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
  busy,
  error,
  onConfirm,
  onReadback,
}: {
  proposal: WorkflowProposal;
  expired: boolean;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onReadback: () => void;
}) {
  return (
    <Paper variant="outlined" className="clinic-assistant__workflow-review">
      <Typography component="h3" variant="subtitle1">
        {proposal.title || "Review change"}
      </Typography>
      <Alert severity={expired ? "warning" : "info"}>
        {expired
          ? "This review expired. Prepare the change again."
          : "Review these exact values. Nothing is saved until you confirm."}
      </Alert>
      <Box component="dl" className="clinic-assistant__workflow-fields">
        {proposal.preview
          .filter((item) => !isIdentifierLabel(item.label))
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
