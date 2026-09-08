import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  ThemeProvider,
  Typography,
} from "@mui/material";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import type {
  DevelopmentAccount,
  PatientPortalContext,
  RuntimeEnvironment,
  User,
} from "../../api/contracts";
import { api } from "../../api/client";
import { useResource } from "../../shared/ui";
import { PatientSubscriptions } from "./PatientSubscriptions";
import {
  PatientAppointmentRequests,
  type UpcomingAppointment,
} from "./PatientAppointmentRequests";
import { AfterVisitInstructions } from "./AfterVisitInstructions";
import {
  patientPortalLabel,
  patientPortalReferenceLabel,
} from "./patientPortalLabels";
import { patientPortalTheme } from "./patientPortalTheme";
import { subscriptionMoney } from "../clinic/subscriptions/contracts";
import {
  clearInvoicePaymentReturnMarker,
  InvoiceCheckoutControls,
  invoicePaymentReturnMarker,
} from "../clinic/InvoiceCheckoutControls";

type PortalSection = "home" | "appointments" | "billing" | "settings";

const sectionHashes: Record<PortalSection, string> = {
  home: "home",
  appointments: "appointments",
  billing: "billing",
  settings: "settings",
};

function sectionFromLocation(): PortalSection {
  if (typeof window === "undefined") return "home";
  const search = new URLSearchParams(window.location.search);
  if (search.has("invoice_payment")) return "billing";
  if (search.has("stripe_payment")) return "settings";
  const hash = window.location.hash.slice(1);
  if (hash === "appointments" || hash.startsWith("appointment-"))
    return "appointments";
  if (hash === "billing" || hash === "memberships") return "billing";
  if (["settings", "my-memberships"].includes(hash)) return "settings";
  if (hash === "home" || hash === "visit-instructions") return "home";
  if (
    window.location.pathname.replace(/\/$/, "") === "/patient-portal/settings"
  )
    return "settings";
  return "home";
}

function planPickerFromLocation() {
  if (typeof window === "undefined") return false;
  const search = new URLSearchParams(window.location.search);
  return (
    !search.has("stripe_payment") &&
    !search.has("invoice_payment") &&
    window.location.hash === "#memberships"
  );
}

function appointmentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Date not available";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function appointmentTime(start: string, end: string) {
  const startsAt = new Date(start);
  const endsAt = new Date(end);
  if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf()))
    return "Time not available";
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(startsAt)} – ${formatter.format(endsAt)}`;
}

function PortalPageHeader({
  section,
  title,
  description,
}: {
  section: PortalSection;
  title: string;
  description: string;
}) {
  return (
    <Box sx={{ mb: { xs: 3, sm: 4 } }}>
      <Typography
        id={`${section}-heading`}
        component="h1"
        variant="h1"
        tabIndex={-1}
        sx={{ outline: "none" }}
      >
        {title}
      </Typography>
      <Typography
        color="text.secondary"
        sx={{ mt: 1, maxWidth: 680, fontSize: 16 }}
      >
        {description}
      </Typography>
    </Box>
  );
}

function SectionPanel({
  active,
  labelledBy,
  children,
}: {
  active: boolean;
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    <Box hidden={!active} aria-labelledby={labelledBy}>
      {children}
    </Box>
  );
}

export function PatientPortal({
  user,
}: {
  user?: User;
  developmentAccounts?: DevelopmentAccount[];
  environment?: RuntimeEnvironment;
  businessDate?: string;
}) {
  const resource = useResource<PatientPortalContext>(
    "/api/patient_portal/context",
  );
  const [activeSection, setActiveSection] =
    useState<PortalSection>(sectionFromLocation);
  const [showPlanPicker, setShowPlanPicker] = useState(planPickerFromLocation);
  const [catalogTarget, setCatalogTarget] = useState<Element | null>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<
    UpcomingAppointment[] | null
  >(null);
  const [upcomingAppointmentsError, setUpcomingAppointmentsError] =
    useState("");
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [checkoutReturn, setCheckoutReturn] = useState(() =>
    invoicePaymentReturnMarker(),
  );
  const [checkoutReturnError, setCheckoutReturnError] = useState("");
  const [checkoutReturnNotice, setCheckoutReturnNotice] = useState("");
  const [checkingCheckoutReturn, setCheckingCheckoutReturn] = useState(false);
  const [checkoutReturnRetry, setCheckoutReturnRetry] = useState(0);
  const checkoutReturnHandled = useRef(false);
  const context = resource.data;
  const patientReference = context
    ? patientPortalReferenceLabel(context.patient.reference)
    : null;

  useEffect(() => {
    const syncSection = () => {
      setActiveSection(sectionFromLocation());
      setShowPlanPicker(planPickerFromLocation());
    };
    window.addEventListener("hashchange", syncSection);
    window.addEventListener("popstate", syncSection);
    return () => {
      window.removeEventListener("hashchange", syncSection);
      window.removeEventListener("popstate", syncSection);
    };
  }, []);

  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (!target) return;
    const timeout = window.setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ block: "start" });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeSection, catalogTarget, context, upcomingAppointments]);

  useEffect(() => {
    if (!checkoutReturn || !context || checkoutReturnHandled.current) return;
    checkoutReturnHandled.current = true;
    const pending = context.billing.invoices.filter((invoice) =>
      ["processing", "needs_reconciliation"].includes(
        invoice.online_payment.state,
      ),
    );
    setCheckingCheckoutReturn(true);
    setCheckoutReturnError("");
    Promise.allSettled(
      pending.map((invoice) =>
        api(
          `/api/patient_portal/invoices/${invoice.id}/online_payment/reconcile`,
          { method: "POST" },
        ),
      ),
    )
      .then((results) => {
        if (results.some((result) => result.status === "rejected")) {
          setCheckoutReturnError(
            "Payment status could not be refreshed. Retry before choosing another payment method.",
          );
          return;
        }
        resource.refresh();
        setCheckoutReturnNotice(
          checkoutReturn === "cancel"
            ? "You returned from checkout. Review the refreshed invoice status before continuing or cancelling."
            : "Payment status was refreshed. A return from Stripe does not confirm payment by itself.",
        );
        clearInvoicePaymentReturnMarker();
        setCheckoutReturn(null);
      })
      .finally(() => setCheckingCheckoutReturn(false));
  }, [checkoutReturn, checkoutReturnRetry, context]);

  const retryCheckoutReturn = () => {
    checkoutReturnHandled.current = false;
    setCheckoutReturnRetry((value) => value + 1);
  };

  const navigateTo = (
    section: PortalSection,
    target = sectionHashes[section],
  ) => {
    const nextUrl = `/patient-portal${window.location.search}#${target}`;
    window.history.pushState(window.history.state, "", nextUrl);
    setActiveSection(section);
    setShowPlanPicker(section === "billing" && target === "memberships");
    window.setTimeout(() => {
      const destination = document.getElementById(target);
      destination?.scrollIntoView({ block: "start" });
      if (target === sectionHashes[section])
        document.getElementById(`${section}-heading`)?.focus();
    }, 0);
  };

  const signOut = async () => {
    setSigningOut(true);
    setError("");
    try {
      await api("/api/session", { method: "DELETE" });
      window.location.assign("/login");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to sign out.",
      );
      setSigningOut(false);
    }
  };

  const navItems: Array<{
    section: PortalSection;
    label: string;
    icon: ReactNode;
  }> = [
    { section: "home", label: "Home", icon: <HomeOutlinedIcon /> },
    {
      section: "appointments",
      label: "Appointments",
      icon: <CalendarMonthOutlinedIcon />,
    },
    {
      section: "billing",
      label: "Billing",
      icon: <ReceiptLongOutlinedIcon />,
    },
    {
      section: "settings",
      label: "Settings",
      icon: <SettingsOutlinedIcon />,
    },
  ];
  const nextAppointment = upcomingAppointments?.[0];

  return (
    <ThemeProvider theme={patientPortalTheme}>
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          color: "text.primary",
          "& ::selection": { bgcolor: "#cddfc9", color: "#17392d" },
          "& a:focus-visible, & button:focus-visible, & [tabindex]:focus-visible":
            {
              outline: "3px solid #9b5b24",
              outlineOffset: 3,
            },
        }}
      >
        <Box
          component="aside"
          sx={{
            display: { xs: "none", sm: "flex" },
            position: "fixed",
            inset: "0 auto 0 0",
            width: 240,
            flexDirection: "column",
            bgcolor: "#eef2e9",
            borderRight: "1px solid",
            borderColor: "divider",
            zIndex: 10,
          }}
        >
          <Box sx={{ px: 3, pt: 4, pb: 3 }}>
            <Typography
              sx={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 22,
                lineHeight: 1.25,
                overflowWrap: "anywhere",
              }}
            >
              {context?.practice.name || "Your clinic"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Patient portal
            </Typography>
          </Box>
          <Divider />
          <List
            component="nav"
            aria-label="Patient portal"
            sx={{ px: 1.5, py: 2 }}
          >
            {navItems.map((item) => (
              <ListItemButton
                key={item.section}
                selected={activeSection === item.section}
                aria-current={
                  activeSection === item.section ? "page" : undefined
                }
                onClick={() => navigateTo(item.section)}
                sx={{
                  minHeight: 48,
                  mb: 0.5,
                  borderRadius: 1.5,
                  color: "text.secondary",
                  "&.Mui-selected": {
                    bgcolor: "action.selected",
                    color: "primary.dark",
                  },
                  "&.Mui-selected:hover": { bgcolor: "action.selected" },
                }}
              >
                <ListItemIcon sx={{ minWidth: 38, color: "inherit" }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  slotProps={{ primary: { sx: { fontWeight: 650 } } }}
                />
              </ListItemButton>
            ))}
          </List>
          <Box
            sx={{
              mt: "auto",
              p: 3,
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography sx={{ fontWeight: 650, overflowWrap: "anywhere" }}>
              {context
                ? patientPortalLabel(context.patient.display_name)
                : "Your account"}
            </Typography>
            {context && patientReference && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.25 }}
              >
                Patient reference {patientReference}
              </Typography>
            )}
          </Box>
        </Box>

        <Box
          component="main"
          id="main"
          sx={{
            minHeight: "100vh",
            ml: { xs: 0, sm: "240px" },
            px: { xs: 2, sm: 4, lg: 6 },
            pt: { xs: 3, sm: 5 },
            pb: {
              xs: "calc(96px + env(safe-area-inset-bottom, 0px))",
              sm: 6,
            },
          }}
        >
          <Box sx={{ width: "100%", maxWidth: 1040, mx: "auto" }}>
            {!context && !resource.error && (
              <Stack
                direction="row"
                spacing={1.5}
                role="status"
                sx={{ alignItems: "center" }}
              >
                <CircularProgress size={22} />
                <Typography>Loading your patient portal…</Typography>
              </Stack>
            )}
            {resource.error && (
              <Alert
                severity="error"
                sx={{ mb: 3 }}
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={resource.refresh}
                  >
                    Retry
                  </Button>
                }
              >
                Your patient portal could not be loaded. {resource.error}
              </Alert>
            )}
            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}
            {checkingCheckoutReturn && (
              <Alert severity="info" role="status" sx={{ mb: 3 }}>
                Checking payment status… A return from Stripe does not confirm
                that a payment was completed.
              </Alert>
            )}
            {checkoutReturnError && (
              <Alert
                severity="error"
                sx={{ mb: 3 }}
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={retryCheckoutReturn}
                  >
                    Retry
                  </Button>
                }
              >
                {checkoutReturnError}
              </Alert>
            )}
            {checkoutReturnNotice && (
              <Alert severity="info" sx={{ mb: 3 }}>
                {checkoutReturnNotice}
              </Alert>
            )}

            {context && (
              <>
                <SectionPanel
                  active={activeSection === "home"}
                  labelledBy="home-heading"
                >
                  <Box id="home" sx={{ scrollMarginTop: 24 }}>
                    <PortalPageHeader
                      section="home"
                      title={`Welcome, ${patientPortalLabel(context.patient.display_name)}`}
                      description="See what is coming next and return to the instructions your clinic has shared with you."
                    />
                    <Stack spacing={{ xs: 3, sm: 4 }}>
                      <Paper
                        component="section"
                        variant="outlined"
                        aria-labelledby="next-appointment-heading"
                        sx={{
                          p: { xs: 2.5, sm: 3.5 },
                          borderColor: "#cbd8cc",
                        }}
                      >
                        <Typography
                          id="next-appointment-heading"
                          component="h2"
                          variant="h2"
                        >
                          Next appointment
                        </Typography>
                        {upcomingAppointments === null &&
                          !upcomingAppointmentsError && (
                            <Stack
                              direction="row"
                              spacing={1.5}
                              role="status"
                              sx={{ alignItems: "center", mt: 2 }}
                            >
                              <CircularProgress size={20} />
                              <Typography color="text.secondary">
                                Loading your next appointment…
                              </Typography>
                            </Stack>
                          )}
                        {upcomingAppointmentsError && (
                          <Alert
                            severity="error"
                            sx={{ mt: 2 }}
                            action={
                              <Button
                                color="inherit"
                                size="small"
                                onClick={() => navigateTo("appointments")}
                              >
                                Open appointments
                              </Button>
                            }
                          >
                            Your next appointment could not be loaded.{" "}
                            {upcomingAppointmentsError}
                          </Alert>
                        )}
                        {!upcomingAppointmentsError &&
                          upcomingAppointments?.length === 0 && (
                            <Stack spacing={2} sx={{ mt: 2 }}>
                              <Typography color="text.secondary">
                                You do not have an upcoming appointment.
                              </Typography>
                              <Button
                                variant="contained"
                                onClick={() => navigateTo("appointments")}
                                sx={{ alignSelf: "flex-start" }}
                              >
                                Request an appointment
                              </Button>
                            </Stack>
                          )}
                        {!upcomingAppointmentsError && nextAppointment && (
                          <Stack spacing={2.5} sx={{ mt: 2 }}>
                            <Box>
                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                sx={{
                                  gap: 1,
                                  alignItems: { sm: "center" },
                                  justifyContent: "space-between",
                                }}
                              >
                                <Typography
                                  sx={{ fontSize: 20, fontWeight: 700 }}
                                >
                                  {appointmentDate(nextAppointment.starts_at)}
                                </Typography>
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={
                                    nextAppointment.status === "confirmed"
                                      ? "Confirmed"
                                      : "Scheduled"
                                  }
                                  sx={{
                                    alignSelf: {
                                      xs: "flex-start",
                                      sm: "center",
                                    },
                                  }}
                                />
                              </Stack>
                              <Typography sx={{ mt: 0.5, fontWeight: 650 }}>
                                {appointmentTime(
                                  nextAppointment.starts_at,
                                  nextAppointment.ends_at,
                                )}
                              </Typography>
                              <Typography
                                color="text.secondary"
                                sx={{ mt: 0.5 }}
                              >
                                {nextAppointment.site?.name ||
                                  nextAppointment.site?.code ||
                                  "Location not recorded"}
                                {nextAppointment.room
                                  ? ` · Room ${nextAppointment.room.code}`
                                  : ""}
                                {nextAppointment.visit_type
                                  ? ` · ${nextAppointment.visit_type.code}`
                                  : ""}
                                {nextAppointment.clinician
                                  ? ` · ${nextAppointment.clinician.display_name}`
                                  : ""}
                              </Typography>
                            </Box>
                            <Stack
                              direction={{ xs: "column", sm: "row" }}
                              spacing={1.5}
                            >
                              <Button
                                variant="contained"
                                onClick={() =>
                                  navigateTo(
                                    "appointments",
                                    `appointment-${nextAppointment.id}`,
                                  )
                                }
                              >
                                View appointment
                              </Button>
                              <Button
                                variant="outlined"
                                onClick={() =>
                                  navigateTo("home", "visit-instructions")
                                }
                              >
                                View visit instructions
                              </Button>
                            </Stack>
                          </Stack>
                        )}
                      </Paper>
                      <AfterVisitInstructions
                        key={`instructions-${context.patient.id}`}
                        patientId={context.patient.id}
                        timezone={context.practice.timezone}
                      />
                    </Stack>
                  </Box>
                </SectionPanel>

                <SectionPanel
                  active={activeSection === "appointments"}
                  labelledBy="appointments-heading"
                >
                  <Box id="appointments" sx={{ scrollMarginTop: 24 }}>
                    <PortalPageHeader
                      section="appointments"
                      title="Appointments"
                      description="Review upcoming visits, confirm when available, share a pre-visit note, or ask the clinic to book or change an appointment."
                    />
                    <PatientAppointmentRequests
                      key={`appointments-${context.patient.id}`}
                      hideHeader
                      onUpcomingAppointments={setUpcomingAppointments}
                      onUpcomingAppointmentsError={setUpcomingAppointmentsError}
                    />
                  </Box>
                </SectionPanel>

                <SectionPanel
                  active={activeSection === "billing"}
                  labelledBy="billing-heading"
                >
                  <Box id="billing" sx={{ scrollMarginTop: 24 }}>
                    {showPlanPicker ? (
                      <>
                        <Button
                          onClick={() => navigateTo("billing")}
                          sx={{ mb: 2, px: 0 }}
                        >
                          Back to billing
                        </Button>
                        <PortalPageHeader
                          section="billing"
                          title="Membership plans"
                          description="Explore the plans available from your clinic. Joining a plan does not replace your current membership."
                        />
                        <Box ref={setCatalogTarget} />
                      </>
                    ) : (
                      <>
                        <PortalPageHeader
                          section="billing"
                          title="Billing"
                          description="Review balances, invoices, payment status, and recorded refunds from your clinic."
                        />
                        <Stack spacing={3}>
                          <Paper
                            component="section"
                            variant="outlined"
                            sx={{ p: { xs: 2.5, sm: 3.5 } }}
                          >
                            <Stack spacing={2}>
                              <Typography variant="h2" component="h2">
                                Current balance
                              </Typography>
                              {!context.balances.length && (
                                <Typography color="text.secondary">
                                  No billing activity is available yet.
                                </Typography>
                              )}
                              {context.balances.map((balance, index) => (
                                <Box
                                  key={balance.currency}
                                  sx={{
                                    pt: index ? 2 : 0,
                                    borderTop: index ? "1px solid" : 0,
                                    borderColor: "divider",
                                  }}
                                >
                                  <Typography
                                    sx={{
                                      fontSize: 22,
                                      fontWeight: 700,
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                  >
                                    {subscriptionMoney(
                                      balance.balance_amount,
                                      balance.currency,
                                    )}{" "}
                                    outstanding
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mt: 0.5 }}
                                  >
                                    Paid{" "}
                                    {subscriptionMoney(
                                      balance.allocated_amount,
                                      balance.currency,
                                    )}{" "}
                                    · Refunded{" "}
                                    {subscriptionMoney(
                                      balance.refunded_amount,
                                      balance.currency,
                                    )}
                                  </Typography>
                                </Box>
                              ))}
                            </Stack>
                          </Paper>

                          <Paper
                            component="section"
                            variant="outlined"
                            sx={{ p: { xs: 2.5, sm: 3.5 } }}
                          >
                            <Stack spacing={2.5}>
                              <Typography variant="h2" component="h2">
                                Billing history
                              </Typography>
                              {!context.billing.invoices.length && (
                                <Typography color="text.secondary">
                                  No invoices are available yet.
                                </Typography>
                              )}
                              {context.billing.invoices.map((invoice) => (
                                <Accordion
                                  key={invoice.id}
                                  variant="outlined"
                                  disableGutters
                                >
                                  <AccordionSummary
                                    expandIcon={<ExpandMoreIcon />}
                                  >
                                    <Box sx={{ minWidth: 0, pr: 1 }}>
                                      <Typography sx={{ fontWeight: 650 }}>
                                        Invoice #{invoice.id} ·{" "}
                                        {invoice.status.replaceAll("_", " ")}
                                      </Typography>
                                      <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ mt: 0.25 }}
                                      >
                                        {subscriptionMoney(
                                          invoice.balance_amount,
                                          invoice.currency,
                                        )}{" "}
                                        due
                                      </Typography>
                                    </Box>
                                  </AccordionSummary>
                                  <AccordionDetails>
                                    <Stack spacing={1.5}>
                                      {invoice.lines.map((line) => (
                                        <Stack
                                          key={line.id}
                                          direction="row"
                                          sx={{
                                            justifyContent: "space-between",
                                            gap: 2,
                                          }}
                                        >
                                          <Typography>
                                            {patientPortalLabel(
                                              line.description,
                                            )}
                                          </Typography>
                                          <Typography
                                            sx={{
                                              fontVariantNumeric:
                                                "tabular-nums",
                                              whiteSpace: "nowrap",
                                            }}
                                          >
                                            {subscriptionMoney(
                                              line.posted_amount,
                                              invoice.currency,
                                            )}
                                          </Typography>
                                        </Stack>
                                      ))}
                                      <Divider />
                                      <Typography
                                        variant="body2"
                                        color="text.secondary"
                                      >
                                        Total{" "}
                                        {subscriptionMoney(
                                          invoice.total_amount,
                                          invoice.currency,
                                        )}{" "}
                                        · Allocated{" "}
                                        {subscriptionMoney(
                                          invoice.allocated_amount,
                                          invoice.currency,
                                        )}{" "}
                                        · Credits{" "}
                                        {subscriptionMoney(
                                          invoice.credit_amount,
                                          invoice.currency,
                                        )}
                                      </Typography>
                                      <InvoiceCheckoutControls
                                        key={invoice.id}
                                        onlinePayment={invoice.online_payment}
                                        endpoint={`/api/patient_portal/invoices/${invoice.id}/online_payment`}
                                        actionLabel="Pay securely"
                                        actionsEnabled={
                                          context.capabilities
                                            .payment_collection
                                        }
                                        onChanged={resource.refresh}
                                      />
                                    </Stack>
                                  </AccordionDetails>
                                </Accordion>
                              ))}

                              <Divider />
                              <Typography variant="h5" component="h2">
                                Payments and refunds
                              </Typography>
                              {!context.billing.payments.length && (
                                <Typography color="text.secondary">
                                  No payments are recorded.
                                </Typography>
                              )}
                              {context.billing.payments.map(
                                (payment, index) => (
                                  <Box
                                    key={payment.id}
                                    sx={{
                                      pt: index ? 2 : 0,
                                      borderTop: index ? "1px solid" : 0,
                                      borderColor: "divider",
                                    }}
                                  >
                                    <Typography sx={{ fontWeight: 650 }}>
                                      Payment #{payment.id} ·{" "}
                                      {subscriptionMoney(
                                        payment.amount,
                                        payment.currency,
                                      )}
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                    >
                                      {new Date(
                                        payment.created_at,
                                      ).toLocaleDateString()}
                                    </Typography>
                                    {payment.refunds.map((refund) => (
                                      <Typography
                                        key={refund.id}
                                        variant="body2"
                                        sx={{ mt: 0.75 }}
                                      >
                                        Refund #{refund.id} ·{" "}
                                        {subscriptionMoney(
                                          refund.amount,
                                          payment.currency,
                                        )}{" "}
                                        ·{" "}
                                        {new Date(
                                          refund.created_at,
                                        ).toLocaleDateString()}
                                      </Typography>
                                    ))}
                                  </Box>
                                ),
                              )}
                            </Stack>
                          </Paper>
                          <Box
                            component="section"
                            sx={{
                              pt: 1,
                              borderTop: "1px solid",
                              borderColor: "divider",
                            }}
                          >
                            <Typography variant="h2" component="h2">
                              Membership plans
                            </Typography>
                            <Typography
                              color="text.secondary"
                              sx={{ mt: 1, maxWidth: 680 }}
                            >
                              Explore your clinic’s plans. Joining a plan does
                              not replace your current membership.
                            </Typography>
                            <Button
                              variant="outlined"
                              onClick={() =>
                                navigateTo("billing", "memberships")
                              }
                              sx={{ mt: 2 }}
                            >
                              View membership plans
                            </Button>
                          </Box>
                        </Stack>
                      </>
                    )}
                  </Box>
                </SectionPanel>

                <SectionPanel
                  active={activeSection === "settings"}
                  labelledBy="settings-heading"
                >
                  <Box id="settings" sx={{ scrollMarginTop: 24 }}>
                    <PortalPageHeader
                      section="settings"
                      title="Settings"
                      description="Review your portal account and manage your clinic membership."
                    />
                    <Stack spacing={{ xs: 3, sm: 4 }}>
                      <Paper
                        component="section"
                        variant="outlined"
                        sx={{ p: { xs: 2.5, sm: 3.5 } }}
                      >
                        <Stack spacing={2.5}>
                          <Typography variant="h2" component="h2">
                            Account
                          </Typography>
                          <Box>
                            <Typography sx={{ fontWeight: 650 }}>
                              {patientPortalLabel(context.patient.display_name)}
                            </Typography>
                            {patientReference && (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ mt: 0.25 }}
                              >
                                Patient reference {patientReference}
                              </Typography>
                            )}
                            <Typography variant="body2" color="text.secondary">
                              {context.practice.name}
                            </Typography>
                          </Box>
                          {user && (
                            <Button
                              variant="outlined"
                              startIcon={<LogoutOutlinedIcon />}
                              disabled={signingOut}
                              onClick={() => void signOut()}
                              sx={{ alignSelf: "flex-start" }}
                            >
                              {signingOut ? "Signing out…" : "Sign out"}
                            </Button>
                          )}
                        </Stack>
                      </Paper>

                      <Box
                        component="section"
                        id="my-memberships"
                        aria-labelledby="membership-heading"
                        sx={{ pt: 1, scrollMarginTop: 24 }}
                      >
                        <Typography
                          id="membership-heading"
                          variant="h2"
                          component="h2"
                        >
                          Membership
                        </Typography>
                        <Typography
                          color="text.secondary"
                          sx={{ mt: 1, mb: 3, maxWidth: 680 }}
                        >
                          Review your selected plan, billing details, and
                          available management actions.
                        </Typography>
                        <PatientSubscriptions
                          key={`subscriptions-${context.patient.id}`}
                          onChanged={resource.refresh}
                          catalogTarget={catalogTarget}
                        />
                      </Box>
                    </Stack>
                  </Box>
                </SectionPanel>
              </>
            )}
          </Box>
        </Box>

        <BottomNavigation
          component="nav"
          aria-label="Patient portal"
          value={activeSection}
          onChange={(_, value: PortalSection) => navigateTo(value)}
          showLabels
          sx={{
            display: { xs: "flex", sm: "none" },
            position: "fixed",
            inset: "auto 0 0 0",
            height: "calc(72px + env(safe-area-inset-bottom, 0px))",
            pb: "env(safe-area-inset-bottom, 0px)",
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            zIndex: 1200,
            "& .MuiBottomNavigationAction-root": {
              minWidth: 0,
              minHeight: 64,
              px: 0.5,
              color: "text.secondary",
            },
            "& .Mui-selected": { color: "primary.main" },
            "& .MuiBottomNavigationAction-label": {
              fontSize: 12,
              mt: 0.25,
              "&.Mui-selected": { fontSize: 12, fontWeight: 700 },
            },
          }}
        >
          {navItems.map((item) => (
            <BottomNavigationAction
              key={item.section}
              value={item.section}
              label={item.label}
              icon={item.icon}
              aria-current={activeSection === item.section ? "page" : undefined}
            />
          ))}
        </BottomNavigation>
      </Box>
    </ThemeProvider>
  );
}
