module Clinic
  module Scheduling
    class ReferralReceiptsController < Clinic::ApiController
      before_action :load_context

      def index
        response.headers["Cache-Control"] = "no-store"
        records, pagination = paginated_records(scope)
        offerings, offering_pagination = paginated_records(current_practice.service_offerings.joins(:offering_sites).where(clinic_service_offering_sites: { site_id: @site.id }).where(status: "published"))
        AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "patients.read", outcome: :released, resource_version_ref: "Clinic::Care::Patient/#{@patient.id}")
        render json: { patient_id: @patient.id, site_id: @site.id, receipts: records.map { |record| serialize(record) }, pagination:,
          offerings: offerings.map { |offering| { id: offering.id, name: offering.name, required: offering.referral_required, instructions: offering.referral_instructions, latest_receipt_id: scope.where(service_offering: offering).maximum(:id) } }, offering_pagination: }
      end

      def create
        input = parameter_hash!(:referral, %i[request_key service_offering_id expected_receipt_id state received_on valid_until source reference note])
        record = ReferralReceipts.record(**context, offering_id: requested_id!(input[:service_offering_id], :service_offering_id),
          expected_receipt_id: optional_id(input[:expected_receipt_id], :expected_receipt_id), state: input[:state].to_s,
          received_on: input[:received_on].present? ? date_param!(input[:received_on], field: :received_on) : nil,
          valid_until: input[:valid_until].present? ? date_param!(input[:valid_until], field: :valid_until) : nil,
          details: input.slice(:source, :reference, :note).to_h.stringify_keys, request_key: input[:request_key])
        render json: { patient_id: @patient.id, site_id: @site.id, request_key: input[:request_key], receipt: serialize(record) }, status: :created
      end

      private

      def load_context
        @patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
        @site = current_clinic_site
        raise ArgumentError, "Choose a location before recording referrals." unless @site
        ReferralReceipts.authorize!(**context)
      end

      def context
        { practice: current_practice, actor: current_user, patient: @patient, site: @site }
      end

      def scope
        Clinic::ReferralReceipt.where(practice: current_practice, patient: @patient, site: @site)
      end

      def serialize(record)
        { id: record.id, service_offering_id: record.service_offering_id, state: record.state, received_on: record.received_on,
          valid_until: record.valid_until, prior_receipt_id: record.prior_receipt_id, details: JSON.parse(record.details),
          recorded_at: record.created_at, recorded_by_id: record.recorded_by_id, current: scope.where(service_offering_id: record.service_offering_id).maximum(:id) == record.id }
      end
    end
  end
end
