module Clinic
  class LabUnitMappingsController < ApiController
    def show
      Clinic::Authorization.authorize!(practice: current_practice, actor: current_user, action: "facilities.read")
      render json: { configuration: Clinic::Configuration::LabUnitMappings.snapshot(practice: current_practice),
        can_write: Clinic::Authorization.allowed?(practice: current_practice, actor: current_user, action: "facilities.write") }
    end

    def update
      Clinic::Authorization.authorize!(practice: current_practice, actor: current_user, action: "facilities.write")
      input = parameter_hash!(:configuration, %i[expected_revision request_key],
        nested_arrays: { mappings: [:code_system, :code, :code_version, :dimension, { unit_codes: [] }] })
      raise ArgumentError, "mappings are required." unless input.key?(:mappings)
      raise ArgumentError, "expected_revision is required." unless input.key?(:expected_revision)
      configuration = Clinic::Configuration::LabUnitMappings.revise(practice: current_practice,
        actor: clinic_membership, mappings: input[:mappings].map(&:to_h),
        expected_revision: input[:expected_revision], request_key: input[:request_key])
      render json: { configuration:,
        current_configuration: Clinic::Configuration::LabUnitMappings.snapshot(practice: current_practice) }
    end
  end
end
