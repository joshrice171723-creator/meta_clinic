require "uri"

module Clinic
  module Care
    class PatientsController < Clinic::BaseController
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
        query = query_param
        patient_id = params[:id].presence
        if query.present? && patient_id.present?
          raise Clinic::Api::RequestParameters::Invalid.new("q and id cannot be combined.", field: :id)
        end

        patients = if patient_id.present?
          patients.where(id: requested_id!(patient_id, :id))
        else
          Clinic::Care::PatientNameSearch.search(
            scope: patients,
            practice_id: current_practice.id,
            query: query
          )
        end
        paginate(patients, key: :patients, serializer: ->(patient) { PatientSerializer.call(patient) },
          order: { reference: :asc, id: :asc }, maximum: 100)
      end

      def create
        input = patient_input
        patient = Clinic::Care::Patient.transaction do
          created = current_practice.patients.create!(
            display_name: required_string!(input[:display_name], field: :display_name, maximum: 120),
            reference: required_string!(input[:reference], field: :reference, maximum: 32)
          )
          save_registration!(created, input)
          created
        end
        render json: { id: patient.id, patient: PatientSerializer.call(patient) }, status: :created
      end

      def update
        patient = current_practice.patients.accessible_by(current_ability, :read).find(integer_id!(params[:id], field: :id))
        input = patient_input
        Clinic::Care::Patient.transaction do
          patient.update!(display_name: required_string!(input[:display_name], field: :display_name, maximum: 120), reference: required_string!(input[:reference], field: :reference, maximum: 32))
          save_registration!(patient, input)
        end
        render json: { patient: PatientSerializer.call(patient, detail: true) }
      end

      def show
        patient = current_practice.patients.accessible_by(current_ability, :read).find(integer_id!(params[:id], field: :id))
        render json: { patient: PatientSerializer.call(patient, detail: true),
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
        parameter_hash!(:clinic_patient, %i[display_name reference date_of_birth sex primary_language interpreter_required contact_type contact_value preferred emergency_name emergency_relationship emergency_phone permission_to_contact preferred_contact_method appointment_reminders_consent general_communications_consent tobacco_use alcohol_use exercise_habits diet occupation living_situation relevant_social_factors])
      end

      def save_registration!(patient, input)
        Clinic::Care::Patient.transaction do
          now = Current.business_time
          existing_demographics = patient.demographics
          demographics = {
            date_of_birth: registration_date_of_birth(input, existing_demographics),
            sex: registration_sex(input, existing_demographics),
            primary_language: registration_language(input, existing_demographics),
            interpreter_required: registration_interpreter_required(input, existing_demographics)
          }
          existing_demographics ? existing_demographics.update!(demographics) : patient.create_demographics!(demographics.merge(practice: current_practice))
          if input[:contact_value].present?
            contact_type = enum_param!(input[:contact_type].presence || "phone", field: :contact_type, allowed: %w[phone email])
            contact_value = required_string!(input[:contact_value], field: :contact_value, maximum: 320)
            validate_contact_value!(contact_type, contact_value)
            patient.contacts.create!(practice: current_practice, contact_type: contact_type,
              contact_value: contact_value, preferred: boolean_or_default(input[:preferred], field: :preferred), effective_from: now)
          end
          if input[:emergency_name].present?
            emergency_phone = required_string!(input[:emergency_phone], field: :emergency_phone, maximum: 320)
            validate_contact_value!("phone", emergency_phone)
            patient.emergency_contacts.create!(
              practice: current_practice,
              name: required_string!(input[:emergency_name], field: :emergency_name, maximum: 320),
              relationship: required_string!(input[:emergency_relationship], field: :emergency_relationship, maximum: 320),
              phone: emergency_phone,
              permission_to_contact: boolean_or_default(input[:permission_to_contact], field: :permission_to_contact),
              effective_from: now
            )
          end
          existing_preference = patient.communication_preference
          preference = {
            preferred_contact_method: registration_preference(input, existing_preference, :preferred_contact_method, "portal"),
            appointment_reminders_consent: registration_boolean(input, existing_preference, :appointment_reminders_consent, false),
            general_communications_consent: registration_boolean(input, existing_preference, :general_communications_consent, false)
          }
          existing_preference ? existing_preference.update!(preference) : patient.create_communication_preference!(preference.merge(practice: current_practice))
          if input.values_at(:tobacco_use, :alcohol_use, :exercise_habits, :diet, :occupation, :living_situation, :relevant_social_factors).any?(&:present?)
            patient.social_histories.create!(input.slice(:tobacco_use, :alcohol_use, :exercise_habits, :diet, :occupation, :living_situation, :relevant_social_factors).to_h.transform_values { |v| optional_string(v, field: :social_history, maximum: 2_000) }.merge(practice: current_practice, effective_from: now))
          end
        end
      end

      def registration_date_of_birth(input, existing)
        return existing.date_of_birth if existing && !input.key?(:date_of_birth)

        input[:date_of_birth].presence && date_param!(input[:date_of_birth], field: :date_of_birth)
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
