require "digest"

module Development
  class SyntheticMembershipActivation
    def self.call(practice:, prospect:, token:, now: Current.business_time)
      raise ActiveRecord::RecordNotFound unless
        Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1" &&
          MembershipPaymentSimulator.enabled_for?(practice)

      ApplicationRecord.transaction do
        prospect.lock!
        raise ActiveRecord::RecordNotFound unless prospect.practice_id == practice.id &&
          prospect.account_setup_token_digest == Digest::SHA256.hexdigest(token.to_s) &&
          prospect.account_setup_expires_at&.>(now) && prospect.account_activated_at.nil?

        user = prospect.account_user&.lock!
        raise ActiveRecord::RecordNotFound unless user && !user.active?

        user.update!(active: true)
        prospect.update!(account_setup_token_digest: nil, account_setup_expires_at: nil,
          account_activated_at: now, accepted_terms_version: nil, accepted_terms_at: nil)
        Clinic::AuditRecorder.record!(practice:, actor: user,
          action_code: "membership_storefront.account.synthetic_activate", outcome: :committed,
          resource_version_ref: "membership_prospect:#{prospect.id}")
        user
      end
    end
  end
end
