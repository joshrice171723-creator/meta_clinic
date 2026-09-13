import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Stack,
  TextField,
  ThemeProvider,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { MembershipCatalog } from "../patientPortal/MembershipCatalog";
import { PackageCard } from "../clinic/subscriptions/PackageCard";
import { membershipTheme } from "../clinic/subscriptions/membershipTheme";
import type { PublishedPackage } from "../clinic/subscriptions/contracts";
import type { PublicMembershipStorefrontResponse } from "./types";

type OutreachAcknowledgement = {
  inquiry: { status: "received"; replayed: boolean };
};

type CheckoutResponse = {
  checkout: { url: string; status: "checkout_pending"; replayed: boolean };
};

function selectionError(plan: PublishedPackage, selections: number[]) {
  const groups = [
    ...new Set(
      plan.terms.components
        .filter((component) => component.mode.startsWith("choose_"))
        .map((component) => component.group),
    ),
  ];
  for (const group of groups) {
    const rule = plan.terms.components.find(
      (component) =>
        component.group === group && component.mode.startsWith("choose_"),
    );
    if (!rule) continue;
    const count = plan.terms.components.filter(
      (component) =>
        component.group === group && selections.includes(component.service_id),
    ).length;
    if (count < rule.min || count > rule.max) {
      const requirement =
        rule.min === rule.max ? String(rule.min) : `${rule.min}–${rule.max}`;
      return `Choose ${requirement} option${rule.max === 1 ? "" : "s"} for ${group || "this membership group"}.`;
    }
  }
  return "";
}

export function PublicMembershipStorefront({ slug }: { slug: string }) {
  const endpoint = `/api/public/membership_storefronts/${encodeURIComponent(slug)}`;
  const resource = useResource<PublicMembershipStorefrontResponse>(endpoint);
  const phone = useMediaQuery(membershipTheme.breakpoints.down("sm"));
  const [selected, setSelected] = useState<PublishedPackage | null>(null);
  const [selections, setSelections] = useState<number[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [outreachConsent, setOutreachConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outreachAcknowledged, setOutreachAcknowledged] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  const paymentOutcome =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("payment");

  const optionError = useMemo(
    () => (selected ? selectionError(selected, selections) : ""),
    [selected, selections],
  );

  useEffect(() => {
    if (!resource.data) return;
    const previousTitle = document.title;
    document.title = `${resource.data.practice.name} memberships`;
    return () => {
      document.title = previousTitle;
    };
  }, [resource.data]);

  function changeIntent(change: () => void) {
    change();
    requestKey.current = crypto.randomUUID();
    setError("");
  }

  function choosePlan(plan: PublishedPackage) {
    setSelected(plan);
    setSelections([]);
    setOutreachAcknowledged(false);
    setError("");
    requestKey.current = crypto.randomUUID();
  }

  function closeDialog() {
    if (busy) return;
    setSelected(null);
    setSelections([]);
    setOutreachAcknowledged(false);
    setError("");
  }

  async function submit(intent: "outreach" | "purchase") {
    if (!selected || busy) return;
    const optionsMessage = selectionError(selected, selections);
    if (optionsMessage) {
      setError(optionsMessage);
      return;
    }
    if (!outreachConsent) {
      setError("Confirm that the clinic may contact you about this request.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const path = intent === "purchase" ? "checkouts" : "prospects";
      const result = await api<OutreachAcknowledgement | CheckoutResponse>(
        `${endpoint}/${path}`,
        {
          method: "POST",
          body: {
            [intent === "purchase" ? "checkout" : "prospect"]: {
              version_id: selected.id,
              selections,
              display_name: displayName.trim(),
              email_address: emailAddress.trim(),
              phone_number: phoneNumber.trim() || null,
              outreach_consent: true,
              source: "membership_storefront",
              request_key: requestKey.current,
            },
          },
        },
      );
      if ("checkout" in result) {
        window.location.assign(result.checkout.url);
      } else {
        setOutreachAcknowledged(true);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your request could not be confirmed. Check your details and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemeProvider theme={membershipTheme}>
      <Box
        component="main"
        aria-label={`${resource.data?.practice.name || "Clinic"} memberships`}
        sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          color: "text.primary",
          px: { xs: 2, sm: 3, md: 5 },
          py: { xs: 3, md: 5 },
        }}
      >
        {!resource.data && <LoadState error={resource.error} />}
        {resource.data && (
          <Stack spacing={4} sx={{ width: "100%", maxWidth: 1200, mx: "auto" }}>
            <Box component="header">
              <Typography sx={{ fontWeight: 700, fontSize: 18 }}>
                {resource.data.practice.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Memberships offered by this clinic
              </Typography>
            </Box>
            <Box
              component="section"
              sx={{
                bgcolor: "#203f34",
                color: "#f6f7ed",
                borderRadius: 3,
                px: { xs: 2.5, sm: 4, md: 6 },
                py: { xs: 4, md: 5 },
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1.15fr 0.85fr" },
                gap: { xs: 2.5, md: 5 },
                alignItems: "center",
              }}
            >
              <Typography
                component="h1"
                sx={{
                  fontFamily: "Georgia, serif",
                  fontSize: { xs: 38, sm: 52, md: 60 },
                  lineHeight: 1.08,
                  letterSpacing: "-0.04em",
                }}
              >
                Membership care from {resource.data.practice.name}
              </Typography>
              <Box>
                <Typography
                  sx={{ color: "#e0e8de", fontSize: 18, lineHeight: 1.6 }}
                >
                  Compare this clinic’s published memberships, choose the
                  services that fit you, purchase online, or ask the clinic to
                  contact you before you decide.
                </Typography>
                <Button
                  href="#memberships"
                  variant="contained"
                  size="large"
                  sx={{
                    mt: 3,
                    bgcolor: "#d9e6b8",
                    color: "#203f34",
                    "&:hover": { bgcolor: "#e7efd1" },
                  }}
                >
                  Explore memberships
                </Button>
              </Box>
            </Box>
            {paymentOutcome === "return" && (
              <Alert severity="success">
                Your payment is being verified. Once confirmed, you will receive
                a receipt and patient portal link by email, and the clinic will
                begin onboarding.
              </Alert>
            )}
            {paymentOutcome === "cancel" && (
              <Alert severity="info">
                Checkout was canceled. You were not placed into paid onboarding.
                You may try again or ask the clinic to contact you.
              </Alert>
            )}
            <Alert severity="info">
              This page belongs to {resource.data.practice.name}. You can
              purchase an eligible membership now or request clinic contact
              before paying.
            </Alert>
            {!resource.data.payment.checkout_available && (
              <Alert severity="warning">
                Online checkout is temporarily unavailable. You can still ask
                the clinic to contact you.
              </Alert>
            )}
            <MembershipCatalog
              catalog={resource.data.catalog}
              busy={busy}
              canPurchase
              onChoose={choosePlan}
            />
          </Stack>
        )}

        <Dialog
          open={Boolean(selected)}
          onClose={closeDialog}
          maxWidth="md"
          fullWidth
          fullScreen={phone}
          aria-labelledby="membership-interest-title"
        >
          <DialogTitle id="membership-interest-title">
            {outreachAcknowledged
              ? "Request received"
              : "Choose how to continue"}
          </DialogTitle>
          <DialogContent>
            {outreachAcknowledged ? (
              <Alert severity="success" sx={{ mt: 1 }}>
                Your request was sent to{" "}
                {resource.data?.practice.name || "the clinic"}. Clinic staff
                will review it and contact you using the permission you
                provided. No payment or paid onboarding was created.
              </Alert>
            ) : (
              <Box
                component="form"
                id="membership-interest-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit("purchase");
                }}
              >
                <Stack
                  component="fieldset"
                  disabled={busy}
                  spacing={3}
                  sx={{ border: 0, m: 0, minWidth: 0, p: 0, pt: 1 }}
                >
                  {error && <Alert severity="error">{error}</Alert>}
                  {selected && (
                    <PackageCard
                      terms={selected.terms}
                      selections={selections}
                      onSelect={(ids) => changeIntent(() => setSelections(ids))}
                    />
                  )}
                  {optionError && (
                    <Alert severity="warning">{optionError}</Alert>
                  )}
                  <Typography component="h2" variant="h6">
                    Your contact details
                  </Typography>
                  <Typography color="text.secondary">
                    Complete these details before secure payment. After a
                    verified payment, we will send your receipt and patient
                    portal activation link to this email, and the clinic will
                    begin onboarding.
                  </Typography>
                  <TextField
                    required
                    fullWidth
                    label="Full name"
                    value={displayName}
                    autoComplete="name"
                    slotProps={{ htmlInput: { maxLength: 120 } }}
                    onChange={(event) =>
                      changeIntent(() => setDisplayName(event.target.value))
                    }
                  />
                  <TextField
                    required
                    fullWidth
                    type="email"
                    label="Email address"
                    value={emailAddress}
                    autoComplete="email"
                    slotProps={{ htmlInput: { maxLength: 320 } }}
                    onChange={(event) =>
                      changeIntent(() => setEmailAddress(event.target.value))
                    }
                  />
                  <TextField
                    fullWidth
                    type="tel"
                    label="Phone number (optional)"
                    value={phoneNumber}
                    autoComplete="tel"
                    slotProps={{ htmlInput: { maxLength: 40 } }}
                    onChange={(event) =>
                      changeIntent(() => setPhoneNumber(event.target.value))
                    }
                  />
                  <FormControl
                    required
                    error={Boolean(error && !outreachConsent)}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          required
                          checked={outreachConsent}
                          onChange={(_, checked) =>
                            changeIntent(() => setOutreachConsent(checked))
                          }
                        />
                      }
                      label={`I agree that ${resource.data?.practice.name || "the clinic"} may contact me about this membership request.`}
                    />
                    <FormHelperText>
                      This lets the clinic contact you about this request and
                      post-payment onboarding. Payment authorization happens
                      only on the secure checkout page.
                    </FormHelperText>
                  </FormControl>
                </Stack>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button disabled={busy} onClick={closeDialog}>
              {outreachAcknowledged ? "Done" : "Cancel"}
            </Button>
            {!outreachAcknowledged && (
              <>
                <Button
                  form="membership-interest-form"
                  disabled={
                    busy ||
                    !displayName.trim() ||
                    !emailAddress.trim() ||
                    !outreachConsent ||
                    Boolean(optionError)
                  }
                  onClick={() => void submit("outreach")}
                >
                  {busy ? "Working…" : "Have the clinic contact me"}
                </Button>
                <Button
                  type="submit"
                  form="membership-interest-form"
                  variant="contained"
                  disabled={
                    busy ||
                    Boolean(optionError) ||
                    selected?.terms.eligibility_review ||
                    resource.data?.payment.checkout_available !== true
                  }
                >
                  {busy ? "Opening checkout…" : "Continue to secure payment"}
                </Button>
              </>
            )}
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}
