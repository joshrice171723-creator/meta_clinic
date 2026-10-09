import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { qaWorkspaceView } from "../src/features/qa/QaWorkspace";
import {
  AgentRoomMessage,
  QaAgentRoom,
  mergeRoomMessages,
  type RoomMessage,
} from "../src/features/qa/QaAgentRoom";

const item: RoomMessage = {
  id: 12,
  thread_id: 1,
  created_at: "2026-09-30T08:00:00Z",
  delivery: "persisted",
  authenticated_author_id: 1,
  revision: null,
  message: {
    agent: "<script>Muse</script>",
    recipient: "Dot",
    body: "<img src=x onerror=alert(1)>\nSynthetic nonce reply",
    identity: "self_reported",
    authenticated_source: "owner_session",
    provenance: "reported",
    reply_to: 1,
    task_id: 1,
    evidence_refs: [5],
    reference_revision: "a".repeat(40),
    case_reference: "Muse #218 (reported)",
    build_at_send: null,
    build_dirty: false,
    build_available: false,
  },
};
describe("agent coordination room", () => {
  it("opens the room bootstrap URL while retaining known views and the fallback", () => {
    expect(qaWorkspaceView("?view=room")).toBe("room");
    expect(qaWorkspaceView("?view=inbox")).toBe("inbox");
    expect(qaWorkspaceView("?view=unknown")).toBe("office");
    expect(qaWorkspaceView("")).toBe("office");
  });
  it("merges cursor pages without duplicate messages and bounds the visible history", () => {
    expect(
      mergeRoomMessages([item], [item, { ...item, id: 13 }]).map(
        (message) => message.id,
      ),
    ).toEqual([12, 13]);
    const history = Array.from({ length: 103 }, (_, id) => ({
      ...item,
      id: id + 1,
    }));
    expect(mergeRoomMessages([], history)).toHaveLength(100);
    expect(mergeRoomMessages([], history)[0].id).toBe(4);
  });
  it("escapes untrusted names and messages and separates persistence from pickup", () => {
    const html = renderToStaticMarkup(<AgentRoomMessage item={item} />);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;Muse&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("self-reported");
    expect(html).toContain("recipient pickup unconfirmed");
    expect(html).toContain("message acknowledgment to #1");
    expect(html).toContain("server account #1");
    expect(html).toContain('href="/api/qa/evidence/5"');
    expect(html).toContain('href="/qa?view=inbox"');
    expect(html).toContain("not an observation verdict");
    expect(html).toContain("unavailable");
  });
  it("displays an uncommitted build as such without an exact-build claim", () => {
    const html = renderToStaticMarkup(
      <AgentRoomMessage
        item={{
          ...item,
          message: {
            ...item.message,
            build_available: true,
            build_at_send: "b".repeat(40),
            build_dirty: true,
          },
        }}
      />,
    );
    expect(html).toContain("uncommitted source");
  });
  it("starts with explicit read and write boundaries without a fabricated connected status", () => {
    const html = renderToStaticMarkup(<QaAgentRoom />);
    expect(html).toContain("Public read access");
    expect(html).toContain("Loading messages");
    expect(html).toContain("untrusted reported observations");
    expect(html).not.toContain("Post message");
  });
});
