import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from "@mui/material";

export type CapacityRule = {
  id: number;
  site_id: number;
  clinician_id: number;
  kind: string;
  weekday: number | null;
  start_minute: number | null;
  end_minute: number | null;
  starts_at: string | null;
  ends_at: string | null;
  reason: string;
  version: number;
};

const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
function clock(value: number | null) {
  return value === null
    ? ""
    : `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function WeeklyCapacityRules({
  rules,
  sites,
  clinicians,
  canWrite,
  disabled,
  onAdd,
  onDeactivate,
}: {
  rules: CapacityRule[];
  sites: { id: number; name: string }[];
  clinicians: { id: number; name: string }[];
  canWrite: boolean;
  disabled: boolean;
  onAdd: (site: number, clinician: number, weekday: number) => void;
  onDeactivate: (rule: CapacityRule) => void;
}) {
  const groups = new Map<string, CapacityRule[]>();
  for (const rule of rules.filter((item) => item.kind === "weekly")) {
    const key = `${rule.site_id}:${rule.clinician_id}`;
    groups.set(key, [...(groups.get(key) ?? []), rule]);
  }
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1">Weekly provider hours</Typography>
      <Typography variant="body2" color="text.secondary">
        Expand a provider and site to edit the week. Each addition or
        deactivation is saved separately; there is no bulk replacement. To
        change hours, deactivate the old rule, then add the new hours
        deliberately.
      </Typography>
      {groups.size === 0 && (
        <Typography variant="body2">
          No weekly provider hours recorded.
        </Typography>
      )}
      {[...groups.entries()].map(([key, items]) => {
        const first = items[0];
        const windows = new Map<string, number[]>();
        for (const rule of items) {
          const window = `${clock(rule.start_minute)}–${clock(rule.end_minute)}`;
          windows.set(window, [
            ...(windows.get(window) ?? []),
            rule.weekday ?? 0,
          ]);
        }
        return (
          <Accordion key={key} disableGutters variant="outlined" elevation={0}>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-label={`Weekly hours for ${clinicians.find((item) => item.id === first.clinician_id)?.name ?? first.clinician_id} at ${sites.find((item) => item.id === first.site_id)?.name ?? first.site_id}`}
            >
              <Stack spacing={0.5}>
                <Typography fontWeight={600}>
                  {clinicians.find((item) => item.id === first.clinician_id)
                    ?.name ?? `Clinician #${first.clinician_id}`}{" "}
                  ·{" "}
                  {sites.find((item) => item.id === first.site_id)?.name ??
                    `Site #${first.site_id}`}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {[...windows]
                    .map(
                      ([window, weekdays]) =>
                        `${[...new Set(weekdays)]
                          .sort()
                          .map((day) => days[day].slice(0, 3))
                          .join(", ")} ${window}`,
                    )
                    .join(" · ")}{" "}
                  · Edit week
                </Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <TableContainer>
                <Table size="small" aria-label="Weekly provider capacity rules">
                  <TableBody>
                    {days.map((day, weekday) => (
                      <TableRow key={day}>
                        <TableCell component="th" scope="row">
                          {day}
                        </TableCell>
                        <TableCell>
                          <Stack spacing={1}>
                            {items
                              .filter((rule) => rule.weekday === weekday)
                              .map((rule) => (
                                <Stack
                                  key={rule.id}
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                >
                                  <Typography variant="body2" sx={{ flex: 1 }}>
                                    {clock(rule.start_minute)}–
                                    {clock(rule.end_minute)} {rule.reason} ·
                                    Rule #{rule.id}
                                  </Typography>
                                  {canWrite && (
                                    <Button
                                      disabled={disabled}
                                      onClick={() => onDeactivate(rule)}
                                      aria-label={`Deactivate ${day} rule ${rule.id}`}
                                    >
                                      Deactivate
                                    </Button>
                                  )}
                                </Stack>
                              ))}
                            {!items.some(
                              (rule) => rule.weekday === weekday,
                            ) && (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                No rule recorded
                              </Typography>
                            )}
                          </Stack>
                        </TableCell>
                        {canWrite && (
                          <TableCell>
                            <Button
                              disabled={disabled}
                              onClick={() =>
                                onAdd(
                                  first.site_id,
                                  first.clinician_id,
                                  weekday,
                                )
                              }
                              aria-label={`Add ${day} hours`}
                            >
                              Add hours
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Stack>
  );
}
