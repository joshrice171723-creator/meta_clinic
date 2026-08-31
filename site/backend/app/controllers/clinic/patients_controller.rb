module Clinic
  class PatientsController < BaseController
    before_action -> { require_capability(:patients_access?) }
    rescue_from ActiveRecord::RecordInvalid do |error|
      flash.now[:alert] = error.record.errors.full_messages.to_sentence
      render :index, status: :unprocessable_entity
    end

    def index
      @patients = current_practice.patients.order(:id)
      @patient = current_practice.patients.new
    end

    def create
      @patients = current_practice.patients.order(:id)
      @patient = current_practice.patients.new(params.require(:clinic_patient).permit(:display_name, :reference))
      @patient.save!
      redirect_to clinic_patient_path(@patient), status: :see_other
    end

    def show
      @patient = current_practice.patients.find(params[:id])
      @notes = @patient.notes.order(created_at: :desc)
    end

    def note
      @patient = current_practice.patients.find(params[:id])
      record = @patient.notes.new(body: params[:body], practice: current_practice, author: current_user)
      if record.save
        redirect_to clinic_patient_path(@patient), status: :see_other, notice: "Synthetic draft entry saved. It is not a signed clinical note."
      else
        @notes = @patient.notes.order(created_at: :desc)
        flash.now[:alert] = record.errors.full_messages.to_sentence
        render :show, status: :unprocessable_entity
      end
    end
  end
end
