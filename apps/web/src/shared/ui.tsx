import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api, ApiError, formBody } from "../api/client";

export function ErrorMessage({ message }: { message: string }) {
  return (
    <p role="alert" className="flash flash-alert">
      {message}
    </p>
  );
}

export function applyResourceResultIfActive<T>(
  signal: AbortSignal,
  data: T,
  apply: (data: T) => void,
) {
  if (!signal.aborted) apply(data);
}

export function useResource<T>(
  path: string,
  { retainDataOnRefresh = false }: { retainDataOnRefresh?: boolean } = {},
) {
  const [result, setResult] = useState<{
    path: string;
    data?: T;
    error?: string;
  }>({ path });
  const [revision, revise] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setResult((current) =>
      retainDataOnRefresh && current.path === path && current.data !== undefined
        ? { path, data: current.data }
        : { path },
    );
    api<T>(path, { signal: abort.signal })
      .then((data) =>
        applyResourceResultIfActive(abort.signal, data, (activeData) =>
          setResult({ path, data: activeData }),
        ),
      )
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          window.location.replace("/login");
          return;
        }
        setResult({
          path,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load this page.",
        });
      });
    return () => abort.abort();
  }, [path, retainDataOnRefresh, revision]);
  return {
    ...(result.path === path ? result : { path }),
    refresh: () => revise((n) => n + 1),
  };
}
export function LoadState({ error }: { error?: string }) {
  return error ? (
    <ErrorMessage message={error} />
  ) : (
    <p role="status">Loading…</p>
  );
}
export function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="clinic-card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Field({
  name,
  label,
  type = "text",
  required = true,
  value,
  options,
  maxLength = 200,
  min,
  max,
  step,
  autoComplete = "off",
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  value?: string | number;
  options?: (string | [string, string])[];
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  autoComplete?: string;
}) {
  const id = useId();
  const props = { name, id, required, defaultValue: value, autoComplete };
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {options ? (
        <select {...props}>
          {options.map((o) => (
            <option
              key={typeof o === "string" ? o : o[0]}
              value={typeof o === "string" ? o : o[0]}
            >
              {typeof o === "string" ? o : o[1]}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea {...props} rows={6} maxLength={maxLength} />
      ) : (
        <input
          {...props}
          type={type}
          maxLength={maxLength}
          min={min}
          max={max}
          step={step}
        />
      )}
    </div>
  );
}
export function Form({
  endpoint,
  method = "POST",
  children,
  submit,
  onSuccess,
  values = {},
  retryKey = false,
  retryKeyField,
  transform,
  className = "pharmacy-form-grid",
}: {
  endpoint: string;
  method?: string;
  children?: ReactNode;
  submit: string;
  onSuccess?: (result: Record<string, unknown> | undefined) => void;
  values?: Record<string, unknown>;
  retryKey?: boolean;
  retryKeyField?: string;
  transform?: (values: Record<string, unknown>) => Record<string, unknown>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const inFlight = useRef(false),
    key = useRef<string | undefined>(undefined);
  return (
    <form
      className={className}
      onSubmit={async (event) => {
        event.preventDefault();
        if (inFlight.current) return;
        const form = event.currentTarget;
        inFlight.current = true;
        setBusy(true);
        setError("");
        setNotice("");
        key.current ||= crypto.randomUUID();
        try {
          const formValues = formBody(new FormData(form));
          const payload = transform ? transform(formValues) : formValues;
          if (retryKey && retryKeyField) {
            const match = /^(\w+)\[(\w+)\]$/.exec(retryKeyField);
            if (!match) throw new Error("Invalid retry key field.");
            const group = (payload[match[1]] ||= {}) as Record<string, unknown>;
            group[match[2]] = key.current;
          }
          const result = await api<Record<string, unknown> | undefined>(
            endpoint,
            {
              method,
              body: {
                ...payload,
                ...values,
                ...(retryKey && !retryKeyField
                  ? { request_key: key.current }
                  : {}),
              },
            },
          );
          key.current = undefined;
          onSuccess?.(result);
          setNotice("Saved.");
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "The request failed. Check its status before trying again.",
          );
        } finally {
          form
            .querySelectorAll<HTMLInputElement>("input[type=password]")
            .forEach((input) => {
              input.value = "";
            });
          inFlight.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {children}
        <button className="primary-link" type="submit">
          {busy ? "Working…" : submit}
        </button>
      </fieldset>
      {error && <ErrorMessage message={error} />}
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}
export function Pager({
  page,
  total,
  size,
  path,
}: {
  page: number;
  total: number;
  size: number;
  path: string;
}) {
  const url = (n: number) => {
    const [base, search] = path.split("?");
    const query = new URLSearchParams(search);
    query.set("page", String(n));
    return base + "?" + query.toString();
  };
  return (
    <nav aria-label="Pages">
      {page > 1 && <a href={url(page - 1)}>← Previous</a>} · Page {page}
      {page * size < total && (
        <>
          {" "}
          · <a href={url(page + 1)}>Next →</a>
        </>
      )}
    </nav>
  );
}
export function createdPath(base: string) {
  return (result: Record<string, unknown> | undefined) => {
    if (typeof result?.id === "number")
      window.location.assign(base + "/" + result.id);
  };
}
