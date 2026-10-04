from pathlib import Path
from shutil import copy2, move

from PIL import Image

root = Path(__file__).resolve().parents[3]
public = root / "apps/web/public/marketing/captures"
review = root / "apps/web/outputs/capture-raw/reviewed"
review.mkdir(parents=True, exist_ok=True)

crop_specs = {
    "invoice-ledger-220-records.png": (0, 225, 1440, 840),
    "front-desk-five-visit-queue.png": (0, 0, 1520, 925),
    "finance-open-invoice-queue.png": (39, 235, 1320, 1180),
    "finance-draft-invoice-queue.png": (39, 235, 1320, 1180),
    "finance-billing-checkout-queue.png": (60, 0, 1140, 1010),
}
for filename, box in crop_specs.items():
    path = public / filename
    copy2(path, review / f"before-final-crop-{filename}")
    with Image.open(path) as original:
        original.crop(box).save(path)

with Image.open(public / "finance-omni-billing-ledger.png") as original:
    original.crop((16, 95, 1465, 410)).save(public / "finance-omni-billing-kpis.png")
    original.crop((16, 425, 1465, 833)).save(public / "finance-omni-reconciliation.png")

for filename in (
    "finance-omni-membership-billing-full.png",
    "finance-omni-payments-full.png",
    "finance-draft-invoice-queue-data.png",
):
    source = public / filename
    if source.exists():
        move(source, review / filename)

print(f"Curated public PNGs: {len(list(public.glob('*.png')))}")
