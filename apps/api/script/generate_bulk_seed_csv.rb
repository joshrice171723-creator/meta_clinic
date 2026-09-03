#!/usr/bin/env ruby

require "csv"
require "date"
require "fileutils"

output_root = File.expand_path("../db/seed_data/bulk_v1", __dir__)
FileUtils.mkdir_p(output_root)

def write_csv(root, name, headers, rows)
  CSV.open(File.join(root, name), "wb", write_headers: true, headers: headers) do |csv|
    rows.each { |row| csv << row }
  end
end

roles = {
  "omni_administrator" => {
    code: "development-omni-administrator", version: 4,
    permissions: %w[
      patients.read patients.identity.read patients.write staff.read staff.write
      inventory.read inventory.catalog inventory.receive inventory.adjust inventory.hold
      inventory.release inventory.count inventory.configure inventory.transfer inventory.put_away
      procurement.read procurement.create procurement.submit procurement.approve
      recall.read recall.lock recall.dispose controlled.read controlled.count controlled.certify
      appointments.read appointments.write appointments.book appointments.status_transition
      encounters.write encounters.assign_provider notes.read notes.write notes.sign observations.write
      messages.write documents.read billing.write billing.read billing.invoice_draft billing.invoice_post
      billing.payment_record roles.manage
    ]
  },
  "administrator" => {
    code: "dev-seed-administrator", version: 1,
    permissions: %w[
      patients.read patients.identity.read patients.write staff.read staff.write
      inventory.read inventory.catalog inventory.receive inventory.adjust inventory.hold
      inventory.release inventory.count inventory.configure inventory.transfer inventory.put_away
      procurement.read procurement.create procurement.submit procurement.approve
      recall.read recall.lock recall.dispose controlled.read controlled.count controlled.certify
      appointments.read appointments.write appointments.book appointments.status_transition
      encounters.write encounters.assign_provider notes.read notes.write notes.sign observations.write
      messages.write documents.read billing.write billing.read billing.invoice_draft billing.invoice_post
      billing.payment_record roles.manage
    ]
  },
  "clinician" => {
    code: "dev-seed-clinician", version: 1,
    permissions: %w[patients.read patients.write appointments.read appointments.write appointments.book
      appointments.status_transition encounters.write encounters.assign_provider notes.read notes.write
      notes.sign observations.write documents.read]
  },
  "staff" => {
    code: "dev-seed-staff", version: 1,
    permissions: %w[patients.read patients.identity.read patients.write appointments.read appointments.write
      appointments.book appointments.status_transition encounters.write encounters.assign_provider
      notes.read observations.write inventory.read staff.read messages.write]
  },
  "inventory" => {
    code: "dev-seed-inventory", version: 1,
    permissions: %w[inventory.read inventory.catalog inventory.receive inventory.adjust inventory.hold
      inventory.release inventory.count inventory.configure inventory.transfer inventory.put_away
      procurement.read procurement.create procurement.submit procurement.approve recall.read recall.lock
      recall.dispose controlled.read controlled.count controlled.certify]
  },
  "billing" => {
    code: "dev-seed-billing", version: 1,
    permissions: %w[patients.read patients.identity.read billing.read billing.write billing.invoice_draft
      billing.invoice_post billing.payment_record documents.read]
  },
  "reader" => {
    code: "dev-seed-reader", version: 1,
    permissions: %w[patients.read patients.identity.read appointments.read encounters.assign_provider
      notes.read documents.read inventory.read staff.read billing.read]
  },
  "front_desk" => {
    code: "dev-seed-front-desk", version: 1,
    permissions: %w[patients.identity.read appointments.read appointments.book appointments.status_transition]
  }
}.freeze

write_csv(output_root, "manifest.csv", %w[key value], [
  ["version", "bulk_v1"],
  ["window_days", "90"],
  ["patient_count", "100"],
  ["visit_count", "220"],
  ["invoice_count", "220"],
  ["invoice_line_count", "1100"],
  ["office_item_count", "100"],
  ["pharmacy_product_count", "100"],
  ["pharmacy_batch_count", "200"],
  ["inventory_adjustment_count", "100"],
  ["billing_distribution", "draft:25,void:25,paid:60,partial:50,open:60"]
])

users = [
  ["test_omni", "omni@test.com", "true", "true", "omni", "Omni operator", "omni_administrator"],
  ["test_admin", "admin@test.com", "true", "true", "", "Clinic administrator", "administrator"],
  ["test_clinician_1", "clinician1@test.com", "false", "true", "", "Alex Rowan, NP", "clinician"],
  ["test_clinician_2", "clinician2@test.com", "false", "true", "", "Morgan Ellis, MD", "clinician"],
  ["test_staff_1", "staff1@test.com", "false", "true", "", "Jamie Brooks", "staff"],
  ["test_staff_2", "staff2@test.com", "false", "true", "", "Taylor Nguyen", "staff"],
  ["test_inventory_1", "inventory1@test.com", "false", "true", "", "Casey Morgan", "inventory"],
  ["test_inventory_2", "inventory2@test.com", "false", "true", "", "Riley Chen", "inventory"],
  ["test_billing_1", "billing1@test.com", "false", "true", "", "Jordan Patel", "billing"],
  ["test_billing_2", "billing2@test.com", "false", "true", "", "Avery Davis", "billing"],
  ["test_front_desk", "frontdesk@test.com", "false", "true", "", "Quinn Foster", "front_desk"],
  ["test_reader", "reader@test.com", "false", "true", "", "Robin Flores", "reader"],
  ["test_disabled", "disabled@test.com", "false", "false", "", "Disabled account", "reader"]
]
write_csv(output_root, "users.csv", %w[user_key email admin active password_profile display_name role_key], users)

write_csv(output_root, "roles.csv", %w[role_key role_code version permissions], roles.map do |key, value|
  [key, value.fetch(:code), value.fetch(:version), value.fetch(:permissions).join("|")]
end)

write_csv(output_root, "role_grants.csv", %w[user_key role_key effective_days_ago], users.map do |user|
  [user.fetch(0), user.fetch(6), "120"]
end)

first_names = %w[Avery Jordan Morgan Casey Riley Taylor Cameron Quinn Parker Skyler Emerson Finley Hayden Reese Dakota Rowan Alexis Sage Blake Drew Kendall Jamie Marley Elliot Ari Robin Charlie Micah Shawn Terry]
last_names = %w[Rowan Ellis Reyes Bennett Patel Brooks Nguyen Foster Sullivan Ward Diaz Chen Morgan Thompson Price Cooper Rivera Mitchell Murphy Coleman Ross Perry Powell Hughes Bell Flores Sanders Bryant Russell Griffin]
languages = %w[English English English Spanish English English English French English English]
sexes = %w[female male intersex unknown not_recorded]
relationships = %w[spouse sibling friend parent]

patients = 100.times.map do |index|
  number = index + 1
  [
    "patient_#{format('%03d', number)}",
    "DEV-PAT-#{format('%03d', number)}",
    "#{last_names[index % last_names.length]}, #{first_names[index % first_names.length]}",
    (index % 80) + 10,
    Date.new(1955 + (index * 3) % 52, (index % 12) + 1, (index % 27) + 1).iso8601,
    sexes[index % sexes.length],
    languages[index % languages.length],
    (index % 10).zero?.to_s,
    %w[text phone email portal][index % 4],
    (index % 3 != 0).to_s,
    (index.even?).to_s,
    "+1-312-555-#{format('%04d', 1000 + index)}",
    "dev.patient.#{format('%03d', number)}@example.invalid",
    "Emergency contact #{number}",
    relationships[index % relationships.length],
    "+1-312-555-#{format('%04d', 5000 + index)}",
    (index % 4 != 0).to_s,
    index.even? ? "member" : "nonmember"
  ]
end
write_csv(output_root, "patients.csv", %w[patient_key reference display_name created_days_ago date_of_birth sex primary_language interpreter_required preferred_contact appointment_reminders_consent general_communications_consent phone email emergency_name emergency_relationship emergency_phone emergency_permission membership_status], patients)

visit_type_codes = %w[WELLNESS FOLLOW_UP NEW_CONCERN MEDICATION_REVIEW RESULTS_REVIEW CARE_PLAN]
visit_rows = []
visit_index = 0
patients.each_with_index do |patient, patient_index|
  visit_count = patient_index < 20 ? 1 : patient_index < 60 ? 2 : 3
  visit_count.times do
    day = (visit_index % 89) + 1
    slot = (visit_index / 89) % 3
    visit_rows << [
      "visit_#{format('%03d', visit_index + 1)}",
      patient.fetch(0),
      day,
      8 + (slot * 3),
      (visit_index % 4) * 15,
      45,
      visit_index.even? ? "MAIN" : "ANNEX",
      "EXAM-#{(visit_index % 4) + 1}",
      "test_clinician_#{(visit_index % 2) + 1}",
      visit_type_codes[visit_index % visit_type_codes.length]
    ]
    visit_index += 1
  end
end
write_csv(output_root, "visits.csv", %w[visit_key patient_key days_ago start_hour start_minute duration_minutes site_code room_code clinician_key visit_type_code], visit_rows)

invoice_statuses = (["draft"] * 25) + (["void"] * 25) + (["paid"] * 60) + (["partial"] * 50) + (["open"] * 60)
invoice_rows = []
line_rows = []
visit_rows.each_with_index do |visit, invoice_index|
  invoice_key = "invoice_#{format('%03d', invoice_index + 1)}"
  status = invoice_statuses.fetch(invoice_index)
  currency = invoice_index % 5 == 0 ? "CAD" : "USD"
  invoice_rows << [invoice_key, visit.fetch(1), visit.fetch(0), status, currency, visit.fetch(2), "1"]
  5.times do |line_index|
    quantity = 1 + ((invoice_index + line_index) % 3)
    cents = 3500 + ((invoice_index * 7 + line_index * 11) % 14000)
    line_rows << [invoice_key, line_index + 1, quantity, format("%0.2f", cents / 100.0), "DEV-SEED #{invoice_key} service line #{line_index + 1}"]
  end
end
write_csv(output_root, "invoice_headers.csv", %w[invoice_key patient_key visit_key display_status currency days_ago created_hour], invoice_rows)
write_csv(output_root, "invoice_lines.csv", %w[invoice_key line_number quantity unit_amount description], line_rows)

payment_rows = invoice_rows.select { |row| %w[paid partial].include?(row.fetch(3)) }.map.with_index do |row, index|
  line_total = line_rows.select { |line| line.fetch(0) == row.fetch(0) }.sum { |line| line.fetch(2).to_i * line.fetch(3).to_f }
  amount = row.fetch(3) == "paid" ? line_total : (line_total / 2).round(2)
  ["payment_#{format('%03d', index + 1)}", row.fetch(0), row.fetch(1), row.fetch(4), format("%0.2f", amount), [row.fetch(5).to_i - 1, 1].max]
end
write_csv(output_root, "payments.csv", %w[payment_key invoice_key patient_key currency amount days_ago], payment_rows)

coverage_rows = patients.first(60).map.with_index do |patient, index|
  ["coverage_#{format('%03d', index + 1)}", patient.fetch(0), 1, [patient.fetch(3).to_i - 2, 1].max, "DEV-SEED coverage record #{index + 1}"]
end
write_csv(output_root, "coverage_versions.csv", %w[coverage_key patient_key version days_ago evidence], coverage_rows)

credit_rows = invoice_rows.select.with_index { |row, index| index % 11 == 0 && %w[paid partial].include?(row.fetch(3)) }.map.with_index do |row, index|
  ["credit_#{format('%03d', index + 1)}", row.fetch(0), row.fetch(1), row.fetch(4), "5.00", [row.fetch(5).to_i - 3, 1].max]
end
write_csv(output_root, "credit_notes.csv", %w[credit_key invoice_key patient_key currency amount days_ago], credit_rows)

refund_rows = payment_rows.first(12).map.with_index do |row, index|
  ["refund_#{format('%03d', index + 1)}", row.fetch(0), row.fetch(2), row.fetch(3), "5.00", [row.fetch(5).to_i - 1, 1].max]
end
write_csv(output_root, "refund_events.csv", %w[refund_key payment_key patient_key currency amount days_ago], refund_rows)

coverage_key_by_patient = coverage_rows.to_h { |coverage| [coverage.fetch(1), coverage.fetch(0)] }
claim_rows = invoice_rows.each_with_index.select { |row, index| index.between?(50, 89) && index.even? && %w[paid partial open].include?(row.fetch(3)) }.map.with_index do |(row, _index), index|
  ["claim_#{format('%03d', index + 1)}", row.fetch(0), row.fetch(1), coverage_key_by_patient.fetch(row.fetch(1)), [row.fetch(5).to_i - 1, 1].max]
end
write_csv(output_root, "insurance_claims.csv", %w[claim_key invoice_key patient_key coverage_key days_ago], claim_rows)

office_rows = 100.times.map do |index|
  number = index + 1
  ["office_#{format('%03d', number)}", "DEV-OFF-#{format('%03d', number)}", "Office supply #{format('%03d', number)}", 5 + (index % 20), 25 + (index % 60), (index % 80) + 10]
end
write_csv(output_root, "office_items.csv", %w[item_key sku name reorder_level opening_quantity days_ago], office_rows)

product_bases = %w[
  Acetaminophen Amoxicillin Amlodipine Atorvastatin Azithromycin Cetirizine Ciprofloxacin
  Clindamycin Clopidogrel Doxycycline Escitalopram Famotidine Fluconazole Folicate
  Furosemide Gabapentin Glipizide Hydrochlorothiazide Ibuprofen Lisinopril Loratadine
  Losartan Metformin Methocarbamol Metoprolol Montelukast Naproxen Omeprazole Ondansetron
  Pantoprazole Prednisone Promethazine Propranolol Sertraline Simvastatin Tamsulosin
  Tramadol Valacyclovir Venlafaxine Warfarin Zinc
]
product_rows = 100.times.map do |index|
  number = index + 1
  base = product_bases[index % product_bases.length]
  dose = ["5 mg", "10 mg", "25 mg", "50 mg", "100 mg"][index % 5]
  form = index.even? ? "Tablet" : "Capsule"
  [
    "product_#{format('%03d', number)}",
    "#{base} #{dose} #{form} #{format('%03d', number)}",
    base,
    "#{format('%05d', 10000 + index)}-#{format('%04d', 2000 + index)}-#{format('%02d', (index % 90) + 10)}",
    "#{format('%05d', 10000 + index)}-#{format('%04d', 2000 + index)}",
    form,
    "Oral",
    "Dev Pharmacy Manufacturer",
    base,
    "Bottle of 100 #{form.downcase}s",
    "DEV-RX-#{format('%03d', number)}",
    20 + (index % 40),
    "true",
    "manual",
    "tablet",
    0,
    100,
    "tablet",
    index % 25 == 0 ? "III" : "",
    (index % 80) + 10
  ]
end
write_csv(output_root, "pharmacy_products.csv", %w[product_key name generic_name ndc product_ndc dosage_form route labeler ingredients package_description sku reorder_point active source stock_unit quantity_scale package_size unit_reference dea_schedule days_ago], product_rows)

locations = ["Main Pharmacy", "North Cabinet", "Clinic Store", "Controlled Cabinet"]
batch_rows = 200.times.map do |index|
  product_index = index / 2
  number = index + 1
  [
    "batch_#{format('%03d', number)}",
    "product_#{format('%03d', product_index + 1)}",
    "DEV-LOT-#{format('%03d', product_index + 1)}#{index.even? ? "A" : "B"}",
    locations[index % locations.length],
    120 + (index % 90),
    25 + (index % 30),
    "supplier_#{format('%02d', (index % 20) + 1)}",
    (index % 80) + 10
  ]
end
write_csv(output_root, "pharmacy_batches.csv", %w[batch_key product_key lot_number location expires_in_days opening_packages supplier_key days_ago], batch_rows)

adjustment_rows = 100.times.map do |index|
  [
    "adjustment_#{format('%03d', index + 1)}",
    "batch_#{format('%03d', (index * 2) + 1)}",
    "adjustment_out",
    25 + (index % 10),
    "DEV-SEED cycle usage adjustment #{index + 1}",
    (index % 78) + 8
  ]
end
write_csv(output_root, "inventory_adjustments.csv", %w[adjustment_key batch_key kind amount reason days_ago], adjustment_rows)

puts "Generated bulk dev seed CSVs in #{output_root}"
