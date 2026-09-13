module Clinic
  class MembershipAccountMailer < ApplicationMailer
    layout false

    def setup(prospect_id, token)
      @prospect = Clinic::MembershipProspect.find(prospect_id)
      @practice = @prospect.practice
      @activation_url = "#{site_origin}/memberships/account/activate#token=#{URI.encode_www_form_component(token)}"
      mail(to: @prospect.email_address, subject: "Verify your #{ @practice.name } membership account")
    end

    private

    def site_origin
      return ENV.fetch("APP_SITE_ORIGIN").delete_suffix("/") if ENV["APP_SITE_ORIGIN"].present?

      options = Rails.application.config.action_mailer.default_url_options
      URI::Generic.build(scheme: options[:protocol] || "http", host: options.fetch(:host), port: options[:port])
        .to_s.delete_suffix("/")
    end
  end
end
