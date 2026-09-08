module Clinic
  module Scribe
    class Event < ApplicationRecord
      self.table_name = "clinic_scribe_events"
      include TenantScoped
      include AppendOnly

      belongs_to :encounter, class_name: "Clinic::Scribe::Encounter"
      belongs_to :draft, class_name: "Clinic::Scribe::Draft", optional: true
      belongs_to :actor, class_name: "User"

      validates :event_type, :resource_type, :resource_id, :created_at, presence: true
    end
  end
end
