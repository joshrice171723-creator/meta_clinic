module Clinic
  module PatientPortal
    class Identity < ApplicationRecord
      self.table_name = "clinic_patient_portal_identities"
      include Clinic::TenantScoped
      include Clinic::Auditable

      enum :status, { invited: "invited", active: "active", revoked: "revoked" }, validate: true

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :user

      validates :patient_id, :user_id, :invited_at, presence: true
      validates :activated_at, presence: true, if: :active?
      validates :revoked_at, presence: true, if: :revoked?
      validate :patient_belongs_to_practice

      scope :available, -> { where(status: :active) }

      private

      def patient_belongs_to_practice
        return unless patient && practice_id
        errors.add(:patient, "must belong to this practice") unless patient.practice_id == practice_id
      end
    end
  end
end
