require "digest"
require "securerandom"

module Clinic
  module MembershipGrowth
    class PrepareAccount
      Result = Struct.new(:prospect, :token, :delivered, :replayed, keyword_init: true)

      def self.call(practice:, version_id:, selections:, display_name:, email_address:, phone_number:, source:,
        outreach_consent:, request_key:, date_of_birth: nil, now: Current.business_time)
        new(practice:, version_id:, selections:, display_name:, email_address:, phone_number:, source:,
          outreach_consent:, request_key:, date_of_birth:, now:).call
      end

      def initialize(practice:, version_id:, selections:, display_name:, email_address:, phone_number:, source:,
        outreach_consent:, request_key:, date_of_birth:, now:)
        @practice = practice
        @input = { version_id:, selections:, display_name:, email_address:, phone_number:, source:,
          outreach_consent:, request_key: }
        @now = now
        @date_of_birth = Clinic::Care::BirthDate.parse!(date_of_birth, on: now.to_date, minimum_age: 18)
      end

      def call
        existing_setup = practice.membership_prospects.where(intent_type: "purchase", account_activated_at: nil)
          .where.not(account_user_id: nil).find_by(email_digest: ContactDigest.call(
            practice_id: practice.id, value: input[:email_address].to_s.strip.downcase))
        capture_input = input
        if existing_setup && existing_setup.date_of_birth == @date_of_birth
          # CaptureProspect compares the entire original intent fingerprint;
          # this recovers only the same incomplete signup, never merges people.
          capture_input = input.merge(request_key: existing_setup.request_key)
        end
        captured = CaptureProspect.call(practice: practice, **capture_input, intent_type: "purchase")
        prospect = captured.prospect
        token = nil
        delivered = false
        ApplicationRecord.transaction do
          prospect.lock!
          if prospect.date_of_birth && prospect.date_of_birth != @date_of_birth
            raise CaptureProspect::Conflict, "That request key was already used for a different birth date."
          end
          prospect.update!(date_of_birth: @date_of_birth) unless prospect.date_of_birth
          raise ArgumentError, "This membership purchase is already recorded. Sign in to the patient portal." if prospect.agreement_id
          user = prospect.account_user || create_account_user!(prospect)
          if prospect.follow_up_state == "not_required"
            prospect.update!(follow_up_state: "open", follow_up_due_at: now)
          end
          raise ArgumentError, "An account already uses this email address. Sign in to continue." unless user.email_address == prospect.email_address

          if prospect.account_activated_at
            raise ArgumentError, "This account is already active. Sign in to continue your membership enrollment."
          end

          if prospect.account_setup_token_digest.blank? || prospect.account_setup_expires_at.blank? ||
              prospect.account_setup_expires_at <= now || prospect.account_setup_sent_at.nil?
            token = SecureRandom.urlsafe_base64(48)
            prospect.update!(account_setup_token_digest: digest(token), account_setup_expires_at: now + 30.minutes,
              account_setup_sent_at: nil)
          end
          token ||= ""
          delivered = prospect.account_setup_sent_at.nil?
        end
        if delivered
          MembershipAccountMailer.setup(prospect.id, token).deliver_now
          prospect.update!(account_setup_sent_at: now)
        end
        Result.new(prospect: prospect.reload, token: nil, delivered:, replayed: captured.replayed)
      rescue ActiveRecord::RecordNotUnique
        raise ArgumentError, "An account already uses this email address. Sign in to continue."
      end

      private

      attr_reader :practice, :input, :now

      def create_account_user!(prospect)
        existing = User.lock.find_by(email_address: prospect.email_address)
        raise ArgumentError, "An account already uses this email address. Sign in to continue." if existing

        user = User.create!(email_address: prospect.email_address, password: SecureRandom.urlsafe_base64(48), active: false)
        prospect.update!(account_user: user)
        user
      end

      def digest(token)
        Digest::SHA256.hexdigest(token)
      end
    end
  end
end
