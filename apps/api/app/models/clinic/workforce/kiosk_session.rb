module Clinic
  module Workforce
    class KioskSession < ApplicationRecord
      self.table_name = "clinic_workforce_kiosk_sessions"
      include Clinic::TenantScoped

      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :kiosk_enrollment, class_name: "Clinic::Workforce::KioskEnrollment"
      has_many :punch_challenges, class_name: "Clinic::Workforce::PunchChallenge", dependent: :restrict_with_error
      has_many :punches, class_name: "Clinic::Workforce::Punch", dependent: :restrict_with_error

      has_paper_trail versions: { class_name: "Clinic::ModelVersion" }, skip: [ :session_digest ], meta: {
        practice_id: :practice_id, actor_reference: ->(_record) { PaperTrail.request.whodunnit },
        request_id: ->(_record) { PaperTrail.request.controller_info&.[](:request_id) },
        occurred_at: ->(_record) { Time.current },
        changed_fields: ->(record) { record.saved_changes.keys - [ "session_digest" ] }
      }

      validates :session_digest, presence: true, length: { is: 64 }, uniqueness: true
      validates :status, inclusion: { in: %w[active revoked expired] }

      def active?(at: Time.current)
        status == "active" && revoked_at.nil? && expires_at > at && kiosk_enrollment.status == "enrolled"
      end
    end
  end
end
