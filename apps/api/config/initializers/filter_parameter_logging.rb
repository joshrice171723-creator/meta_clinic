# Be sure to restart your server when you modify this file.

# Configure parameters to be partially matched (e.g. passw matches password) and filtered from the log file.
# Use this to limit dissemination of sensitive information.
# See the ActiveSupport::ParameterFilter documentation for supported notations and behaviors.
Rails.application.config.filter_parameters += [
  :data, # Stripe webhook objects can contain customer/payment details.
  :passw, :email, :secret, :token, :_key, :crypt, :salt, :certificate, :otp, :ssn, :cvv, :cvc,
  :name, :message, :body, :website, :cookie, :signature, :consent, :content_digest,
  :reference, :reason, :job_title, :ndc_query, :authorization,
  :text_value, :coded_value, :numeric_value, :unit_code, :missing_reason, :encrypted_value, :description_snapshot,
  :subjective, :objective, :assessment, :plan, :q,
  :allergen_name, :reaction, :medication_name, :dose_text, :route_text, :frequency_text, :purpose,
  :condition_name, :care_instruction, :description, :instructions, :notes
]
