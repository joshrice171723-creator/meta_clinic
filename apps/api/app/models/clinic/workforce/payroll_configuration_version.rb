module Clinic
  module Workforce
    class PayrollConfigurationVersion < ApplicationRecord
      self.table_name = "clinic_workforce_payroll_configuration_versions"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :created_by_membership, class_name: "Clinic::Membership"
      validates :name, presence: true, length: { maximum: 100 }
      validates :provider, inclusion: { in: %w[custom_file] }
      validates :effective_from, presence: true
      validates :revision, numericality: { only_integer: true, greater_than: 0 }
      validate :same_practice

      private

      def same_practice
        [site, created_by_membership].compact.each do |record|
          errors.add(:base, "Payroll configuration must belong to this practice") if record.practice_id != practice_id
        end
      end
    end
  end
end
