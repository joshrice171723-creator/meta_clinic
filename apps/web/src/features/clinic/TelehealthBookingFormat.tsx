import {
  Alert,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
} from "@mui/material";
import { useEffect } from "react";
import { useResource } from "../../shared/ui";

export type VisitModality = "in_person" | "video";

export type BookingOptions = {
  data: {
    enabled: boolean;
    allowed_modalities: VisitModality[];
    visit_type_rules: {
      visit_type_id: number;
      site_id: number | null;
      enabled: boolean;
    }[];
  };
};

export function TelehealthBookingFormat({
  value,
  onChange,
  disabled = false,
  canConfigure = false,
}: {
  value: VisitModality;
  onChange: (value: VisitModality) => void;
  disabled?: boolean;
  canConfigure?: boolean;
}) {
  const options = useResource<BookingOptions>(
    "/api/clinic/telehealth/booking_options",
  );
  const videoAvailable =
    options.data?.data.enabled === true &&
    options.data.data.allowed_modalities.includes("video");
  useEffect(() => {
    if (options.data && !videoAvailable && value === "video")
      onChange("in_person");
  }, [onChange, options.data, value, videoAvailable]);
  return (
    <Stack spacing={1}>
      <FormControl fullWidth disabled={disabled}>
        <InputLabel id="appointment-modality-label">Visit format</InputLabel>
        <Select
          labelId="appointment-modality-label"
          label="Visit format"
          value={value}
          onChange={(event) => onChange(event.target.value as VisitModality)}
        >
          <MenuItem value="in_person">In person</MenuItem>
          <MenuItem value="video" disabled={!videoAvailable}>
            Video
          </MenuItem>
        </Select>
      </FormControl>
      {options.error && (
        <Alert severity="warning">
          Video availability could not be loaded. In-person booking remains
          available.
        </Alert>
      )}
      {options.data && !videoAvailable && (
        <Alert
          severity="warning"
          action={
            canConfigure ? (
              <Button color="inherit" href="/clinic/settings/telehealth" size="small">
                Open setup
              </Button>
            ) : undefined
          }
        >
          Video visits are unavailable for this clinic. An authorized administrator must connect a video provider, publish the clinic policy, confirm provider health, and enable an eligible visit type. In-person scheduling is still available.
        </Alert>
      )}
      {videoAvailable && value === "video" && (
        <Alert severity="info">
          Choose an eligible visit type and clinician. The patient will prepare
          and join through their patient portal. A physical room is not
          required.
        </Alert>
      )}
    </Stack>
  );
}
