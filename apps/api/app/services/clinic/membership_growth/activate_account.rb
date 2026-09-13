require "digest"

module Clinic
  module MembershipGrowth
    class ActivateAccount
      class InvalidInvitation < StandardError; end
      class InvalidPassword < StandardError; end

      Result = Struct.new(:prospect, :user, keyword_init: true)

      def self.call(token:, password:, password_confirmation:, accepted_terms:, terms_version:, now: Current.business_time)
        new(token:, password:, password_confirmation:, accepted_terms:, terms_version:, now:).call
      end

      def initialize(token:, password:, password_confirmation:, accepted_terms:, terms_version:, now:)
        @token = token.to_s
        @password = password
        @password_confirmation = password_confirmation
        @accepted_terms = accepted_terms
        @terms_version = terms_version.to_s
        @now = now
      end

      def call
        raise InvalidInvitation unless accepted_terms && terms_version == Clinic::PatientPortal::Identity::TERMS_VERSION
        result = nil
        ApplicationRecord.transaction do
          prospect = MembershipProspect.lock.find_by(account_setup_token_digest: digest(token))
          raise InvalidInvitation unless prospect&.account_setup_expires_at&.>(now)
          raise InvalidInvitation unless Clinic::DeploymentAccess.practice_enabled?(prospect.practice_id)
          raise InvalidInvitation unless prospect.account_user

          user = prospect.account_user.lock!
          user.update!(password:, password_confirmation:, active: true)
          prospect.update!(account_setup_token_digest: nil, account_setup_expires_at: nil,
            account_activated_at: now, accepted_terms_version: terms_version, accepted_terms_at: now)
          Clinic::AuditRecorder.record!(practice: prospect.practice, actor: user,
            action_code: "membership_storefront.account.activate", outcome: :committed,
            resource_version_ref: "membership_prospect:#{prospect.id}")
          result = Result.new(prospect:, user:)
        end
        result
      rescue ActiveRecord::RecordInvalid => error
        if error.record.is_a?(User) &&
            error.record.errors.attribute_names.all? { |attribute| %i[password password_confirmation].include?(attribute) }
          raise InvalidPassword, error.record.errors.full_messages.to_sentence
        end

        raise InvalidInvitation
      end

      private

      attr_reader :token, :password, :password_confirmation, :accepted_terms, :terms_version, :now

      def digest(value)
        Digest::SHA256.hexdigest(value)
      end
    end
  end
end
