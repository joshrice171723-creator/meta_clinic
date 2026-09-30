import { Alert, Button, Stack, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, SESSION_CHANGED_EVENT } from "../../api/client";
import type { ReportExportReceipt } from "../../api/contracts";
import { LoadState, useResource } from "../../shared/ui";

type Filters = Partial<Record<"date" | "site_id" | "status", string | number>>;
type Attempt = { reportId: string; filters: Filters; requestKey: string };
type Owner = { generation: number };

export function ReportExportControl({
  reportId,
  filters,
  label,
}: {
  reportId: string;
  filters: Filters;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<ReportExportReceipt | null>(null);
  const [pending, setPending] = useState<Attempt | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const active = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const clear = () => {
      generation.current += 1;
      active.current = false;
      setPending(null);
      setReceipt(null);
      setError("");
      setBusy(false);
      setHistoryOpen(false);
    };
    window.addEventListener(SESSION_CHANGED_EVENT, clear);
    return () => {
      mounted.current = false;
      generation.current += 1;
      window.removeEventListener(SESSION_CHANGED_EVENT, clear);
    };
  }, []);

  const ownership = (): Owner => ({ generation: generation.current });
  const accepts = (owner: Owner) =>
    mounted.current && owner.generation === generation.current;

  const download = async (saved: ReportExportReceipt, owner: Owner) => {
    const result = await api<{
      export: ReportExportReceipt;
      artifact_csv: string;
    }>(saved.download_url);
    if (!accepts(owner)) return;
    const bytes = new TextEncoder().encode(result.artifact_csv);
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    if (!accepts(owner)) return;
    if (
      result.export.id !== saved.id ||
      digest !== saved.artifact_digest ||
      bytes.byteLength !== saved.artifact_bytes
    ) {
      throw new Error(
        "The artifact did not match its saved receipt. Download was withheld.",
      );
    }
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = saved.filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const issue = async () => {
    if (active.current) return;
    const attempt = pending ?? {
      reportId,
      filters: { ...filters },
      requestKey: crypto.randomUUID(),
    };
    const owner = ownership();
    active.current = true;
    setBusy(true);
    setError("");
    setPending(attempt);
    let committed = false;
    try {
      const result = await api<{ export: ReportExportReceipt }>(
        "/api/clinic/report_exports",
        {
          method: "POST",
          body: {
            export: {
              report_id: attempt.reportId,
              scope: "all_filtered_rows",
              filters: attempt.filters,
              request_key: attempt.requestKey,
            },
          },
        },
      );
      if (!accepts(owner)) return;
      committed = true;
      setReceipt(result.export);
      setPending(null);
      await download(result.export, owner);
    } catch (reason) {
      if (!accepts(owner)) return;
      const unknown =
        !committed &&
        (!(reason instanceof ApiError) ||
          reason.status === 408 ||
          reason.status >= 500 ||
          reason.code === "outcome_unconfirmed");
      if (!unknown) setPending(null);
      setError(
        committed
          ? "Export issued; download could not be completed. Use the saved receipt to download again."
          : reason instanceof ApiError && reason.code === "export_limit_exceeded"
            ? "No export was issued. These filters exceed the export resource limits. Narrow the filters and request again."
            : unknown
              ? "Issuance outcome is unconfirmed. Retry the same request, or recover the receipt from history after reload."
              : reason instanceof Error
                ? reason.message
                : "The export could not be issued.",
      );
    } finally {
      if (accepts(owner)) {
        active.current = false;
        setBusy(false);
      }
    }
  };

  const redownload = async (saved: ReportExportReceipt) => {
    if (active.current) return;
    const owner = ownership();
    active.current = true;
    setBusy(true);
    setError("");
    try {
      await download(saved, owner);
    } catch (reason) {
      if (accepts(owner)) {
        setError(reason instanceof Error ? reason.message : "Download failed.");
      }
    } finally {
      if (accepts(owner)) {
        active.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        Request all matching rows from a fresh, consistent server snapshot for
        these filters. Requests above the export resource limits are rejected
        without issuing a partial artifact.
      </Typography>
      <Button
        size="small"
        variant="outlined"
        disabled={busy}
        onClick={() => void issue()}
        sx={{ alignSelf: "flex-start" }}
      >
        {pending ? "Retry same export request" : label}
      </Button>
      {pending && (
        <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
          Pending request {pending.requestKey}; filters:{" "}
          {JSON.stringify(pending.filters)}
        </Typography>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {receipt && (
        <Stack spacing={0.5}>
          <Typography variant="body2">
            Issued receipt #{receipt.id} · user {receipt.issued_by_user_id} ·{" "}
            {receipt.issued_at} · source as of {receipt.as_of} ({receipt.timezone})
          </Typography>
          <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
            Request key: {receipt.request_key}; filters:{" "}
            {JSON.stringify(receipt.filters)}
          </Typography>
          <ExportCoverage receipt={receipt} />
          <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
            Definition revision {receipt.definition.revision} · CSV revision{" "}
            {receipt.serializer_revision} · coverage revision{" "}
            {receipt.coverage_revision}
            {" · "}Source SHA-256: {receipt.source_digest}
            {" · "}CSV SHA-256: {receipt.artifact_digest} · {receipt.artifact_bytes}{" "}
            bytes
          </Typography>
          <Button
            size="small"
            disabled={busy}
            onClick={() => void redownload(receipt)}
            sx={{ alignSelf: "flex-start" }}
          >
            Download saved receipt #{receipt.id}
          </Button>
        </Stack>
      )}
      <Button
        size="small"
        onClick={() => setHistoryOpen(!historyOpen)}
        sx={{ alignSelf: "flex-start" }}
      >
        {historyOpen ? "Hide issuance history" : "Recover from issuance history"}
      </Button>
      {historyOpen && (
        <ExportHistory
          key={JSON.stringify([reportId, filters, receipt?.id])}
          reportId={reportId}
          filters={filters}
          busy={busy}
          onDownload={redownload}
        />
      )}
    </Stack>
  );
}

function ExportHistory({
  reportId,
  filters,
  busy,
  onDownload,
}: {
  reportId: string;
  filters: Filters;
  busy: boolean;
  onDownload: (receipt: ReportExportReceipt) => Promise<void>;
}) {
  const [beforeId, setBeforeId] = useState<number | null>(null);
  const query = new URLSearchParams({ report_id: reportId });
  Object.entries(filters).forEach(([key, value]) => query.set(key, String(value)));
  if (beforeId) query.set("before_id", String(beforeId));
  const history = useResource<{
    exports: ReportExportReceipt[];
    next_before_id: number | null;
  }>(`/api/clinic/report_exports?${query}`);

  return (
    <Stack spacing={1}>
      <Typography variant="body2">
        Your issued exports for these report filters, including historical
        selected-page receipts.
      </Typography>
      {!history.data ? (
        <LoadState error={history.error} onRetry={history.refresh} />
      ) : (
        <>
          {history.data.exports.length === 0 && (
            <Typography variant="body2">No issued exports found.</Typography>
          )}
          {history.data.exports.map((item) => (
            <Stack key={item.id} spacing={0.25}>
              <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
                #{item.id} · {item.issued_at} · source {item.as_of} · definition
                revision {item.definition.revision}; CSV revision{" "}
                {item.serializer_revision} · request {item.request_key}
              </Typography>
              <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
                Source SHA-256: {item.source_digest} · CSV SHA-256:{" "}
                {item.artifact_digest}
              </Typography>
              <ExportCoverage receipt={item} />
              <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
                Saved filters: {JSON.stringify(item.filters)}
              </Typography>
              <Button
                size="small"
                disabled={busy}
                onClick={() => void onDownload(item)}
                sx={{ alignSelf: "flex-start" }}
              >
                Download issued CSV #{item.id}
              </Button>
            </Stack>
          ))}
          {history.data.next_before_id && (
            <Button
              size="small"
              onClick={() => setBeforeId(history.data!.next_before_id)}
            >
              Older receipts
            </Button>
          )}
          {beforeId && (
            <Button size="small" onClick={() => setBeforeId(null)}>
              Latest receipts
            </Button>
          )}
        </>
      )}
      <Button
        size="small"
        onClick={history.refresh}
        sx={{ alignSelf: "flex-start" }}
      >
        Refresh issuance history
      </Button>
    </Stack>
  );
}

function ExportCoverage({ receipt }: { receipt: ReportExportReceipt }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant="body2">
        {receipt.scope === "all_filtered_rows"
          ? "Complete filtered source rows"
          : "Partial source rows: summaries and selected pages"}
      </Typography>
      {receipt.scope === "all_filtered_rows"
        ? Object.entries(receipt.row_counts).map(([name, count]) => (
            <Typography key={name} variant="caption">
              {name}: {count.exported} exported of {count.matched} matching rows.
            </Typography>
          ))
        : Object.entries(receipt.source_pages).map(([name, page]) => (
            <Typography key={name} variant="caption">
              {name}: page {page.page} of {page.total_pages}; {page.total} matching
              records.
            </Typography>
          ))}
      {receipt.resource_limits && (
        <Typography variant="caption">
          Issuance limits: {receipt.resource_limits.max_rows} source rows;{" "}
          {receipt.resource_limits.max_artifact_bytes} artifact bytes.
        </Typography>
      )}
    </Stack>
  );
}
