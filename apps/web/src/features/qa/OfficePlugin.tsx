import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  Stack,
  Typography,
} from "@mui/material";
import { QaOffice } from "./QaOffice";
import { QaAgentRoom } from "./QaAgentRoom";
import {
  OfficeLinks,
  OfficeTransport,
  type OfficeRequest,
} from "./officeTransport";
import { useSharedOffice } from "./useSharedOffice";
import "./qa.css";

const websiteLink = (path: string) =>
  new URL(path, "https://aimetaclinic.com").href;

/** The canonical Office components, with only the host transport supplied. */
export function OfficePlugin({
  request,
  openLink,
}: {
  request: OfficeRequest;
  openLink: (url: string) => Promise<void>;
}) {
  const { office, officeError, refreshOffice } = useSharedOffice(request, true);
  const [room, setRoom] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  useEffect(() => {
    void refreshOffice();
  }, [refreshOffice]);
  const connected =
    office?.actor_state?.actor_binding === "server_bound" &&
    office.actor_state.controlled_actor === "dot";
  const navigate = (view: string) => {
    if (view === "room") {
      setRoom(true);
      return;
    }
    if (!["inbox", "timeline"].includes(view)) return;
    void openLink(websiteLink(`/qa?view=${view}`)).catch((reason) => {
      setNavigationError(
        reason instanceof Error
          ? reason.message
          : "The web view could not open.",
      );
    });
  };
  return (
    <OfficeTransport.Provider value={request}>
      <OfficeLinks.Provider value={websiteLink}>
        <Box component="main" className="qa-workspace">
          <Box className="qa-main" sx={{ mx: "auto", px: { xs: 2, md: 4 } }}>
            <Stack
              direction="row"
              sx={{
                gap: 2,
                alignItems: "center",
                justifyContent: "space-between",
                mb: 2,
              }}
            >
              <Typography component="h1" variant="h5">
                Command Center Office
              </Typography>
              <Button onClick={() => void refreshOffice()}>
                Refresh Office
              </Button>
            </Stack>
            <Alert severity={connected ? "info" : "warning"} sx={{ mb: 2 }}>
              {connected
                ? "Authenticated as dot. Actions use the server-bound dot identity."
                : "Waiting for the authenticated dot connection. Shared controls require that binding."}
            </Alert>
            {navigationError && (
              <Alert severity="error">{navigationError}</Alert>
            )}
            <QaOffice
              tasks={office?.tasks ?? []}
              evidence={office?.evidence ?? []}
              events={office?.events ?? []}
              build={office?.build}
              actorState={office?.actor_state}
              loading={!office && !officeError}
              error={
                officeError ||
                (!connected && office
                  ? "The Office connection is not bound to dot."
                  : "")
              }
              onRefresh={() => void refreshOffice()}
              onNavigate={navigate}
            />
            <Dialog
              open={room}
              onClose={() => setRoom(false)}
              fullWidth
              maxWidth="lg"
            >
              <DialogTitle>Office message history</DialogTitle>
              <DialogContent>
                {room && <QaAgentRoom boundOffice />}
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setRoom(false)}>Return to Office</Button>
              </DialogActions>
            </Dialog>
          </Box>
        </Box>
      </OfficeLinks.Provider>
    </OfficeTransport.Provider>
  );
}
