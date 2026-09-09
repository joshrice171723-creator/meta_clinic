module Clinic
  module Care
    class ObservationSource < ApplicationRecord
      self.table_name = "clinic_observation_sources"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :derived_observation, class_name: "Clinic::Care::Observation"
      belongs_to :source_observation, class_name: "Clinic::Care::Observation"

      validates :formula_version, presence: true
      validate :same_patient_links
      validate :not_self_link

      private

      def same_patient_links
        { derived_observation: derived_observation, source_observation: source_observation }.each do |attribute, record|
          errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
          errors.add(attribute, "must belong to this patient") if record && record.patient_id != patient_id
        end
      end

      def not_self_link
        errors.add(:source_observation, "cannot be the derived observation") if derived_observation_id.present? && derived_observation_id == source_observation_id
      end
    end
  end
end
