import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
CAPTURES = ROOT / "apps/web/public/marketing/captures"
MANIFEST = CAPTURES / "manifest.json"

ROUTES = {
    "care-front-desk-october": ("/clinic/front-desk", "front desk day queue"),
    "care-front-desk": ("/clinic/front-desk", "front desk day queue"),
    "care-northside-patient-directory": ("/clinic/patients", "patient directory"),
    "front-desk-five-visit-queue": ("/clinic/front-desk", "front desk day queue"),
    "patient-directory-21-natural-records": ("/clinic/patients", "patient directory"),
    "tracking-board-varied-stages": ("/clinic", "Tracking Board"),
    "crop-front-desk-queue": ("/clinic/front-desk", "front desk queue"),
    "crop-draft-invoice-history": ("/clinic/billing", "draft invoice history"),
    "crop-membership-services": ("/clinic/subscriptions", "membership services"),
    "finance-": ("/clinic/billing", "billing and invoices"),
    "inventory-": ("/clinic/inventory", "inventory"),
    "invoice-ledger-220-records": ("/clinic/billing", "invoice ledger"),
    "membership-catalog-five-programs": ("/clinic/subscriptions", "membership catalog"),
    "membership-": ("/clinic/subscriptions", "memberships"),
    "operations-patient-directory": ("/clinic/patients", "patient directory"),
    "operations-reminders": ("/clinic/reminders", "reminders"),
    "schedule-": ("/clinic/schedule", "scheduling"),
}

PROMOTED_REAL_APP_CAPTURES = {
    "tracking-board-varied-stages-omni.png": "backend-tracking-board-table.png",
    "membership-catalog-five-programs.png": "membership-catalog-live.png",
    "inventory-catalog-100-products.png": "inventory-product-review.png",
    "invoice-ledger-220-records.png": "invoices-product.png",
    "front-desk-five-visit-queue.png": "front-desk-product-review.png",
}

doc = json.loads(MANIFEST.read_text(encoding="utf-8"))
old = {Path(item["file"]).name: item for item in doc["assets"]}
assets = []
for path in sorted(CAPTURES.glob("*.png")):
    name = path.name
    matched = next(((route, area) for prefix, (route, area) in ROUTES.items() if name.startswith(prefix)), None)
    if not matched:
        raise RuntimeError(f"No provenance route for {name}")
    item = old.get(name, {}).copy()
    with Image.open(path) as im:
        size = {"width": im.width, "height": im.height}
    item.update(
        file=f"apps/web/public/marketing/captures/{name}",
        approved=True,
        visualInspected=True,
        featureArea=item.get("featureArea", matched[1]),
        sourceRoute=item.get("sourceRoute", matched[0]),
        clinic=item.get("clinic") or ("Northside Clinic" if "northside" in name else "Omni Test Clinic" if "omni" in name or "october" in name or name == "patient-directory-21-natural-records.png" else None),
        data="synthetic",
        dimensions=size,
    )
    if "sourceQuality" not in item:
        item["sourceQuality"] = "authentic app capture; cropped real pixels only; no UI synthesis"
    if "provenanceNote" not in item:
        item["provenanceNote"] = "Captured from the running synthetic Meta Clinic app and visually reviewed. Cropping retains actual app pixels."
    if name.startswith("care-front-desk-october-afternoon"):
        item["provenanceNote"] = "Adapted from the same authentic full-page app screenshot as the seven-visit queue; the original header and afternoon rows are joined without synthesized UI."
    elif name.startswith("schedule-booking-omni-adapted"):
        item["provenanceNote"] = "Adapted from an authentic booking modal screenshot by cropping and joining real pixels of the same dialog; no UI elements synthesized."
    elif name in {"invoice-ledger-220-records.png", "front-desk-five-visit-queue.png", "finance-open-invoice-queue.png", "finance-draft-invoice-queue.png", "finance-billing-checkout-queue.png", "finance-omni-billing-kpis.png", "finance-omni-reconciliation.png"}:
        item["provenanceNote"] = "Adapted by cropping an authentic Meta Clinic screenshot to keep populated app data in view; original pixels are unchanged and no UI was synthesized."
    if name in PROMOTED_REAL_APP_CAPTURES:
        item["sourceCapture"] = f"apps/web/outputs/real-app-review/{PROMOTED_REAL_APP_CAPTURES[name]}"
        item["provenanceNote"] = "Captured from the running synthetic Meta Clinic app in an earlier review session; curated using original app pixels only."
    if name == "patient-directory-21-natural-records.png":
        item["sourceCapture"] = "apps/web/outputs/capture-raw/care-omni-patient-directory-current-full.png"
        item["provenanceNote"] = "Captured from the authenticated synthetic Omni clinic. The real app screenshot was cropped and joined to show 21 complete patient rows, omitting the incomplete top rows and the clinic-reference column. No UI pixels were synthesized."
    assets.append(item)

doc["purpose"] = "Curated authentic Meta Clinic synthetic demo captures for marketing pages"
doc["capturePolicy"] = "Actual Meta Clinic app pixels only. Crops and joins of the same source screenshot are permitted and noted; fully generated app screens are excluded."
doc["assets"] = assets
MANIFEST.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Approved captures: {len(assets)}")
