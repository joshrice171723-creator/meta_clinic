import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useResource } from "../../shared/ui";
import { VisitInstructionHandout } from "../../shared/VisitInstructionHandout";

type VisitInstruction = {
  encounter_id: number;
  visit_at: string;
  signed_at: string;
  instructions: string;
};
type VisitInstructionsResponse = {
  items: VisitInstruction[];
  pagination: { page: number; per_page: number; total: number };
};

function dateLabel(value: string, timezone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Date not recorded";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(date);
  } catch {
    return "Date not recorded";
  }
}

export function AfterVisitInstructions({
  patientId,
  timezone,
}: {
  patientId: number;
  timezone: string;
}) {
  const [page, setPage] = useState(1);
  const [handout, setHandout] = useState<{
    patientId: number;
    encounterId: number;
  } | null>(null);
  const resource = useResource<VisitInstructionsResponse>(
    `/api/patient_portal/visit_instructions?page=${page}&per_page=25`,
  );
  const response = resource.data;
  const totalPages = response
    ? Math.max(
        1,
        Math.ceil(response.pagination.total / response.pagination.per_page),
      )
    : 1;
  const outOfRange = response !== undefined && page > totalPages;

  useEffect(() => {
    setPage(1);
  }, [patientId]);

  useEffect(() => {
    if (outOfRange) setPage(totalPages);
  }, [outOfRange, totalPages]);

  return (
    <Paper
      id="visit-instructions"
      variant="outlined"
      sx={{ p: { xs: 2, md: 3 }, scrollMarginTop: 24 }}
    >
      <Stack spacing={2}>
        <Box>
          <Stack
            direction="row"
            sx={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <Typography variant="h5" component="h2">
              After-visit instructions
            </Typography>
            <Button size="small" onClick={resource.refresh}>
              Refresh
            </Button>
          </Stack>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Instructions your clinic has signed and released after a completed
            visit.
          </Typography>
        </Box>
        {!response && !resource.error && (
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center" }}
            role="status"
          >
            <CircularProgress size={20} />
            <Typography>Loading after-visit instructions…</Typography>
          </Stack>
        )}
        {resource.error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={resource.refresh}>
                Retry
              </Button>
            }
          >
            Your after-visit instructions could not be loaded. {resource.error}
          </Alert>
        )}
        {outOfRange && (
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center" }}
            role="status"
          >
            <CircularProgress size={20} />
            <Typography>Loading available after-visit instructions…</Typography>
          </Stack>
        )}
        {response && response.pagination.total === 0 && (
          <Typography color="text.secondary">
            No after-visit instructions are available yet.
          </Typography>
        )}
        {response && !outOfRange && response.items.length > 0 && (
          <Stack divider={<Divider flexItem />}>
            {response.items.map((item) => (
              <Box key={item.encounter_id} sx={{ py: 1.5 }}>
                <Typography sx={{ fontWeight: 700 }}>
                  Visit {dateLabel(item.visit_at, timezone)}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.25 }}
                >
                  Signed {dateLabel(item.signed_at, timezone)}
                </Typography>
                <Typography
                  sx={{
                    mt: 1.25,
                    minWidth: 0,
                    overflowWrap: "anywhere",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {item.instructions}
                </Typography>
                <Button
                  size="small"
                  sx={{ mt: 1 }}
                  onClick={() =>
                    setHandout({ patientId, encounterId: item.encounter_id })
                  }
                >
                  Print instructions
                </Button>
              </Box>
            ))}
          </Stack>
        )}
        {response &&
          response.pagination.total > response.pagination.per_page && (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Button
                size="small"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <Typography variant="body2" color="text.secondary">
                Page {response.pagination.page} of {totalPages}
              </Typography>
              <Button
                size="small"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </Stack>
          )}
      </Stack>
      {handout?.patientId === patientId && (
        <VisitInstructionHandout
          key={`${patientId}:${handout.encounterId}`}
          endpoint={`/api/patient_portal/visit_instructions/${handout.encounterId}`}
          onClose={() => setHandout(null)}
        />
      )}
    </Paper>
  );
}
