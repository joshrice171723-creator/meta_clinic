module Clinic
  module Scheduling
    class Resource < ApplicationRecord
      self.table_name = "clinic_scheduling_resources"
      include TenantScoped
      include Auditable
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :room, class_name: "Clinic::Room", optional: true
      validates :name, presence: true, length: { maximum: 120 }
      validates :kind, inclusion: { in: %w[chair equipment] }
      validate do
        errors.add(:site, "must belong to this practice") unless site&.practice_id == practice_id
        errors.add(:room, "must be a physical room at this site") if room && (room.site_id != site_id || room.practice_id != practice_id || room.kind != "physical")
        errors.add(:room, "is required for a chair") if kind == "chair" && room.nil?
      end
      def snapshot
        { id: id, name: name, kind: kind, room_id: room_id, active: active, version: lock_version }
      end
    end
  end
end
