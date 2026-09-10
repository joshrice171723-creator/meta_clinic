module Clinic
  module Care
    class LabResultFollowUps
      DISPOSITIONS = %w[required not_required].freeze
      PATIENT_CONTACT_STATUSES = %w[informed not_reached not_required].freeze
      PATIENT_CONTACT_METHODS = %w[portal phone in_person letter other].freeze
      Result = Data.define(:value, :replayed)

      def self.record(practice:, actor:, patient:, report:, version:, request_key:, disposition:, note: nil, due_at: nil)
        patient = practice.patients.find(patient.id)
        report = practice.lab_reports.where(patient:).find(report.id)
        version = report.report_versions.find(version.id)
        authorize!(practice:, actor:, patient:, site: report.site)
        decision = normalize_decision(disposition:, note:, due_at:, priority: version.result_priority)
        payload = {
          patient_id: patient.id, report_id: report.id, version_id: version.id,
          disposition: decision.fetch(:disposition), note: decision[:instructions], due_at: decision[:due_at],
          priority: decision.fetch(:priority)
        }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "lab_report.follow_up.record", request_key:, payload:, resource: version,
          authorization: -> { authorize!(practice:, actor:, patient:, site: report.site) }, authorization_action: "notes.write",
          result_resource: ->(follow_up) { follow_up },
          resource_resolver: ->(practice:, receipt:) {
            LabResultFollowUp.where(
              practice:, patient:, lab_report: report, lab_report_version: version
            ).find_by(id: receipt.resource_id)
          }
        ) do
          member = authorize!(practice:, actor:, patient:, site: report.site)
          locked_report = practice.lab_reports.where(patient:).lock.find(report.id)
          unless locked_report.current_version_id == version.id
            raise ActiveRecord::StaleObjectError.new(locked_report, "record follow-up")
          end
          locked_version = locked_report.report_versions.find(version.id)
          raise ArgumentError, "Review this lab report version before recording follow-up." if locked_version.reviewed_at.nil?

          existing = LabResultFollowUp.where(
            practice:, patient:, lab_report: locked_report, lab_report_version: locked_version
          ).lock.first
          raise ArgumentError, "A follow-up decision was already recorded for this lab report version." if existing

          create_decision!(
            practice:, actor:, patient:, report: locked_report, version: locked_version, member:, decision:
          )
        end
        confirmed_result!(outcome)
      end

      def self.complete(practice:, actor:, patient:, report:, version:, request_key:, outcome:,
        patient_contact_status: nil, patient_contact_method: nil, patient_contact_at: nil)
        patient = practice.patients.find(patient.id)
        report = practice.lab_reports.where(patient:).find(report.id)
        version = report.report_versions.find(version.id)
        authorize!(practice:, actor:, patient:, site: report.site)
        normalized_outcome = required_text(outcome, "outcome")
        contact = normalize_contact(
          priority: version.result_priority, status: patient_contact_status,
          method: patient_contact_method, at: patient_contact_at
        )
        payload = {
          patient_id: patient.id, report_id: report.id, version_id: version.id, outcome: normalized_outcome,
          patient_contact: contact
        }
        result = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "lab_report.follow_up.complete", request_key:, payload:, resource: version,
          authorization: -> { authorize!(practice:, actor:, patient:, site: report.site) }, authorization_action: "notes.write",
          result_resource: ->(follow_up) { follow_up },
          resource_resolver: ->(practice:, receipt:) {
            LabResultFollowUp.where(
              practice:, patient:, lab_report: report, lab_report_version: version
            ).find_by(id: receipt.resource_id)
          }
        ) do
          member = authorize!(practice:, actor:, patient:, site: report.site)
          locked_report = practice.lab_reports.where(patient:).lock.find(report.id)
          unless locked_report.current_version_id == version.id
            raise ActiveRecord::StaleObjectError.new(locked_report, "complete follow-up")
          end
          follow_up = LabResultFollowUp.where(
            practice:, patient:, lab_report: locked_report, lab_report_version: version
          ).lock.first
          raise ArgumentError, "This lab report version has no open follow-up." unless follow_up&.state_open?

          follow_up.update!(
            state: "completed", outcome: normalized_outcome,
            completed_at: Current.business_time, completed_by_membership: member,
            patient_contact_status: contact[:status], patient_contact_method: contact[:method],
            patient_contact_at: contact[:at]
          )
          audit!(practice:, actor:, action: "lab_report.follow_up.complete", follow_up:)
          follow_up
        end
        confirmed_result!(result)
      end

      def self.normalize_optional_decision(value, priority:)
        return nil if value.nil?

        attributes = value.to_h.symbolize_keys
        normalize_decision(
          disposition: attributes[:disposition], note: attributes[:note], due_at: attributes[:due_at], priority:
        )
      rescue NoMethodError
        raise ArgumentError, "follow-up decision must be an object."
      end

      def self.create_for_review!(practice:, actor:, patient:, report:, version:, member:, decision:)
        return unless decision

        existing = LabResultFollowUp.where(
          practice:, patient:, lab_report: report, lab_report_version: version
        ).lock.first
        raise ArgumentError, "A follow-up decision was already recorded for this lab report version." if existing

        create_decision!(practice:, actor:, patient:, report:, version:, member:, decision:)
      end

      def self.supersede_open!(practice:, actor:, patient:, report:, version:)
        follow_up = LabResultFollowUp.where(
          practice:, patient:, lab_report: report, lab_report_version: version, state: "open"
        ).lock.first
        return unless follow_up

        follow_up.update!(state: "superseded", superseded_at: Current.business_time)
        audit!(practice:, actor:, action: "lab_report.follow_up.supersede", follow_up:)
        follow_up
      end

      def self.normalize_decision(disposition:, note:, due_at:, priority:)
        normalized_disposition = disposition.to_s
        unless normalized_disposition.in?(DISPOSITIONS)
          raise ArgumentError, "follow_up_disposition must be one of: #{DISPOSITIONS.join(', ')}."
        end

        priority = priority.to_s
        unless priority.in?(%w[routine urgent critical])
          raise ArgumentError, "The lab result priority is unsupported."
        end
        if priority.in?(%w[urgent critical]) && normalized_disposition != "required"
          raise ArgumentError, "Urgent and critical results must remain open for documented follow-up."
        end
        instructions = if normalized_disposition == "required"
          required_text(note, "follow_up_note")
        else
          optional_text(note, "follow_up_note")
        end
        normalized_due_at = if priority.in?(%w[urgent critical])
          due_at || raise(ArgumentError, "Urgent and critical results require a follow-up due time.")
        end
        { disposition: normalized_disposition, instructions:, priority:, due_at: normalized_due_at }
      end
      private_class_method :normalize_decision

      def self.create_decision!(practice:, actor:, patient:, report:, version:, member:, decision:)
        follow_up = LabResultFollowUp.create!(
          practice:, patient:, lab_report: report, lab_report_version: version,
          state: decision.fetch(:disposition) == "required" ? "open" : "not_required",
          instructions: decision[:instructions], priority: decision.fetch(:priority), due_at: decision[:due_at],
          escalated_at: decision.fetch(:priority).in?(%w[urgent critical]) ? Current.business_time : nil,
          escalated_by_membership: decision.fetch(:priority).in?(%w[urgent critical]) ? member : nil,
          recorded_by_membership: member, recorded_at: Current.business_time
        )
        audit!(practice:, actor:, action: "lab_report.follow_up.record", follow_up:)
        follow_up
      end
      private_class_method :create_decision!

      def self.normalize_contact(priority:, status:, method:, at:)
        status = status.to_s.presence
        method = method.to_s.presence
        if status && !PATIENT_CONTACT_STATUSES.include?(status)
          raise ArgumentError, "Choose a supported patient contact status."
        end
        if method && !PATIENT_CONTACT_METHODS.include?(method)
          raise ArgumentError, "Choose a supported patient contact method."
        end
        raise ArgumentError, "Critical result follow-up requires a patient contact status." if priority == "critical" && status.nil?
        if status.in?(%w[informed not_reached]) && at.nil?
          raise ArgumentError, "Record when patient contact was attempted."
        end
        if status == "informed" && method.nil?
          raise ArgumentError, "Record how the patient was informed."
        end
        if status == "not_required" && (method || at)
          raise ArgumentError, "Contact method and time do not apply when patient contact is not required."
        end
        { status:, method:, at: }
      end
      private_class_method :normalize_contact

      def self.authorize!(practice:, actor:, patient:, site:)
        Authorization.authorize!(practice:, actor:, action: "patients.read", subject: patient)
        Authorization.authorize!(practice:, actor:, action: "notes.write", site: site)
      end
      private_class_method :authorize!

      def self.required_text(value, field)
        text = value.to_s.strip
        raise ArgumentError, "#{field} is required." if text.empty?
        raise ArgumentError, "#{field} must be at most 1000 characters." if text.length > 1000

        text
      end
      private_class_method :required_text

      def self.optional_text(value, field)
        text = value.to_s.strip
        return nil if text.empty?
        raise ArgumentError, "#{field} must be at most 1000 characters." if text.length > 1000

        text
      end
      private_class_method :optional_text

      def self.confirmed_result!(outcome)
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        value = outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed lab follow-up is unavailable.")
        Result.new(value:, replayed: outcome.replayed)
      end
      private_class_method :confirmed_result!

      def self.audit!(practice:, actor:, action:, follow_up:)
        AuditRecorder.record!(
          practice:, actor:, action_code: action, outcome: :committed,
          resource_version_ref: "lab_report/#{follow_up.lab_report_id}:version/#{follow_up.lab_report_version_id}:" \
            "follow_up/#{follow_up.id}:state/#{follow_up.state}"
        )
      end
      private_class_method :audit!
    end
  end
end
