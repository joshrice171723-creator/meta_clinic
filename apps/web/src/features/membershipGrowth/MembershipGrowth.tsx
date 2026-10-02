import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Checkbox,
  Paper,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import "./membershipGrowth.css";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import { publicPageAccents } from "./publicPageTheme";
import { ServiceInquiries } from "./ServiceInquiries";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";
import { subscriptionMoney } from "../clinic/subscriptions/contracts";
import type {
  StaffPhonePaymentResponse,
  MembershipProspect,
  MembershipProspectIndexResponse,
  MembershipProspectMutationResponse,
  MembershipProspectState,
  MembershipStorefront,
} from "./types";

const relationshipFilters = [
  "prospective_patient",
  "patient",
  "closed",
] as const;
type RelationshipFilter = (typeof relationshipFilters)[number];

const relationshipLabels: Record<RelationshipFilter, string> = {
  prospective_patient: "Prospective patients",
  patient: "Patients",
  closed: "Closed",
};

const statusLabels: Record<MembershipProspectState, string> = {
  new: "Contact requested",
  checkout_pending: "Signup call required",
  payment_processing: "Payment processing",
  paid_onboarding: "Paid onboarding",
  contacted: "Contacted",
  qualified: "Qualified lead",
  converted: "Portal activated",
  checkout_expired: "Signup call required · checkout expired",
  payment_failed: "Signup call required · payment failed",
  declined: "Closed",
};

type PipelineFilter = "all" | RelationshipFilter;
type ProspectAction =
  | "contacted"
  | "qualify"
  | "decline"
  | "begin_call"
  | "no_answer"
  | "callback_requested"
  | "not_interested";

const actionNotices: Record<ProspectAction, string> = {
  contacted: "Clinic outreach marked complete.",
  begin_call:
    "Signup call started. Confirm the membership, contact details, recurring terms, and cancellation policy before taking payment.",
  no_answer: "No answer recorded. This person remains in the follow-up queue.",
  callback_requested:
    "Callback requested. This person remains in the follow-up queue.",
  not_interested:
    "Not interested recorded. The incomplete checkout was closed without payment.",
  qualify:
    "Lead qualified. Send the storefront link when they are ready to purchase.",
  decline: "Lead declined. No payment or paid onboarding was created.",
};

function dateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? "Time unavailable"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed);
}

function statusColor(state: MembershipProspectState) {
  if (state === "converted") return "success" as const;
  if (state === "paid_onboarding" || state === "qualified")
    return "primary" as const;
  return "default" as const;
}

function enrollmentLabel(prospect: MembershipProspect) {
  if (prospect.enrollment_stage === "email_verification_pending")
    return "Account created · email verification pending";
  if (
    prospect.enrollment_stage === "payment_pending" &&
    prospect.account_activated_at
  )
    return "Email verified · payment incomplete";
  if (prospect.enrollment_stage === "patient_onboarding")
    return "Payment verified · moved to patient onboarding";
  return statusLabels[prospect.status];
}

function matchesFilter(prospect: MembershipProspect, filter: PipelineFilter) {
  if (filter === "all") return true;
  if (filter === "closed") return prospect.status === "declined";
  return (
    prospect.status !== "declined" && prospect.relationship_stage === filter
  );
}

export function MembershipGrowth() {
  const resource = useResource<MembershipProspectIndexResponse>(
    "/api/clinic/membership_prospects",
    { retainDataOnRefresh: true },
  );
  const [filter, setFilter] = useState<PipelineFilter>("prospective_patient");
  const [selected, setSelected] = useState<MembershipProspect | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [recurringAuthorization, setRecurringAuthorization] = useState(false);
  const [slug, setSlug] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [headline, setHeadline] = useState("");
  const [intro, setIntro] = useState("");
  const [accent, setAccent] = useState("");
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoContentType, setLogoContentType] = useState<string | null>(null);
  const [configurationBusy, setConfigurationBusy] = useState(false);
  const [configurationError, setConfigurationError] = useState("");
  const [configurationNotice, setConfigurationNotice] = useState("");

  const storefront = resource.data?.storefront;
  useEffect(() => {
    const selectedId = new URLSearchParams(window.location.search).get(
      "prospect",
    );
    if (!selectedId || !resource.data) return;

    const prospect = resource.data.prospects.find(
      (record) => record.id === Number(selectedId),
    );
    if (prospect) {
      setSelected(prospect);
      setActionError("");
      setActionNotice("");
      setRecurringAuthorization(false);
    }
  }, [resource.data]);

  useEffect(() => {
    if (!storefront) return;
    setSlug(storefront.slug || "");
    setEnabled(storefront.enabled);
    setHeadline(storefront.headline || "");
    setIntro(storefront.intro || "");
    setAccent(storefront.accent || "");
  }, [storefront]);

  const counts = useMemo(() => {
    const records = resource.data?.prospects || [];
    return Object.fromEntries(
      relationshipFilters.map((stage) => [
        stage,
        records.filter((record) => matchesFilter(record, stage)).length,
      ]),
    ) as Record<RelationshipFilter, number>;
  }, [resource.data?.prospects]);
  const prospects = (resource.data?.prospects || []).filter((prospect) =>
    matchesFilter(prospect, filter),
  );
  const canConfigure = resource.data?.capabilities.configure === true;
  const slugValid = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/.test(slug);
  const configurationChanged =
    slug !== (storefront?.slug || "") ||
    enabled !== (storefront?.enabled || false) ||
    headline !== (storefront?.headline || "") ||
    intro !== (storefront?.intro || "") ||
    accent !== (storefront?.accent || "") ||
    logoBase64 !== null;

  async function selectLogo(file?: File) {
    if (!file) return;
    if (!(
      ["image/png", "image/jpeg"].includes(file.type) && file.size <= 100_000
    )) {
      setConfigurationError("Choose a PNG or JPEG of 100 KB or less.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("The logo could not be read."));
      reader.readAsDataURL(file);
    }).catch((error: Error) => {
      setConfigurationError(error.message);
      return null;
    });
    if (!dataUrl) return;
    setLogoBase64(dataUrl.split(",", 2)[1] || "");
    setLogoContentType(file.type);
    setConfigurationError("");
  }

  async function saveStorefront() {
    if (!canConfigure || configurationBusy || !slugValid) return;
    setConfigurationBusy(true);
    setConfigurationError("");
    setConfigurationNotice("");
    try {
      const result = await api<{ storefront: MembershipStorefront }>(
        "/api/clinic/membership_storefront",
        {
          method: "PATCH",
          body: {
            storefront: {
              slug,
              enabled,
              headline,
              intro,
              accent,
              ...(logoBase64 === null
                ? {}
                : {
                    logo_base64: logoBase64,
                    logo_content_type: logoContentType,
                  }),
            },
          },
        },
      );
      setSlug(result.storefront.slug || "");
      setEnabled(result.storefront.enabled);
      setHeadline(result.storefront.headline || "");
      setIntro(result.storefront.intro || "");
      setAccent(result.storefront.accent || "");
      setLogoBase64(null);
      setLogoContentType(null);
      setConfigurationNotice(
        result.storefront.enabled
          ? "Public membership page saved and enabled."
          : "Membership page settings saved. The services page may remain available.",
      );
      resource.refresh();
    } catch (reason) {
      setConfigurationError(
        reason instanceof Error
          ? reason.message
          : "The storefront settings could not be saved.",
      );
    } finally {
      setConfigurationBusy(false);
    }
  }

  async function performAction(action: ProspectAction) {
    if (!selected || actionBusy) return;
    setActionBusy(true);
    setActionError("");
    setActionNotice("");
    try {
      const result = await api<MembershipProspectMutationResponse>(
        `/api/clinic/membership_prospects/${selected.id}`,
        {
          method: "PATCH",
          body: { prospect: { action, lock_version: selected.lock_version } },
        },
      );
      setSelected(result.prospect);
      setRecurringAuthorization(false);
      setActionNotice(actionNotices[action]);
      resource.refresh();
    } catch (reason) {
      setActionError(
        reason instanceof ApiError && reason.status === 409
          ? `${reason.message} Reload the pipeline before taking another action.`
          : reason instanceof Error
            ? reason.message
            : "The pipeline action could not be confirmed.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function startPhonePayment() {
    if (!selected || actionBusy) return;
    setActionBusy(true);
    setActionError("");
    setActionNotice("");
    try {
      const result = await api<StaffPhonePaymentResponse>(
        `/api/clinic/membership_prospects/${selected.id}/phone_payment`,
        {
          method: "POST",
          body: {
            prospect: {
              lock_version: selected.lock_version,
              authorization_confirmed: recurringAuthorization,
              authorization_version: "membership-recurring-phone-v1",
            },
          },
        },
      );
      setSelected(result.prospect);
      setActionNotice(
        result.phone_payment.instructions ||
          "Phone payment started. Check the payment status after the reader finishes.",
      );
      resource.refresh();
    } catch (reason) {
      setActionError(
        reason instanceof ApiError && reason.status === 409
          ? `${reason.message} Reload the pipeline before preparing payment.`
          : reason instanceof Error
            ? reason.message
            : "Phone payment could not be started.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function refreshPhonePayment() {
    if (!selected || actionBusy) return;
    setActionBusy(true);
    setActionError("");
    setActionNotice("");
    try {
      const result = await api<StaffPhonePaymentResponse>(
        `/api/clinic/membership_prospects/${selected.id}/refresh_phone_payment`,
        { method: "POST" },
      );
      setSelected(result.prospect);
      setActionNotice(
        result.phone_payment.status === "paid"
          ? "Payment verified. The membership and patient onboarding were created."
          : result.phone_payment.status === "failed"
            ? "The payment was not completed. Return this person to the call queue before trying again."
            : "Stripe is still processing this phone payment. No patient record has been created yet.",
      );
      resource.refresh();
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : "Phone payment status could not be confirmed.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <Box
      component="section"
      className="membership-growth"
      aria-labelledby="membership-growth-heading"
      sx={{ minWidth: 0 }}
    >
      <Stack spacing={2}>
        <Box className="growth-heading">
          <Typography
            id="membership-growth-heading"
            component="h1"
            variant="h4"
          >
            Growth
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 820 }}>
            Follow up on contact requests and membership signups. Verified
            payment moves people to patient onboarding.
          </Typography>
        </Box>
        {!resource.data && !resource.error && (
          <Typography role="status">Loading membership growth…</Typography>
        )}
        {resource.error && <Alert severity="error">{resource.error}</Alert>}
        {resource.data && (
          <>
            <Paper
              component="section"
              variant="outlined"
              className="growth-pipeline"
            >
              <Box className="growth-section-heading">
                <Typography component="h2" variant="h5">
                  Membership pipeline
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  Account created → account activated → payment. Unpaid signups
                  stay here for follow-up.
                </Typography>
              </Box>
              <Tabs
                className="growth-stage-tabs"
                value={filter}
                onChange={(_, value: PipelineFilter) => setFilter(value)}
                variant="standard"
                aria-label="Membership pipeline stages"
              >
                <Tab
                  value="all"
                  label={`All (${resource.data.prospects.length})`}
                />
                {relationshipFilters.map((stage) => (
                  <Tab
                    key={stage}
                    value={stage}
                    label={`${relationshipLabels[stage]} (${counts[stage]})`}
                  />
                ))}
              </Tabs>
              {prospects.length === 0 ? (
                <Typography color="text.secondary" sx={{ p: 3 }}>
                  No records are in this stage.
                </Typography>
              ) : (
                <TableContainer className="growth-pipeline-container">
                  <Table
                    className="growth-pipeline-table"
                    aria-label="Membership pipeline"
                  >
                    <colgroup>
                      <col style={{ width: "25%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "16%" }} />
                      <col style={{ width: "24%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "10%" }} />
                    </colgroup>
                    <TableHead>
                      <TableRow>
                        <TableCell>Person</TableCell>
                        <TableCell>Path</TableCell>
                        <TableCell>Membership</TableCell>
                        <TableCell>Enrollment stage</TableCell>
                        <TableCell>Submitted</TableCell>
                        <TableCell align="right">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {prospects.map((prospect) => (
                        <TableRow
                          key={prospect.id}
                          hover
                          selected={selected?.id === prospect.id}
                        >
                          <TableCell data-label="Person">
                            <Typography sx={{ fontWeight: 650 }}>
                              {prospect.display_name}
                            </Typography>
                            <Typography
                              className="growth-contact-address"
                              variant="body2"
                              color="text.secondary"
                            >
                              {prospect.email_address ||
                                "No email address provided"}
                            </Typography>
                          </TableCell>
                          <TableCell data-label="Path">
                            {prospect.intent_type === "purchase"
                              ? "Purchase now"
                              : "Contact first"}
                          </TableCell>
                          <TableCell data-label="Membership">
                            {prospect.selected_terms.package_name}
                          </TableCell>
                          <TableCell data-label="Enrollment stage">
                            <Chip
                              size="small"
                              label={
                                prospect.relationship_stage === "patient"
                                  ? "Patient"
                                  : "Prospective patient"
                              }
                              color={statusColor(prospect.status)}
                              variant={
                                prospect.relationship_stage === "patient"
                                  ? "filled"
                                  : "outlined"
                              }
                            />
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ mt: 0.5 }}
                            >
                              {enrollmentLabel(prospect)}
                            </Typography>
                          </TableCell>
                          <TableCell data-label="Submitted">
                            {dateTime(prospect.created_at)}
                          </TableCell>
                          <TableCell data-label="Action" align="right">
                            <Button
                              className="growth-review-button"
                              variant="outlined"
                              onClick={() => {
                                setSelected(prospect);
                                setActionError("");
                                setActionNotice("");
                                setRecurringAuthorization(false);
                              }}
                            >
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              <Typography
                className="growth-pipeline-guidance"
                variant="body2"
                color="text.secondary"
              >
                Verified payment carries the existing account and receipt into
                patient onboarding with a front-desk task. No second account
                invitation is needed.
              </Typography>
            </Paper>
            {resource.data.capabilities.review && <ServiceInquiries />}

            <Accordion
              className="growth-configuration"
              disableGutters
              elevation={0}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreRoundedIcon />}
                aria-controls="growth-configuration-fields"
                id="growth-configuration-heading"
              >
                <Box>
                  <Typography component="h2" variant="h5">
                    Public membership page
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {storefront?.enabled ? "Enabled" : "Disabled"} · Branding,
                    public address and page settings
                    {configurationChanged ? " · Unsaved changes" : ""}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails id="growth-configuration-fields">
                <Stack spacing={2.5}>
                  <Typography color="text.secondary">
                    Customers can purchase an eligible package or request
                    contact before paying.
                  </Typography>
                  {configurationError && (
                    <Alert severity="error">{configurationError}</Alert>
                  )}
                  {configurationNotice && (
                    <Alert severity="success">{configurationNotice}</Alert>
                  )}
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                    <TextField
                      label="Clinic page name"
                      value={slug}
                      required
                      disabled={!canConfigure || configurationBusy}
                      error={Boolean(slug) && !slugValid}
                      helperText="Use 3–80 lowercase letters, numbers, and single hyphens."
                      slotProps={{
                        htmlInput: {
                          maxLength: 80,
                          autoCapitalize: "none",
                          autoCorrect: "off",
                          spellCheck: false,
                        },
                      }}
                      onChange={(event) => setSlug(event.target.value)}
                      sx={{ flex: 1, minWidth: 0 }}
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={enabled}
                          disabled={!canConfigure || configurationBusy}
                          onChange={(_, checked) => setEnabled(checked)}
                        />
                      }
                      label="Membership page enabled"
                    />
                  </Stack>
                  <Stack spacing={1.5} className="growth-branding-fields">
                    <Stack
                      direction="row"
                      spacing={1.5}
                      sx={{ alignItems: "center" }}
                    >
                      <Button
                        component="label"
                        variant="outlined"
                        disabled={!canConfigure || configurationBusy}
                      >
                        Choose logo
                        <input
                          hidden
                          type="file"
                          accept="image/png,image/jpeg"
                          onChange={(event) => {
                            void selectLogo(event.target.files?.[0]);
                            event.target.value = "";
                          }}
                        />
                      </Button>
                      {(storefront?.logo_path ||
                        (logoBase64 && logoContentType)) && (
                        <Button
                          disabled={!canConfigure || configurationBusy}
                          onClick={() => {
                            setLogoBase64("");
                            setLogoContentType(null);
                          }}
                        >
                          Remove logo
                        </Button>
                      )}
                      <Typography variant="body2" color="text.secondary">
                        {logoBase64 === ""
                          ? "Logo will be removed"
                          : logoBase64
                            ? "New logo selected"
                            : storefront?.logo_path
                              ? "Logo saved"
                              : "PNG or JPEG, up to 100 KB"}
                      </Typography>
                    </Stack>
                    <TextField
                      select
                      label="Public page accent"
                      value={accent}
                      disabled={!canConfigure || configurationBusy}
                      onChange={(event) => setAccent(event.target.value)}
                      helperText="Used for buttons and controls on both public pages."
                    >
                      <MenuItem value="">Default</MenuItem>
                      {publicPageAccents.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      label="Public page headline"
                      value={headline}
                      disabled={!canConfigure || configurationBusy}
                      onChange={(event) => setHeadline(event.target.value)}
                      slotProps={{ htmlInput: { maxLength: 160 } }}
                    />
                    <TextField
                      label="Public page introduction"
                      value={intro}
                      multiline
                      minRows={2}
                      disabled={!canConfigure || configurationBusy}
                      onChange={(event) => setIntro(event.target.value)}
                      slotProps={{ htmlInput: { maxLength: 500 } }}
                      helperText="Shown on this clinic's membership and services pages."
                    />
                  </Stack>
                  <Stack
                    className="growth-public-links"
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                  >
                    <TextField
                      label="Saved public page address"
                      value={
                        resource.data.storefront.public_path ||
                        "No public address saved"
                      }
                      fullWidth
                      slotProps={{ input: { readOnly: true } }}
                      sx={{ flex: 1, minWidth: 0 }}
                    />
                    {resource.data.storefront.enabled &&
                      resource.data.storefront.public_path && (
                        <Button
                          href={resource.data.storefront.public_path}
                          target="_blank"
                          rel="noreferrer"
                          variant="outlined"
                          endIcon={<OpenInNewRoundedIcon />}
                        >
                          Open public page
                        </Button>
                      )}
                    {resource.data.storefront.service_page_path && (
                      <Button
                        href={resource.data.storefront.service_page_path}
                        target="_blank"
                        rel="noreferrer"
                        variant="outlined"
                        endIcon={<OpenInNewRoundedIcon />}
                      >
                        Open services page
                      </Button>
                    )}
                  </Stack>
                  <Box>
                    <Button
                      variant="contained"
                      disabled={
                        !canConfigure ||
                        configurationBusy ||
                        !slugValid ||
                        !configurationChanged
                      }
                      onClick={() => void saveStorefront()}
                    >
                      {configurationBusy ? "Saving…" : "Save page settings"}
                    </Button>
                  </Box>
                </Stack>
              </AccordionDetails>
            </Accordion>
          </>
        )}
      </Stack>

      <Dialog
        className="growth-review-dialog"
        sx={(theme) => ({ "--growth-divider": theme.palette.divider })}
        open={Boolean(selected)}
        onClose={() => {
          if (!actionBusy) {
            setSelected(null);
            setRecurringAuthorization(false);
          }
        }}
        fullWidth
        maxWidth="lg"
        aria-labelledby="membership-record-title"
      >
        <DialogTitle id="membership-record-title">
          <Typography component="span" variant="body2" color="text.secondary">
            Membership record
          </Typography>
          <Typography
            component="span"
            variant="h5"
            sx={{ display: "block", mt: 0.5 }}
          >
            {selected?.display_name}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {selected && (
            <Stack spacing={1.5} sx={{ pt: 0.5 }}>
              {actionError && <Alert severity="error">{actionError}</Alert>}
              {actionNotice && <Alert severity="success">{actionNotice}</Alert>}
              {selected.possible_duplicate && (
                <Alert severity="warning">
                  Another active request uses the same email address or phone
                  number. Confirm identity before contacting the customer.
                </Alert>
              )}
              {selected.intent_type === "purchase" &&
                [
                  "new",
                  "checkout_pending",
                  "checkout_expired",
                  "payment_failed",
                ].includes(selected.status) && (
                  <Alert severity="warning">
                    {selected.enrollment_stage === "email_verification_pending"
                      ? "Account created; email verification is pending. Follow up to help them finish the emailed verification link before taking payment."
                      : "Payment is incomplete. Call to help them finish signup or take payment by phone with their authorization. They remain in Growth until payment is verified."}
                  </Alert>
                )}
              <Box className="growth-record-details">
                <Box className="growth-contact-details">
                  <Typography component="h2" variant="h6">
                    Contact details
                  </Typography>
                  <Typography>
                    {selected.email_address || "No email address provided"}
                  </Typography>
                  <Typography color="text.secondary">
                    {selected.phone_number || "No phone number provided"}
                  </Typography>
                  {(selected.preferred_contact_method ||
                    selected.preferred_contact_time) && (
                    <Typography color="text.secondary">
                      Preferred contact:{" "}
                      {selected.preferred_contact_method ||
                        "No method preference"}
                      {selected.preferred_contact_time
                        ? ` · ${selected.preferred_contact_time}`
                        : ""}
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    Path:{" "}
                    {selected.intent_type === "purchase"
                      ? "Self-service purchase"
                      : "Contact before payment"}
                  </Typography>
                </Box>
                <Box className="growth-membership-details">
                  <Typography component="h2" variant="h6">
                    Selected membership
                  </Typography>
                  <Typography component="h3" variant="h6">
                    {selected.selected_terms.package_name}
                  </Typography>
                  <Typography color="text.secondary">
                    {subscriptionMoney(
                      selected.selected_terms.total ||
                        selected.selected_terms.amount,
                      selected.selected_terms.currency,
                    )}
                  </Typography>
                </Box>
              </Box>
              {selected.intent_type === "purchase" &&
                selected.follow_up_state !== "not_required" && (
                  <Paper
                    className="growth-call-workflow"
                    variant="outlined"
                    sx={{ p: 2 }}
                  >
                    <Typography component="h2" variant="h6">
                      Signup follow-up
                    </Typography>
                    <Typography component="h3" variant="h6">
                      {selected.follow_up_state === "in_progress"
                        ? "Signup call in progress"
                        : selected.follow_up_state === "waiting"
                          ? "Follow-up required"
                          : selected.follow_up_state === "completed"
                            ? "Follow-up complete"
                            : "Signup call required"}
                    </Typography>
                    <Typography color="text.secondary" variant="body2">
                      {selected.follow_up_attempt_count} call attempt
                      {selected.follow_up_attempt_count === 1 ? "" : "s"}
                      {selected.follow_up_due_at
                        ? ` · Follow up ${dateTime(selected.follow_up_due_at)}`
                        : ""}
                    </Typography>
                    {selected.follow_up_state === "in_progress" && (
                      <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                        >
                          {selected.phone_number && (
                            <Button
                              component="a"
                              href={`tel:${selected.phone_number}`}
                              variant="outlined"
                            >
                              Call customer
                            </Button>
                          )}
                          {!selected.phone_number && selected.email_address && (
                            <Button
                              component="a"
                              href={`mailto:${selected.email_address}`}
                              variant="outlined"
                            >
                              Email customer
                            </Button>
                          )}
                        </Stack>
                        {selected.enrollment_stage !==
                          "email_verification_pending" && (
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1.5}
                            sx={{
                              alignItems: { sm: "center" },
                              flexWrap: "wrap",
                              gap: 1.5,
                            }}
                          >
                            <FormControlLabel
                              sx={{ flex: "1 1 300px", m: 0 }}
                              control={
                                <Checkbox
                                  checked={recurringAuthorization}
                                  onChange={(event) =>
                                    setRecurringAuthorization(
                                      event.target.checked,
                                    )
                                  }
                                />
                              }
                              label={`I confirmed the caller authorizes ${subscriptionMoney(
                                selected.selected_terms.total ||
                                  selected.selected_terms.amount,
                                selected.selected_terms.currency,
                              )} monthly until canceled and explained the cancellation terms.`}
                            />
                            <Button
                              disabled={actionBusy || !recurringAuthorization}
                              onClick={() => void startPhonePayment()}
                              variant="contained"
                              sx={{
                                flexShrink: 0,
                                maxWidth: "100%",
                                alignSelf: { xs: "stretch", sm: "center" },
                              }}
                            >
                              Take recurring payment by phone
                            </Button>
                          </Stack>
                        )}
                      </Stack>
                    )}
                  </Paper>
                )}
              {selected.staff_payment_status === "awaiting_card" && (
                <Alert severity="info">
                  Enter the caller’s card number, security code, expiration
                  date, and postal code on the assigned Stripe reader. Meta
                  Clinic does not receive or store the card details.
                </Alert>
              )}
              {selected.staff_payment_status === "payment_processing" && (
                <Alert severity="warning">
                  Stripe is processing the first recurring payment. This person
                  remains a prospective patient until payment is verified.
                </Alert>
              )}
              {selected.paid_at && (
                <Alert
                  severity={selected.receipt_sent_at ? "success" : "warning"}
                >
                  Payment confirmed {dateTime(selected.paid_at)}. Receipt{" "}
                  {selected.receipt_id}{" "}
                  {selected.receipt_sent_at
                    ? "was emailed with the portal link."
                    : "is awaiting email delivery."}
                </Alert>
              )}
              {selected.relationship_stage === "patient" &&
                selected.patient_id && (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button
                      href={`/clinic/patients/${selected.patient_id}`}
                      variant="outlined"
                    >
                      Open patient chart
                    </Button>
                    <Button href="/clinic/work" variant="outlined">
                      Open Patient Flow
                    </Button>
                  </Stack>
                )}
              <Typography variant="body2" color="text.secondary">
                Submitted {dateTime(selected.created_at)} ·{" "}
                {enrollmentLabel(selected)}
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions className="growth-dialog-actions">
          <Button
            className="growth-dialog-close"
            variant="outlined"
            disabled={actionBusy}
            onClick={() => {
              setSelected(null);
              setRecurringAuthorization(false);
            }}
          >
            Close
          </Button>
          {selected && resource.data?.capabilities.review && (
            <>
              {selected.intent_type === "outreach" &&
                selected.status === "new" && (
                  <Button
                    disabled={actionBusy}
                    variant="contained"
                    onClick={() => void performAction("contacted")}
                  >
                    Mark contacted
                  </Button>
                )}
              {selected.intent_type === "outreach" &&
                selected.status === "contacted" && (
                  <Button
                    disabled={actionBusy}
                    variant="contained"
                    onClick={() => void performAction("qualify")}
                  >
                    Qualify
                  </Button>
                )}
              {selected.intent_type === "purchase" &&
                [
                  "new",
                  "checkout_pending",
                  "checkout_expired",
                  "payment_failed",
                ].includes(selected.status) &&
                ["open", "waiting"].includes(selected.follow_up_state) && (
                  <Button
                    disabled={actionBusy}
                    onClick={() => void performAction("begin_call")}
                    variant="contained"
                  >
                    Start signup call
                  </Button>
                )}
              {selected.intent_type === "purchase" &&
                selected.follow_up_state === "in_progress" && (
                  <>
                    <Button
                      disabled={actionBusy}
                      onClick={() => void performAction("no_answer")}
                    >
                      No answer
                    </Button>
                    <Button
                      disabled={actionBusy}
                      onClick={() => void performAction("callback_requested")}
                    >
                      Callback requested
                    </Button>
                    <Button
                      color="error"
                      disabled={actionBusy}
                      onClick={() => void performAction("not_interested")}
                    >
                      Not interested
                    </Button>
                  </>
                )}
              {selected.intent_type === "outreach" &&
                ["new", "contacted", "qualified"].includes(selected.status) && (
                  <Button
                    color="error"
                    disabled={actionBusy}
                    onClick={() => void performAction("decline")}
                  >
                    Decline
                  </Button>
                )}
              {selected.intent_type === "purchase" &&
                ["awaiting_card", "payment_processing"].includes(
                  selected.staff_payment_status || "",
                ) && (
                  <Button
                    disabled={actionBusy}
                    onClick={() => void refreshPhonePayment()}
                    variant="contained"
                  >
                    Check payment status
                  </Button>
                )}
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
