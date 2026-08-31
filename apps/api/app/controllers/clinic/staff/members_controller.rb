module Clinic
  module Staff
    class MembersController < Clinic::BaseController
      before_action -> { require_capability("staff.read") }, only: :index
      before_action -> { require_capability("staff.write") }, only: %i[create update]

      def index
        staff = current_practice.staff_members
        query = query_param
        if query.present?
          escaped = Clinic::Staff::Member.sanitize_sql_like(query)
          staff = staff.where("job_title ILIKE :query", query: "%#{escaped}%")
        end
        if params[:active].present?
          staff = staff.where(active: boolean_param(params[:active], field: :active))
        end
        paginate(staff, key: :staff, serializer: ->(member) { StaffMemberSerializer.call(member) }, order: { display_name: :asc, id: :asc })
      end

      def create
        input = parameter_hash!(:clinic_staff_member, %i[display_name job_title])
        person = current_practice.staff_members.create!(
          display_name: required_string!(input[:display_name], field: :display_name, maximum: 120),
          job_title: required_string!(input[:job_title], field: :job_title, maximum: 120)
        )
        render json: { id: person.id, staff_member: StaffMemberSerializer.call(person) }, status: :created
      end

      def update
        person = current_practice.staff_members.find(integer_id!(params[:id], field: :id))
        person.update!(active: boolean_param(params[:active], field: :active))
        head :no_content
      end
    end
  end
end
