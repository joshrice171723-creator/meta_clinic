import {
  Alert,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
} from "@mui/material";
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
}: {
  value: VisitModality;
  onChange: (value: VisitModality) => void;
  disabled?: boolean;
}) {
  const options = useResource<BookingOptions>(
    "/api/clinic/telehealth/booking_options",
  );
  const videoAvailable =
    options.data?.data.enabled === true &&
    options.data.data.allowed_modalities.includes("video");
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
      {value === "video" && (
        <Alert severity={videoAvailable ? "info" : "warning"}>
          {videoAvailable
            ? "Choose an eligible visit type and clinician. The patient will prepare and join through their patient portal. A physical room is not required."
            : "Video booking is not currently available. Check clinic telehealth configuration or choose an in-person visit."}
        </Alert>
      )}
    </Stack>
  );
}
