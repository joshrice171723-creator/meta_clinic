module Platform
  class OwnerInvitationMailer < ApplicationMailer
    layout false

    def invitation(invitation_id, token)
      invitation = Platform::OwnerInvitation.find(invitation_id)
      @expires_at = invitation.expires_at
      @activation_url = "#{site_origin}/owner/activate#token=#{URI.encode_www_form_component(token)}"

      mail(to: invitation.email_address, subject: "Create your Meta Clinic owner password")
    end

    private

    def site_origin
      return ENV.fetch("APP_SITE_ORIGIN").delete_suffix("/") if ENV["APP_SITE_ORIGIN"].present?

      options = Rails.application.config.action_mailer.default_url_options
      URI::Generic.build(
        scheme: options[:protocol] || "http",
        host: options.fetch(:host),
        port: options[:port]
      ).to_s.delete_suffix("/")
    end
  end
end
