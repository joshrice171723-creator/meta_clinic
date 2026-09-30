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
  changeSavedTextBatch,
  readSavedTextBatch,
  validateSavedTextBatch,
  type BatchCatalog,
  type SavedTextBatch,
} from "./offeringTextBatchPersistence";
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
  const [catalog, setCatalog] = useState<BatchCatalog | null>(null);
  const [saved, setSaved] = useState<SavedTextBatch | null>(null);
  const [savedKey, setSavedKey] = useState("");
  const [contextLost, setContextLost] = useState(false);
  const reviewKey = useRef("");
  const saveUncertain = useRef(false);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const running = useRef(false);
  const alive = useRef(true);
  const permitted = useRef(canApply);
  permitted.current = canApply && !contextLost;
  useEffect(() => {
    alive.current = true;
    void api<BatchCatalog>("/api/clinic/offering_text_batches")
      .then((value) => {
        if (
          alive.current &&
          (!targets.length ||
            value.context.practice_id === targets[0]?.practice_id)
        )
          setCatalog(value);
      })
      .catch((reason) => {
        if (alive.current)
          setError(
            reason instanceof Error
              ? reason.message
              : "Saved reviews could not be loaded.",
          );
      });
    return () => {
      alive.current = false;
      generation.current += 1;
    };
  }, []);
  const summary = offeringTextBatchSummary(items ?? []);
  const close = () => {
    if (!running.current && (saved || summary.canClose)) onClose();
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
    if (
      !source ||
      reading ||
      items ||
      running.current ||
      !permitted.current ||
      !catalog
    )
      return;
    reviewKey.current = crypto.randomUUID();
    saveUncertain.current = false;
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
  const loseContext = (reason: unknown) => {
    if (
      reason instanceof ApiError &&
      ([401, 403].includes(reason.status) ||
        ["session_changed", "clinic_changed"].includes(reason.code ?? ""))
    ) {
      permitted.current = false;
      setContextLost(true);
    }
  };
  const restore = async (key: string) => {
    if (!catalog || running.current || !key) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const batch = await readSavedTextBatch(key, catalog.context);
      if (alive.current) {
        setSaved(batch);
        setItems(batch.items);
        setSource(null);
        setSavedKey(batch.request_key);
      }
    } catch (reason) {
      loseContext(reason);
      if (alive.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "The saved review could not be restored.",
        );
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const saveReview = async () => {
    if (
      !items ||
      !source ||
      !catalog ||
      saved ||
      running.current ||
      !permitted.current
    )
      return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const batch = validateSavedTextBatch(
        await api<SavedTextBatch>("/api/clinic/offering_text_batches", {
          method: "POST",
          body: {
            batch: {
              context: catalog.context,
              request_key: reviewKey.current,
              source: {
                practiceId: source.configuration.practice.id,
                digest: source.source_digest,
                generatedAt: source.generated_at,
              },
              items: items.map((item) => ({
                plan: item.plan,
                attempt: item.attempt,
              })),
            },
          },
        }),
        catalog.context,
        { key: reviewKey.current, items },
      );
      if (alive.current) {
        setSaved(batch);
        setItems(batch.items);
        setSavedKey(batch.request_key);
      }
    } catch (reason) {
      loseContext(reason);
      if (alive.current) {
        const unconfirmed =
          saveUncertain.current ||
          !(reason instanceof ApiError) ||
          reason.status === 408 ||
          reason.status >= 500 ||
          reason.code === "outcome_unconfirmed";
        saveUncertain.current = unconfirmed;
        setSavedKey(unconfirmed ? reviewKey.current : "");
        setError(
          (unconfirmed
            ? "The review save was not confirmed. Reload this exact batch identity before applying. "
            : "The review was not saved. Revise the selection before saving again. ") +
            (reason instanceof Error ? reason.message : ""),
        );
      }
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const apply = async (retryIndex?: number, reconcileOnly = false) => {
    if (!items || !saved || running.current || !permitted.current) return;
    if (retryIndex === undefined && summary.unknown) return;
    if (retryIndex !== undefined && items[retryIndex]?.status !== "unknown")
      return;
    if (
      retryIndex !== undefined &&
      !reconcileOnly &&
      !saved.items[retryIndex].retryPermitted
    )
      return;
    running.current = true;
    setBusy(true);
    let batch = saved;
    const indices =
      retryIndex === undefined
        ? items.flatMap((item, index) =>
            item.status === "ready" ? [index] : [],
          )
        : [retryIndex];
    const accept = (value: SavedTextBatch) => {
      batch = value;
      if (alive.current) {
        setSaved(value);
        setItems(value.items);
      }
    };
    try {
      for (const index of indices) {
        if (!alive.current || !permitted.current) break;
        try {
          if (reconcileOnly) {
            accept(await changeSavedTextBatch(batch, index, "reconcile"));
            break;
          }
          if (batch.items[index].status === "ready")
            accept(await changeSavedTextBatch(batch, index, "prepare"));
          if (!alive.current || !permitted.current) break;
          accept(await changeSavedTextBatch(batch, index, "apply"));
          if (batch.items[index].status !== "applied") break;
        } catch (reason) {
          loseContext(reason);
          const failure = offeringTextBatchFailure(
            "unknown",
            reason instanceof ApiError ? reason : null,
          );
          accept({
            ...batch,
            items: batch.items.map((item, position) =>
              position === index
                ? { ...item, ...failure, retryPermitted: false }
                : item,
            ),
          });
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
          {(!canApply || contextLost) && (
            <Alert severity="warning">
              Current configuration write permission is unavailable. Reviewed
              requests remain here; no new request can be sent.
            </Alert>
          )}
          {!items && catalog && (
            <Stack spacing={1}>
              <Typography variant="subtitle2">
                Saved text-import reviews for this actor and site
              </Typography>
              {catalog.batches.map((batch) => (
                <Button
                  key={batch.request_key}
                  disabled={busy || contextLost}
                  onClick={() => void restore(batch.request_key)}
                >
                  Resume {batch.request_key} · {batch.created_at}
                </Button>
              ))}
              {catalog.capped && (
                <Typography variant="caption">
                  Latest 25 reviews shown. Enter an older exact batch identity
                  to reload it.
                </Typography>
              )}
            </Stack>
          )}
          {catalog && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                size="small"
                label="Saved batch identity"
                value={savedKey}
                disabled={busy || contextLost}
                onChange={(event) => setSavedKey(event.target.value)}
              />
              <Button
                disabled={busy || !savedKey || contextLost}
                onClick={() => void restore(savedKey)}
              >
                Reload saved review
              </Button>
            </Stack>
          )}
          {saved && (
            <Typography variant="caption">
              Saved batch {saved.request_key}. Original actor #
              {saved.context.actor_id}, membership #
              {saved.context.actor_membership_id}, clinic #
              {saved.context.practice_id}, site {saved.context.site_id ?? "all"}
              , authorization generation{" "}
              {saved.context.authorization_generation}. Source #
              {saved.source.practiceId}, digest {saved.source.digest}, read{" "}
              {saved.source.generatedAt}. Retention policy:{" "}
              {saved.retention_policy}.
            </Typography>
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
                disabled={
                  !canApply ||
                  contextLost ||
                  !catalog ||
                  !mappings.length ||
                  reading
                }
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
                Save this review before applying. Saved requests and outcomes
                can be reloaded only by the original authorized actor in the
                same clinic/site and authorization generation. Reload never
                applies or undoes text. Unknown items require explicit receipt
                reconciliation before an exact repeat.
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
                  {item.status === "unknown" && saved && (
                    <Button
                      disabled={busy || !canApply || contextLost}
                      onClick={() => void apply(index, true)}
                    >
                      Reconcile original receipt for #{item.plan.targetId}
                    </Button>
                  )}
                  {item.status === "unknown" &&
                    saved?.items[index].retryPermitted && (
                      <Button
                        variant="outlined"
                        disabled={busy || !canApply || contextLost}
                        onClick={() => void apply(index)}
                      >
                        Retry exact change for #{item.plan.targetId}
                      </Button>
                    )}
                </Stack>
              ))}
              {!saved && (
                <Button
                  variant="outlined"
                  disabled={busy || !catalog || !canApply || contextLost}
                  onClick={() => void saveReview()}
                >
                  Save reviewed text-import batch
                </Button>
              )}
              {saved && summary.ready > 0 && (
                <Button
                  variant="contained"
                  disabled={
                    busy || !canApply || contextLost || summary.unknown > 0
                  }
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
        {items &&
          !saved &&
          !savedKey &&
          items.every((item) => item.status === "ready") && (
            <Button disabled={busy} onClick={() => setItems(null)}>
              Change selections
            </Button>
          )}
        <Button
          disabled={busy || (!saved && !summary.canClose)}
          onClick={close}
        >
          Close review and reload offerings
        </Button>
      </DialogActions>
    </Dialog>
  );
}
