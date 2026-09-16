import { Alert, Box, Chip, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useClinic } from "../clinic/Workspace";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { EmploymentAdminPage } from "./EmploymentAdminPage";
import { WorkforceSettingsPage } from "./WorkforceSettingsPage";
import { BadgeAdminPage } from "./BadgeAdminPage";
import { EmployeeHoursPage } from "./EmployeeHoursPage";
import { TimecardReviewPage } from "./TimecardReviewPage";
import { ScheduleBuilderPage } from "./ScheduleBuilderPage";
import { EmployeeSchedulePage } from "./EmployeeSchedulePage";
import { EmployeeRequestsPage } from "./EmployeeRequestsPage";
import { RequestReviewPage } from "./RequestReviewPage";
import { PayrollExportPage } from "./PayrollExportPage";

export function WorkforceApp({ path }: { path: string }) {
  const { capabilities: c } = useClinic();
  const { navigate } = useClinicNavigation();
  const pages = [
    {
      id: "hours",
      label: "My hours",
      allowed: c.workforce_self,
      page: <EmployeeHoursPage />,
    },
    {
      id: "my-schedule",
      label: "My schedule",
      allowed: c.workforce_self,
      page: <EmployeeSchedulePage />,
    },
    {
      id: "my-requests",
      label: "My requests",
      allowed: c.workforce_self,
      page: <EmployeeRequestsPage />,
    },
    {
      id: "employees",
      label: "Employees",
      allowed: c.workforce_admin,
      page: <EmploymentAdminPage />,
    },
    {
      id: "badges",
      label: "Badges & kiosks",
      allowed: c.workforce_badges || c.workforce_settings,
      page: <BadgeAdminPage />,
    },
    {
      id: "timecards",
      label: "Timecards",
      allowed:
        c.workforce_timecards_read ||
        c.workforce_timecards_review ||
        c.workforce_timecards_approve,
      page: <TimecardReviewPage />,
    },
    {
      id: "schedule",
      label: "Team schedule",
      allowed:
        c.workforce_schedule_read ||
        c.workforce_schedule_manage ||
        c.workforce_schedule_publish,
      page: <ScheduleBuilderPage />,
    },
    {
      id: "requests",
      label: "Request review",
      allowed: c.workforce_requests_review,
      page: <RequestReviewPage />,
    },
    {
      id: "payroll",
      label: "Payroll exports",
      allowed: c.workforce_payroll_export || c.workforce_payroll_configure,
      page: <PayrollExportPage />,
    },
    {
      id: "settings",
      label: "Location rules",
      allowed: c.workforce_settings,
      page: <WorkforceSettingsPage />,
    },
  ].filter((page) => page.allowed === true);
  const requested = path.slice("/clinic/workforce/".length);
  const selected =
    path === "/clinic/workforce"
      ? pages[0]
      : pages.find((page) => page.id === requested);
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="overline" color="text.secondary">
        Workforce
      </Typography>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ mb: 1.5, flexWrap: "wrap" }}
        aria-label="Workforce access summary"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <Chip
          label={`${pages.length} available section${pages.length === 1 ? "" : "s"}`}
          color={pages.length > 0 ? "success" : "warning"}
          size="small"
        />
        <Chip
          label="Access is controlled by clinic permissions"
          size="small"
          variant="outlined"
        />
      </Stack>
      <Tabs
        value={selected?.id ?? false}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Workforce sections"
        onChange={(_, value: string) => navigate(`/clinic/workforce/${value}`)}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}
      >
        {pages.map((page) => (
          <Tab key={page.id} value={page.id} label={page.label} />
        ))}
      </Tabs>
      {selected ? (
        selected.page
      ) : (
        <Alert severity="info">
          This workforce section is unavailable for your account. Choose an
          available section above or contact your administrator.
        </Alert>
      )}
    </Box>
  );
}
