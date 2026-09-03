module Clinic
  module Care
    class PatientMembership < ApplicationRecord
      self.table_name = "clinic_patient_memberships"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      enum :status, { member: "member", nonmember: "nonmember" }, validate: true

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"

      scope :latest_as_of, ->(at = Time.current) {
        where("effective_from <= ?", at)
          .select("DISTINCT ON (patient_id) clinic_patient_memberships.*")
          .order(:patient_id, effective_from: :desc, version: :desc, id: :desc)
      }

      validates :version, numericality: { only_integer: true, greater_than: 0 }
      validates :effective_from, presence: true
      validates :effective_until, comparison: { greater_than: :effective_from }, allow_nil: true

      def effective_at?(at = Time.current)
        effective_from <= at && (effective_until.nil? || effective_until > at)
      end

      def version
        self[:version]
      end

      def version=(value)
        self[:version] = value
      end
    end
  end
end
