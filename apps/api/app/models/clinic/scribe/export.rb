module Clinic
  module Scribe
    class Export < ApplicationRecord
      self.table_name = "clinic_scribe_exports"
      include TenantScoped
      include Auditable

      belongs_to :draft, class_name: "Clinic::Scribe::Draft"
      belongs_to :actor, class_name: "User"

      validates :destination, inclusion: { in: %w[parent_record_adapter] }
      validates :status, inclusion: { in: %w[exported failed] }
      validates :version_checksum, :idempotency_key, :payload_digest, presence: true
      validate :draft_belongs_to_practice

      private

      def draft_belongs_to_practice
        errors.add(:draft, "must belong to the selected practice") if draft && draft.practice_id != practice_id
      end
    end
  end
end
