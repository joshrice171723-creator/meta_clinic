module Clinic
  module Workforce
    class KioskEnrollment < ApplicationRecord
      self.table_name = "clinic_workforce_kiosk_enrollments"
      include Clinic::TenantScoped

      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :issued_by_membership, class_name: "Clinic::Membership"
      belongs_to :revoked_by_membership, class_name: "Clinic::Membership", optional: true
      has_many :kiosk_sessions, class_name: "Clinic::Workforce::KioskSession", dependent: :restrict_with_error

      has_paper_trail versions: { class_name: "Clinic::ModelVersion" }, skip: [ :token_digest ], meta: {
        practice_id: :practice_id, actor_reference: ->(_record) { PaperTrail.request.whodunnit },
        request_id: ->(_record) { PaperTrail.request.controller_info&.[](:request_id) },
        occurred_at: ->(_record) { Time.current },
        changed_fields: ->(record) { record.saved_changes.keys - [ "token_digest" ] }
      }

      validates :token_digest, presence: true, length: { is: 64 }, uniqueness: true
      validates :status, inclusion: { in: %w[issued enrolled revoked expired] }

      def available?(at: Current.business_time)
        status == "issued" && enrolled_at.nil? && revoked_at.nil? && expires_at > at
      end
    end
  end
end
