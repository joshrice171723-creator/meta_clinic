module Clinic
  module Care
    class LabReportsController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }
      before_action -> { require_capability("notes.read", any_site: true) }, only: %i[index show review_queue follow_up_queue]

      VERSION_FIELDS = %i[title status collected_at issued_at].freeze
      RESULT_FIELDS = %i[name code value unit reference_range flag].freeze

      def index
        patient = readable_patient!
        relation = current_practice.lab_reports.where(patient:).includes(current_version: :follow_up)
        page = page_param
        per_page = per_page_param
        total = relation.count
        reports = relation.latest_first.offset((page - 1) * per_page).limit(per_page)
        audit_read!(patient, "list")
        render json: {
          reports: reports.map { |report| LabReportSerializer.report(report) },
          pagination: { page:, per_page:, total: },
          can_write: can_write?, can_review: can_review?
        }
      end

      def review_queue
        page = page_param
        per_page = per_page_param
        visible_patient_ids = current_practice.patients.accessible_by(current_ability, :read).select(:id)
        relation = current_practice.lab_reports
          .where(patient_id: visible_patient_ids)
          .joins(:current_version)
          .where(clinic_lab_report_versions: { reviewed_at: nil })
        total = relation.count
        reports = relation.includes(:patient, :current_version)
          .order("clinic_lab_report_versions.issued_at ASC", "clinic_lab_report_versions.id ASC", "clinic_lab_reports.id ASC")
          .offset((page - 1) * per_page).limit(per_page)
        Clinic::AuditRecorder.record!(
          practice: current_practice,
          actor: current_user,
          action_code: "lab_report.read",
          outcome: :released,
          resource_version_ref: "lab_report:review_queue:page/#{page}:per_page/#{per_page}"
        )
        render json: {
          items: reports.map { |report| LabReportSerializer.review_queue_item(report) },
          pagination: { page:, per_page:, total: },
          can_review: can_review?
        }
      end

      def follow_up_queue
        page = page_param
        per_page = per_page_param
        visible_patient_ids = current_practice.patients.accessible_by(current_ability, :read).select(:id)
        relation = LabResultFollowUp.where(
          practice: current_practice, patient_id: visible_patient_ids, state: "open"
        ).joins(:lab_report).where(
          "clinic_lab_reports.current_version_id = clinic_lab_result_follow_ups.lab_report_version_id"
        )
        total = relation.count
        follow_ups = relation.includes(:patient, :lab_report_version)
          .order(recorded_at: :asc, id: :asc)
          .offset((page - 1) * per_page).limit(per_page)
        Clinic::AuditRecorder.record!(
          practice: current_practice,
          actor: current_user,
          action_code: "lab_report.follow_up.read",
          outcome: :released,
          resource_version_ref: "lab_report:follow_up_queue:page/#{page}:per_page/#{per_page}"
        )
        render json: {
          items: follow_ups.map { |follow_up| LabReportSerializer.follow_up_queue_item(follow_up) },
          pagination: { page:, per_page:, total: },
          can_complete: can_review?
        }
      end

      def show
        patient = readable_patient!
        report = current_practice.lab_reports.where(patient:)
          .includes(current_version: :follow_up, report_versions: :follow_up)
          .find(requested_id!(params[:id], :id))
        audit_read!(patient, "report/#{report.id}")
        render json: { report: LabReportSerializer.report(report, detail: true), can_write: can_write?, can_review: can_review? }
      end

      def create
        patient = readable_patient!
        input = parameter_hash!(:lab_report,
          [ :request_key, :confirmed_patient, :source_name, :external_report_id, *VERSION_FIELDS ],
          nested_arrays: { results: RESULT_FIELDS })
        result = LabReports.create(
          practice: current_practice, actor: current_user, patient:,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          confirmed_patient: boolean_param(input[:confirmed_patient], field: :confirmed_patient),
          source_name: required_string!(input[:source_name], field: :source_name, maximum: 160),
          external_report_id: optional_string(input[:external_report_id], field: :external_report_id, maximum: 255),
          version: version_attributes(input)
        )
        render json: { report: LabReportSerializer.report(result.value) }, status: result.replayed ? :ok : :created
      end

      def create_version
        patient = readable_patient!
        report = current_practice.lab_reports.where(patient:).find(requested_id!(params[:id], :id))
        input = parameter_hash!(:lab_report_version,
          [ :request_key, :confirmed_patient, :expected_current_version_id, *VERSION_FIELDS ],
          nested_arrays: { results: RESULT_FIELDS })
        result = LabReports.append_version(
          practice: current_practice, actor: current_user, patient:, report:,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          confirmed_patient: boolean_param(input[:confirmed_patient], field: :confirmed_patient),
          expected_current_version_id: requested_id!(input[:expected_current_version_id], :expected_current_version_id),
          version: version_attributes(input)
        )
        render json: {
          version: LabReportSerializer.version(result.value), report_id: report.id, patient_id: patient.id
        }, status: result.replayed ? :ok : :created
      end

      def review
        patient = readable_patient!
        report = current_practice.lab_reports.where(patient:).find(requested_id!(params[:id], :id))
        version = report.report_versions.find(requested_id!(params[:version_id], :version_id))
        input = parameter_hash!(:review, %i[request_key confirmed_patient follow_up_disposition follow_up_note])
        follow_up = if input.key?(:follow_up_disposition) || input.key?(:follow_up_note)
          {
            disposition: input[:follow_up_disposition],
            note: optional_string(input[:follow_up_note], field: :follow_up_note, maximum: 1000)
          }
        end
        result = LabReports.review(
          practice: current_practice, actor: current_user, patient:, report:, version:,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          confirmed_patient: boolean_param(input[:confirmed_patient], field: :confirmed_patient),
          follow_up:
        )
        render json: {
          version: LabReportSerializer.version(result.value), report_id: report.id, patient_id: patient.id
        }
      end

      def record_follow_up
        patient = readable_patient!
        report = current_practice.lab_reports.where(patient:).find(requested_id!(params[:id], :id))
        version = report.report_versions.find(requested_id!(params[:version_id], :version_id))
        input = parameter_hash!(:follow_up, %i[request_key disposition note])
        result = LabResultFollowUps.record(
          practice: current_practice, actor: current_user, patient:, report:, version:,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          disposition: enum_param!(input[:disposition], field: :disposition, allowed: LabResultFollowUps::DISPOSITIONS),
          note: optional_string(input[:note], field: :note, maximum: 1000)
        )
        render json: {
          version: LabReportSerializer.version(result.value.lab_report_version.reload),
          report_id: report.id,
          patient_id: patient.id
        }, status: result.replayed ? :ok : :created
      end

      def complete_follow_up
        patient = readable_patient!
        report = current_practice.lab_reports.where(patient:).find(requested_id!(params[:id], :id))
        version = report.report_versions.find(requested_id!(params[:version_id], :version_id))
        input = parameter_hash!(:follow_up, %i[request_key outcome])
        result = LabResultFollowUps.complete(
          practice: current_practice, actor: current_user, patient:, report:, version:,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          outcome: required_string!(input[:outcome], field: :outcome, maximum: 1000)
        )
        render json: {
          version: LabReportSerializer.version(result.value.lab_report_version.reload),
          report_id: report.id,
          patient_id: patient.id
        }
      end

      private

      def readable_patient!
        current_practice.patients.accessible_by(current_ability, :read)
          .find(requested_id!(params[:patient_id], :patient_id))
      end

      def version_attributes(input)
        rows = Array(input[:results])
        unless rows.size.between?(1, LabReports::MAX_RESULTS)
          raise Clinic::Api::RequestParameters::Invalid.new(
            "results must contain 1–#{LabReports::MAX_RESULTS} rows.", field: :results
          )
        end
        results = rows.map.with_index do |row, index|
          field = "results[#{index}]"
          unless row.is_a?(ActionController::Parameters)
            raise Clinic::Api::RequestParameters::Invalid.new("#{field} must be an object.", field: field)
          end
          {
            name: required_string!(row[:name], field: "#{field}.name", maximum: 200),
            code: optional_string(row[:code], field: "#{field}.code", maximum: 80),
            value: required_string!(row[:value], field: "#{field}.value", maximum: 500),
            unit: optional_string(row[:unit], field: "#{field}.unit", maximum: 80),
            reference_range: optional_string(row[:reference_range], field: "#{field}.reference_range", maximum: 200),
            flag: optional_string(row[:flag], field: "#{field}.flag", maximum: 80)
          }
        end
        {
          title: required_string!(input[:title], field: :title, maximum: 200),
          status: enum_param!(input[:status], field: :status, allowed: LabReportVersion::STATUSES),
          collected_at: time_param!(input[:collected_at], field: :collected_at),
          issued_at: time_param!(input[:issued_at], field: :issued_at),
          results:
        }
      end

      def can_write?
        current_ability.allowed_permission?("observations.write", any_site: true)
      end

      def can_review?
        current_ability.allowed_permission?("notes.write", any_site: true)
      end

      def audit_read!(patient, suffix)
        Clinic::AuditRecorder.record!(
          practice: current_practice, actor: current_user, action_code: "lab_report.read", outcome: :released,
          resource_version_ref: "patient/#{patient.id}:#{suffix}"
        )
      end
    end
  end
end
