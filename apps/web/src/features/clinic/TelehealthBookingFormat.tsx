import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
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
  siteId,
  visitTypeId,
}: {
  value: VisitModality;
  onChange: (value: VisitModality) => void;
  disabled?: boolean;
  canConfigure?: boolean;
  siteId?: string | number;
  visitTypeId?: string | number;
}) {
  const options = useResource<BookingOptions>(
    `/api/clinic/telehealth/booking_options?site_id=${siteId ?? ""}`,
  );
  const visitRules = options.data?.data.visit_type_rules.filter(
    (rule) => String(rule.visit_type_id) === String(visitTypeId),
  );
  const selectedRule =
    visitRules?.find((rule) => rule.site_id === Number(siteId)) ??
    visitRules?.find((rule) => rule.site_id === null);
  const videoAvailable =
    options.data?.data.enabled === true &&
    options.data.data.allowed_modalities.includes("video") &&
    (!visitTypeId || selectedRule?.enabled === true);
  useEffect(() => {
    if (!disabled && options.data && !videoAvailable && value === "video")
      onChange("in_person");
  }, [disabled, onChange, options.data, value, videoAvailable]);
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
        <Accordion
          disableGutters
          elevation={0}
          sx={{ border: 1, borderColor: "divider" }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls="video-availability-details"
            id="video-availability-heading"
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Video unavailable · In-person booking is available
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary">
                Video visits are unavailable for this clinic. An authorized
                administrator must connect a video provider, publish the clinic
                policy, confirm provider health, and enable an eligible visit
                type.
              </Typography>
              {canConfigure && (
                <Button
                  color="primary"
                  href="/clinic/settings/telehealth"
                  size="small"
                  sx={{ alignSelf: "flex-start" }}
                >
                  Open setup
                </Button>
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>
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
