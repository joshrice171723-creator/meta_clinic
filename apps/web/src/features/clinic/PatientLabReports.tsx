import AddIcon from "@mui/icons-material/Add";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { businessTimeAfter } from "../../shared/businessDate";
import { useClinic } from "./Workspace";
import { localDateTimeInput } from "./frontDeskModel";
import { LabResultHistory } from "./LabResultHistory";
import { LabReportActionsPanel } from "./LabReportActionsPanel";
import type {
  ClinicalPlanWorkspace,
  ServiceRequestRevision,
} from "../../api/contracts";

export type LabResult = {
  name: string;
  code: string | null;
  code_system?: string | null;
  code_version?: string | null;
  value: string;
  value_kind?: "text" | "numeric" | "coded" | "boolean" | "range" | "absent";
  absent_reason?: string | null;
  value_code?: string | null;
  value_code_system?: string | null;
  unit: string | null;
  unit_code?: string | null;
  interpretation?: string | null;
  reference_range: string | null;
  flag: string | null;
};
export type LabReportVersion = {
  id: number;
  lab_report_id: number;
  patient_id: number;
  version_number: number;
  title: string;
  status: "preliminary" | "final" | "amended" | "corrected" | "cancelled";
  result_priority: "routine" | "urgent" | "critical";
  collected_at: string | null;
  issued_at: string | null;
  results: LabResult[];
  entry_kind: "manual";
  content_digest: string;
  recorded_at: string;
  recorded_by: number | null;
  reviewed_at: string | null;
  reviewed_by: number | null;
  actions?: {
    id: number;
    kind: string;
    note: string | null;
    clinical_task_id: number | null;
    recorded_at: string;
  }[];
  follow_up: LabFollowUp | null;
};
export type LabFollowUp = {
  id: number;
  state: "open" | "completed" | "not_required" | "superseded";
  instructions: string | null;
  outcome: string | null;
  recorded_at: string;
  recorded_by: number;
  completed_at: string | null;
  completed_by: number | null;
  superseded_at: string | null;
  priority: "routine" | "urgent" | "critical";
  due_at: string | null;
  escalated_at: string | null;
  escalated_by: number | null;
  patient_contact_status: "informed" | "not_reached" | "not_required" | null;
  patient_contact_method:
    "portal" | "phone" | "in_person" | "letter" | "other" | null;
  patient_contact_at: string | null;
  contact_attempts: {
    id: number;
    outcome: "informed" | "not_reached";
    contact_method: "portal" | "phone" | "in_person" | "letter" | "other";
    attempted_at: string;
    recorded_at: string;
    attempted_by: number;
    note: string | null;
    next_action: {
      task_id: number;
      state: string;
      assigned_to_membership_id: number | null;
      due_at: string | null;
    };
  }[];
};
type LabSpecimen = {
  id: number;
  service_request_revision_id: number;
  specimen_identifier: string | null;
  specimen_type_code: string;
  specimen_type_display: string;
  condition_code: "satisfactory" | "compromised" | "unknown" | "rejected";
  collected_at: string;
  collected_by: number;
};
export type LabReport = {
  id: number;
  patient_id: number;
  service_request_revision_id: number | null;
  specimen: LabSpecimen | null;
  source_name: string;
  external_report_id: string | null;
  current_version_id: number;
  current_version: LabReportVersion;
  open_prior_follow_ups: {
    version_id: number;
    version_number: number;
  }[];
  created_at: string;
  updated_at: string;
  versions?: LabReportVersion[];
};
type Index = {
  reports: LabReport[];
  pagination: { page: number; per_page: number; total: number };
  can_write: boolean;
  can_review: boolean;
};
type Form = {
  source_name: string;
  external_report_id: string;
  title: string;
  status: LabReportVersion["status"];
  result_priority: LabReportVersion["result_priority"];
  service_request_revision_id: string;
  specimen_identifier: string;
  specimen_type_code: string;
  specimen_type_display: string;
  specimen_condition: LabSpecimen["condition_code"];
  collected_at: string;
  issued_at: string;
  results: LabResult[];
  confirmed: boolean;
};
type PatientScopedAttempt<T extends object> = T & { patientId: number };

export function currentPatientAttempt<T extends { patientId: number }>(
  attempt: T | null,
  patientId: number,
) {
  return attempt?.patientId === patientId ? attempt : null;
}

export function isCurrentPatientRequest(
  currentPatientId: number,
  currentGeneration: number,
  requestPatientId: number,
  requestGeneration: number,
) {
  return (
    currentPatientId === requestPatientId &&
    currentGeneration === requestGeneration
  );
}
const blankResult = (): LabResult => ({
  name: "",
  code: null,
  code_system: null,
  code_version: null,
  value: "",
  unit: null,
  unit_code: null,
  interpretation: null,
  reference_range: null,
  flag: null,
});
const blankForm = (): Form => ({
  source_name: "",
  external_report_id: "",
  title: "",
  status: "final",
  result_priority: "routine",
  service_request_revision_id: "",
  specimen_identifier: "",
  specimen_type_code: "119297000",
  specimen_type_display: "Blood specimen",
  specimen_condition: "satisfactory",
  collected_at: "",
  issued_at: "",
  results: [blankResult()],
  confirmed: false,
});
const versionForm = (report: LabReport): Form => ({
  source_name: report.source_name,
  external_report_id: report.external_report_id ?? "",
  title: report.current_version.title,
  status: report.current_version.status,
  result_priority: report.current_version.result_priority,
  service_request_revision_id:
    report.service_request_revision_id?.toString() ?? "",
  specimen_identifier: report.specimen?.specimen_identifier ?? "",
  specimen_type_code: report.specimen?.specimen_type_code ?? "",
  specimen_type_display: report.specimen?.specimen_type_display ?? "",
  specimen_condition: report.specimen?.condition_code ?? "unknown",
  collected_at: report.current_version.collected_at ?? "",
  issued_at: report.current_version.issued_at ?? "",
  results: report.current_version.results.map((row) => ({ ...row })),
  confirmed: false,
});
const initialPage = () => {
  const page = Number(new URLSearchParams(window.location.search).get("page"));
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
};
const initialDirectReview = () => {
  const params = new URLSearchParams(window.location.search);
  const reportId = Number(params.get("lab_report_id"));
  const versionId = Number(params.get("lab_version_id"));
  return Number.isSafeInteger(reportId) &&
    reportId > 0 &&
    Number.isSafeInteger(versionId) &&
    versionId > 0
    ? { reportId, versionId }
    : null;
};
const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString()
    : "Date not recorded";
};
const followUpLabel = (followUp: LabFollowUp | null) => {
  if (!followUp) return "Follow-up decision not recorded";
  return {
    open: "Follow-up open",
    completed: "Follow-up completed",
    not_required: "No follow-up needed",
    superseded: "Follow-up superseded by a corrected version",
  }[followUp.state];
};
const optionLabel = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export function PatientLabReports({
  patientId,
  patientName,
  encounterId,
  orderRevision = 0,
}: {
  patientId: number;
  patientName?: string;
  encounterId?: number;
  orderRevision?: number;
}) {
  const { capabilities, practice } = useClinic();
  const [data, setData] = useState<Index>();
  const [labOrders, setLabOrders] = useState<ServiceRequestRevision[]>([]);
  const [error, setError] = useState("");
  const [reportsStale, setReportsStale] = useState(false);
  const [form, setForm] = useState<Form>(blankForm);
  const [formBaseline, setFormBaseline] = useState<Form>(blankForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LabReport | null>(null);
  const [history, setHistory] = useState<LabReport | null>(null);
  const [historySourceVersion, setHistorySourceVersion] = useState<
    number | null
  >(null);
  const [resultHistory, setResultHistory] = useState<{
    patientId: number;
    reportId: number;
    versionId: number;
    resultIndex: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(initialPage);
  const [reload, setReload] = useState(0);
  const [retryPending, setRetryPending] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{
    report: LabReport;
    version: LabReportVersion;
  } | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reviewDisposition, setReviewDisposition] = useState<
    "required" | "not_required" | null
  >(null);
  const [reviewFollowUpNote, setReviewFollowUpNote] = useState("");
  const [reviewFollowUpDueAt, setReviewFollowUpDueAt] = useState("");
  const [reviewRetryPending, setReviewRetryPending] = useState(false);
  const [followUpTarget, setFollowUpTarget] = useState<{
    report: LabReport;
    version: LabReportVersion;
    action: "set" | "complete";
  } | null>(null);
  const [followUpDisposition, setFollowUpDisposition] = useState<
    "required" | "not_required" | null
  >(null);
  const [followUpNote, setFollowUpNote] = useState("");
  const [followUpDueAt, setFollowUpDueAt] = useState("");
  const [followUpOutcome, setFollowUpOutcome] = useState("");
  const [patientContactStatus, setPatientContactStatus] = useState("");
  const [patientContactMethod, setPatientContactMethod] = useState("");
  const [patientContactAt, setPatientContactAt] = useState("");
  const [followUpRetryPending, setFollowUpRetryPending] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [directReviewError, setDirectReviewError] = useState("");
  const [statePatientId, setStatePatientId] = useState(patientId);
  const patientIdRef = useRef(patientId);
  const patientGenerationRef = useRef(0);
  patientIdRef.current = patientId;
  const requestIsCurrent = (
    requestPatientId: number,
    requestGeneration: number,
  ) =>
    isCurrentPatientRequest(
      patientIdRef.current,
      patientGenerationRef.current,
      requestPatientId,
      requestGeneration,
    );
  const attempt = useRef<PatientScopedAttempt<{
    key: string;
    body: unknown;
    path: string;
  }> | null>(null);
  const reviewAttempt = useRef<PatientScopedAttempt<{
    body: unknown;
    path: string;
  }> | null>(null);
  const followUpAttempt = useRef<PatientScopedAttempt<{
    body: unknown;
    path: string;
  }> | null>(null);
  const directReview = useRef(initialDirectReview());
  const patientContextReady = statePatientId === patientId;
  const canRead =
    capabilities.patients === true && capabilities.notes_read === true;
  const canWrite =
    patientContextReady &&
    capabilities.observations_write === true &&
    data?.can_write === true;
  const canCreate =
    canWrite && encounterId !== undefined && labOrders.length > 0;
  const canReview =
    patientContextReady &&
    capabilities.notes_write === true &&
    data?.can_review === true;
  useEffect(() => {
    if (statePatientId === patientId) return;
    patientGenerationRef.current += 1;
    attempt.current = null;
    reviewAttempt.current = null;
    followUpAttempt.current = null;
    directReview.current = initialDirectReview();
    setData(undefined);
    setLabOrders([]);
    setError("");
    setReportsStale(false);
    setForm(blankForm());
    setFormBaseline(blankForm());
    setFormOpen(false);
    setEditing(null);
    setHistory(null);
    setHistorySourceVersion(null);
    setResultHistory(null);
    setBusy(false);
    setNotice("");
    setRetryPending(false);
    setReviewTarget(null);
    setReviewConfirmed(false);
    setReviewDisposition(null);
    setReviewFollowUpNote("");
    setReviewFollowUpDueAt("");
    setReviewRetryPending(false);
    setFollowUpTarget(null);
    setFollowUpDisposition(null);
    setFollowUpNote("");
    setFollowUpDueAt("");
    setFollowUpOutcome("");
    setPatientContactStatus("");
    setPatientContactMethod("");
    setPatientContactAt("");
    setFollowUpRetryPending(false);
    setDiscardOpen(false);
    setDirectReviewError("");
    setStatePatientId(patientId);
  }, [patientId, statePatientId]);
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setError("");
    setReportsStale(data !== undefined);
    api<Index>(
      `/api/clinic/patients/${patientId}/lab_reports?page=${page}&per_page=25`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setReportsStale(false);
      })
      .catch(
        (reason: unknown) =>
          !controller.signal.aborted &&
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load lab reports.",
          ),
      );
    return () => controller.abort();
  }, [canRead, page, patientId, reload]);
  useEffect(() => {
    if (!canRead || encounterId === undefined) {
      setLabOrders([]);
      return;
    }
    const controller = new AbortController();
    api<ClinicalPlanWorkspace>(
      `/api/clinic/patients/${patientId}/encounters/${encounterId}/clinical_plan_workspace`,
      { signal: controller.signal },
    )
      .then((workspace) => {
        if (controller.signal.aborted) return;
        if (
          workspace.patient_id !== patientId ||
          workspace.encounter_id !== encounterId
        )
          throw new Error("The lab order list did not match this encounter.");
        setLabOrders(
          workspace.records.service_requests.filter(
            (order) =>
              order.request_kind === "lab" &&
              order.intent === "order" &&
              order.status === "active",
          ),
        );
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load active lab orders.",
          );
      });
    return () => controller.abort();
  }, [canRead, encounterId, patientId, reload, orderRevision]);
  useEffect(() => {
    if (
      !reviewTarget ||
      !reviewTarget.version.result_priority.match(/^(urgent|critical)$/)
    )
      return;
    setReviewDisposition("required");
    if (!reviewFollowUpDueAt)
      setReviewFollowUpDueAt(
        localDateTimeInput(businessTimeAfter(60 * 60 * 1000).toISOString()),
      );
  }, [reviewFollowUpDueAt, reviewTarget]);
  useEffect(() => {
    if (
      !followUpTarget ||
      followUpTarget.action !== "set" ||
      followUpTarget.version.result_priority === "routine"
    )
      return;
    setFollowUpDisposition("required");
    if (!followUpDueAt)
      setFollowUpDueAt(
        localDateTimeInput(businessTimeAfter(60 * 60 * 1000).toISOString()),
      );
  }, [followUpDueAt, followUpTarget]);
  useEffect(() => {
    if (followUpTarget?.action !== "complete") return;
    setPatientContactStatus("");
    setPatientContactMethod("");
    setPatientContactAt("");
  }, [followUpTarget]);
  useEffect(() => {
    const target = directReview.current;
    if (!canRead || !data || !target) return;
    directReview.current = null;
    const controller = new AbortController();
    api<{ report: LabReport }>(
      `/api/clinic/patients/${patientId}/lab_reports/${target.reportId}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        const report = result.report;
        const version =
          report.versions?.find((item) => item.id === target.versionId) ?? null;
        if (
          report.id !== target.reportId ||
          report.patient_id !== patientId ||
          !version
        ) {
          setHistory(report);
          setDirectReviewError(
            "This report version is no longer current. The report history is open so you can check the current record.",
          );
          return;
        }
        if (
          version.id !== report.current_version_id &&
          version.follow_up?.state === "open" &&
          canReview
        ) {
          setFollowUpTarget({ report, version, action: "complete" });
          setFollowUpOutcome("");
        } else if (version.id !== report.current_version_id) {
          setHistory(report);
          setDirectReviewError(
            "This report version is no longer current. Review the corrected version in the report history.",
          );
        } else if (!version.reviewed_at && canReview) {
          setReviewTarget({ report, version });
          setReviewConfirmed(false);
          setReviewDisposition(null);
          setReviewFollowUpNote("");
        } else if (
          version.reviewed_at &&
          version.follow_up === null &&
          canReview
        ) {
          setFollowUpTarget({ report, version, action: "set" });
          setFollowUpDisposition(null);
          setFollowUpNote("");
        } else if (version.follow_up?.state === "open" && canReview) {
          setFollowUpTarget({ report, version, action: "complete" });
          setFollowUpOutcome("");
        } else {
          setHistory(report);
          if (version.reviewed_at) {
            setDirectReviewError(
              "This lab version has already been reviewed. The report history is open so you can check its follow-up record.",
            );
          }
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setDirectReviewError(
          reason instanceof Error
            ? reason.message
            : "Unable to open the selected lab report.",
        );
      });
    return () => controller.abort();
  }, [canRead, canReview, data, patientId]);
  const save = async () => {
    if (
      !canWrite ||
      !form.confirmed ||
      !form.source_name.trim() ||
      !form.title.trim() ||
      (!editing &&
        (!form.service_request_revision_id ||
          !form.specimen_type_code.trim() ||
          !form.specimen_type_display.trim())) ||
      !Number.isFinite(new Date(form.collected_at).getTime()) ||
      !Number.isFinite(new Date(form.issued_at).getTime()) ||
      !form.results.length ||
      form.results.some(
        (row) =>
          !row.name.trim() ||
          (row.value_kind === "absent"
            ? !row.absent_reason?.trim()
            : !row.value.trim()),
      )
    ) {
      setError(
        "Choose the exact lab order and specimen, enter the source, title, times, and results, then confirm the patient match.",
      );
      return;
    }
    setBusy(true);
    setError("");
    const requestPatientId = patientId;
    const requestGeneration = patientGenerationRef.current;
    try {
      const current =
        currentPatientAttempt(attempt.current, requestPatientId) ??
        (() => {
          const key = crypto.randomUUID();
          const report = {
            request_key: key,
            confirmed_patient: true,
            ...(editing
              ? {}
              : {
                  source_name: form.source_name.trim(),
                  external_report_id: form.external_report_id.trim() || null,
                  service_request_revision_id: Number(
                    form.service_request_revision_id,
                  ),
                  specimen_identifier: form.specimen_identifier.trim() || null,
                  specimen_type_code: form.specimen_type_code.trim(),
                  specimen_type_display: form.specimen_type_display.trim(),
                  specimen_condition: form.specimen_condition,
                }),
            title: form.title.trim(),
            status: form.status,
            result_priority: form.result_priority,
            collected_at: new Date(form.collected_at).toISOString(),
            issued_at: new Date(form.issued_at).toISOString(),
            results: form.results.map((row) => ({
              name: row.name.trim(),
              code: row.code?.trim() || null,
              code_system: row.code_system?.trim() || null,
              code_version: row.code_version?.trim() || null,
              value: row.value.trim(),
              value_kind: row.value_kind ?? "text",
              absent_reason: row.absent_reason?.trim() || null,
              value_code: row.value_code?.trim() || null,
              value_code_system: row.value_code_system?.trim() || null,
              unit: row.unit?.trim() || null,
              unit_code: row.unit_code?.trim() || null,
              interpretation: row.interpretation?.trim() || null,
              reference_range: row.reference_range?.trim() || null,
              flag: row.flag?.trim() || null,
            })),
          };
          const next = editing
            ? {
                patientId: requestPatientId,
                key,
                path: `/api/clinic/patients/${patientId}/lab_reports/${editing.id}/versions`,
                body: {
                  lab_report_version: {
                    ...report,
                    expected_current_version_id: editing.current_version_id,
                  },
                },
              }
            : {
                patientId: requestPatientId,
                key,
                path: `/api/clinic/patients/${patientId}/lab_reports`,
                body: { lab_report: report },
              };
          attempt.current = next;
          return next;
        })();
      await api(current.path, { method: "POST", body: current.body });
      if (!requestIsCurrent(requestPatientId, requestGeneration)) return;
      attempt.current = null;
      setRetryPending(false);
      setEditing(null);
      setFormOpen(false);
      setForm(blankForm());
      setFormBaseline(blankForm());
      setNotice(
        editing ? "Correction version recorded." : "Lab report recorded.",
      );
      setReload((current) => current + 1);
    } catch (reason) {
      if (!requestIsCurrent(requestPatientId, requestGeneration)) return;
      if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500
      ) {
        if (reason.code !== "outcome_unconfirmed") attempt.current = null;
        setRetryPending(reason.code === "outcome_unconfirmed");
        setError(
          reason.code === "outcome_unconfirmed"
            ? "The save outcome is unknown. Retry this unchanged report before editing it."
            : reason.status === 409
              ? "This report changed. Reload it before recording a correction."
              : reason.message,
        );
      } else {
        setRetryPending(true);
        setError(
          "The save outcome is unknown. Retry this unchanged report before editing it.",
        );
      }
    } finally {
      if (requestIsCurrent(requestPatientId, requestGeneration)) setBusy(false);
    }
  };
  const review = async () => {
    const target = reviewTarget;
    if (
      !canReview ||
      !target ||
      !reviewConfirmed ||
      !reviewDisposition ||
      (reviewDisposition === "required" && !reviewFollowUpNote.trim()) ||
      (target.version.result_priority !== "routine" && !reviewFollowUpDueAt)
    )
      return;
    const requestPatientId = patientId;
    const requestGeneration = patientGenerationRef.current;
    const current = currentPatientAttempt(
      reviewAttempt.current,
      requestPatientId,
    ) ?? {
      patientId: requestPatientId,
      path: `/api/clinic/patients/${patientId}/lab_reports/${target.report.id}/versions/${target.version.id}/review`,
      body: {
        review: {
          request_key: crypto.randomUUID(),
          confirmed_patient: true,
          follow_up_disposition: reviewDisposition,
          ...(reviewFollowUpNote.trim()
            ? { follow_up_note: reviewFollowUpNote.trim() }
            : {}),
          ...(reviewFollowUpDueAt
            ? {
                follow_up_due_at: new Date(reviewFollowUpDueAt).toISOString(),
              }
            : {}),
        },
      },
    };
    reviewAttempt.current = current;
    setBusy(true);
    setError("");
    try {
      await api(current.path, {
        method: "POST",
        body: current.body,
      });
      if (!requestIsCurrent(requestPatientId, requestGeneration)) return;
      setNotice(
        reviewDisposition === "required"
          ? "Lab version reviewed and follow-up recorded."
          : "Lab version reviewed with no follow-up needed.",
      );
      reviewAttempt.current = null;
      setReviewRetryPending(false);
      setReviewTarget(null);
      setReload((current) => current + 1);
      if (history?.id === target.report.id) setHistory(null);
    } catch (reason) {
      if (!requestIsCurrent(requestPatientId, requestGeneration)) return;
      if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        reason.code !== "outcome_unconfirmed"
      ) {
        reviewAttempt.current = null;
        setReviewRetryPending(false);
        setError(reason.message);
      } else {
        setReviewRetryPending(true);
        setError(
          "The review outcome is unknown. Retry this exact review request.",
        );
      }
    } finally {
      if (requestIsCurrent(requestPatientId, requestGeneration)) setBusy(false);
    }
  };
  const recordFollowUp = async () => {
    const target = followUpTarget;
    if (
      !canReview ||
      !target ||
      target.action !== "set" ||
      !followUpDisposition ||
      (followUpDisposition === "required" && !followUpNote.trim()) ||
      (target.version.result_priority !== "routine" && !followUpDueAt)
    )
      return;
    const requestPatientId = patientId;
    const requestGeneration = patientGenerationRef.current;
    const current = currentPatientAttempt(
      followUpAttempt.current,
      requestPatientId,
    ) ?? {
      patientId: requestPatientId,
      path: `/api/clinic/patients/${patientId}/lab_reports/${target.report.id}/versions/${target.version.id}/follow_up`,
      body: {
        follow_up: {
          request_key: crypto.randomUUID(),
          disposition: followUpDisposition,
          ...(followUpNote.trim() ? { note: followUpNote.trim() } : {}),
          ...(followUpDueAt
            ? { due_at: new Date(followUpDueAt).toISOString() }
            : {}),
        },
      },
    };
    followUpAttempt.current = current;
    setBusy(true);
    setError("");
    try {
      await api(current.path, { method: "POST", body: current.body });
      if (!requestIsCurrent(requestPatientId, requestGeneration)) return;
      setNotice(
        followUpDisposition === "required"
          ? "Follow-up recorded."
          : "No follow-up needed recorded.",
      );
      followUpAttempt.current = null;
      setFollowUpRetryPending(false);
      setFollowUpTarget(null);
      setReload((value) => value + 1);
      if (history?.id === target.report.id) setHistory(null);
    } catch (reason) {
      if (!requestIsCurrent(requestPatientId, requestGeneration)) return;
      if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        reason.code !== "outcome_unconfirmed"
      ) {
        followUpAttempt.current = null;
        setFollowUpRetryPending(false);
        setError(reason.message);
      } else {
        setFollowUpRetryPending(true);
        setError("The follow-up outcome is unknown. Retry this exact request.");
      }
    } finally {
      if (requestIsCurrent(requestPatientId, requestGeneration)) setBusy(false);
    }
  };
  const completeFollowUp = async () => {
    const target = followUpTarget;
    if (
      !canReview ||
      !target ||
      target.action !== "complete" ||
      !followUpOutcome.trim() ||
      (target.version.result_priority === "critical" &&
        (!patientContactStatus ||
          (patientContactStatus !== "not_required" && !patientContactAt) ||
          (patientContactStatus === "informed" && !patientContactMethod)))
    )
      return;
    const requestPatientId = patientId;
    const requestGeneration = patientGenerationRef.current;
    const current = currentPatientAttempt(
      followUpAttempt.current,
      requestPatientId,
    ) ?? {
      patientId: requestPatientId,
      path: `/api/clinic/patients/${patientId}/lab_reports/${target.report.id}/versions/${target.version.id}/follow_up/complete`,
      body: {
        follow_up: {
          request_key: crypto.randomUUID(),
          outcome: followUpOutcome.trim(),
          patient_contact_status: patientContactStatus || null,
          patient_contact_method: patientContactMethod || null,
          patient_contact_at: patientContactAt
            ? new Date(patientContactAt).toISOString()
            : null,
        },
      },
    };
    followUpAttempt.current = current;
    setBusy(true);
    setError("");
    try {
      await api(current.path, { method: "POST", body: current.body });
      if (!requestIsCurrent(requestPatientId, requestGeneration)) return;
      setNotice("Lab follow-up completed.");
      followUpAttempt.current = null;
      setFollowUpRetryPending(false);
      setFollowUpTarget(null);
      setReload((value) => value + 1);
      if (history?.id === target.report.id) setHistory(null);
    } catch (reason) {
      if (!requestIsCurrent(requestPatientId, requestGeneration)) return;
      if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        reason.code !== "outcome_unconfirmed"
      ) {
        followUpAttempt.current = null;
        setFollowUpRetryPending(false);
        setError(reason.message);
      } else {
        setFollowUpRetryPending(true);
        setError("The follow-up outcome is unknown. Retry this exact request.");
      }
    } finally {
      if (requestIsCurrent(requestPatientId, requestGeneration)) setBusy(false);
    }
  };
  const openHistory = async (
    report: Pick<LabReport, "id">,
    sourceVersion: number | null = null,
  ) => {
    const requestPatientId = patientId;
    const requestGeneration = patientGenerationRef.current;
    setError("");
    setHistorySourceVersion(sourceVersion);
    try {
      const result = await api<{ report: LabReport }>(
        `/api/clinic/patients/${patientId}/lab_reports/${report.id}`,
      );
      if (!requestIsCurrent(requestPatientId, requestGeneration)) return;
      setHistory(result.report);
    } catch (reason) {
      if (!requestIsCurrent(requestPatientId, requestGeneration)) return;
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load report history.",
      );
    }
  };
  const compareResult = (report: LabReport, resultIndex: number) => {
    setHistory(null);
    setResultHistory({
      patientId,
      reportId: report.id,
      versionId: report.current_version_id,
      resultIndex,
    });
  };
  const formDirty = JSON.stringify(form) !== JSON.stringify(formBaseline);
  const closeForm = () => {
    if (busy || retryPending) return;
    setFormOpen(false);
    setEditing(null);
    setForm(blankForm());
    setFormBaseline(blankForm());
  };
  const requestCloseForm = () => {
    if (busy || retryPending) return;
    if (formDirty) setDiscardOpen(true);
    else closeForm();
  };
  if (!canRead)
    return (
      <Alert severity="warning">
        Lab report access is not enabled for this account.
      </Alert>
    );
  return (
    <Stack spacing={2}>
      <Box>
        <Typography component="h2" variant="h6">
          Lab reports
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Record external results against the exact active order and collected
          specimen. Acknowledgment and follow-up remain separate actions.
        </Typography>
      </Box>
      {error && (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setReload((current) => current + 1)}
            >
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {directReviewError && (
        <Alert severity="warning">{directReviewError}</Alert>
      )}
      {notice && <Alert severity="success">{notice}</Alert>}
      {canWrite && encounterId !== undefined && labOrders.length === 0 && (
        <Alert severity="info">
          Create and activate a laboratory order in the clinical plan before
          recording an external result.
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{ justifyContent: "space-between" }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="subtitle1">Recorded reports</Typography>
              {reportsStale && (
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  label="Prior results — refresh failed"
                />
              )}
            </Stack>
            {canCreate && (
              <Button
                startIcon={<AddIcon />}
                disabled={formOpen || busy || retryPending}
                onClick={() => {
                  setEditing(null);
                  const nextForm = blankForm();
                  setForm(nextForm);
                  setFormBaseline(nextForm);
                  setFormOpen(true);
                }}
              >
                New report
              </Button>
            )}
          </Stack>
          {!data ? (
            <Typography color="text.secondary">Loading reports…</Typography>
          ) : data.reports.length === 0 ? (
            <Typography color="text.secondary">
              No lab reports are recorded for this patient.
            </Typography>
          ) : (
            <Stack
              component="ul"
              spacing={1.5}
              sx={{ listStyle: "none", m: 0, p: 0 }}
            >
              {data.reports.map((report) => (
                <Paper
                  component="li"
                  key={report.id}
                  variant="outlined"
                  sx={{ p: 2 }}
                >
                  <Stack spacing={1.5}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      sx={{
                        alignItems: { sm: "flex-start" },
                        justifyContent: "space-between",
                      }}
                    >
                      <Box>
                        <Typography sx={{ fontWeight: 600 }}>
                          {report.current_version.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {report.source_name} · {report.current_version.status}{" "}
                          · {formatDateTime(report.current_version.issued_at)}
                        </Typography>
                        {report.specimen && (
                          <Typography variant="body2" color="text.secondary">
                            Order #{report.service_request_revision_id} ·{" "}
                            {report.specimen.specimen_type_display} ·{" "}
                            {optionLabel(report.specimen.condition_code)}
                          </Typography>
                        )}
                      </Box>
                      <Stack
                        direction="row"
                        spacing={0.75}
                        sx={{ flexWrap: "wrap", gap: 0.75 }}
                      >
                        <Chip
                          color={
                            report.current_version.result_priority ===
                            "critical"
                              ? "error"
                              : report.current_version.result_priority ===
                                  "urgent"
                                ? "warning"
                                : "default"
                          }
                          label={optionLabel(
                            report.current_version.result_priority,
                          )}
                          size="small"
                        />
                        <Chip
                          color={
                            report.current_version.reviewed_at
                              ? "success"
                              : "warning"
                          }
                          label={
                            report.current_version.reviewed_at
                              ? "Reviewed"
                              : "Needs review"
                          }
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          label={
                            report.current_version.reviewed_at
                              ? followUpLabel(report.current_version.follow_up)
                              : "Follow-up set during review"
                          }
                          size="small"
                          variant="outlined"
                        />
                        {report.open_prior_follow_ups.length > 0 && (
                          <Chip
                            color="warning"
                            label={`${report.open_prior_follow_ups.length} earlier version follow-up${report.open_prior_follow_ups.length === 1 ? "" : "s"} open`}
                            size="small"
                          />
                        )}
                      </Stack>
                      <LabReportActionsPanel
                        key={`${report.id}-${report.current_version_id}`}
                        report={report}
                        reports={data?.reports ?? []}
                        canWrite={canReview}
                        onChanged={() => setReload((value) => value + 1)}
                      />
                    </Stack>
                    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                      {!report.current_version.reviewed_at && canReview && (
                        <Button
                          size="small"
                          disabled={busy || reviewRetryPending}
                          onClick={() => {
                            setError("");
                            setReviewTarget({
                              report,
                              version: report.current_version,
                            });
                            setReviewConfirmed(false);
                            setReviewDisposition(null);
                            setReviewFollowUpNote("");
                          }}
                          variant="contained"
                        >
                          Review
                        </Button>
                      )}
                      {report.current_version.reviewed_at &&
                        report.current_version.follow_up === null &&
                        canReview && (
                          <Button
                            size="small"
                            disabled={busy || followUpRetryPending}
                            onClick={() => {
                              setError("");
                              setFollowUpTarget({
                                report,
                                version: report.current_version,
                                action: "set",
                              });
                              setFollowUpDisposition(null);
                              setFollowUpNote("");
                            }}
                          >
                            Set follow-up
                          </Button>
                        )}
                      {report.current_version.follow_up?.state === "open" &&
                        canReview && (
                          <Button
                            size="small"
                            disabled={busy || followUpRetryPending}
                            onClick={() => {
                              setError("");
                              setFollowUpTarget({
                                report,
                                version: report.current_version,
                                action: "complete",
                              });
                              setFollowUpOutcome("");
                            }}
                          >
                            Complete follow-up
                          </Button>
                        )}
                      <Button
                        size="small"
                        startIcon={<HistoryOutlinedIcon />}
                        onClick={() => void openHistory(report)}
                      >
                        {report.open_prior_follow_ups.length > 0
                          ? "View open prior follow-up"
                          : "Report history"}
                      </Button>
                      {canWrite && (
                        <Button
                          size="small"
                          disabled={formOpen || busy || retryPending}
                          onClick={() => {
                            setEditing(report);
                            const nextForm = versionForm(report);
                            setForm(nextForm);
                            setFormBaseline(nextForm);
                            setFormOpen(true);
                          }}
                        >
                          Correct
                        </Button>
                      )}
                    </Stack>
                    <Box>
                      <Typography color="text.secondary" variant="caption">
                        Recent results
                      </Typography>
                      {report.current_version.results
                        .slice(0, 2)
                        .map((row, resultIndex) => (
                          <Stack
                            key={`${report.current_version_id}-${resultIndex}`}
                            direction={{ xs: "column", sm: "row" }}
                            spacing={0.5}
                            sx={{
                              alignItems: { sm: "center" },
                              justifyContent: "space-between",
                              py: 0.5,
                            }}
                          >
                            <Typography variant="body2">
                              {row.name}:{" "}
                              {row.value_kind === "absent"
                                ? `Not available: ${row.absent_reason}`
                                : row.value}
                              {row.unit ? ` ${row.unit}` : ""}
                              {row.reference_range
                                ? ` (${row.reference_range})`
                                : ""}
                              {row.flag ? ` · ${row.flag}` : ""}
                            </Typography>
                            {(row.code ||
                              row.value_code ||
                              row.unit_code ||
                              row.interpretation) && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {[
                                  row.code &&
                                    `Test code: ${row.code}${row.code_system ? ` (${row.code_system}${row.code_version ? ` ${row.code_version}` : ""})` : ""}`,
                                  row.value_code &&
                                    `Value code: ${row.value_code}${row.value_code_system ? ` (${row.value_code_system})` : ""}`,
                                  row.unit_code &&
                                    `UCUM unit: ${row.unit_code}`,
                                  row.interpretation &&
                                    `Source interpretation: ${row.interpretation}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </Typography>
                            )}
                            {report.current_version.status !== "cancelled" && (
                              <Button
                                size="small"
                                aria-label={`Compare ${row.name} results`}
                                disabled={busy}
                                onClick={() =>
                                  compareResult(report, resultIndex)
                                }
                              >
                                Compare results
                              </Button>
                            )}
                          </Stack>
                        ))}
                      {report.current_version.results.length > 2 && (
                        <Button
                          size="small"
                          onClick={() => void openHistory(report)}
                        >
                          View all {report.current_version.results.length}{" "}
                          results
                        </Button>
                      )}
                    </Box>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>
      {data && data.pagination.total > data.pagination.per_page && (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Button
            size="small"
            disabled={page <= 1 || busy || retryPending}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <Typography variant="body2" color="text.secondary">
            Page {data.pagination.page} of{" "}
            {Math.ceil(data.pagination.total / data.pagination.per_page)}
          </Typography>
          <Button
            size="small"
            disabled={
              data.pagination.page >=
                Math.ceil(data.pagination.total / data.pagination.per_page) ||
              busy ||
              retryPending
            }
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </Stack>
      )}
      {canWrite && formOpen && (
        <LabForm
          form={form}
          setForm={setForm}
          editing={editing}
          busy={busy}
          disabled={busy || retryPending}
          timezone={practice.timezone}
          labOrders={labOrders}
          onCancel={requestCloseForm}
          onSave={() => void save()}
        />
      )}
      {resultHistory?.patientId === patientId && (
        <LabResultHistory
          key={`${patientId}:${resultHistory.reportId}:${resultHistory.versionId}:${resultHistory.resultIndex}`}
          {...resultHistory}
          patientName={patientName}
          onClose={() => setResultHistory(null)}
          onOpenReport={(reportId, versionId) => {
            setResultHistory(null);
            void openHistory({ id: reportId }, versionId);
          }}
        />
      )}
      <Dialog
        open={history !== null}
        onClose={() => setHistory(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Report history</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {history && (
              <Typography>
                {patientName || `Patient #${patientId}`} ·{" "}
                {history.current_version.title} · {history.source_name}
              </Typography>
            )}
            {history &&
              historySourceVersion !== null &&
              history.current_version_id !== historySourceVersion && (
                <Alert severity="warning">
                  This report changed after the comparison was loaded. Review
                  the current version below.
                </Alert>
              )}
            {history?.versions?.map((version) => (
              <Paper key={version.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  sx={{ justifyContent: "space-between" }}
                >
                  <Box>
                    <Typography sx={{ fontWeight: 600 }}>
                      Version {version.version_number} · {version.status}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Recorded {formatDateTime(version.recorded_at)}
                    </Typography>
                  </Box>
                  {!version.reviewed_at &&
                    version.id === history?.current_version_id &&
                    canReview && (
                      <Button
                        disabled={busy}
                        onClick={() => {
                          if (history) {
                            setReviewTarget({ report: history, version });
                            setReviewConfirmed(false);
                            setReviewDisposition(null);
                            setReviewFollowUpNote("");
                          }
                        }}
                      >
                        Mark reviewed
                      </Button>
                    )}
                  {version.reviewed_at &&
                    version.id === history?.current_version_id &&
                    version.follow_up === null &&
                    canReview && (
                      <Button
                        disabled={busy || followUpRetryPending}
                        onClick={() => {
                          if (history) {
                            setFollowUpTarget({
                              report: history,
                              version,
                              action: "set",
                            });
                            setFollowUpDisposition(null);
                            setFollowUpNote("");
                          }
                        }}
                      >
                        Set follow-up
                      </Button>
                    )}
                  {version.follow_up?.state === "open" && canReview && (
                    <Button
                      disabled={busy || followUpRetryPending}
                      onClick={() => {
                        if (history) {
                          setFollowUpTarget({
                            report: history,
                            version,
                            action: "complete",
                          });
                          setFollowUpOutcome("");
                        }
                      }}
                    >
                      Complete follow-up
                    </Button>
                  )}
                </Stack>
                {version.reviewed_at && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    {followUpLabel(version.follow_up)}
                    {version.follow_up?.instructions
                      ? ` · Instructions: ${version.follow_up.instructions}`
                      : ""}
                    {version.follow_up?.outcome
                      ? ` · Outcome: ${version.follow_up.outcome}`
                    : ""}
                  </Typography>
                )}
                {version.follow_up?.contact_attempts.map((attempt) => (
                  <Typography key={attempt.id} variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Contact attempt: {attempt.contact_method.replaceAll("_", " ")} · {attempt.outcome.replaceAll("_", " ")} · {new Date(attempt.attempted_at).toLocaleString()}.
                    {` Next action #${attempt.next_action.task_id} owned by membership ${attempt.next_action.assigned_to_membership_id ?? "unassigned"}.`}
                  </Typography>
                ))}
                {version.results.map((row, resultIndex) => (
                  <Stack
                    key={`${version.id}-${resultIndex}`}
                    direction={{ xs: "column", sm: "row" }}
                    sx={{
                      justifyContent: "space-between",
                      alignItems: { sm: "center" },
                      gap: 1,
                    }}
                  >
                    <Typography variant="body2">
                      {row.name}:{" "}
                      {row.value_kind === "absent"
                        ? `Not available: ${row.absent_reason}`
                        : row.value}
                      {row.unit ? ` ${row.unit}` : ""} ·{" "}
                      {row.reference_range || "Range not recorded"}
                      {row.flag ? ` · ${row.flag}` : ""}
                    </Typography>
                    {(row.code ||
                      row.value_code ||
                      row.unit_code ||
                      row.interpretation) && (
                      <Typography variant="caption" color="text.secondary">
                        {[
                          row.code &&
                            `Test code: ${row.code}${row.code_system ? ` (${row.code_system}${row.code_version ? ` ${row.code_version}` : ""})` : ""}`,
                          row.value_code &&
                            `Value code: ${row.value_code}${row.value_code_system ? ` (${row.value_code_system})` : ""}`,
                          row.unit_code && `UCUM unit: ${row.unit_code}`,
                          row.interpretation &&
                            `Source interpretation: ${row.interpretation}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Typography>
                    )}
                    {history &&
                      version.id === history.current_version_id &&
                      version.status !== "cancelled" && (
                        <Button
                          size="small"
                          aria-label={`Compare ${row.name} results`}
                          disabled={busy}
                          onClick={() => compareResult(history, resultIndex)}
                        >
                          Compare results
                        </Button>
                      )}
                  </Stack>
                ))}
                {history && (
                  <LabReportActionsPanel
                    key={`history-${version.id}`}
                    report={{
                      ...history,
                      current_version: version,
                      current_version_id: version.id,
                    }}
                    reports={data?.reports ?? []}
                    canWrite={canReview}
                    onChanged={() => {
                      setReload((value) => value + 1);
                      void openHistory(history);
                    }}
                  />
                )}
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setHistory(null)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={discardOpen}
        onClose={() => !busy && !retryPending && setDiscardOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Discard report changes?</DialogTitle>
        <DialogContent dividers>
          <Typography>
            Your unsaved report changes will be discarded.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={busy || retryPending}
            onClick={() => setDiscardOpen(false)}
          >
            Keep editing
          </Button>
          <Button
            color="error"
            disabled={busy || retryPending}
            onClick={() => {
              setDiscardOpen(false);
              closeForm();
            }}
          >
            Discard changes
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={reviewTarget !== null}
        onClose={() => !busy && !reviewRetryPending && setReviewTarget(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Review lab version</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            {error && <Alert severity="error">{error}</Alert>}
            {reviewTarget && (
              <>
                <Typography>
                  {patientName ? `${patientName} · ` : ""}Patient #{patientId} ·{" "}
                  {reviewTarget.version.title} · Version{" "}
                  {reviewTarget.version.version_number}
                </Typography>
                {reviewTarget.version.results.map((row) => (
                  <Typography key={row.name} variant="body2">
                    {row.name}:{" "}
                    {row.value_kind === "absent"
                      ? `Not available: ${row.absent_reason}`
                      : row.value}
                    {row.unit ? ` ${row.unit}` : ""} ·{" "}
                    {row.reference_range || "Range not recorded"}
                    {row.flag ? ` · ${row.flag}` : ""}
                  </Typography>
                ))}
                {reviewTarget.version.result_priority !== "routine" && (
                  <Alert
                    severity={
                      reviewTarget.version.result_priority === "critical"
                        ? "error"
                        : "warning"
                    }
                  >
                    This source-marked {reviewTarget.version.result_priority}{" "}
                    result requires acknowledgment, escalation instructions, and
                    a due time.
                  </Alert>
                )}
              </>
            )}
            <FormControlLabel
              control={
                <Checkbox
                  checked={reviewConfirmed}
                  disabled={busy || reviewRetryPending}
                  onChange={(event) => setReviewConfirmed(event.target.checked)}
                />
              }
              label="I confirmed this lab version belongs to the selected patient."
            />
            <Box>
              <FormLabel required>Follow-up decision</FormLabel>
              <RadioGroup
                aria-label="Follow-up decision"
                value={reviewDisposition ?? ""}
                onChange={(event) =>
                  setReviewDisposition(
                    event.target.value as "required" | "not_required",
                  )
                }
              >
                <FormControlLabel
                  value="not_required"
                  disabled={
                    busy ||
                    reviewRetryPending ||
                    reviewTarget?.version.result_priority !== "routine"
                  }
                  control={<Radio />}
                  label="No follow-up needed"
                />
                <FormControlLabel
                  value="required"
                  disabled={busy || reviewRetryPending}
                  control={<Radio />}
                  label="Follow-up needed"
                />
              </RadioGroup>
            </Box>
            <TextField
              label={
                reviewDisposition === "required"
                  ? "Follow-up instructions"
                  : "Follow-up note"
              }
              required={reviewDisposition === "required"}
              multiline
              minRows={3}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
              disabled={!reviewDisposition || busy || reviewRetryPending}
              value={reviewFollowUpNote}
              onChange={(event) => setReviewFollowUpNote(event.target.value)}
              helperText={
                reviewDisposition === "required"
                  ? "Enter concise instructions for the follow-up."
                  : "Optional note for the recorded decision."
              }
            />
            {reviewTarget?.version.result_priority !== "routine" && (
              <TextField
                label="Escalation due"
                type="datetime-local"
                required
                value={reviewFollowUpDueAt}
                onChange={(event) => setReviewFollowUpDueAt(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                disabled={busy || reviewRetryPending}
                helperText={`Your local time · Clinic zone: ${practice.timezone}`}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={busy || reviewRetryPending}
            onClick={() => setReviewTarget(null)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={
              !reviewConfirmed ||
              !reviewDisposition ||
              (reviewDisposition === "required" &&
                !reviewFollowUpNote.trim()) ||
              (reviewTarget?.version.result_priority !== "routine" &&
                !reviewFollowUpDueAt) ||
              busy
            }
            onClick={() => void review()}
          >
            {reviewRetryPending ? "Retry exact review" : "Mark reviewed"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={followUpTarget !== null}
        onClose={() =>
          !busy && !followUpRetryPending && setFollowUpTarget(null)
        }
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {followUpTarget?.action === "complete"
            ? "Complete lab follow-up"
            : "Set lab follow-up"}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            {error && <Alert severity="error">{error}</Alert>}
            {followUpTarget && (
              <Typography>
                {patientName ? `${patientName} · ` : ""}Patient #{patientId} ·{" "}
                {followUpTarget.version.title} · Version{" "}
                {followUpTarget.version.version_number}
              </Typography>
            )}
            {followUpTarget?.action === "complete" &&
              followUpTarget.version.id !==
                followUpTarget.report.current_version_id && (
                <Alert severity="warning">
                  This follow-up belongs to an earlier report version. Review
                  the corrected result and document what happened to the
                  patient-contact work before completing it.
                </Alert>
              )}
            {followUpTarget?.action === "set" ? (
              <>
                <Box>
                  <FormLabel required>Follow-up decision</FormLabel>
                  <RadioGroup
                    aria-label="Follow-up decision"
                    value={followUpDisposition ?? ""}
                    onChange={(event) =>
                      setFollowUpDisposition(
                        event.target.value as "required" | "not_required",
                      )
                    }
                  >
                    <FormControlLabel
                      value="not_required"
                      disabled={
                        busy ||
                        followUpRetryPending ||
                        followUpTarget.version.result_priority !== "routine"
                      }
                      control={<Radio />}
                      label="No follow-up needed"
                    />
                    <FormControlLabel
                      value="required"
                      disabled={busy || followUpRetryPending}
                      control={<Radio />}
                      label="Follow-up needed"
                    />
                  </RadioGroup>
                </Box>
                <TextField
                  label={
                    followUpDisposition === "required"
                      ? "Follow-up instructions"
                      : "Follow-up note"
                  }
                  required={followUpDisposition === "required"}
                  multiline
                  minRows={3}
                  slotProps={{ htmlInput: { maxLength: 1000 } }}
                  disabled={
                    !followUpDisposition || busy || followUpRetryPending
                  }
                  value={followUpNote}
                  onChange={(event) => setFollowUpNote(event.target.value)}
                  helperText={
                    followUpDisposition === "required"
                      ? "Enter concise instructions for the follow-up."
                      : "Optional note for the recorded decision."
                  }
                />
                {followUpTarget.version.result_priority !== "routine" && (
                  <TextField
                    label="Escalation due"
                    type="datetime-local"
                    required
                    value={followUpDueAt}
                    onChange={(event) => setFollowUpDueAt(event.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                    disabled={busy || followUpRetryPending}
                  />
                )}
              </>
            ) : (
              <>
                {followUpTarget?.version.follow_up?.instructions && (
                  <Typography variant="body2" color="text.secondary">
                    Follow-up instructions:{" "}
                    {followUpTarget.version.follow_up.instructions}
                  </Typography>
                )}
                <TextField
                  label="Follow-up outcome"
                  required
                  multiline
                  minRows={3}
                  slotProps={{ htmlInput: { maxLength: 1000 } }}
                  disabled={busy || followUpRetryPending}
                  value={followUpOutcome}
                  onChange={(event) => setFollowUpOutcome(event.target.value)}
                  helperText="Record the outcome before completing this follow-up."
                />
                <TextField
                  select
                  label="Patient contact outcome"
                  required={
                    followUpTarget?.version.result_priority === "critical"
                  }
                  value={patientContactStatus}
                  onChange={(event) =>
                    setPatientContactStatus(event.target.value)
                  }
                  disabled={busy || followUpRetryPending}
                >
                  <MenuItem value="">Not recorded</MenuItem>
                  <MenuItem value="informed">Patient informed</MenuItem>
                  <MenuItem value="not_reached">Not reached</MenuItem>
                  <MenuItem value="not_required">Contact not required</MenuItem>
                </TextField>
                {patientContactStatus === "informed" && (
                  <TextField
                    select
                    label="Contact method"
                    required
                    value={patientContactMethod}
                    onChange={(event) =>
                      setPatientContactMethod(event.target.value)
                    }
                    disabled={busy || followUpRetryPending}
                  >
                    {["portal", "phone", "in_person", "letter", "other"].map(
                      (method) => (
                        <MenuItem key={method} value={method}>
                          {optionLabel(method)}
                        </MenuItem>
                      ),
                    )}
                  </TextField>
                )}
                {patientContactStatus &&
                  patientContactStatus !== "not_required" && (
                    <TextField
                      label="Contact attempted at"
                      type="datetime-local"
                      required
                      value={patientContactAt}
                      onChange={(event) =>
                        setPatientContactAt(event.target.value)
                      }
                      slotProps={{ inputLabel: { shrink: true } }}
                      disabled={busy || followUpRetryPending}
                    />
                  )}
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={busy || followUpRetryPending}
            onClick={() => setFollowUpTarget(null)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={
              busy ||
              (followUpTarget?.action === "set"
                ? !followUpDisposition ||
                  (followUpDisposition === "required" &&
                    !followUpNote.trim()) ||
                  (followUpTarget?.version.result_priority !== "routine" &&
                    !followUpDueAt)
                : !followUpOutcome.trim() ||
                  (followUpTarget?.version.result_priority === "critical" &&
                    (!patientContactStatus ||
                      (patientContactStatus !== "not_required" &&
                        !patientContactAt) ||
                      (patientContactStatus === "informed" &&
                        !patientContactMethod))))
            }
            onClick={() =>
              void (followUpTarget?.action === "complete"
                ? completeFollowUp()
                : recordFollowUp())
            }
          >
            {followUpRetryPending
              ? "Retry exact request"
              : followUpTarget?.action === "complete"
                ? "Complete follow-up"
                : "Record decision"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function LabForm({
  form,
  setForm,
  editing,
  busy,
  disabled,
  timezone,
  labOrders,
  onCancel,
  onSave,
}: {
  form: Form;
  setForm: (form: Form) => void;
  editing: LabReport | null;
  busy: boolean;
  disabled: boolean;
  timezone: string;
  labOrders: ServiceRequestRevision[];
  onCancel: () => void;
  onSave: () => void;
}) {
  const update = (changes: Partial<Form>) => {
    if (!disabled) setForm({ ...form, ...changes });
  };
  const result = (index: number, changes: Partial<LabResult>) =>
    update({
      results: form.results.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...changes } : row,
      ),
    });
  return (
    <Paper
      component="section"
      variant="outlined"
      sx={{ minWidth: 0, p: 2, width: "100%" }}
    >
      <Stack spacing={1.5}>
        <Typography variant="subtitle1">
          {editing
            ? `Correction for ${editing.current_version.title}`
            : "Record lab report"}
        </Typography>
        <Box
          component="fieldset"
          disabled={disabled}
          sx={{
            border: 0,
            display: "grid",
            gap: 1.5,
            m: 0,
            minWidth: 0,
            p: 0,
            "& .MuiTextField-root": { minWidth: 0 },
          }}
        >
          {!editing && (
            <>
              <TextField
                select
                label="Authorized laboratory order"
                required
                value={form.service_request_revision_id}
                onChange={(event) => {
                  const order = labOrders.find(
                    (candidate) => candidate.id === Number(event.target.value),
                  );
                  update({
                    service_request_revision_id: event.target.value,
                    title: form.title || order?.requested_display || "",
                    source_name: form.source_name || order?.destination || "",
                  });
                }}
              >
                {labOrders.map((order) => (
                  <MenuItem key={order.id} value={order.id.toString()}>
                    {order.requested_display} · {optionLabel(order.priority)}
                    {order.destination ? ` · ${order.destination}` : ""}
                  </MenuItem>
                ))}
              </TextField>
              <Box
                sx={{
                  display: "grid",
                  gap: 1.5,
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                }}
              >
                <TextField
                  label="Specimen type"
                  required
                  value={form.specimen_type_display}
                  onChange={(event) =>
                    update({ specimen_type_display: event.target.value })
                  }
                />
                <TextField
                  select
                  label="Specimen condition"
                  required
                  value={form.specimen_condition}
                  onChange={(event) =>
                    update({
                      specimen_condition: event.target
                        .value as Form["specimen_condition"],
                    })
                  }
                >
                  {["satisfactory", "compromised", "unknown", "rejected"].map(
                    (condition) => (
                      <MenuItem key={condition} value={condition}>
                        {optionLabel(condition)}
                      </MenuItem>
                    ),
                  )}
                </TextField>
                <TextField
                  label="Specimen type code"
                  required
                  value={form.specimen_type_code}
                  onChange={(event) =>
                    update({ specimen_type_code: event.target.value })
                  }
                  helperText="Use the code supplied by the laboratory or configured catalog."
                />
                <TextField
                  label="Specimen identifier"
                  value={form.specimen_identifier}
                  onChange={(event) =>
                    update({ specimen_identifier: event.target.value })
                  }
                />
              </Box>
            </>
          )}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Source"
              required
              value={form.source_name}
              disabled={Boolean(editing)}
              onChange={(event) => update({ source_name: event.target.value })}
              fullWidth
            />
            <TextField
              label="Accession or external ID"
              value={form.external_report_id}
              disabled={Boolean(editing)}
              onChange={(event) =>
                update({ external_report_id: event.target.value })
              }
              fullWidth
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Title"
              required
              value={form.title}
              onChange={(event) => update({ title: event.target.value })}
              fullWidth
            />
            <TextField
              select
              label="Status"
              required
              value={form.status}
              onChange={(event) =>
                update({ status: event.target.value as Form["status"] })
              }
              sx={{ minWidth: 160 }}
            >
              {[
                "preliminary",
                "final",
                "amended",
                "corrected",
                "cancelled",
              ].map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Source priority"
              required
              value={form.result_priority}
              onChange={(event) =>
                update({
                  result_priority: event.target
                    .value as Form["result_priority"],
                })
              }
              sx={{ minWidth: 160 }}
            >
              {["routine", "urgent", "critical"].map((priority) => (
                <MenuItem key={priority} value={priority}>
                  {optionLabel(priority)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Collected at"
              required
              type="datetime-local"
              value={
                form.collected_at ? localDateTimeInput(form.collected_at) : ""
              }
              onChange={(event) => update({ collected_at: event.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText={`Your local time · Clinic zone: ${timezone}`}
            />
            <TextField
              label="Reported at"
              required
              type="datetime-local"
              value={form.issued_at ? localDateTimeInput(form.issued_at) : ""}
              onChange={(event) => update({ issued_at: event.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText={`Your local time · Clinic zone: ${timezone}`}
            />
          </Stack>
          {form.results.map((row, index) => (
            <Box
              key={index}
              sx={{
                display: "grid",
                gap: 1,
                gridTemplateColumns: {
                  xs: "minmax(0, 1fr)",
                  sm: "repeat(2, minmax(0, 1fr))",
                  xl: "repeat(5, minmax(0, 1fr))",
                },
              }}
            >
              <TextField
                fullWidth
                label="Test"
                required
                value={row.name}
                onChange={(event) =>
                  result(index, { name: event.target.value })
                }
              />
              <TextField
                fullWidth
                label="Value"
                required={row.value_kind !== "absent"}
                disabled={row.value_kind === "absent"}
                value={row.value}
                helperText={
                  row.value_kind === "boolean"
                    ? "Enter true or false as supplied by the source."
                    : row.value_kind === "range"
                      ? "Enter two decimal bounds, such as 1.0-2.5."
                      : undefined
                }
                onChange={(event) =>
                  result(index, { value: event.target.value })
                }
              />
              <TextField
                select
                label="Value type"
                value={row.value_kind ?? "text"}
                onChange={(event) =>
                  result(index, {
                    value_kind: event.target.value as LabResult["value_kind"],
                    value: event.target.value === "absent" ? "" : row.value,
                    absent_reason: null,
                    value_code: null,
                    value_code_system: null,
                  })
                }
              >
                {["text", "numeric", "coded", "boolean", "range", "absent"].map(
                  (value) => (
                    <MenuItem key={value} value={value}>
                      {optionLabel(value)}
                    </MenuItem>
                  ),
                )}
              </TextField>
              <TextField
                fullWidth
                label="Test code"
                value={row.code ?? ""}
                onChange={(event) =>
                  result(index, { code: event.target.value || null })
                }
              />
              <TextField
                fullWidth
                label="Test code system"
                value={row.code_system ?? ""}
                onChange={(event) =>
                  result(index, { code_system: event.target.value || null })
                }
              />
              <TextField
                fullWidth
                label="Test code version"
                value={row.code_version ?? ""}
                onChange={(event) =>
                  result(index, { code_version: event.target.value || null })
                }
              />
              {row.value_kind === "absent" && (
                <TextField
                  label="Reason result is unavailable"
                  required
                  value={row.absent_reason ?? ""}
                  onChange={(event) =>
                    result(index, { absent_reason: event.target.value })
                  }
                />
              )}
              {row.value_kind === "coded" && (
                <>
                  <TextField
                    label="Value code"
                    required
                    value={row.value_code ?? ""}
                    onChange={(event) =>
                      result(index, { value_code: event.target.value })
                    }
                  />
                  <TextField
                    label="Value code system"
                    required
                    value={row.value_code_system ?? ""}
                    onChange={(event) =>
                      result(index, { value_code_system: event.target.value })
                    }
                  />
                </>
              )}
              <TextField
                fullWidth
                label="Unit"
                value={row.unit ?? ""}
                onChange={(event) =>
                  result(index, { unit: event.target.value || null })
                }
              />
              <TextField
                fullWidth
                label="UCUM unit code"
                value={row.unit_code ?? ""}
                onChange={(event) =>
                  result(index, { unit_code: event.target.value || null })
                }
              />
              <TextField
                fullWidth
                label="Source interpretation"
                value={row.interpretation ?? ""}
                onChange={(event) =>
                  result(index, {
                    interpretation: event.target.value || null,
                  })
                }
              />
              <TextField
                fullWidth
                label="Reference range"
                value={row.reference_range ?? ""}
                onChange={(event) =>
                  result(index, { reference_range: event.target.value || null })
                }
              />
              <TextField
                fullWidth
                label="Reported flag"
                value={row.flag ?? ""}
                onChange={(event) =>
                  result(index, { flag: event.target.value || null })
                }
              />
            </Box>
          ))}
          <Button
            size="small"
            startIcon={<AddIcon />}
            disabled={form.results.length >= 100}
            onClick={() =>
              update({ results: [...form.results, blankResult()] })
            }
          >
            Add result
          </Button>
          <FormControlLabel
            control={
              <Checkbox
                checked={form.confirmed}
                onChange={(event) =>
                  update({ confirmed: event.target.checked })
                }
              />
            }
            label="I confirmed this report belongs to the selected patient."
          />
        </Box>
        <Button variant="contained" disabled={busy} onClick={onSave}>
          {busy
            ? "Saving…"
            : disabled
              ? "Retry unchanged report"
              : editing
                ? "Record correction"
                : "Record report"}
        </Button>
        <Button disabled={busy || disabled} onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    </Paper>
  );
}
