module Clinic
  module Care
    class PatientAddressesController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }

      def index
        patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
        addresses = patient.address_versions.chronological
        records, pagination = paginated_records(addresses, order: { version: :desc, id: :desc })
        render json: { address_versions: records.map { |address| address_json(address, patient) }, pagination: pagination }
      end

      def create
        require_capability("patients.write")
        return if performed?
        input = parameter_hash!(:address_version, %i[encrypted_address make_primary])
        patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
        address = Clinic::Care::AddPatientAddress.call(
          practice: current_practice,
          actor: current_user,
          patient: patient,
          encrypted_address: required_string!(input[:encrypted_address], field: :encrypted_address, maximum: 20_000),
          make_primary: boolean_or_default(input[:make_primary], field: :make_primary)
        )
        render json: { address_version: address_json(address, patient.reload) }, status: :created
      end

      private

      def address_json(address, patient)
        {
          id: address.id,
          patient_id: patient.id,
          version: address.version,
          primary: patient.primary_address_version_id == address.id,
          created_at: address.created_at
        }
      end
    end
  end
end
