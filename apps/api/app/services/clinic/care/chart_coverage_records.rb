module Clinic
  module Care
    module ChartCoverageRecords
      TYPES = {
        "medication_request" => MedicationRequest,
        "service_request" => ServiceRequest,
        "procedure" => Procedure,
        "immunization" => Immunization,
        "encounter_diagnosis" => EncounterDiagnosis,
        "care_plan" => CarePlan,
        "goal" => Goal,
        "document_review" => DocumentReview
      }.freeze
      APPEND_ONLY_TYPES = %w[procedure immunization encounter_diagnosis].freeze
      ATTRIBUTE_KEYS = %i[
        status priority medication_name dose_text route_text frequency_text reason_text requested_at acknowledged_at
        service_kind request_text service_request_id procedure_name outcome_text performed_at vaccine_name lot_text site_text
        administered_at code_system code display_text narrative asserted_at supersedes_id title description reviewed_at
        care_plan_id target_at completed_at document_id review_note
      ].freeze

      module_function

      def create(practice:, actor:, patient:, encounter:, site:, type:, request_key:, attributes:)
        klass = record_class!(type)
        context!(practice:, patient:, encounter:, site:)
        normalized = normalize_attributes(klass, attributes)
        authorize!(practice, actor, site || encounter&.site)
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "care.chart_coverage.#{type}.create", request_key:,
          resource: encounter || patient, authorization_action: "notes.write",
          authorization: -> { authorize!(practice, actor, site || encounter&.site) },
          payload: { type:, patient_id: patient.id, encounter_id: encounter&.id, site_id: site&.id, attributes: normalized },
          result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) { klass.find_by(practice_id: practice.id, id: receipt.resource_id) }
        ) do
          member = active_membership!(practice, actor)
          record = klass.create!(normalized.merge(
            practice:, patient:, encounter:, site:, recorded_by_membership: member, updated_by_membership: member
          ))
          audit!(practice, actor, type, "create", record)
          record
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?
        outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed chart record is unavailable.")
      end

      def update(practice:, actor:, record:, type:, request_key:, expected_version:, attributes:)
        klass = record_class!(type)
        raise ArgumentError, "The chart record type does not match." unless record.is_a?(klass)
        raise ArgumentError, "This chart record is append-only." if APPEND_ONLY_TYPES.include?(type)

        normalized = normalize_attributes(klass, attributes)
        authorize!(practice, actor, record.site || record.encounter&.site)
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "care.chart_coverage.#{type}.update", request_key:, resource: record,
          authorization_action: "notes.write",
          authorization: -> { authorize!(practice, actor, record.site || record.encounter&.site) },
          payload: { type:, record_id: record.id, expected_version: expected_version, attributes: normalized },
          result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { klass.find_by(practice_id: practice.id, id: receipt.resource_id) }
        ) do
          record.with_lock do
            record.reload
            unless record.lock_version == expected_version!(expected_version)
              raise ActiveRecord::StaleObjectError.new(record, "chart coverage record")
            end
            record.update!(normalized.merge(updated_by_membership: active_membership!(practice, actor)))
            audit!(practice, actor, type, "update", record)
          end
          record
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?
        outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed chart record is unavailable.")
      end

      def record_class!(type)
        TYPES.fetch(type.to_s) { raise ArgumentError, "Unsupported chart record type." }
      end

      def context!(practice:, patient:, encounter:, site:)
        raise ArgumentError, "Patient is outside the selected practice." unless patient.practice_id == practice.id
        if encounter && (encounter.practice_id != practice.id || encounter.patient_id != patient.id)
          raise ArgumentError, "Encounter is outside this patient context."
        end
        if site && site.practice_id != practice.id
          raise ArgumentError, "Site is outside the selected practice."
        end
        if encounter && site && encounter.site_id != site.id
          raise ArgumentError, "Site does not match the selected encounter."
        end
      end
      private_class_method :context!

      def normalize_attributes(klass, attributes)
        allowed = case klass.name.demodulize
        when "MedicationRequest" then %i[status priority medication_name dose_text route_text frequency_text reason_text requested_at acknowledged_at]
        when "ServiceRequest" then %i[service_kind status priority request_text reason_text requested_at acknowledged_at]
        when "Procedure" then %i[service_request_id status procedure_name outcome_text performed_at]
        when "Immunization" then %i[service_request_id status vaccine_name lot_text site_text outcome_text administered_at]
        when "EncounterDiagnosis" then %i[status code_system code display_text narrative asserted_at supersedes_id]
        when "CarePlan" then %i[status title description reviewed_at]
        when "Goal" then %i[care_plan_id status description outcome_text target_at completed_at]
        when "DocumentReview" then %i[document_id status review_note reviewed_at]
        else []
        end
        source = attributes.respond_to?(:to_h) ? attributes.to_h : {}
        source.symbolize_keys.slice(*allowed)
      end
      private_class_method :normalize_attributes

      def expected_version!(value)
        Integer(value).tap do |version|
          raise ArgumentError, "The expected version must not be negative." if version.negative?
        end
      rescue ArgumentError, TypeError
        raise ArgumentError, "The expected version is invalid."
      end
      private_class_method :expected_version!

      def authorize!(practice, actor, site)
        Authorization.authorize!(actor:, practice:, action: "notes.write", site:)
      end
      private_class_method :authorize!

      def active_membership!(practice, actor)
        practice.memberships.active.find_by(user_id: actor.id) ||
          raise(Clinic::Idempotency::InvalidRequest, "An active clinic membership is required.")
      end
      private_class_method :active_membership!

      def audit!(practice, actor, type, action, record)
        Clinic::AuditRecorder.record!(practice:, actor:, action_code: "care.chart_coverage.#{type}.#{action}",
          outcome: :committed, resource_version_ref: "#{record.class.name}/#{record.id}")
      end
      private_class_method :audit!
    end
  end
end
