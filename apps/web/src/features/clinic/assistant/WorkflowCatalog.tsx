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
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
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
}: {
  operations: WorkflowOperation[];
  selectedKey: string;
  disabled: boolean;
  loading: boolean;
  hasPatient: boolean;
  hasEncounter: boolean;
  onSelect: (operation: WorkflowOperation) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(true);
  useEffect(() => {
    if (selectedKey) setExpanded(false);
  }, [selectedKey]);
  const groups = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = operations.filter((operation) => {
      const text =
        `${operation.title} ${operation.domain} ${operation.description}`.toLowerCase();
      return (
        (!availableOnly || operation.availability === "available") &&
        words.every((word) => text.includes(word))
      );
    });
    const grouped = new Map<string, WorkflowOperation[]>();
    for (const operation of filtered) {
      const entries = grouped.get(operation.domain) ?? [];
      entries.push(operation);
      grouped.set(operation.domain, entries);
    }
    return [...grouped.entries()];
  }, [operations, query, availableOnly]);

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
              No tasks match. Try fewer words or turn off “Available here” to
              see other workflows.
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
                    <ListItemButton
                      key={operation.key}
                      selected={selectedKey === operation.key}
                      disabled={disabled}
                      onClick={() => onSelect(operation)}
                      sx={{ alignItems: "flex-start", borderRadius: 1, py: 1 }}
                      aria-label={`${operation.title}. ${operation.kind === "read" ? "Read" : "Review before save"}`}
                    >
                      {content}
                    </ListItemButton>
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
