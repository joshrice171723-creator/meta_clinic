import { useMemo, useState } from "react";
import CardMembershipOutlinedIcon from "@mui/icons-material/CardMembershipOutlined";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { useResource } from "../../shared/ui";
import { PackageCard } from "./subscriptions/PackageCard";
import type {
  MembershipEnrollmentOptions,
  MembershipEnrollmentResponse,
  MembershipProspect,
  StaffPhonePaymentResponse,
} from "../membershipGrowth/types";

type Draft = {
  versionId: string;
  selections: number[];
  displayName: string;
  emailAddress: string;
  phoneNumber: string;
  contactConsent: boolean;
  requestKey: string;
};

function newDraft(): Draft {
  return {
    versionId: "",
    selections: [],
    displayName: "",
    emailAddress: "",
    phoneNumber: "",
    contactConsent: false,
    requestKey: crypto.randomUUID(),
  };
}

export function FrontDeskMembershipEnrollment() {
  const [open, setOpen] = useState(false);
  const resource = useResource<MembershipEnrollmentOptions>(
    "/api/clinic/membership_enrollment",
    { enabled: open },
  );
  const [draft, setDraft] = useState<Draft>(newDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdProspect, setCreatedProspect] =
    useState<MembershipProspect | null>(null);
  const [recurringAuthorization, setRecurringAuthorization] = useState(false);
  const [payment, setPayment] = useState<
    StaffPhonePaymentResponse["phone_payment"] | null
  >(null);

  const selectedPackage = useMemo(
    () =>
      resource.data?.catalog.find(
        (entry) => entry.id === Number(draft.versionId),
      ),
    [draft.versionId, resource.data?.catalog],
  );

  function openDialog() {
    setOpen(true);
    setError("");
  }

  function closeDialog() {
    if (!busy) setOpen(false);
  }

  function startAnother() {
    setDraft(newDraft());
    setCreatedProspect(null);
    setPayment(null);
    setRecurringAuthorization(false);
    setError("");
  }

  async function save() {
    if (busy || !draft.versionId || !draft.contactConsent) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<MembershipEnrollmentResponse>(
        "/api/clinic/membership_enrollment",
        {
          method: "POST",
          body: {
            enrollment: {
              version_id: Number(draft.versionId),
              selections: draft.selections,
              display_name: draft.displayName,
              email_address: draft.emailAddress,
              phone_number: draft.phoneNumber || null,
              contact_consent: draft.contactConsent,
              request_key: draft.requestKey,
            },
          },
        },
      );
      setCreatedProspect(result.prospect);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The enrollment could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function startPayment() {
    if (!createdProspect || busy || !recurringAuthorization) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<StaffPhonePaymentResponse>(
        `/api/clinic/membership_enrollment/${createdProspect.id}/payment`,
        {
          method: "POST",
          body: {
            payment: {
              lock_version: createdProspect.lock_version,
              authorization_confirmed: recurringAuthorization,
              authorization_version: "membership-recurring-phone-v1",
            },
          },
        },
      );
      setCreatedProspect(result.prospect);
      setPayment(result.phone_payment);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The card reader could not be started.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshPayment() {
    if (!createdProspect || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<StaffPhonePaymentResponse>(
        `/api/clinic/membership_prospects/${createdProspect.id}/refresh_phone_payment`,
        { method: "POST" },
      );
      setCreatedProspect(result.prospect);
      setPayment(result.phone_payment);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Payment status could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="contained"
        startIcon={<CardMembershipOutlinedIcon />}
        onClick={openDialog}
      >
        Enroll membership
      </Button>
      <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="md">
        <DialogTitle>Start a membership enrollment</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {resource.error && <Alert severity="error">{resource.error}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            {createdProspect ? (
              <Stack spacing={2}>
                <Alert severity="success">
                  Enrollment saved for {createdProspect.display_name}. They are
                  in front of you, so payment can continue here. No patient
                  record exists until payment is verified.
                </Alert>
                <Typography variant="h6">
                  {createdProspect.selected_terms.package_name}
                </Typography>
                {createdProspect.selected_terms.eligibility_review ? (
                  <Alert severity="warning">
                    This membership requires clinic review before payment. Keep
                    the enrollment in the pipeline and do not promise
                    eligibility or take payment.
                  </Alert>
                ) : (
                  <>
                    {payment && (
                      <Alert
                        severity={
                          payment.status === "paid"
                            ? "success"
                            : payment.status === "failed"
                              ? "error"
                              : "info"
                        }
                      >
                        {payment.status === "awaiting_card"
                          ? "The reader is ready. Ask the patient to insert or tap their card."
                          : payment.status === "payment_processing"
                            ? "Payment is processing. Check the status again before taking another payment."
                            : payment.status === "paid"
                              ? "Payment verified. Patient onboarding can now continue."
                              : "Payment did not complete. Confirm the details before retrying."}
                      </Alert>
                    )}
                    {payment?.status !== "paid" && (
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={recurringAuthorization}
                            onChange={(_, checked) =>
                              setRecurringAuthorization(checked)
                            }
                          />
                        }
                        label="I confirmed the patient authorizes this recurring membership payment and explained cancellation terms."
                      />
                    )}
                    <Typography color="text.secondary">
                      Card details stay with the payment reader. Do not type or
                      store card information in Meta Clinic.
                    </Typography>
                  </>
                )}
              </Stack>
            ) : (
              <>
                <Typography color="text.secondary">
                  Choose a published membership, then record the person’s
                  contact details. This does not create a patient record or take
                  payment.
                </Typography>
                {!resource.data ? (
                  <Typography color="text.secondary">
                    Loading published memberships…
                  </Typography>
                ) : resource.data?.catalog.length === 0 ? (
                  <Alert severity="info">
                    No published memberships are available for this clinic.
                  </Alert>
                ) : (
                  <>
                    <TextField
                      select
                      label="Membership"
                      value={draft.versionId}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          versionId: event.target.value,
                          selections: [],
                        }))
                      }
                      slotProps={{ select: { native: true } }}
                      fullWidth
                    >
                      <option value="">Choose a membership</option>
                      {resource.data?.catalog.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.terms.package_name}
                        </option>
                      ))}
                    </TextField>
                    {selectedPackage && (
                      <PackageCard
                        terms={selectedPackage.terms}
                        selections={draft.selections}
                        onSelect={(selections) =>
                          setDraft((current) => ({ ...current, selections }))
                        }
                      />
                    )}
                    {selectedPackage?.terms.eligibility_review && (
                      <Alert severity="warning">
                        This membership needs clinic review before payment. Save
                        the enrollment to keep it in the membership pipeline; do
                        not promise eligibility or take payment.
                      </Alert>
                    )}
                    <TextField
                      required
                      label="Full name"
                      value={draft.displayName}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          displayName: event.target.value,
                        }))
                      }
                      slotProps={{
                        htmlInput: { maxLength: 120, autoComplete: "name" },
                      }}
                      fullWidth
                    />
                    <TextField
                      required
                      type="email"
                      label="Email for receipt and patient portal"
                      value={draft.emailAddress}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          emailAddress: event.target.value,
                        }))
                      }
                      slotProps={{
                        htmlInput: { maxLength: 320, autoComplete: "email" },
                      }}
                      fullWidth
                    />
                    <TextField
                      label="Phone number"
                      value={draft.phoneNumber}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          phoneNumber: event.target.value,
                        }))
                      }
                      slotProps={{
                        htmlInput: { maxLength: 40, autoComplete: "tel" },
                      }}
                      fullWidth
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={draft.contactConsent}
                          onChange={(_, contactConsent) =>
                            setDraft((current) => ({
                              ...current,
                              contactConsent,
                            }))
                          }
                        />
                      }
                      label="The person agrees the clinic may contact them about this membership enrollment."
                    />
                  </>
                )}
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          {createdProspect ? (
            <>
              <Button onClick={startAnother}>Start another enrollment</Button>
              {createdProspect.selected_terms
                .eligibility_review ? null : payment?.status ===
                "paid" ? null : payment?.status === "failed" ? (
                <Button
                  onClick={() => void startPayment()}
                  variant="contained"
                  disabled={busy || !recurringAuthorization}
                >
                  {busy ? "Starting reader…" : "Try payment again"}
                </Button>
              ) : payment ? (
                <Button
                  onClick={() => void refreshPayment()}
                  variant="contained"
                  disabled={busy}
                >
                  {busy ? "Checking…" : "Check payment status"}
                </Button>
              ) : (
                <Button
                  onClick={() => void startPayment()}
                  variant="contained"
                  disabled={busy || !recurringAuthorization}
                >
                  {busy ? "Starting reader…" : "Take payment now"}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button onClick={closeDialog} disabled={busy}>
                Cancel
              </Button>
              <Button
                onClick={() => void save()}
                variant="contained"
                disabled={
                  busy ||
                  !draft.versionId ||
                  !draft.displayName.trim() ||
                  !draft.emailAddress.trim() ||
                  !draft.contactConsent
                }
              >
                {busy ? "Saving…" : "Save enrollment"}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
