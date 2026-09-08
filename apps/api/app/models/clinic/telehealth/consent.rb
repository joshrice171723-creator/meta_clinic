module Clinic
  module Telehealth
    class Consent < ApplicationRecord
      self.table_name = "clinic_telehealth_consents"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :visit, class_name: "Clinic::Telehealth::Visit"
      belongs_to :participant, class_name: "Clinic::Telehealth::Participant"
      belongs_to :policy_version, class_name: "Clinic::Telehealth::PolicyVersion"
      belongs_to :supersedes_consent, class_name: "Clinic::Telehealth::Consent", optional: true

      enum :purpose, { telehealth: "telehealth", scribe_recording: "scribe_recording" }, validate: true
      enum :decision, { accepted: "accepted", declined: "declined", withdrawn: "withdrawn" }, validate: true
      enum :method, { portal_authenticated: "portal_authenticated", staff_authenticated: "staff_authenticated" }, validate: true
      validates :sequence, numericality: { only_integer: true, greater_than: 0 }
      validates :decided_at, presence: true
      validates :policy_content_digest, format: { with: /\A\h{64}\z/ }
    end
  end
end
