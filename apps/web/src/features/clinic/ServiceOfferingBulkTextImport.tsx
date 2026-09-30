import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import {
  readMappingSource,
  type ConfigurationManifest,
} from "./configurationMapping";
import {
  offeringImportFields,
  type OfferingImportField,
  type OfferingTextTarget,
} from "./offeringTextImportModel";
import {
  offeringTextBatchFailure,
  offeringTextBatchItems,
  offeringTextBatchPlan,
  offeringTextBatchSummary,
  type OfferingTextBatchItem,
  type OfferingTextMapping,
} from "./offeringTextBatchModel";

export function ServiceOfferingBulkTextImport({
  targets,
  canApply,
  onClose,
}: {
  targets: OfferingTextTarget[];
  canApply: boolean;
  onClose: () => void;
}) {
  const [source, setSource] = useState<ConfigurationManifest | null>(null);
  const [mappings, setMappings] = useState<OfferingTextMapping[]>([]);
  const [items, setItems] = useState<OfferingTextBatchItem[] | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const running = useRef(false);
  const alive = useRef(true);
  const permitted = useRef(canApply);
  permitted.current = canApply;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current += 1;
    };
  }, []);
  const summary = offeringTextBatchSummary(items ?? []);
  const close = () => {
    if (!running.current && summary.canClose) onClose();
  };
  const read = async (file?: File) => {
    if (running.current || items) return;
    const request = ++generation.current;
    setSource(null);
    setMappings([]);
    setError("");
    setReading(!!file);
    if (!file) return;
    try {
      if (file.size > 1_000_000)
        throw new Error("Choose a JSON file smaller than 1 MB.");
      const saved = readMappingSource(JSON.parse(await file.text()));
      if (
        !targets.length ||
        targets.some(
          (target) => target.practice_id === saved.configuration.practice.id,
        )
      )
        throw new Error("Choose a snapshot from a different source clinic.");
      if (request === generation.current) setSource(saved);
    } catch (reason) {
      if (request === generation.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "The source snapshot could not be read.",
        );
    } finally {
      if (request === generation.current) setReading(false);
    }
  };
  const updateMapping = (
    targetId: number,
    changes: Partial<OfferingTextMapping>,
  ) => {
    setError("");
    setMappings((current) =>
      current.map((mapping) =>
        mapping.targetId === targetId ? { ...mapping, ...changes } : mapping,
      ),
    );
  };
  const review = () => {
    if (!source || reading || items || running.current || !canApply) return;
    try {
      setItems(
        offeringTextBatchItems(
          offeringTextBatchPlan(source, targets, mappings),
          () => crypto.randomUUID(),
        ),
      );
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Review the selected destinations and text fields.",
      );
    }
  };
  const apply = async (retryIndex?: number) => {
    if (!items || running.current || !permitted.current) return;
    if (retryIndex === undefined && summary.unknown) return;
    if (retryIndex !== undefined && items[retryIndex]?.status !== "unknown")
      return;
    running.current = true;
    setBusy(true);
    let current = items;
    const indices =
      retryIndex === undefined
        ? items.flatMap((item, index) =>
            item.status === "ready" ? [index] : [],
          )
        : [retryIndex];
    const replace = (
      index: number,
      changes: Partial<OfferingTextBatchItem>,
    ) => {
      current = current.map((item, position) =>
        position === index ? { ...item, ...changes } : item,
      );
      if (alive.current) setItems(current);
    };
    try {
      for (const index of indices) {
        if (!alive.current || !permitted.current) break;
        const item = current[index];
        replace(index, { status: "sending", message: "Awaiting confirmation" });
        try {
          const result = await api<{
            service_offering: OfferingTextTarget;
            replayed: boolean;
          }>(item.attempt.path, {
            method: item.attempt.method,
            body: item.attempt.body,
          });
          if (
            result?.service_offering?.id !== item.plan.targetId ||
            result.service_offering.practice_id !== targets[0]?.practice_id ||
            typeof result.replayed !== "boolean"
          )
            throw new ApiError(
              502,
              "The destination update receipt could not be confirmed.",
              "outcome_unconfirmed",
            );
          replace(index, {
            status: "applied",
            message:
              "Selected text confirmed saved through the existing offering update.",
          });
        } catch (reason) {
          replace(
            index,
            offeringTextBatchFailure(
              item.status,
              reason instanceof ApiError ? reason : null,
            ),
          );
          // Stop on the first rejection/uncertainty. Continuing or retrying is
          // always another explicit action; prior applied items are not resent.
          break;
        }
      }
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Dialog open onClose={close} fullWidth maxWidth="lg">
      <DialogTitle>Import text into selected drafts</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2">
            Choose each existing destination draft, source offering, and text
            field explicitly. Review every replacement before applying. Each
            item uses its own authorized offering update; this review is not an
            atomic batch.
          </Typography>
          <Typography variant="body2">
            Supported text: offering name, local code, contact instructions and
            referral instructions. Catalog references, eligibility, prices,
            scheduling rules and profile settings stay with the destination.
          </Typography>
          {!canApply && (
            <Alert severity="warning">
              Current configuration write permission is unavailable. Reviewed
              requests remain here; no new request can be sent.
            </Alert>
          )}
          {!items && (
            <Button
              component="label"
              variant="outlined"
              disabled={reading || !canApply}
              sx={{ alignSelf: "flex-start" }}
            >
              Choose bulk offering source JSON
              <input
                type="file"
                accept=".json,application/json"
                hidden
                disabled={reading || !canApply}
                onChange={(event) => {
                  void read(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </Button>
          )}
          {reading && (
            <Typography role="status">Reading source snapshot…</Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {source && (
            <Typography variant="caption">
              Source: {source.configuration.practice.name} (#
              {source.configuration.practice.id}), read {source.generated_at}.
              Digest {source.source_digest} is supplied provenance, not proof of
              authenticity. Destination clinic #{targets[0]?.practice_id}.
            </Typography>
          )}
          {source && !items && (
            <>
              {targets
                .filter((target) => target.status === "draft")
                .map((target) => {
                  const mapping = mappings.find(
                    (row) => row.targetId === target.id,
                  );
                  return (
                    <Stack
                      key={target.id}
                      spacing={1}
                      sx={{ borderBottom: 1, borderColor: "divider", pb: 2 }}
                    >
                      <FormControlLabel
                        label={`Destination: ${target.name} (#${target.id})`}
                        control={
                          <Checkbox
                            checked={!!mapping}
                            disabled={!canApply}
                            onChange={(_event, checked) => {
                              setError("");
                              setMappings((current) =>
                                checked
                                  ? [
                                      ...current,
                                      {
                                        targetId: target.id,
                                        sourceOfferingId: 0,
                                        fields: [],
                                      },
                                    ]
                                  : current.filter(
                                      (row) => row.targetId !== target.id,
                                    ),
                              );
                            }}
                          />
                        }
                      />
                      {mapping && (
                        <>
                          <TextField
                            select
                            size="small"
                            label={`Source offering for destination #${target.id}`}
                            value={mapping.sourceOfferingId || ""}
                            disabled={!canApply}
                            onChange={(event) =>
                              updateMapping(target.id, {
                                sourceOfferingId:
                                  Number(event.target.value) || 0,
                                fields: [],
                              })
                            }
                          >
                            <MenuItem value="">Select explicitly</MenuItem>
                            {source.configuration.service_offerings.map(
                              (row) => (
                                <MenuItem key={row.id} value={row.id}>
                                  {row.name} (#{row.id})
                                </MenuItem>
                              ),
                            )}
                          </TextField>
                          {mapping.sourceOfferingId > 0 && (
                            <Stack direction="row" sx={{ flexWrap: "wrap" }}>
                              {(
                                Object.keys(
                                  offeringImportFields,
                                ) as OfferingImportField[]
                              ).map((field) => (
                                <FormControlLabel
                                  key={field}
                                  label={`${offeringImportFields[field].label} for #${target.id}`}
                                  control={
                                    <Checkbox
                                      checked={mapping.fields.includes(field)}
                                      disabled={!canApply}
                                      onChange={(_event, checked) =>
                                        updateMapping(target.id, {
                                          fields: checked
                                            ? [...mapping.fields, field]
                                            : mapping.fields.filter(
                                                (item) => item !== field,
                                              ),
                                        })
                                      }
                                    />
                                  }
                                />
                              ))}
                            </Stack>
                          )}
                        </>
                      )}
                    </Stack>
                  );
                })}
              <Button
                variant="outlined"
                disabled={!canApply || !mappings.length || reading}
                onClick={review}
              >
                Preview selected draft changes
              </Button>
            </>
          )}
          {items && (
            <>
              <Alert
                severity={
                  summary.complete
                    ? "success"
                    : summary.unknown || summary.failed
                      ? "warning"
                      : "info"
                }
              >
                {summary.complete
                  ? "All reviewed items are confirmed applied. Review the drafts before publishing."
                  : `${summary.applied} of ${items.length} confirmed applied; ${summary.unknown} unknown, ${summary.failed} rejected, ${summary.ready} not attempted, ${summary.sending} awaiting confirmation.`}
              </Alert>
              <Typography variant="body2">
                This review and its exact requests are held in memory. Keep it
                open while an outcome is unknown. Page reload or navigation does
                not restore a batch or undo applied text.
              </Typography>
              {items.map((item, index) => (
                <Stack key={item.plan.targetId} spacing={1}>
                  <Typography variant="subtitle2" component="h3">
                    Source #{item.plan.sourceOfferingId} → destination #
                    {item.plan.targetId} · expected revision{" "}
                    {item.plan.expectedVersion}
                  </Typography>
                  <Typography variant="caption">
                    Request identity:{" "}
                    {item.attempt.body.service_offering.request_key}
                  </Typography>
                  <TableContainer sx={{ overflowX: "auto" }}>
                    <Table
                      size="small"
                      aria-label={`Text changes for destination #${item.plan.targetId}`}
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell>Field</TableCell>
                          <TableCell>Current destination text</TableCell>
                          <TableCell>Source text to save</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {item.plan.changes.map((change) => (
                          <TableRow key={change.field}>
                            <TableCell>
                              {offeringImportFields[change.field].label}
                            </TableCell>
                            <TableCell
                              sx={{
                                whiteSpace: "pre-wrap",
                                overflowWrap: "anywhere",
                              }}
                            >
                              {change.before ?? "Not configured"}
                            </TableCell>
                            <TableCell
                              sx={{
                                whiteSpace: "pre-wrap",
                                overflowWrap: "anywhere",
                              }}
                            >
                              {change.after}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Typography role="status">
                    Destination #{item.plan.targetId}: {item.status} —{" "}
                    {item.message}
                  </Typography>
                  {item.status === "unknown" && (
                    <Button
                      variant="outlined"
                      disabled={busy || !canApply}
                      onClick={() => void apply(index)}
                    >
                      Retry exact change for #{item.plan.targetId}
                    </Button>
                  )}
                </Stack>
              ))}
              {summary.ready > 0 && (
                <Button
                  variant="contained"
                  disabled={busy || !canApply || summary.unknown > 0}
                  onClick={() => void apply()}
                >
                  {summary.applied || summary.failed
                    ? "Apply unattempted reviewed items"
                    : "Apply reviewed draft text"}
                </Button>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {items && items.every((item) => item.status === "ready") && (
          <Button disabled={busy} onClick={() => setItems(null)}>
            Change selections
          </Button>
        )}
        <Button disabled={busy || !summary.canClose} onClick={close}>
          Close review and reload offerings
        </Button>
      </DialogActions>
    </Dialog>
  );
}
