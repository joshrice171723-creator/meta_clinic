module Clinic
  class VisitTypesController < ApiController
    before_action :authorize_visit_type_write!

    def create
      input = parameter_hash!(:visit_type, %i[request_key code])
      outcome = Configuration::ManageVisitType.create(practice: current_practice, actor: current_user, input:)
      render_visit_type(outcome, created: true)
    end

    def update
      visit_type = current_practice.visit_types.find(requested_id!(params[:id], :id))
      input = parameter_hash!(:visit_type, %i[request_key code active])
      outcome = Configuration::ManageVisitType.update(practice: current_practice, actor: current_user, visit_type:, input:)
      render_visit_type(outcome)
    end

    private

    def authorize_visit_type_write!
      Clinic::Authorization.authorize_with_legacy!(
        actor: current_user,
        practice: current_practice,
        action: "facilities.write",
        legacy_action: "appointments.write"
      )
    end

    def render_visit_type(outcome, created: false)
      visit_type = outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed visit type is unavailable.")
      status = created && !outcome.replayed ? :created : :ok
      render json: { visit_type: FacilitySerializer.visit_type(visit_type) }, status: status
    end
  end
end
