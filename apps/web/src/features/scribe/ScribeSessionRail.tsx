import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import {
  Avatar,
  Box,
  Button,
  InputAdornment,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import type {
  ScribeDocumentationWorkItem,
  ScribeDocumentationWorklist,
  ScribeEncounter,
} from "./types";
import { businessNow } from "../../shared/businessDate";
import { patientReferenceLabel } from "../clinic/patientReference";

export type ScribeEncounterSummary = Pick<
  ScribeEncounter,
  | "id"
  | "patient_id"
  | "site_id"
  | "status"
  | "consent_status"
  | "version"
  | "clinical_encounter_id"
  | "created_at"
  | "updated_at"
> & { patient: NonNullable<ScribeEncounter["patient"]> };

type ScribeSessionRailProps = {
  summaries: ScribeEncounterSummary[];
  worklist?: ScribeDocumentationWorklist;
  selectedId: number | null;
  search: string;
  disabled?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onSearchChange: (value: string) => void;
  onSelect: (id: number) => void;
  onOpenWorkItem?: (href: string) => void;
  onNewSession: () => void;
  onLoadMore: () => void;
};

const EMPTY_WORKLIST: ScribeDocumentationWorklist = {
  scope: "recent_completed_visits",
  candidate_limit_per_source: 25,
  unsigned_notes_available: false,
  truncated: false,
  returned_count: 0,
  returned_counts: {
    inputs_changed: 0,
    needs_review: 0,
    ready_to_add_to_chart: 0,
    unsigned_note: 0,
  },
  items: [],
};

function sessionDay(value?: string | null) {
  if (!value) return "Earlier";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "Earlier";
  const today = businessNow();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const key = parsed.toDateString();
  if (key === today.toDateString()) return "Today";
  if (key === yesterday.toDateString()) return "Yesterday";
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: parsed.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function sessionTime(value?: string | null) {
  if (!value) return "Time unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "Time unavailable";
  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isToday(value?: string | null) {
  if (!value) return false;
  const parsed = new Date(value);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toDateString() === businessNow().toDateString()
  );
}

function workLabel(state: ScribeDocumentationWorkItem["state"]) {
  if (state === "inputs_changed") return "Inputs changed";
  if (state === "needs_review") return "Needs review";
  if (state === "ready_to_add_to_chart") return "Ready to add to chart";
  return "Unsigned note";
}

function workHref(item: ScribeDocumentationWorkItem) {
  return item.kind === "scribe_draft" && item.scribe_encounter_id
    ? `/clinic/scribe?encounter_id=${item.scribe_encounter_id}&document_id=${item.document_id}&review=1`
    : `/clinic/patients/${item.patient.id}/encounters/${item.clinical_encounter_id}`;
}

function workDetail(item: ScribeDocumentationWorkItem) {
  const unresolved =
    item.state === "needs_review" && item.unresolved_section_count
      ? ` · ${item.unresolved_section_count} section${item.unresolved_section_count === 1 ? "" : "s"}`
      : "";
  const reference = patientReferenceLabel(item.patient.reference);
  return [ `${workLabel(item.state)}${unresolved}`, reference ].filter(Boolean).join(" · ");
}

function workCountSummary(worklist: ScribeDocumentationWorklist) {
  return (
    [
      ["inputs_changed", "Inputs changed"],
      ["needs_review", "Needs review"],
      ["ready_to_add_to_chart", "Ready to add to chart"],
      ["unsigned_note", "Unsigned note"],
    ] as const
  )
    .filter(([state]) => worklist.returned_counts[state] > 0)
    .map(([state, label]) => `${worklist.returned_counts[state]} ${label}`)
    .join(" · ");
}

export function ScribeSessionRail({
  summaries,
  worklist = EMPTY_WORKLIST,
  selectedId,
  search,
  disabled = false,
  loadingMore = false,
  hasMore = false,
  onSearchChange,
  onSelect,
  onOpenWorkItem = () => {},
  onNewSession,
  onLoadMore,
}: ScribeSessionRailProps) {
  const [period, setPeriod] = useState<"worklist" | "today" | "past">("today");
  const visible = useMemo(
    () =>
      summaries.filter((summary) =>
        period === "today"
          ? isToday(summary.created_at)
          : !isToday(summary.created_at),
      ),
    [period, summaries],
  );
  let previousDay = "";
  return (
    <Stack
      component="aside"
      aria-label="Scribe sessions"
      sx={{
        width: 190,
        minWidth: 190,
        minHeight: 0,
        borderRight: 1,
        borderColor: "divider",
        backgroundColor: "#fff",
      }}
    >
      <Tabs
        value={period}
        onChange={(_, value: "worklist" | "today" | "past") =>
          setPeriod(value)
        }
        variant="fullWidth"
        aria-label="Session period"
        sx={{
          minHeight: 36,
          px: 1.25,
          "& .MuiTab-root": {
            minHeight: 36,
            p: 0,
            fontSize: 11,
            textTransform: "none",
          },
          "& .MuiTabs-indicator": { height: 2, backgroundColor: "#262222" },
        }}
      >
        <Tab value="worklist" label={`Work (${worklist.returned_count})`} />
        <Tab value="today" label="Today" />
        <Tab value="past" label="Past" />
      </Tabs>
      {period !== "worklist" && (
        <TextField
          id="scribe-session-search"
          disabled={disabled}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search sessions"
          size="small"
          sx={{
            mx: 1.25,
            mt: 1.25,
            mb: 0.5,
            "& .MuiInputBase-root": { height: 36, fontSize: 12 },
          }}
          slotProps={{
            htmlInput: { "aria-label": "Search scribe sessions" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon sx={{ fontSize: 17 }} />
                </InputAdornment>
              ),
            },
          }}
        />
      )}
      <Box sx={{ overflowY: "auto", minHeight: 0, flex: 1, px: 1.25, pb: 1.5 }}>
        {period === "worklist" ? (
          <>
            <Typography
              color="text.secondary"
              variant="caption"
              sx={{ display: "block", px: 0.5, pt: 1.25, pb: 0.75, fontSize: 10 }}
            >
              Recent completed visits · up to {worklist.candidate_limit_per_source} Scribe drafts and{" "}
              {worklist.candidate_limit_per_source} unsigned notes
            </Typography>
            {worklist.returned_count > 0 && (
              <Typography
                color="text.secondary"
                variant="caption"
                sx={{ display: "block", px: 0.5, pb: 0.75, fontSize: 10 }}
              >
                {workCountSummary(worklist)}
              </Typography>
            )}
            {!worklist.unsigned_notes_available && (
              <Typography
                color="text.secondary"
                variant="caption"
                sx={{ display: "block", px: 0.5, pb: 0.75, fontSize: 10 }}
              >
                Unsigned note status requires chart-note access.
              </Typography>
            )}
            {worklist.truncated && (
              <Typography
                color="warning.main"
                variant="caption"
                sx={{ display: "block", px: 0.5, pb: 0.75, fontSize: 10 }}
              >
                More documentation work may be available.
              </Typography>
            )}
            {worklist.items.length === 0 ? (
              <Typography color="text.secondary" variant="body2" sx={{ px: 0.5, py: 2, fontSize: 12 }}>
                No unfinished documentation in the recent worklist.
              </Typography>
            ) : (
              <List disablePadding>
                {worklist.items.map((item) => (
                  <ListItemButton
                    key={item.key}
                    disabled={disabled}
                    onClick={() => onOpenWorkItem(workHref(item))}
                    sx={{ minHeight: 54, borderRadius: 1, mb: 0.5, px: 0.75, py: 0.625 }}
                  >
                    <ListItemText
                      primary={item.patient.display_name}
                      secondary={workDetail(item)}
                      slotProps={{
                        primary: { noWrap: true, sx: { fontSize: 11, fontWeight: 700 } },
                        secondary: { sx: { fontSize: 9.5, lineHeight: 1.35 } },
                      }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </>
        ) : visible.length === 0 ? (
          <Typography
            color="text.secondary"
            variant="body2"
            sx={{ px: 0.5, py: 2, fontSize: 12 }}
          >
            {search.trim()
              ? "No sessions match this search."
              : period === "today"
                ? "No sessions today."
                : "No past sessions."}
          </Typography>
        ) : (
          <List disablePadding>
            {visible.map((summary) => {
              const day = sessionDay(summary.created_at);
              const showDay = day !== previousDay;
              previousDay = day;
              const name = summary.patient.display_name;
              return (
                <Box key={summary.id}>
                  {showDay && (
                    <Typography
                      component="h3"
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: "block",
                        px: 0.5,
                        pt: 1.25,
                        pb: 0.5,
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {day}
                    </Typography>
                  )}
                  <ListItemButton
                    selected={selectedId === summary.id}
                    disabled={disabled}
                    onClick={() => onSelect(summary.id)}
                    sx={{
                      minHeight: 48,
                      borderRadius: 1,
                      mb: 0.25,
                      px: 0.75,
                      py: 0.5,
                      "&.Mui-selected": { backgroundColor: "#eef0ff" },
                      "&.Mui-selected:hover": { backgroundColor: "#e7eaff" },
                    }}
                  >
                    <ListItemAvatar sx={{ minWidth: 32 }}>
                      <Avatar
                        sx={{
                          width: 22,
                          height: 22,
                          bgcolor: "#fff",
                          color: "#6b6a72",
                          border: "1px solid #d8d8dd",
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {name.trim().charAt(0).toUpperCase() || "P"}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={name}
                      secondary={sessionTime(summary.created_at)}
                      slotProps={{
                        primary: {
                          noWrap: true,
                          sx: {
                            fontSize: 11,
                            lineHeight: 1.3,
                            fontWeight: selectedId === summary.id ? 700 : 600,
                          },
                        },
                        secondary: {
                          noWrap: true,
                          sx: { fontSize: 9.5, lineHeight: 1.3 },
                        },
                      }}
                    />
                  </ListItemButton>
                </Box>
              );
            })}
          </List>
        )}
        {hasMore && period === "past" && (
          <Button
            size="small"
            disabled={disabled || loadingMore}
            onClick={onLoadMore}
            sx={{ mt: 1, fontSize: 11 }}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        )}
      </Box>
      <Button
        startIcon={<AddOutlinedIcon />}
        disabled={disabled}
        onClick={onNewSession}
        sx={{
          justifyContent: "flex-start",
          mx: 1.25,
          mb: 1,
          color: "text.secondary",
          fontSize: 11,
          textTransform: "none",
        }}
      >
        New session
      </Button>
    </Stack>
  );
}
