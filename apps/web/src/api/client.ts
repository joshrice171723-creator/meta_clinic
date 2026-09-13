import type { DevelopmentAccount, RuntimeEnvironment } from "./contracts";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

let csrfToken: string | undefined;
type Configuration = {
  csrf_token: string;
  development_login: boolean;
  clinic_available: boolean;
  environment: RuntimeEnvironment;
  development_accounts: DevelopmentAccount[];
  business_date: string;
};
let csrfRequest: Promise<Configuration> | undefined;
let csrfGeneration = 0;
let expectedActorId: number | undefined;
let actorGeneration = 0;
export const SESSION_CHANGED_EVENT = "apply:session-changed";
export function setApiActor(actorId: number | undefined) {
  if (expectedActorId === actorId) return;
  expectedActorId = actorId;
  actorGeneration += 1;
  clearCsrf();
}

function reportSessionChanged() {
  actorGeneration += 1;
  clearCsrf();
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

async function withDeadline<T>(
  signal: AbortSignal | undefined,
  action: (signal: AbortSignal) => Promise<T>,
  mutation = false,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("Request deadline exceeded"));
    }, 30_000);
  });
  try {
    return await Promise.race([action(controller.signal), deadline]);
  } catch (reason) {
    if (timedOut)
      throw new ApiError(
        504,
        mutation
          ? "The request timed out. Its outcome is unconfirmed. Check the saved record or retry the same action before starting another."
          : "The request timed out. Reconnect and try again.",
        mutation ? "outcome_unconfirmed" : "request_timeout",
      );
    throw reason;
  } finally {
    clearTimeout(timer!);
    signal?.removeEventListener("abort", cancel);
  }
}
export function clearCsrf() {
  csrfToken = undefined;
  csrfRequest = undefined;
  csrfGeneration += 1;
}

async function loadCsrf(generation: number): Promise<Configuration> {
  return withDeadline(undefined, async (signal) => {
    const response = await fetch("/api/csrf", {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (!response.ok)
      throw new ApiError(
        response.status,
        "Unable to connect. Please try again.",
      );
    const data = (await response.json()) as Configuration;
    signal.throwIfAborted();
    if (typeof data.csrf_token !== "string" || !data.csrf_token)
      throw new ApiError(
        502,
        "Unable to establish a secure session. Please try again.",
      );
    if (generation !== csrfGeneration)
      throw new ApiError(
        409,
        "Your session changed. Reload before trying again.",
      );
    csrfToken = data.csrf_token;
    return data;
  });
}

export function csrf(): Promise<Configuration> {
  if (!csrfRequest) {
    const generation = csrfGeneration;
    csrfRequest = loadCsrf(generation).finally(() => {
      if (generation === csrfGeneration) csrfRequest = undefined;
    });
  }
  return csrfRequest;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  if (!path.startsWith("/api/"))
    throw new Error("Requests must use the same-origin API.");
  const method = options.method || "GET";
  const requestActor = expectedActorId;
  const generation = actorGeneration;
  // Initialize the cookie's CSRF state before parallel session/resource reads.
  // Otherwise their earlier cookie snapshots can overwrite that initialization.
  if (!csrfToken || csrfRequest) await csrf();
  if (generation !== actorGeneration)
    throw new ApiError(
      409,
      "Your session changed. Reopen this page before continuing.",
      "session_changed",
    );
  return withDeadline(
    options.signal,
    async (signal) => {
      const response = await fetch(path, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal,
        headers: {
          Accept: "application/json",
          ...(path.startsWith("/api/clinic") && requestActor !== undefined
            ? { "X-Clinic-Actor": String(requestActor) }
            : {}),
          ...(method === "GET"
            ? {}
            : {
                "Content-Type": "application/json",
                "X-CSRF-Token": csrfToken!,
              }),
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      if (generation !== actorGeneration)
        throw new ApiError(
          409,
          "Your session changed. Reopen this page before continuing.",
          "session_changed",
        );
      if (response.status === 204) {
        if (path === "/api/session") clearCsrf();
        return undefined as T;
      }
      const data = (await response.json().catch(() => {
        if (response.ok)
          throw new ApiError(
            502,
            "The server response could not be confirmed. Check the saved record before retrying.",
            "outcome_unconfirmed",
          );
        return {};
      })) as {
        error?: string;
        code?: string;
      };
      signal.throwIfAborted();
      if (generation !== actorGeneration)
        throw new ApiError(
          409,
          "Your session changed. Reopen this page before continuing.",
          "session_changed",
        );
      if (!response.ok) {
        if (data?.code === "session_changed") reportSessionChanged();
        if (response.status === 401 || response.status === 422) clearCsrf();
        throw new ApiError(
          response.status,
          data?.error || "The request could not be completed.",
          data?.code,
        );
      }
      if (data === null || typeof data !== "object")
        throw new ApiError(
          502,
          "The server response could not be confirmed. Check the saved record before retrying.",
          "outcome_unconfirmed",
        );
      // Session rotation invalidates the old CSRF token. Never replay mutations.
      if (path === "/api/session" || path === "/api/development_session") {
        if (method !== "GET") clearCsrf();
      }
      return data as T;
    },
    method !== "GET" && method !== "HEAD",
  );
}

export function loginDestination(value: string | null): string {
  if (!value) return "/portal";
  if (value.includes("?")) {
    if (
      !value.startsWith("/") ||
      value.startsWith("//") ||
      value.includes("\\")
    )
      return "/portal";
    const [path, raw] = value.split("?", 2);
    if (loginDestination(path) !== path) return "/portal";
    const query = new URLSearchParams(raw);
    const safe = new URLSearchParams();
    const integerNames = new Set([
      "patient_id",
      "encounter_id",
      "invoice_id",
      "reminder_id",
      "conversation_id",
      "page",
    ]);
    let recognized = false;
    for (const [name, item] of query.entries()) {
      if (safe.has(name)) return "/portal";
      if (integerNames.has(name)) {
        recognized = true;
        if (!/^[1-9]\d*$/.test(item) || !Number.isSafeInteger(Number(item)))
          continue;
      } else if (name === "telehealth_visit_id") {
        recognized = true;
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            item,
          )
        )
          continue;
      } else if (name === "visit_modality") {
        recognized = true;
        if (item !== "video") continue;
      } else if (name === "invoice_payment") {
        recognized = true;
        if (!["return", "cancel"].includes(item)) continue;
      } else if (name === "mode") {
        recognized = true;
        if (!["current", "previous"].includes(item)) continue;
      } else {
        continue;
      }
      safe.set(name, item);
    }
    return safe.size ? `${path}?${safe}` : recognized ? path : "/portal";
  }
  if (value === "/patient-portal") return value;
  if (value === "/memberships/account") return value;
  if (/^\/patient-portal\/telehealth\/[0-9a-f-]{36}$/i.test(value))
    return value;
  if (/^\/clinic\/telehealth\/[0-9a-f-]{36}$/i.test(value)) return value;
  if (/^\/clinic\/patients\/\d+\/encounters\/\d+\/telehealth$/.test(value))
    return value;
  const exact = new Set([
    "/owner",
    "/clinic",
    "/clinic/chart-selection",
    "/clinic/schedule",
    "/clinic/patients",
    "/clinic/operations",
    "/clinic/facilities",
    "/clinic/inventory",
    "/clinic/staff",
    "/clinic/workforce",
    "/clinic/front-desk",
    "/clinic/billing",
    "/clinic/reminders",
    "/clinic/messages",
    "/clinic/settings",
    "/clinic/telehealth",
    "/clinic/settings/telehealth",
    "/clinic/billing",
  ]);
  return exact.has(value) ||
    /^\/clinic\/workforce(?:\/[^/]+)?$/.test(value) ||
    /^\/clinic\/inventory(?:\/.*)?$/.test(value) ||
    /^\/clinic\/billing(?:\/[^/]+)?$/.test(value) ||
    /^\/clinic\/patients\/\d+$/.test(value) ||
    /^\/clinic\/patients\/\d+\/encounters\/\d+$/.test(value)
    ? value
    : "/portal";
}

export function currentLoginDestination(): string {
  const pathname = window.location.pathname;
  const path =
    pathname === "/clinic" && window.history.state?.clinicView === "schedule"
      ? "/clinic/schedule"
      : pathname;
  return loginDestination(path + window.location.search);
}

export function formBody(form: FormData): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [name, value] of form) {
    if (typeof value !== "string")
      throw new Error("File uploads are not supported.");
    if (/(?:^|\[)(?:__proto__|constructor|prototype)(?:\]|$)/.test(name))
      throw new Error("Unsupported field name.");
    const match = /^(\w+)\[(\w+)\]$/.exec(name);
    if (match) {
      const group = (body[match[1]] ||= {}) as Record<string, unknown>;
      Object.defineProperty(group, match[2], {
        value,
        enumerable: true,
        configurable: true,
      });
    } else {
      Object.defineProperty(body, name, {
        value: name === "consent" ? value === "on" : value,
        enumerable: true,
        configurable: true,
      });
    }
  }
  return body;
}
