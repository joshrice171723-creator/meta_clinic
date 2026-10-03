import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  MenuItem,
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

type Details = Record<string, string | null>;
type Coverage = {
  id: number;
  version: number;
  details: Details | null;
  recorded_at: string;
  recorded_by_id: number | null;
};
type InsuranceEvent = {
  id: number;
  coverage_id: number;
  invoice_id: number | null;
  kind: string;
  state: string;
  source: string;
  details: Record<string, unknown>;
  recorded_at: string;
  recorded_by_id: number;
  latest_event_id: number;
  latest_state: string;
  latest_source: string;
};
type Workspace = {
  patient_id: number;
  site_id: number;
  enabled: boolean;
  can_write: boolean;
  latest_version: number;
  coverage: Coverage[];
  pagination: Pagination;
  requests: InsuranceEvent[];
  request_pagination: Pagination;
  invoices: { id: number; currency: string; created_at: string }[];
  invoice_pagination: Pagination;
};
type Editor = {
  mode: "coverage" | "prepare" | "response";
  values: Record<string, string>;
  expectedVersion: number;
  request?: InsuranceEvent;
};
type Pending = {
  path: string;
  body: { insurance: Record<string, unknown> };
  key: string;
};
type Receipt = {
  patient_id: number;
  site_id: number;
  request_key: string;
  coverage?: Coverage;
  event?: InsuranceEvent;
};
const label = (value: string) => value.replaceAll("_", " ");
const coverageFields = [
  "payer",
  "member_id",
  "group_number",
  "policyholder",
  "relationship",
  "starts_on",
  "ends_on",
  "status",
  "evidence_source",
  "observed_on",
];
const requestFields = [
  "kind",
  "coverage_id",
  "invoice_id",
  "service_code_system",
  "service_code",
  "service_description",
  "service_date",
  "note",
];
const responseFields = [
  "state",
  "source",
  "reference",
  "response_code",
  "observed_on",
  "note",
];

export function PatientInsurance({ patientId }: { patientId: number }) {
  const clinic = useClinic();
  const [epoch, setEpoch] = useState(0);
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    const changed = () => setEpoch((value) => value + 1);
    window.addEventListener(SESSION_CHANGED_EVENT, changed);
    return () => window.removeEventListener(SESSION_CHANGED_EVENT, changed);
  }, []);
  if (!clinic.capabilities.billing || !clinic.current_site) return null;
  const key = [
    clinic.practice.id,
    clinic.user_id,
    clinic.membership_id,
    clinic.authorization_generation,
    clinic.current_site.id,
    patientId,
    epoch,
  ].join(":");
  return (
    <Accordion
      expanded={open}
      onChange={(_, expanded) => {
        setOpen(expanded);
        if (expanded) setOpened(true);
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>Insurance preparation and history</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {opened && (
          <InsuranceWorkspace
            key={key}
            patientId={patientId}
            siteId={clinic.current_site.id}
          />
        )}
      </AccordionDetails>
    </Accordion>
  );
}

function InsuranceWorkspace({
  patientId,
  siteId,
}: {
  patientId: number;
  siteId: number;
}) {
  const path = `/api/clinic/patients/${patientId}/insurance`;
  const [page, setPage] = useState(1);
  const resource = useResource<Workspace>(`${path}?page=${page}`);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
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
    if (!editor && !pending) return;
    const unregister = registerBlocker(() =>
      pending
        ? "Insurance save is unconfirmed. Leaving discards its exact retry request."
        : "Leave and discard unsaved insurance details?",
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
  }, [editor, pending, registerBlocker]);

  async function send(attempt: Pending) {
    if (locked.current) return;
    const recovering = pending !== null;
    locked.current = true;
    setPending(attempt);
    setBusy(true);
    setError(null);
    try {
      const result = await api<Receipt>(attempt.path, {
        method: "POST",
        body: attempt.body,
      });
      if (!active.current) return;
      if (
        result.patient_id !== patientId ||
        result.site_id !== siteId ||
        result.request_key !== attempt.key ||
        (!result.coverage && !result.event)
      ) {
        throw new Error(
          "The acknowledgement did not match this request. Retry the exact saved request to reconcile its outcome.",
        );
      }
      setPending(null);
      setEditor(null);
      setReceipt(
        result.coverage
          ? `Coverage version ${result.coverage.version} saved.`
          : `Insurance ${label(result.event!.kind)} record #${result.event!.id} saved. No request was sent to a payer and no payment was posted.`,
      );
      resource.refresh();
      setHistoryId(null);
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
          : "Unable to save insurance details.",
      );
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }

  const data = resource.data;
  if (!data)
    return (
      <Stack spacing={2}>
        <LoadState error={resource.error} onRetry={resource.refresh} />
        {error && <Alert severity="error">{error}</Alert>}
        {pending && (
          <Alert
            severity="warning"
            action={
              <Button disabled={busy} onClick={() => void send(pending)}>
                Retry exact save
              </Button>
            }
          >
            Save outcome is unconfirmed. The original request remains available
            even while records cannot be loaded.
          </Alert>
        )}
      </Stack>
    );
  if (data.patient_id !== patientId || data.site_id !== siteId)
    return (
      <Alert severity="error">
        Insurance context changed. Reopen this patient record.
      </Alert>
    );
  const disabled = busy || Boolean(pending);
  function begin(mode: Editor["mode"], request?: InsuranceEvent) {
    setError(null);
    setReceipt(null);
    setEditor({
      mode,
      expectedVersion: data!.latest_version,
      request,
      values:
        mode === "response"
          ? {
              source:
                request?.latest_source === "simulation"
                  ? "simulation"
                  : "manual",
            }
          : {},
    });
  }
  function save() {
    if (!editor || disabled) return;
    const key = crypto.randomUUID();
    const values: Record<string, unknown> = {
      ...editor.values,
      request_key: key,
    };
    let endpoint: string;
    if (editor.mode === "coverage") {
      values.expected_version = editor.expectedVersion;
      endpoint = `${path}/coverage`;
    } else if (editor.mode === "response") {
      values.expected_event_id = editor.request!.latest_event_id;
      endpoint = `${path}/requests/${editor.request!.id}/responses`;
    } else {
      endpoint = `${path}/requests`;
      if (!["claim", "reconciliation"].includes(String(values.kind)))
        delete values.invoice_id;
    }
    void send({ path: endpoint, body: { insurance: values }, key });
  }
  const totalPages = Math.max(
    data.pagination.total_pages,
    data.request_pagination.total_pages,
    data.invoice_pagination.total_pages,
    1,
  );
  return (
    <Stack spacing={2}>
      <Typography variant="body2">
        Prepare and retain insurance work here. No payer connection is
        configured. Manual outcomes record staff-supplied evidence; simulated
        outcomes are not payer decisions. Coverage and authorization do not
        guarantee payment.
      </Typography>
      {!data.enabled && (
        <Alert severity="info">
          Insurance preparation is disabled for this location. Saved history and
          responses to existing work remain available with the required
          permissions.
        </Alert>
      )}
      {resource.error && <Alert severity="error">{resource.error}</Alert>}
      {receipt && <Alert severity="success">{receipt}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {!editor && data.can_write && data.enabled && (
        <Stack direction="row" spacing={1}>
          <Button onClick={() => begin("coverage")}>
            Record coverage version
          </Button>
          <Button
            disabled={!data.coverage.some((item) => item.details)}
            onClick={() => begin("prepare")}
          >
            Prepare insurance request
          </Button>
        </Stack>
      )}
      {editor && (
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Stack spacing={1.5}>
            <Typography variant="subtitle2">
              {editor.mode === "coverage"
                ? "Record supplied coverage details"
                : editor.mode === "prepare"
                  ? "Prepare a local request"
                  : `Record outcome for request #${editor.request!.id}`}
            </Typography>
            {(editor.mode === "coverage"
              ? coverageFields
              : editor.mode === "prepare"
                ? requestFields
                : responseFields
            )
              .filter(
                (field) =>
                  field !== "invoice_id" ||
                  ["claim", "reconciliation"].includes(editor.values.kind),
              )
              .map((field) => {
                let options: { value: string; text: string }[] | undefined;
                const choices: Record<string, string[]> = {
                  relationship: ["self", "spouse", "child", "other"],
                  status: ["active", "inactive", "unknown"],
                  kind: [
                    "eligibility",
                    "authorization",
                    "claim",
                    "reconciliation",
                  ],
                  state: [
                    "pending",
                    "approved",
                    "denied",
                    "unknown",
                    "cancelled",
                  ],
                  source: ["manual", "simulation"],
                };
                if (choices[field])
                  options = choices[field].map((value) => ({
                    value,
                    text: label(value),
                  }));
                if (field === "coverage_id")
                  options = data.coverage
                    .filter((item) => item.details)
                    .map((item) => ({
                      value: String(item.id),
                      text: `Version ${item.version}: ${item.details!.payer} · ${item.details!.member_id}`,
                    }));
                if (field === "invoice_id")
                  options = data.invoices.map((item) => ({
                    value: String(item.id),
                    text: `Posted invoice #${item.id} · ${item.currency} · ${item.created_at.slice(0, 10)}`,
                  }));
                if (
                  ["coverage_id", "invoice_id"].includes(field) &&
                  editor.values[field] &&
                  !options?.some((item) => item.value === editor.values[field])
                ) {
                  options = [
                    ...(options || []),
                    {
                      value: editor.values[field],
                      text: `Selected #${editor.values[field]} from another page`,
                    },
                  ];
                }
                const isDate =
                  field.endsWith("_on") || field === "service_date";
                return (
                  <TextField
                    key={field}
                    label={label(field)}
                    value={editor.values[field] || ""}
                    select={Boolean(options)}
                    type={isDate ? "date" : "text"}
                    multiline={field === "note"}
                    disabled={disabled}
                    slotProps={{
                      inputLabel: isDate ? { shrink: true } : undefined,
                      htmlInput: { maxLength: 500 },
                    }}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        values: {
                          ...editor.values,
                          [field]: event.target.value,
                        },
                      })
                    }
                  >
                    {options && <MenuItem value="">Choose…</MenuItem>}
                    {options?.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.text}
                      </MenuItem>
                    ))}
                  </TextField>
                );
              })}
            {editor.mode === "coverage" &&
              editor.expectedVersion !== data.latest_version && (
                <Alert severity="warning">
                  Coverage changed. Your entries are retained. Review the saved
                  versions before updating the expected version.
                </Alert>
              )}
            <Stack direction="row" spacing={1}>
              <Button
                type="submit"
                disabled={
                  disabled ||
                  !data.can_write ||
                  (editor.mode !== "response" && !data.enabled)
                }
              >
                Save{" "}
                {editor.mode === "response"
                  ? "recorded outcome"
                  : "preparation"}
              </Button>
              <Button disabled={disabled} onClick={() => setEditor(null)}>
                Cancel edits
              </Button>
              <Button disabled={disabled} onClick={resource.refresh}>
                Refresh saved records
              </Button>
              {editor.mode === "coverage" &&
                editor.expectedVersion !== data.latest_version && (
                  <Button
                    disabled={disabled}
                    onClick={() =>
                      setEditor({
                        ...editor,
                        expectedVersion: data.latest_version,
                      })
                    }
                  >
                    Use displayed version, retain entries
                  </Button>
                )}
              {editor.mode === "response" && (
                <Button
                  disabled={disabled}
                  onClick={() => {
                    const latest = data.requests.find(
                      (item) => item.id === editor.request!.id,
                    );
                    if (latest) setEditor({ ...editor, request: latest });
                  }}
                >
                  Use displayed request version, retain entries
                </Button>
              )}
            </Stack>
          </Stack>
        </Box>
      )}
      {pending && (
        <Alert
          severity="warning"
          action={
            <Button disabled={busy} onClick={() => void send(pending)}>
              Retry exact save
            </Button>
          }
        >
          Save outcome is unconfirmed. This request is retained until its
          matching acknowledgement is received.
        </Alert>
      )}
      <Typography variant="subtitle2">
        Coverage history · {data.pagination.total} versions at this location
      </Typography>
      {data.coverage.map((item) => (
        <Box key={item.id} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
          <Typography>
            Version {item.version} · {item.recorded_at} · Account{" "}
            {item.recorded_by_id ?? "not recorded"}
          </Typography>
          {item.details ? (
            <Typography variant="body2">
              {coverageFields
                .map(
                  (field) =>
                    `${label(field)}: ${item.details![field] || "not recorded"}`,
                )
                .join(" · ")}
            </Typography>
          ) : (
            <Typography>
              Historical coverage has no structured preparation details.
            </Typography>
          )}
        </Box>
      ))}
      <Typography variant="subtitle2">
        Insurance requests · {data.request_pagination.total} records at this
        location
      </Typography>
      {data.requests.map((item) => (
        <Box key={item.id} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
          <Typography>
            #{item.id} · {label(item.kind)} · {label(item.latest_state)} ·{" "}
            {item.latest_source === "simulation"
              ? "Simulated outcome"
              : item.latest_source === "manual"
                ? "Staff-recorded evidence"
                : "Prepared locally"}
          </Typography>
          <Typography variant="body2">
            Coverage #{item.coverage_id}
            {item.invoice_id ? ` · Invoice #${item.invoice_id}` : ""} ·{" "}
            {item.recorded_at}
          </Typography>
          <Button
            disabled={Boolean(editor) || disabled}
            onClick={() => setHistoryId(item.id)}
          >
            View request and response history
          </Button>
          {data.can_write &&
            !["approved", "denied", "cancelled"].includes(
              item.latest_state,
            ) && (
              <Button
                disabled={Boolean(editor) || disabled}
                onClick={() => begin("response", item)}
              >
                Record outcome
              </Button>
            )}
        </Box>
      ))}
      {historyId && (
        <RequestHistory
          key={historyId}
          path={`${path}/requests/${historyId}`}
        />
      )}
      <Stack direction="row" spacing={1}>
        <Button
          disabled={disabled || page <= 1}
          onClick={() => {
            setHistoryId(null);
            setPage(page - 1);
          }}
        >
          Previous page
        </Button>
        <Typography>
          Page {page} of {totalPages} · up to 10 records per list
        </Typography>
        <Button
          disabled={disabled || page >= totalPages}
          onClick={() => {
            setHistoryId(null);
            setPage(page + 1);
          }}
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

function RequestHistory({ path }: { path: string }) {
  const [page, setPage] = useState(1);
  const resource = useResource<{
    request: InsuranceEvent;
    events: InsuranceEvent[];
    pagination: Pagination;
  }>(`${path}?page=${page}`);
  if (!resource.data)
    return <LoadState error={resource.error} onRetry={resource.refresh} />;
  const { request, events, pagination } = resource.data;
  return (
    <Stack spacing={1}>
      {[request, ...events].map((item) => (
        <Box key={item.id}>
          <Typography variant="subtitle2">
            #{item.id} · {item.source} · {item.state} · {item.recorded_at} ·
            Account {item.recorded_by_id}
          </Typography>
          {Object.entries(item.details)
            .filter(([, value]) => typeof value === "string")
            .map(([key, value]) => (
              <Typography variant="body2" key={key}>
                {label(key)}: {String(value)}
              </Typography>
            ))}
        </Box>
      ))}
      <Stack direction="row">
        <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Earlier history page
        </Button>
        <Button
          disabled={page >= pagination.total_pages}
          onClick={() => setPage(page + 1)}
        >
          Next history page
        </Button>
      </Stack>
    </Stack>
  );
}
