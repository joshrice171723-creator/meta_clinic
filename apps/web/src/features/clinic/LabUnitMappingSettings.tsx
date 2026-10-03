import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { api, ApiError } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { useClinicNavigation } from "./clinicNavigation";

type Mapping = {
  code_system: string;
  code: string;
  code_version: string | null;
  dimension: string;
  expected_dimension_unit?: string;
  unit_codes: string[];
};
type Configuration = {
  revision: number;
  configured: boolean;
  effective_from: string | null;
  mappings: Mapping[];
  request_key?: string;
};
type Attempt = {
  configuration: {
    expected_revision: number;
    request_key: string;
    mappings: Mapping[];
  };
};

export function LabUnitMappingSettings() {
  const resource = useResource<{
    configuration: Configuration;
    can_write: boolean;
  }>("/api/clinic/lab_unit_mappings");
  const [saved, setSaved] = useState<Configuration | null>(null);
  const [draft, setDraft] = useState<Mapping[]>([]);
  const [pending, setPending] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const alive = useRef(true);
  const { registerBlocker } = useClinicNavigation();
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (resource.data && !saved) {
      setSaved(resource.data.configuration);
      setDraft(resource.data.configuration.mappings);
    }
  }, [resource.data, saved]);
  const changed = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved.mappings);
  useEffect(() => {
    if (!changed && !pending && !busy) return;
    const warning = pending || busy
      ? "The lab mapping save may be unresolved. Retry the exact request before leaving."
      : "You have unsaved lab unit mappings. Leave this page?";
    const unregister = registerBlocker(() => warning);
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = warning; };
    window.addEventListener("beforeunload", unload);
    return () => { unregister(); window.removeEventListener("beforeunload", unload); };
  }, [changed, pending, busy, registerBlocker]);

  if (!saved || !resource.data) return <LoadState error={resource.error} />;
  const editable = resource.data.can_write && !busy && !pending;
  const field = (index: number, update: Partial<Mapping>) =>
    setDraft((rows) =>
      rows.map((row, position) =>
        position === index ? { ...row, ...update } : row,
      ),
    );
  const reload = async () => {
    if (busy || pending) return;
    setBusy(true);
    try {
      const response = await api<{ configuration: Configuration }>(
        "/api/clinic/lab_unit_mappings",
      );
      if (!alive.current) return;
      setSaved(response.configuration);
      setDraft(response.configuration.mappings);
      setFeedback(null);
    } catch (reason: unknown) {
      if (alive.current)
        setFeedback(
          reason instanceof Error
            ? reason.message
            : "Unable to reload mappings.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const save = async () => {
    if (busy || !resource.data?.can_write) return;
    const wasUnconfirmed = pending !== null;
    const attempt = pending ?? {
      configuration: {
        expected_revision: saved.revision,
        request_key: crypto.randomUUID(),
        mappings: draft,
      },
    };
    setBusy(true);
    setPending(attempt);
    setFeedback(null);
    try {
      const response = await api<{
        configuration: Configuration;
        current_configuration: Configuration;
      }>("/api/clinic/lab_unit_mappings", { method: "PATCH", body: attempt });
      if (!alive.current) return;
      if (
        response.configuration.request_key !== attempt.configuration.request_key
      )
        throw new Error(
          "The response did not confirm this mapping request. Retry the exact request.",
        );
      setSaved(response.current_configuration);
      setDraft(response.current_configuration.mappings);
      setPending(null);
      setFeedback(
        `Saved clinic declarations at revision ${response.configuration.revision}.`,
      );
    } catch (reason: unknown) {
      if (!alive.current) return;
      const denied = reason instanceof ApiError && (reason.status === 403 || reason.status === 422 || (reason.status === 409 && reason.code === "stale_record"));
      if (denied && !wasUnconfirmed) setPending(null);
      setFeedback(
        reason instanceof Error
          ? reason.message
          : "Mapping save is unconfirmed. Retry the exact request.",
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <Stack spacing={2}>
      <Divider />
      <Typography component="h2" variant="h5">Lab unit mappings</Typography>
      <Typography variant="body2" color="text.secondary">
        Set the units allowed for each test code and version.
      </Typography>
      <Accordion disableGutters elevation={0} variant="outlined">
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography component="span" variant="body2">
            Unit mapping requirements
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <Typography variant="body2" color="text.secondary">
            Use a Unified Code for Units of Measure (UCUM) reference unit. All
            allowed units must have matching linear dimensions. Special,
            non-ratio, and arbitrary units are unsupported. Compatibility uses
            pinned UCUM definitions; this does not convert results or suggest
            medical mappings.
          </Typography>
        </AccordionDetails>
      </Accordion>
      <Alert severity={saved.configured ? "info" : "warning"}>
        {saved.configured
          ? `Configured declarations: ${saved.mappings.length}. Other tests remain unmapped. Legacy mappings without a reference UCUM unit require completion.`
          : "Unconfigured: unit/dimension compatibility is not validated."}{" "}
        Revision {saved.revision}.
      </Alert>
      {feedback && (
        <Alert severity={pending ? "warning" : "info"}>{feedback}</Alert>
      )}
      {pending && (
        <Alert severity="warning">
          Your save has not been confirmed. Editing is paused. Retry to confirm
          the same changes without submitting a duplicate.
        </Alert>
      )}
      {draft.map((row, index) => (
        <Stack key={index} spacing={1}>
          <Typography variant="subtitle2">Mapping {index + 1}</Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField label="Test code system" value={row.code_system} disabled={!editable} onChange={(event) => field(index, { code_system: event.target.value })} />
            <TextField label="Test code" value={row.code} disabled={!editable} onChange={(event) => field(index, { code: event.target.value })} />
            <TextField label="Code version (optional)" helperText="Blank matches only an unspecified version." value={row.code_version ?? ""} disabled={!editable} onChange={(event) => field(index, { code_version: event.target.value || null })} />
            <TextField label="Dimension description (clinic supplied)" value={row.dimension} disabled={!editable} onChange={(event) => field(index, { dimension: event.target.value })} />
          </Stack>
          <TextField
            label="Expected-dimension reference UCUM unit"
            helperText="Enter a clinic-approved reference expression. Its computed base dimensions define this mapping; no default is selected."
            value={row.expected_dimension_unit ?? ""}
            disabled={!editable}
            onChange={(event) =>
              field(index, { expected_dimension_unit: event.target.value })
            }
          />
          <TextField
            label="Allowed unit codes"
            helperText="One explicitly approved code per line. No display-label substitutions."
            multiline
            minRows={2}
            value={row.unit_codes.join("\n")}
            disabled={!editable}
            onChange={(event) =>
              field(index, { unit_codes: event.target.value.split("\n") })
            }
          />
          <Button
            disabled={!editable}
            onClick={() =>
              setDraft((rows) =>
                rows.filter((_, position) => position !== index),
              )
            }
          >
            Remove mapping {index + 1}
          </Button>
        </Stack>
      ))}
      <Stack direction="row" spacing={1}>
        <Button
          disabled={!editable || draft.length >= 200}
          onClick={() =>
            setDraft((rows) => [
              ...rows,
              {
                code_system: "",
                code: "",
                code_version: null,
                dimension: "",
                expected_dimension_unit: "",
                unit_codes: [""],
              },
            ])
          }
        >
          Add mapping
        </Button>
        <Button
          variant="contained"
          disabled={busy || !resource.data.can_write || (!changed && !pending)}
          onClick={() => void save()}
        >
          {busy
            ? "Saving…"
            : pending
              ? "Retry exact mapping save"
              : "Save mappings"}
        </Button>
        <Button disabled={busy || !!pending} onClick={() => void reload()}>
          Discard draft and reload
        </Button>
      </Stack>
      {!resource.data.can_write && (
        <Typography variant="body2">
          Clinic-wide settings write permission is required to change mappings.
        </Typography>
      )}
    </Stack>
  );
}
