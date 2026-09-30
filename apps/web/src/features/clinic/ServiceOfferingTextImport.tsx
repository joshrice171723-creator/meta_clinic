import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import {
  readMappingSource,
  type ConfigurationManifest,
} from "./configurationMapping";
import {
  offeringImportFields,
  offeringTextImportAttempt,
  offeringTextImportPlan,
  type OfferingImportField,
  type OfferingTextTarget,
} from "./offeringTextImportModel";

export function ServiceOfferingTextImport({
  target,
  reservedCodes,
  disabled,
  onApply,
}: {
  target: OfferingTextTarget;
  reservedCodes: string[];
  disabled: boolean;
  onApply: (attempt: ReturnType<typeof offeringTextImportAttempt>) => void;
}) {
  const [source, setSource] = useState<ConfigurationManifest | null>(null);
  const [sourceId, setSourceId] = useState<number | "">("");
  const [fields, setFields] = useState<OfferingImportField[]>([]);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const generation = useRef(0);
  const sent = useRef(false);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  const reset = () => {
    sent.current = false;
    setSubmitted(false);
  };
  const read = async (file?: File) => {
    if (disabled) return;
    const request = ++generation.current;
    setSource(null);
    setSourceId("");
    setFields([]);
    setError("");
    reset();
    if (!file) return;
    try {
      if (file.size > 1_000_000)
        throw new Error("Choose a JSON file smaller than 1 MB.");
      const saved = readMappingSource(JSON.parse(await file.text()));
      if (saved.configuration.practice.id === target.practice_id)
        throw new Error("Choose a snapshot from a different source clinic.");
      if (request === generation.current) setSource(saved);
    } catch (reason) {
      if (request === generation.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "The source snapshot could not be read.",
        );
    }
  };
  let plan: ReturnType<typeof offeringTextImportPlan> | null = null;
  let problem = "";
  if (source && sourceId && fields.length) {
    try {
      plan = offeringTextImportPlan(
        source,
        sourceId,
        target,
        fields,
        reservedCodes,
      );
    } catch (reason) {
      problem =
        reason instanceof Error
          ? reason.message
          : "Review the selected source text.";
    }
  }
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2" component="h3">
        Import text into this draft
      </Typography>
      <Typography variant="body2">
        Destination: {target.name} (#{target.id}). Choose a source offering and
        fields explicitly, review every replacement, then apply. Visit type,
        eligibility, prices, scheduling rules and profile settings stay with
        this destination.
      </Typography>
      {disabled && (
        <Typography variant="body2">
          Finish or discard current edits and resolve any pending save before
          importing text.
        </Typography>
      )}
      <Button
        component="label"
        size="small"
        variant="outlined"
        disabled={disabled}
        sx={{ alignSelf: "flex-start" }}
      >
        Choose offering source JSON
        <input
          type="file"
          accept=".json,application/json"
          hidden
          disabled={disabled}
          onChange={(event) => {
            void read(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      {source && (
        <>
          <Typography variant="caption">
            Source: {source.configuration.practice.name} (#
            {source.configuration.practice.id}), read {source.generated_at}.
            Digest {source.source_digest} is supplied provenance, not proof of
            authenticity.
          </Typography>
          <TextField
            select
            size="small"
            label="Source offering for text import"
            value={sourceId}
            disabled={disabled}
            onChange={(event) => {
              setSourceId(Number(event.target.value) || "");
              setFields([]);
              reset();
            }}
          >
            <MenuItem value="">Select explicitly</MenuItem>
            {source.configuration.service_offerings.map((row) => (
              <MenuItem key={row.id} value={row.id}>
                {row.name} (#{row.id})
              </MenuItem>
            ))}
          </TextField>
          {sourceId &&
            (Object.keys(offeringImportFields) as OfferingImportField[]).map(
              (field) => (
                <FormControlLabel
                  key={field}
                  label={offeringImportFields[field].label}
                  control={
                    <Checkbox
                      checked={fields.includes(field)}
                      disabled={disabled}
                      onChange={(_event, checked) => {
                        setFields((current) =>
                          checked
                            ? [...current, field]
                            : current.filter((item) => item !== field),
                        );
                        reset();
                      }}
                    />
                  }
                />
              ),
            )}
          {problem && <Alert severity="warning">{problem}</Alert>}
          {plan && (
            <>
              <Table size="small" aria-label="Offering text import changes">
                <TableHead>
                  <TableRow>
                    <TableCell>Field</TableCell>
                    <TableCell>Current destination text</TableCell>
                    <TableCell>Source text to save</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {plan.changes.map((change) => (
                    <TableRow key={change.field}>
                      <TableCell>
                        {offeringImportFields[change.field].label}
                      </TableCell>
                      <TableCell
                        sx={{
                          overflowWrap: "anywhere",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {change.before ?? "Not configured"}
                      </TableCell>
                      <TableCell
                        sx={{
                          overflowWrap: "anywhere",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {change.after}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button
                type="button"
                variant="outlined"
                disabled={disabled || submitted}
                onClick={() => {
                  if (disabled || sent.current || !plan) return;
                  sent.current = true;
                  setSubmitted(true);
                  onApply(offeringTextImportAttempt(plan, crypto.randomUUID()));
                }}
              >
                Apply selected text to this draft
              </Button>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
