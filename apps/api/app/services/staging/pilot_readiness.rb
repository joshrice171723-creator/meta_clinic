require "digest"
require "json"

module Staging
  class PilotReadiness
    FORMAT = 1
    PATIENT_REFERENCES = %w[DEMO-001 DEMO-002 DEMO-003 DEMO-004].freeze
    ITEM_SKUS = %w[SYN-OFFICE-001 SYN-OFFICE-002 SYN-OFFICE-003].freeze
    STAFF_TITLES = [ "Clinic coordinator", "Medical assistant" ].freeze

    class Unavailable < StandardError; end

    def self.receipt!(connection: ApplicationRecord.connection,
      schema_version: ActiveRecord::Base.connection_pool.migration_context.current_version)
      raise Unavailable, "Staging pilot readiness is unavailable." unless DemoClinic.deployment?

      user = User.find_by(email_address: DemoClinic::EMAIL)
      raise Unavailable, "The staging reviewer identity is unavailable." unless DemoClinic.available_to?(user)

      membership = user.clinic_membership
      practice = membership.practice
      verify_role!(membership)
      verify_dataset!(practice)
      raise Unavailable, "The staging database identity is invalid." unless
        connection.adapter_name == "PostgreSQL" && connection.select_value("SELECT current_user") == "apply_runtime"

      state = {
        schema_version: schema_version,
        patients: identity_summary(practice.patients),
        encounters: identity_summary(practice.encounters),
        notes: identity_summary(Clinic::Care::Note.where(practice_id: practice.id)),
        items: identity_summary(practice.items),
        inventory_entries: identity_summary(Clinic::Inventory::Entry.where(practice_id: practice.id)),
        staff_members: identity_summary(practice.staff_members),
        audit_events: identity_summary(practice.audit_events)
      }
      {
        format: FORMAT,
        environment: "staging",
        database: "postgresql",
        schema_version: state.fetch(:schema_version),
        state_fingerprint: Digest::SHA256.hexdigest(JSON.generate(state))
      }
    end

    private_class_method def self.verify_role!(membership)
      active_permissions = membership.role_grants.active.includes(role_version: :permissions)
        .flat_map { |grant| grant.role_version.permissions.pluck(:action_code) }.uniq.sort
      raise Unavailable, "The staging reviewer authorization is incomplete." unless
        active_permissions == DemoClinic::PERMISSIONS.sort
    end

    private_class_method def self.identity_summary(relation)
      { count: relation.count, first_id: relation.minimum(:id), last_id: relation.maximum(:id) }
    end

    private_class_method def self.verify_dataset!(practice)
      patients = practice.patients.where(reference: PATIENT_REFERENCES)
      raise Unavailable, "The staging patient set is incomplete." unless patients.count == PATIENT_REFERENCES.length
      raise Unavailable, "The staging chart set is incomplete." unless
        patients.all? { |patient| patient.notes.exists? }
      raise Unavailable, "The staging inventory set is incomplete." unless
        practice.items.where(sku: ITEM_SKUS).count == ITEM_SKUS.length
      raise Unavailable, "The staging staff set is incomplete." unless
        practice.staff_members.where(job_title: STAFF_TITLES).count == STAFF_TITLES.length
    end
  end
end
