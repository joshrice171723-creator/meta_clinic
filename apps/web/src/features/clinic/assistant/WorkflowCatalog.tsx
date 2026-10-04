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
  useEffect(() => {
    if (selectedKey) setExpanded(false);
  }, [selectedKey]);
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = operations.filter((operation) =>
      `${operation.title} ${operation.domain} ${operation.description}`
        .toLowerCase()
        .includes(needle),
    );
    const grouped = new Map<string, WorkflowOperation[]>();
    for (const operation of filtered) {
      const entries = grouped.get(operation.domain) ?? [];
      entries.push(operation);
      grouped.set(operation.domain, entries);
    }
    return [...grouped.entries()];
  }, [operations, query]);

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
          Browse workflows
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            Choose a task or ask the assistant to find one. Changes are prepared
            for review before anything is saved.
          </Typography>
          <TextField
            label="Find a workflow"
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={disabled}
            fullWidth
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
            <Alert severity="info">No workflows match that search.</Alert>
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
                      sx={{ alignItems: "flex-start", py: 1, opacity: 0.8 }}
                      secondaryAction={
                        internalPath(operation.source_path) ? (
                          <Link
                            href={internalPath(operation.source_path)}
                            underline="hover"
                          >
                            Open workflow
                          </Link>
                        ) : undefined
                      }
                    >
                      {content}
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
