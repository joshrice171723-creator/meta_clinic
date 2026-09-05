import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../../api/client";
import { LoadState, useResource } from "../../../shared/ui";
import { PackageCard } from "./PackageCard";
import type {
  AdminCatalog,
  CatalogItem,
  DraftPackage,
  PackageTerms,
  PublishedPackage,
  ServiceComponent,
} from "./contracts";

const emptyDraft: Partial<PackageTerms> = {
  amount: "",
  currency: "USD",
  duration: 1,
  duration_unit: "months",
  renewal: "none",
  cancellation: "immediate",
  refund_policy: "manual_review",
  terms: "",
  max_per_patient: 1,
  components: [],
  eligibility_review: false,
};
export function SubscriptionCatalog() {
  const resource = useResource<AdminCatalog>(
    "/api/clinic/subscription_catalog",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{
    kind: string;
    id?: number;
    name: string;
    description?: string;
    family_id?: number;
    draft?: Partial<PackageTerms>;
    lock_version?: number;
  } | null>(null);
  const [preview, setPreview] = useState<PublishedPackage | null>(null);
  const [previewSelections, setPreviewSelections] = useState<number[]>([]);
  const [retire, setRetire] = useState<{
    kind: string;
    id: number;
    name: string;
  } | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      resource.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };
  const data = resource.data;
  const draft = edit?.draft || emptyDraft;
  const setDraft = (field: string, value: unknown) =>
    setEdit(edit ? { ...edit, draft: { ...draft, [field]: value } } : null);
  const componentChange = (index: number, field: string, value: unknown) =>
    setDraft(
      "components",
      (draft.components || []).map((c, i) =>
        i === index ? { ...c, [field]: value } : c,
      ),
    );
  const editItem = (kind: string, item?: CatalogItem | DraftPackage) =>
    setEdit(
      item
        ? { kind, ...item }
        : {
            kind,
            name: "",
            description: "",
            family_id: data?.families.find((f) => !f.retired)?.id,
            draft: { ...emptyDraft },
          },
    );
  return (
    <Stack spacing={3} sx={{ p: { xs: 2, md: 3 }, minWidth: 0 }}>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            Subscription catalog
          </Typography>
          <Typography color="text.secondary">
            Define your services, package choices, and published purchase terms.
          </Typography>
        </Box>
        <Button href="/clinic/billing">Billing workspace</Button>
      </Stack>
      {(!data || resource.error) && <LoadState error={resource.error} />}
      {error && <Alert severity="error">{error}</Alert>}
      {data && (
        <>
          {(
            [
              ["family", "Product families", data.families],
              ["service", "Reusable services", data.services],
            ] as const
          ).map(([kind, label, items]) => (
            <Paper key={kind} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                  <Typography variant="h6" component="h2">
                    {label}
                  </Typography>
                  {data.capabilities.write && (
                    <Button onClick={() => editItem(kind)}>
                      Add {kind === "family" ? "family" : "service"}
                    </Button>
                  )}
                </Stack>
                {!items.length && (
                  <Typography color="text.secondary">
                    No {label.toLowerCase()} yet.
                  </Typography>
                )}
                {items.map((item) => (
                  <Stack
                    key={item.id}
                    direction="row"
                    sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }}
                  >
                    <Typography sx={{ flex: 1 }}>
                      {item.name}
                      {item.retired ? " · Retired" : ""}
                    </Typography>
                    {data.capabilities.write && (
                      <Button onClick={() => editItem(kind, item)}>
                        Edit {item.name}
                      </Button>
                    )}
                    {data.capabilities.publish && !item.retired && (
                      <Button
                        onClick={() =>
                          setRetire({ kind, id: item.id, name: item.name })
                        }
                      >
                        Retire
                      </Button>
                    )}
                  </Stack>
                ))}
              </Stack>
            </Paper>
          ))}
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <Typography variant="h6" component="h2">
              Packages and plans
            </Typography>
            {data.capabilities.write && (
              <Button
                variant="contained"
                disabled={!data.families.some((f) => !f.retired)}
                onClick={() => editItem("package")}
              >
                Create package
              </Button>
            )}
          </Stack>
          {!data.packages.length && (
            <Typography color="text.secondary">
              Create a family and services, then compose a package.
            </Typography>
          )}
          {data.packages.map((p) => (
            <Paper variant="outlined" key={p.id} sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Typography variant="h6" component="h3">
                  {p.name}
                </Typography>
                <Typography>
                  {p.retired
                    ? "Retired"
                    : p.published_version_id
                      ? "Published; draft edits require a new version"
                      : "Draft"}
                </Typography>
                <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                  {data.capabilities.write && (
                    <Button onClick={() => editItem("package", p)}>
                      Edit package
                    </Button>
                  )}
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setPreviewSelections([]);
                        setPreview(
                          await api<PublishedPackage>(
                            `/api/clinic/subscription_catalog/packages/${p.id}/preview`,
                          ),
                        );
                      })
                    }
                  >
                    Patient preview
                  </Button>
                  {data.capabilities.publish && !p.retired && (
                    <>
                      <Button
                        variant="outlined"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api(
                              `/api/clinic/subscription_catalog/packages/${p.id}/publish`,
                              {
                                method: "POST",
                                body: {
                                  request_key: crypto.randomUUID(),
                                  lock_version: p.lock_version,
                                },
                              },
                            );
                          })
                        }
                      >
                        Publish version
                      </Button>
                      <Button
                        onClick={() =>
                          setRetire({ kind: "package", id: p.id, name: p.name })
                        }
                      >
                        Retire
                      </Button>
                    </>
                  )}
                </Stack>
              </Stack>
            </Paper>
          ))}
        </>
      )}
      <Dialog
        open={!!edit}
        onClose={() => !busy && setEdit(null)}
        maxWidth="md"
        fullWidth
        aria-labelledby="catalog-editor-title"
      >
        <DialogTitle id="catalog-editor-title">
          {edit?.id ? "Edit" : "Create"} {edit?.kind}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              required
              label="Name"
              value={edit?.name || ""}
              onChange={(e) =>
                edit && setEdit({ ...edit, name: e.target.value })
              }
            />
            {edit?.kind !== "package" ? (
              <TextField
                label="Description"
                multiline
                minRows={2}
                value={edit?.description || ""}
                onChange={(e) =>
                  edit && setEdit({ ...edit, description: e.target.value })
                }
              />
            ) : (
              <>
                <TextField
                  select
                  label="Product family"
                  value={edit.family_id || ""}
                  onChange={(e) =>
                    setEdit({ ...edit, family_id: Number(e.target.value) })
                  }
                >
                  {data?.families
                    .filter((f) => !f.retired)
                    .map((f) => (
                      <MenuItem key={f.id} value={f.id}>
                        {f.name}
                      </MenuItem>
                    ))}
                </TextField>
                <TextField
                  label="Tier label (optional)"
                  value={draft.tier || ""}
                  onChange={(e) => setDraft("tier", e.target.value)}
                />
                <TextField
                  label="Description"
                  multiline
                  value={draft.description || ""}
                  onChange={(e) => setDraft("description", e.target.value)}
                />
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    gap: 2,
                  }}
                >
                  <TextField
                    label="Base price"
                    required
                    value={draft.amount || ""}
                    onChange={(e) => setDraft("amount", e.target.value)}
                  />
                  <TextField
                    label="Currency"
                    value={draft.currency || "USD"}
                    onChange={(e) =>
                      setDraft("currency", e.target.value.toUpperCase())
                    }
                  />
                  <TextField
                    label="Duration"
                    type="number"
                    value={draft.duration || 1}
                    onChange={(e) =>
                      setDraft("duration", Number(e.target.value))
                    }
                  />
                  <TextField
                    select
                    label="Duration unit"
                    value={draft.duration_unit || "months"}
                    onChange={(e) => setDraft("duration_unit", e.target.value)}
                  >
                    {["days", "months"].map((v) => (
                      <MenuItem value={v} key={v}>
                        {v}
                      </MenuItem>
                    ))}
                  </TextField>
                  {(["renewal", "cancellation", "refund_policy"] as const).map(
                    (field) => (
                      <TextField
                        key={field}
                        select
                        label={field.replaceAll("_", " ")}
                        value={draft[field] || emptyDraft[field]}
                        onChange={(e) => setDraft(field, e.target.value)}
                      >
                        {{
                          renewal: ["none", "manual"],
                          cancellation: ["immediate", "end_of_term"],
                          refund_policy: ["none", "manual_review"],
                        }[field].map((v) => (
                          <MenuItem value={v} key={v}>
                            {v.replaceAll("_", " ")}
                          </MenuItem>
                        ))}
                      </TextField>
                    ),
                  )}
                  <TextField
                    label="Concurrent purchases per patient"
                    type="number"
                    value={draft.max_per_patient || 1}
                    onChange={(e) =>
                      setDraft("max_per_patient", Number(e.target.value))
                    }
                  />
                  <TextField
                    label="Available from (ISO timestamp, optional)"
                    value={draft.available_from || ""}
                    onChange={(e) => setDraft("available_from", e.target.value)}
                  />
                  <TextField
                    label="Available until (ISO timestamp, optional)"
                    value={draft.available_until || ""}
                    onChange={(e) =>
                      setDraft("available_until", e.target.value)
                    }
                  />
                </Box>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={draft.eligibility_review || false}
                      onChange={(_, value) =>
                        setDraft("eligibility_review", value)
                      }
                    />
                  }
                  label="Require clinic eligibility review before payment"
                />
                <TextField
                  required
                  label="Patient purchase terms"
                  multiline
                  minRows={3}
                  value={draft.terms || ""}
                  onChange={(e) => setDraft("terms", e.target.value)}
                />
                <Typography variant="h6" component="h3">
                  Service composition
                </Typography>
                {(draft.components || []).map((c, index) => (
                  <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={2}>
                      <TextField
                        select
                        label={`Service ${index + 1}`}
                        value={c.service_id || ""}
                        onChange={(e) =>
                          componentChange(
                            index,
                            "service_id",
                            Number(e.target.value),
                          )
                        }
                      >
                        {data?.services
                          .filter((s) => !s.retired)
                          .map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                              {s.name}
                            </MenuItem>
                          ))}
                      </TextField>
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                          gap: 2,
                        }}
                      >
                        <TextField
                          select
                          label="Inclusion"
                          value={c.mode}
                          onChange={(e) =>
                            componentChange(index, "mode", e.target.value)
                          }
                        >
                          {[
                            "included",
                            "optional",
                            "choose_one",
                            "choose_many",
                          ].map((v) => (
                            <MenuItem key={v} value={v}>
                              {v.replaceAll("_", " ")}
                            </MenuItem>
                          ))}
                        </TextField>
                        {c.mode.startsWith("choose_") && (
                          <TextField
                            label="Choice group name"
                            value={c.group || ""}
                            onChange={(e) =>
                              componentChange(index, "group", e.target.value)
                            }
                          />
                        )}
                        {c.mode === "choose_many" &&
                          (["min", "max"] as const).map((field) => (
                            <TextField
                              key={field}
                              label={`${field} choices`}
                              type="number"
                              value={c[field]}
                              onChange={(e) =>
                                componentChange(
                                  index,
                                  field,
                                  Number(e.target.value),
                                )
                              }
                            />
                          ))}
                        <TextField
                          label="Quantity / usage limit"
                          type="number"
                          value={c.quantity || 1}
                          onChange={(e) =>
                            componentChange(
                              index,
                              "quantity",
                              Number(e.target.value),
                            )
                          }
                        />
                        <TextField
                          select
                          label="Frequency"
                          value={c.frequency || "term"}
                          onChange={(e) =>
                            componentChange(index, "frequency", e.target.value)
                          }
                        >
                          {["term", "day", "week", "month"].map((v) => (
                            <MenuItem key={v} value={v}>
                              {v}
                            </MenuItem>
                          ))}
                        </TextField>
                        {c.mode !== "included" && (
                          <TextField
                            label="Additional price when selected"
                            value={c.price_adjustment || "0"}
                            onChange={(e) =>
                              componentChange(
                                index,
                                "price_adjustment",
                                e.target.value,
                              )
                            }
                          />
                        )}
                      </Box>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={c.eligibility_review || false}
                            onChange={(_, value) =>
                              componentChange(
                                index,
                                "eligibility_review",
                                value,
                              )
                            }
                          />
                        }
                        label="This service requires review"
                      />
                      <Button
                        onClick={() =>
                          setDraft(
                            "components",
                            (draft.components || []).filter(
                              (_, i) => i !== index,
                            ),
                          )
                        }
                      >
                        Remove service
                      </Button>
                    </Stack>
                  </Paper>
                ))}
                <Button
                  disabled={!data?.services.some((s) => !s.retired)}
                  onClick={() =>
                    setDraft("components", [
                      ...(draft.components || []),
                      {
                        service_id: data?.services.find((s) => !s.retired)?.id,
                        mode: "included",
                        group: "",
                        min: 0,
                        max: 100,
                        quantity: 1,
                        frequency: "term",
                        price_adjustment: "0",
                        eligibility_review: false,
                      } as ServiceComponent,
                    ])
                  }
                >
                  Add service to package
                </Button>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setEdit(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy || !edit?.name.trim()}
            onClick={() =>
              edit &&
              void run(async () => {
                await api(
                  `/api/clinic/subscription_catalog/${edit.kind}${edit.id ? `/${edit.id}` : ""}`,
                  { method: edit.id ? "PATCH" : "POST", body: { item: edit } },
                );
                setEdit(null);
              })
            }
          >
            Save draft
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="catalog-preview-title"
      >
        <DialogTitle id="catalog-preview-title">Patient preview</DialogTitle>
        <DialogContent>
          {preview && (
            <PackageCard
              terms={preview.terms}
              selections={previewSelections}
              onSelect={(ids) => {
                setPreviewSelections(ids);
                setPreview({
                  ...preview,
                  terms: {
                    ...preview.terms,
                    total: undefined,
                    selected_components: undefined,
                  },
                });
              }}
            />
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>Close</Button>
          <Button
            disabled={busy}
            onClick={() =>
              preview &&
              void run(async () => {
                const query = new URLSearchParams({ quote: "1" });
                previewSelections.forEach((id) =>
                  query.append("selections[]", String(id)),
                );
                setPreview(
                  await api<PublishedPackage>(
                    `/api/clinic/subscription_catalog/packages/${preview.terms.package_id}/preview?${query}`,
                  ),
                );
              })
            }
          >
            Validate selections and price
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!retire}
        onClose={() => !busy && setRetire(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="catalog-retire-title"
      >
        <DialogTitle id="catalog-retire-title">
          Retire {retire?.name}
        </DialogTitle>
        <DialogContent>
          <Typography>
            Retirement prevents new use. Published terms and existing purchases
            remain in history.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRetire(null)}>Cancel</Button>
          <Button
            disabled={busy}
            onClick={() =>
              retire &&
              void run(async () => {
                await api(
                  `/api/clinic/subscription_catalog/${retire.kind}/${retire.id}/retire`,
                  { method: "POST", body: {} },
                );
                setRetire(null);
              })
            }
          >
            Retire
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
