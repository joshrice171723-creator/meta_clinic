import {
  Alert,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import {
  configurationMappingPlan,
  readMappingSource,
  type ConfigurationManifest,
  type ConfigurationMappings,
} from "./configurationMapping";

export function ConfigurationMappingPreview({
  target,
}: {
  target: ConfigurationManifest;
}) {
  const [source, setSource] = useState<ConfigurationManifest | null>(null);
  const [mappings, setMappings] = useState<ConfigurationMappings>({
    sites: {},
    service_offerings: {},
  });
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  const read = async (file?: File) => {
    const request = ++generation.current;
    setSource(null);
    setMappings({ sites: {}, service_offerings: {} });
    setError("");
    if (!file) return;
    try {
      if (file.size > 1_000_000)
        throw new Error("Choose a JSON file smaller than 1 MB.");
      const saved = readMappingSource(JSON.parse(await file.text()));
      if (saved.configuration.practice.id === target.configuration.practice.id)
        throw new Error(
          "Choose a different source clinic; use Compare saved JSON for this clinic.",
        );
      if (request === generation.current) setSource(saved);
    } catch (failure) {
      if (request === generation.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "The source snapshot could not be read.",
        );
    }
  };
  const plan = source
    ? configurationMappingPlan(source, target, mappings)
    : null;
  const download = () => {
    if (!plan) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `clinic-${plan.source.practice_id}-to-${plan.target.practice_id}-mapping-review.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2" component="h4">
        Cross-clinic mapping review
      </Typography>
      <Typography variant="body2">
        Choose a saved source clinic snapshot, then explicitly map its records
        to this clinic. Names and identifiers never select destinations
        automatically. This preview does not import or restore settings.
      </Typography>
      <Button
        component="label"
        variant="outlined"
        size="small"
        sx={{ alignSelf: "flex-start" }}
      >
        Choose source clinic JSON
        <input
          hidden
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            void read(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      {source && plan && (
        <>
          <Typography variant="body2">
            Source: {source.configuration.practice.name} (#
            {source.configuration.practice.id}) · Read at {source.generated_at}.
            Destination: {target.configuration.practice.name} (#
            {target.configuration.practice.id}).
          </Typography>
          {(["sites", "service_offerings"] as const).map((group) =>
            source.configuration[group].map((row) => (
              <TextField
                key={`${group}-${row.id}`}
                select
                size="small"
                label={`${group === "sites" ? "Location" : "Service offering"}: ${row.name} (#${row.id})`}
                value={mappings[group][row.id] ?? ""}
                onChange={(event) =>
                  setMappings((current) => ({
                    ...current,
                    [group]: {
                      ...current[group],
                      [row.id]: Number(event.target.value),
                    },
                  }))
                }
              >
                <MenuItem value="">Unmapped — requires review</MenuItem>
                {target.configuration[group].map((destination) => (
                  <MenuItem key={destination.id} value={destination.id}>
                    {destination.name} (#{destination.id})
                  </MenuItem>
                ))}
              </TextField>
            )),
          )}
          <Alert severity="warning">
            {plan.blockers.length
              ? `${plan.blockers.length} unresolved mapping/reference checks.`
              : "Record mappings selected; protected changes still require separate review."}
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              {plan.blockers.slice(0, 20).map((blocker, index) => (
                <Typography variant="body2" key={index}>
                  {blocker}
                </Typography>
              ))}
              {plan.blockers.length > 20 && (
                <Typography variant="body2">
                  Showing 20 checks; the downloaded review includes all{" "}
                  {plan.blockers.length}.
                </Typography>
              )}
              {plan.required_review.map((review) => (
                <Typography variant="body2" key={review}>
                  {review}
                </Typography>
              ))}
            </Stack>
          </Alert>
          <Button
            size="small"
            onClick={download}
            sx={{ alignSelf: "flex-start" }}
          >
            Download mapping review
          </Button>
          <Button
            size="small"
            onClick={() => {
              generation.current += 1;
              setSource(null);
              setMappings({ sites: {}, service_offerings: {} });
              setError("");
            }}
            sx={{ alignSelf: "flex-start" }}
          >
            Clear source and mappings
          </Button>
        </>
      )}
    </Stack>
  );
}
