module Clinic
  module Assistant
    class Context < ApplicationRecord
      self.table_name = "clinic_assistant_contexts"

      belongs_to :practice, class_name: "Clinic::Practice"
      belongs_to :actor_user, class_name: "User"
      belongs_to :membership, class_name: "Clinic::Membership"
      belongs_to :member_session, class_name: "MemberSession"
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter", optional: true
      has_many :proposals, class_name: "Clinic::Assistant::BookingProposal", foreign_key: :assistant_context_id,
        dependent: :restrict_with_error

      validates :public_id, :authorization_generation, :expires_at, presence: true
      validates :public_id, uniqueness: true
      validate :records_share_context

      def active?
        invalidated_at.nil? && expires_at.future?
      end

      private

      def records_share_context
        { actor_user: actor_user, membership: membership, site: site, patient: patient,
          member_session_user: member_session&.user }.each do |label, record|
          expected_id = label == :actor_user || label == :member_session_user ? actor_user_id : practice_id
          actual_id = label == :actor_user || label == :member_session_user ? record&.id : record&.practice_id
          errors.add(label, "must match the assistant context") if record && actual_id != expected_id
        end
        if encounter && (encounter.practice_id != practice_id || encounter.patient_id != patient_id || encounter.site_id != site_id)
          errors.add(:encounter, "must match the selected patient and location")
        end
      end
    end
  end
end
