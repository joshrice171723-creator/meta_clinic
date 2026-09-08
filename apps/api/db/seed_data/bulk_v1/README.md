# CSV-backed dev seed bundle

This directory is the checked-in source for the local daily dev refresh. Run `ruby script/generate_bulk_seed_csv.rb` from `apps/api` after changing the generator; do not hand-edit generated rows.

The loader reads the files in dependency order:

| Area | Files | Expected rows |
| --- | --- | ---: |
| Access | `roles.csv`, `users.csv`, `role_grants.csv` | 8 roles, 13 users, 13 grants |
| Patients and visits | `patients.csv`, `visits.csv` | 100 patients, 220 visits |
| Billing | `invoice_headers.csv`, `invoice_lines.csv`, `payments.csv` | 220 invoices, 1,100 lines, 110 payments |
| Billing history | `coverage_versions.csv`, `credit_notes.csv`, `refund_events.csv`, `insurance_claims.csv` | 60 coverages, 10 credits, 12 refunds, 20 claims |
| Office inventory | `office_items.csv` | 100 item types |
| Pharmacy inventory | `pharmacy_products.csv`, `pharmacy_batches.csv`, `inventory_adjustments.csv` | 100 products, 200 batches, 100 adjustments |

Every invoice has five lines. Patients have 1, 2 or 3 visits in a 20/40/40 distribution. Invoice rows cover draft, void, paid, partial and open balances. Patient, appointment, invoice and inventory history is distributed across the 90-day window centered on the local calendar date of the refresh. Six confirmed appointments remain open on the anchor date so the Tracking Board is populated. The seed anchor is noon in `America/Chicago`, so reruns on the same date are identical.

The seeded role accounts use simple local addresses such as `omni@test.com` and `billing1@test.com`. The Omni account is compatible with the local development Omni verifier. Other active role accounts use `ApplyDev-<user_key>-2026!`; `disabled@test.com` is intentionally inactive.
