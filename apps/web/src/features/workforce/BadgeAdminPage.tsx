import { useEffect, useMemo, useState } from "react";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import {
  formatDisplayDate,
  formatDisplayDateTime,
} from "../../shared/dateTime";
import { useClinic } from "../clinic/Workspace";
import { isDemoFrame } from "../demo/frame";
import type { BadgeRecord, KioskEnrollment } from "./clockTypes";

type PrintableBadge = {
  token: string;
  barcode_svg: string;
  reprintable: false;
};

export function BadgeAdminPage() {
  const clinic = useClinic();
  const canManageBadges = clinic.capabilities.workforce_badges === true;
  const canManageKiosks = clinic.capabilities.workforce_settings === true;
  const [badgeError, setBadgeError] = useState("");
  const [kioskError, setKioskError] = useState("");
  const [siteId, setSiteId] = useState(
    String(clinic.current_site?.id ?? clinic.sites[0]?.id ?? ""),
  );
  const [employees, setEmployees] = useState<
    Array<{ id: number; employee_name: string; active_for_work: boolean }>
  >([]);
  const [badges, setBadges] = useState<BadgeRecord[]>([]);
  const [kiosks, setKiosks] = useState<KioskEnrollment[]>([]);
  const [employmentId, setEmploymentId] = useState("");
  const [pin, setPin] = useState("");
  const [printable, setPrintable] = useState<PrintableBadge | null>(null);
  const [enrollmentToken, setEnrollmentToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    setEmployees([]);
    setBadges([]);
    setEmploymentId("");
    setPin("");
    setBadgeError("");
    if (canManageBadges && siteId) {
      api<{
        badges: BadgeRecord[];
        employees: Array<{
          id: number;
          employee_name: string;
          active_for_work: boolean;
        }>;
      }>(`/api/clinic/workforce/badges?site_id=${encodeURIComponent(siteId)}`, {
        signal: abort.signal,
      })
        .then((data) => {
          if (abort.signal.aborted) return;
          setEmployees(data.employees);
          setBadges(data.badges);
        })
        .catch((reason: unknown) => {
          if (!abort.signal.aborted)
            setBadgeError(
              reason instanceof Error
                ? reason.message
                : "Unable to load employee badges.",
            );
        });
    }
    return () => abort.abort();
  }, [siteId, revision, canManageBadges]);

  useEffect(() => {
    const abort = new AbortController();
    setKiosks([]);
    setKioskError("");
    if (canManageKiosks && siteId) {
      api<{ kiosks: KioskEnrollment[] }>(
        `/api/clinic/workforce/kiosks?site_id=${encodeURIComponent(siteId)}`,
        { signal: abort.signal },
      )
        .then((data) => {
          if (!abort.signal.aborted) setKiosks(data.kiosks);
        })
        .catch((reason: unknown) => {
          if (!abort.signal.aborted)
            setKioskError(
              reason instanceof Error
                ? reason.message
                : "Unable to load kiosk enrollment.",
            );
        });
    }
    return () => abort.abort();
  }, [siteId, revision, canManageKiosks]);

  useEffect(() => {
    setPrintable(null);
    setEnrollmentToken("");
    setFeedback(null);
  }, [siteId, canManageBadges, canManageKiosks]);

  const eligible = useMemo(
    () => employees.filter((employment) => employment.active_for_work),
    [employees],
  );

  async function issueBadge() {
    if (!canManageBadges || busy) return;
    if (!employmentId || !siteId) {
      setFeedback({
        type: "error",
        text: "Choose an active employee and location before issuing a badge.",
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const result = await api<{
        badge: BadgeRecord;
        printable: PrintableBadge;
      }>("/api/clinic/workforce/badges", {
        method: "POST",
        body: {
          employment_id: employmentId,
          site_id: siteId,
          pin: pin || null,
        },
      });
      setPrintable(result.printable);
      setBadges((current) => [
        {
          ...result.badge,
          employee_name:
            employees.find((employee) => String(employee.id) === employmentId)
              ?.employee_name ?? result.badge.employee_name,
        },
        ...current.filter((badge) => badge.id !== result.badge.id),
      ]);
      setPin("");
      setRevision((value) => value + 1);
      setFeedback({
        type: "success",
        text: "Badge issued. Print it now; the barcode cannot be retrieved later.",
      });
    } catch (reason) {
      setPin("");
      setFeedback({
        type: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to issue the badge.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function revokeBadge(id: number) {
    if (!canManageBadges || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await api(`/api/clinic/workforce/badges/${id}/revoke`, {
        method: "POST",
        body: { site_id: siteId },
      });
      setFeedback({
        type: "success",
        text: "Badge revoked. The employee account remains active.",
      });
      setRevision((value) => value + 1);
    } catch (reason) {
      setFeedback({
        type: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to revoke the badge.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function createEnrollment() {
    if (!canManageKiosks || busy || !siteId) return;
    setBusy(true);
    setFeedback(null);
    setEnrollmentToken("");
    try {
      const result = await api<{ enrollment_token: string }>(
        "/api/clinic/workforce/kiosks",
        {
          method: "POST",
          body: { site_id: siteId },
        },
      );
      setEnrollmentToken(result.enrollment_token);
      setFeedback({
        type: "success",
        text: "Kiosk enrollment created. Enter the one-time code on the kiosk within 24 hours.",
      });
      setRevision((value) => value + 1);
    } catch (reason) {
      setFeedback({
        type: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to create kiosk enrollment.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function revokeKiosk(id: number) {
    if (!canManageKiosks || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await api(`/api/clinic/workforce/kiosks/${id}/revoke`, {
        method: "POST",
        body: {},
      });
      setFeedback({ type: "success", text: "Kiosk access revoked." });
      setRevision((value) => value + 1);
    } catch (reason) {
      setFeedback({
        type: "error",
        text:
          reason instanceof Error
            ? reason.message
            : "Unable to revoke the kiosk.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h1">Badges and kiosks</Typography>
        <Typography color="text.secondary">
          Issue one active clock badge per employee and manage clock-only device
          enrollment.
        </Typography>
      </Box>
      {feedback && <Alert severity={feedback.type}>{feedback.text}</Alert>}
      <TextField
        select
        label="Location"
        disabled={busy}
        value={siteId}
        onChange={(event) => {
          setPin("");
          setSiteId(event.target.value);
        }}
        sx={{ maxWidth: 360 }}
      >
        {clinic.sites.map((site) => (
          <MenuItem key={site.id} value={String(site.id)}>
            {site.name || site.code}
          </MenuItem>
        ))}
      </TextField>

      {canManageBadges && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={2}>
            <Typography variant="h2">Employee badges</Typography>
            {badgeError && <Alert severity="error">{badgeError}</Alert>}
            {badges.map((badge) => (
              <Stack
                key={badge.id}
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{
                  justifyContent: "space-between",
                  alignItems: { sm: "center" },
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>
                    {badge.employee_name}
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Chip
                      size="small"
                      label={badge.status}
                      color={badge.status === "issued" ? "success" : "default"}
                    />
                    <Typography variant="body2" color="text.secondary">
                      Issued{" "}
                      {formatDisplayDate(badge.issued_at, {
                        timeZone: clinic.practice.timezone,
                      })}
                      {badge.pin_required ? " · PIN required" : ""}
                    </Typography>
                  </Stack>
                </Box>
                {badge.status === "issued" && (
                  <Button
                    color="warning"
                    disabled={busy}
                    onClick={() => void revokeBadge(badge.id)}
                  >
                    Revoke lost badge
                  </Button>
                )}
              </Stack>
            ))}
            {!badgeError && !badges.length && (
              <Typography color="text.secondary">
                No badges have been issued for this location.
              </Typography>
            )}
            <Divider />
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              sx={{ alignItems: { md: "flex-start" } }}
            >
              <TextField
                select
                fullWidth
                label="Employee"
                value={employmentId}
                onChange={(event) => {
                  setPin("");
                  setEmploymentId(event.target.value);
                }}
              >
                {eligible.map((employment) => (
                  <MenuItem key={employment.id} value={String(employment.id)}>
                    {employment.employee_name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Optional PIN"
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                helperText="4–12 digits. Meta Clinic stores only a slow hash."
                slotProps={{
                  htmlInput: {
                    inputMode: "numeric",
                    pattern: "[0-9]{4,12}",
                    maxLength: 12,
                    autoComplete: "new-password",
                  },
                }}
              />
              <Button
                variant="contained"
                startIcon={<BadgeOutlinedIcon />}
                disabled={
                  busy || !employmentId || (!!pin && !/^\d{4,12}$/.test(pin))
                }
                onClick={() => void issueBadge()}
                sx={{ whiteSpace: "nowrap" }}
              >
                Issue or replace badge
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}

      {canManageKiosks && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={2}>
            <Typography variant="h2">Clock kiosk enrollment</Typography>
            {kioskError && <Alert severity="error">{kioskError}</Alert>}
            <Typography color="text.secondary">
              The one-time enrollment code creates a secure, clock-only session.
              It does not sign the device into the clinic workspace. Open the
              clock on the device you want to enroll, then enter the code there.
            </Typography>
            <Button
              href={
                isDemoFrame()
                  ? "/workforce/kiosk?workspace=demo"
                  : "/workforce/kiosk"
              }
              target="_blank"
              rel="noreferrer"
              variant="outlined"
              sx={{ alignSelf: "start" }}
            >
              Open kiosk clock
            </Button>
            {kiosks.map((kiosk) => (
              <Stack
                key={kiosk.id}
                direction={{ xs: "column", sm: "row" }}
                sx={{
                  justifyContent: "space-between",
                  alignItems: { sm: "center" },
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>
                    {kiosk.site_name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {kiosk.status} · expires{" "}
                    {formatDisplayDateTime(kiosk.expires_at, {
                      timeZone: clinic.practice.timezone,
                    })}
                  </Typography>
                </Box>
                {!["revoked", "expired"].includes(kiosk.status) && (
                  <Button
                    color="warning"
                    disabled={busy}
                    onClick={() => void revokeKiosk(kiosk.id)}
                  >
                    Revoke kiosk
                  </Button>
                )}
              </Stack>
            ))}
            <Button
              variant="outlined"
              disabled={busy || !siteId}
              onClick={() => void createEnrollment()}
              sx={{ alignSelf: "start" }}
            >
              Create enrollment code
            </Button>
            {enrollmentToken && (
              <Alert severity="warning">
                <Typography sx={{ fontWeight: 700 }}>
                  Enter this code on the kiosk now
                </Typography>
                <TextField
                  fullWidth
                  label="One-time enrollment code"
                  value={enrollmentToken}
                  slotProps={{ htmlInput: { readOnly: true } }}
                  sx={{ mt: 1 }}
                />
              </Alert>
            )}
          </Stack>
        </Paper>
      )}

      <Dialog
        open={canManageBadges && !!printable}
        onClose={() => setPrintable(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Print employee clock badge</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This is the only time the barcode is available. Closing this window
            requires issuing a replacement.
          </Alert>
          {printable && (
            <Box
              id="workforce-print-badge"
              sx={{
                p: 3,
                bgcolor: "common.white",
                color: "common.black",
                textAlign: "center",
              }}
            >
              <Box
                component="img"
                alt="Employee clock badge barcode"
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(printable.barcode_svg)}`}
                sx={{ display: "block", width: "100%", height: 112 }}
              />
              <Typography
                sx={{ fontFamily: "monospace", mt: 1, wordBreak: "break-all" }}
              >
                {printable.token}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrintable(null)}>Close</Button>
          <Button
            variant="contained"
            startIcon={<PrintOutlinedIcon />}
            onClick={() => window.print()}
          >
            Print
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
