module Clinic
  module Care
    # Routes deliberately remain absent until the reviewed field/action contract is accepted.
    class ChartCoverageRecordsController < Clinic::ApiController
      before_action -> { require_capability("notes.write", any_site: true) }

      def create
        patient, encounter, site, type, input = chart_context!
        record = ChartCoverageRecords.create(
          practice: current_practice, actor: current_user, patient:, encounter:, site:, type:,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          attributes: input[:attributes] || {}
        )
        render json: { chart_record: ChartCoverageRecordSerializer.call(record) }, status: :created
      end

      def update
        patient, encounter, site, type, input = chart_context!
        klass = ChartCoverageRecords.record_class!(type)
        record = klass.where(practice: current_practice, patient:, encounter:, site:)
          .find(requested_id!(params[:id], :id))
        updated = ChartCoverageRecords.update(
          practice: current_practice, actor: current_user, record:, type:,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          expected_version: input[:expected_version], attributes: input[:attributes] || {}
        )
        render json: { chart_record: ChartCoverageRecordSerializer.call(updated) }
      end

      private

      def chart_context!
        raw = params.require(:chart_record)
        unless raw.is_a?(ActionController::Parameters)
          raise Clinic::Api::RequestParameters::Invalid.new("chart_record must be an object.", field: :chart_record)
        end
        allowed = %w[request_key expected_version type patient_id encounter_id site_id attributes]
        unknown = raw.keys - allowed
        if unknown.any?
          raise Clinic::Api::RequestParameters::Invalid.new("#{unknown.first} is not a supported field.", field: unknown.first)
        end
        input = raw.permit(:request_key, :expected_version, :type, :patient_id, :encounter_id, :site_id,
          attributes: ChartCoverageRecords::ATTRIBUTE_KEYS)
        patient = current_practice.patients.accessible_by(current_ability, :read)
          .find(requested_id!(input[:patient_id], :patient_id))
        encounter = input[:encounter_id].present? ? current_practice.encounters.where(patient:)
          .find(requested_id!(input[:encounter_id], :encounter_id)) : nil
        site = input[:site_id].present? ? current_practice.sites.find(requested_id!(input[:site_id], :site_id)) : encounter&.site
        [ patient, encounter, site, required_string!(input[:type], field: :type, maximum: 80), input ]
      end
    end
  end
end
