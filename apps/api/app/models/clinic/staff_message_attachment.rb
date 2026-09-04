module Clinic
  class StaffMessageAttachment < ApplicationRecord
    self.table_name = "clinic_staff_message_attachments"
    include TenantScoped
    include Auditable

    SCAN_STATES = %w[quarantined clean rejected expired].freeze

    belongs_to :message, class_name: "Clinic::StaffMessage"
    belongs_to :created_by_membership, class_name: "Clinic::Membership"

    validates :storage_key, :content_type, :checksum, presence: true
    validates :byte_size, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 10.megabytes }
    validates :scan_state, inclusion: { in: SCAN_STATES }
    validate :related_records_belong_to_practice

    private

    def related_records_belong_to_practice
      { message: message, created_by_membership: created_by_membership }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
    end
  end
end
