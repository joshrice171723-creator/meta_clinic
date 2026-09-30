import { App } from "@modelcontextprotocol/ext-apps";
import { createRoot } from "react-dom/client";
import { Alert, Box, Button, Typography } from "@mui/material";
import { OfficePlugin } from "./features/qa/OfficePlugin";
import { createMcpOfficeRequest } from "./features/qa/mcpOfficeTransport";

const root = createRoot(document.getElementById("root")!);
let app: App | undefined;
let closed = false;

async function connect() {
  root.render(
    <Box sx={{ p: 3 }}>
      <Typography role="status">
        Connecting to Command Center Office…
      </Typography>
    </Box>,
  );
  const candidate = new App(
    { name: "Command Center Office", version: "1.0.0" },
    { availableDisplayModes: ["fullscreen"] },
    { autoResize: false, strict: true },
  );
  let initialOffice: unknown;
  candidate.ontoolresult = (result) => {
    const snapshot = result.structuredContent;
    if (
      !result.isError &&
      snapshot?.contract_version === 1 &&
      Array.isArray(snapshot.tasks) &&
      Array.isArray(snapshot.evidence) &&
      Array.isArray(snapshot.events)
    )
      initialOffice = snapshot;
  };
  app = candidate;
  try {
    await candidate.connect(undefined, { timeout: 30_000 });
    if (closed || app !== candidate) return;
    if (!candidate.getHostCapabilities()?.serverTools)
      throw new Error("This host does not provide the Office server tools.");
    const context = candidate.getHostContext();
    if (
      context?.displayMode !== "fullscreen" &&
      context?.availableDisplayModes?.includes("fullscreen")
    )
      await candidate.requestDisplayMode({ mode: "fullscreen" });
    if (closed || app !== candidate) return;
    const request = createMcpOfficeRequest(candidate, () => initialOffice);
    root.render(
      <OfficePlugin
        request={request}
        openLink={async (url) => {
          const response = await candidate.openLink({ url });
          if (response.isError)
            throw new Error("The host could not open the requested web view.");
        }}
      />,
    );
  } catch (reason) {
    void candidate.close().catch(() => {});
    if (closed || app !== candidate) return;
    root.render(
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          {reason instanceof Error
            ? reason.message
            : "Office connection failed."}
        </Alert>
        <Button onClick={() => void connect()}>Reconnect Office</Button>
      </Box>,
    );
  }
}
void connect();
window.addEventListener("pagehide", () => {
  closed = true;
  root.unmount();
  void app?.close();
});
