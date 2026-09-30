import type { App } from "@modelcontextprotocol/ext-apps";
import { ApiError } from "../../api/client";
import type { OfficeRequest } from "./officeTransport";
import { sharedOffice, type SharedOffice } from "./sharedOffice";

type ToolCall = { name: string; arguments: Record<string, unknown> };
type Options = NonNullable<Parameters<OfficeRequest>[1]>;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Office request envelope is unavailable.");
  return value as Record<string, unknown>;
}

function fields(
  value: Record<string, unknown>,
  allowed: string[],
  key: string,
) {
  if (Object.keys(value).some((name) => !allowed.includes(name)))
    throw new Error("Office request contains unsupported fields.");
  if (
    typeof value[key] !== "string" ||
    !/^[A-Za-z0-9_-]{8,100}$/.test(value[key])
  )
    throw new Error("Office request requires its original stable request key.");
}

/** Exact Office-only tool contract. No browser credentials or arbitrary proxy route. */
export function officeToolCall(path: string, options: Options = {}): ToolCall {
  const method = options.method ?? "GET";
  if (method === "GET") {
    const reads: Record<string, string> = {
      "/api/qa/office": "dot_office_state",
      "/api/qa/office/work": "dot_office_work",
      "/api/qa/office/qa": "dot_office_qa",
    };
    if (reads[path] && options.body === undefined)
      return { name: reads[path], arguments: {} };
    const room = /^\/api\/qa\/room(?:\?after_id=([0-9]+))?$/.exec(path);
    if (room && options.body === undefined) {
      const after = room[1] === undefined ? undefined : Number(room[1]);
      if (after !== undefined && !Number.isSafeInteger(after))
        throw new Error("Office message cursor is invalid.");
      return {
        name: "dot_office_room_read",
        arguments: after === undefined ? {} : { after_id: after },
      };
    }
  } else if (method === "POST") {
    const writes: Record<string, [string, string]> = {
      "/api/qa/tasks": ["dot_office_task_create", "task"],
      "/api/qa/room/messages": ["dot_office_room_post", "message"],
      "/api/qa/office/position": ["dot_office_position", "position"],
      "/api/qa/office/check-ins": ["dot_office_checkin", "check_in"],
      "/api/qa/office/qa/defects": ["dot_office_defect", "report"],
      "/api/qa/office/qa/retests": ["dot_office_retest", "retest"],
      "/api/qa/office/qa/batches/poll": ["dot_office_batch_poll", "poll"],
    };
    const definition = writes[path];
    if (definition) {
      const body = object(options.body);
      const envelope = object(body[definition[1]]);
      if (Object.keys(body).length !== 1)
        throw new Error("Office request contains unsupported fields.");
      const allowed: Record<string, string[]> = {
        task: [
          "request_key",
          "kind",
          "title",
          "recipient",
          "assigned_actor",
          "revision",
          "payload",
        ],
        message: [
          "message_key",
          "recipient",
          "body",
          "task_id",
          "correlation_nonce",
          "reply_to",
          "reference_revision",
          "case_reference",
          "evidence_refs",
        ],
        position: ["request_key", "expected_revision", "x", "y"],
        check_in: ["request_key", "expected_revision"],
        report: [
          "request_key",
          "title",
          "severity",
          "workflow",
          "repro_steps",
          "expected",
          "actual",
        ],
        retest: ["request_key", "defect_id"],
        poll: ["request_key", "batch_id"],
      };
      fields(
        envelope,
        allowed[definition[1]],
        definition[1] === "message" ? "message_key" : "request_key",
      );
      if (path === "/api/qa/tasks" && envelope.kind !== "coordination")
        throw new Error(
          "The Office connection can create only coordination work.",
        );
      if (
        path === "/api/qa/tasks" &&
        Object.keys(object(envelope.payload)).some(
          (key) => key !== "description",
        )
      )
        throw new Error(
          "Office work contains unsupported instructions metadata.",
        );
      if (
        path === "/api/qa/room/messages" &&
        ("agent" in envelope || "authenticated_actor" in envelope)
      )
        throw new Error("Office message identity is assigned by the server.");
      return { name: definition[0], arguments: { [definition[1]]: envelope } };
    }
    const transition =
      /^\/api\/qa\/office\/work\/([1-9][0-9]*)\/transition$/.exec(path);
    if (transition && Number.isSafeInteger(Number(transition[1]))) {
      const envelope = object(options.body);
      fields(
        envelope,
        ["request_key", "status", "result", "assigned_actor"],
        "request_key",
      );
      if (
        ![
          "picked_up",
          "acknowledged",
          "working",
          "blocked",
          "completed",
          "result_confirmed",
          "handoff",
        ].includes(String(envelope.status))
      )
        throw new Error(
          "This transition is outside the dot Office connection.",
        );
      if (
        envelope.result !== undefined &&
        Object.keys(object(envelope.result)).some(
          (key) => !["summary", "evidence_refs"].includes(key),
        )
      )
        throw new Error("Office result contains unsupported fields.");
      return {
        name: "dot_office_task_transition",
        arguments: { work_id: Number(transition[1]), transition: envelope },
      };
    }
  }
  throw new Error("This route or method is outside the Office connection.");
}

export function createMcpOfficeRequest(
  app: Pick<App, "callServerTool">,
  initialOffice?: () => unknown,
): OfficeRequest {
  let office: SharedOffice | undefined;
  let initialConsumed = false;
  const call = async (
    command: ToolCall,
    options: Options,
  ): Promise<unknown> => {
    let result: Awaited<ReturnType<App["callServerTool"]>>;
    try {
      result = await app.callServerTool(command, {
        signal: options.signal,
        timeout: options.timeoutMs ?? 30_000,
      });
    } catch (reason) {
      if (options.signal?.aborted) throw reason;
      throw new ApiError(
        504,
        options.method === "POST"
          ? "Office delivery could not be confirmed. Check the record or retry the same action with unchanged content."
          : "The Office server could not be reached. Refresh to retry.",
        options.method === "POST" ? "outcome_unconfirmed" : "request_timeout",
      );
    }
    const text = (result.content ?? [])
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
    let payload: unknown = result.structuredContent;
    if (payload === undefined && text) {
      try {
        payload = JSON.parse(text);
      } catch {
        /* A human summary is not a backend response. */
      }
    }
    if (result.isError) {
      const backend =
        payload && typeof payload === "object"
          ? (payload as { error?: string; code?: string; status?: number })
          : undefined;
      const status =
        Number.isInteger(backend?.status) &&
        backend!.status! >= 400 &&
        backend!.status! <= 599
          ? backend!.status!
          : 422;
      throw new ApiError(
        status,
        backend?.error || text || "Office action rejected by the server.",
        backend?.code,
      );
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new ApiError(
        502,
        "The Office response could not be confirmed. Inputs remain available for an explicit retry.",
        "outcome_unconfirmed",
      );
    return payload;
  };
  const readState = async (options: Options) => {
    const initial = initialConsumed ? undefined : initialOffice?.();
    initialConsumed = true;
    office = undefined;
    const payload =
      initial ??
      (await call({ name: "dot_office_state", arguments: {} }, options));
    office = sharedOffice(payload);
    return payload;
  };
  return async <T>(path: string, options: Options = {}) => {
    const command = officeToolCall(path, options);
    options.signal?.throwIfAborted();
    if (command.name === "dot_office_state")
      return (await readState(options)) as T;
    if (options.method === "POST") {
      if (!office)
        await readState({
          signal: options.signal,
          timeoutMs: options.timeoutMs,
        });
      if (
        office?.actor_state?.actor_binding !== "server_bound" ||
        office.actor_state.controlled_actor !== "dot"
      )
        throw new ApiError(
          403,
          "Office writes require the authenticated dot binding.",
        );
    }
    return (await call(command, options)) as T;
  };
}
