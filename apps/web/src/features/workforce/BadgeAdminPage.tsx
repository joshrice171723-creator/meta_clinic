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
import { ApiError, api } from "../../api/client";
import {
  formatDisplayDate,
  formatDisplayDateTime,
} from "../../shared/dateTime";
import { useClinic } from "../clinic/Workspace";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";
import { isDemoFrame } from "../demo/frame";
import type { BadgeRecord, KioskEnrollment } from "./clockTypes";

type PrintableBadge = {
  token: string;
  barcode_svg: string;
  reprintable: false;
};
type BadgePrint = PrintableBadge & { badge_id: number; employee_name: string };
type EnrollmentCode = { token: string; kiosk: KioskEnrollment };

export function BadgeAdminPage() {
  const clinic = useClinic();
  const { registerBlocker } = useClinicNavigation();
  const canManageBadges = clinic.capabilities.workforce_badges === true;
  const canManageKiosks = clinic.capabilities.workforce_settings === true;
  const [badgeError, setBadgeError] = useState("");
  const [kioskError, setKioskError] = useState("");
  const [badgeLoading, setBadgeLoading] = useState(true);
  const [kioskLoading, setKioskLoading] = useState(true);
  const [pinRequired, setPinRequired] = useState<boolean | null>(null);
  const [settingsError, setSettingsError] = useState("");
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
  const [printable, setPrintable] = useState<BadgePrint | null>(null);
  const [enrollment, setEnrollment] = useState<EnrollmentCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const leaveMessage = busy
    ? "A badge or kiosk action is still saving."
    : printable || enrollment
      ? "A one-time badge or kiosk code is still displayed. Leaving loses it; it cannot be retrieved later."
      : pin
        ? "Discard the entered badge PIN?"
        : null;
  useDemoNavigationBlocker(() => ({ blocked: busy, message: leaveMessage }));
  useEffect(() => {
    if (!leaveMessage) return;
    const unregister = registerBlocker(() => leaveMessage, {
      preventNavigation: busy,
    });
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = leaveMessage;
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [leaveMessage, busy, registerBlocker]);

  function refreshRecords() {
    if (
      busy ||
      (pin && !window.confirm("Discard the entered badge PIN and refresh?"))
    )
      return;
    setPin("");
    setRevision((value) => value + 1);
  }

  function failureMessage(reason: unknown, action: string) {
    const rejected =
      reason instanceof ApiError &&
      reason.status >= 400 &&
      reason.status < 500 &&
      ![408, 429].includes(reason.status) &&
      !["outcome_unconfirmed", "session_changed"].includes(reason.code ?? "");
    const message =
      reason instanceof Error ? reason.message : `Unable to confirm ${action}.`;
    return rejected
      ? message
      : `${message} The action may have completed. Refresh and review saved records before issuing a replacement or another code.`;
  }

  useEffect(() => {
    const abort = new AbortController();
    setEmployees([]);
    setBadges([]);
    setBadgeError("");
    setBadgeLoading(canManageBadges && !!siteId);
    setPinRequired(null);
    setSettingsError("");
    if (canManageBadges && siteId) {
      api<{
        badges: BadgeRecord[];
        pin_required: boolean | null;
        settings_error?: string;
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
          setEmploymentId((current) =>
            data.employees.some(
              (employee) =>
                String(employee.id) === current && employee.active_for_work,
            )
              ? current
              : "",
          );
          setBadges(data.badges);
          setPinRequired(data.pin_required);
          setSettingsError(data.settings_error || "");
          setPrintable((current) =>
            current &&
            data.badges.some(
              (badge) =>
                badge.id === current.badge_id && badge.status === "issued",
            )
              ? current
              : null,
          );
        })
        .catch((reason: unknown) => {
          if (!abort.signal.aborted)
            setBadgeError(
              reason instanceof Error
                ? reason.message
                : "Unable to load employee badges.",
            );
        })
        .finally(() => {
          if (!abort.signal.aborted) setBadgeLoading(false);
        });
    }
    return () => abort.abort();
  }, [siteId, revision, canManageBadges]);

  useEffect(() => {
    const abort = new AbortController();
    setKiosks([]);
    setKioskError("");
    setKioskLoading(canManageKiosks && !!siteId);
    if (canManageKiosks && siteId) {
      api<{ kiosks: KioskEnrollment[] }>(
        `/api/clinic/workforce/kiosks?site_id=${encodeURIComponent(siteId)}`,
        { signal: abort.signal },
      )
        .then((data) => {
          if (abort.signal.aborted) return;
          setKiosks(data.kiosks);
          setEnrollment((current) =>
            current &&
            data.kiosks.some(
              (kiosk) =>
                kiosk.id === current.kiosk.id && kiosk.status === "issued",
            )
              ? current
              : null,
          );
        })
        .catch((reason: unknown) => {
          if (!abort.signal.aborted)
            setKioskError(
              reason instanceof Error
                ? reason.message
                : "Unable to load kiosk enrollment.",
            );
        })
        .finally(() => {
          if (!abort.signal.aborted) setKioskLoading(false);
        });
    }
    return () => abort.abort();
  }, [siteId, revision, canManageKiosks]);

  useEffect(() => {
    setEmploymentId("");
    setPin("");
    setPrintable(null);
    setEnrollment(null);
    setFeedback(null);
  }, [siteId, canManageBadges, canManageKiosks]);

  const eligible = useMemo(
    () => employees.filter((employment) => employment.active_for_work),
    [employees],
  );

  async function issueBadge() {
    if (!canManageBadges || busy || badgeLoading || badgeError || settingsError)
      return;
    if (!employmentId || !siteId) {
      setFeedback({
        type: "error",
        text: "Choose an active employee and location before issuing a badge.",
      });
      return;
    }
    if ((pinRequired && !pin) || (pin && !/^\d{4,12}$/.test(pin))) {
      setFeedback({ type: "error", text: "Enter a PIN with 4–12 digits." });
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
      setPrintable({
        ...result.printable,
        badge_id: result.badge.id,
        employee_name: result.badge.employee_name,
      });
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
        text: failureMessage(reason, "badge issuance"),
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
      setPrintable((current) => (current?.badge_id === id ? null : current));
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
    if (
      !canManageKiosks ||
      busy ||
      kioskLoading ||
      kioskError ||
      !siteId ||
      enrollment
    )
      return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await api<{
        enrollment_token: string;
        kiosk: KioskEnrollment;
      }>("/api/clinic/workforce/kiosks", {
        method: "POST",
        body: { site_id: siteId },
      });
      setEnrollment({ token: result.enrollment_token, kiosk: result.kiosk });
      setFeedback({
        type: "success",
        text: "Kiosk enrollment created. Enter the one-time code on the kiosk within 24 hours.",
      });
      setRevision((value) => value + 1);
    } catch (reason) {
      setFeedback({
        type: "error",
        text: failureMessage(reason, "kiosk enrollment"),
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
      setEnrollment((current) => (current?.kiosk.id === id ? null : current));
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
          if (leaveMessage && !window.confirm(leaveMessage)) return;
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
      <Button
        disabled={busy || !siteId}
        onClick={refreshRecords}
        sx={{ alignSelf: "start" }}
      >
        Refresh badges and kiosks
      </Button>

      {canManageBadges && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={2}>
            <Typography variant="h2">Employee badges</Typography>
            {badgeError && <Alert severity="error">{badgeError}</Alert>}
            {settingsError && <Alert severity="warning">{settingsError}</Alert>}
            {badgeLoading && (
              <Typography role="status">Loading employee badges…</Typography>
            )}
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
                    disabled={busy || badgeLoading}
                    onClick={() => void revokeBadge(badge.id)}
                  >
                    Revoke lost badge
                  </Button>
                )}
              </Stack>
            ))}
            {!badgeLoading && !badgeError && !badges.length && (
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
                disabled={busy || badgeLoading || !!badgeError}
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
                label={pinRequired ? "Badge PIN" : "Optional PIN"}
                required={pinRequired === true}
                disabled={
                  busy || badgeLoading || !!badgeError || !!settingsError
                }
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                helperText={
                  pinRequired
                    ? "Required at this location. Use 4–12 digits."
                    : "Use 4–12 digits if a PIN is needed."
                }
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
                  busy ||
                  badgeLoading ||
                  !!badgeError ||
                  !!settingsError ||
                  !eligible.some(
                    (employee) => String(employee.id) === employmentId,
                  ) ||
                  (pinRequired === true && !pin) ||
                  (!!pin && !/^\d{4,12}$/.test(pin))
                }
                onClick={() => void issueBadge()}
                sx={{ whiteSpace: "nowrap" }}
              >
                Issue or replace badge
              </Button>
            </Stack>
            {!badgeLoading && !badgeError && !eligible.length && (
              <Typography color="text.secondary">
                No employees are currently eligible to work at this location.
                Review employee status and assignment dates before issuing a
                badge.
              </Typography>
            )}
          </Stack>
        </Paper>
      )}

      {canManageKiosks && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={2}>
            <Typography variant="h2">Clock kiosk enrollment</Typography>
            {kioskError && <Alert severity="error">{kioskError}</Alert>}
            {kioskLoading && (
              <Typography role="status">Loading kiosk enrollments…</Typography>
            )}
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
                    disabled={busy || kioskLoading}
                    onClick={() => void revokeKiosk(kiosk.id)}
                  >
                    Revoke kiosk
                  </Button>
                )}
              </Stack>
            ))}
            <Button
              variant="outlined"
              disabled={
                busy || kioskLoading || !!kioskError || !siteId || !!enrollment
              }
              onClick={() => void createEnrollment()}
              sx={{ alignSelf: "start" }}
            >
              Create enrollment code
            </Button>
            {enrollment && (
              <Alert severity="warning">
                <Typography sx={{ fontWeight: 700 }}>
                  Enter this code on the kiosk now
                </Typography>
                <Typography variant="body2">
                  {enrollment.kiosk.site_name} · expires{" "}
                  {formatDisplayDateTime(enrollment.kiosk.expires_at, {
                    timeZone: clinic.practice.timezone,
                  })}
                </Typography>
                <TextField
                  fullWidth
                  label="One-time enrollment code"
                  value={enrollment.token}
                  slotProps={{ htmlInput: { readOnly: true } }}
                  sx={{ mt: 1 }}
                />
                <Button
                  disabled={busy}
                  onClick={() => setEnrollment(null)}
                  sx={{ mt: 1 }}
                >
                  Done with code
                </Button>
              </Alert>
            )}
          </Stack>
        </Paper>
      )}

      <Dialog
        open={canManageBadges && !!printable}
        onClose={() => {
          if (
            window.confirm(
              "Close the one-time badge? If it has not been printed, you will need to issue a replacement.",
            )
          )
            setPrintable(null);
        }}
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
              <Typography sx={{ fontWeight: 700, mb: 1 }}>
                {printable.employee_name}
              </Typography>
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
          <Button onClick={() => setPrintable(null)}>Done with badge</Button>
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
