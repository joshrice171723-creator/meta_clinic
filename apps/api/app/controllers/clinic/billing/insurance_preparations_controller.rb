module Clinic
  module Billing
    class InsurancePreparationsController < Clinic::ApiController
      before_action :load_context

      def index
        response.headers["Cache-Control"] = "no-store"
        coverage = @patient.coverage_versions.where(site: @site)
        records, pagination = paginated_records(coverage, order: { version: :desc }, default_per_page: 10)
        requests, request_pagination = paginated_records(events.where(request_event_id: nil), default_per_page: 10)
        invoices, invoice_pagination = paginated_records(Clinic::Invoice.where(practice: current_practice, patient: @patient, status: "posted"), default_per_page: 10)
        features = Clinic::Configuration::PracticeFeatures.snapshot(practice: current_practice, site: @site)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "billing.read", outcome: :released,
          resource_version_ref: "Clinic::Care::Patient/#{@patient.id}")
        render json: {
          patient_id: @patient.id, site_id: @site.id,
          enabled: features[:insurance_workflows_enabled] && features[:finalized],
          can_write: current_ability.allowed_permission?("billing.write"),
          latest_version: @patient.coverage_versions.maximum(:version) || 0,
          coverage: records.map { |record| coverage_json(record) }, pagination:,
          requests: requests.map { |record| event_json(record) }, request_pagination:,
          invoices: invoices.map { |invoice| { id: invoice.id, currency: invoice.currency, created_at: invoice.created_at } }, invoice_pagination:
        }
      end

      def show
        response.headers["Cache-Control"] = "no-store"
        request = events.where(request_event_id: nil).find(requested_id!(params[:id], :id))
        history, pagination = paginated_records(events.where(request_event_id: request.id))
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "billing.read", outcome: :released,
          resource_version_ref: "Clinic::InsuranceWorkflowEvent/#{request.id}")
        render json: { request: event_json(request), events: history.map { |record| event_json(record) }, pagination: }
      end

      def create_coverage
        input = parameter_hash!(:insurance, %i[request_key expected_version] + InsurancePreparation::COVERAGE_FIELDS.map(&:to_sym))
        record = InsurancePreparation.save_coverage(**context,
          input: input.except(:request_key, :expected_version).to_h,
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version, max: 2_147_483_646), request_key: input[:request_key])
        render json: { patient_id: @patient.id, site_id: @site.id, request_key: input[:request_key], coverage: coverage_json(record) }, status: :created
      end

      def create
        input = parameter_hash!(:insurance, %i[request_key coverage_id kind invoice_id] + InsurancePreparation::REQUEST_FIELDS.map(&:to_sym))
        record = InsurancePreparation.prepare(**context, coverage_id: requested_id!(input[:coverage_id], :coverage_id),
          kind: input[:kind].to_s, invoice_id: optional_id(input[:invoice_id], :invoice_id),
          input: input.except(:request_key, :coverage_id, :kind, :invoice_id).to_h, request_key: input[:request_key])
        render json: { patient_id: @patient.id, site_id: @site.id, request_key: input[:request_key], event: event_json(record) }, status: :created
      end

      def record_response
        input = parameter_hash!(:insurance, %i[request_key expected_event_id state source] + InsurancePreparation::RESPONSE_FIELDS.map(&:to_sym))
        record = InsurancePreparation.record_response(**context, request_id: requested_id!(params[:id], :id),
          expected_event_id: requested_id!(input[:expected_event_id], :expected_event_id), state: input[:state].to_s, source: input[:source].to_s,
          input: input.except(:request_key, :expected_event_id, :state, :source).to_h, request_key: input[:request_key])
        render json: { patient_id: @patient.id, site_id: @site.id, request_key: input[:request_key], event: event_json(record) }, status: :created
      end

      private

      def load_context
        @patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
        @site = current_clinic_site
        raise ArgumentError, "Choose a clinic location before opening insurance preparation." unless @site
        InsurancePreparation.authorize!(**context)
      end

      def context
        { practice: current_practice, actor: current_user, patient: @patient, site: @site }
      end

      def events
        Clinic::InsuranceWorkflowEvent.where(practice: current_practice, patient: @patient, site: @site)
      end

      def coverage_json(record)
        { id: record.id, version: record.version, site_id: record.site_id, details: record.preparation_details,
          recorded_at: record.created_at, recorded_by_id: record.recorded_by_id }
      end

      def event_json(record)
        latest = record.request_event_id ? record : events.where(request_event_id: record.id).order(:id).last || record
        { id: record.id, coverage_id: record.coverage_version_id, request_event_id: record.request_event_id,
          invoice_id: record.invoice_id, insurance_claim_id: record.insurance_claim_id, kind: record.kind,
          state: record.state, source: record.source, details: record.evidence, recorded_at: record.created_at,
          recorded_by_id: record.recorded_by_id, latest_event_id: latest.id, latest_state: latest.state, latest_source: latest.source }
      end
    end
  end
end
