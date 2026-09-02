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
};
let csrfRequest: Promise<Configuration> | undefined;
let csrfGeneration = 0;
export function clearCsrf() {
  csrfToken = undefined;
  csrfRequest = undefined;
  csrfGeneration += 1;
}

async function loadCsrf(generation: number): Promise<Configuration> {
  const response = await fetch("/api/csrf", {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok)
    throw new ApiError(response.status, "Unable to connect. Please try again.");
  const data = (await response.json()) as Configuration;
  if (generation !== csrfGeneration)
    throw new ApiError(
      409,
      "Your session changed. Reload before trying again.",
    );
  csrfToken = data.csrf_token;
  return data;
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
  // Initialize the cookie's CSRF state before parallel session/resource reads.
  // Otherwise their earlier cookie snapshots can overwrite that initialization.
  if (!csrfToken || csrfRequest) await csrf();
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal: options.signal,
    headers: {
      Accept: "application/json",
      ...(method === "GET"
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": csrfToken! }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 204) {
    if (path === "/api/session") clearCsrf();
    return undefined as T;
  }
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  if (!response.ok) {
    if (response.status === 401 || response.status === 422) clearCsrf();
    throw new ApiError(
      response.status,
      data.error || "The request could not be completed.",
      data.code,
    );
  }
  // Session rotation invalidates the old CSRF token. Never replay mutations.
  if (path === "/api/session" || path === "/api/development_session") {
    if (method !== "GET") clearCsrf();
  }
  return data as T;
}

export function loginDestination(value: string | null): string {
  if (!value) return "/portal";
  const exact = new Set([
    "/clinic",
    "/clinic/chart-selection",
    "/clinic/schedule",
    "/clinic/patients",
    "/clinic/pharmacy",
    "/clinic/pharmacy/new",
    "/clinic/operations",
    "/clinic/inventory",
    "/clinic/staff",
    "/clinic/settings",
  ]);
  return exact.has(value) ||
    /^\/clinic\/inventory(?:\/[^/]+)?$/.test(value) ||
    /^\/clinic\/pharmacy\/\d+$/.test(value) ||
    /^\/clinic\/patients\/\d+$/.test(value) ||
    /^\/clinic\/patients\/\d+\/encounters\/\d+$/.test(value)
    ? value
    : "/portal";
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
