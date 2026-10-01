import { Fragment, useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddBusinessOutlinedIcon from "@mui/icons-material/AddBusinessOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { WebsiteTraffic, type WebsiteTrafficData } from "./WebsiteTraffic";

type ClinicSummary = {
  id: number;
  name: string;
  timezone: string;
  created_at: string;
  member_count: number;
  owner_accounts: string[];
  owner_invitations: string[];
  state: "ready" | "invited" | "needs_owner";
};

type OrganizationSummary = {
  id: number;
  name: string;
  clinics: ClinicSummary[];
};

type CommandCenterData = {
  schema_version: "owner-command-center-v2";
  delivery_methods: { email: boolean; sms: boolean };
  demo_usage: DemoUsage[];
  demo_feedback: DemoFeedback[];
  website_traffic: WebsiteTrafficData;
  organizations: OrganizationSummary[];
  unassigned_clinics: ClinicSummary[];
  organization_options: Array<{ id: number; name: string }>;
  counts: { organizations: number; clinics: number; active_members: number };
  organization_pagination: PageMetadata;
  demo_usage_pagination: PageMetadata;
  demo_feedback_pagination: PageMetadata;
  unassigned_clinic_pagination: PageMetadata;
};

type PageMetadata = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};

type DemoUsage = {
  id: number;
  name: string;
  email: string;
  company: string;
  lessons_started: number;
  elapsed_seconds: number;
  lesson_usage: DemoLessonUsage[];
};

type DemoLessonUsage = {
  lesson_key: string;
  title: string;
  elapsed_seconds: number;
  completed: boolean;
};

type DemoFeedback = {
  id: number;
  visitor_name: string;
  visitor_company: string;
  message: string;
  created_at: string;
};

type CreatedInvitation = {
  email_address: string;
  expires_at: string;
  activation_path: string | null;
  delivery_status: "sent" | "prepared" | "failed";
};

const TIMEZONES = [
  ["America/Chicago", "Central Time"],
  ["America/New_York", "Eastern Time"],
  ["America/Denver", "Mountain Time"],
  ["America/Los_Angeles", "Pacific Time"],
  ["America/Phoenix", "Arizona Time"],
] as const;

export function formatDemoDuration(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${remainder}s`;
}

function PageControls({
  pagination,
  onPageChange,
}: {
  pagination: PageMetadata;
  onPageChange: (page: number) => void;
}) {
  if (pagination.total_pages <= 1) return null;

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ p: 1.5, alignItems: "center", justifyContent: "flex-end" }}
    >
      <Typography variant="body2" color="text.secondary">
        Page {pagination.page} of {pagination.total_pages} ({pagination.total}{" "}
        total)
      </Typography>
      <Button
        size="small"
        disabled={pagination.page <= 1}
        onClick={() => onPageChange(pagination.page - 1)}
      >
        Previous
      </Button>
      <Button
        size="small"
        disabled={pagination.page >= pagination.total_pages}
        onClick={() => onPageChange(pagination.page + 1)}
      >
        Next
      </Button>
    </Stack>
  );
}

export function OwnerCommandCenter() {
  const [organizationPage, setOrganizationPage] = useState(1);
  const [demoPage, setDemoPage] = useState(1);
  const [feedbackPage, setFeedbackPage] = useState(1);
  const [unassignedPage, setUnassignedPage] = useState(1);
  const { data, error, refresh } = useResource<CommandCenterData>(
    `/api/owner/command_center?organization_page=${organizationPage}&demo_page=${demoPage}&feedback_page=${feedbackPage}&unassigned_clinic_page=${unassignedPage}`,
    { retainDataOnRefresh: true },
  );
  const [open, setOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState("new");
  const [organizationName, setOrganizationName] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("email");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [invitation, setInvitation] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteClinic, setInviteClinic] = useState<ClinicSummary | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDeliveryMethod, setInviteDeliveryMethod] = useState("email");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [expandedVisitorId, setExpandedVisitorId] = useState<number | null>(
    null,
  );

  const close = () => {
    if (saving) return;
    setOpen(false);
    setSaveError("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    setInvitation(null);
    setCopied(false);
    try {
      const result = await api<{
        clinic: ClinicSummary;
        invitation: CreatedInvitation;
      }>("/api/owner/clinics", {
        method: "POST",
        body: {
          clinic: {
            organization_id: organizationId === "new" ? "" : organizationId,
            organization_name: organizationId === "new" ? organizationName : "",
            clinic_name: clinicName,
            timezone,
            owner_name: ownerName,
            owner_email: ownerEmail,
            delivery_method: deliveryMethod,
            owner_phone: ownerPhone,
          },
        },
      });
      setInvitation(result.invitation);
      setOpen(false);
      setOrganizationId("new");
      setOrganizationName("");
      setClinicName("");
      setTimezone("America/Chicago");
      setOwnerName("");
      setOwnerEmail("");
      setDeliveryMethod("email");
      setOwnerPhone("");
      refresh();
    } catch (reason) {
      setSaveError(
        reason instanceof Error
          ? reason.message
          : "The clinic could not be created.",
      );
    } finally {
      setSaving(false);
    }
  };

  const copyInvitation = async () => {
    if (!invitation?.activation_path) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${invitation.activation_path}`,
      );
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const openOwnerInvitation = (clinic: ClinicSummary) => {
    setInviteClinic(clinic);
    setInviteName("");
    setInviteEmail(clinic.owner_invitations[0] ?? "");
    setInviteDeliveryMethod("email");
    setInvitePhone("");
    setInviteError("");
  };

  const closeOwnerInvitation = () => {
    if (inviting) return;
    setInviteClinic(null);
    setInviteError("");
  };

  const submitOwnerInvitation = async (event: FormEvent) => {
    event.preventDefault();
    if (!inviteClinic) return;
    setInviting(true);
    setInviteError("");
    setInvitation(null);
    setCopied(false);
    try {
      const result = await api<{
        clinic: ClinicSummary;
        invitation: CreatedInvitation;
      }>(`/api/owner/clinics/${inviteClinic.id}/owner_invitation`, {
        method: "POST",
        body: {
          owner: {
            name: inviteName,
            email: inviteEmail,
            delivery_method: inviteDeliveryMethod,
            phone: invitePhone,
          },
        },
      });
      setInvitation(result.invitation);
      setInviteClinic(null);
      setInviteName("");
      setInviteEmail("");
      setInviteDeliveryMethod("email");
      setInvitePhone("");
      refresh();
    } catch (reason) {
      setInviteError(
        reason instanceof Error
          ? reason.message
          : "The owner invitation could not be sent.",
      );
    } finally {
      setInviting(false);
    }
  };

  if (!data && error === "This page is for Meta Clinic platform owners.")
    return (
      <Alert severity="info">
        Owner access is required. Choose Owner on the demo login page and enter
        the owner demo PIN.
        <Button href="/login?next=%2Fowner" color="inherit">
          Open Owner sign in
        </Button>
      </Alert>
    );
  if (!data) return <LoadState error={error} />;

  return (
    <Stack spacing={3.5}>
      <Box
        component="header"
        sx={{
          display: "flex",
          alignItems: { xs: "flex-start", md: "center" },
          justifyContent: "space-between",
          flexDirection: { xs: "column", md: "row" },
          gap: 2,
        }}
      >
        <Stack spacing={0.75}>
          <Typography component="p" variant="overline" color="text.secondary">
            Meta Clinic owner
          </Typography>
          <Typography component="h1" variant="h3">
            Owner Command Center
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 720 }}>
            Manage organizations, establish clinics, and send the first
            clinic-owner invitation. Each clinic controls its own people and
            access.
          </Typography>
        </Stack>
        <Button
          variant="contained"
          size="large"
          startIcon={<AddBusinessOutlinedIcon />}
          onClick={() => setOpen(true)}
        >
          Create clinic
        </Button>
      </Box>

      <Box component="nav" aria-label="Owner navigation">
        <Button component="a" href="#website-traffic" variant="text">
          Website visitors
        </Button>
        <Button component="a" href="#demo-usage" variant="text">
          Demo usage
        </Button>
        <Button component="a" href="#demo-feedback" variant="text">
          Demo feedback
        </Button>
      </Box>

      <WebsiteTraffic data={data.website_traffic} onRefresh={refresh} />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Paper variant="outlined" sx={{ px: 2.5, py: 2, minWidth: 180 }}>
          <Typography variant="body2" color="text.secondary">
            Organizations
          </Typography>
          <Typography variant="h4">{data.counts.organizations}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ px: 2.5, py: 2, minWidth: 180 }}>
          <Typography variant="body2" color="text.secondary">
            Clinics
          </Typography>
          <Typography variant="h4">{data.counts.clinics}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ px: 2.5, py: 2, minWidth: 180 }}>
          <Typography variant="body2" color="text.secondary">
            Active members
          </Typography>
          <Typography variant="h4">{data.counts.active_members}</Typography>
        </Paper>
      </Stack>
      <Alert severity="info">
        Organization totals are aggregate-only counts of clinics and active
        memberships. Patient identifiers, clinical records, and clinic-level
        financial details stay inside each clinic workspace.
      </Alert>

      <Paper
        component="section"
        id="demo-usage"
        variant="outlined"
        sx={{ overflow: "hidden" }}
      >
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography component="h2" variant="h5">
            Demo usage
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Registered visitor details, with each opened lesson's elapsed time
            and completion result.
          </Typography>
        </Box>
        <Divider />
        {data.demo_usage_pagination.total === 0 ? (
          <Typography sx={{ p: 2.5 }} color="text.secondary">
            No demo visitors have registered yet.
          </Typography>
        ) : (
          <TableContainer>
            <Table aria-label="Demo visitor usage">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Company</TableCell>
                  <TableCell align="right">Lessons started</TableCell>
                  <TableCell align="right">Elapsed demo time</TableCell>
                  <TableCell align="right">Lesson activity</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.demo_usage.map((visitor) => {
                  const expanded = expandedVisitorId === visitor.id;
                  const detailsId = `demo-lesson-usage-${visitor.id}`;
                  return (
                    <Fragment key={visitor.id}>
                      <TableRow>
                        <TableCell>{visitor.name}</TableCell>
                        <TableCell>{visitor.email}</TableCell>
                        <TableCell>{visitor.company}</TableCell>
                        <TableCell align="right">
                          {visitor.lessons_started}
                        </TableCell>
                        <TableCell align="right">
                          {formatDemoDuration(visitor.elapsed_seconds)}
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            onClick={() =>
                              setExpandedVisitorId(expanded ? null : visitor.id)
                            }
                            aria-expanded={expanded}
                            aria-controls={detailsId}
                          >
                            {expanded ? "Hide lessons" : "View lessons"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            sx={{ bgcolor: "action.hover", p: 2 }}
                          >
                            <Box id={detailsId}>
                              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Lessons opened
                              </Typography>
                              <Table
                                size="small"
                                aria-label={`Lessons opened by ${visitor.name}`}
                              >
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Lesson</TableCell>
                                    <TableCell align="right">
                                      Elapsed time
                                    </TableCell>
                                    <TableCell>Completion</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {visitor.lesson_usage.map((lesson, index) => (
                                    <TableRow
                                      key={`${lesson.lesson_key}-${index}`}
                                    >
                                      <TableCell>{lesson.title}</TableCell>
                                      <TableCell align="right">
                                        {formatDemoDuration(
                                          lesson.elapsed_seconds,
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <Chip
                                          size="small"
                                          color={
                                            lesson.completed
                                              ? "success"
                                              : "default"
                                          }
                                          label={
                                            lesson.completed
                                              ? "Completed"
                                              : "Not completed"
                                          }
                                        />
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <PageControls
          pagination={data.demo_usage_pagination}
          onPageChange={setDemoPage}
        />
      </Paper>

      <Paper
        component="section"
        id="demo-feedback"
        variant="outlined"
        sx={{ overflow: "hidden" }}
      >
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography component="h2" variant="h5">
            Demo feedback
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Messages submitted from the sandbox. Only Meta Clinic platform
            owners can review them.
          </Typography>
        </Box>
        <Divider />
        {data.demo_feedback_pagination.total === 0 ? (
          <Typography sx={{ p: 2.5 }} color="text.secondary">
            No demo feedback has been submitted yet.
          </Typography>
        ) : (
          <Stack divider={<Divider />}>
            {data.demo_feedback.map((entry) => (
              <Box key={entry.id} sx={{ p: 2.5 }}>
                <Typography variant="subtitle2">
                  {entry.visitor_name}
                  {entry.visitor_company ? ` · ${entry.visitor_company}` : ""}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(entry.created_at).toLocaleString()}
                </Typography>
                <Typography
                  sx={{
                    mt: 1,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  {entry.message}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
        <PageControls
          pagination={data.demo_feedback_pagination}
          onPageChange={setFeedbackPage}
        />
      </Paper>

      {invitation && (
        <Alert
          severity={
            invitation.delivery_status === "failed" ? "warning" : "success"
          }
          onClose={() => setInvitation(null)}
        >
          <Stack spacing={1.25}>
            <Typography sx={{ fontWeight: 700 }}>
              {invitation.delivery_status === "sent"
                ? "Clinic created and invitation sent"
                : invitation.delivery_status === "prepared"
                  ? "Clinic created and invitation prepared"
                  : "Clinic created, but email delivery failed"}
            </Typography>
            <Typography>
              {invitation.delivery_status === "prepared"
                ? "The local email is ready for review. Use the link below to complete the owner workflow."
                : invitation.delivery_status === "failed"
                  ? "Copy this private link and deliver it securely to the clinic owner."
                  : `The owner invitation was sent to ${invitation.email_address}.`}
            </Typography>
            {invitation.activation_path && (
              <TextField
                label="Owner invitation link"
                value={`${window.location.origin}${invitation.activation_path}`}
                fullWidth
                slotProps={{ htmlInput: { readOnly: true } }}
              />
            )}
            <Typography variant="caption" color="text.secondary">
              This link expires{" "}
              {new Date(invitation.expires_at).toLocaleString()} and can be used
              once.
            </Typography>
            {invitation.activation_path && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<ContentCopyOutlinedIcon />}
                onClick={copyInvitation}
                sx={{ alignSelf: "flex-start" }}
              >
                {copied ? "Copied" : "Copy invitation link"}
              </Button>
            )}
          </Stack>
        </Alert>
      )}

      {data.counts.clinics === 0 ? (
        <Paper variant="outlined" sx={{ p: 4 }}>
          <Typography component="h2" variant="h5" gutterBottom>
            No clinics yet
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Create the first organization, clinic, and clinic-owner account
            together.
          </Typography>
          <Button variant="outlined" onClick={() => setOpen(true)}>
            Create clinic
          </Button>
        </Paper>
      ) : (
        <Stack spacing={3}>
          {data.organizations.map((organization) => (
            <Paper
              key={organization.id}
              variant="outlined"
              sx={{ overflow: "hidden" }}
            >
              <Box sx={{ px: 2.5, py: 2 }}>
                <Typography component="h2" variant="h5">
                  {organization.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {organization.clinics.length}{" "}
                  {organization.clinics.length === 1 ? "clinic" : "clinics"}
                </Typography>
              </Box>
              <Divider />
              <ClinicTable
                clinics={organization.clinics}
                onInviteOwner={openOwnerInvitation}
              />
            </Paper>
          ))}
          {data.organization_pagination.total > 0 && (
            <PageControls
              pagination={data.organization_pagination}
              onPageChange={setOrganizationPage}
            />
          )}
          {data.unassigned_clinic_pagination.total > 0 && (
            <Paper variant="outlined" sx={{ overflow: "hidden" }}>
              <Box sx={{ px: 2.5, py: 2 }}>
                <Typography component="h2" variant="h5">
                  Clinics without an organization
                </Typography>
              </Box>
              <Divider />
              <ClinicTable
                clinics={data.unassigned_clinics}
                onInviteOwner={openOwnerInvitation}
              />
              <PageControls
                pagination={data.unassigned_clinic_pagination}
                onPageChange={setUnassignedPage}
              />
            </Paper>
          )}
        </Stack>
      )}

      <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
        <Stack component="form" onSubmit={submit}>
          <DialogTitle>Clinic Setup — create clinic</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.25} sx={{ pt: 0.5 }}>
              {saveError && <Alert severity="error">{saveError}</Alert>}
              <TextField
                select
                label="Organization"
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
                required
              >
                <MenuItem value="new">Create a new organization</MenuItem>
                {data.organization_options.map((organization) => (
                  <MenuItem
                    key={organization.id}
                    value={String(organization.id)}
                  >
                    {organization.name}
                  </MenuItem>
                ))}
              </TextField>
              {organizationId === "new" && (
                <TextField
                  label="Organization name"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  required
                  slotProps={{ htmlInput: { maxLength: 120 } }}
                />
              )}
              <TextField
                label="Clinic name"
                value={clinicName}
                onChange={(event) => setClinicName(event.target.value)}
                required
                slotProps={{ htmlInput: { maxLength: 120 } }}
              />
              <TextField
                select
                label="Clinic timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                required
              >
                {TIMEZONES.map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
              <Divider />
              <Typography component="h3" variant="h6">
                First clinic owner
              </Typography>
              <TextField
                label="Owner name"
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
                required
                slotProps={{ htmlInput: { maxLength: 120 } }}
              />
              <TextField
                label="Owner email"
                type="email"
                value={ownerEmail}
                onChange={(event) => setOwnerEmail(event.target.value)}
                required
                autoComplete="off"
                slotProps={{ htmlInput: { maxLength: 254 } }}
                helperText="Used for the owner account, even when the activation link is sent by text."
              />
              <DeliveryMethodField
                method={deliveryMethod}
                onMethodChange={setDeliveryMethod}
                phone={ownerPhone}
                onPhoneChange={setOwnerPhone}
                smsAvailable={data.delivery_methods.sms}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? "Creating…" : "Create clinic"}
            </Button>
          </DialogActions>
        </Stack>
      </Dialog>

      <Dialog
        open={Boolean(inviteClinic)}
        onClose={closeOwnerInvitation}
        fullWidth
        maxWidth="sm"
      >
        <Stack component="form" onSubmit={submitOwnerInvitation}>
          <DialogTitle>
            {inviteClinic?.state === "invited"
              ? "Send a new owner invitation"
              : "Invite clinic owner"}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.25} sx={{ pt: 0.5 }}>
              {inviteError && <Alert severity="error">{inviteError}</Alert>}
              <Typography color="text.secondary">
                {inviteClinic?.name}. Any previous pending owner link for this
                clinic will stop working.
              </Typography>
              <TextField
                label="Owner name"
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
                required
                autoFocus
                slotProps={{ htmlInput: { maxLength: 120 } }}
              />
              <TextField
                label="Owner email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                required
                autoComplete="off"
                slotProps={{ htmlInput: { maxLength: 254 } }}
                helperText="Used for the owner account, even when the activation link is sent by text."
              />
              <DeliveryMethodField
                method={inviteDeliveryMethod}
                onMethodChange={setInviteDeliveryMethod}
                phone={invitePhone}
                onPhoneChange={setInvitePhone}
                smsAvailable={data.delivery_methods.sms}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={closeOwnerInvitation} disabled={inviting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={inviting}>
              {inviting ? "Sending…" : "Send invitation"}
            </Button>
          </DialogActions>
        </Stack>
      </Dialog>
    </Stack>
  );
}

function DeliveryMethodField({
  method,
  onMethodChange,
  phone,
  onPhoneChange,
  smsAvailable,
}: {
  method: string;
  onMethodChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  smsAvailable: boolean;
}) {
  return (
    <Stack spacing={1.25}>
      <FormControl>
        <FormLabel id="owner-delivery-method-label">
          Send activation link by
        </FormLabel>
        <RadioGroup
          row
          aria-labelledby="owner-delivery-method-label"
          value={method}
          onChange={(event) => onMethodChange(event.target.value)}
        >
          <FormControlLabel value="email" control={<Radio />} label="Email" />
          <FormControlLabel
            value="sms"
            control={<Radio />}
            label="Text message"
            disabled={!smsAvailable}
          />
        </RadioGroup>
        {!smsAvailable && (
          <Typography variant="caption" color="text.secondary">
            Text messages are not available yet. Send the activation link by
            email.
          </Typography>
        )}
      </FormControl>
      {method === "sms" && (
        <TextField
          label="Mobile number"
          type="tel"
          value={phone}
          onChange={(event) => onPhoneChange(event.target.value)}
          required
          autoComplete="tel"
          placeholder="(555) 555-5555"
          helperText="The one-time password link will be sent by text message."
          slotProps={{ htmlInput: { maxLength: 32 } }}
        />
      )}
    </Stack>
  );
}

function ClinicTable({
  clinics,
  onInviteOwner,
}: {
  clinics: ClinicSummary[];
  onInviteOwner: (clinic: ClinicSummary) => void;
}) {
  if (clinics.length === 0)
    return (
      <Typography color="text.secondary" sx={{ px: 2.5, py: 3 }}>
        No clinics in this organization.
      </Typography>
    );

  return (
    <TableContainer>
      <Table aria-label="Clinics in this organization">
        <TableHead>
          <TableRow>
            <TableCell>Clinic</TableCell>
            <TableCell>Owner account</TableCell>
            <TableCell>Members</TableCell>
            <TableCell>Timezone</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Action</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {clinics.map((clinic) => (
            <TableRow key={clinic.id} hover>
              <TableCell component="th" scope="row">
                <Typography sx={{ fontWeight: 650 }}>{clinic.name}</Typography>
              </TableCell>
              <TableCell>
                {clinic.owner_accounts.length
                  ? clinic.owner_accounts.join(", ")
                  : clinic.owner_invitations.length
                    ? `${clinic.owner_invitations.join(", ")} (invited)`
                    : "Not assigned"}
              </TableCell>
              <TableCell>{clinic.member_count}</TableCell>
              <TableCell>{clinic.timezone}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  variant="outlined"
                  color={
                    clinic.state === "ready"
                      ? "success"
                      : clinic.state === "invited"
                        ? "info"
                        : "warning"
                  }
                  label={
                    clinic.state === "ready"
                      ? "Ready"
                      : clinic.state === "invited"
                        ? "Invitation pending"
                        : "Needs owner"
                  }
                />
              </TableCell>
              <TableCell align="right">
                {clinic.state !== "ready" && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => onInviteOwner(clinic)}
                  >
                    {clinic.state === "invited"
                      ? "Resend invitation"
                      : "Invite owner"}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
