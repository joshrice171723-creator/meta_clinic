module Clinic
  module Care
    # Bounded version and revision metadata for the current patient. Values, deleted
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
        { key: "encounters", label: "Encounters", permission: "encounters.read", model: Clinic::Encounter },
        { key: "invoices", label: "Invoices", permission: "billing.read", model: Clinic::Invoice },
        { key: "payments", label: "Payments", permission: "billing.read", model: Clinic::PaymentEvent },
        { key: "subscriptions", label: "Memberships", permission: "subscriptions.review", model: Clinic::Care::SubscriptionAgreement },
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
        versions = scope.order(occurred_at: :desc, id: :desc).limit(LIMIT + 1).to_a
        entries = versions.map do |version|
          {
            id: version.id,
            source: sources.fetch(version.item_type),
            section: labels.fetch(version.item_type),
            record_type: version.item_type,
            record_id: version.item_id,
            event: version.event,
            actor_reference: version.actor_reference,
            occurred_at: version.occurred_at&.iso8601(6),
            changed_fields: Array(version.changed_fields) -
              %w[id practice_id patient_id created_at updated_at name_search_tokens]
          }
        end
        if ability.can?(:read, patient)
          coverage << { source: "care_coordination", label: "Care coordination", status: "included" }
          # Append-only revisions are durable evidence in their own right. Do not
          # read encrypted content or manufacture PaperTrail events for them.
          revisions = PatientCareCoordinationRevision
            .where(practice_id: patient.practice_id, patient_id: patient.id)
            .select(:id, :revision, :recorded_at, :recorded_by_membership_id)
            .order(recorded_at: :desc, id: :desc).limit(LIMIT + 1)
          entries.concat(revisions.map do |revision|
            { id: revision.id, source: "care_coordination",
              section: "Care coordination revision #{revision.revision}",
              record_type: PatientCareCoordinationRevision.name, record_id: revision.id,
              event: "recorded",
              actor_reference: "membership:#{revision.recorded_by_membership_id}",
              occurred_at: revision.recorded_at.iso8601(6), changed_fields: [] }
          end)
        else
          coverage << { source: "care_coordination", label: "Care coordination", status: "not_authorized" }
        end
        entries.sort_by! do |entry|
          time = entry[:occurred_at] ? Time.iso8601(entry[:occurred_at]).to_r : 0
          [ time, entry[:id], entry[:source] ]
        end
        entries.reverse!
        { coverage: coverage, has_more: entries.length > LIMIT, entries: entries.first(LIMIT) }
      end

      def self.include_versions(scope, base, model, records)
        scope.or(base.where(item_type: model.base_class.name, item_id: records.select(:id)))
      end
      private_class_method :include_versions
    end
  end
end
