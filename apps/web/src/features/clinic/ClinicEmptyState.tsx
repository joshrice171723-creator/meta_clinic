import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

export function ClinicEmptyState({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <Box
      component="section"
      aria-label={title}
      sx={{ px: 2, py: compact ? 1.5 : 3, textAlign: "center" }}
    >
      <Stack spacing={0.75} sx={{ alignItems: "center" }}>
        <Typography component="h3" variant="h5">
          {title}
        </Typography>
        {description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: "64ch" }}
          >
            {description}
          </Typography>
        )}
        {action}
      </Stack>
    </Box>
  );
}
