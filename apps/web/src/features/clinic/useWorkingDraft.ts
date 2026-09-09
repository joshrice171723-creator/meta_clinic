import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";

export type WorkingDraftKind =
  | "registration"
  | "patient_update"
  | "appointment"
  | "vitals"
  | "soap"
  | "checkout"
  | "follow_up";
type DraftStatus =
  "loading" | "idle" | "saving" | "saved" | "error" | "conflict";
type DraftResponse<T> = {
  kind: WorkingDraftKind;
  patient_id: number | null;
  encounter_id: number | null;
  record_id: number | null;
  version: number;
  payload: T | null;
  updated_at: string | null;
};

// Working copies are private server records, never browser storage and never
// official clinical/billing mutations. Consumers choose when to save snapshots.
export function useWorkingDraft<T>({
  kind,
  patientId,
  encounterId,
  recordId,
}: {
  kind: WorkingDraftKind;
  patientId?: number | string;
  encounterId?: number | string;
  recordId?: number | string;
}) {
  const patient = patientId == null ? null : Number(patientId);
  const encounter = encounterId == null ? null : Number(encounterId);
  const record = recordId == null ? null : Number(recordId);
  const query = new URLSearchParams();
  if (patient !== null) query.set("patient_id", String(patient));
  if (encounter !== null) query.set("encounter_id", String(encounter));
  if (record !== null) query.set("record_id", String(record));
  const endpoint = `/api/clinic/working_drafts/${kind}${query.size ? `?${query}` : ""}`;
  const [revision, refresh] = useState(0);
  const [state, setState] = useState<{
    endpoint: string;
    ready: boolean;
    restored: T | null;
    version: number;
    status: DraftStatus;
    error: string;
  }>({
    endpoint,
    ready: false,
    restored: null,
    version: 0,
    status: "loading",
    error: "",
  });
  const active = useRef({
    endpoint,
    generation: 0,
    ready: false,
    version: 0,
    conflicted: false,
  });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const uncertain = useRef<{ encoded: string; expected: number } | null>(null);

  const validate = useCallback(
    (response: DraftResponse<T>) => {
      if (
        response.kind !== kind ||
        response.patient_id !== patient ||
        response.encounter_id !== encounter ||
        response.record_id !== record ||
        !Number.isSafeInteger(response.version) ||
        response.version < 0 ||
        (response.payload !== null &&
          (typeof response.payload !== "object" ||
            Array.isArray(response.payload)))
      )
        throw new Error(
          "The recovered working copy did not match this patient and visit.",
        );
    },
    [kind, patient, encounter, record],
  );

  useEffect(() => {
    const abort = new AbortController();
    const generation = active.current.generation + 1;
    active.current = {
      endpoint,
      generation,
      ready: false,
      version: 0,
      conflicted: false,
    };
    uncertain.current = null;
    queue.current = Promise.resolve();
    setState({
      endpoint,
      ready: false,
      restored: null,
      version: 0,
      status: "loading",
      error: "",
    });
    api<DraftResponse<T>>(endpoint, { signal: abort.signal })
      .then((response) => {
        if (abort.signal.aborted || active.current.generation !== generation)
          return;
        validate(response);
        active.current.ready = true;
        active.current.version = response.version;
        setState({
          endpoint,
          ready: true,
          restored: response.payload,
          version: response.version,
          status: response.payload ? "saved" : "idle",
          error: "",
        });
      })
      .catch((reason: unknown) => {
        if (abort.signal.aborted || active.current.generation !== generation)
          return;
        setState({
          endpoint,
          ready: false,
          restored: null,
          version: 0,
          status: "error",
          error:
            reason instanceof Error
              ? reason.message
              : "The working copy could not be recovered. Reconnect and try again.",
        });
      });
    return () => {
      abort.abort();
      active.current.ready = false;
      active.current.generation += 1;
    };
  }, [endpoint, revision, validate]);

  const save = useCallback(
    (snapshot: T | null): Promise<boolean> => {
      const generation = active.current.generation;
      const encoded = JSON.stringify(snapshot);
      // Detach the submitted snapshot from mutable objects owned by a consumer.
      const payload = JSON.parse(encoded) as T | null;
      const current = () =>
        active.current.generation === generation &&
        active.current.endpoint === endpoint;
      if (!current() || !active.current.ready || active.current.conflicted)
        return Promise.resolve(false);
      setState((value) => ({ ...value, status: "saving", error: "" }));
      const operation = queue.current.then(async () => {
        if (!current() || !active.current.ready || active.current.conflicted)
          return false;
        setState((value) => ({ ...value, status: "saving", error: "" }));
        if (uncertain.current && uncertain.current.encoded !== encoded) {
          setState((value) => ({
            ...value,
            status: "error",
            error:
              "The previous working-copy save is unconfirmed. Reload the saved copy before changing it.",
          }));
          return false;
        }
        const expected = uncertain.current?.expected ?? active.current.version;
        uncertain.current = { encoded, expected };
        try {
          const response = await api<DraftResponse<T>>(endpoint, {
            method: "PUT",
            body: { expected_version: expected, payload },
          });
          if (!current()) return false;
          validate(response);
          if (
            response.version !== expected + 1 ||
            JSON.stringify(response.payload) !== encoded
          )
            throw new Error(
              "The working-copy save could not be confirmed. Reload its status before continuing.",
            );
          active.current.version = response.version;
          uncertain.current = null;
          setState((value) => ({
            ...value,
            version: response.version,
            status: "saved",
            error: "",
          }));
          return true;
        } catch (reason) {
          if (!current()) return false;
          const conflict =
            reason instanceof ApiError && reason.code === "draft_conflict";
          active.current.conflicted = conflict;
          // A definite rejection is not an ambiguous network outcome.
          if (
            reason instanceof ApiError &&
            reason.status >= 400 &&
            reason.status < 500
          )
            uncertain.current = null;
          setState((value) => ({
            ...value,
            status: conflict ? "conflict" : "error",
            error:
              reason instanceof Error
                ? reason.message
                : "The working copy could not be saved. Keep this window open and reconnect.",
          }));
          return false;
        }
      });
      queue.current = operation.catch(() => false);
      return operation;
    },
    [endpoint, validate],
  );
  const clear = useCallback(() => save(null), [save]);
  const reload = useCallback(() => refresh((value) => value + 1), []);
  const visible =
    state.endpoint === endpoint
      ? state
      : {
          endpoint,
          ready: false,
          restored: null,
          version: 0,
          status: "loading" as DraftStatus,
          error: "",
        };
  return { ...visible, save, clear, reload };
}
