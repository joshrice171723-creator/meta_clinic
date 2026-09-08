module Clinic
  module Telehealth
    class Command < ApplicationRecord
      self.table_name = "clinic_telehealth_commands"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :visit, class_name: "Clinic::Telehealth::Visit"
      belongs_to :room_attempt, class_name: "Clinic::Telehealth::RoomAttempt", optional: true
      belongs_to :participant, class_name: "Clinic::Telehealth::Participant", optional: true

      enum :kind, { create_room: "create_room", end_room: "end_room", extend_room: "extend_room",
        eject_participant: "eject_participant", reconcile_room: "reconcile_room", delete_room: "delete_room" }, validate: true
      enum :status, { pending: "pending", leased: "leased", succeeded: "succeeded", failed: "failed",
        unknown: "unknown", suppressed: "suppressed" }, validate: true
      validates :dedupe_key, :available_at, presence: true
      validates :attempt_count, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    end
  end
end
