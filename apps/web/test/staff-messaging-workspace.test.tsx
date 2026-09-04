import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  StaffMessagingWorkspace,
  staffMessagingFixture,
  type StaffMessagingState,
} from "../src/features/staff-messaging/StaffMessagingWorkspace";

describe("staff messaging workspace", () => {
  it("renders an accountable inbox and conversation composer", () => {
    const html = renderToStaticMarkup(<StaffMessagingWorkspace />);

    expect(html).toContain("Keep the handoff visible.");
    expect(html).toContain("Front desk · clinical team");
    expect(html).toContain("Acknowledgement requested.");
    expect(html).toContain("Acknowledge");
    expect(html).toContain("Write a staff message");
    expect(html).toContain(
      "The server will apply membership, scope, and idempotency checks.",
    );
    expect(html).toContain('aria-label="Staff conversations"');
  });

  it("keeps loading, error, and empty states explicit", () => {
    const base: StaffMessagingState = {
      ...staffMessagingFixture,
      conversations: [],
    };

    expect(
      renderToStaticMarkup(
        <StaffMessagingWorkspace state={{ ...base, loading: true }} />,
      ),
    ).toContain("Loading staff messages");
    expect(
      renderToStaticMarkup(
        <StaffMessagingWorkspace
          state={{ ...base, error: "Synthetic load failure." }}
        />,
      ),
    ).toContain("Synthetic load failure.");
    expect(
      renderToStaticMarkup(<StaffMessagingWorkspace state={base} />),
    ).toContain("No conversations yet");
  });

  it("renders a server-denied composer without implying client authority", () => {
    const html = renderToStaticMarkup(
      <StaffMessagingWorkspace
        state={{ ...staffMessagingFixture, canSend: false }}
      />,
    );

    expect(html).toContain(
      "You do not have permission to send in this conversation.",
    );
    expect(html).toContain("Send message");
    expect(html).toContain("backend adapter remains the authority");
  });
});
