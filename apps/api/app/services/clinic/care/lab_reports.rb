require "digest"

module Clinic
  module Care
    class LabReports
      MAX_RESULTS = 100
      MAX_PAYLOAD_BYTES = 65_536
      Result = Data.define(:value, :replayed)

      def self.create(practice:, actor:, patient:, request_key:, confirmed_patient:, source_name:, external_report_id:, version:, site: nil)
        patient = practice.patients.find(patient.id)
        site = practice.sites.find(site.id) if site
        authorize_write!(practice:, actor:, patient:, site:)
        confirm_patient!(confirmed_patient)
        report_identity = {
          source_name: required_text(source_name, "source_name", 160),
          external_report_id: optional_text(external_report_id, "external_report_id", 255)
        }
        version_payload = normalize_version(version)
        payload = { patient_id: patient.id, site_id: site&.id, confirmed_patient: true, report: report_identity, version: version_payload }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "lab_report.create", request_key:, payload:,
          authorization: -> { authorize_write!(practice:, actor:, patient:, site:) }, authorization_action: "observations.write",
          result_resource: ->(report) { report },
          resource_resolver: ->(practice:, receipt:) { practice.lab_reports.where(patient:).find_by(id: receipt.resource_id) }
        ) do
          member = authorize_write!(practice:, actor:, patient:, site:)
          report = practice.lab_reports.create!(report_identity.merge(patient:, site:))
          lab_version = create_version!(report:, member:, number: 1, attributes: version_payload)
          report.update!(current_version: lab_version)
          audit!(practice:, actor:, action: "lab_report.create", report:, version: lab_version)
          report
        end
        confirmed_result!(outcome)
      end

      def self.append_version(practice:, actor:, patient:, report:, request_key:, confirmed_patient:, expected_current_version_id:, version:)
        patient = practice.patients.find(patient.id)
        report = practice.lab_reports.where(patient:).find(report.id)
        authorize_write!(practice:, actor:, patient:, site: report.site)
        confirm_patient!(confirmed_patient)
        expected_id = positive_integer(expected_current_version_id, "expected_current_version_id")
        version_payload = normalize_version(version)
        payload = {
          patient_id: patient.id, report_id: report.id, confirmed_patient: true,
          expected_current_version_id: expected_id, version: version_payload
        }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "lab_report.version.create", request_key:, payload:, resource: report,
          authorization: -> { authorize_write!(practice:, actor:, patient:, site: report.site) }, authorization_action: "observations.write",
          result_resource: ->(lab_version) { lab_version },
          resource_resolver: ->(practice:, receipt:) {
            LabReportVersion.where(practice:, patient:, lab_report: report).find_by(id: receipt.resource_id)
          }
        ) do
          member = authorize_write!(practice:, actor:, patient:, site: report.site)
          locked = practice.lab_reports.where(patient:).lock.find(report.id)
          unless locked.current_version_id == expected_id
            raise ActiveRecord::StaleObjectError.new(locked, "update")
          end
          current = locked.report_versions.find(expected_id)
          LabResultFollowUps.supersede_open!(
            practice:, actor:, patient:, report: locked, version: current
          )
          lab_version = create_version!(report: locked, member:, number: current.version_number + 1, attributes: version_payload)
          locked.update!(current_version: lab_version)
          audit!(practice:, actor:, action: "lab_report.version.create", report: locked, version: lab_version)
          lab_version
        end
        confirmed_result!(outcome)
      end

      def self.review(practice:, actor:, patient:, report:, version:, request_key:, confirmed_patient:, follow_up: nil)
        patient = practice.patients.find(patient.id)
        report = practice.lab_reports.where(patient:).find(report.id)
        version = report.report_versions.find(version.id)
        authorize_review!(practice:, actor:, patient:, site: report.site)
        confirm_patient!(confirmed_patient)
        follow_up_payload = LabResultFollowUps.normalize_optional_decision(follow_up)
        payload = { patient_id: patient.id, report_id: report.id, version_id: version.id, confirmed_patient: true }
        if follow_up_payload
          payload[:follow_up_disposition] = follow_up_payload.fetch(:disposition)
          payload[:follow_up_note] = follow_up_payload[:instructions]
        end
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "lab_report.version.review", request_key:, payload:, resource: version,
          authorization: -> { authorize_review!(practice:, actor:, patient:, site: report.site) }, authorization_action: "notes.write",
          result_resource: ->(reviewed) { reviewed },
          resource_resolver: ->(practice:, receipt:) {
            LabReportVersion.where(practice:, patient:, lab_report: report).find_by(id: receipt.resource_id)
          }
        ) do
          member = authorize_review!(practice:, actor:, patient:, site: report.site)
          locked_report = practice.lab_reports.where(patient:).lock.find(report.id)
          unless locked_report.current_version_id == version.id
            raise ActiveRecord::StaleObjectError.new(locked_report, "review")
          end
          locked_version = locked_report.report_versions.lock.find(version.id)
          raise ArgumentError, "This lab report version was already reviewed." if locked_version.reviewed_at.present?

          locked_version.update!(reviewed_by_membership: member, reviewed_at: Current.business_time)
          audit!(practice:, actor:, action: "lab_report.version.review", report: locked_report, version: locked_version)
          LabResultFollowUps.create_for_review!(
            practice:, actor:, patient:, report: locked_report, version: locked_version,
            member:, decision: follow_up_payload
          )
          locked_version
        end
        confirmed_result!(outcome)
      end

      def self.normalize_version(attributes)
        results = normalize_results(attributes.fetch(:results))
        payload = {
          title: required_text(attributes[:title], "title", 200),
          status: status(attributes[:status]),
          collected_at: timestamp(attributes[:collected_at], "collected_at"),
          issued_at: timestamp(attributes[:issued_at], "issued_at"),
          results: results,
          entry_kind: "manual"
        }
        raise ArgumentError, "issued_at cannot be before collected_at." if payload[:issued_at] < payload[:collected_at]
        canonical = JSON.generate(payload.transform_values { |value| value.respond_to?(:iso8601) ? value.utc.iso8601(6) : value })
        raise ArgumentError, "Lab report content is too large." if canonical.bytesize > MAX_PAYLOAD_BYTES

        payload.merge(content_digest: Digest::SHA256.hexdigest(canonical))
      rescue KeyError
        raise ArgumentError, "results are required."
      end
      private_class_method :normalize_version

      def self.normalize_results(results)
        unless results.is_a?(Array) && results.size.between?(1, MAX_RESULTS)
          raise ArgumentError, "results must contain 1–#{MAX_RESULTS} rows."
        end

        results.map do |row|
          values = row.to_h.symbolize_keys
          {
            "name" => required_text(values[:name], "result name", 200),
            "code" => optional_text(values[:code], "result code", 80),
            "value" => required_text(values[:value], "result value", 500),
            "unit" => optional_text(values[:unit], "result unit", 80),
            "reference_range" => optional_text(values[:reference_range], "reference_range", 200),
            "flag" => optional_text(values[:flag], "result flag", 80)
          }
        end
      rescue NoMethodError
        raise ArgumentError, "Each result must be an object."
      end
      private_class_method :normalize_results

      def self.create_version!(report:, member:, number:, attributes:)
        report.report_versions.create!(
          practice: report.practice, patient: report.patient, version_number: number,
          title: attributes.fetch(:title), status: attributes.fetch(:status),
          collected_at: attributes.fetch(:collected_at), issued_at: attributes.fetch(:issued_at),
          results_payload: JSON.generate(attributes.fetch(:results)), entry_kind: attributes.fetch(:entry_kind),
          content_digest: attributes.fetch(:content_digest), recorded_by_membership: member,
          recorded_at: Current.business_time
        )
      end
      private_class_method :create_version!

      def self.authorize_write!(practice:, actor:, patient:, site:)
        Authorization.authorize!(practice:, actor:, action: "patients.read", subject: patient)
        Authorization.authorize!(practice:, actor:, action: "observations.write", site: site)
      end
      private_class_method :authorize_write!

      def self.authorize_review!(practice:, actor:, patient:, site:)
        Authorization.authorize!(practice:, actor:, action: "patients.read", subject: patient)
        Authorization.authorize!(practice:, actor:, action: "notes.write", site: site)
      end
      private_class_method :authorize_review!

      def self.confirm_patient!(value)
        raise ArgumentError, "Confirm the selected patient before recording lab results." unless value == true
      end
      private_class_method :confirm_patient!

      def self.status(value)
        value = value.to_s
        return value if value.in?(LabReportVersion::STATUSES)

        raise ArgumentError, "status must be one of: #{LabReportVersion::STATUSES.join(', ')}."
      end
      private_class_method :status

      def self.timestamp(value, field)
        return value if value.respond_to?(:iso8601)

        Time.iso8601(value.to_s)
      rescue ArgumentError
        raise ArgumentError, "#{field} must be an ISO 8601 timestamp with an offset."
      end
      private_class_method :timestamp

      def self.required_text(value, field, maximum)
        text = value.to_s.strip
        raise ArgumentError, "#{field} is required." if text.empty?
        raise ArgumentError, "#{field} must be at most #{maximum} characters." if text.length > maximum

        text
      end
      private_class_method :required_text

      def self.optional_text(value, field, maximum)
        text = value.to_s.strip
        return nil if text.empty?
        raise ArgumentError, "#{field} must be at most #{maximum} characters." if text.length > maximum

        text
      end
      private_class_method :optional_text

      def self.positive_integer(value, field)
        number = Integer(value.to_s, 10)
        return number if number.positive?

        raise ArgumentError
      rescue ArgumentError
        raise ArgumentError, "#{field} must be a positive integer."
      end
      private_class_method :positive_integer

      def self.confirmed_result!(outcome)
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        Result.new(value: outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed lab record is unavailable."), replayed: outcome.replayed)
      end
      private_class_method :confirmed_result!

      def self.audit!(practice:, actor:, action:, report:, version:)
        AuditRecorder.record!(
          practice:, actor:, action_code: action, outcome: :committed,
          resource_version_ref: "lab_report/#{report.id}:version/#{version.id}:patient/#{report.patient_id}:#{version.content_digest}"
        )
      end
      private_class_method :audit!
    end
  end
end
