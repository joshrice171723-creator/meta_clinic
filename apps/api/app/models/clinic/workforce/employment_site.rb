module Clinic
  module Workforce
    class EmploymentSite < ApplicationRecord
      self.table_name = "clinic_workforce_employment_sites"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :employment, class_name: "Clinic::Workforce::Employment"
      belongs_to :site, class_name: "Clinic::Site"

      validates :effective_from, presence: true
      validate :related_records_belong_to_practice
      validate :effective_window_is_ordered

      scope :active, -> { where(active: true) }
      scope :effective_at, ->(at) {
        where("effective_from <= ? AND (effective_until IS NULL OR effective_until > ?)", at, at)
      }

      private

      def related_records_belong_to_practice
        { employment: employment, site: site }.each do |attribute, record|
          errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
        end
      end

      def effective_window_is_ordered
        return unless effective_from && effective_until

        errors.add(:effective_until, "must be after the start") unless effective_until > effective_from
      end
    end
  end
end
