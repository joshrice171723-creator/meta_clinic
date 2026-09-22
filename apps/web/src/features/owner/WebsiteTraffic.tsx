import {
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

export type WebsiteTrafficData = {
  period: string;
  views: number;
  visitors: number;
  pages: {
    path: string;
    views: number;
    visitors: number;
    last_visit_at: string | null;
  }[];
  daily: { date: string; views: number }[];
  referrers: { host: string; views: number }[];
};

export function WebsiteTraffic({
  data,
  onRefresh,
}: {
  data: WebsiteTrafficData;
  onRefresh: () => void;
}) {
  return (
    <Paper
      component="section"
      id="website-traffic"
      variant="outlined"
      sx={{ p: 2.5 }}
    >
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center" }}
        spacing={2}
      >
        <Box>
          <Typography component="h2" variant="h5">
            Website visitors
          </Typography>
          <Typography color="text.secondary">{data.period}</Typography>
        </Box>
        <Button onClick={onRefresh}>Refresh traffic</Button>
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={4} sx={{ my: 2 }}>
        <Box>
          <Typography variant="h4">{data.views}</Typography>
          <Typography>Page views</Typography>
        </Box>
        <Box>
          <Typography variant="h4">{data.visitors}</Typography>
          <Typography>Unique browsers (estimated)</Typography>
        </Box>
      </Stack>
      <TableContainer>
        <Table size="small" aria-label="Website traffic by page">
          <TableHead>
            <TableRow>
              <TableCell>Page</TableCell>
              <TableCell align="right">Views</TableCell>
              <TableCell align="right">Unique browsers</TableCell>
              <TableCell>Last visit</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.pages.map((page) => (
              <TableRow key={page.path}>
                <TableCell component="th" scope="row">
                  {page.path}
                </TableCell>
                <TableCell align="right">{page.views}</TableCell>
                <TableCell align="right">{page.visitors}</TableCell>
                <TableCell>
                  {page.last_visit_at
                    ? new Date(page.last_visit_at).toLocaleString()
                    : "No visits recorded yet"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Stack direction={{ xs: "column", md: "row" }} spacing={3} sx={{ mt: 3 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h3" variant="h6">
            Daily views
          </Typography>
          <TableContainer sx={{ maxHeight: 300 }}>
            <Table stickyHeader size="small" aria-label="Daily website views">
              <TableHead>
                <TableRow>
                  <TableCell>Date (UTC)</TableCell>
                  <TableCell align="right">Views</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.daily.map((day) => (
                  <TableRow key={day.date}>
                    <TableCell component="th" scope="row">
                      {day.date}
                    </TableCell>
                    <TableCell align="right">{day.views}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h3" variant="h6">
            Top referring sites
          </Typography>
          {data.referrers.length === 0 ? (
            <Typography color="text.secondary">
              No visits recorded yet.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small" aria-label="Referring sites">
                <TableHead>
                  <TableRow>
                    <TableCell>Site</TableCell>
                    <TableCell align="right">Views</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.referrers.map((source) => (
                    <TableRow key={source.host}>
                      <TableCell
                        component="th"
                        scope="row"
                        sx={{ overflowWrap: "anywhere" }}
                      >
                        {source.host}
                      </TableCell>
                      <TableCell align="right">{source.views}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Counts start when tracking was published. A first-party cookie estimates
        unique browsers, not individual people. Repeat visits count as views;
        blocked tracking and privacy opt-outs are not counted. Your own visits
        and automated browsers may be included. No names, emails, IP addresses,
        or full referring URLs are stored by this tracker. /Joshua visits
        redirect to /joshua and count there.
      </Typography>
    </Paper>
  );
}
