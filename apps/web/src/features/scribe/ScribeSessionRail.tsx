import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import {
  Box,
  Button,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { ScribeEncounter } from "./types";

export type ScribeEncounterSummary = Pick<
  ScribeEncounter,
  | "id"
  | "patient_id"
  | "site_id"
  | "status"
  | "consent_status"
  | "version"
  | "created_at"
  | "updated_at"
> & { patient: NonNullable<ScribeEncounter["patient"]> };

type ScribeSessionRailProps = {
  summaries: ScribeEncounterSummary[];
  selectedId: number | null;
  search: string;
  disabled?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onSearchChange: (value: string) => void;
  onSelect: (id: number) => void;
  onNewSession: () => void;
  onLoadMore: () => void;
};

function sessionDay(value?: string | null) {
  if (!value) return "Earlier";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "Earlier";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const key = parsed.toDateString();
  if (key === today.toDateString()) return "Today";
  if (key === yesterday.toDateString()) return "Yesterday";
  return parsed.toLocaleDateString(undefined, {
    month: "long",
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

export function ScribeSessionRail({
  summaries,
  selectedId,
  search,
  disabled = false,
  loadingMore = false,
  hasMore = false,
  onSearchChange,
  onSelect,
  onNewSession,
  onLoadMore,
}: ScribeSessionRailProps) {
  let previousDay = "";
  return (
    <Stack
      component="aside"
      aria-label="Scribe sessions"
      sx={{
        width: 248,
        minWidth: 248,
        minHeight: 0,
        borderRight: 1,
        borderColor: "divider",
        backgroundColor: "background.paper",
      }}
    >
      <Stack spacing={1.5} sx={{ p: 2, pb: 1.5 }}>
        <Button
          variant="outlined"
          startIcon={<AddOutlinedIcon />}
          disabled={disabled}
          onClick={onNewSession}
          fullWidth
        >
          New session
        </Button>
        <TextField
          disabled={disabled}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search sessions"
          size="small"
          slotProps={{
            htmlInput: { "aria-label": "Search scribe sessions" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Stack>
      <Box sx={{ overflowY: "auto", minHeight: 0, flex: 1, px: 1, pb: 2 }}>
        {summaries.length === 0 ? (
          <Typography
            color="text.secondary"
            variant="body2"
            sx={{ px: 1, py: 2 }}
          >
            {search.trim()
              ? "No sessions match this search."
              : "No saved sessions yet."}
          </Typography>
        ) : (
          <List disablePadding>
            {summaries.map((summary) => {
              const day = sessionDay(summary.created_at);
              const showDay = day !== previousDay;
              previousDay = day;
              return (
                <Box key={summary.id}>
                  {showDay && (
                    <Typography
                      component="h3"
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: "block",
                        px: 1,
                        pt: 1.5,
                        pb: 0.5,
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
                    sx={{ borderRadius: 1, mb: 0.25, alignItems: "flex-start" }}
                  >
                    <ListItemText
                      primary={summary.patient.display_name}
                      secondary={`${sessionTime(summary.created_at)} · ${summary.status.replaceAll("_", " ")}`}
                      slotProps={{
                        primary: {
                          noWrap: true,
                          sx: {
                            fontWeight: selectedId === summary.id ? 700 : 600,
                          },
                        },
                        secondary: {
                          noWrap: true,
                          sx: { textTransform: "capitalize" },
                        },
                      }}
                    />
                  </ListItemButton>
                </Box>
              );
            })}
          </List>
        )}
        {hasMore && (
          <Button
            size="small"
            disabled={disabled || loadingMore}
            onClick={onLoadMore}
            sx={{ mt: 1 }}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        )}
      </Box>
    </Stack>
  );
}
