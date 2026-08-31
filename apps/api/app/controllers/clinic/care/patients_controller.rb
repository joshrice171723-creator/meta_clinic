module Clinic
  module Care
    class PatientsController < Clinic::BaseController
      before_action -> { require_capability("patients.read") }, only: %i[index show]
      before_action -> { require_capability("patients.write") }, only: :create
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

      def create
        input = parameter_hash!(:clinic_patient, %i[display_name reference])
        patient = current_practice.patients.create!(
          display_name: required_string!(input[:display_name], field: :display_name, maximum: 120),
          reference: required_string!(input[:reference], field: :reference, maximum: 32)
        )
        render json: { id: patient.id, patient: PatientSerializer.call(patient) }, status: :created
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
    end
  end
end
