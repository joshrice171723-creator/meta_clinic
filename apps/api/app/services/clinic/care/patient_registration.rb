require "uri"

module Clinic
  module Care
    class PatientRegistration
      include Clinic::Api::RequestParameters

      def self.create(practice:, actor:, site:, input:)
        new(practice:, actor:, site:).create(input)
      end

      def self.update(practice:, actor:, patient:, input:)
        new(practice:, actor:, site: patient.primary_site).update(patient, input)
      end

      def initialize(practice:, actor:, site:)
        @practice, @actor, @site = practice, actor, site
      end

      def create(input)
        input = input.to_h.with_indifferent_access
        Clinic::Authorization.authorize!(practice: @practice, actor: @actor, action: "patients.write", site: @site)
        unless @site && @site.practice_id == @practice.id && Clinic::Configuration::PracticeFeatures.site_specialty_selected?(practice: @practice, site: @site)
          raise ArgumentError, "Select a configured clinic location before registering a patient."
        end
        action = -> do
          Clinic::Care::Patient.transaction do
            patient = @practice.patients.create!(
              display_name: required_string!(input[:display_name], field: :display_name, maximum: 120),
              reference: required_string!(input[:reference], field: :reference, maximum: 32), primary_site: @site)
            save_registration!(patient, input)
            patient
          end
        end
        key = optional_request_key(input)
        return action.call unless key
        result = Clinic::Idempotency.execute(practice: @practice, actor: @actor, operation_code: "patients.register",
          request_key: key, payload: input.except(:request_key).to_h, authorization_action: "patients.write",
          authorization: -> { Clinic::Authorization.authorize!(practice: @practice, actor: @actor, action: "patients.write", site: @site) },
          result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) { practice.patients.find_by(id: receipt.resource_id) }, &action)
        confirmed!(result, "The registered patient is unavailable.")
      end

      def update(patient, input)
        input = input.to_h.with_indifferent_access
        patient = @practice.patients.accessible_by(Ability.new(@actor, practice: @practice), :read).find(patient.id)
        authorize_update!(patient)
        action = -> do
          Clinic::Care::Patient.transaction do
            patient.with_lock do
              expected = input[:expected_updated_at].presence && time_param!(input[:expected_updated_at], field: :expected_updated_at)
              raise ActiveRecord::StaleObjectError.new(patient, "update registration") if expected && patient.updated_at != expected
              reference = required_string!(input[:reference], field: :reference, maximum: 32)
              raise ArgumentError, "Clinic reference cannot be changed after registration." if reference != patient.reference
              patient.update!(display_name: required_string!(input[:display_name], field: :display_name, maximum: 120))
              parent_changed = patient.saved_changes?
              registration_changed = save_registration!(patient, input)
              patient.touch if registration_changed && !parent_changed
              patient
            end
          end
        end
        key = optional_request_key(input)
        return action.call unless key
        result = Clinic::Idempotency.execute(practice: @practice, actor: @actor, operation_code: "patients.registration_update",
          request_key: key, payload: input.except(:request_key).to_h, resource: patient, authorization_action: "patients.write",
          authorization: -> { authorize_update!(patient) }, result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) { practice.patients.find_by(id: receipt.resource_id) }, &action)
        confirmed!(result, "The updated patient is unavailable.")
      end

      private

      def authorize_update!(patient)
        Clinic::Authorization.authorize!(practice: @practice, actor: @actor, action: "patients.read", subject: patient)
        Clinic::Authorization.authorize!(practice: @practice, actor: @actor, action: "patients.write", subject: patient)
      end

      def confirmed!(result, message)
        raise Clinic::Idempotency::OutcomeUnconfirmed if result.receipt.outcome_outcome_unconfirmed?
        result.value || raise(Clinic::Idempotency::InvalidRequest, message)
      end

      def boolean_or_default(value, field:, default: false)
        value.nil? ? default : boolean_param(value, field: field)
      end

      def save_registration!(patient, input)
        Clinic::Care::Patient.transaction do
          now = Current.business_time
          changed = false
          existing_demographics = patient.demographics
          demographics = {
            legal_name: registration_legal_name(input, existing_demographics, patient),
            preferred_name: registration_preferred_name(input, existing_demographics),
            date_of_birth: registration_date_of_birth(input, existing_demographics),
            sex: registration_sex(input, existing_demographics),
            primary_language: registration_language(input, existing_demographics),
            interpreter_required: registration_interpreter_required(input, existing_demographics)
          }
          if existing_demographics
            existing_demographics.update!(demographics)
            changed ||= existing_demographics.saved_changes?
          else
            patient.create_demographics!(demographics.merge(practice: @practice))
            changed = true
          end
          changed = replace_primary_address!(patient, input) || changed
          changed = replace_contact!(patient, input, now) || changed
          changed = replace_emergency_contact!(patient, input, now) || changed
          existing_preference = patient.communication_preference
          preference = {
            preferred_contact_method: registration_preference(input, existing_preference, :preferred_contact_method, "portal"),
            appointment_reminders_consent: registration_boolean(input, existing_preference, :appointment_reminders_consent, false),
            general_communications_consent: registration_boolean(input, existing_preference, :general_communications_consent, false)
          }
          if existing_preference
            existing_preference.update!(preference)
            changed ||= existing_preference.saved_changes?
          else
            patient.create_communication_preference!(preference.merge(practice: @practice))
            changed = true
          end
          changed = replace_social_history!(patient, input, now) || changed
          changed
        end
      end

      def replace_contact!(patient, input, now)
        fields = %i[contact_type contact_value preferred]
        return false unless fields.any? { |field| input.key?(field) }

        contact_type = enum_param!(input[:contact_type].presence || "phone", field: :contact_type, allowed: %w[phone email])
        current = current_version(patient.contacts.where(contact_type: contact_type))
        if input.key?(:contact_value) && input[:contact_value].blank?
          return append_closure!(patient.contacts, current, %i[contact_type contact_value preferred], now)
        end

        attributes = {
          contact_type: contact_type,
          contact_value: required_string!(input.key?(:contact_value) ? input[:contact_value] : current&.contact_value,
            field: :contact_value, maximum: 320),
          preferred: input.key?(:preferred) ? boolean_or_default(input[:preferred], field: :preferred) : current&.preferred || false
        }
        validate_contact_value!(attributes[:contact_type], attributes[:contact_value])
        return false if current && version_matches?(current, attributes)

        patient.contacts.create!(attributes.merge(practice: @practice, effective_from: now))
        true
      end

      def replace_primary_address!(patient, input)
        return false unless input.key?(:primary_address)

        address = optional_string(input[:primary_address], field: :primary_address, maximum: 20_000)
        current = patient.primary_address_version
        if address.blank?
          return false unless current

          patient.update!(primary_address_version: nil)
          return true
        end
        return false if current&.encrypted_address == address

        Clinic::Care::AddPatientAddress.call(
          practice: @practice, actor: @actor, patient:, encrypted_address: address, make_primary: true
        )
        true
      end

      def replace_emergency_contact!(patient, input, now)
        fields = %i[emergency_name emergency_relationship emergency_phone permission_to_contact]
        return false unless fields.any? { |field| input.key?(field) }

        current = current_version(patient.emergency_contacts)
        if fields.first(3).all? { |field| input.key?(field) && input[field].blank? }
          return append_closure!(patient.emergency_contacts, current, %i[name relationship phone permission_to_contact], now)
        end

        phone = required_string!(input.key?(:emergency_phone) ? input[:emergency_phone] : current&.phone,
          field: :emergency_phone, maximum: 320)
        validate_contact_value!("phone", phone)
        attributes = {
          name: required_string!(input.key?(:emergency_name) ? input[:emergency_name] : current&.name,
            field: :emergency_name, maximum: 320),
          relationship: required_string!(input.key?(:emergency_relationship) ? input[:emergency_relationship] : current&.relationship,
            field: :emergency_relationship, maximum: 320),
          phone: phone,
          permission_to_contact: input.key?(:permission_to_contact) ? boolean_or_default(input[:permission_to_contact], field: :permission_to_contact) : current&.permission_to_contact || false
        }
        return false if current && version_matches?(current, attributes)

        patient.emergency_contacts.create!(attributes.merge(practice: @practice, effective_from: now))
        true
      end

      def replace_social_history!(patient, input, now)
        fields = %i[tobacco_use alcohol_use exercise_habits diet occupation living_situation relevant_social_factors]
        return false unless fields.any? { |field| input.key?(field) }

        current = current_version(patient.social_histories)
        attributes = fields.index_with do |field|
          input.key?(field) ? optional_string(input[field], field: :social_history, maximum: 2_000) : current&.public_send(field)
        end
        return append_closure!(patient.social_histories, current, fields, now) if attributes.values.all?(&:nil?)
        return false if current && version_matches?(current, attributes)

        patient.social_histories.create!(attributes.merge(practice: @practice, effective_from: now))
        true
      end

      def current_version(relation)
        latest = relation.order(created_at: :desc, id: :desc).first
        latest if latest&.effective_until.nil?
      end

      def version_matches?(record, attributes)
        attributes.all? { |field, value| record.public_send(field) == value }
      end

      def append_closure!(relation, current, fields, now)
        return false unless current

        attributes = fields.index_with { |field| current.public_send(field) }
        relation.create!(attributes.merge(practice: @practice,
          effective_from: now - Rational(1, 1_000_000), effective_until: now))
        true
      end

      def optional_request_key(input)
        input[:request_key].presence && required_string!(input[:request_key], field: :request_key, maximum: 160)
      end

      def registration_date_of_birth(input, existing)
        return existing.date_of_birth if existing && !input.key?(:date_of_birth)

        input[:date_of_birth].presence && date_param!(input[:date_of_birth], field: :date_of_birth)
      end

      def registration_legal_name(input, existing, patient)
        return existing.legal_name if existing && !input.key?(:legal_name)

        required_string!(input[:legal_name].presence || patient.display_name, field: :legal_name, maximum: 160)
      end

      def registration_preferred_name(input, existing)
        return existing.preferred_name if existing && !input.key?(:preferred_name)

        optional_string(input[:preferred_name], field: :preferred_name, maximum: 160)
      end

      def registration_sex(input, existing)
        if existing && !input.key?(:sex)
          existing.sex
        else
          sex = enum_param!(required_string!(input[:sex], field: :sex, maximum: 32), field: :sex,
            allowed: Clinic::Care::PatientDemographics.sexes.keys)
          raise ArgumentError, "Choose a documented sex or Unknown before creating a patient." if existing.nil? && sex == "not_recorded"

          sex
        end
      end

      def registration_language(input, existing)
        return existing.primary_language if existing && !input.key?(:primary_language)

        required_string!(input[:primary_language].presence || "not recorded", field: :primary_language, maximum: 80)
      end

      def registration_interpreter_required(input, existing)
        return existing.interpreter_required if existing && !input.key?(:interpreter_required)
        return nil if input[:interpreter_required].nil? || input[:interpreter_required].to_s.in?([ "", "unknown" ])

        boolean_or_default(input[:interpreter_required], field: :interpreter_required)
      end

      def registration_preference(input, existing, field, fallback)
        return existing.public_send(field) if existing && !input.key?(field)

        enum_param!(input[field].presence || fallback, field: field, allowed: %w[text phone email portal])
      end

      def registration_boolean(input, existing, field, fallback)
        return existing.public_send(field) if existing && !input.key?(field)

        boolean_or_default(input[field], field: field, default: fallback)
      end

      def validate_contact_value!(contact_type, value)
        case contact_type
        when "email"
          raise ArgumentError, "Enter a valid email address." unless URI::MailTo::EMAIL_REGEXP.match?(value)
        when "phone"
          raise ArgumentError, "Enter a valid phone number." unless value.scan(/\d/).length.between?(7, 15)
        end
      end
    end
  end
end
