module Clinic
  module Care
    class LabReportsController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }
      before_action -> { require_capability("notes.read", any_site: true) },
        only: %i[index show review_queue follow_up_queue result_history]

      VERSION_FIELDS = %i[title status result_priority collected_at issued_at].freeze
      RESULT_FIELDS = %i[name code code_system code_version value unit unit_code supplied_unit_code interpretation reference_range flag value_kind absent_reason value_code value_code_system performing_organization issuing_organization method resulted_at received_at].freeze

      def index
        patient = readable_patient!
        relation = visible_reports("notes.read").where(patient:).includes(:lab_specimen, { current_version: :follow_up }, follow_ups: :lab_report_version)
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
        relation = visible_reports("notes.read")
          .where(patient_id: visible_patient_ids)
          .joins(:current_version)
          .where(clinic_lab_report_versions: { reviewed_at: nil })
        total = relation.count
        reports = relation.includes(:patient, :current_version)
          .order(Arel.sql("CASE clinic_lab_report_versions.result_priority " \
            "WHEN 'critical' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END ASC"))
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
        ).joins(:lab_report).merge(visible_reports("notes.read"))
        total = relation.count
        follow_ups = relation.includes(:patient, :lab_report, :lab_report_version)
          .order(Arel.sql("CASE clinic_lab_result_follow_ups.priority " \
            "WHEN 'critical' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END ASC"))
          .order(Arel.sql("clinic_lab_result_follow_ups.due_at ASC NULLS LAST"), recorded_at: :asc, id: :asc)
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
          .includes(:lab_specimen, current_version: :follow_up, report_versions: :follow_up)
          .find(requested_id!(params[:id], :id))
        authorize_report!(report, "notes.read")
        audit_read!(patient, "report/#{report.id}")
        render json: { report: LabReportSerializer.report(report, detail: true), can_write: can_write?, can_review: can_review? }
      end

      def result_history
        patient = readable_patient!
        report = current_practice.lab_reports.where(patient: patient)
          .includes(:current_version).find(requested_id!(params[:id], :id))
        authorize_report!(report, "notes.read")
        version = report.report_versions.find(requested_id!(params[:version_id], :version_id))
        unless report.current_version_id == version.id
          raise ActiveRecord::StaleObjectError.new(report, "lab result history")
        end
        raise ArgumentError, "Cancelled lab report results are unavailable for comparison." if version.status_cancelled?

        result_index = bounded_integer!(
          params[:result_index], field: :result_index, min: 0, max: LabReports::MAX_RESULTS - 1
        )
        page = page_param
        per_page = per_page_param(default: 25, maximum: 25)
        payload = LabResultHistory.call(
          practice: current_practice,
          patient: patient,
          report: report,
          version: version,
          result_index: result_index,
          page: page,
          per_page: per_page
        )
        Clinic::AuditRecorder.record!(
          practice: current_practice,
          actor: current_user,
          action_code: "lab_report.result_history.read",
          outcome: :released,
          resource_version_ref: "Clinic::Care::LabReportVersion/#{version.id}:result/#{result_index}"
        )
        render json: payload
      end

      def create
        patient = readable_patient!
        input = parameter_hash!(:lab_report,
          [ :request_key, :confirmed_patient, :source_name, :external_report_id, :service_request_revision_id,
            :specimen_identifier, :specimen_type_code, :specimen_type_display, :specimen_condition, *VERSION_FIELDS ],
          nested_arrays: { results: RESULT_FIELDS })
        result = LabReports.create(
          practice: current_practice, actor: current_user, patient:,
          site: selected_lab_site,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          confirmed_patient: boolean_param(input[:confirmed_patient], field: :confirmed_patient),
          source_name: required_string!(input[:source_name], field: :source_name, maximum: 160),
          external_report_id: optional_string(input[:external_report_id], field: :external_report_id, maximum: 255),
          service_request_revision_id: requested_id!(input[:service_request_revision_id], :service_request_revision_id),
          specimen: {
            specimen_identifier: optional_string(input[:specimen_identifier], field: :specimen_identifier, maximum: 255),
            specimen_type_code: required_string!(input[:specimen_type_code], field: :specimen_type_code, maximum: 80),
            specimen_type_display: required_string!(input[:specimen_type_display], field: :specimen_type_display, maximum: 160),
            condition_code: enum_param!(input[:specimen_condition], field: :specimen_condition, allowed: LabSpecimen::CONDITIONS)
          },
          version: version_attributes(input)
        )
        render json: { report: LabReportSerializer.report(result.value) }, status: result.replayed ? :ok : :created
      end

      def create_version
        patient = readable_patient!
        report = current_practice.lab_reports.where(patient:).find(requested_id!(params[:id], :id))
        authorize_report!(report, "observations.write")
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
        authorize_report!(report, "notes.write")
        version = report.report_versions.find(requested_id!(params[:version_id], :version_id))
        input = parameter_hash!(:review, %i[request_key confirmed_patient follow_up_disposition follow_up_note follow_up_due_at])
        follow_up = if input.key?(:follow_up_disposition) || input.key?(:follow_up_note) || input.key?(:follow_up_due_at)
          {
            disposition: input[:follow_up_disposition],
            note: optional_string(input[:follow_up_note], field: :follow_up_note, maximum: 1000),
            due_at: input[:follow_up_due_at].present? ? time_param!(input[:follow_up_due_at], field: :follow_up_due_at) : nil
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

      def record_action
        patient = readable_patient!
        report = current_practice.lab_reports.where(patient:).find(requested_id!(params[:id], :id))
        version = report.report_versions.find(requested_id!(params[:version_id], :version_id))
        input = parameter_hash!(:lab_action, %i[kind note request_key replacement_report_id])
        action = LabReportActions.record(practice: current_practice, actor: current_user, report:, version:,
          kind: required_string!(input[:kind], field: :kind, maximum: 40),
          note: optional_string(input[:note], field: :note, maximum: 1000),
          replacement_report_id: optional_id(input[:replacement_report_id], :replacement_report_id),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 100))
        render json: { action: action.slice(:id, :kind, :clinical_task_id), version: LabReportSerializer.version(version) }, status: :created
      end

      def record_follow_up
        patient = readable_patient!
        report = current_practice.lab_reports.where(patient:).find(requested_id!(params[:id], :id))
        authorize_report!(report, "notes.write")
        version = report.report_versions.find(requested_id!(params[:version_id], :version_id))
        input = parameter_hash!(:follow_up, %i[request_key disposition note due_at])
        result = LabResultFollowUps.record(
          practice: current_practice, actor: current_user, patient:, report:, version:,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          disposition: enum_param!(input[:disposition], field: :disposition, allowed: LabResultFollowUps::DISPOSITIONS),
          note: optional_string(input[:note], field: :note, maximum: 1000),
          due_at: input[:due_at].present? ? time_param!(input[:due_at], field: :due_at) : nil
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
        authorize_report!(report, "notes.write")
        version = report.report_versions.find(requested_id!(params[:version_id], :version_id))
        input = parameter_hash!(:follow_up,
          %i[request_key outcome patient_contact_status patient_contact_method patient_contact_at])
        result = LabResultFollowUps.complete(
          practice: current_practice, actor: current_user, patient:, report:, version:,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          outcome: required_string!(input[:outcome], field: :outcome, maximum: 1000),
          patient_contact_status: input[:patient_contact_status].presence && enum_param!(
            input[:patient_contact_status], field: :patient_contact_status,
            allowed: LabResultFollowUps::PATIENT_CONTACT_STATUSES
          ),
          patient_contact_method: input[:patient_contact_method].presence && enum_param!(
            input[:patient_contact_method], field: :patient_contact_method,
            allowed: LabResultFollowUps::PATIENT_CONTACT_METHODS
          ),
          patient_contact_at: input[:patient_contact_at].present? ? time_param!(input[:patient_contact_at], field: :patient_contact_at) : nil
        )
        render json: {
          version: LabReportSerializer.version(result.value.lab_report_version.reload),
          report_id: report.id,
          patient_id: patient.id
        }
      end

      def record_follow_up_contact_attempt
        patient = readable_patient!
        report = current_practice.lab_reports.where(patient:).find(requested_id!(params[:id], :id))
        authorize_report!(report, "notes.write")
        version = report.report_versions.find(requested_id!(params[:version_id], :version_id))
        follow_up = version.follow_up || raise(ActiveRecord::RecordNotFound)
        input = parameter_hash!(:contact_attempt,
          %i[request_key contact_method outcome attempted_at next_action_due_at note])
        result = LabResultFollowUps.attempt_contact(
          practice: current_practice, actor: current_user, patient:, report:, version:, follow_up:,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          contact_method: enum_param!(input[:contact_method], field: :contact_method,
            allowed: LabResultFollowUpContactAttempt::METHODS),
          outcome: enum_param!(input[:outcome], field: :outcome,
            allowed: LabResultFollowUpContactAttempt::OUTCOMES),
          attempted_at: time_param!(input[:attempted_at], field: :attempted_at),
          next_action_due_at: input[:next_action_due_at].present? ?
            time_param!(input[:next_action_due_at], field: :next_action_due_at) : nil,
          note: optional_string(input[:note], field: :note, maximum: 1000)
        )
        render json: {
          follow_up: LabReportSerializer.follow_up(follow_up.reload),
          contact_attempt_id: result.value.id,
          task_id: result.value.clinical_task_id
        }, status: result.replayed ? :ok : :created
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
            code_system: optional_string(row[:code_system], field: "#{field}.code_system", maximum: 240),
            code_version: optional_string(row[:code_version], field: "#{field}.code_version", maximum: 80),
            value: row[:value_kind] == "absent" ? optional_string(row[:value], field: "#{field}.value", maximum: 500) : required_string!(row[:value], field: "#{field}.value", maximum: 500),
            value_kind: optional_string(row[:value_kind], field: "#{field}.value_kind", maximum: 20),
            absent_reason: optional_string(row[:absent_reason], field: "#{field}.absent_reason", maximum: 200),
            value_code: optional_string(row[:value_code], field: "#{field}.value_code", maximum: 200),
            value_code_system: optional_string(row[:value_code_system], field: "#{field}.value_code_system", maximum: 240),
            unit: optional_string(row[:unit], field: "#{field}.unit", maximum: 80),
            unit_code: optional_string(row[:supplied_unit_code].presence || row[:unit_code], field: "#{field}.unit_code", maximum: 80),
            interpretation: optional_string(row[:interpretation], field: "#{field}.interpretation", maximum: 80),
            reference_range: optional_string(row[:reference_range], field: "#{field}.reference_range", maximum: 200),
            flag: optional_string(row[:flag], field: "#{field}.flag", maximum: 80),
            performing_organization: optional_string(row[:performing_organization], field: "#{field}.performing_organization", maximum: 200),
            issuing_organization: optional_string(row[:issuing_organization], field: "#{field}.issuing_organization", maximum: 200),
            method: optional_string(row[:method], field: "#{field}.method", maximum: 200),
            resulted_at: optional_string(row[:resulted_at], field: "#{field}.resulted_at", maximum: 80),
            received_at: optional_string(row[:received_at], field: "#{field}.received_at", maximum: 80)
          }
        end
        {
          title: required_string!(input[:title], field: :title, maximum: 200),
          status: enum_param!(input[:status], field: :status, allowed: LabReportVersion::STATUSES),
          result_priority: enum_param!(input[:result_priority], field: :result_priority,
            allowed: %w[routine urgent critical]),
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

      def selected_lab_site
        site_id = session[:clinic_site_id]
        site_id.present? ? current_practice.sites.find_by(id: site_id) : nil
      end

      def visible_reports(permission)
        scope = current_practice.lab_reports
        return scope if current_ability.practice_scope_for?(permission)

        site_ids = current_ability.accessible_site_ids.select do |site_id|
          current_ability.allowed_permission?(permission, site: site_id)
        end
        scope.where(site_id: site_ids)
      end

      def authorize_report!(report, permission)
        require_capability(permission, site: report.site)
      end
    end
  end
end
