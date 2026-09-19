module Clinic
  module Care
    module PatientCareCoordination
      REFERENCE_REVISION_LIMIT = 50
      REFERENCE_RESULT_LIMIT = 25

      def self.scope(practice:, patient:)
        PatientCareCoordinationRevision.where(practice_id: practice.id, patient_id: patient.id)
      end

      def self.authorize!(practice:, actor:, patient:, write: false)
        raise ActiveRecord::RecordNotFound unless patient.practice_id == practice.id

        membership = Clinic::Authorization.authorize!(practice:, actor:, action: "patients.read", subject: patient)
        if write
          membership = Clinic::Authorization.authorize!(practice:, actor:, action: "patients.write", subject: patient)
        end
        membership
      end

      def self.save!(practice:, actor:, patient:, payload:, expected_revision:, request_key:)
        authorize!(practice:, actor:, patient:, write: true)
        unless expected_revision.is_a?(Integer) && expected_revision.between?(0, 2_147_483_646)
          raise ArgumentError, "An expected coordination revision is required."
        end
        normalized = PatientCareCoordinationRevision.normalize_payload(payload)
        result = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "patients.care_coordination", request_key:,
          payload: { patient_id: patient.id, expected_revision:, coordination: normalized },
          authorization_action: "patients.write",
          authorization: -> { authorize!(practice:, actor:, patient:, write: true) },
          result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) {
            scope(practice:, patient:).find_by(id: receipt.resource_id)
          }
        ) do
          patient.with_lock do
            membership = authorize!(practice:, actor:, patient:, write: true)
            latest = scope(practice:, patient:).order(revision: :desc).first
            if (latest&.revision || 0) != expected_revision
              raise ActiveRecord::StaleObjectError.new(patient, "save care coordination")
            end
            validate_references!(practice:, patient:, payload: normalized)
            PatientCareCoordinationRevision.create!(
              practice:, patient:, revision: expected_revision + 1,
              content: JSON.generate(normalized), recorded_by_membership: membership,
              recorded_at: Current.business_time, request_key:
            )
          end
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if result.receipt.outcome_outcome_unconfirmed?

        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      # Search only this patient's encrypted history. No other patient's relationship
      # or invented directory option is exposed, and old selections require reconfirmation.
      def self.references(practice:, actor:, patient:, kind:, query:)
        authorize!(practice:, actor:, patient:)
        raise ArgumentError, "Choose provider or pharmacy references." unless %w[provider pharmacy].include?(kind)
        unless query.is_a?(String) && query.length <= 100
          raise ArgumentError, "Search must contain at most 100 characters."
        end
        records = scope(practice:, patient:).order(revision: :desc).limit(REFERENCE_REVISION_LIMIT + 1).to_a
        history_limited = records.length > REFERENCE_REVISION_LIMIT
        groups = kind == "pharmacy" ? %w[pharmacy] : %w[primary_care specialists]
        entries = records.first(REFERENCE_REVISION_LIMIT).flat_map do |record|
          groups.flat_map do |group|
            record.payload.fetch(group).fetch("entries").each_with_index.map do |entry, index|
              { reference_id: "#{record.id}:#{group}:#{index}", entry: entry.except("reference_id"),
                recorded_at: record.recorded_at.iso8601(6) }
            end
          end
        end
        terms = query.downcase.strip.split
        entries.select! do |item|
          text = item[:entry].values_at("name", "practice", "phone", "address", "identifier").compact.join(" ").downcase
          terms.all? { |term| text.include?(term) }
        end
        entries.uniq! { |item| item[:entry].except("address_confirmed", "source", "source_detail") }
        { references: entries.first(REFERENCE_RESULT_LIMIT),
          limited: history_limited || entries.length > REFERENCE_RESULT_LIMIT,
          history_revision_limit: REFERENCE_REVISION_LIMIT }
      end

      def self.validate_references!(practice:, patient:, payload:)
        payload.each do |group, section|
          section.fetch("entries").each do |entry|
            next if entry["reference_id"].blank?

            match = /\A([1-9]\d*):(primary_care|specialists|pharmacy):(\d{1,2})\z/.match(entry["reference_id"])
            raise ArgumentError, "Choose a recorded reference or use Other manual entry." unless match
            unless (group == "pharmacy") == (match[2] == "pharmacy")
              raise ArgumentError, "The selected reference is not the requested kind."
            end
            record = scope(practice:, patient:).find_by(id: match[1])
            original = record&.payload&.dig(match[2], "entries", match[3].to_i)
            unless original && %w[name practice phone address identifier identifier_system].all? { |field| original[field] == entry[field] }
              raise ArgumentError, "The reference details changed. Choose Other manual entry to record different details."
            end
          end
        end
      end
      private_class_method :validate_references!
    end
  end
end
