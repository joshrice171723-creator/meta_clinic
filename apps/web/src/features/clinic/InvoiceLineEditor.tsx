import AddIcon from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../../api/client";

export type BillingService = {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  unit_amount: string;
  currency: string;
  active: boolean;
  lock_version: number;
  created_at: string;
  updated_at: string;
};

export type InvoiceLineDraft =
  | {
      kind: "catalog";
      billing_service_id: number;
      service_lock_version: number;
      service_snapshot: BillingService;
      quantity: string;
    }
  | {
      kind: "custom";
      quantity: string;
      unit_amount: string;
      description_snapshot: string;
    }
  | {
      kind: "recorded";
      invoice_line_id: number;
      quantity: string;
      unit_amount: string;
      description_snapshot: string;
      currency: string;
      catalog_name?: string | null;
      catalog_description?: string | null;
    };

export const customInvoiceLine = (): InvoiceLineDraft => ({
  kind: "custom",
  quantity: "1",
  unit_amount: "",
  description_snapshot: "",
});

export function invoiceLineIsValid(line: InvoiceLineDraft) {
  const decimal = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;
  if (!decimal.test(line.quantity) || Number(line.quantity) <= 0) return false;
  if (line.kind === "catalog")
    return (
      Number.isSafeInteger(line.billing_service_id) &&
      Number.isSafeInteger(line.service_lock_version)
    );
  if (line.kind === "recorded")
    return Number.isSafeInteger(line.invoice_line_id);
  return (
    decimal.test(line.unit_amount) &&
    Number(line.unit_amount) >= 0 &&
    Boolean(line.description_snapshot.trim())
  );
}

function serviceLabel(service: BillingService) {
  return [service.name, service.code ? `(${service.code})` : null]
    .filter(Boolean)
    .join(" ");
}

export function InvoiceLineEditor({
  currency,
  lines,
  onChange,
}: {
  currency: string;
  lines: InvoiceLineDraft[];
  onChange: (lines: InvoiceLineDraft[]) => void;
}) {
  const [services, setServices] = useState<BillingService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{ services: BillingService[] }>(
      `/api/clinic/billing_services?active=true&page=1&per_page=25${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setServices(result.services);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load clinic services.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  const replace = (index: number, line: InvoiceLineDraft) =>
    onChange(
      lines.map((current, currentIndex) =>
        currentIndex === index ? line : current,
      ),
    );
  const remove = (index: number) =>
    onChange(
      lines.length === 1
        ? [customInvoiceLine()]
        : lines.filter((_, currentIndex) => currentIndex !== index),
    );

  return (
    <Stack spacing={1.5}>
      <Stack
        direction="row"
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <Typography variant="subtitle2">Invoice lines</Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => onChange([...lines, customInvoiceLine()])}
        >
          Add line
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {lines.map((line, index) => {
        if (line.kind === "recorded") {
          const description =
            line.catalog_description ||
            line.catalog_name ||
            line.description_snapshot;
          return (
            <Box
              key={`recorded-${line.invoice_line_id}`}
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                p: 1.5,
              }}
            >
              <Stack spacing={1.25}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{ justifyContent: "space-between" }}
                >
                  <Box>
                    <Typography sx={{ fontWeight: 600 }}>
                      {description}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Recorded charge · {line.currency} {line.unit_amount} each
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    onClick={() =>
                      replace(index, {
                        kind: "custom",
                        quantity: line.quantity,
                        unit_amount: line.unit_amount,
                        description_snapshot: line.description_snapshot,
                      })
                    }
                  >
                    Replace charge
                  </Button>
                </Stack>
                <TextField
                  label="Quantity"
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) =>
                    replace(index, { ...line, quantity: event.target.value })
                  }
                  sx={{ maxWidth: 180 }}
                />
              </Stack>
            </Box>
          );
        }
        const selected = line.kind === "catalog" ? line.service_snapshot : null;
        const options = selected
          ? [
              selected,
              ...services.filter((service) => service.id !== selected.id),
            ]
          : services;
        return (
          <Box
            key={`${line.kind}-${index}`}
            sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}
          >
            <Stack spacing={1.25}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Autocomplete
                  fullWidth
                  loading={loading}
                  options={options}
                  value={selected}
                  getOptionLabel={serviceLabel}
                  filterOptions={(options) => options}
                  isOptionEqualToValue={(option, value) =>
                    option.id === value.id
                  }
                  getOptionDisabled={(service) => service.currency !== currency}
                  onInputChange={(_, value, reason) => {
                    if (reason === "input") setQuery(value);
                  }}
                  onChange={(_, service) => {
                    if (!service) return replace(index, customInvoiceLine());
                    replace(index, {
                      kind: "catalog",
                      billing_service_id: service.id,
                      service_lock_version: service.lock_version,
                      service_snapshot: service,
                      quantity: line.quantity,
                    });
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Service"
                      helperText="Choose a clinic service or clear this field for a custom charge."
                    />
                  )}
                />
                <IconButton
                  aria-label={`Remove invoice line ${index + 1}`}
                  onClick={() => remove(index)}
                >
                  <DeleteOutlinedIcon />
                </IconButton>
              </Stack>
              {line.kind === "catalog" && selected ? (
                <Alert severity="info" icon={false}>
                  {selected.description || selected.name} · {selected.currency}{" "}
                  {selected.unit_amount} each · Catalog version{" "}
                  {selected.lock_version}. Service details are set by the clinic
                  catalog.
                </Alert>
              ) : (
                <TextField
                  label="Line description"
                  value={
                    line.kind === "custom" ? line.description_snapshot : ""
                  }
                  onChange={(event) =>
                    replace(index, {
                      kind: "custom",
                      quantity: line.quantity,
                      unit_amount:
                        line.kind === "custom" ? line.unit_amount : "",
                      description_snapshot: event.target.value,
                    })
                  }
                  fullWidth
                />
              )}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                <TextField
                  label="Quantity"
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) =>
                    replace(index, { ...line, quantity: event.target.value })
                  }
                  sx={{ minWidth: { sm: 180 } }}
                />
                {line.kind === "custom" && (
                  <TextField
                    label="Unit amount"
                    inputMode="decimal"
                    value={line.unit_amount}
                    onChange={(event) =>
                      replace(index, {
                        ...line,
                        unit_amount: event.target.value,
                      })
                    }
                    sx={{ minWidth: { sm: 180 } }}
                  />
                )}
              </Stack>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
