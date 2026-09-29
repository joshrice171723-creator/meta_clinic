module Clinic
  module Scheduling
    class SitePoliciesController < Clinic::ApiController
      def show
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
        require_capability_with_legacy("facilities.read", "appointments.read", site: site)
        render json: { policy: SitePolicy.snapshot(SitePolicy.current(practice: current_practice, site: site)),
          can_write: current_ability.allowed_permission?("facilities.write", site: site),
          can_overbook: current_ability.allowed_permission?("appointments.overbook", site: site),
          can_capacity_override: current_ability.allowed_permission?("appointments.capacity_override", site: site) }
      end

      def update
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
        input = parameter_hash!(:policy,
          %i[expected_revision recurrence_enabled overbook_enabled], arrays: %i[eligible_visit_type_ids])
        revision = Integer(input[:expected_revision].to_s, 10) rescue nil
        raise ArgumentError, "Choose the current scheduling policy revision." unless revision && revision >= 0

        policy = SitePolicy.save_revision!(practice: current_practice, site: site, actor: current_user,
          expected_revision: revision,
          recurrence_enabled: boolean_param(input[:recurrence_enabled], field: :recurrence_enabled),
          overbook_enabled: boolean_param(input[:overbook_enabled], field: :overbook_enabled),
          eligible_visit_type_ids: input[:eligible_visit_type_ids])
        render json: { policy: SitePolicy.snapshot(policy) }
      end
    end
  end
end
