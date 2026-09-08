module Clinic
  module Workforce
    class Punch < ApplicationRecord
      self.table_name = "clinic_workforce_punches"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      EVENTS = %w[clock_in break_start break_end clock_out].freeze

      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :employment, class_name: "Clinic::Workforce::Employment"
      belongs_to :kiosk_session, class_name: "Clinic::Workforce::KioskSession", optional: true
      belongs_to :punch_challenge, class_name: "Clinic::Workforce::PunchChallenge", optional: true

      validates :event_type, inclusion: { in: EVENTS }
      validates :source, inclusion: { in: %w[kiosk manager_correction] }
      validates :request_key, :correlation_id, presence: true, length: { is: 36 }
      validates :payload_digest, presence: true, length: { is: 64 }
      validates :request_key, uniqueness: { scope: :practice_id }
      validates :time_zone, :occurred_at_utc, :local_date, :received_at, presence: true
    end
  end
end
