module Clinic
  module Care
    class PharmacyDestinationsController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("clinical_records.read", "medication_requests.write", any_site: true) }, only: :index
      before_action -> { require_capability("medication_requests.write", any_site: true) }, only: :create

      def index
        destinations = PharmacyDestination.where(practice: current_practice, active: true).order(:name, :city, :id).limit(500)
        render json: { pharmacy_destinations: destinations.map { |destination| serialize(destination) } }
      end

      def create
        input = parameter_hash!(:pharmacy_destination,
          %i[name address_line1 address_line2 city state_code postal_code phone_number pharmacy_identifier request_key])
        values = {
          name: required_string!(input[:name], field: :name, maximum: 240),
          address_line1: required_string!(input[:address_line1], field: :address_line1, maximum: 240),
          address_line2: optional_string(input[:address_line2], field: :address_line2, maximum: 240),
          city: required_string!(input[:city], field: :city, maximum: 120),
          state_code: required_string!(input[:state_code], field: :state_code, maximum: 2).upcase,
          postal_code: required_string!(input[:postal_code], field: :postal_code, maximum: 16),
          phone_number: optional_string(input[:phone_number], field: :phone_number, maximum: 100),
          pharmacy_identifier: optional_string(input[:pharmacy_identifier], field: :pharmacy_identifier, maximum: 100)
        }
        result = Clinic::Idempotency.execute(
          practice: current_practice, actor: current_user, operation_code: "pharmacy_destination.create",
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160), payload: values,
          authorization_action: "medication_requests.write",
          authorization: -> { require_capability("medication_requests.write", any_site: true) },
          result_resource: ->(destination) { destination },
          resource_resolver: ->(practice:, receipt:) { PharmacyDestination.find_by(practice_id: practice.id, id: receipt.resource_id) }
        ) do
          PharmacyDestination.create!(practice: current_practice, **values)
        end
        destination = result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
        render json: { pharmacy_destination: serialize(destination) }, status: :created
      end

      private

      def serialize(destination)
        destination.snapshot.merge(active: destination.active)
      end
    end
  end
end
