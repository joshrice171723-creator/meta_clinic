import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, SESSION_CHANGED_EVENT } from "../../api/client";
import type { Pagination } from "../../api/contracts";
import { LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { useClinicNavigation } from "./clinicNavigation";

type Receipt = {
  id: number;
  service_offering_id: number;
  state: "received" | "withdrawn";
  received_on: string | null;
  valid_until: string | null;
  prior_receipt_id: number | null;
  details: { source: string; reference: string; note: string };
  recorded_at: string;
  recorded_by_id: number;
  current: boolean;
};
type Offering = {
  id: number;
  name: string;
  required: boolean;
  instructions: string | null;
  latest_receipt_id: number | null;
};
type Response = {
  patient_id: number;
  site_id: number;
  receipts: Receipt[];
  offerings: Offering[];
  pagination: Pagination;
  offering_pagination: Pagination;
};
type Form = {
  service_offering_id: number;
  expected_receipt_id: number | null;
  state: "received" | "withdrawn";
  source: string;
  reference: string;
  note: string;
  received_on: string;
  valid_until: string;
};
type Attempt = { referral: Form & { request_key: string } };

export function PatientReferralReceipts({ patientId }: { patientId: number }) {
  const clinic = useClinic();
  const [opened, setOpened] = useState(false);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const changed = () => setEpoch((value) => value + 1);
    window.addEventListener(SESSION_CHANGED_EVENT, changed);
    return () => window.removeEventListener(SESSION_CHANGED_EVENT, changed);
  }, []);
  if (
    !(
      clinic.capabilities.appointments_book ?? clinic.capabilities.appointments
    ) ||
    !clinic.current_site
  )
    return null;
  const identity = [
    clinic.practice.id,
    clinic.current_site.id,
    clinic.user_id,
    clinic.membership_id,
    clinic.authorization_generation,
    patientId,
    epoch,
  ].join(":");
  return (
    <Accordion
      onChange={(_, expanded) => {
        if (expanded) setOpened(true);
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>Referral receipts</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {opened && (
          <ReferralWorkspace
            key={identity}
            patientId={patientId}
            siteId={clinic.current_site.id}
          />
        )}
      </AccordionDetails>
    </Accordion>
  );
}

function ReferralWorkspace({
  patientId,
  siteId,
}: {
  patientId: number;
  siteId: number;
}) {
  const path = `/api/clinic/patients/${patientId}/referral_receipts`;
  const [page, setPage] = useState(1);
  const resource = useResource<Response>(`${path}?page=${page}`);
  const [form, setForm] = useState<Form | null>(null);
  const [pending, setPending] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const active = useRef(true);
  const locked = useRef(false);
  const { registerBlocker } = useClinicNavigation();
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!form && !pending) return;
    const unregister = registerBlocker(() =>
      pending
        ? "Referral save is unconfirmed. Leaving discards the exact retry request."
        : "Discard unsaved referral details?",
    );
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [form, pending, registerBlocker]);
  async function send(attempt: Attempt) {
    if (locked.current) return;
    const recovering = pending !== null;
    locked.current = true;
    setBusy(true);
    setPending(attempt);
    setError(null);
    try {
      const result = await api<{
        patient_id: number;
        site_id: number;
        request_key: string;
        receipt: Receipt;
      }>(path, { method: "POST", body: attempt });
      if (!active.current) return;
      if (
        result.patient_id !== patientId ||
        result.site_id !== siteId ||
        result.request_key !== attempt.referral.request_key ||
        result.receipt?.service_offering_id !==
          attempt.referral.service_offering_id ||
        result.receipt.state !== attempt.referral.state
      )
        throw new Error(
          "The acknowledgement did not match this referral save. Retry the exact request.",
        );
      setPending(null);
      setForm(null);
      setNotice(
        `Referral ${result.receipt.state} record #${result.receipt.id} saved.`,
      );
      resource.refresh();
    } catch (cause) {
      if (!active.current) return;
      const uncertain =
        !(cause instanceof ApiError) ||
        cause.status >= 500 ||
        cause.status === 408 ||
        cause.code === "outcome_unconfirmed";
      if (!uncertain && !recovering) setPending(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save referral details.",
      );
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }
  function begin(
    offeringId: number,
    expectedId: number | null,
    state: Form["state"],
  ) {
    setError(null);
    setNotice(null);
    setForm({
      service_offering_id: offeringId,
      expected_receipt_id: expectedId,
      state,
      source: "",
      reference: "",
      note: "",
      received_on: "",
      valid_until: "",
    });
  }
  const data = resource.data;
  const disabled = busy || pending !== null;
  const retry = pending && (
    <Alert
      severity="warning"
      action={
        <Button disabled={busy} onClick={() => void send(pending)}>
          Retry exact save
        </Button>
      }
    >
      Save outcome is unconfirmed. The original request is retained.
    </Alert>
  );
  if (!data)
    return (
      <Stack spacing={1}>
        <LoadState error={resource.error} onRetry={resource.refresh} />
        {error && <Alert severity="error">{error}</Alert>}
        {retry}
      </Stack>
    );
  if (data.patient_id !== patientId || data.site_id !== siteId)
    return (
      <Alert severity="error">
        Referral context changed. Reopen this patient.
      </Alert>
    );
  const pages = Math.max(
    1,
    data.pagination.total_pages,
    data.offering_pagination.total_pages,
  );
  return (
    <Stack spacing={2}>
      <Typography variant="body2">
        Record supplied referral evidence for this patient and location. Receipt
        is not clinical approval or insurance authorization. Leave Valid until
        empty when no expiry was supplied.
      </Typography>
      {resource.error && <Alert severity="error">{resource.error}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {retry}
      {form && (
        <Stack
          component="form"
          spacing={1.5}
          onSubmit={(event) => {
            event.preventDefault();
            if (!disabled)
              void send({
                referral: { ...form, request_key: crypto.randomUUID() },
              });
          }}
        >
          <Typography variant="subtitle2">
            {form.state === "received"
              ? "Record received referral"
              : "Withdraw receipt with a reason"}{" "}
            · Service #{form.service_offering_id}
          </Typography>
          {(form.state === "received"
            ? ([
                "source",
                "reference",
                "received_on",
                "valid_until",
                "note",
              ] as const)
            : (["note"] as const)
          ).map((field) => (
            <TextField
              key={field}
              label={field.replaceAll("_", " ")}
              value={form[field]}
              type={
                ["received_on", "valid_until"].includes(field) ? "date" : "text"
              }
              multiline={field === "note"}
              required={field !== "valid_until"}
              disabled={disabled}
              slotProps={{
                inputLabel: ["received_on", "valid_until"].includes(field)
                  ? { shrink: true }
                  : undefined,
                htmlInput: { maxLength: 500 },
              }}
              onChange={(event) =>
                setForm({ ...form, [field]: event.target.value })
              }
            />
          ))}
          <Stack direction="row" spacing={1}>
            <Button type="submit" disabled={disabled}>
              Save referral record
            </Button>
            <Button disabled={disabled} onClick={() => setForm(null)}>
              Cancel edits
            </Button>
          </Stack>
        </Stack>
      )}
      <Typography variant="subtitle2">
        Published services at this location
      </Typography>
      {data.offerings.map((offering) => (
        <Stack key={offering.id} spacing={0.5}>
          <Typography>
            {offering.name} ·{" "}
            {offering.required
              ? "Referral required for booking and rescheduling"
              : "Referral optional"}
          </Typography>
          {offering.instructions && (
            <Typography variant="body2">{offering.instructions}</Typography>
          )}
          <Button
            disabled={disabled || Boolean(form)}
            onClick={() =>
              begin(offering.id, offering.latest_receipt_id, "received")
            }
          >
            Record receipt for {offering.name}
          </Button>
        </Stack>
      ))}
      <Typography variant="subtitle2">
        Receipt history · {data.pagination.total} records
      </Typography>
      {data.receipts.map((record) => (
        <Stack key={record.id} spacing={0.5}>
          <Typography>
            #{record.id} · Service #{record.service_offering_id} ·{" "}
            {record.state} ·{" "}
            {record.current ? "Latest record" : "Earlier record"}
          </Typography>
          <Typography variant="body2">
            {record.recorded_at} · Account {record.recorded_by_id}
            {record.prior_receipt_id
              ? ` · Follows #${record.prior_receipt_id}`
              : ""}
          </Typography>
          <Typography variant="body2">
            Source: {record.details.source || "not recorded"} · Reference:{" "}
            {record.details.reference || "not recorded"} · Received:{" "}
            {record.received_on || "not recorded"} · Valid until:{" "}
            {record.valid_until || "not supplied"}
          </Typography>
          <Typography variant="body2">{record.details.note}</Typography>
          {record.current && record.state === "received" && (
            <Button
              disabled={disabled || Boolean(form)}
              onClick={() =>
                begin(record.service_offering_id, record.id, "withdrawn")
              }
            >
              Withdraw receipt #{record.id}
            </Button>
          )}
        </Stack>
      ))}
      <Stack direction="row" spacing={1}>
        <Button
          disabled={disabled || Boolean(form) || page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous page
        </Button>
        <Typography>
          Page {page} of {pages}
        </Typography>
        <Button
          disabled={disabled || Boolean(form) || page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Next page
        </Button>
        <Button disabled={disabled} onClick={resource.refresh}>
          Refresh
        </Button>
      </Stack>
    </Stack>
  );
}
