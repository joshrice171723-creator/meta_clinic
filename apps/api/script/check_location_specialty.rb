# Run: ruby bin/postgres exec ruby bin/rails runner script/check_location_specialty.rb
# Creates independent synthetic records inside a transaction that always rolls back.
abort "Local development only" unless Rails.env.development?
database = ActiveRecord::Base.connection_db_config.database.to_s
abort "Use a guarded local development database" unless database.match?(/\Aapply.*_development\z/) &&
  %w[127.0.0.1 localhost].include?(ActiveRecord::Base.connection_db_config.configuration_hash[:host])

def check!(condition, message)
  raise message unless condition
end

ApplicationRecord.transaction do
  practice = Clinic::Practice.create!(name: "Location separation check", timezone: "UTC")
  user = User.create!(email_address: "specialty-check-#{SecureRandom.hex(8)}@example.test",
    password: SecureRandom.hex(24), active: true)
  member = practice.memberships.create!(user:, active: true)
  shared = practice.visit_types.create!(code: "Shared custom visit")
  weight = practice.sites.create!(code: "weight", status: "active")
  behavior = practice.sites.create!(code: "behavior", status: "active")
  missing = practice.sites.create!(code: "unconfigured", status: "active")
  configuration = Clinic::Configuration::PracticeFeatures
  starter = Clinic::Configuration::StarterProfile

  save_profile = lambda do |site, specialty, services, previous = nil, finalized = true|
    profile = starter.apply(practice:, clinic_type: specialty, service_scope: services, previous:)
    options = { "clinic_type" => specialty, "service_scope" => services,
      "assessment_scope" => [ "depression" ], "starter_profile" => profile }
    options["finalized_at"] = Time.current.iso8601 if finalized
    revision = Clinic::PracticeFeatureVersion.where(practice:, site:).maximum(:revision).to_i + 1
    Clinic::PracticeFeatureVersion.create!(practice:, site:, created_by_membership: member,
      revision:, optional_features: options, effective_from: 1.minute.ago,
      request_key: SecureRandom.uuid, content_digest: Digest::SHA256.hexdigest(options.to_json))
    profile
  end

  save_profile.call(nil, "weight_loss", [ "medication_management" ])
  w = save_profile.call(weight, "weight_loss", [ "medication_management" ])
  b = save_profile.call(behavior, "behavioral_health", [], nil, false)
  check!(configuration.snapshot(practice:, site: missing)[:clinic_type].nil?, "Unconfigured location inherited clinic specialty")
  check!(starter.available_visit_type_ids(practice:, site: behavior).empty?, "Draft location enabled new visits")
  check!(!b.fetch("visits").key?("psychiatric_evaluation"), "Unselected psychiatric service generated a visit")
  b = save_profile.call(behavior, "behavioral_health", [ "individual_therapy" ], b)
  weight_visit = practice.visit_types.find(w.dig("visits", "initial", "visit_type_id"))
  therapy_visit = practice.visit_types.find(b.dig("visits", "individual_therapy", "visit_type_id"))
  check!(starter.visit_available?(practice:, site: weight, visit_type: weight_visit), "Weight visit unavailable at weight location")
  check!(!starter.visit_available?(practice:, site: behavior, visit_type: weight_visit), "Weight visit leaked into behavioral location")
  check!(starter.visit_available?(practice:, site: behavior, visit_type: therapy_visit), "Enabled therapy unavailable")
  check!(!starter.visit_available?(practice:, site: weight, visit_type: therapy_visit), "Therapy leaked into weight location")
  [ weight, behavior ].each do |site|
    check!(starter.visit_available?(practice:, site:, visit_type: shared), "Shared custom visit was specialty-gated")
  end
  check!(starter.service_available?(practice:, site: weight, service: "medication_management"), "Shared medication management unavailable")
  check!(!starter.service_available?(practice:, site: weight, service: "individual_therapy"), "Weight location enabled therapy")
  templates = Clinic::Care::NoteTemplateCatalog
  check!(!templates.available(practice:, site: weight).any? { |t| t[:id] == "behavioral-health-progress" }, "Behavioral template leaked")
  check!(!templates.available(practice:, site: behavior).any? { |t| t[:id] == "weight-management-follow-up" }, "Weight template leaked")
  therapy_visit.update!(code: "Renamed therapy")
  patient = practice.patients.create!(display_name: "Jordan Example", reference: "SPECIALTY-CHECK")
  appointment = practice.appointments.create!(patient:, site: behavior, visit_type: therapy_visit,
    starts_at: 1.day.from_now, ends_at: 1.day.from_now + 30.minutes, status: "scheduled")
  b = save_profile.call(behavior, "behavioral_health", [], b)
  check!(b.dig("visits", "individual_therapy", "visit_type_id") == therapy_visit.id, "Service removal discarded saved visit identity")
  check!(!starter.visit_available?(practice:, site: behavior, visit_type: therapy_visit), "Disabled therapy remained bookable")
  Clinic::Care::PrevisitIntake.require_new_form!(practice:, appointment:)
  b = save_profile.call(behavior, "behavioral_health", [ "individual_therapy" ], b)
  check!(starter.visit_available?(practice:, site: behavior, visit_type: therapy_visit), "Re-enabled renamed therapy unavailable")
  therapy_visit.update!(retired_at: Time.current)
  save_profile.call(behavior, "behavioral_health", [ "individual_therapy" ], b)
  check!(!starter.visit_available?(practice:, site: behavior, visit_type: therapy_visit), "Preset reactivated retired visit")
  puts "PASS: location profile, visit/service/template separation, shared work, saved booking intake and preserved preset identity"
  raise ActiveRecord::Rollback
end
