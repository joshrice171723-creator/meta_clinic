module Clinic
  class Membership < ApplicationRecord
    self.table_name = "clinic_memberships"
    include Clinic::TenantScoped
    include Clinic::Auditable
    belongs_to :user
    has_one :clinician_profile, class_name: "Clinic::ClinicianProfile", dependent: :restrict_with_error
    has_many :encounter_participants, class_name: "Clinic::EncounterParticipant", dependent: :restrict_with_error
    has_many :role_grants, class_name: "Clinic::RoleGrant", dependent: :restrict_with_error
    has_many :grant_events, class_name: "Clinic::RoleGrantEvent", foreign_key: :grantor_membership_id, dependent: :restrict_with_error
    validates :user_id, uniqueness: true
    scope :active, -> { where(active: true) }
  end
end
