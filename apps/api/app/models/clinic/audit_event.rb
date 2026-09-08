module Clinic
  class AuditEvent < ApplicationRecord
    self.table_name = "clinic_audit_events"
    include TenantScoped

    enum :outcome, {
      attempted: "attempted",
      denied: "denied",
      prepared: "prepared",
      committed: "committed",
      released: "released",
      failed: "failed"
    }, prefix: true, validate: true

    has_many :resource_manifests, class_name: "Clinic::AuditResourceManifest", foreign_key: :audit_event_id, dependent: :restrict_with_error
    has_many :delivery_receipts, class_name: "Clinic::AuditDeliveryReceipt", foreign_key: :audit_event_id, dependent: :restrict_with_error

    scope :recent, -> { order(occurred_at: :desc) }
    validates :actor_session_reference, :action_code, :outcome, :policy_version, :occurred_at, presence: true
    before_update { throw :abort }
    before_destroy { throw :abort }
  end
end
