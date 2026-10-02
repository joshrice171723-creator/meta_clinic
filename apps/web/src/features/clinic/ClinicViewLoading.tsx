import { Box, Paper, Skeleton, Stack, Typography } from "@mui/material";

type ClinicViewLoadingProps = {
  view: "patients" | "schedule";
  scheduleMode?: "month" | "day";
  scheduleMonth?: string;
  showIdentityLookup?: boolean;
};

const dayRows = Array.from({ length: 20 }, (_, index) => index);
const directoryRows = Array.from({ length: 6 }, (_, index) => index);

/** Layout-shaped loading placeholders for the clinic's read-only views. */
export function ClinicViewLoading({
  view,
  scheduleMode = "month",
  scheduleMonth,
  showIdentityLookup = false,
}: ClinicViewLoadingProps) {
  const label = view === "patients" ? "patient directory" : "schedule";

  return (
    <Stack
      spacing={2}
      role="status"
      aria-label={`Loading ${label}`}
      aria-busy="true"
      data-resource-state="loading"
      sx={{ minWidth: 0 }}
    >
      <Typography component="p" variant="body2" color="text.secondary">
        Loading {label}…
      </Typography>
      <Box aria-hidden="true" sx={{ minWidth: 0 }}>
        {view === "patients" ? (
          <PatientDirectoryShape showIdentityLookup={showIdentityLookup} />
        ) : (
          <ScheduleShape mode={scheduleMode} month={scheduleMonth} />
        )}
      </Box>
    </Stack>
  );
}

function PatientDirectoryShape({
  showIdentityLookup,
}: {
  showIdentityLookup: boolean;
}) {
  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1}
        sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}
      >
        <Typography component="h1" variant="h4">
          Patient directory
        </Typography>
        <Skeleton variant="rounded" animation={false} width={160} height={40} />
      </Stack>
      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 } }}>
        <Stack spacing={1.5}>
          {showIdentityLookup && (
            <>
              <Stack spacing={1.5}>
                <Box>
                  <Skeleton
                    variant="text"
                    animation={false}
                    width={220}
                    height={28}
                  />
                  <Skeleton
                    variant="text"
                    animation={false}
                    width="78%"
                    height={24}
                  />
                </Box>
                <Box
                  sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: {
                      lg: "minmax(0, 1.7fr) minmax(11rem, 0.8fr) minmax(13rem, 1fr)",
                      md: "repeat(2, minmax(0, 1fr))",
                      xs: "1fr",
                    },
                  }}
                >
                  {[0, 1, 2].map((field) => (
                    <Skeleton
                      key={field}
                      variant="rounded"
                      animation={false}
                      height={72}
                    />
                  ))}
                </Box>
              </Stack>
              <Box sx={{ height: 1, bgcolor: "divider", my: 2 }} />
            </>
          )}
          <Skeleton variant="text" animation={false} width={220} height={28} />
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ alignItems: { sm: "center" } }}
          >
            <Skeleton
              variant="rounded"
              animation={false}
              sx={{ width: { xs: "100%", sm: "min(100%, 360px)" } }}
              height={56}
            />
            <Skeleton
              variant="rounded"
              animation={false}
              sx={{ width: { xs: "100%", sm: 180 } }}
              height={56}
            />
          </Stack>
          <Box sx={{ overflowX: "auto" }}>
            <Stack spacing={0} sx={{ minWidth: 620 }}>
              <Stack
                direction="row"
                spacing={2}
                sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}
              >
                {["22%", "18%", "18%", "16%", "12%"].map((width, index) => (
                  <Skeleton
                    key={index}
                    variant="text"
                    animation={false}
                    sx={{ width }}
                    height={22}
                  />
                ))}
              </Stack>
              {directoryRows.map((row) => (
                <Stack
                  key={row}
                  direction="row"
                  spacing={2}
                  sx={{
                    px: 1.5,
                    py: 1.25,
                    borderBottom: 1,
                    borderColor: "divider",
                  }}
                >
                  {["22%", "18%", "18%", "16%", "12%"].map((width, index) => (
                    <Skeleton
                      key={index}
                      variant="text"
                      animation={false}
                      sx={{ width }}
                      height={24}
                    />
                  ))}
                </Stack>
              ))}
            </Stack>
          </Box>
        </Stack>
      </Paper>
    </Stack>
  );
}

function ScheduleShape({
  mode,
  month,
}: {
  mode: "month" | "day";
  month?: string;
}) {
  if (mode === "day") {
    return (
      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
          <Skeleton variant="text" animation={false} width={190} height={28} />
          <Skeleton variant="text" animation={false} width="75%" height={20} />
        </Box>
        <Box sx={{ overflowX: "auto" }}>
          <Box sx={{ minWidth: 500, px: 1.5, py: 1 }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ ml: 8, pb: 1, borderBottom: 1, borderColor: "divider" }}
            >
              {[0, 1, 2].map((lane) => (
                <Skeleton
                  key={lane}
                  variant="text"
                  animation={false}
                  sx={{ flex: 1 }}
                  height={26}
                />
              ))}
            </Stack>
            {dayRows.map((row) => (
              <Stack
                key={row}
                direction="row"
                spacing={1}
                sx={{
                  minHeight: 72,
                  alignItems: "center",
                  borderBottom: 1,
                  borderColor: "divider",
                }}
              >
                <Skeleton
                  variant="text"
                  animation={false}
                  width={48}
                  height={20}
                />
                {[0, 1, 2].map((lane) => (
                  <Box key={lane} sx={{ flex: 1, px: 0.5 }}>
                    {row % 3 === lane && (
                      <Skeleton
                        variant="rounded"
                        animation={false}
                        height={38}
                      />
                    )}
                  </Box>
                ))}
              </Stack>
            ))}
          </Box>
        </Box>
      </Paper>
    );
  }

  const monthCellCount = month
    ? new Date(`${month}-01T12:00:00Z`).getUTCDay() +
      new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
      ).getUTCDate()
    : 35;

  return (
    <Paper variant="outlined" sx={{ overflowX: "auto" }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(105px, 1fr))",
          minWidth: 735,
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
          <Box
            key={`weekday-${weekday}`}
            sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}
          >
            <Skeleton variant="text" animation={false} />
          </Box>
        ))}
        {Array.from({ length: monthCellCount }, (_, cell) => (
          <Box
            key={cell}
            sx={{
              minHeight: 128,
              p: 1.25,
              borderTop: 1,
              borderRight: 1,
              borderColor: "divider",
            }}
          >
            <Skeleton
              variant="text"
              animation={false}
              width="28%"
              height={24}
            />
            <Skeleton variant="text" animation={false} width="62%" />
            <Skeleton variant="text" animation={false} width="54%" />
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
