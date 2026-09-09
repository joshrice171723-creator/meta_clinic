module Clinic
  module Care
    class Observation < ApplicationRecord
      self.table_name = "clinic_observations"
      include Clinic::TenantScoped
      include Clinic::Auditable

      encrypts :encrypted_value

      OBSERVATION_VALUE_ATTRIBUTES = %i[numeric_value text_value coded_value unit_code missing_reason].freeze

      enum :value_kind, {
        numeric: "numeric",
        text: "text",
        coded: "coded",
        missing: "missing",
        group: "group"
      }, prefix: true, validate: true

      attr_readonly :value_binding_id

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter", optional: true
      belongs_to :author_membership, class_name: "Clinic::Membership"
      belongs_to :parent_observation, class_name: "Clinic::Care::Observation", optional: true
      has_many :child_observations, class_name: "Clinic::Care::Observation", foreign_key: :parent_observation_id, dependent: :restrict_with_error
      has_many :derived_sources, class_name: "Clinic::Care::ObservationSource", foreign_key: :derived_observation_id, dependent: :restrict_with_error
      has_many :source_links, class_name: "Clinic::Care::ObservationSource", foreign_key: :source_observation_id, dependent: :restrict_with_error

      scope :recorded, -> { order(recorded_at: :desc) }
      scope :groups, -> { where(value_kind: :group) }

      validates :code, :code_system, :code_version, :value_kind, :observed_at, :recorded_at, presence: true
      validates :value_binding_id, format: { with: /\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/ }, allow_nil: true
      before_validation :ensure_value_binding_id
      before_validation :pack_observation_value
      validate :value_shape_is_valid
      validate :same_patient_context

      def numeric_value
        observation_value(:numeric_value)
      end

      def numeric_value=(value)
        assign_observation_value(:numeric_value, value)
      end

      def text_value
        observation_value(:text_value)
      end

      def text_value=(value)
        assign_observation_value(:text_value, value)
      end

      def coded_value
        observation_value(:coded_value)
      end

      def coded_value=(value)
        assign_observation_value(:coded_value, value)
      end

      def unit_code
        observation_value(:unit_code)
      end

      def unit_code=(value)
        assign_observation_value(:unit_code, value)
      end

      def missing_reason
        observation_value(:missing_reason)
      end

      def missing_reason=(value)
        assign_observation_value(:missing_reason, value)
      end

      private

      def value_shape_is_valid
        case value_kind
        when "numeric"
          errors.add(:numeric_value, "is required") if numeric_value.blank?
          errors.add(:unit_code, "is required") if unit_code.blank?
          errors.add(:numeric_value, "must be finite") if numeric_value.present? && !finite_numeric_value?
          errors.add(:text_value, "must be blank") if text_value.present?
          errors.add(:coded_value, "must be blank") if coded_value.present?
          errors.add(:missing_reason, "must be blank") if missing_reason.present?
        when "text"
          errors.add(:text_value, "is required") if text_value.blank?
          errors.add(:numeric_value, "must be blank") if numeric_value.present?
          errors.add(:coded_value, "must be blank") if coded_value.present?
          errors.add(:unit_code, "must be blank") if unit_code.present?
          errors.add(:missing_reason, "must be blank") if missing_reason.present?
        when "coded"
          errors.add(:coded_value, "is required") if coded_value.blank?
          errors.add(:numeric_value, "must be blank") if numeric_value.present?
          errors.add(:text_value, "must be blank") if text_value.present?
          errors.add(:unit_code, "must be blank") if unit_code.present?
          errors.add(:missing_reason, "must be blank") if missing_reason.present?
        when "missing"
          errors.add(:missing_reason, "is required") if missing_reason.blank?
          errors.add(:numeric_value, "must be blank") if numeric_value.present?
          errors.add(:text_value, "must be blank") if text_value.present?
          errors.add(:coded_value, "must be blank") if coded_value.present?
          errors.add(:unit_code, "must be blank") if unit_code.present?
        when "group"
          %i[numeric_value text_value coded_value unit_code missing_reason].each do |attribute|
            errors.add(attribute, "must be blank") if public_send(attribute).present?
          end
        end
      end

      def same_patient_context
        { encounter: encounter, author_membership: author_membership, parent_observation: parent_observation }.each do |attribute, record|
          errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
          errors.add(attribute, "must belong to this patient") if record.respond_to?(:patient_id) && record.patient_id != patient_id
        end
        errors.add(:parent_observation, "cannot be itself") if parent_observation_id == id && id.present?
      end

      def assign_observation_value(attribute, value)
        @observation_value_inputs ||= {}
        @observation_value_inputs[attribute] = value
      end

      def observation_value(attribute)
        if @observation_value_inputs&.key?(attribute)
          @observation_value_inputs[attribute]
        else
          observation_value_payload[attribute.to_s]
        end
      end

      def observation_value_payload
        return {} if encrypted_value.blank?

        payload = JSON.parse(encrypted_value)
        expected_binding = {
          "version" => 1,
          "practice_id" => practice_id,
          "patient_id" => patient_id,
          "encounter_id" => encounter_id,
          "value_binding_id" => value_binding_id
        }
        unless payload.slice(*expected_binding.keys) == expected_binding
          raise ArgumentError, "Stored observation value is unavailable"
        end
        payload.fetch("value")
      rescue JSON::ParserError, KeyError, TypeError
        raise ArgumentError, "Stored observation value is unavailable"
      end

      def pack_observation_value
        return if @observation_value_inputs.blank?

        if value_kind == "group"
          self.encrypted_value = nil
          return
        end

        value = OBSERVATION_VALUE_ATTRIBUTES.index_with do |attribute|
          if @observation_value_inputs.key?(attribute)
            @observation_value_inputs[attribute]
          else
            observation_value_payload[attribute.to_s]
          end
        end
        value["numeric_value"] = value.delete(:numeric_value)&.to_s if value.key?(:numeric_value)
        value = value.transform_keys(&:to_s)
        self.encrypted_value = JSON.generate(
          "version" => 1,
          "practice_id" => practice_id,
          "patient_id" => patient_id,
          "encounter_id" => encounter_id,
          "value_binding_id" => value_binding_id,
          "value" => value
        )
      end

      def ensure_value_binding_id
        self.value_binding_id ||= SecureRandom.uuid
      end

      def finite_numeric_value?
        BigDecimal(numeric_value.to_s).finite?
      rescue ArgumentError
        false
      end
    end
  end
end
