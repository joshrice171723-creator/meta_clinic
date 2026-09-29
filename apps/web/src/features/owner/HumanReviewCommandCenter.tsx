import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import LaunchOutlinedIcon from "@mui/icons-material/LaunchOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import { api } from "../../api/client";

type Criterion = { id: string; label: string; expected: string };
type Result = {
  criterion_id: string;
  outcome: "" | "passed" | "failed";
  evidence: string;
};
type ReviewPacket = {
  id: number;
  title: string;
  summary: string;
  scope: string;
  revision: string;
  environment: string;
  entry_path: string;
  status: "awaiting_review" | "approved" | "changes_requested";
  criteria: Criterion[];
  created_at: string;
  created_by: string;
  decision: null | {
    outcome: "approved" | "changes_requested";
    note: string;
    results: Array<Omit<Result, "outcome"> & { outcome: "passed" | "failed" }>;
    reviewed_at: string;
    reviewer: string;
  };
};

export type HumanReviewData = {
  counts: {
    total: number;
    awaiting_review: number;
    approved: number;
    changes_requested: number;
    review_coverage_percent: number;
  };
  packets: ReviewPacket[];
};

const statusLabel = {
  awaiting_review: "Awaiting review",
  approved: "Browser accepted",
  changes_requested: "Changes requested",
} as const;

const statusColor = {
  awaiting_review: "warning",
  approved: "success",
  changes_requested: "error",
} as const;

export function HumanReviewCommandCenter({
  review,
  onRefresh,
}: {
  review: HumanReviewData;
  onRefresh: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(
    review.packets[0]?.id ?? null,
  );
  const selected =
    review.packets.find((packet) => packet.id === selectedId) ??
    review.packets[0] ??
    null;
  const [results, setResults] = useState<Result[]>([]);
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [savingDecision, setSavingDecision] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [packet, setPacket] = useState({
    title: "",
    summary: "",
    scope: "",
    revision: "",
    environment: "Local development",
    entry_path: "/",
  });
  const [criteria, setCriteria] = useState([{ label: "", expected: "" }]);

  useEffect(() => {
    if (!selected) {
      setResults([]);
      return;
    }
    setResults(
      selected.criteria.map((criterion) => ({
        criterion_id: criterion.id,
        outcome: "",
        evidence: "",
      })),
    );
    setDecisionNote("");
    setDecisionError("");
  }, [selected?.id]);

  const allEvidenceRecorded = results.every(
    (result) => result.outcome && result.evidence.trim(),
  );
  const canApprove =
    !!selected &&
    selected.status === "awaiting_review" &&
    results.length === selected.criteria.length &&
    allEvidenceRecorded &&
    results.every((result) => result.outcome === "passed") &&
    decisionNote.trim().length > 0;
  const canRequestChanges =
    !!selected &&
    selected.status === "awaiting_review" &&
    allEvidenceRecorded &&
    results.some((result) => result.outcome === "failed") &&
    decisionNote.trim().length > 0;

  const selectedResults = useMemo(
    () =>
      new Map(
        (selected?.decision?.results ?? []).map((result) => [
          result.criterion_id,
          result,
        ]),
      ),
    [selected],
  );

  const createPacket = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      const created = await api<ReviewPacket>("/api/owner/review_packets", {
        method: "POST",
        body: { review_packet: { ...packet, criteria } },
      });
      setSelectedId(created.id);
      setCreateOpen(false);
      setPacket({
        title: "",
        summary: "",
        scope: "",
        revision: "",
        environment: "Local development",
        entry_path: "/",
      });
      setCriteria([{ label: "", expected: "" }]);
      onRefresh();
    } catch (reason) {
      setCreateError(
        reason instanceof Error
          ? reason.message
          : "The review packet could not be created.",
      );
    } finally {
      setCreating(false);
    }
  };

  const decide = async (outcome: "approved" | "changes_requested") => {
    if (!selected) return;
    setSavingDecision(true);
    setDecisionError("");
    try {
      await api(`/api/owner/review_packets/${selected.id}/decision`, {
        method: "POST",
        body: { decision: { outcome, note: decisionNote, results } },
      });
      onRefresh();
    } catch (reason) {
      setDecisionError(
        reason instanceof Error
          ? reason.message
          : "The decision could not be saved.",
      );
    } finally {
      setSavingDecision(false);
    }
  };

  return (
    <Paper
      component="section"
      id="human-review"
      variant="outlined"
      sx={{ overflow: "hidden" }}
    >
      <Box
        sx={{
          p: { xs: 2, md: 3 },
          display: "flex",
          gap: 2,
          alignItems: { xs: "flex-start", md: "center" },
          justifyContent: "space-between",
          flexDirection: { xs: "column", md: "row" },
          bgcolor: "#f4f7f3",
        }}
      >
        <Box>
          <Typography component="p" variant="overline" color="text.secondary">
            Human-in-the-loop acceptance
          </Typography>
          <Typography component="h2" variant="h4">
            Review queue
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>
            Reproduce the exact workflow, grade every acceptance criterion, and
            save the evidence-bound decision.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddOutlinedIcon />}
          onClick={() => setCreateOpen(true)}
        >
          Line up work for review
        </Button>
      </Box>
      <Divider />

      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
            gap: 1.5,
            mb: 3,
          }}
        >
          {[
            ["Review coverage", `${review.counts.review_coverage_percent}%`],
            ["Awaiting review", review.counts.awaiting_review],
            ["Browser accepted", review.counts.approved],
            ["Changes requested", review.counts.changes_requested],
          ].map(([label, value]) => (
            <Paper key={label} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="h4">{value}</Typography>
            </Paper>
          ))}
        </Box>

        {review.packets.length === 0 ? (
          <Box sx={{ py: 5, textAlign: "center" }}>
            <TaskAltOutlinedIcon color="disabled" sx={{ fontSize: 44 }} />
            <Typography variant="h6" sx={{ mt: 1 }}>
              No work is waiting for human review.
            </Typography>
            <Typography color="text.secondary">
              Create a packet with the exact build, route, and success criteria.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                lg: "minmax(250px, .72fr) minmax(0, 1.6fr)",
              },
              gap: 2.5,
            }}
          >
            <Stack spacing={1} aria-label="Review packets">
              {review.packets.map((item) => (
                <ButtonBase
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  aria-pressed={selected?.id === item.id}
                  sx={{
                    p: 2,
                    width: "100%",
                    textAlign: "left",
                    cursor: "pointer",
                    bgcolor:
                      selected?.id === item.id
                        ? "action.selected"
                        : "background.paper",
                    border: 1,
                    borderColor:
                      selected?.id === item.id ? "primary.main" : "divider",
                    borderRadius: 1,
                    color: "text.primary",
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <Typography sx={{ fontWeight: 700 }}>
                      {item.title}
                    </Typography>
                    <Chip
                      size="small"
                      color={statusColor[item.status]}
                      label={statusLabel[item.status]}
                    />
                  </Stack>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    {item.revision} · {item.environment}
                  </Typography>
                </ButtonBase>
              ))}
            </Stack>

            {selected && (
              <Stack spacing={2.5}>
                <Box>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    sx={{
                      justifyContent: "space-between",
                      alignItems: { xs: "flex-start", sm: "center" },
                    }}
                  >
                    <Box>
                      <Typography component="h3" variant="h5">
                        {selected.title}
                      </Typography>
                      <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                        {selected.summary}
                      </Typography>
                    </Box>
                    <Button
                      component="a"
                      href={selected.entry_path}
                      target="_blank"
                      rel="noreferrer"
                      variant="outlined"
                      endIcon={<LaunchOutlinedIcon />}
                    >
                      Open workflow
                    </Button>
                  </Stack>
                  <Box
                    sx={{
                      mt: 2,
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
                      gap: 1.5,
                    }}
                  >
                    <Meta label="Revision" value={selected.revision} />
                    <Meta label="Environment" value={selected.environment} />
                    <Meta label="Route" value={selected.entry_path} />
                  </Box>
                  <Typography variant="body2" sx={{ mt: 2 }}>
                    <strong>Acceptance scope:</strong> {selected.scope}
                  </Typography>
                </Box>

                {selected.status === "approved" && (
                  <Alert severity="success" icon={<TaskAltOutlinedIcon />}>
                    Browser acceptance recorded for revision{" "}
                    <strong>{selected.revision}</strong> in{" "}
                    <strong>{selected.environment}</strong>.
                  </Alert>
                )}

                <Stack spacing={1.5}>
                  {selected.criteria.map((criterion, index) => {
                    const saved = selectedResults.get(criterion.id);
                    const current = results[index];
                    return (
                      <Paper
                        key={criterion.id}
                        variant="outlined"
                        sx={{ p: 2 }}
                      >
                        <Typography sx={{ fontWeight: 700 }}>
                          {index + 1}. {criterion.label}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.5 }}
                        >
                          Expected evidence: {criterion.expected}
                        </Typography>
                        {saved ? (
                          <Box sx={{ mt: 1.5 }}>
                            <Chip
                              size="small"
                              color={
                                saved.outcome === "passed" ? "success" : "error"
                              }
                              label={
                                saved.outcome === "passed" ? "Passed" : "Failed"
                              }
                            />
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              {saved.evidence}
                            </Typography>
                          </Box>
                        ) : (
                          <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                            <FormControl>
                              <FormLabel id={`criterion-${criterion.id}`}>
                                Observed result
                              </FormLabel>
                              <RadioGroup
                                row
                                aria-labelledby={`criterion-${criterion.id}`}
                                value={current?.outcome ?? ""}
                                onChange={(event) =>
                                  setResults((items) =>
                                    items.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            outcome: event.target
                                              .value as Result["outcome"],
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              >
                                <FormControlLabel
                                  value="passed"
                                  control={<Radio />}
                                  label="Pass"
                                />
                                <FormControlLabel
                                  value="failed"
                                  control={<Radio />}
                                  label="Fail"
                                />
                              </RadioGroup>
                            </FormControl>
                            <TextField
                              label="Observed evidence"
                              value={current?.evidence ?? ""}
                              onChange={(event) =>
                                setResults((items) =>
                                  items.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          evidence: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                              multiline
                              minRows={2}
                              slotProps={{ htmlInput: { maxLength: 1000 } }}
                              required
                            />
                          </Stack>
                        )}
                      </Paper>
                    );
                  })}
                </Stack>

                {selected.decision ? (
                  <Paper
                    variant="outlined"
                    sx={{ p: 2, bgcolor: "action.hover" }}
                  >
                    <Typography sx={{ fontWeight: 700 }}>
                      Decision by {selected.decision.reviewer}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(selected.decision.reviewed_at).toLocaleString()}
                    </Typography>
                    <Typography sx={{ mt: 1 }}>
                      {selected.decision.note}
                    </Typography>
                  </Paper>
                ) : (
                  <Stack spacing={1.5}>
                    <TextField
                      label="Decision note"
                      value={decisionNote}
                      onChange={(event) => setDecisionNote(event.target.value)}
                      multiline
                      minRows={3}
                      slotProps={{ htmlInput: { maxLength: 1000 } }}
                      required
                      helperText="Summarize what you exercised and why this decision is justified."
                    />
                    {decisionError && (
                      <Alert severity="error">{decisionError}</Alert>
                    )}
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.5}
                    >
                      <Button
                        variant="contained"
                        color="success"
                        disabled={!canApprove || savingDecision}
                        onClick={() => decide("approved")}
                      >
                        Record browser acceptance
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        disabled={!canRequestChanges || savingDecision}
                        onClick={() => decide("changes_requested")}
                      >
                        Request changes
                      </Button>
                    </Stack>
                  </Stack>
                )}
              </Stack>
            )}
          </Box>
        )}
      </Box>

      <Dialog
        open={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <Box component="form" onSubmit={createPacket}>
          <DialogTitle>Line up work for human review</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <TextField
                label="Review title"
                value={packet.title}
                onChange={(event) =>
                  setPacket({ ...packet, title: event.target.value })
                }
                slotProps={{ htmlInput: { maxLength: 140 } }}
                required
                autoFocus
              />
              <TextField
                label="What changed"
                value={packet.summary}
                onChange={(event) =>
                  setPacket({ ...packet, summary: event.target.value })
                }
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: 1000 } }}
                required
              />
              <TextField
                label="Exact acceptance scope"
                value={packet.scope}
                onChange={(event) =>
                  setPacket({ ...packet, scope: event.target.value })
                }
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: 1000 } }}
                required
                helperText="Name the workflow and boundaries this decision will cover."
              />
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  gap: 2,
                }}
              >
                <TextField
                  label="Exact revision"
                  value={packet.revision}
                  onChange={(event) =>
                    setPacket({ ...packet, revision: event.target.value })
                  }
                  slotProps={{ htmlInput: { maxLength: 120 } }}
                  required
                />
                <TextField
                  label="Environment"
                  value={packet.environment}
                  onChange={(event) =>
                    setPacket({ ...packet, environment: event.target.value })
                  }
                  slotProps={{ htmlInput: { maxLength: 80 } }}
                  required
                />
              </Box>
              <TextField
                label="Same-origin route to review"
                value={packet.entry_path}
                onChange={(event) =>
                  setPacket({ ...packet, entry_path: event.target.value })
                }
                slotProps={{ htmlInput: { maxLength: 500 } }}
                required
                helperText="Use a path such as /owner or /clinic/schedule."
              />
              <Divider />
              <Typography variant="h6">Acceptance criteria</Typography>
              {criteria.map((criterion, index) => (
                <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={1.5}>
                    <TextField
                      label={`Criterion ${index + 1}`}
                      value={criterion.label}
                      onChange={(event) =>
                        setCriteria((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, label: event.target.value }
                              : item,
                          ),
                        )
                      }
                      slotProps={{ htmlInput: { maxLength: 160 } }}
                      required
                    />
                    <TextField
                      label="Expected evidence"
                      value={criterion.expected}
                      onChange={(event) =>
                        setCriteria((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, expected: event.target.value }
                              : item,
                          ),
                        )
                      }
                      slotProps={{ htmlInput: { maxLength: 500 } }}
                      required
                    />
                    {criteria.length > 1 && (
                      <Button
                        color="error"
                        size="small"
                        onClick={() =>
                          setCriteria((items) =>
                            items.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        sx={{ alignSelf: "flex-start" }}
                      >
                        Remove criterion
                      </Button>
                    )}
                  </Stack>
                </Paper>
              ))}
              <Button
                variant="outlined"
                startIcon={<AddOutlinedIcon />}
                disabled={criteria.length >= 12}
                onClick={() =>
                  setCriteria((items) => [
                    ...items,
                    { label: "", expected: "" },
                  ])
                }
                sx={{ alignSelf: "flex-start" }}
              >
                Add criterion
              </Button>
              {createError && <Alert severity="error">{createError}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={creating}>
              Create review packet
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Paper>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
        {value}
      </Typography>
    </Box>
  );
}
