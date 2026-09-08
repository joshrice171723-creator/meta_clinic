module Clinic
  module Workforce
    class ExportBatch < ApplicationRecord
      self.table_name = "clinic_workforce_export_batches"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :configuration_version, class_name: "Clinic::Workforce::PayrollConfigurationVersion"
      belongs_to :created_by_membership, class_name: "Clinic::Membership"
      belongs_to :supersedes_batch, class_name: name, optional: true
      encrypts :csv_content
      validates :request_key, length: { in: 8..100 }
      validates :payload_digest, :source_digest, length: { is: 64 }
      validate :same_scope

      private

      def same_scope
        [site, configuration_version, created_by_membership, supersedes_batch].compact.each do |record|
          errors.add(:base, "Export references must belong to this practice") if record.practice_id != practice_id
        end
        [configuration_version, supersedes_batch].compact.each do |record|
          errors.add(:site, "must match the source location") if record.site_id != site_id
        end
      end
    end
  end
end
