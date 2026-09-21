module Platform
  class OwnerPasswordResetMailer < ApplicationMailer
    layout false

    def reset(reset_id, token)
      reset = OwnerPasswordReset.find(reset_id)
      @expires_at = reset.expires_at
      @reset_url = "#{site_origin}/owner/password-reset#token=#{URI.encode_www_form_component(token)}"

      mail(to: reset.user.email_address, subject: "Reset your Meta Clinic owner password")
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
