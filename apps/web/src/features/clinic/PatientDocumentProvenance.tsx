import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, SESSION_CHANGED_EVENT } from "../../api/client";
import type { Pagination } from "../../api/contracts";
import { Card, LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { useClinicNavigation } from "./clinicNavigation";

const FIELDS = ["source", "issuer", "issued_date", "received_date"] as const;
type Field = (typeof FIELDS)[number];
type Precision = "year" | "month" | "day" | null;
type Configuration = { revision: number; applicable: boolean; fields: Field[]; writer_available: boolean; request_key: string | null; recorded_at: string | null; recorded_by_membership_id: number | null };
type Category = { id: number; code: string; name: string; provenance_configuration: Configuration; can_configure: boolean };
type Document = { id: number; patient_id: number; encounter_id: number | null; category_id: number; object_version: string; checksum: string; media_type: string; scan_state: string; created_at: string; category: { id: number; code: string; name: string } };
type Content = { source: string | null; issuer: string | null; issued_date: string | null; issued_precision: Precision; received_date: string | null; received_precision: Precision; correction_reason: string | null };
type Metadata = { id: number; revision: number; prior_revision_id: number | null; object_version: string; checksum: string; recorded_at: string; recorded_by_membership_id: number; configuration_revision: number; request_key: string; content: Content };
type Evidence = { document: Document; configuration: Configuration; current: Metadata | null; revisions: Metadata[]; pagination: Pagination; can_write: boolean; can_configure: boolean; write_blocker: string | null };
type Envelope = { path: string; body: Record<string, unknown>; accepts: (response: Record<string, unknown>) => boolean };
const emptyContent = (): Content => ({ source: null, issuer: null, issued_date: null, issued_precision: null, received_date: null, received_precision: null, correction_reason: null });
const label = (value: string) => value.replaceAll("_", " ");
const sameFields = (a: Field[], b: Field[]) => [...a].sort().join(",") === [...b].sort().join(",");

function useDraftNavigationGuard(dirty: boolean) {
  const { registerBlocker } = useClinicNavigation();
  useEffect(() => {
    if (!dirty) return;
    const unregister = registerBlocker(() => "Unsaved document metadata or configuration will be lost. Leave this context?");
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [dirty, registerBlocker]);
}

// Recovery stays in this context's memory. No protected drafts are stored in the browser.
function useExplicitSave(onSaved: (acknowledgement: Record<string, unknown>) => void) {
  const [pending, setPending] = useState<Envelope | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const active = useRef(true);
  const lock = useRef(false);
  const { registerBlocker } = useClinicNavigation();
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    if (!pending) return;
    const unregister = registerBlocker(() => "Document metadata save is unconfirmed. Leaving discards this exact retry request.");
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { unregister(); window.removeEventListener("beforeunload", beforeUnload); };
  }, [pending, registerBlocker]);
  async function send(envelope: Envelope) {
    if (lock.current) return;
    const recovering = pending !== null;
    lock.current = true;
    setBusy(true);
    setError(null);
    setPending(envelope);
    try {
      const result = await api<Record<string, unknown>>(envelope.path, { method: "POST", body: envelope.body });
      if (!active.current) return;
      if (!envelope.accepts(result)) {
        setError("The acknowledgement did not match this request. Its outcome remains unconfirmed; retry this exact request.");
        return;
      }
      setPending(null);
      setStale(false);
      onSaved(result);
    } catch (cause) {
      if (!active.current) return;
      const uncertain = !(cause instanceof ApiError) || cause.code === "outcome_unconfirmed" || cause.status >= 500;
      if (!uncertain && !recovering) {
        setPending(null);
        if (cause instanceof ApiError && cause.status === 409) setStale(true);
      }
      setError(cause instanceof Error ? cause.message : "Unable to save metadata.");
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  return { pending, busy, error, stale, clearStale: () => setStale(false), send };
}

function Pages({ pagination, onPage, disabled = false }: { pagination: Pagination; onPage: (page: number) => void; disabled?: boolean }) {
  return <Stack direction="row" spacing={1} alignItems="center">
    <Button disabled={disabled || pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Previous page</Button>
    <Typography variant="body2">Page {pagination.page} of {Math.max(1, pagination.total_pages)}</Typography>
    <Button disabled={disabled || pagination.page >= pagination.total_pages} onClick={() => onPage(pagination.page + 1)}>Next page</Button>
  </Stack>;
}

export function PatientDocumentProvenance({ patientId }: { patientId: number }) {
  const clinic = useClinic();
  const [sessionEpoch, setSessionEpoch] = useState(0);
  useEffect(() => {
    const changed = () => setSessionEpoch((value) => value + 1);
    window.addEventListener(SESSION_CHANGED_EVENT, changed);
    return () => window.removeEventListener(SESSION_CHANGED_EVENT, changed);
  }, []);
  if (!clinic.capabilities.documents) return null;
  const context = [clinic.practice.id, clinic.user_id, clinic.membership_id, clinic.authorization_generation, clinic.current_site?.id, patientId, sessionEpoch].join(":");
  return <DocumentWorkspace key={context} patientId={patientId} />;
}

function DocumentWorkspace({ patientId }: { patientId: number }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [detailLocked, setDetailLocked] = useState(false);
  const documents = useResource<{ documents: Document[]; pagination: Pagination }>(`/api/clinic/patients/${patientId}/documents?page=${page}`);
  return <Card title="Document provenance">
    <Stack spacing={2}>
      <Typography variant="body2">Supplied metadata is separate from original document content. Source and dates do not establish clinical verification.</Typography>
      <CategoryConfiguration />
      {!documents.data ? <LoadState error={documents.error} onRetry={documents.refresh} /> : <>
        {documents.data.documents.length === 0 && <Typography>No documents were returned on this page.</Typography>}
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {documents.data.documents.map((document) => <Button key={document.id} variant={selected === document.id ? "contained" : "outlined"} disabled={detailLocked && selected !== document.id} onClick={() => setSelected(document.id)}>{document.category.name} · Document #{document.id}</Button>)}
        </Stack>
        <Pages pagination={documents.data.pagination} onPage={(next) => { setSelected(null); setPage(next); }} disabled={detailLocked} />
      </>}
      {selected !== null && <DocumentMetadata key={`${patientId}:${selected}`} patientId={patientId} documentId={selected} onLock={setDetailLocked} />}
    </Stack>
  </Card>;
}

function CategoryConfiguration() {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<Category | null>(null);
  const categories = useResource<{ categories: Category[]; pagination: Pagination }>(`/api/clinic/document_categories?page=${page}`, { retainDataOnRefresh: true });
  useEffect(() => {
    if (!categories.data || !category) return;
    const updated = categories.data.categories.find((item) => item.id === category.id);
    if (updated && updated !== category) setCategory(updated);
  }, [categories.data, category]);
  const [locked, setLocked] = useState(false);
  return <Box>
    <Typography variant="subtitle2">Category metadata configuration</Typography>
    {!categories.data ? <LoadState error={categories.error} onRetry={categories.refresh} /> : <Stack spacing={1}>
      <TextField select label="Existing document category" value={category?.id ?? ""} disabled={locked} onChange={(event) => setCategory(categories.data?.categories.find((item) => item.id === Number(event.target.value)) ?? null)}>
        <MenuItem value="">Select a category</MenuItem>
        {categories.data.categories.map((item) => <MenuItem key={item.id} value={item.id}>{item.name} ({item.code})</MenuItem>)}
      </TextField>
      <Pages pagination={categories.data.pagination} disabled={locked} onPage={(next) => { setCategory(null); setPage(next); }} />
    </Stack>}
    {category && <ConfigurationEditor key={category.id} category={category} onSaved={categories.refresh} onLock={setLocked} />}
  </Box>;
}

function ConfigurationEditor({ category, onSaved, onLock }: { category: Category; onSaved: () => void; onLock: (locked: boolean) => void }) {
  const [draft, setDraft] = useState<{ revision: number; applicable: boolean; fields: Field[] } | null>(null);
  const [acknowledgement, setAcknowledgement] = useState<Configuration | null>(null);
  const [observedConfiguration, setObservedConfiguration] = useState(category.provenance_configuration);
  const [historyPage, setHistoryPage] = useState(1);
  const history = useResource<{ configuration: Configuration; revisions: Configuration[]; pagination: Pagination }>(`/api/clinic/document_categories/${category.id}/provenance_configuration?page=${historyPage}`);
  useEffect(() => {
    for (const configuration of [category.provenance_configuration, history.data?.configuration]) {
      if (configuration) setObservedConfiguration((current) => configuration.revision > current.revision ? configuration : current);
    }
  }, [category.provenance_configuration, history.data?.configuration]);
  useDraftNavigationGuard(draft !== null);
  const mutation = useExplicitSave((receipt) => { setAcknowledgement(receipt.configuration as Configuration); setDraft(null); onSaved(); history.refresh(); });
  useEffect(() => { onLock(draft !== null || mutation.pending !== null); return () => onLock(false); }, [draft, mutation.pending, onLock]);
  const saved = [category.provenance_configuration, history.data?.configuration, observedConfiguration, acknowledgement]
    .filter((configuration): configuration is Configuration => configuration !== null && configuration !== undefined)
    .reduce((newest, configuration) => configuration.revision > newest.revision ? configuration : newest);
  function save() {
    if (!draft || !category.can_configure || mutation.pending || mutation.stale || draft.revision !== saved.revision || (draft.applicable && draft.fields.length === 0) || (!draft.applicable && draft.fields.length !== 0)) return;
    const requestKey = crypto.randomUUID();
    const configuration = { request_key: requestKey, expected_revision: draft.revision, applicable: draft.applicable, fields: draft.fields };
    void mutation.send({ path: `/api/clinic/document_categories/${category.id}/provenance_configuration`, body: { configuration }, accepts: (result) => {
      const receipt = result.configuration as Configuration | undefined;
      return Boolean(receipt && receipt.request_key === requestKey && receipt.revision === draft.revision + 1 && receipt.applicable === draft.applicable && sameFields(receipt.fields, draft.fields));
    } });
  }
  return <Stack spacing={1}>
    <Typography variant="body2">Configuration revision {saved.revision} · {saved.applicable ? "Applicable" : "Not configured as applicable"} · Fields: {saved.fields.map(label).join(", ") || "None"}</Typography>
    <Alert severity="info">Metadata writer authority is not configured. Category configuration does not grant document metadata access.</Alert>
    {!draft ? <Button disabled={!category.can_configure} onClick={() => setDraft({ revision: saved.revision, applicable: saved.applicable, fields: [...saved.fields] })}>Edit category configuration</Button> : <>
      <FormControlLabel label="Supplied metadata applies to this category" control={<Checkbox checked={draft.applicable} disabled={mutation.busy || Boolean(mutation.pending)} onChange={(_, checked) => setDraft({ ...draft, applicable: checked, fields: checked ? draft.fields : [] })} />} />
      <Typography variant="body2">Turning applicability off clears selected fields. Turning it on requires explicitly selecting at least one field.</Typography>
      {draft.applicable && draft.fields.length === 0 && <Alert severity="warning">Select at least one supplied metadata field before saving an applicable category.</Alert>}
      {FIELDS.map((field) => <FormControlLabel key={field} label={label(field)} control={<Checkbox checked={draft.fields.includes(field)} disabled={!draft.applicable || mutation.busy || Boolean(mutation.pending)} onChange={(_, checked) => setDraft({ ...draft, fields: FIELDS.filter((value) => value === field ? checked : draft.fields.includes(value)) })} />} />
      <Stack direction="row" spacing={1}>
        <Button disabled={!category.can_configure || mutation.busy || Boolean(mutation.pending) || mutation.stale || draft.revision !== saved.revision || (draft.applicable && draft.fields.length === 0)} onClick={save}>Save configuration</Button>
        <Button disabled={mutation.busy || Boolean(mutation.pending)} onClick={() => setDraft(null)}>Cancel edits</Button>
      </Stack>
    </>}
    {mutation.error && <Alert severity="error">{mutation.error}</Alert>}
    {(mutation.stale || (draft && draft.revision !== saved.revision)) && <>
      <Button disabled={mutation.busy || Boolean(mutation.pending)} onClick={() => { onSaved(); history.refresh(); }}>Reload saved configuration</Button>
      <Button disabled={mutation.busy || Boolean(mutation.pending) || saved.revision === draft?.revision} onClick={() => { if (draft) setDraft({ ...draft, revision: saved.revision }); mutation.clearStale(); }}>Use displayed configuration revision, retain my selections</Button>
    </>}
    {mutation.pending && <Button disabled={mutation.busy} onClick={() => void mutation.send(mutation.pending!)}>Retry exact configuration request</Button>}
    {acknowledgement && <Typography variant="body2">Confirmed saved configuration revision {acknowledgement.revision}. This receipt remains visible if a follow-up read fails.</Typography>}
    <Typography variant="subtitle2">Category configuration history</Typography>
    {!history.data ? <LoadState error={history.error} onRetry={history.refresh} /> : <>
      {history.data.revisions.length === 0 && <Typography variant="body2">No saved category configuration revisions on this page.</Typography>}
      {history.data.revisions.map((configuration) => <Typography key={configuration.revision} variant="body2">Revision {configuration.revision} · {configuration.applicable ? "Applicable" : "Not applicable"} · Fields: {configuration.fields.map(label).join(", ") || "None"} · Recorded {configuration.recorded_at ?? "Not recorded"} · Membership {configuration.recorded_by_membership_id ?? "Not recorded"}</Typography>)}
      <Pages pagination={history.data.pagination} disabled={mutation.busy || Boolean(mutation.pending) || Boolean(draft)} onPage={setHistoryPage} />
    </>}
  </Stack>;
}

function MetadataView({ metadata }: { metadata: Metadata }) {
  return <Stack spacing={0.5}>
    <Typography variant="body2">Metadata revision {metadata.revision} · Previous revision {metadata.prior_revision_id ?? "none"} · Category configuration {metadata.configuration_revision}</Typography>
    <Typography variant="body2">Document version {metadata.object_version} · Checksum {metadata.checksum}</Typography>
    <Typography variant="body2">Source: {metadata.content.source ?? "Not supplied"} · Issuer: {metadata.content.issuer ?? "Not supplied"}</Typography>
    <Typography variant="body2">Issued: {metadata.content.issued_date ?? "Not supplied"} ({metadata.content.issued_precision ?? "unknown precision"}) · Received: {metadata.content.received_date ?? "Not supplied"} ({metadata.content.received_precision ?? "unknown precision"})</Typography>
    <Typography variant="body2">Correction reason: {metadata.content.correction_reason ?? "Not supplied"}</Typography>
    <Typography variant="body2" color="text.secondary">Recorded {metadata.recorded_at} · Membership #{metadata.recorded_by_membership_id}</Typography>
  </Stack>;
}

function DocumentMetadata({ patientId, documentId, onLock }: { patientId: number; documentId: number; onLock: (locked: boolean) => void }) {
  const [page, setPage] = useState(1);
  const path = `/api/clinic/patients/${patientId}/documents/${documentId}/provenance`;
  const resource = useResource<Evidence>(`${path}?page=${page}`);
  const [acknowledgement, setAcknowledgement] = useState<Metadata | null>(null);
  const [lastEvidence, setLastEvidence] = useState<Evidence | null>(null);
  const [observedMetadata, setObservedMetadata] = useState<Metadata | null>(null);
  useEffect(() => {
    if (resource.data?.document.id === documentId && resource.data.document.patient_id === patientId) {
      setLastEvidence(resource.data);
      const metadata = resource.data.current;
      if (metadata) setObservedMetadata((current) => metadata.revision > (current?.revision ?? 0) ? metadata : current);
    }
  }, [resource.data, documentId, patientId]);
  const [draft, setDraft] = useState<{ expectedRevision: number; objectVersion: string; checksum: string; configurationRevision: number; content: Content } | null>(null);
  useDraftNavigationGuard(draft !== null);
  const mutation = useExplicitSave((receipt) => { setAcknowledgement(receipt.metadata as Metadata); setDraft(null); resource.refresh(); });
  useEffect(() => { onLock(draft !== null || mutation.pending !== null); return () => onLock(false); }, [draft, mutation.pending, onLock]);
  const evidence = resource.data ?? lastEvidence;
  const current = evidence?.current;
  const savedMetadata = [current, observedMetadata, acknowledgement]
    .filter((metadata): metadata is Metadata => metadata !== null && metadata !== undefined)
    .reduce<Metadata | null>((newest, metadata) => metadata.revision > (newest?.revision ?? 0) ? metadata : newest, null);
  const data = evidence ? { ...evidence, current: savedMetadata ?? null, can_write: Boolean(resource.data?.can_write) } : undefined;
  if (!data) return <LoadState error={resource.error} onRetry={resource.refresh} />;
  if (data.document.id !== documentId || data.document.patient_id !== patientId) return <Alert severity="error">Document response does not match this patient context.</Alert>;
  const mismatchedObject = data.current && (data.current.object_version !== data.document.object_version || data.current.checksum !== data.document.checksum);
  const changedBase = draft && (draft.objectVersion !== data.document.object_version || draft.checksum !== data.document.checksum || draft.configurationRevision !== data.configuration.revision || draft.expectedRevision !== (data.current?.revision ?? 0));
  function beginEdit() {
    if (!data?.can_write) return;
    setDraft({ expectedRevision: data.current?.revision ?? 0, objectVersion: data.document.object_version, checksum: data.document.checksum, configurationRevision: data.configuration.revision, content: mismatchedObject ? emptyContent() : {
      ...emptyContent(),
      source: data.configuration.fields.includes("source") ? data.current?.content.source ?? null : null,
      issuer: data.configuration.fields.includes("issuer") ? data.current?.content.issuer ?? null : null,
      issued_date: data.configuration.fields.includes("issued_date") ? data.current?.content.issued_date ?? null : null,
      issued_precision: data.configuration.fields.includes("issued_date") ? data.current?.content.issued_precision ?? null : null,
      received_date: data.configuration.fields.includes("received_date") ? data.current?.content.received_date ?? null : null,
      received_precision: data.configuration.fields.includes("received_date") ? data.current?.content.received_precision ?? null : null,
    } });
  }
  function save() {
    if (!draft || !data?.can_write || mutation.pending || mutation.stale || changedBase) return;
    const requestKey = crypto.randomUUID();
    const content: Content = {
      ...draft.content,
      source: data.configuration.fields.includes("source") ? draft.content.source?.trim() || null : null,
      issuer: data.configuration.fields.includes("issuer") ? draft.content.issuer?.trim() || null : null,
      issued_date: data.configuration.fields.includes("issued_date") ? draft.content.issued_date?.trim() || null : null,
      issued_precision: data.configuration.fields.includes("issued_date") ? draft.content.issued_precision : null,
      received_date: data.configuration.fields.includes("received_date") ? draft.content.received_date?.trim() || null : null,
      received_precision: data.configuration.fields.includes("received_date") ? draft.content.received_precision : null,
      correction_reason: draft.content.correction_reason?.trim() || null,
    };
    const supplied = Object.fromEntries(Object.entries(content).filter(([field]) => field === "correction_reason" || data.configuration.fields.includes(field as Field) || (field === "issued_precision" && data.configuration.fields.includes("issued_date")) || (field === "received_precision" && data.configuration.fields.includes("received_date"))));
    const metadata = { ...supplied, request_key: requestKey, expected_revision: draft.expectedRevision, object_version: draft.objectVersion, checksum: draft.checksum, expected_configuration_revision: draft.configurationRevision };
    void mutation.send({ path, body: { metadata }, accepts: (result) => {
      const receipt = result.metadata as Metadata | undefined;
      return Boolean(receipt && receipt.request_key === requestKey && receipt.revision === draft.expectedRevision + 1 && receipt.object_version === draft.objectVersion && receipt.checksum === draft.checksum && receipt.configuration_revision === draft.configurationRevision && Object.keys(content).every((field) => receipt.content[field as keyof Content] === content[field as keyof Content]));
    } });
  }
  return <Stack spacing={2}>
    {!resource.data && <LoadState error={resource.error} onRetry={resource.refresh} />}
    {acknowledgement && <Typography variant="body2">Confirmed saved metadata revision {acknowledgement.revision}. Its receipt remains visible if a follow-up read fails.</Typography>}
    <Typography variant="subtitle1">{data.document.category.name} · Document #{documentId}</Typography>
    <Typography variant="body2">Original content: version {data.document.object_version} · checksum {data.document.checksum} · {data.document.media_type} · scan {data.document.scan_state}</Typography>
    <Typography variant="body2">Stored {data.document.created_at}. This storage timestamp is not an issue or received date.</Typography>
    {!data.can_write && <Alert severity="info">{data.write_blocker || "Document metadata writer authority is not configured."}</Alert>}
    {!data.configuration.applicable && <Alert severity="info">This category has not been configured as applicable for supplied metadata.</Alert>}
    {mismatchedObject && <Alert severity="warning">Saved metadata refers to a different original content version. Review both identities; earlier metadata is not applied to the current content.</Alert>}
    {data.current ? <MetadataView metadata={data.current} /> : <Typography>No supplied metadata has been recorded.</Typography>}
    {!draft ? <Button disabled={!data.can_write || !data.configuration.applicable} onClick={beginEdit}>Record metadata correction</Button> : <Stack spacing={1}>
      <Typography variant="body2">Editing against metadata revision {draft.expectedRevision} and configuration {draft.configurationRevision}. Leave unknown supplied values empty.</Typography>
      {data.configuration.fields.filter((field) => field === "source" || field === "issuer").map((field) => <TextField key={field} label={`Supplied ${label(field)}`} value={draft.content[field] ?? ""} disabled={mutation.busy || Boolean(mutation.pending)} onChange={(event) => setDraft({ ...draft, content: { ...draft.content, [field]: event.target.value || null } })} />)}
      {(["issued", "received"] as const).filter((kind) => data.configuration.fields.includes(`${kind}_date`)).map((kind) => <Stack key={kind} direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField select label={`${label(kind)} date precision`} value={draft.content[`${kind}_precision`] ?? ""} disabled={mutation.busy || Boolean(mutation.pending)} onChange={(event) => setDraft({ ...draft, content: { ...draft.content, [`${kind}_precision`]: event.target.value || null, [`${kind}_date`]: null } })}>
          <MenuItem value="">Unknown / not supplied</MenuItem><MenuItem value="year">Year</MenuItem><MenuItem value="month">Month</MenuItem><MenuItem value="day">Day</MenuItem>
        </TextField>
        <TextField label={`Supplied ${kind} date`} placeholder={draft.content[`${kind}_precision`] === "year" ? "YYYY" : draft.content[`${kind}_precision`] === "month" ? "YYYY-MM" : "YYYY-MM-DD"} value={draft.content[`${kind}_date`] ?? ""} disabled={!draft.content[`${kind}_precision`] || mutation.busy || Boolean(mutation.pending)} onChange={(event) => setDraft({ ...draft, content: { ...draft.content, [`${kind}_date`]: event.target.value || null } })} />
      </Stack>)}
      <TextField label="Supplied correction reason" multiline value={draft.content.correction_reason ?? ""} disabled={mutation.busy || Boolean(mutation.pending)} onChange={(event) => setDraft({ ...draft, content: { ...draft.content, correction_reason: event.target.value || null } })} />
      {changedBase && <Alert severity="warning">Saved revision, content identity or category configuration changed. Your edits are retained; review the displayed saved state before using its revision.</Alert>}
      <Stack direction="row" spacing={1}>
        <Button disabled={!data.can_write || !data.configuration.applicable || mutation.busy || Boolean(mutation.pending) || mutation.stale || Boolean(changedBase)} onClick={save}>Save metadata revision</Button>
        <Button disabled={mutation.busy || Boolean(mutation.pending)} onClick={() => setDraft(null)}>Cancel edits</Button>
      </Stack>
    </Stack>}
    {mutation.error && <Alert severity="error">{mutation.error}</Alert>}
    {(mutation.stale || changedBase) && <>
      <Button disabled={mutation.busy || Boolean(mutation.pending)} onClick={resource.refresh}>Reload saved metadata</Button>
      <Button disabled={mutation.busy || Boolean(mutation.pending) || !draft || !data.can_write} onClick={() => { if (draft) setDraft({ ...draft, expectedRevision: data.current?.revision ?? 0, objectVersion: data.document.object_version, checksum: data.document.checksum, configurationRevision: data.configuration.revision }); mutation.clearStale(); }}>Use displayed saved revision, retain my edits</Button>
    </>}
    {mutation.pending && <Button disabled={mutation.busy} onClick={() => void mutation.send(mutation.pending!)}>Retry exact metadata request</Button>}
    <Typography variant="subtitle2">Append-only metadata correction history</Typography>
    {data.revisions.length === 0 && <Typography>No revisions were returned on this history page.</Typography>}
    {data.revisions.map((metadata) => <Box key={metadata.id} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}><MetadataView metadata={metadata} /></Box>)}
    <Pages pagination={data.pagination} disabled={mutation.busy || Boolean(mutation.pending) || Boolean(draft)} onPage={setPage} />
  </Stack>;
}
