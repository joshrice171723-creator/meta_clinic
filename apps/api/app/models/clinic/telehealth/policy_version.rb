module Clinic
  module Telehealth
    class PolicyVersion < ApplicationRecord
      self.table_name = "clinic_telehealth_policy_versions"
      include Clinic::TenantScoped
      has_paper_trail(
        version: :audit_origin_version,
        versions: { class_name: "Clinic::ModelVersion" },
        meta: {
          practice_id: :practice_id,
          actor_reference: ->(_record) { PaperTrail.request.whodunnit },
          request_id: ->(_record) { PaperTrail.request.controller_info&.[](:request_id) },
          causal_id: ->(_record) { PaperTrail.request.controller_info&.[](:causal_id) },
          job_id: ->(_record) { PaperTrail.request.controller_info&.[](:job_id) },
          occurred_at: ->(_record) { Time.current },
          changed_fields: ->(record) {
            changes = record.saved_changes.presence || record.changes
            changes.keys
          }
        }
      )

      belongs_to :settings, class_name: "Clinic::Telehealth::Setting"
      belongs_to :created_by_membership, class_name: "Clinic::Membership"
      belongs_to :published_by_membership, class_name: "Clinic::Membership", optional: true
      has_many :visits, class_name: "Clinic::Telehealth::Visit", dependent: :restrict_with_error

      enum :status, { draft: "draft", published: "published", retired: "retired" }, validate: true
      validates :version, numericality: { only_integer: true, greater_than: 0 }
      validates :consent_title, :consent_body, :content_digest, :locale, :patient_instructions, :support_label, presence: true
      validates :content_digest, format: { with: /\A\h{64}\z/ }
      validates :join_early_minutes, :join_late_minutes, inclusion: { in: 0..120 }
      validates :max_room_minutes, inclusion: { in: 5..240 }
      validates :grant_ttl_seconds, inclusion: { in: 30..300 }
      validates :checkin_max_age_minutes, inclusion: { in: 5..1440 }
      validate :scribe_copy_complete

      def treatment_digest
        content_digest
      end

      private

      def scribe_copy_complete
        values = [ scribe_consent_title, scribe_consent_body, scribe_consent_digest ]
        if scribe_enabled?
          errors.add(:scribe_consent_body, "must be complete when Scribe is enabled") unless values.all?(&:present?)
        elsif values.any?(&:present?) && !values.all?(&:present?)
          errors.add(:scribe_consent_body, "must be complete when recording consent copy is retained")
        end
      end
    end
  end
end
