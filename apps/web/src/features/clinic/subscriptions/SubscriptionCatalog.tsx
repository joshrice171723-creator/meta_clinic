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
  Tab,
  Tabs,
  Tooltip,
  Typography,
  ThemeProvider,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { api } from "../../../api/client";
import { LoadState, useResource } from "../../../shared/ui";
import { membershipTheme } from "./membershipTheme";
import { MembershipCard } from "./MembershipCard";
import { draftMembershipTerms } from "./draftMembershipTerms";
import {
  catalogDisplayDescription,
  catalogDisplayLabel,
} from "./catalogDisplayLabel";
import {
  subscriptionMoney,
  type AdminCatalog,
  type CatalogItem,
  type DraftPackage,
  type PackageTerms,
  type PublishedPackage,
  type ServiceComponent,
} from "./contracts";
import "./subscriptionCatalog.css";

const emptyDraft: Partial<PackageTerms> = {
  amount: "",
  duration: 1,
  duration_unit: "months",
  renewal: "none",
  cancellation: "immediate",
  refund_policy: "manual_review",
  terms: "",
  max_per_patient: 1,
  components: [],
  eligibility_review: false,
  display_order: 0,
};

function HelpLabel({ label, help }: { label: string; help: string }) {
  return (
    <Stack
      direction="row"
      spacing={0.5}
      component="span"
      sx={{ alignItems: "center", display: "inline-flex" }}
    >
      <span>{label}</span>
      <Tooltip title={help} arrow>
        <InfoOutlinedIcon
          tabIndex={0}
          aria-label={`Help for ${label}`}
          sx={{ fontSize: 16 }}
        />
      </Tooltip>
    </Stack>
  );
}

function draftTerm(draft: Partial<PackageTerms>) {
  if (draft.renewal === "automatic") return "Monthly";
  const duration = draft.duration || 1;
  const rawUnit = draft.duration_unit || "months";
  const unit = duration === 1 ? rawUnit.replace(/s$/, "") : rawUnit;
  return `${duration} ${unit}`;
}

function programHasDraftChanges(item: CatalogItem) {
  if (!item.published_snapshot) return false;
  return (
    item.name !== item.published_snapshot.name ||
    item.description !== item.published_snapshot.description ||
    (item.display_order || 0) !== item.published_snapshot.display_order
  );
}

export function SubscriptionCatalog() {
  const resource = useResource<AdminCatalog>(
    "/api/clinic/subscription_catalog",
    { retainDataOnRefresh: true },
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [catalogSection, setCatalogSection] = useState("family");
  const [editorStep, setEditorStep] = useState(0);
  const [edit, setEdit] = useState<{
    kind: string;
    id?: number;
    name: string;
    description?: string;
    display_order?: number;
    family_id?: number;
    draft?: Partial<PackageTerms>;
    lock_version?: number;
  } | null>(null);
  const [preview, setPreview] = useState<PublishedPackage | null>(null);
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
  const setDraftFields = (fields: Partial<PackageTerms>) =>
    setEdit(edit ? { ...edit, draft: { ...draft, ...fields } } : null);
  const componentChange = (index: number, field: string, value: unknown) =>
    setDraft(
      "components",
      (draft.components || []).map((c, i) =>
        i === index
          ? {
              ...c,
              [field]: value,
              ...(field === "mode" && value === "choose_one"
                ? { min: 1, max: 1 }
                : {}),
              ...(field === "mode" && value === "included"
                ? { price_adjustment: "0" }
                : {}),
            }
          : c,
      ),
    );
  const editItem = (kind: string, item?: CatalogItem | DraftPackage) => {
    setError("");
    setEditorStep(0);
    const normalizedItem =
      item &&
      kind === "package" &&
      "draft" in item &&
      item.draft.renewal === "automatic"
        ? {
            ...item,
            draft: {
              ...item.draft,
              duration: 1,
              duration_unit: "months" as const,
              cancellation: "end_of_term" as const,
              max_per_patient: 1,
            },
          }
        : item;
    setEdit(
      normalizedItem
        ? { kind, ...normalizedItem }
        : {
            kind,
            name: "",
            description: "",
            display_order: 0,
            family_id: data?.families.find((f) => !f.retired)?.id,
            draft: { ...emptyDraft },
          },
    );
  };
  const liveTerms =
    edit?.kind === "package"
      ? draftMembershipTerms(edit, data?.families || [], data?.services || [])
      : null;
  const activeFamilies = data?.families.filter((item) => !item.retired) || [];
  const activeServices = data?.services.filter((item) => !item.retired) || [];
  const publishedPackages =
    data?.packages.filter(
      (item) => !item.retired && item.published_version_id,
    ) || [];
  const clinicTypeLabel = data?.clinic_type
    ? data.clinic_type.replaceAll("_", " ")
    : "not selected";
  return (
    <Stack className="subscription-catalog" spacing={0}>
      <header className="subscription-catalog__header">
        <div>
          <Typography component="h1" className="subscription-catalog__title">
            Membership catalog
          </Typography>
          <Typography className="subscription-catalog__intro">
            Build clinic programs, assemble their services, and control exactly
            which membership terms patients can see.
          </Typography>
        </div>
        <Button
          href="/clinic/billing"
          variant="outlined"
          endIcon={<OpenInNewIcon />}
        >
          Open billing
        </Button>
      </header>
      {(!data || resource.error) && <LoadState error={resource.error} />}
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {data && !edit && (
        <div className="subscription-catalog__workspace">
          <section
            className="subscription-catalog__flow"
            aria-label="Membership publication workflow"
          >
            <div>
              <span>Programs</span>
              <strong>{activeFamilies.length} active</strong>
            </div>
            <ArrowForwardIcon aria-hidden="true" />
            <div>
              <span>Reusable services</span>
              <strong>{activeServices.length} active</strong>
            </div>
            <ArrowForwardIcon aria-hidden="true" />
            <div>
              <span>Membership tiers</span>
              <strong>
                {data.packages.filter((item) => !item.retired).length} total
              </strong>
            </div>
            <ArrowForwardIcon aria-hidden="true" />
            <div className="subscription-catalog__flow-live">
              <span>Published versions</span>
              <strong>{publishedPackages.length} current</strong>
            </div>
          </section>
          <Tabs
            className="subscription-catalog__tabs"
            value={catalogSection}
            onChange={(_, value: string) => setCatalogSection(value)}
            variant="scrollable"
            allowScrollButtonsMobile
            aria-label="Subscription catalog sections"
          >
            <Tab value="family" label="Programs" />
            <Tab value="service" label="Services" />
            <Tab value="package" label="Tiers" />
          </Tabs>
          {(
            [
              ["family", "Membership programs", data.families],
              ["service", "Reusable services", data.services],
            ] as const
          )
            .filter(([kind]) => kind === catalogSection)
            .map(([kind, label, items]) => (
              <section key={kind} className="subscription-catalog__section">
                {kind === "family" && (
                  <Paper
                    className="subscription-catalog__template"
                    variant="outlined"
                  >
                    <div>
                      <Typography component="h3" variant="h6">
                        {data.clinic_type === "weight_loss"
                          ? "Weight management demo plans"
                          : "Clinic specific starter"}
                      </Typography>
                      <Typography>
                        {data.clinic_type === "weight_loss"
                          ? "Creates two editable draft programs with three tiers each, reusable services, and demo pricing. Review anything you want before publishing."
                          : data.clinic_type
                            ? `Selected clinic type: ${clinicTypeLabel}. A matching starter is not available yet.`
                            : "Select a clinic type in Clinic setup to see a matching membership starter."}
                      </Typography>
                    </div>
                    {data.clinic_type === "weight_loss" &&
                      data.capabilities.write && (
                        <Button
                          variant="outlined"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const result = await api<{
                                created_count: number;
                              }>("/api/clinic/subscription_catalog/template", {
                                method: "POST",
                                body: {},
                              });
                              setNotice(
                                result.created_count
                                  ? "Two programs and six editable tiers were added as unpublished demo plans."
                                  : "The demo plans are already in this catalog.",
                              );
                              setCatalogSection("package");
                            })
                          }
                        >
                          Add demo plans
                        </Button>
                      )}
                  </Paper>
                )}
                <div className="subscription-catalog__section-heading">
                  <div>
                    <Typography variant="h5" component="h2">
                      {label}
                    </Typography>
                    <Typography>
                      {kind === "family"
                        ? "Programs organize tiers into the tabs patients browse."
                        : "Define services once, then reuse them across membership tiers."}
                    </Typography>
                  </div>
                  {data.capabilities.write && (
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={() => editItem(kind)}
                    >
                      Add {kind === "family" ? "program" : "service"}
                    </Button>
                  )}
                </div>
                {!items.length && (
                  <div className="subscription-catalog__empty">
                    <Typography component="h3">
                      No {label.toLowerCase()} yet
                    </Typography>
                    <Typography>
                      {kind === "family"
                        ? "Create the first program to give your membership tiers a clear home."
                        : "Add the services patients will receive through a membership."}
                    </Typography>
                  </div>
                )}
                {!!items.length && (
                  <div className="subscription-catalog__list" role="list">
                    {items.map((item) => {
                      const status = item.retired
                        ? "Retired"
                        : kind === "family"
                          ? item.published_snapshot
                            ? programHasDraftChanges(item)
                              ? "Published · draft changes"
                              : "Published"
                            : "Draft"
                          : "Available";
                      return (
                        <div
                          key={item.id}
                          className="subscription-catalog__row"
                          role="listitem"
                        >
                          <div className="subscription-catalog__row-main">
                            <span
                              className="subscription-catalog__status"
                              data-status={
                                status.includes("draft changes")
                                  ? "changed"
                                  : status.toLowerCase()
                              }
                            >
                              {status}
                            </span>
                            <div>
                              <Typography component="h3">
                                {catalogDisplayLabel(item.name) || "Membership"}
                              </Typography>
                              <Typography>
                                {catalogDisplayDescription(item.description) ||
                                  "No description provided."}
                              </Typography>
                            </div>
                          </div>
                          <div className="subscription-catalog__actions">
                            {data.capabilities.write && (
                              <Button
                                startIcon={<EditOutlinedIcon />}
                                onClick={() => editItem(kind, item)}
                                aria-label={`Edit ${catalogDisplayLabel(item.name) || "membership"}`}
                              >
                                Edit
                              </Button>
                            )}
                            {kind === "family" &&
                              data.capabilities.write &&
                              data.capabilities.publish && (
                                <Button
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      await api(
                                        `/api/clinic/subscription_catalog/family/${item.id}`,
                                        {
                                          method: "PATCH",
                                          body: {
                                            item: {
                                              publish: true,
                                              lock_version: item.lock_version,
                                            },
                                          },
                                        },
                                      );
                                    })
                                  }
                                >
                                  {item.retired
                                    ? "Publish again"
                                    : "Publish program"}
                                </Button>
                              )}
                            {data.capabilities.publish && !item.retired && (
                              <Button
                                onClick={() =>
                                  setRetire({
                                    kind,
                                    id: item.id,
                                    name:
                                      catalogDisplayLabel(item.name) ||
                                      "Membership",
                                  })
                                }
                              >
                                Retire
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          {catalogSection === "package" && (
            <section className="subscription-catalog__section">
              <div className="subscription-catalog__section-heading">
                <div>
                  <Typography variant="h5" component="h2">
                    Membership tiers
                  </Typography>
                  <Typography>
                    Draft privately, preview the patient experience, then
                    publish an immutable version.
                  </Typography>
                </div>
                {data.capabilities.write && (
                  <Button
                    className="subscription-catalog__create-tier"
                    variant="contained"
                    startIcon={<AddIcon />}
                    disabled={!data.families.some((f) => !f.retired)}
                    onClick={() => editItem("package")}
                  >
                    Create membership tier
                  </Button>
                )}
              </div>
              {!data.packages.length && (
                <div className="subscription-catalog__empty">
                  <Typography component="h3">
                    Your first tier starts with two building blocks
                  </Typography>
                  <Typography>
                    Create a program and at least one reusable service, then
                    return here to assemble the membership.
                  </Typography>
                </div>
              )}
              {!!data.packages.length && (
                <div className="subscription-catalog__tier-list" role="list">
                  {data.packages
                    .toSorted(
                      (a, b) =>
                        (a.draft.display_order || 0) -
                          (b.draft.display_order || 0) || a.id - b.id,
                    )
                    .map((p) => (
                      <article
                        className="subscription-catalog__tier"
                        key={p.id}
                        role="listitem"
                      >
                        <div className="subscription-catalog__tier-summary">
                          <span
                            className="subscription-catalog__status"
                            data-status={
                              p.retired
                                ? "retired"
                                : p.published_version_id
                                  ? "published"
                                  : "draft"
                            }
                          >
                            {p.retired
                              ? "Retired"
                              : p.published_version_id
                                ? "Published + draft"
                                : "Draft"}
                          </span>
                          <div>
                            <Typography variant="h6" component="h3">
                              {catalogDisplayLabel(p.name) || "Membership"}
                            </Typography>
                            <Typography>
                              {catalogDisplayLabel(
                                data.families.find(
                                  (family) => family.id === p.family_id,
                                )?.name || "",
                              ) || "Program not selected"}
                            </Typography>
                          </div>
                        </div>
                        <dl className="subscription-catalog__tier-facts">
                          <div>
                            <dt>Base price</dt>
                            <dd>
                              {p.draft.amount
                                ? subscriptionMoney(
                                    p.draft.amount,
                                    p.draft.currency || "USD",
                                  )
                                : "Not set"}
                            </dd>
                          </div>
                          <div>
                            <dt>Term</dt>
                            <dd>{draftTerm(p.draft)}</dd>
                          </div>
                          <div>
                            <dt>Services</dt>
                            <dd>{p.draft.components?.length || 0}</dd>
                          </div>
                          <div>
                            <dt>Published version</dt>
                            <dd>
                              {p.published_version_id && !p.retired
                                ? "Current"
                                : "None"}
                            </dd>
                          </div>
                        </dl>
                        <div className="subscription-catalog__actions subscription-catalog__tier-actions">
                          {data.capabilities.write && (
                            <Button
                              startIcon={<EditOutlinedIcon />}
                              onClick={() => editItem("package", p)}
                            >
                              Edit tier
                            </Button>
                          )}
                          <Button
                            startIcon={<VisibilityOutlinedIcon />}
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                setPreview(
                                  await api<PublishedPackage>(
                                    `/api/clinic/subscription_catalog/packages/${p.id}/preview`,
                                  ),
                                );
                              })
                            }
                          >
                            Preview patient card
                          </Button>
                          <Button
                            component="a"
                            href="/clinic/subscriptions/patient-preview"
                            startIcon={<OpenInNewIcon />}
                          >
                            View patient storefront
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
                                  setRetire({
                                    kind: "package",
                                    id: p.id,
                                    name:
                                      catalogDisplayLabel(p.name) ||
                                      "Membership",
                                  })
                                }
                              >
                                Retire
                              </Button>
                            </>
                          )}
                        </div>
                      </article>
                    ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
      {edit && (
        <Box
          className="subscription-editor"
          component="section"
          aria-labelledby="catalog-editor-title"
        >
          <Stack
            direction="row"
            sx={{
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2,
              gap: 2,
            }}
          >
            <Typography variant="h5" component="h2" id="catalog-editor-title">
              {edit.id ? "Edit" : "Create"}{" "}
              {edit.kind === "package"
                ? "membership tier"
                : edit.kind === "family"
                  ? "program"
                  : "service"}
            </Typography>
            <Button disabled={busy} onClick={() => setEdit(null)}>
              Back to catalog
            </Button>
          </Stack>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Save draft keeps changes private. Publish from the catalog when you
            are ready for patients to see them. Existing purchases keep their
            original terms.
          </Typography>
          <Box
            className="subscription-editor__workspace"
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "minmax(0, 1fr)",
                lg:
                  edit.kind === "package"
                    ? "minmax(0, 1.3fr) minmax(320px, 1fr)"
                    : "minmax(0, 720px)",
              },
              gap: 3,
              alignItems: "start",
            }}
          >
            <Box
              component="fieldset"
              disabled={busy}
              sx={{ minWidth: 0, border: 0, p: 0, m: 0 }}
            >
              {edit.kind === "package" && (
                <Tabs
                  value={editorStep}
                  onChange={(_, value: number) => setEditorStep(value)}
                  variant="scrollable"
                  allowScrollButtonsMobile
                  aria-label="Membership editor sections"
                  sx={{ mb: 2 }}
                >
                  {["Basics", "Pricing & terms", "Services"].map(
                    (label, index) => (
                      <Tab
                        key={label}
                        label={label}
                        value={index}
                        id={`tier-editor-tab-${index}`}
                        aria-controls={`tier-editor-panel-${index}`}
                      />
                    ),
                  )}
                </Tabs>
              )}

              <Stack spacing={2} sx={{ pt: 1 }}>
                {error && <Alert severity="error">{error}</Alert>}
                <TextField
                  required
                  label={
                    <HelpLabel
                      label={
                        edit.kind === "package"
                          ? "Membership name"
                          : edit.kind === "family"
                            ? "Program name"
                            : "Service name"
                      }
                      help="Use the name patients and staff should recognize in the catalog."
                    />
                  }
                  value={edit?.name || ""}
                  onChange={(e) =>
                    edit && setEdit({ ...edit, name: e.target.value })
                  }
                />
                {edit?.kind !== "package" ? (
                  <>
                    <TextField
                      label={
                        <HelpLabel
                          label="Description"
                          help="Explain what this family or service is for in one or two plain-language sentences."
                        />
                      }
                      multiline
                      minRows={2}
                      value={edit?.description || ""}
                      onChange={(e) =>
                        edit &&
                        setEdit({ ...edit, description: e.target.value })
                      }
                    />
                    {edit.kind === "family" && (
                      <TextField
                        label="Display order"
                        type="number"
                        value={edit.display_order ?? 0}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            display_order: Number(e.target.value),
                          })
                        }
                        slotProps={{
                          htmlInput: { min: 0, max: 1000000, step: 1 },
                        }}
                        helperText="Lower numbers appear first in the Patient Portal program tabs. Publish to apply changes."
                      />
                    )}
                  </>
                ) : (
                  <>
                    <Box
                      role="tabpanel"
                      id="tier-editor-panel-0"
                      aria-labelledby="tier-editor-tab-0"
                      hidden={editorStep !== 0}
                    >
                      <Stack spacing={2}>
                        <TextField
                          select
                          label={
                            <HelpLabel
                              label="Membership program"
                              help="The program tab that contains this tier. Both the program and tier must be published to appear to patients."
                            />
                          }
                          value={edit.family_id || ""}
                          onChange={(e) =>
                            setEdit({
                              ...edit,
                              family_id: Number(e.target.value),
                            })
                          }
                        >
                          {data?.families
                            .filter((f) => !f.retired)
                            .map((f) => (
                              <MenuItem key={f.id} value={f.id}>
                                {catalogDisplayLabel(f.name) || "Membership"}
                              </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                          label="Display order"
                          type="number"
                          value={draft.display_order ?? 0}
                          onChange={(e) =>
                            setDraft("display_order", Number(e.target.value))
                          }
                          slotProps={{
                            htmlInput: { min: 0, max: 1000000, step: 1 },
                          }}
                          helperText="Lower numbers appear first within this program after publishing."
                        />
                        <TextField
                          label={
                            <HelpLabel
                              label="Short card description"
                              help="A short explanation shown alongside the package name."
                            />
                          }
                          multiline
                          value={draft.description || ""}
                          onChange={(e) =>
                            setDraft("description", e.target.value)
                          }
                        />
                      </Stack>
                    </Box>
                    <Box
                      role="tabpanel"
                      id="tier-editor-panel-1"
                      aria-labelledby="tier-editor-tab-1"
                      hidden={editorStep !== 1}
                    >
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                          gap: 2,
                        }}
                      >
                        <TextField
                          label={
                            <HelpLabel
                              label="Base price"
                              help="The starting price for one term. Optional or selected services can add to this amount."
                            />
                          }
                          helperText="All package prices are stored and displayed in US dollars (USD)."
                          required
                          value={draft.amount || ""}
                          onChange={(e) => setDraft("amount", e.target.value)}
                        />
                        <TextField
                          label={
                            <HelpLabel
                              label="Duration"
                              help="How long one purchased term lasts."
                            />
                          }
                          type="number"
                          value={draft.duration || 1}
                          disabled={draft.renewal === "automatic"}
                          onChange={(e) =>
                            setDraft("duration", Number(e.target.value))
                          }
                          helperText={
                            draft.renewal === "automatic"
                              ? "Automatic memberships renew every month."
                              : undefined
                          }
                        />
                        <TextField
                          select
                          label={
                            <HelpLabel
                              label="Duration unit"
                              help="Choose days for short programs or months for longer fixed terms."
                            />
                          }
                          value={draft.duration_unit || "months"}
                          disabled={draft.renewal === "automatic"}
                          onChange={(e) =>
                            setDraft("duration_unit", e.target.value)
                          }
                        >
                          {["days", "months"].map((v) => (
                            <MenuItem value={v} key={v}>
                              {v}
                            </MenuItem>
                          ))}
                        </TextField>
                        {(
                          ["renewal", "cancellation", "refund_policy"] as const
                        ).map((field) => (
                          <TextField
                            key={field}
                            select
                            label={
                              <HelpLabel
                                label={field.replaceAll("_", " ")}
                                help={
                                  {
                                    renewal:
                                      "Automatic charges every month through Stripe until canceled and always ends after the paid period. Manual requires a new purchase.",
                                    cancellation:
                                      "Whether access ends immediately or at the end of the paid term.",
                                    refund_policy:
                                      "Manual review records clinic policy. Stripe refunds are handled in the connected Stripe Dashboard and reflected here after verification.",
                                  }[field]
                                }
                              />
                            }
                            value={draft[field] || emptyDraft[field]}
                            disabled={
                              draft.renewal === "automatic" &&
                              field === "cancellation"
                            }
                            onChange={(e) => {
                              if (
                                field === "renewal" &&
                                e.target.value === "automatic"
                              ) {
                                setDraftFields({
                                  renewal: "automatic",
                                  duration: 1,
                                  duration_unit: "months",
                                  cancellation: "end_of_term",
                                  max_per_patient: 1,
                                });
                              } else {
                                setDraft(field, e.target.value);
                              }
                            }}
                          >
                            {{
                              renewal: ["none", "manual", "automatic"],
                              cancellation: ["immediate", "end_of_term"],
                              refund_policy: ["none", "manual_review"],
                            }[field].map((v) => (
                              <MenuItem value={v} key={v}>
                                {v.replaceAll("_", " ")}
                              </MenuItem>
                            ))}
                          </TextField>
                        ))}
                        <TextField
                          label={
                            <HelpLabel
                              label="Maximum memberships per patient"
                              help="Stops duplicate overlapping purchases for the same patient."
                            />
                          }
                          type="number"
                          value={draft.max_per_patient || 1}
                          disabled={draft.renewal === "automatic"}
                          onChange={(e) =>
                            setDraft("max_per_patient", Number(e.target.value))
                          }
                          helperText={
                            draft.renewal === "automatic"
                              ? "One active or pending membership per patient prevents duplicate recurring subscriptions."
                              : undefined
                          }
                        />
                        <TextField
                          label={
                            <HelpLabel
                              label="Available from (optional)"
                              help="The first date and time a new purchase may be made. Use ISO date/time format."
                            />
                          }
                          value={draft.available_from || ""}
                          onChange={(e) =>
                            setDraft("available_from", e.target.value)
                          }
                        />
                        <TextField
                          label={
                            <HelpLabel
                              label="Available until (optional)"
                              help="The last date and time a new purchase may be made. Existing purchases are unaffected."
                            />
                          }
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
                        label={
                          <HelpLabel
                            label="Require clinic eligibility review before payment"
                            help="Patients can review and request the package, but staff approval is required before payment."
                          />
                        }
                      />
                      <TextField
                        required
                        label={
                          <HelpLabel
                            label="Full membership terms"
                            help="The plain-language terms shown immediately before the patient confirms the purchase."
                          />
                        }
                        helperText="Write this for someone seeing the package for the first time."
                        multiline
                        minRows={3}
                        value={draft.terms || ""}
                        onChange={(e) => setDraft("terms", e.target.value)}
                      />
                    </Box>
                    <Box
                      role="tabpanel"
                      id="tier-editor-panel-2"
                      aria-labelledby="tier-editor-tab-2"
                      hidden={editorStep !== 2}
                    >
                      <Typography variant="h6" component="h3">
                        Service composition
                      </Typography>
                      <Typography color="text.secondary">
                        Add at least one service. Included services are
                        automatic; optional and choice-group services let the
                        patient configure the package.
                      </Typography>
                      {(draft.components || []).map((c, index) => (
                        <Paper
                          key={index}
                          variant="outlined"
                          sx={{ p: 2, my: 2 }}
                        >
                          <Stack spacing={2}>
                            <TextField
                              select
                              label={`Service ${index + 1}`}
                              helperText={
                                data?.services.find(
                                  (service) => service.id === c.service_id,
                                )?.description
                              }
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
                                gridTemplateColumns: {
                                  xs: "1fr",
                                  sm: "1fr 1fr",
                                },
                                gap: 2,
                              }}
                            >
                              <TextField
                                select
                                label={
                                  <HelpLabel
                                    label="Inclusion"
                                    help="Included: automatic at no added cost. Optional: the patient may add it. Choose one: exactly one service in a group. Choose many: select within the group minimum and maximum."
                                  />
                                }
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
                                  label={
                                    <HelpLabel
                                      label="Choice group name"
                                      help="The shared question patients answer, such as Choose one focus session."
                                    />
                                  }
                                  value={c.group || ""}
                                  onChange={(e) =>
                                    componentChange(
                                      index,
                                      "group",
                                      e.target.value,
                                    )
                                  }
                                />
                              )}
                              {c.mode === "choose_many" &&
                                (["min", "max"] as const).map((field) => (
                                  <TextField
                                    key={field}
                                    label={
                                      <HelpLabel
                                        label={`${field} choices`}
                                        help={
                                          field === "min"
                                            ? "The fewest services a patient must select in this group."
                                            : "The most services a patient may select in this group."
                                        }
                                      />
                                    }
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
                                label={
                                  <HelpLabel
                                    label="Quantity / usage limit"
                                    help="How many service units are available each day, week, month or term. This does not multiply the price adjustment."
                                  />
                                }
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
                                label={
                                  <HelpLabel
                                    label="Frequency"
                                    help="How often the quantity is available during the purchased term."
                                  />
                                }
                                value={c.frequency || "term"}
                                onChange={(e) =>
                                  componentChange(
                                    index,
                                    "frequency",
                                    e.target.value,
                                  )
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
                                  label={
                                    <HelpLabel
                                      label="Price adjustment (USD)"
                                      help="One exact USD adjustment per selected service, including required choices. It is not multiplied by quantity or frequency. The server calculates the checkout total."
                                    />
                                  }
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
                              label={
                                <HelpLabel
                                  label="This service requires review"
                                  help="Selecting this service sends the purchase to clinic review before payment."
                                />
                              }
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
                              service_id: data?.services.find((s) => !s.retired)
                                ?.id,
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
                    </Box>
                  </>
                )}
              </Stack>
              <Stack direction="row" sx={{ gap: 1, mt: 3, flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  disabled={busy || !edit.name.trim()}
                  onClick={() =>
                    void run(async () => {
                      await api(
                        `/api/clinic/subscription_catalog/${edit.kind}${edit.id ? `/${edit.id}` : ""}`,
                        {
                          method: edit.id ? "PATCH" : "POST",
                          body: { item: edit },
                        },
                      );
                      setEdit(null);
                    })
                  }
                >
                  {edit.kind === "service" ? "Save service" : "Save draft"}
                </Button>
                <Button disabled={busy} onClick={() => setEdit(null)}>
                  Cancel
                </Button>
              </Stack>
            </Box>
            {liveTerms && (
              <Box
                component="aside"
                aria-label="Live patient card preview"
                sx={{ minWidth: 0, position: { lg: "sticky" }, top: 16 }}
              >
                <Typography component="h3" variant="h6" sx={{ mb: 1 }}>
                  Patient card preview
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  Updates as you edit. Draft pricing shows the base price and
                  individual adjustments; the server quote determines the exact
                  checkout total.
                </Typography>
                <ThemeProvider theme={membershipTheme}>
                  <MembershipCard terms={liveTerms} draftPreview />
                </ThemeProvider>
              </Box>
            )}
          </Box>
        </Box>
      )}
      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="catalog-preview-title"
      >
        <DialogTitle id="catalog-preview-title">
          Patient card preview
        </DialogTitle>
        <DialogContent>
          {preview && (
            <ThemeProvider theme={membershipTheme}>
              <MembershipCard terms={preview.terms} canPurchase={false} />
            </ThemeProvider>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>Close</Button>
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
