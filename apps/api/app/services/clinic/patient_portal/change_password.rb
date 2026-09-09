module Clinic
  module PatientPortal
    class ChangePassword
      class InvalidCurrentPassword < StandardError; end
      class InvalidPassword < StandardError; end

      def self.call(identity:, current_password:, password:, password_confirmation:, session:, now: Current.business_time)
        replacement_session = nil
        ApplicationRecord.transaction do
          identity = Identity.active.lock.find_by!(id: identity.id, user_id: identity.user_id)
          user = User.lock.find(identity.user_id)
          raise InvalidCurrentPassword unless user.authenticate(current_password)

          user.update!(password: password, password_confirmation: password_confirmation)
          replacement_session = user.member_sessions.create!(expires_at: now + MemberSession::MAX_DURATION)
          Clinic::AuditRecorder.record!(practice: identity.practice, actor: user,
            action_code: "patient_portal.identity.password_change", outcome: :committed,
            resource_version_ref: "patient_portal_identity:#{identity.id}")
        end
        session[:member_session_id] = replacement_session.id
        session[:patient_portal_identity_id] = identity.id
        replacement_session
      rescue ActiveRecord::RecordInvalid => error
        if error.record.is_a?(User) &&
            error.record.errors.attribute_names.all? { |attribute| %i[password password_confirmation].include?(attribute) }
          raise InvalidPassword, error.record.errors.full_messages.to_sentence
        end

        raise
      end
    end
  end
end
