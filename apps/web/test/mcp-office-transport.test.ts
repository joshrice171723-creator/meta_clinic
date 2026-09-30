import { describe, expect, it, vi } from "vitest";
import type { App } from "@modelcontextprotocol/ext-apps";
import {
  createMcpOfficeRequest,
  officeToolCall,
} from "../src/features/qa/mcpOfficeTransport";

const key = "same-office-request-123";
const office = (controlled: "dot" | "josh" = "dot") => ({
  contract_version: 1,
  actor_binding: "not_configured",
  receipts: null,
  cadence: null,
  actors: ["josh", "muse", "dot"].map((id) => ({
    id,
    name: id === "josh" ? "Josh" : id === "muse" ? "Muse" : "dot",
    connection: "not_connected",
    control: "uncontrolled",
    position: null,
  })),
  tasks: [],
  events: [],
  evidence: [],
  actor_state: {
    contract_version: 1,
    actor_binding: "server_bound",
    controlled_actor: controlled,
    muse_cadence_ms: null,
    actors: ["josh", "muse", "dot", "codex"].map((id) => ({
      id,
      name:
        id === "josh"
          ? "Josh"
          : id === "muse"
            ? "Muse"
            : id === "codex"
              ? "Codex"
              : "dot",
      connection: "not_connected",
      control: id === controlled ? "bound" : "uncontrolled",
      position: null,
      revision: 0,
      principal_id: id === controlled ? "actual-principal" : null,
      receipt: null,
    })),
  },
});
const sdk = (callServerTool: ReturnType<typeof vi.fn>) =>
  ({ callServerTool }) as Pick<App, "callServerTool">;

describe("Office MCP transport", () => {
  it("maps exact Office envelopes and rejects broad routes, identity fields and unknown verbs", () => {
    expect(officeToolCall("/api/qa/office")).toEqual({
      name: "dot_office_state",
      arguments: {},
    });
    expect(officeToolCall("/api/qa/office/work").name).toBe("dot_office_work");
    expect(officeToolCall("/api/qa/office/qa").name).toBe("dot_office_qa");
    expect(officeToolCall("/api/qa/room?after_id=37")).toEqual({
      name: "dot_office_room_read",
      arguments: { after_id: 37 },
    });
    const task = {
      request_key: key,
      kind: "coordination",
      assigned_actor: "codex",
      recipient: "codex",
      title: "Return a summary",
      revision: "a".repeat(40),
      payload: { description: "Share recorded evidence." },
    };
    expect(
      officeToolCall("/api/qa/tasks", { method: "POST", body: { task } }),
    ).toEqual({ name: "dot_office_task_create", arguments: { task } });
    const transition = {
      request_key: key,
      status: "handoff",
      assigned_actor: "muse",
      result: { summary: "Recorded handoff" },
    };
    expect(
      officeToolCall("/api/qa/office/work/9/transition", {
        method: "POST",
        body: transition,
      }),
    ).toEqual({
      name: "dot_office_task_transition",
      arguments: { work_id: 9, transition },
    });
    for (const [route, envelope, name] of [
      ["/api/qa/room/messages", "message", "dot_office_room_post"],
      ["/api/qa/office/position", "position", "dot_office_position"],
      ["/api/qa/office/check-ins", "check_in", "dot_office_checkin"],
      ["/api/qa/office/qa/defects", "report", "dot_office_defect"],
      ["/api/qa/office/qa/retests", "retest", "dot_office_retest"],
      ["/api/qa/office/qa/batches/poll", "poll", "dot_office_batch_poll"],
    ])
      expect(
        officeToolCall(route, {
          method: "POST",
          body: {
            [envelope]: {
              [envelope === "message" ? "message_key" : "request_key"]: key,
            },
          },
        }).name,
      ).toBe(name);
    expect(() =>
      officeToolCall("/api/qa/pin", { method: "POST", body: {} }),
    ).toThrow(/outside/);
    expect(() => officeToolCall("/api/clinic/patients")).toThrow(/outside/);
    expect(() =>
      officeToolCall("/api/qa/office", { method: "DELETE" }),
    ).toThrow(/outside/);
    expect(() => officeToolCall("/api/qa/room?after_id=1&token=x")).toThrow(
      /outside/,
    );
    expect(() =>
      officeToolCall("/api/qa/room/messages", {
        method: "POST",
        body: { message: { message_key: key, agent: "Josh" } },
      }),
    ).toThrow(/unsupported/);
    expect(() =>
      officeToolCall("/api/qa/tasks", {
        method: "POST",
        body: { task: { ...task, kind: "qa_run" } },
      }),
    ).toThrow(/only coordination/);
    expect(() =>
      officeToolCall("/api/qa/office/work/9/transition", {
        method: "POST",
        body: { ...transition, status: "recover" },
      }),
    ).toThrow(/outside/);
  });

  it("hydrates the actual opener snapshot and returns backend JSON without reshaping it", async () => {
    const snapshot = office();
    const work = {
      tasks: [{ id: 5, allowed_transitions: [] }],
      can_post: true,
      controlled_actor: "dot",
    };
    const call = vi
      .fn()
      .mockResolvedValue({ content: [], structuredContent: work });
    const request = createMcpOfficeRequest(sdk(call), () => snapshot);
    expect(await request("/api/qa/office")).toBe(snapshot);
    expect(call).not.toHaveBeenCalled();
    expect(await request("/api/qa/office/work")).toBe(work);
    expect(call.mock.calls[0][0]).toEqual({
      name: "dot_office_work",
      arguments: {},
    });
  });

  it("retains identical write envelopes across uncertain delivery and accepts a real JSON text response", async () => {
    const response = { id: 12, created_at: "2026-09-30T19:00:00Z" };
    const call = vi
      .fn()
      .mockRejectedValueOnce(new Error("transport timeout"))
      .mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify(response) }],
      });
    const request = createMcpOfficeRequest(sdk(call), () => office());
    await request("/api/qa/office");
    const options = {
      method: "POST",
      body: {
        message: {
          message_key: key,
          body: "Recorded coordination",
          recipient: "Muse",
        },
      },
    };
    await expect(request("/api/qa/room/messages", options)).rejects.toThrow(
      /could not be confirmed/,
    );
    expect(call).toHaveBeenCalledTimes(1);
    expect(await request("/api/qa/room/messages", options)).toEqual(response);
    expect(call.mock.calls[0][0]).toEqual(call.mock.calls[1][0]);
    expect(options.body.message).not.toHaveProperty("agent");
  });

  it("refuses writes from a different actor and never treats an empty or failed result as success", async () => {
    const call = vi.fn().mockResolvedValue({ content: [] });
    const request = createMcpOfficeRequest(sdk(call), () => office("josh"));
    await request("/api/qa/office");
    await expect(
      request("/api/qa/office/check-ins", {
        method: "POST",
        body: { check_in: { request_key: key, expected_revision: 0 } },
      }),
    ).rejects.toThrow(/dot binding/);
    expect(call).not.toHaveBeenCalled();
    await expect(request("/api/qa/office/qa")).rejects.toThrow(
      /could not be confirmed/,
    );
    call.mockResolvedValue({
      content: [{ type: "text", text: "Forbidden action" }],
      isError: true,
    });
    await expect(request("/api/qa/office/qa")).rejects.toThrow(
      "Forbidden action",
    );
    call.mockResolvedValue({
      content: [],
      structuredContent: {
        error: "Lease changed",
        status: 409,
        code: "lease_conflict",
      },
      isError: true,
    });
    await expect(request("/api/qa/office/qa")).rejects.toMatchObject({
      status: 409,
      code: "lease_conflict",
      message: "Lease changed",
    });
    call.mockResolvedValue({
      content: [],
      structuredContent: {
        error: "Delivery unconfirmed",
        status: 504,
        code: "outcome_unconfirmed",
      },
      isError: true,
    });
    await expect(request("/api/qa/office/qa")).rejects.toMatchObject({
      status: 504,
      code: "outcome_unconfirmed",
    });
  });
});
