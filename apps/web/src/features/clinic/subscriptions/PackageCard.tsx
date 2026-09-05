import {
  Box,
  Checkbox,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type { PackageTerms } from "./contracts";
import { subscriptionMoney, stateLabel } from "./contracts";

export function PackageCard({
  terms,
  selections,
  onSelect,
}: {
  terms: PackageTerms;
  selections?: number[];
  onSelect?: (ids: number[]) => void;
}) {
  const groups = [
    ...new Set(
      terms.components
        .filter((c) => c.mode.startsWith("choose_"))
        .map((c) => c.group),
    ),
  ];
  const toggle = (id: number, checked: boolean) => {
    const component = terms.components.find((c) => c.service_id === id)!;
    let ids = selections || [];
    if (component.mode === "choose_one" && checked)
      ids = ids.filter(
        (value) =>
          !terms.components.some(
            (c) => c.service_id === value && c.group === component.group,
          ),
      );
    onSelect?.(
      checked
        ? [...ids.filter((value) => value !== id), id]
        : ids.filter((value) => value !== id),
    );
  };
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2.5, minWidth: 0, overflowWrap: "anywhere" }}
    >
      <Stack spacing={1.5}>
        <Typography variant="overline">
          {terms.family_name}
          {terms.tier ? ` · ${terms.tier}` : ""}
        </Typography>
        <Typography variant="h6" component="h3">
          {terms.package_name}
        </Typography>
        <Typography>{terms.description}</Typography>
        <Typography variant="h5">
          {subscriptionMoney(terms.total || terms.amount, terms.currency)}
        </Typography>
        <Typography variant="body2">
          {terms.duration} {terms.duration_unit} ·{" "}
          {terms.renewal === "manual"
            ? "Manual renewal; no automatic charge"
            : "No renewal"}
        </Typography>
        {groups.map((group) => {
          const component = terms.components.find((c) => c.group === group)!;
          return (
            <Typography key={group} variant="body2">
              {group}: choose{" "}
              {component.min === component.max
                ? component.min
                : `${component.min}–${component.max}`}
            </Typography>
          );
        })}
        <Box>
          {(terms.selected_components || terms.components).map((c) => (
            <Box key={c.service_id} sx={{ py: 0.5 }}>
              {onSelect && c.mode !== "included" ? (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={selections?.includes(c.service_id) || false}
                      onChange={(_, checked) => toggle(c.service_id, checked)}
                    />
                  }
                  label={`${c.name} · ${stateLabel(c.mode)}${c.group ? ` · ${c.group}` : ""}`}
                />
              ) : (
                <Typography>
                  {c.name} · {stateLabel(c.mode)}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                {c.quantity} per {c.frequency}
                {c.price_adjustment !== "0.0"
                  ? ` · +${subscriptionMoney(c.price_adjustment, terms.currency)}`
                  : ""}
                {c.eligibility_review ? " · review required" : ""}
              </Typography>
              {c.description && (
                <Typography variant="body2">{c.description}</Typography>
              )}
            </Box>
          ))}
        </Box>
        {terms.eligibility_review && (
          <Chip
            size="small"
            label="Clinic review required before payment"
            sx={{ alignSelf: "flex-start", maxWidth: "100%" }}
          />
        )}
        <Typography variant="body2">
          Cancellation: {stateLabel(terms.cancellation)}. Refunds:{" "}
          {stateLabel(terms.refund_policy)}.
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
          {terms.terms}
        </Typography>
      </Stack>
    </Paper>
  );
}
