module Clinic
  module Scheduling
    class OperationalPoliciesController < Clinic::ApiController
      def show
        site = policy_site
        require_capability_with_legacy("facilities.read", "appointments.read", site:)
        render json: { policy: OperationalPolicyVersion.snapshot(OperationalPolicyVersion.current(practice: current_practice, site:), site:),
          can_write: current_ability.allowed_permission?("facilities.write", site:) }
      end

      def history
        site = policy_site
        require_capability("facilities.read", site:)
        rows = OperationalPolicyVersion.where(practice: current_practice, site:).order(revision: :desc).limit(26).to_a
        render json: { site_id: site.id, versions: rows.first(25).map { |row| OperationalPolicyVersion.snapshot(row, site:) }, capped: rows.length > 25 }
      end

      def update
        site = policy_site
        input = parameter_hash!(:policy, %i[expected_revision request_key],
          nested_arrays: { block_categories: %i[key label], waiting_thresholds: %i[key label minutes] })
        raise ArgumentError, "Both clinic policy lists are required; empty lists explicitly mean unconfigured." unless input.key?(:block_categories) && input.key?(:waiting_thresholds)
        policy = ReviseOperationalPolicy.call(practice: current_practice, site:, actor: current_user,
          expected_revision: bounded_integer!(input[:expected_revision], field: :expected_revision, min: 0),
          request_key: input[:request_key], block_categories: input[:block_categories], waiting_thresholds: input[:waiting_thresholds])
        render json: { policy: OperationalPolicyVersion.snapshot(policy, site:) }
      end

      private

      def policy_site
        current_practice.sites.find(requested_id!(params[:site_id], :site_id))
      end
    end
  end
end
