module Clinic
  module Workforce
    class BadgeCredential < ApplicationRecord
      self.table_name = "clinic_workforce_badge_credentials"
      include Clinic::TenantScoped

      belongs_to :employment, class_name: "Clinic::Workforce::Employment"
      belongs_to :issued_by_membership, class_name: "Clinic::Membership"
      belongs_to :revoked_by_membership, class_name: "Clinic::Membership", optional: true
      belongs_to :replaced_by, class_name: name, optional: true

      has_paper_trail versions: { class_name: "Clinic::ModelVersion" },
        skip: %i[secret_digest pin_digest],
        meta: {
          practice_id: :practice_id,
          actor_reference: ->(_record) { PaperTrail.request.whodunnit },
          request_id: ->(_record) { PaperTrail.request.controller_info&.[](:request_id) },
          occurred_at: ->(_record) { Time.current },
          changed_fields: ->(record) { record.saved_changes.keys - %w[secret_digest pin_digest] }
        }

      validates :secret_digest, presence: true, length: { is: 64 }, uniqueness: true
      validates :format, inclusion: { in: %w[code128] }
      validates :status, inclusion: { in: %w[issued revoked replaced] }
      validate :revocation_fields_are_consistent

      scope :active, -> { where(status: "issued", revoked_at: nil) }

      def active?
        status == "issued" && revoked_at.nil?
      end

      def pin_matches?(pin)
        return true if pin_digest.blank?
        return false if pin.blank?

        BCrypt::Password.new(pin_digest).is_password?(pin.to_s)
      rescue BCrypt::Errors::InvalidHash
        false
      end

      private

      def revocation_fields_are_consistent
        return if status == "issued" && revoked_at.nil? && revoked_by_membership_id.nil?
        return if status != "issued" && revoked_at.present? && revoked_by_membership_id.present?

        errors.add(:status, "does not match its revocation details")
      end
    end
  end
end
