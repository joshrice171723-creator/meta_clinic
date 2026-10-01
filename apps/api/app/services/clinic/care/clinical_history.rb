module Clinic
  module Care
    class ClinicalHistory
      KINDS = {
        "allergies" => { model: Allergy, singular: "allergy" },
        "medications" => { model: MedicationStatement, singular: "medication" },
        "conditions" => { model: Condition, singular: "condition" }
      }.freeze
      REVIEW_TOPICS = %w[allergies medications conditions care_needs].freeze

      def self.create(practice:, actor:, patient:, encounter:, kind:, attributes:, request_key:)
        definition = definition!(kind)
        authorize_write!(practice:, actor:, patient:, encounter:)
        at = Current.business_time
        payload = {
          patient_id: patient.id, encounter_id: encounter.id, kind: kind,
          attributes: attributes
        }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "clinical_history.#{definition.fetch(:singular)}.create",
          request_key:, payload:, resource: encounter,
          authorization: -> { authorize_write!(practice:, actor:, patient:, encounter:) },
          authorization_action: "notes.write",
          result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) {
            definition.fetch(:model).where(practice:, patient:).find_by(id: receipt.resource_id)
          }
        ) do
          locked_encounter = lock_open_encounter!(practice:, patient:, encounter:)
          member = authorize_write!(practice:, actor:, patient:, encounter: locked_encounter)
          record = definition.fetch(:model).create!(attributes.merge(
            practice:, patient:, data_status: "recorded",
            recorded_by_membership: member, recorded_at: at
          ))
          audit!(practice:, actor:, action: "clinical_history.#{definition.fetch(:singular)}.create", record:, encounter: locked_encounter)
          record
        end
        confirmed!(outcome)
      end

      def self.update(practice:, actor:, patient:, encounter:, kind:, record_id:, attributes:, expected_lock_version:, request_key:)
        definition = definition!(kind)
        authorize_write!(practice:, actor:, patient:, encounter:)
        record = definition.fetch(:model).where(practice:, patient:).find(record_id)
        payload = {
          patient_id: patient.id, encounter_id: encounter.id, kind: kind, record_id: record.id,
          expected_lock_version: Integer(expected_lock_version), attributes: attributes
        }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "clinical_history.#{definition.fetch(:singular)}.update",
          request_key:, payload:, resource: record,
          authorization: -> { authorize_write!(practice:, actor:, patient:, encounter:) },
          authorization_action: "notes.write",
          result_resource: ->(updated) { updated },
          resource_resolver: ->(practice:, receipt:) {
            definition.fetch(:model).where(practice:, patient:).find_by(id: receipt.resource_id)
          }
        ) do
          lock_open_encounter!(practice:, patient:, encounter:)
          current = definition.fetch(:model).where(practice:, patient:).lock.find(record.id)
          if current.lock_version != Integer(expected_lock_version)
            raise ActiveRecord::StaleObjectError.new(current, "update")
          end
          current.update!(attributes.merge(data_status: "recorded"))
          audit!(practice:, actor:, action: "clinical_history.#{definition.fetch(:singular)}.update", record: current, encounter:)
          current
        end
        confirmed!(outcome)
      end

      def self.review(practice:, actor:, patient:, encounter:, topic:, outcome:, information_source:, notes:, request_key:)
        raise ArgumentError, "Choose a supported history topic." unless topic.in?(REVIEW_TOPICS)

        authorize_write!(practice:, actor:, patient:, encounter:)
        reviewed_at = Current.business_time
        payload = {
          patient_id: patient.id, encounter_id: encounter.id, topic:, outcome:,
          information_source:, notes:
        }
        result = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "clinical_history.review.create",
          request_key:, payload:, resource: encounter,
          authorization: -> { authorize_write!(practice:, actor:, patient:, encounter:) },
          authorization_action: "notes.write",
          result_resource: ->(review) { review },
          resource_resolver: ->(practice:, receipt:) {
            PatientHistoryReview.where(practice:, patient:, encounter:).find_by(id: receipt.resource_id)
          }
        ) do
          locked_encounter = lock_open_encounter!(practice:, patient:, encounter:)
          member = authorize_write!(practice:, actor:, patient:, encounter: locked_encounter)
          active = active_records(patient, topic, reviewed_at).lock.to_a
          if outcome == "none_reported" && active.any?
            raise ArgumentError, "Active #{topic.tr('_', ' ')} remain recorded. Update them before recording none reported."
          end
          if outcome == "current_list_confirmed" && active.empty?
            raise ArgumentError, "No active #{topic.tr('_', ' ')} are recorded. Use none reported or another review outcome."
          end
          active.each do |record|
            record.update!(reviewed_by_membership: member, last_reviewed_at: reviewed_at)
          end if outcome == "current_list_confirmed"
          review = PatientHistoryReview.create!(
            practice:, patient:, encounter: locked_encounter, topic:, outcome:,
            information_source:, notes:, reviewer_membership: member,
            reviewed_at:, request_key:
          )
          audit!(practice:, actor:, action: "clinical_history.review.create", record: review, encounter: locked_encounter)
          review
        end
        confirmed!(result)
      end

      def self.authorize_write!(practice:, actor:, patient:, encounter:)
        patient = practice.patients.find(patient.id)
        encounter = practice.encounters.where(patient: patient).find(encounter.id)
        raise ArgumentError, "Clinical history can be changed only during an open encounter." unless encounter.status == "open" && encounter.ended_at.nil?

        Authorization.authorize!(actor:, practice:, action: "patients.read", subject: patient)
        Authorization.authorize!(actor:, practice:, action: "notes.write", site: encounter.site)
      end
      private_class_method :authorize_write!

      def self.lock_open_encounter!(practice:, patient:, encounter:)
        # A patient may have more than one encounter. Serialize list changes and
        # attestations across them so "none reported" cannot race a new entry.
        practice.patients.lock.find(patient.id)
        locked = practice.encounters.where(patient: patient).lock.find(encounter.id)
        raise ArgumentError, "Clinical history can be changed only during an open encounter." unless locked.status == "open" && locked.ended_at.nil?

        locked
      end
      private_class_method :lock_open_encounter!

      def self.active_records(patient, topic, at)
        case topic
        when "allergies" then patient.allergies.recorded_details.where(clinical_status: "active")
        when "medications" then patient.medication_statements.recorded_details.where(status: "active")
        when "conditions" then patient.conditions.recorded_details.where(clinical_status: "active")
        when "care_needs" then patient.care_needs.active_at(at)
        end
      end
      private_class_method :active_records

      def self.definition!(kind)
        KINDS.fetch(kind.to_s) { raise ArgumentError, "Choose allergies, medications, or conditions." }
      end
      private_class_method :definition!

      def self.confirmed!(outcome)
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed clinical history record is unavailable.")
      end
      private_class_method :confirmed!

      def self.audit!(practice:, actor:, action:, record:, encounter:)
        version = record.respond_to?(:lock_version) ? record.lock_version : record.created_at.utc.iso8601(6)
        AuditRecorder.record!(
          practice:, actor:, action_code: action, outcome: :committed,
          resource_version_ref: "#{record.class.name}/#{record.id}:#{version}:patient/#{record.patient_id}:encounter/#{encounter.id}"
        )
      end
      private_class_method :audit!
    end
  end
end
