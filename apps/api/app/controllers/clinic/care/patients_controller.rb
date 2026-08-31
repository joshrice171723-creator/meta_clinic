module Clinic
  module Care
    class PatientsController < Clinic::BaseController
      before_action -> { require_capability(:patients_access?) }

      def index
        render json: { patients: current_practice.patients.order(:id).as_json(only: %i[id display_name reference]) }
      end

      def create
        patient = current_practice.patients.create!(params.require(:clinic_patient).permit(:display_name, :reference))
        render json: { id: patient.id }, status: :created
      end

      def show
        patient = current_practice.patients.find(params[:id])
        render json: { patient: patient.as_json(only: %i[id display_name reference]),
          notes: patient.notes.order(created_at: :desc).as_json(only: %i[id body author_id created_at]) }
      end

      def note
        patient = current_practice.patients.find(params[:id])
        patient.notes.create!(body: params[:body], practice: current_practice, author: current_user)
        head :no_content
      end
    end
  end
end
