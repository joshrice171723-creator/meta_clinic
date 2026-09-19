module Clinic
  module Care
    module IntakeConsents
      def self.scope(practice:, patient:)
        IntakeConsentRevision.where(practice_id: practice.id, patient_id: patient.id)
      end

      def self.authorize!(practice:, actor:, patient:, write: false)
        raise ActiveRecord::RecordNotFound unless patient.practice_id == practice.id

        membership = Clinic::Authorization.authorize!(practice:, actor:, action: "patients.read", subject: patient)
        Clinic::Authorization.authorize!(practice:, actor:, action: "intake.write", any_site: true) if write
        membership
      end

      def self.latest(practice:, patient:)
        IntakeConsentRevision::PURPOSES.to_h do |purpose|
          [purpose, scope(practice:, patient:).where(purpose:).order(revision: :desc).first]
        end
      end

      def self.save!(practice:, actor:, patient:, purpose:, payload:, expected_revision:, request_key:)
        authorize!(practice:, actor:, patient:, write: true)
        raise ArgumentError, "Choose a supported consent purpose." unless IntakeConsentRevision::PURPOSES.include?(purpose)
        unless expected_revision.is_a?(Integer) && expected_revision.between?(0, 2_147_483_646)
          raise ArgumentError, "An expected consent evidence version is required."
        end
        normalized = IntakeConsentRevision.normalize_payload(payload)
        result = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "patients.intake_consent", request_key:,
          payload: { patient_id: patient.id, purpose:, expected_revision:, consent: normalized },
          authorization_action: "intake.write",
          authorization: -> { authorize!(practice:, actor:, patient:, write: true) },
          result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) { scope(practice:, patient:).find_by(id: receipt.resource_id) }
        ) do
          patient.with_lock do
            membership = authorize!(practice:, actor:, patient:, write: true)
            validate_source_document!(practice:, actor:, patient:, source_document_id: normalized["source_document_id"])
            latest = scope(practice:, patient:).where(purpose:).order(revision: :desc).first
            if (latest&.revision || 0) != expected_revision
              raise ActiveRecord::StaleObjectError.new(patient, "record intake consent evidence")
            end
            IntakeConsentRevision.create!(practice:, patient:, purpose:, revision: expected_revision + 1,
              content: JSON.generate(normalized), recorded_by_membership: membership,
              recorded_at: Current.business_time, request_key:)
          end
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if result.receipt.outcome_outcome_unconfirmed?

        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def self.document_options(practice:, actor:, patient:)
        authorize!(practice:, actor:, patient:)
        Clinic::Authorization.authorize!(practice:, actor:, action: "documents.read", subject: patient)
        Clinic::Document.where(practice_id: practice.id, patient_id: patient.id).recent.limit(50).map do |document|
          { id: document.id, category_id: document.category_id, object_version: document.object_version,
            media_type: document.media_type, created_at: document.created_at.iso8601(6) }
        end
      end

      def self.validate_source_document!(practice:, actor:, patient:, source_document_id:)
        return unless source_document_id

        Clinic::Authorization.authorize!(practice:, actor:, action: "documents.read", subject: patient)
        document = Clinic::Document.find_by(id: source_document_id, practice_id: practice.id, patient_id: patient.id)
        raise ArgumentError, "Choose a document available to this patient." unless document
      end
      private_class_method :validate_source_document!
    end
  end
end
