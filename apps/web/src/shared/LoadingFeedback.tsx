import { Box, LinearProgress, Typography } from "@mui/material";

// Pending work has no measured completion contract. Keep it indeterminate.
export function LoadingFeedback({
  label,
  active = true,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <Box
      role={active ? "status" : undefined}
      aria-live={active ? "polite" : undefined}
      aria-busy={active || undefined}
      aria-hidden={!active || undefined}
      sx={{ minHeight: 44, width: "100%", maxWidth: 560, minWidth: 0 }}
    >
      {active && (
        <>
          <Typography component="span" color="text.secondary" variant="body2">
            {label}
          </Typography>
          <LinearProgress
            aria-label={label}
            sx={{
              mt: 1,
              height: 4,
              backgroundColor: "#fff4f0",
              "& .MuiLinearProgress-bar": { backgroundColor: "#c64852" },
              "@media (prefers-reduced-motion: reduce)": {
                "& .MuiLinearProgress-bar": {
                  animation: "none",
                  transform: "none",
                  left: "30%",
                  width: "40%",
                },
                "& .MuiLinearProgress-bar2Indeterminate": { display: "none" },
              },
            }}
          />
        </>
      )}
    </Box>
  );
}
