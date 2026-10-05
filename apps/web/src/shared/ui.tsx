import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  api,
  ApiError,
  formBody,
  currentLoginDestination,
} from "../api/client";
import { ResourceState } from "./ResourceState";
import { LoadingFeedback } from "./LoadingFeedback";

export { ResourceState } from "./ResourceState";
export type { ResourceStateName, ResourceStateProps } from "./ResourceState";

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
  {
    retainDataOnRefresh = false,
    enabled = true,
  }: { retainDataOnRefresh?: boolean; enabled?: boolean } = {},
) {
  const [result, setResult] = useState<{
    path: string;
    data?: T;
    error?: string;
    loading: boolean;
  }>({ path, loading: enabled });
  const requestRefresh = useRef<(() => void) | null>(null);
  const refresh = useCallback(() => requestRefresh.current?.(), []);
  useEffect(() => {
    if (!enabled) {
      setResult({ path, loading: false });
      return;
    }
    const abort = new AbortController();
    let inFlight = false;
    let refreshQueued = false;
    const load = async () => {
      if (abort.signal.aborted) return;
      // Finish the current read, then reconcile once more for any invalidations
      // received while it was running. Repeated refreshes must not starve it.
      if (inFlight) {
        refreshQueued = true;
        return;
      }
      inFlight = true;
      do {
        refreshQueued = false;
        setResult((current) =>
          retainDataOnRefresh && current.path === path
            ? { path, data: current.data, loading: true }
            : { path, loading: true },
        );
        try {
          const data = await api<T>(path, { signal: abort.signal });
          applyResourceResultIfActive(abort.signal, data, (activeData) =>
            setResult({ path, data: activeData, loading: refreshQueued }),
          );
        } catch (error: unknown) {
          if (abort.signal.aborted) return;
          if (error instanceof ApiError && error.status === 401) {
            window.location.replace(
              `/login?next=${encodeURIComponent(currentLoginDestination())}`,
            );
            return;
          }
          // Never retry an authorization/context denial just because a refresh
          // arrived before it. The caller must explicitly recover that state.
          if (error instanceof ApiError && [403, 409].includes(error.status))
            refreshQueued = false;
          setResult({
            path,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load this page.",
          });
        }
      } while (refreshQueued && !abort.signal.aborted);
      inFlight = false;
    };
    requestRefresh.current = () => void load();
    void load();
    return () => {
      requestRefresh.current = null;
      abort.abort();
    };
  }, [path, retainDataOnRefresh, enabled]);
  const current =
    enabled && result.path === path
      ? result
      : { path, loading: enabled, data: undefined, error: undefined };
  return {
    ...current,
    refreshing: current.loading && current.data !== undefined,
    refresh,
  };
}
export function LoadState({
  error,
  onRetry,
}: {
  error?: string;
  onRetry?: () => void;
}) {
  return error ? (
    <ResourceState state="error" message={error} onRetry={onRetry} />
  ) : (
    <ResourceState state="loading" />
  );
}
export function Card({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="clinic-card" id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Field({
  name,
  label,
  description,
  owner,
  type = "text",
  required = true,
  value,
  options,
  maxLength = 200,
  min,
  max,
  step,
  autoComplete = "off",
  readOnly = false,
}: {
  name: string;
  label: string;
  description?: ReactNode;
  owner?: string;
  type?: string;
  required?: boolean;
  value?: string | number;
  options?: (string | [string, string])[];
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  autoComplete?: string;
  readOnly?: boolean;
}) {
  const id = useId();
  const props = {
    name,
    id,
    required,
    defaultValue: value,
    autoComplete,
    readOnly,
    "aria-describedby": description || owner ? `${id}-hint` : undefined,
  };
  return (
    <div className="form-field">
      <label htmlFor={id}>
        {label}
        {required && (
          <>
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
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
      {(description || owner) && (
        <div className="form-field-hint" id={`${id}-hint`}>
          {description && <span>{description}</span>}
          {owner && <span>Owner: {owner}</span>}
        </div>
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
      onChange={() => setNotice("")}
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
            endpoint === "/api/session" &&
              error instanceof ApiError &&
              error.status === 422
              ? "We couldn't verify this sign-in. Reload the page and try again."
              : error instanceof Error
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
      <LoadingFeedback active={busy} label="Sending your request…" />
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
    <Stack
      component="nav"
      direction="row"
      aria-label="Pages"
      sx={{
        alignItems: "center",
        flexWrap: "wrap",
        gap: 1,
        pt: 2,
        borderTop: 1,
        borderColor: "divider",
      }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ flex: "1 1 180px" }}
      >
        Page {page} of {Math.max(1, Math.ceil(total / size))} ·{" "}
        {total.toLocaleString()} {total === 1 ? "record" : "records"}
      </Typography>
      {page > 1 && (
        <Button
          href={url(page - 1)}
          rel="prev"
          aria-label="Previous page"
          variant="outlined"
          size="small"
        >
          Previous
        </Button>
      )}
      {page * size < total && (
        <Button
          href={url(page + 1)}
          rel="next"
          aria-label="Next page"
          variant="outlined"
          size="small"
        >
          Next
        </Button>
      )}
    </Stack>
  );
}
export function createdPath(base: string) {
  return (result: Record<string, unknown> | undefined) => {
    if (typeof result?.id === "number")
      window.location.assign(base + "/" + result.id);
  };
}
