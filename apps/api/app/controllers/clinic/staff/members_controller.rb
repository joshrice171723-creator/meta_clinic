module Clinic
  module Staff
    class MembersController < Clinic::BaseController
      before_action -> { require_capability("staff.read") }, only: :index
      before_action -> { require_capability("staff.write") }, only: %i[create update]

      def index
        render json: { staff: current_practice.staff_members.order(:id).as_json(only: %i[id display_name job_title active]) }
      end

      def create
        person = current_practice.staff_members.create!(params.require(:clinic_staff_member).permit(:display_name, :job_title))
        render json: { id: person.id }, status: :created
      end

      def update
        person = current_practice.staff_members.find(params[:id])
        return render_error("Choose an active or inactive state.", :unprocessable_entity) unless %w[true false].include?(params[:active].to_s)
        person.update!(active: params[:active].to_s == "true")
        head :no_content
      end
    end
  end
end
