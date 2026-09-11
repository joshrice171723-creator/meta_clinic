module Platform
  class ClinicOwnerInvitationDelivery
    METHODS = %w[email sms].freeze

    def self.call(invitation:, token:, method:, phone_number:, actor:)
      activation_path = "/workforce/activate#token=#{URI.encode_www_form_component(token)}"
      delivered = case method
      when "email"
        Platform::ClinicOwnerMailer.invitation(invitation.id, token).deliver_now
        true
      when "sms"
        ClinicOwnerInvitationSms.deliver(phone_number:, activation_path:, expires_at: invitation.expires_at)
      else
        false
      end
      audit(actor:, delivered:, method:)
      { activation_path:, delivery_status: delivered ? (Rails.env.development? ? "prepared" : "sent") : "failed" }
    rescue StandardError => error
      Rails.logger.error("Clinic owner invitation delivery failed: #{error.class}")
      audit(actor:, delivered: false, method:)
      { activation_path:, delivery_status: "failed" }
    end

    def self.audit(actor:, delivered:, method:)
      Clinic::AuditRecorder.record_platform(actor:,
        action_code: delivered ? "owner_command_center.invitation.#{method}.sent" : "owner_command_center.invitation.#{method}.failed",
        outcome: delivered ? :committed : :failed)
    end
    private_class_method :audit
  end
end
