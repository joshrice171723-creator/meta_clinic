module Clinic
  module Care
    module PatientEducation
      module_function

      OPTIONS = {
        topics: PatientEducationEvent::TOPICS,
        delivery_methods: PatientEducationEvent::DELIVERY_METHODS,
        recipients: PatientEducationEvent::RECIPIENTS,
        teach_back_statuses: PatientEducationEvent::TEACH_BACK_STATUSES
      }.freeze

      def index(practice:, actor:, patient:, encounter:)
        authorize_read!(practice, actor, patient, encounter)
        events = PatientEducationEvent.where(practice:, patient:, encounter:)
          .order(recorded_at: :desc, id: :desc).limit(100)
        Clinic::AuditRecorder.record!(
          practice:, actor:, action_code: "patient_education.read", outcome: :released,
          resource_version_ref: "patient/#{patient.id}:encounter/#{encounter.id}:education"
        )
        {
          patient_id: patient.id,
          encounter_id: encounter.id,
          events: events.map { |event| serialize(event) },
          options: OPTIONS,
          can_write: encounter.status == "open" && encounter.ended_at.nil? &&
            Ability.new(actor, practice:).allowed_permission?("observations.write", site: encounter.site)
        }
      end

      def record(practice:, actor:, patient:, encounter:, request_key:, attributes:)
        patient = practice.patients.find(patient.id)
        encounter = practice.encounters.where(patient:).find(encounter.id)
        authorize_write!(practice, actor, patient, encounter)
        values = normalize(attributes)
        payload = { patient_id: patient.id, encounter_id: encounter.id, education: values }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "patient_education.record", request_key:, payload:, resource: encounter,
          authorization_action: "observations.write",
          authorization: -> { authorize_write!(practice, actor, patient, encounter) },
          result_resource: ->(event) { event },
          resource_resolver: ->(practice:, receipt:) {
            PatientEducationEvent.where(practice:, patient:, encounter:).find_by(id: receipt.resource_id)
          }
        ) do
          locked_encounter = practice.encounters.where(patient:).lock.find(encounter.id)
          unless locked_encounter.status == "open" && locked_encounter.ended_at.nil? && locked_encounter.site_id.present?
            raise ArgumentError, "Patient education can be recorded only during an open encounter with a facility."
          end
          member = authorize_write!(practice, actor, patient, locked_encounter)
          event = PatientEducationEvent.create!(
            values.merge(practice:, patient:, encounter: locked_encounter, site: locked_encounter.site,
              recorded_by_membership: member, recorded_at: Current.business_time, request_key:)
          )
          create_follow_up_task!(event, member) if event.follow_up_needed?
          Clinic::AuditRecorder.record!(
            practice:, actor:, action_code: "patient_education.record", outcome: :committed,
            resource_version_ref: "patient_education/#{event.id}:patient/#{patient.id}:encounter/#{encounter.id}"
          )
          event
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        serialize(outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The education record is unavailable."))
      end

      def serialize(event)
        {
          id: event.id, patient_id: event.patient_id, encounter_id: event.encounter_id, site_id: event.site_id,
          topic_code: event.topic_code, topic_title: event.topic_title, delivery_method: event.delivery_method,
          recipient: event.recipient, material_title: event.material_title, material_url: event.material_url,
          language: event.language, interpreter_used: event.interpreter_used,
          teach_back_status: event.teach_back_status, patient_response: event.patient_response,
          reteaching_summary: event.reteaching_summary, follow_up_needed: event.follow_up_needed,
          follow_up_plan: event.follow_up_plan, recorded_by_membership_id: event.recorded_by_membership_id,
          recorded_at: event.recorded_at.iso8601(6)
        }
      end

      def normalize(attributes)
        values = attributes.to_h.symbolize_keys
        {
          topic_code: enum!(values[:topic_code], PatientEducationEvent::TOPICS, "topic_code"),
          topic_title: text!(values[:topic_title], "topic_title", 240),
          delivery_method: enum!(values[:delivery_method], PatientEducationEvent::DELIVERY_METHODS, "delivery_method"),
          recipient: enum!(values[:recipient], PatientEducationEvent::RECIPIENTS, "recipient"),
          material_title: optional_text(values[:material_title], "material_title", 240),
          material_url: optional_text(values[:material_url], "material_url", 2_000),
          language: text!(values[:language], "language", 80),
          interpreter_used: values[:interpreter_used] == true,
          teach_back_status: enum!(values[:teach_back_status], PatientEducationEvent::TEACH_BACK_STATUSES, "teach_back_status"),
          patient_response: optional_text(values[:patient_response], "patient_response", 2_000),
          reteaching_summary: optional_text(values[:reteaching_summary], "reteaching_summary", 2_000),
          follow_up_needed: values[:follow_up_needed] == true,
          follow_up_plan: optional_text(values[:follow_up_plan], "follow_up_plan", 2_000)
        }
      end
      private_class_method :normalize

      def create_follow_up_task!(event, member)
        Clinic::ClinicalTask.create!(
          practice_id: event.practice_id, patient_id: event.patient_id, encounter_id: event.encounter_id,
          site_id: event.site_id, task_kind: "patient_call", state: "open", pool_code: "clinical",
          source_type: "encounter", source_id: event.encounter_id, recorded_by_membership: member
        )
      end
      private_class_method :create_follow_up_task!

      def authorize_read!(practice, actor, patient, encounter)
        Authorization.authorize!(practice:, actor:, action: "patients.read", subject: patient)
        Authorization.authorize!(practice:, actor:, action: "clinical_records.read", site: encounter.site)
      end
      private_class_method :authorize_read!

      def authorize_write!(practice, actor, patient, encounter)
        Authorization.authorize!(practice:, actor:, action: "patients.read", subject: patient)
        Authorization.authorize!(practice:, actor:, action: "observations.write", site: encounter.site)
      end
      private_class_method :authorize_write!

      def text!(value, field, maximum)
        text = value.to_s.strip
        raise ArgumentError, "#{field} is required." if text.blank?
        raise ArgumentError, "#{field} must be at most #{maximum} characters." if text.length > maximum
        text
      end
      private_class_method :text!

      def optional_text(value, field, maximum)
        text = value.to_s.strip
        return nil if text.blank?
        raise ArgumentError, "#{field} must be at most #{maximum} characters." if text.length > maximum
        text
      end
      private_class_method :optional_text

      def enum!(value, allowed, field)
        text = value.to_s
        raise ArgumentError, "Choose a supported #{field.tr('_', ' ')}." unless allowed.include?(text)
        text
      end
      private_class_method :enum!
    end
  end
end
