require "uri"

module Clinic
  module Care
    class PatientsController < Clinic::ApiController
      rescue_from ArgumentError do |error|
        render_error(error.message, :unprocessable_entity)
      end

      before_action -> { require_capability("patients.read") }, only: %i[index show]
      before_action -> { require_capability_with_legacy("patients.identity.read", "patients.read") }, only: :lookup
      before_action -> { require_capability("patients.write") }, only: %i[create update]
      before_action -> { require_capability("notes.write") }, only: :note

      def index
        patients = current_practice.patients.accessible_by(current_ability, :read)
        query = query_param
        if query.present?
          escaped = Clinic::Care::Patient.sanitize_sql_like(query)
          patients = patients.where("reference ILIKE :query", query: "%#{escaped}%")
        end
        paginate(patients, key: :patients, serializer: ->(patient) { PatientSerializer.call(patient) }, order: { reference: :asc, id: :asc })
      end

      # Scheduler/front desk projection: identity and reference only. The
      # endpoint is deliberately separate from the patient detail surface.
      def lookup
        patients = current_practice.patients.accessible_by(current_ability, :read_identity)
          .includes(:demographics, :contacts)
        query = query_param
        date_of_birth = params[:date_of_birth].present? ? date_param!(params[:date_of_birth], field: :date_of_birth) : nil
        phone = params[:phone].to_s.strip.presence
        patient_id = params[:id].presence
        if patient_id.present? && [ query, date_of_birth, phone ].any?(&:present?)
          raise Clinic::Api::RequestParameters::Invalid.new(
            "id cannot be combined with other matching fields.", field: :id
          )
        end
        if patient_id.blank? && [ query, date_of_birth, phone ].none?(&:present?)
          raise Clinic::Api::RequestParameters::Invalid.new(
            "Enter at least one patient matching field.", field: :q
          )
        end

        patients = if patient_id.present?
          patients.where(id: requested_id!(patient_id, :id))
        else
          Clinic::Care::PatientIdentitySearch.search(
            scope: patients,
            practice_id: current_practice.id,
            query: query,
            date_of_birth: date_of_birth,
            phone: phone
          )
        end
        paginate(patients, key: :patients, serializer: ->(patient) { PatientSerializer.identity_lookup(patient) },
          order: { reference: :asc, id: :asc }, maximum: 100)
      end

      def create
        input = patient_input
        create_patient = -> do
          Clinic::Care::Patient.transaction do
            created = current_practice.patients.create!(
              display_name: required_string!(input[:display_name], field: :display_name, maximum: 120),
              reference: required_string!(input[:reference], field: :reference, maximum: 32)
            )
            save_registration!(created, input)
            created
          end
        end
        request_key = optional_request_key(input)
        patient = if request_key
          outcome = Clinic::Idempotency.execute(
            practice: current_practice, actor: current_user, operation_code: "patients.register",
            request_key: request_key, payload: input.except(:request_key).to_h,
            result_resource: ->(record) { record },
            resource_resolver: ->(practice:, receipt:) { practice.patients.find_by(id: receipt.resource_id) },
            &create_patient
          )
          raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

          outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The registered patient is unavailable.")
        else
          create_patient.call
        end
        render json: { id: patient.id, patient: PatientSerializer.call(patient), request_key: request_key }, status: :created
      end

      def update
        patient = current_practice.patients.accessible_by(current_ability, :read).find(integer_id!(params[:id], field: :id))
        input = patient_input
        update_patient = -> do
          Clinic::Care::Patient.transaction do
            patient.with_lock do
              expected_updated_at = input[:expected_updated_at].presence && time_param!(input[:expected_updated_at], field: :expected_updated_at)
              if expected_updated_at && patient.updated_at != expected_updated_at
                raise ActiveRecord::StaleObjectError.new(patient, "update registration")
              end
              reference = required_string!(input[:reference], field: :reference, maximum: 32)
              if reference != patient.reference
                raise ArgumentError, "Clinic reference cannot be changed after registration."
              end
              patient.update!(display_name: required_string!(input[:display_name], field: :display_name, maximum: 120))
              parent_changed = patient.saved_changes?
              registration_changed = save_registration!(patient, input)
              patient.touch if registration_changed && !parent_changed
              patient
            end
          end
        end
        request_key = optional_request_key(input)
        updated = if request_key
          outcome = Clinic::Idempotency.execute(
            practice: current_practice, actor: current_user, operation_code: "patients.registration_update",
            request_key: request_key, payload: input.except(:request_key).to_h, resource: patient,
            result_resource: ->(record) { record },
            resource_resolver: ->(practice:, receipt:) { practice.patients.find_by(id: receipt.resource_id) },
            &update_patient
          )
          raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

          outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The updated patient is unavailable.")
        else
          update_patient.call
        end
        render json: { patient: PatientSerializer.call(patient_detail_scope.find(updated.id), detail: true), request_key: request_key }
      end

      def show
        patient = patient_detail_scope.find(integer_id!(params[:id], field: :id))
        render json: { patient: PatientSerializer.call(patient, detail: true),
          activity_history: PatientActivityHistory.call(patient: patient, ability: current_ability),
          notes: patient.notes.order(created_at: :desc, id: :desc).map { |note| {
            id: note.id, body: note.body, author_id: note.author_id, created_at: note.created_at
          } } }
      end

      def note
        patient = current_practice.patients.accessible_by(current_ability, :read).find(integer_id!(params[:id], field: :id))
        body = required_string!(params[:body], field: :body, maximum: 8_000)
        note = patient.notes.create!(body: body, practice: current_practice, author: current_user)
        head :no_content
      end

      def patient_input
        parameter_hash!(:clinic_patient, %i[display_name reference legal_name preferred_name primary_address date_of_birth sex primary_language interpreter_required contact_type contact_value preferred emergency_name emergency_relationship emergency_phone permission_to_contact preferred_contact_method appointment_reminders_consent general_communications_consent tobacco_use alcohol_use exercise_habits diet occupation living_situation relevant_social_factors expected_updated_at request_key])
      end

      def patient_detail_scope
        current_practice.patients.accessible_by(current_ability, :read)
          .includes(:demographics, :primary_address_version, :contacts, :emergency_contacts, :communication_preference, :social_histories)
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
            patient.create_demographics!(demographics.merge(practice: current_practice))
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
            patient.create_communication_preference!(preference.merge(practice: current_practice))
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
        return append_closure!(patient.contacts, current, %i[contact_type contact_value preferred], now) if input[:contact_value].blank?

        attributes = {
          contact_type: contact_type,
          contact_value: required_string!(input[:contact_value], field: :contact_value, maximum: 320),
          preferred: input.key?(:preferred) ? boolean_or_default(input[:preferred], field: :preferred) : current&.preferred || false
        }
        validate_contact_value!(attributes[:contact_type], attributes[:contact_value])
        return false if current && version_matches?(current, attributes)

        patient.contacts.create!(attributes.merge(practice: current_practice, effective_from: now))
        true
      end

      def replace_primary_address!(patient, input)
        return false unless input.key?(:primary_address)

        address = optional_string(input[:primary_address], field: :primary_address, maximum: 20_000)
        current = patient.primary_address_version
        return false if address.blank? || current&.encrypted_address == address

        Clinic::Care::AddPatientAddress.call(
          practice: current_practice, actor: current_user, patient:, encrypted_address: address, make_primary: true
        )
        true
      end

      def replace_emergency_contact!(patient, input, now)
        fields = %i[emergency_name emergency_relationship emergency_phone permission_to_contact]
        return false unless fields.any? { |field| input.key?(field) }

        current = current_version(patient.emergency_contacts)
        return append_closure!(patient.emergency_contacts, current, %i[name relationship phone permission_to_contact], now) if fields.first(3).all? { |field| input[field].blank? }

        phone = required_string!(input[:emergency_phone], field: :emergency_phone, maximum: 320)
        validate_contact_value!("phone", phone)
        attributes = {
          name: required_string!(input[:emergency_name], field: :emergency_name, maximum: 320),
          relationship: required_string!(input[:emergency_relationship], field: :emergency_relationship, maximum: 320),
          phone: phone,
          permission_to_contact: input.key?(:permission_to_contact) ? boolean_or_default(input[:permission_to_contact], field: :permission_to_contact) : current&.permission_to_contact || false
        }
        return false if current && version_matches?(current, attributes)

        patient.emergency_contacts.create!(attributes.merge(practice: current_practice, effective_from: now))
        true
      end

      def replace_social_history!(patient, input, now)
        fields = %i[tobacco_use alcohol_use exercise_habits diet occupation living_situation relevant_social_factors]
        return false unless fields.any? { |field| input.key?(field) }

        current = current_version(patient.social_histories)
        attributes = fields.index_with { |field| optional_string(input[field], field: :social_history, maximum: 2_000) }
        return append_closure!(patient.social_histories, current, fields, now) if attributes.values.all?(&:nil?)
        return false if current && version_matches?(current, attributes)

        patient.social_histories.create!(attributes.merge(practice: current_practice, effective_from: now))
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
        relation.create!(attributes.merge(practice: current_practice,
          effective_from: now - 1.microsecond, effective_until: now))
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
