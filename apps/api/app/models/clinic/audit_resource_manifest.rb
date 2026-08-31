module Clinic
  class AuditResourceManifest < ApplicationRecord
    self.table_name = "clinic_audit_resource_manifests"
    include TenantScoped
    include AppendOnly

    belongs_to :audit_event, class_name: "Clinic::AuditEvent"
    validates :protected_resource_version_ref, presence: true
    validate :event_belongs_to_practice

    private

    def event_belongs_to_practice
      errors.add(:audit_event, "must belong to this practice") if audit_event && audit_event.practice_id != practice_id
    end
  end
end
