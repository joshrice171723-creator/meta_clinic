module Clinic
  module Care
    class PatientsController < Clinic::ApiController
      REGISTRATION_ASSOCIATIONS = %i[versions demographics contacts emergency_contacts address_versions communication_preference social_histories].freeze

      rescue_from ArgumentError do |error|
        render_error(error.message, :unprocessable_entity)
      end

      before_action -> { require_capability("patients.read") }, only: %i[index show]
      before_action -> { require_capability_with_legacy("patients.identity.read", "patients.read") }, only: :lookup
      before_action -> { require_capability("patients.write") }, only: %i[create update merge]
      before_action -> { require_capability("notes.write") }, only: :note

      def index
        patients = current_practice.patients.where(merged_into_patient_id: nil).accessible_by(current_ability, :read)
          .includes(:demographics, :contacts)
        if params[:site_id].present?
          site = accessible_clinic_sites.find(requested_id!(params[:site_id], :site_id))
          patients = patients.where(primary_site_id: site.id)
        end
        query = query_param
        if query.present?
          escaped = Clinic::Care::Patient.sanitize_sql_like(query)
          patients = patients.where("reference ILIKE :query", query: "%#{escaped}%")
        end
        paginate(patients, key: :patients, serializer: ->(patient) { PatientSerializer.identity_lookup(patient) }, order: { reference: :asc, id: :asc })
      end

      # Scheduler/front desk projection: identity and reference only. The
      # endpoint is deliberately separate from the patient detail surface.
      def lookup
        patients = current_practice.patients.where(merged_into_patient_id: nil).accessible_by(current_ability, :read_identity)
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
        patient = PatientRegistration.create(practice: current_practice, actor: current_user,
          site: current_clinic_site, input:)
        render json: { id: patient.id, patient: PatientSerializer.call(patient),
          request_key: input[:request_key].presence&.to_s&.strip }, status: :created
      end

      def update
        patient = current_practice.patients.accessible_by(current_ability, :read).find(integer_id!(params[:id], field: :id))
        input = patient_input
        updated = PatientRegistration.update(practice: current_practice, actor: current_user, patient:, input:)
        render json: { patient: PatientSerializer.call(patient_detail_scope.find(updated.id), detail: true),
          request_key: input[:request_key].presence&.to_s&.strip }
      end

      def show
        patient = patient_detail_scope.find(integer_id!(params[:id], field: :id))
        payload = { patient: PatientSerializer.call(patient, detail: true),
          activity_history: PatientActivityHistory.call(patient: patient, ability: current_ability),
          notes: patient.notes.order(created_at: :desc, id: :desc).map { |note| {
            id: note.id, body: note.body, author_id: note.author_id, created_at: note.created_at
          } } }
        if current_ability.allowed_permission?("patient_portal.identity.invite", any_site: true)
          identity = Clinic::PatientPortal::Identity.find_by(practice_id: current_practice.id, patient_id: patient.id)
          payload[:portal_access] = identity && {
            status: identity.status,
            invitation_expires_at: identity.invitation_expires_at&.iso8601(6),
            activated_at: identity.activated_at&.iso8601(6),
            invitation_open: identity.invited? && identity.invitation_expires_at&.future?
          }
        end
        render json: payload
      end

      def merge
        source = current_practice.patients.find(integer_id!(params[:id], field: :id))
        input = parameter_hash!(:merge, %i[target_patient_id reason])
        target = current_practice.patients.find(integer_id!(input[:target_patient_id], field: :target_patient_id))
        raise ArgumentError, "Choose a different canonical patient." if source.id == target.id
        reason = required_string!(input[:reason], field: :reason, maximum: 500)
        membership = current_practice.memberships.active.find_by!(user: current_user)

        Clinic::Care::Patient.transaction do
          locked = current_practice.patients.where(id: [ source.id, target.id ]).order(:id).lock.index_by(&:id)
          source = locked.fetch(source.id)
          target = locked.fetch(target.id)
          raise ArgumentError, "This patient is already merged." if source.merged_into_patient_id.present?
          raise ArgumentError, "The canonical patient has already been merged." if target.merged_into_patient_id.present?

          blocking = Clinic::Care::Patient.reflect_on_all_associations.find do |association|
            next unless %i[has_many has_one].include?(association.macro)
            next if REGISTRATION_ASSOCIATIONS.include?(association.name)

            records = source.public_send(association.name)
            association.collection? ? records.exists? : records.present?
          end
          if blocking || Clinic::PatientPortal::Identity.exists?(practice_id: current_practice.id, patient_id: source.id)
            raise ArgumentError, "This duplicate has linked activity. Reconcile it before merging."
          end

          source.update!(merged_into_patient: target, merged_at: Time.current,
            merged_by_membership: membership, merge_reason: reason)
          Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
            action_code: "patients.merge", outcome: :committed,
            resource_version_ref: "Clinic::Care::Patient/#{source.id}")
        end
        render json: { canonical_patient_id: target.id, merged_patient_id: source.id }
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
    end
  end
end
