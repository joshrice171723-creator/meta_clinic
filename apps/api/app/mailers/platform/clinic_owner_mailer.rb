module Platform
  class ClinicOwnerMailer < ApplicationMailer
    layout false

    def invitation(invitation_id, token)
      invitation = Clinic::Workforce::EmployeeInvitation.find(invitation_id)
      @clinic_name = invitation.practice.name
      @organization_name = invitation.practice.organization&.name
      @owner_name = invitation.staff_member.display_name
      @expires_at = invitation.expires_at
      @activation_url = "#{site_origin}/workforce/activate#token=#{URI.encode_www_form_component(token)}"

      mail(to: invitation.email_address, subject: "Create your Meta Clinic password")
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
