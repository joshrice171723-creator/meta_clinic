import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Chip,
  Link,
  List,
  ListItemButton,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
  FormControlLabel,
  Switch,
  IconButton,
  Tooltip,
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import StarOutlineRoundedIcon from "@mui/icons-material/StarOutlineRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import type { WorkflowOperation } from "./workflowTypes";

function internalPath(path?: string) {
  return path?.startsWith("/") && !path.startsWith("//") ? path : undefined;
}

export function WorkflowCatalog({
  operations,
  selectedKey,
  disabled,
  loading,
  hasPatient,
  hasEncounter,
  onSelect,
  favorites,
  onToggleFavorite,
}: {
  operations: WorkflowOperation[];
  selectedKey: string;
  disabled: boolean;
  loading: boolean;
  hasPatient: boolean;
  hasEncounter: boolean;
  onSelect: (operation: WorkflowOperation) => void;
  favorites: string[];
  onToggleFavorite: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  useEffect(() => {
    if (selectedKey) setExpanded(false);
  }, [selectedKey]);
  const groups = useMemo(() => {
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/\b(booking|book|appointments?)\b/g, "appointment")
        .replace(/\b(bills?|billing|invoices?)\b/g, "billing")
        .replace(/\b(inventory|stock)\b/g, "stock")
        .replace(/\b(visits?|encounters?)\b/g, "encounter")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const words = normalize(query).split(/\s+/).filter(Boolean);
    const filtered = operations
      .filter((operation) => {
        const text = normalize(
          `${operation.title} ${operation.domain} ${operation.description} ${operation.fields.map((field) => field.label).join(" ")}`,
        );
        return (
          (!availableOnly || operation.availability === "available") &&
          (!favoritesOnly || favorites.includes(operation.key)) &&
          words.every((word) => text.includes(word))
        );
      })
      .sort((a, b) => {
        const score = (operation: WorkflowOperation) =>
          words.filter((word) => normalize(operation.title).includes(word))
            .length;
        return score(b) - score(a) || a.title.localeCompare(b.title);
      });
    const grouped = new Map<string, WorkflowOperation[]>();
    for (const operation of filtered) {
      const domain = favorites.includes(operation.key)
        ? "Favorites"
        : operation.domain;
      const entries = grouped.get(domain) ?? [];
      entries.push(operation);
      grouped.set(domain, entries);
    }
    return [...grouped.entries()].sort(([a], [b]) =>
      a === "Favorites" ? -1 : b === "Favorites" ? 1 : a.localeCompare(b),
    );
  }, [operations, query, availableOnly, favoritesOnly, favorites]);

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, isExpanded) => setExpanded(isExpanded)}
      disableGutters
      elevation={0}
      sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
    >
      <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
        <Typography variant="subtitle1" component="h3">
          Browse clinic tasks
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            Find a task by name or area of the clinic.
          </Typography>
          <TextField
            label="Search tasks"
            placeholder="For example, appointments or stock"
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={disabled}
            fullWidth
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={availableOnly}
                onChange={(_, checked) => setAvailableOnly(checked)}
              />
            }
            label="Available here"
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={favoritesOnly}
                onChange={(_, checked) => setFavoritesOnly(checked)}
              />
            }
            label="Favorites only"
          />
          {loading && operations.length === 0 && (
            <Alert severity="info">Loading the workflows available here…</Alert>
          )}
          {!loading && operations.length === 0 && (
            <Alert severity="info">
              No workflows are available in this clinic context.
            </Alert>
          )}
          {operations.length > 0 && groups.length === 0 && (
            <Alert severity="info">
              No tasks match. Try fewer words or turn off the filters to see
              other workflows.
            </Alert>
          )}
          {groups.map(([domain, entries]) => (
            <section className="clinic-assistant__workflow-group" key={domain}>
              <Typography
                component="h4"
                variant="overline"
                color="text.secondary"
              >
                {domain}
              </Typography>
              <List dense disablePadding aria-label={`${domain} workflows`}>
                {entries.map((operation) => {
                  const available =
                    operation.availability === "available" &&
                    operation.kind !== "gated";
                  const statusLabel =
                    operation.patient_required && !hasPatient
                      ? "Select patient"
                      : operation.encounter_required && !hasEncounter
                        ? "Select encounter"
                        : operation.kind === "gated"
                          ? "Human step"
                          : available
                            ? operation.kind === "read"
                              ? "Read"
                              : "Review first"
                            : operation.availability === "gated"
                              ? "Permission needed"
                              : "Unavailable";
                  const statusColor = available
                    ? "default"
                    : statusLabel === "Permission needed"
                      ? "warning"
                      : statusLabel === "Unavailable"
                        ? "default"
                        : "info";
                  const content = (
                    <>
                      <ListItemText
                        primary={operation.title}
                        secondary={operation.reason || operation.description}
                        slotProps={{
                          primary: {
                            sx: { fontWeight: 600, fontSize: "0.9rem" },
                          },
                          secondary: {
                            sx: { mt: 0.25, whiteSpace: "normal" },
                          },
                        }}
                      />
                      <Chip
                        size="small"
                        variant={available ? "outlined" : "filled"}
                        color={statusColor}
                        label={statusLabel}
                        sx={{ ml: 1, mt: 0.25, flexShrink: 0 }}
                      />
                    </>
                  );
                  return available ? (
                    <ListItem
                      key={operation.key}
                      disablePadding
                      secondaryAction={
                        <Tooltip
                          title={
                            favorites.includes(operation.key)
                              ? "Remove favorite"
                              : "Add favorite"
                          }
                        >
                          <IconButton
                            aria-label={`${favorites.includes(operation.key) ? "Remove" : "Add"} ${operation.title} ${favorites.includes(operation.key) ? "from" : "to"} favorites`}
                            aria-pressed={favorites.includes(operation.key)}
                            onClick={() => onToggleFavorite(operation.key)}
                            sx={{ minWidth: 44, minHeight: 44 }}
                          >
                            {favorites.includes(operation.key) ? (
                              <StarRoundedIcon />
                            ) : (
                              <StarOutlineRoundedIcon />
                            )}
                          </IconButton>
                        </Tooltip>
                      }
                    >
                      <ListItemButton
                        selected={selectedKey === operation.key}
                        disabled={disabled}
                        onClick={() => onSelect(operation)}
                        sx={{
                          alignItems: "flex-start",
                          borderRadius: 1,
                          py: 1,
                          pr: 7,
                        }}
                        aria-label={`${operation.title}. ${operation.kind === "read" ? "Read" : "Review before save"}`}
                      >
                        {content}
                      </ListItemButton>
                    </ListItem>
                  ) : (
                    <ListItem
                      key={operation.key}
                      sx={{
                        alignItems: "stretch",
                        flexDirection: "column",
                        py: 1,
                      }}
                    >
                      <Stack direction="row" sx={{ alignItems: "flex-start" }}>
                        {content}
                      </Stack>
                      {internalPath(operation.source_path) && (
                        <Link
                          href={internalPath(operation.source_path)}
                          underline="hover"
                          sx={{ alignSelf: "flex-start", mt: 0.5 }}
                        >
                          Open workflow
                        </Link>
                      )}
                    </ListItem>
                  );
                })}
              </List>
            </section>
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
