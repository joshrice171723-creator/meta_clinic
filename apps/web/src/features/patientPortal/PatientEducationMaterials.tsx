import { useRef, useState } from "react";
import LaunchIcon from "@mui/icons-material/Launch";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";

type PatientEducationMaterial = {
  id: number;
  topic_code: string;
  topic_title: string;
  material_title: string;
  material_url: string;
  language: string;
  delivered_at: string;
  acknowledged_at: string | null;
};

type MaterialsResponse = { materials: PatientEducationMaterial[] };

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function PatientEducationMaterials() {
  const materials = useResource<MaterialsResponse>(
    "/api/patient_portal/education_materials",
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const attempts = useRef(
    new Map<
      number,
      { requestKey: string; busy: boolean; uncertain: boolean }
    >(),
  );
  useDemoNavigationBlocker(() => ({
    blocked:
      busyId !== null ||
      [...attempts.current.values()].some(
        (attempt) => attempt.busy || attempt.uncertain,
      ),
    message: null,
  }));

  const acknowledge = async (material: PatientEducationMaterial) => {
    if (
      busyId !== null ||
      (material.acknowledged_at &&
        !attempts.current.get(material.id)?.uncertain)
    )
      return;
    const attempt = attempts.current.get(material.id) ?? {
      requestKey: crypto.randomUUID(),
      busy: false,
      uncertain: false,
    };
    if (attempt.busy) return;
    attempts.current.set(material.id, attempt);
    attempt.busy = true;
    const requestKey = attempt.requestKey;
    setBusyId(material.id);
    setError("");
    setNotice("");
    try {
      await api<{ material: PatientEducationMaterial }>(
        `/api/patient_portal/education_materials/${material.id}/acknowledgment`,
        {
          method: "POST",
          body: {
            patient_education_acknowledgment: { request_key: requestKey },
          },
        },
      );
      attempts.current.delete(material.id);
      setNotice(`Marked “${material.material_title}” as viewed.`);
      materials.refresh();
    } catch (reason) {
      attempt.uncertain ||=
        !(reason instanceof ApiError) ||
        reason.status === 408 ||
        reason.status >= 500 ||
        reason.code === "outcome_unconfirmed";
      setError(
        attempt.uncertain
          ? "We could not confirm the acknowledgement. Retry this same material before changing anything."
          : reason instanceof Error
            ? reason.message
            : "The acknowledgement could not be recorded.",
      );
    } finally {
      attempt.busy = false;
      setBusyId(null);
    }
  };

  return (
    <Paper
      component="section"
      variant="outlined"
      sx={{ p: { xs: 2.5, sm: 3.5 } }}
    >
      <Stack spacing={2.5}>
        <Box>
          <Typography component="h2" variant="h2">
            Education materials
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Resources your care team shared through the patient portal. Marking
            a resource as viewed records only that you viewed the material.
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        {!materials.data && !materials.error && (
          <Typography color="text.secondary" role="status">
            Loading education materials…
          </Typography>
        )}
        {materials.error && (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" size="small" onClick={materials.refresh}>
                Retry
              </Button>
            }
          >
            {materials.error}
          </Alert>
        )}
        {materials.data?.materials.length === 0 && (
          <Typography color="text.secondary">
            Your care team has not shared education materials here yet.
          </Typography>
        )}

        {materials.data?.materials.map((material) => (
          <Paper
            key={material.id}
            component="article"
            variant="outlined"
            sx={{ p: 2.5 }}
          >
            <Stack spacing={1.5}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", flexWrap: "wrap" }}
              >
                <Typography component="h3" variant="h6">
                  {material.material_title}
                </Typography>
                {material.acknowledged_at && (
                  <Chip color="success" label="Viewed" size="small" />
                )}
              </Stack>
              <Typography>{material.topic_title}</Typography>
              <Typography variant="body2" color="text.secondary">
                Language: {material.language} · Shared{" "}
                {formatDate(material.delivered_at)}
              </Typography>
              {material.acknowledged_at && (
                <Typography variant="body2" color="text.secondary">
                  Marked as viewed {formatDate(material.acknowledged_at)}
                </Typography>
              )}
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                sx={{ alignItems: { sm: "center" } }}
              >
                <Link
                  href={material.material_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  Open material <LaunchIcon fontSize="small" />
                </Link>
                {(!material.acknowledged_at ||
                  attempts.current.get(material.id)?.uncertain) && (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busyId !== null}
                    onClick={() => void acknowledge(material)}
                    startIcon={
                      busyId === material.id ? (
                        <CircularProgress color="inherit" size={16} />
                      ) : undefined
                    }
                  >
                    {busyId === material.id
                      ? "Recording…"
                      : material.acknowledged_at
                        ? "Retry acknowledgment"
                        : "I viewed this material"}
                  </Button>
                )}
              </Stack>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Paper>
  );
}
