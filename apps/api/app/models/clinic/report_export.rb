module Clinic
  class ReportExport < ApplicationRecord
    self.table_name = "clinic_report_exports"
    include TenantScoped

    belongs_to :issued_by, class_name: "User"
    belongs_to :site, class_name: "Clinic::Site", optional: true
    validates :report_id, :request_key, :filters, :snapshot, :source_digest,
      :artifact_digest, :artifact_csv, :filename, :issued_at, presence: true
    validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN }
    before_update { throw :abort }
    before_destroy { throw :abort }

    def readonly?
      persisted?
    end
  end
end
