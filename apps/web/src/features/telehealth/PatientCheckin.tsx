import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { PatientCheckinInput } from "./api";
import type { TelehealthDeviceResults, TelehealthPreparation } from "./types";

const uncheckedDevices: TelehealthDeviceResults = {
  camera: "not_checked",
  microphone: "not_checked",
  speaker: "not_checked",
  browser: "unknown",
  audio_only_requested: false,
  checked_at: new Date(0).toISOString(),
};

export function PatientCheckin({
  preparation,
  busy,
  error,
  onSave,
  onWrongAppointment,
}: {
  preparation: TelehealthPreparation;
  busy: boolean;
  error?: string | null;
  onSave: (checkin: PatientCheckinInput) => Promise<void>;
  onWrongAppointment: () => void;
}) {
  const initial = preparation.location;
  const [address, setAddress] = useState(initial?.address_line1 || "");
  const [unit, setUnit] = useState(initial?.unit || "");
  const [city, setCity] = useState(initial?.city || "");
  const [region, setRegion] = useState(initial?.region_code || "");
  const [postalCode, setPostalCode] = useState(initial?.postal_code || "");
  const [country, setCountry] = useState(initial?.country_code || "US");
  const [phone, setPhone] = useState(preparation.callback_phone || "");
  const [attested, setAttested] = useState(false);
  const dirty = Boolean(
    address !== (initial?.address_line1 || "") ||
    unit !== (initial?.unit || "") ||
    city !== (initial?.city || "") ||
    region !== (initial?.region_code || "") ||
    postalCode !== (initial?.postal_code || "") ||
    country !== (initial?.country_code || "US") ||
    phone !== (preparation.callback_phone || "") ||
    attested,
  );

  useEffect(() => {
    setAddress(initial?.address_line1 || "");
    setUnit(initial?.unit || "");
    setCity(initial?.city || "");
    setRegion(initial?.region_code || "");
    setPostalCode(initial?.postal_code || "");
    setCountry(initial?.country_code || "US");
    setPhone(preparation.callback_phone || "");
    setAttested(false);
  }, [initial, preparation.callback_phone]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          location: {
            address_line1: address.trim(),
            unit: unit.trim() || null,
            city: city.trim(),
            region_code: region.trim(),
            postal_code: postalCode.trim() || null,
            country_code: country.trim(),
          },
          callback_phone: phone.trim(),
          location_attested: attested,
          device_results: preparation.device_results || {
            ...uncheckedDevices,
            checked_at: new Date().toISOString(),
          },
        });
      }}
    >
      <Stack spacing={2}>
        <div>
          <Typography variant="h5">Confirm where you are</Typography>
          <Typography color="text.secondary">
            Share your current physical location and a callback number for this
            visit. This does not change your permanent contact information.
          </Typography>
        </div>
        <TextField
          label="Current street address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          required
          autoComplete="street-address"
        />
        <TextField
          label="Unit, building, or access instructions (optional)"
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="City"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="State or region"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            required
            fullWidth
          />
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="Postal code"
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value)}
            fullWidth
          />
          <TextField
            label="Country code"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            required
            fullWidth
            slotProps={{ htmlInput: { maxLength: 2 } }}
          />
        </Stack>
        <TextField
          label="Callback phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
          type="tel"
          autoComplete="tel"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={attested}
              onChange={(event) => setAttested(event.target.checked)}
            />
          }
          label="I confirm this is my current physical location for today's visit."
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Stack
          direction={{ xs: "column-reverse", sm: "row" }}
          spacing={1}
          sx={{ justifyContent: "space-between" }}
        >
          <Button
            color="inherit"
            onClick={() => {
              if (
                !dirty ||
                window.confirm("Leave without saving these visit details?")
              )
                onWrongAppointment();
            }}
          >
            This isn't my appointment
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy || !attested}
          >
            {busy ? "Saving…" : "Save and continue"}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
