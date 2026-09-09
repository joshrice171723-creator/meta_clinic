module Clinic
  module Care
    class LabResultFollowUps
      DISPOSITIONS = %w[required not_required].freeze
      Result = Data.define(:value, :replayed)

      def self.record(practice:, actor:, patient:, report:, version:, request_key:, disposition:, note: nil)
        patient = practice.patients.find(patient.id)
        report = practice.lab_reports.where(patient:).find(report.id)
        version = report.report_versions.find(version.id)
        authorize!(practice:, actor:, patient:, site: report.site)
        decision = normalize_decision(disposition:, note:)
        payload = {
          patient_id: patient.id, report_id: report.id, version_id: version.id,
          disposition: decision.fetch(:disposition), note: decision[:instructions]
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

      def self.complete(practice:, actor:, patient:, report:, version:, request_key:, outcome:)
        patient = practice.patients.find(patient.id)
        report = practice.lab_reports.where(patient:).find(report.id)
        version = report.report_versions.find(version.id)
        authorize!(practice:, actor:, patient:, site: report.site)
        normalized_outcome = required_text(outcome, "outcome")
        payload = {
          patient_id: patient.id, report_id: report.id, version_id: version.id, outcome: normalized_outcome
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
            completed_at: Current.business_time, completed_by_membership: member
          )
          audit!(practice:, actor:, action: "lab_report.follow_up.complete", follow_up:)
          follow_up
        end
        confirmed_result!(result)
      end

      def self.normalize_optional_decision(value)
        return nil if value.nil?

        attributes = value.to_h.symbolize_keys
        normalize_decision(disposition: attributes[:disposition], note: attributes[:note])
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

      def self.normalize_decision(disposition:, note:)
        normalized_disposition = disposition.to_s
        unless normalized_disposition.in?(DISPOSITIONS)
          raise ArgumentError, "follow_up_disposition must be one of: #{DISPOSITIONS.join(', ')}."
        end

        instructions = if normalized_disposition == "required"
          required_text(note, "follow_up_note")
        else
          optional_text(note, "follow_up_note")
        end
        { disposition: normalized_disposition, instructions: }
      end
      private_class_method :normalize_decision

      def self.create_decision!(practice:, actor:, patient:, report:, version:, member:, decision:)
        follow_up = LabResultFollowUp.create!(
          practice:, patient:, lab_report: report, lab_report_version: version,
          state: decision.fetch(:disposition) == "required" ? "open" : "not_required",
          instructions: decision[:instructions], recorded_by_membership: member, recorded_at: Current.business_time
        )
        audit!(practice:, actor:, action: "lab_report.follow_up.record", follow_up:)
        follow_up
      end
      private_class_method :create_decision!

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
