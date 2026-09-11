import { useMemo, useState, type FormEvent } from "react";
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
  MenuItem,
  Paper,
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
  schema_version: "owner-command-center-v1";
  organizations: OrganizationSummary[];
  unassigned_clinics: ClinicSummary[];
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

export function OwnerCommandCenter() {
  const { data, error, refresh } = useResource<CommandCenterData>(
    "/api/owner/command_center",
    { retainDataOnRefresh: true },
  );
  const [open, setOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState("new");
  const [organizationName, setOrganizationName] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [invitation, setInvitation] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteClinic, setInviteClinic] = useState<ClinicSummary | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviting, setInviting] = useState(false);

  const clinicCount = useMemo(
    () =>
      (data?.organizations.reduce(
        (total, organization) => total + organization.clinics.length,
        0,
      ) ?? 0) + (data?.unassigned_clinics.length ?? 0),
    [data],
  );
  const memberCount = useMemo(
    () =>
      (data?.organizations.reduce(
        (total, organization) =>
          total +
          organization.clinics.reduce(
            (clinicTotal, clinic) => clinicTotal + clinic.member_count,
            0,
          ),
        0,
      ) ?? 0) +
      (data?.unassigned_clinics.reduce(
        (total, clinic) => total + clinic.member_count,
        0,
      ) ?? 0),
    [data],
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
        body: { owner: { name: inviteName, email: inviteEmail } },
      });
      setInvitation(result.invitation);
      setInviteClinic(null);
      setInviteName("");
      setInviteEmail("");
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

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Paper variant="outlined" sx={{ px: 2.5, py: 2, minWidth: 180 }}>
          <Typography variant="body2" color="text.secondary">
            Organizations
          </Typography>
          <Typography variant="h4">{data.organizations.length}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ px: 2.5, py: 2, minWidth: 180 }}>
          <Typography variant="body2" color="text.secondary">
            Clinics
          </Typography>
          <Typography variant="h4">{clinicCount}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ px: 2.5, py: 2, minWidth: 180 }}>
          <Typography variant="body2" color="text.secondary">
            Active members
          </Typography>
          <Typography variant="h4">{memberCount}</Typography>
        </Paper>
      </Stack>

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

      {data.organizations.length === 0 &&
      data.unassigned_clinics.length === 0 ? (
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
          {data.unassigned_clinics.length > 0 && (
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
            </Paper>
          )}
        </Stack>
      )}

      <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
        <Stack component="form" onSubmit={submit}>
          <DialogTitle>Create clinic</DialogTitle>
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
                {data.organizations.map((organization) => (
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
                helperText="The owner will receive a private link to create their password."
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
                helperText="The owner will receive a private link to create their password."
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
