module Clinic
  module Care
    class PrescriptionOrderSeriesController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }

      def index
        patient = current_practice.patients.accessible_by(current_ability, :read)
          .find(requested_id!(params[:patient_id], :patient_id))
        table = MedicationRequestRevision.table_name
        orders = MedicationRequestRevision.where(practice: current_practice, patient:)
          .select("DISTINCT ON (#{table}.series_id) #{table}.*")
          .order(Arel.sql("#{table}.series_id, #{table}.version_number DESC, #{table}.id DESC"))
          .to_a
          .select { |order| Ability.new(current_user, practice: current_practice).allowed_permission?("clinical_records.read", site: order.site) }
          .sort_by { |order| [ order.recorded_at, order.id ] }.reverse.first(100)
        render json: { prescription_orders: orders.map { |order| serialize(order) } }
      end

      private

      def serialize(order)
        {
          id: order.id, series_id: order.series_id, version_number: order.version_number, status: order.status,
          medication_name: order.medication_name, pharmacy_name: order.pharmacy_name,
          pharmacy_location: order.pharmacy_location, recorded_at: order.recorded_at.iso8601
        }
      end
    end
  end
end
