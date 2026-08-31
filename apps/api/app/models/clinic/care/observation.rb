module Clinic
  module Care
    class Observation < ApplicationRecord
      self.table_name = "clinic_observations"
      include Clinic::TenantScoped
      include Clinic::Auditable

      enum :value_kind, {
        numeric: "numeric",
        text: "text",
        coded: "coded",
        missing: "missing",
        group: "group"
      }, prefix: true, validate: true

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
      validate :value_shape_is_valid
      validate :same_patient_context

      private

      def value_shape_is_valid
        case value_kind
        when "numeric"
          errors.add(:numeric_value, "is required") if numeric_value.nil?
          errors.add(:unit_code, "is required") if unit_code.blank?
          errors.add(:numeric_value, "must be finite") if numeric_value && !numeric_value.finite?
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
    end
  end
end
