import { useEffect, useMemo, useState } from "react";
import {
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
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
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

const relationshipFilters = ["prospective_patient", "closed"] as const;
type RelationshipFilter = (typeof relationshipFilters)[number];

const relationshipLabels: Record<RelationshipFilter, string> = {
  prospective_patient: "Prospective patients",
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
  const [configurationBusy, setConfigurationBusy] = useState(false);
  const [configurationError, setConfigurationError] = useState("");
  const [configurationNotice, setConfigurationNotice] = useState("");

  const storefront = resource.data?.storefront;
  useEffect(() => {
    if (!storefront) return;
    setSlug(storefront.slug || "");
    setEnabled(storefront.enabled);
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
    enabled !== (storefront?.enabled || false);

  async function saveStorefront() {
    if (!canConfigure || configurationBusy || !slugValid) return;
    setConfigurationBusy(true);
    setConfigurationError("");
    setConfigurationNotice("");
    try {
      const result = await api<{ storefront: MembershipStorefront }>(
        "/api/clinic/membership_storefront",
        { method: "PATCH", body: { storefront: { slug, enabled } } },
      );
      setSlug(result.storefront.slug || "");
      setEnabled(result.storefront.enabled);
      setConfigurationNotice(
        result.storefront.enabled
          ? "Public membership page saved and enabled."
          : "Public membership page settings saved. The page is not public.",
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
    <Box component="main" sx={{ minWidth: 0 }}>
      <Stack spacing={3}>
        <Box>
          <Typography component="h1" variant="h4">
            Growth
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 820 }}>
            Follow up with people who requested contact or started a membership
            account. They stay in Growth until payment is verified, then move to
            patient onboarding.
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
              sx={{ p: { xs: 2, md: 3 } }}
            >
              <Stack spacing={2.5}>
                <Box>
                  <Typography component="h2" variant="h5">
                    Public membership page
                  </Typography>
                  <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    Customers can purchase an eligible package or request
                    contact before paying.
                  </Typography>
                </Box>
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
                    onChange={(event) =>
                      setSlug(
                        event.target.value.toLowerCase().replaceAll(" ", "-"),
                      )
                    }
                    sx={{ flex: "1 1 360px", maxWidth: 560 }}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={enabled}
                        disabled={!canConfigure || configurationBusy}
                        onChange={(_, checked) => setEnabled(checked)}
                      />
                    }
                    label="Public page enabled"
                  />
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <TextField
                    label="Saved public page address"
                    value={
                      resource.data.storefront.public_path ||
                      "No public address saved"
                    }
                    fullWidth
                    slotProps={{ input: { readOnly: true } }}
                    sx={{ maxWidth: 620 }}
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
            </Paper>

            <Paper
              component="section"
              variant="outlined"
              sx={{ overflow: "hidden" }}
            >
              <Box sx={{ p: { xs: 2, md: 3 }, pb: 1 }}>
                <Typography component="h2" variant="h5">
                  Membership pipeline
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  Account created → email verified → payment. Unpaid signups
                  stay here for follow-up. Verified payment moves them to the
                  patient flow with their existing login, receipt email, and
                  front-desk onboarding task. No second account invitation is
                  needed.
                </Typography>
              </Box>
              <Tabs
                value={filter}
                onChange={(_, value: PipelineFilter) => setFilter(value)}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
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
                <TableContainer>
                  <Table
                    sx={{ minWidth: 860 }}
                    aria-label="Membership pipeline"
                  >
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
                        <TableRow key={prospect.id} hover>
                          <TableCell>
                            <Typography sx={{ fontWeight: 650 }}>
                              {prospect.display_name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {prospect.email_address ||
                                "No email address provided"}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {prospect.intent_type === "purchase"
                              ? "Purchase now"
                              : "Contact first"}
                          </TableCell>
                          <TableCell>
                            {prospect.selected_terms.package_name}
                          </TableCell>
                          <TableCell>
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
                          <TableCell>{dateTime(prospect.created_at)}</TableCell>
                          <TableCell align="right">
                            <Button
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
            </Paper>
          </>
        )}
      </Stack>

      <Dialog
        open={Boolean(selected)}
        onClose={() => {
          if (!actionBusy) {
            setSelected(null);
            setRecurringAuthorization(false);
          }
        }}
        fullWidth
        maxWidth="md"
        aria-labelledby="membership-record-title"
      >
        <DialogTitle id="membership-record-title">
          Membership record
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
              <Box>
                <Typography component="h2" variant="h6">
                  {selected.display_name}
                </Typography>
                <Typography>
                  {selected.email_address || "No email address provided"}
                </Typography>
                <Typography color="text.secondary">
                  {selected.phone_number || "No phone number provided"}
                </Typography>
                {(selected.preferred_contact_method || selected.preferred_contact_time) && (
                  <Typography color="text.secondary">Preferred contact: {selected.preferred_contact_method || "No method preference"}
                    {selected.preferred_contact_time ? ` · ${selected.preferred_contact_time}` : ""}</Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  Path:{" "}
                  {selected.intent_type === "purchase"
                    ? "Self-service purchase"
                    : "Contact before payment"}
                </Typography>
              </Box>
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="overline">Selected membership</Typography>
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
              </Paper>
              {selected.intent_type === "purchase" &&
                selected.follow_up_state !== "not_required" && (
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <Typography variant="overline">
                      Worker enrollment workflow
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
                            sx={{ alignItems: { sm: "center" } }}
                          >
                            <FormControlLabel
                              sx={{ flex: 1, m: 0 }}
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
              <Typography variant="body2" color="text.secondary">
                Submitted {dateTime(selected.created_at)} ·{" "}
                {enrollmentLabel(selected)}
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button
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
                    onClick={() => void performAction("contacted")}
                  >
                    Mark contacted
                  </Button>
                )}
              {selected.intent_type === "outreach" &&
                selected.status === "contacted" && (
                  <Button
                    disabled={actionBusy}
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
