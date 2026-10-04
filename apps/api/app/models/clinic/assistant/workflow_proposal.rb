module Clinic
  module Assistant
    class WorkflowProposal < ApplicationRecord
      self.table_name = "clinic_assistant_workflow_proposals"

      STATES = %w[pending confirmed expired invalidated conflicted].freeze

      belongs_to :practice, class_name: "Clinic::Practice"
      belongs_to :workflow_context, class_name: "Clinic::Assistant::WorkflowContextRecord"
      belongs_to :actor_user, class_name: "User"
      belongs_to :membership, class_name: "Clinic::Membership"
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :patient, class_name: "Clinic::Care::Patient", optional: true
      belongs_to :encounter, class_name: "Clinic::Encounter", optional: true

      encrypts :arguments, :preview, :result_payload

      before_validation :assign_public_id, on: :create
      validates :public_id, :operation_key, :status, :expires_at, presence: true
      validates :public_id, uniqueness: true
      validates :status, inclusion: { in: STATES }
      validate :confirmation_fields_match_state
      validate :records_share_context

      def arguments_data
        decode_json(arguments)
      end

      def arguments_data=(value)
        self.arguments = JSON.generate(value)
      end

      def preview_data
        decode_json(preview)
      end

      def preview_data=(value)
        self.preview = JSON.generate(value)
      end

      def result_data
        decode_json(result_payload)
      end

      def result_data=(value)
        self.result_payload = JSON.generate(value)
      end

      private

      def assign_public_id
        self.public_id ||= SecureRandom.uuid
      end

      def decode_json(value)
        value.present? ? JSON.parse(value) : nil
      rescue JSON::ParserError
        nil
      end

      def confirmation_fields_match_state
        confirmed = status == "confirmed"
        errors.add(:confirmed_at, "must match confirmation state") unless confirmed == confirmed_at.present?
        errors.add(:result_payload, "must match confirmation state") unless confirmed == result_payload.present?
      end

      def records_share_context
        { actor_user: actor_user, membership: membership, site: site, patient: patient,
          encounter: encounter }.each do |label, record|
          next unless record

          expected_id = label == :actor_user ? actor_user_id : practice_id
          actual_id = label == :actor_user ? record.id : record.practice_id
          errors.add(label, "must match the assistant proposal") if actual_id != expected_id
        end
        unless workflow_context_id == workflow_context&.id && workflow_context&.practice_id == practice_id &&
            workflow_context&.actor_user_id == actor_user_id && workflow_context&.membership_id == membership_id &&
            workflow_context&.site_id == site_id && workflow_context&.member_session_reference == member_session_reference &&
            workflow_context&.patient_id == patient_id &&
            workflow_context&.encounter_id == encounter_id
          errors.add(:workflow_context, "must match the assistant proposal")
        end
        if encounter && (patient.nil? || encounter.patient_id != patient_id || encounter.site_id != site_id)
          errors.add(:encounter, "must match the selected patient and location")
        end
      end
    end
  end
end
