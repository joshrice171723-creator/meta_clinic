# Be sure to restart your server when you modify this file.

# Configure parameters to be partially matched (e.g. passw matches password) and filtered from the log file.
# Use this to limit dissemination of sensitive information.
# See the ActiveSupport::ParameterFilter documentation for supported notations and behaviors.
Rails.application.config.filter_parameters += [
  :insurance, # Protected coverage, policyholder and request/response preparation details.
  :referral, # Supplied referral source, reference and receipt details.
  :evidence, # Signed screenshot source URLs may contain short-lived credentials.
  :payload, # Encrypted working-copy values and pending operation bodies.
  :inputs, # Assistant workflow forms may contain clinical drafts or financial details.
  :metadata, # Supplied document source/issuer/dates and correction text are encrypted separately from file bytes.
  :pin, :badge, :challenge, :enrollment_code, :activation_code,
  :employee_identifiers, :proposed_values, :interval, # Workforce credentials and private payroll/correction details.
  :data, # Stripe webhook objects can contain customer/payment details.
  :passw, :email, :secret, :token, :_key, :crypt, :salt, :certificate, :otp, :ssn, :cvv, :cvc,
  :name, :message, :body, :website, :cookie, :signature, :consent, :content_digest,
  :reference, :reason, :job_title, :ndc_query, :scan_code, :authorization,
  :date_of_birth, :emergency_phone, :contact_value, :preferred_contact_time, :tobacco_use,
  :text_value, :coded_value, :numeric_value, :unit_code, :missing_reason, :encrypted_value, :description_snapshot,
  :subjective, :objective, :assessment, :plan, :q,
  :content, :context, :segments, :revision, # Scribe source, context and reviewer text.
  :location, :callback_phone, :room_url, # Telehealth preparation and provider access details.
  :allergen_name, :reaction, :medication_name, :dose_text, :route_text, :frequency_text, :purpose,
  :condition_name, :care_instruction, :description, :instructions, :notes
]
