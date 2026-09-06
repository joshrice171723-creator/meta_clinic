module Clinic
  module Workforce
    class PunchChallenge < ApplicationRecord
      self.table_name = "clinic_workforce_punch_challenges"
      include Clinic::TenantScoped

      belongs_to :kiosk_session, class_name: "Clinic::Workforce::KioskSession"
      belongs_to :employment, class_name: "Clinic::Workforce::Employment"
      has_one :punch, class_name: "Clinic::Workforce::Punch", dependent: :restrict_with_error

      has_paper_trail versions: { class_name: "Clinic::ModelVersion" }, skip: [ :challenge_digest ], meta: {
        practice_id: :practice_id, actor_reference: ->(_record) { PaperTrail.request.whodunnit },
        request_id: ->(_record) { PaperTrail.request.controller_info&.[](:request_id) },
        occurred_at: ->(_record) { Time.current },
        changed_fields: ->(record) { record.saved_changes.keys - [ "challenge_digest" ] }
      }

      validates :challenge_digest, presence: true, length: { is: 64 }, uniqueness: true
      validates :permitted_transitions, presence: true
      validates :failed_attempts, inclusion: { in: 0..20 }

      def usable?(at: Time.current)
        consumed_at.nil? && expires_at > at && failed_attempts < 5
      end

      def credential_id
        marker = permitted_transitions.find { |value| value.to_s.start_with?("badge:") }
        marker&.delete_prefix("badge:")&.to_i
      end

      def transitions
        permitted_transitions.grep_v(/\Abadge:/)
      end
    end
  end
end
