module Clinic
  class MembershipReceiptMailer < ApplicationMailer
    layout false

    def receipt(prospect_id, token, purpose)
      @prospect = Clinic::MembershipProspect.find(prospect_id)
      @practice = @prospect.practice
      @receipt = @prospect.receipt
      @terms = @prospect.selected_terms
      @activation_url = "#{site_origin}/patient-portal/activate#token=#{URI.encode_www_form_component(token)}" \
        "&purpose=#{URI.encode_www_form_component(purpose)}"
      mail(to: @prospect.email_address, subject: "#{@practice.name} membership receipt and patient portal")
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
