module Clinic
  class StaffController < BaseController
    before_action -> { require_capability(:staff_access?) }

    def index
      @staff = current_practice.staff_members.order(:id)
    end

    def create
      person = current_practice.staff_members.new(params.require(:clinic_staff_member).permit(:display_name, :job_title))
      if person.save
        redirect_to clinic_staff_index_path, status: :see_other, notice: "Synthetic staff record added. No login or permissions were created."
      else
        @staff = current_practice.staff_members.order(:id)
        flash.now[:alert] = person.errors.full_messages.to_sentence
        render :index, status: :unprocessable_entity
      end
    end

    def update
      person = current_practice.staff_members.find(params[:id])
      return render_error("Choose an active or inactive state.", :unprocessable_entity) unless %w[true false].include?(params[:active])
      person.update!(active: params[:active] == "true")
      redirect_to clinic_staff_index_path, status: :see_other, notice: "Directory status updated. Login permissions are managed separately."
    end
  end
end
