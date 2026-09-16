module Clinic
  module Care
    # Bounded version metadata for the current patient. Record values, deleted
    # snapshots, request/session metadata and clinical content are never exposed.
    class PatientActivityHistory
      LIMIT = 25
      REGISTRATION_SECTIONS = {
        demographics: "Demographics",
        address_versions: "Address",
        contacts: "Contact details",
        emergency_contacts: "Emergency contact",
        communication_preference: "Communication preferences"
      }.freeze
      ACTIVITY_SOURCES = [
        { key: "appointments", label: "Appointments", permission: "appointments.read", model: Clinic::Appointment },
        { key: "notes", label: "Encounter notes", permission: "notes.read", model: Clinic::EncounterNote },
        { key: "invoices", label: "Invoices", permission: "billing.read", model: Clinic::Invoice },
        { key: "reminders", label: "Reminders", permission: "reminders.read", model: Clinic::PatientReminder }
      ].freeze

      def self.call(patient:, ability:)
        base = Clinic::ModelVersion.for_practice(patient.practice_id)
        scope = base.for_subject(patient)
        labels = { patient.class.base_class.name => "Patient identity" }
        sources = { patient.class.base_class.name => "registration" }

        REGISTRATION_SECTIONS.each do |association, label|
          model = patient.class.reflect_on_association(association).klass
          records = model.where(practice_id: patient.practice_id, patient_id: patient.id)
          scope = include_versions(scope, base, model, records)
          labels[model.base_class.name] = label
          sources[model.base_class.name] = "registration"
        end

        coverage = [{ source: "registration", label: "Registration", status: "included" }]
        ACTIVITY_SOURCES.each do |source|
          unless ability.allowed_permission?(source.fetch(:permission), any_site: true)
            coverage << {
              source: source.fetch(:key),
              label: source.fetch(:label),
              status: "not_authorized"
            }
            next
          end

          model = source.fetch(:model)
          records = model.accessible_by(ability, :read)
            .where(model.table_name => { practice_id: patient.practice_id, patient_id: patient.id })
          scope = include_versions(scope, base, model, records)
          labels[model.base_class.name] = source.fetch(:label)
          sources[model.base_class.name] = source.fetch(:key)
          coverage << { source: source.fetch(:key), label: source.fetch(:label), status: "included" }
        end
        coverage << { source: "encounters", label: "Encounters", status: "not_included" }

        versions = scope.order(occurred_at: :desc, id: :desc).limit(LIMIT + 1).to_a
        {
          coverage: coverage,
          has_more: versions.length > LIMIT,
          entries: versions.first(LIMIT).map do |version|
            {
              id: version.id,
              source: sources.fetch(version.item_type),
              section: labels.fetch(version.item_type),
              record_type: version.item_type,
              record_id: version.item_id,
              event: version.event,
              actor_reference: version.actor_reference,
              occurred_at: version.occurred_at&.iso8601,
              changed_fields: Array(version.changed_fields) -
                %w[id practice_id patient_id created_at updated_at name_search_tokens]
            }
          end
        }
      end

      def self.include_versions(scope, base, model, records)
        scope.or(base.where(item_type: model.base_class.name, item_id: records.select(:id)))
      end
      private_class_method :include_versions
    end
  end
end
