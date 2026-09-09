Rails.application.config.action_controller.forgery_protection_origin_check = true
# Set keys before production eager loading configures Active Record encryption.
# after_initialize is too late; keep existing derivation so local records still decrypt.
encryption = Rails.application.config.active_record.encryption
%w[primary_key deterministic_key key_derivation_salt].each do |name|
  key = "ACTIVE_RECORD_ENCRYPTION_#{name.upcase}"
  encryption.public_send("#{name}=", if Rails.env.production?
    ENV.fetch(key)
  else
    ENV[key] || Rails.application.key_generator.generate_key("apply-inquiries-#{name}", 32).unpack1("H*")
  end)
end
